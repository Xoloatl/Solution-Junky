use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use crate::embeddings::{cosine_similarity, from_blob};
use crate::error::Result;

const BM25_TOP: usize = 20;
const VEC_TOP: usize = 20;
const RRF_K: f32 = 60.0;
pub const FINAL_TOP: usize = 8;

#[derive(Debug, Serialize, Clone)]
pub struct ChunkResult {
    pub chunk_id: String,
    pub document_id: String,
    pub filename: String,
    pub page_number: u32,
    pub content: String,
    pub rrf_score: f32,
    pub citation_index: usize,
}

/// Sync BM25 search via FTS5. Returns (chunk_id, rank).
pub fn bm25_search(conn: &Connection, query: &str) -> Result<Vec<(String, usize)>> {
    let safe = sanitize_fts_query(query);
    if safe.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT chunk_id FROM fts_chunks WHERE fts_chunks MATCH ?1 ORDER BY bm25(fts_chunks) LIMIT ?2",
    )?;
    let mut rows = stmt.query(params![safe, BM25_TOP as i64])?;
    let mut result = Vec::new();
    let mut rank = 0;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        result.push((id, rank));
        rank += 1;
    }
    Ok(result)
}

/// Sync vector search. Loads all embeddings from DB and computes cosine similarity in memory.
pub fn vector_search(conn: &Connection, query_emb: &[f32]) -> Result<Vec<(String, usize)>> {
    let mut stmt = conn.prepare("SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL")?;
    let mut rows = stmt.query([])?;
    let mut scored: Vec<(String, f32)> = Vec::new();
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let emb = from_blob(&blob);
        let score = cosine_similarity(query_emb, &emb);
        scored.push((id, score));
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(VEC_TOP);
    Ok(scored
        .into_iter()
        .enumerate()
        .map(|(i, (id, _))| (id, i))
        .collect())
}

/// Reciprocal Rank Fusion over two ranked lists.
pub fn rrf_fuse(
    bm25: &[(String, usize)],
    vector: &[(String, usize)],
    top_k: usize,
) -> Vec<(String, f32)> {
    let mut scores: HashMap<String, f32> = HashMap::new();
    for (id, rank) in bm25 {
        *scores.entry(id.clone()).or_default() += 1.0 / (RRF_K + *rank as f32 + 1.0);
    }
    for (id, rank) in vector {
        *scores.entry(id.clone()).or_default() += 1.0 / (RRF_K + *rank as f32 + 1.0);
    }
    let mut ranked: Vec<(String, f32)> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.truncate(top_k);
    ranked
}

/// Resolve chunk IDs to full metadata rows.
pub fn resolve_chunks(conn: &Connection, fused: &[(String, f32)]) -> Result<Vec<ChunkResult>> {
    let mut results = Vec::with_capacity(fused.len());
    for (i, (cid, score)) in fused.iter().enumerate() {
        let row = conn.query_row(
            "SELECT c.id, c.document_id, d.filename, c.page_number, c.content
             FROM chunks c JOIN documents d ON d.id = c.document_id
             WHERE c.id = ?1",
            params![cid],
            |row| {
                Ok(ChunkResult {
                    chunk_id: row.get(0)?,
                    document_id: row.get(1)?,
                    filename: row.get(2)?,
                    page_number: row.get::<_, u32>(3).unwrap_or(0),
                    content: row.get(4)?,
                    rrf_score: 0.0,
                    citation_index: i + 1,
                })
            },
        );
        if let Ok(mut r) = row {
            r.rrf_score = *score;
            results.push(r);
        }
    }
    Ok(results)
}

fn sanitize_fts_query(query: &str) -> String {
    let clean: String = query
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { ' ' })
        .collect();
    clean
        .split_whitespace()
        .filter(|s| s.len() > 1)
        .collect::<Vec<_>>()
        .join(" ")
}
