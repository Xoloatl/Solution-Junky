use rusqlite::{params, Connection};
use serde::Serialize;
use crate::error::Result;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub kind: String,       // "message" | "chunk"
    pub id: String,
    pub chat_id: Option<String>,
    pub chat_title: Option<String>,
    pub document_id: Option<String>,
    pub filename: Option<String>,
    pub page_number: Option<i64>,
    pub snippet: String,
    pub score: f32,
}

const MAX_RESULTS: usize = 20;

pub fn global_search(conn: &Connection, raw_query: &str) -> Result<Vec<SearchResult>> {
    let query = sanitize_fts_query(raw_query);
    if query.is_empty() {
        return Ok(vec![]);
    }

    let mut results: Vec<SearchResult> = Vec::new();

    // ── FTS5 over messages ─────────────────────────────────────────────────────
    {
        let mut stmt = conn.prepare(
            "SELECT fm.message_id, fm.chat_id, c.title,
                    snippet(fts_messages, 2, '<b>', '</b>', '…', 16),
                    bm25(fts_messages)
             FROM fts_messages fm
             JOIN chats c ON c.id = fm.chat_id
             WHERE fts_messages MATCH ?1
             ORDER BY bm25(fts_messages)
             LIMIT 15",
        )?;
        let mut rows = stmt.query(params![query])?;
        while let Some(row) = rows.next()? {
            let raw_score: f64 = row.get(4)?;
            results.push(SearchResult {
                kind: "message".into(),
                id: row.get(0)?,
                chat_id: row.get(1)?,
                chat_title: row.get(2)?,
                document_id: None,
                filename: None,
                page_number: None,
                snippet: row.get(3)?,
                score: (-raw_score) as f32, // bm25 returns negative — negate for rank-high-is-good
            });
        }
    }

    // ── FTS5 over chunks ───────────────────────────────────────────────────────
    {
        let mut stmt = conn.prepare(
            "SELECT fc.chunk_id, d.id, d.filename, ch.page_number,
                    snippet(fts_chunks, 1, '<b>', '</b>', '…', 16),
                    bm25(fts_chunks)
             FROM fts_chunks fc
             JOIN chunks ch ON ch.id = fc.chunk_id
             JOIN documents d ON d.id = ch.document_id
             WHERE fts_chunks MATCH ?1
             ORDER BY bm25(fts_chunks)
             LIMIT 15",
        )?;
        let mut rows = stmt.query(params![query])?;
        while let Some(row) = rows.next()? {
            let raw_score: f64 = row.get(5)?;
            results.push(SearchResult {
                kind: "chunk".into(),
                id: row.get(0)?,
                chat_id: None,
                chat_title: None,
                document_id: row.get(1)?,
                filename: row.get(2)?,
                page_number: row.get(3)?,
                snippet: row.get(4)?,
                score: (-raw_score) as f32,
            });
        }
    }

    // Sort combined results by score descending, cap at MAX_RESULTS
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(MAX_RESULTS);
    Ok(results)
}

fn sanitize_fts_query(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
