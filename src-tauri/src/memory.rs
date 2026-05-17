use crate::embeddings::{cosine_similarity, from_blob, to_blob};
use crate::error::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

const DEDUP_THRESHOLD: f32 = 0.92;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryFact {
    pub id: String,
    pub fact: String,
    pub source_chat_id: Option<String>,
    pub confidence: f64,
    pub category_tags: Option<String>,
    pub created_at: String,
    pub last_referenced_at: Option<String>,
    pub user_pinned: bool,
    pub user_disabled: bool,
}

// ── Sync DB reads (no await — safe to call while holding lock) ────────────────

/// Load all messages for a chat as a formatted string.
pub fn load_conversation(conn: &Connection, chat_id: &str) -> Result<String> {
    let mut stmt = conn
        .prepare("SELECT role, content FROM messages WHERE chat_id = ?1 ORDER BY created_at ASC")?;
    let mut rows = stmt.query(params![chat_id])?;
    let mut text = String::new();
    while let Some(row) = rows.next()? {
        let role: String = row.get(0)?;
        let content: String = row.get(1)?;
        let label = if role == "user" { "User" } else { "Assistant" };
        text.push_str(&format!("{label}: {content}\n\n"));
    }
    Ok(text)
}

/// Load (fact_text, embedding_blob) for all non-disabled facts — for dedup.
pub fn load_fact_embeddings(conn: &Connection) -> Result<Vec<Vec<f32>>> {
    let mut stmt =
        conn.prepare("SELECT embedding FROM memory_facts WHERE embedding IS NOT NULL")?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let blob: Vec<u8> = row.get(0)?;
        out.push(from_blob(&blob));
    }
    Ok(out)
}

/// Load all active (non-disabled) facts with their embeddings for relevance ranking.
pub fn load_active_facts_with_embeddings(
    conn: &Connection,
    limit: usize,
) -> Result<Vec<(MemoryFact, Option<Vec<u8>>)>> {
    let mut stmt = conn.prepare(
        "SELECT id, fact, source_chat_id, confidence, category_tags,
                created_at, last_referenced_at, user_pinned, user_disabled, embedding
         FROM memory_facts
         WHERE user_disabled = 0
         ORDER BY user_pinned DESC, created_at DESC
         LIMIT ?1",
    )?;
    let mut rows = stmt.query(params![limit as i64])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let fact = MemoryFact {
            id: row.get(0)?,
            fact: row.get(1)?,
            source_chat_id: row.get(2)?,
            confidence: row.get(3)?,
            category_tags: row.get(4)?,
            created_at: row.get(5)?,
            last_referenced_at: row.get(6)?,
            user_pinned: row.get::<_, i32>(7)? != 0,
            user_disabled: row.get::<_, i32>(8)? != 0,
        };
        let emb: Option<Vec<u8>> = row.get(9)?;
        out.push((fact, emb));
    }
    Ok(out)
}

pub fn load_all_facts(conn: &Connection) -> Result<Vec<MemoryFact>> {
    let mut stmt = conn.prepare(
        "SELECT id, fact, source_chat_id, confidence, category_tags,
                created_at, last_referenced_at, user_pinned, user_disabled
         FROM memory_facts
         ORDER BY user_pinned DESC, created_at DESC",
    )?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        out.push(MemoryFact {
            id: row.get(0)?,
            fact: row.get(1)?,
            source_chat_id: row.get(2)?,
            confidence: row.get(3)?,
            category_tags: row.get(4)?,
            created_at: row.get(5)?,
            last_referenced_at: row.get(6)?,
            user_pinned: row.get::<_, i32>(7)? != 0,
            user_disabled: row.get::<_, i32>(8)? != 0,
        });
    }
    Ok(out)
}

/// Persist a set of new (fact, embedding) pairs, deduplicating against existing embeddings.
pub fn store_facts(
    conn: &Connection,
    chat_id: &str,
    facts: &[String],
    embeddings: &[Vec<f32>],
    existing_embeddings: &[Vec<f32>],
) -> Result<usize> {
    let now = epoch_now();
    let mut stored = 0;
    for (fact_text, emb) in facts.iter().zip(embeddings.iter()) {
        let fact_text = fact_text.trim();
        if fact_text.is_empty() {
            continue;
        }
        // Dedup check
        if !emb.is_empty() {
            let is_dup = existing_embeddings
                .iter()
                .any(|e| cosine_similarity(emb, e) >= DEDUP_THRESHOLD);
            if is_dup {
                continue;
            }
        }
        let id = new_id();
        let blob: Option<Vec<u8>> = if emb.is_empty() {
            None
        } else {
            Some(to_blob(emb))
        };
        conn.execute(
            "INSERT INTO memory_facts
             (id, fact, source_chat_id, confidence, created_at, embedding)
             VALUES (?1, ?2, ?3, 1.0, ?4, ?5)",
            params![id, fact_text, chat_id, now, blob],
        )?;
        stored += 1;
    }
    Ok(stored)
}

// ── Ranking (pure, no IO) ─────────────────────────────────────────────────────

pub fn rank_facts_by_relevance(
    facts_with_emb: Vec<(MemoryFact, Option<Vec<u8>>)>,
    query_emb: Option<&[f32]>,
    top_k: usize,
) -> Vec<MemoryFact> {
    match query_emb {
        Some(qemb) => {
            let mut scored: Vec<(MemoryFact, f32)> = facts_with_emb
                .into_iter()
                .map(|(fact, blob)| {
                    let score = blob
                        .as_deref()
                        .map(|b| cosine_similarity(qemb, &from_blob(b)))
                        .unwrap_or(0.0);
                    (fact, score)
                })
                .collect();
            scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            scored.into_iter().take(top_k).map(|(f, _)| f).collect()
        }
        None => facts_with_emb
            .into_iter()
            .take(top_k)
            .map(|(f, _)| f)
            .collect(),
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn new_id() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut h = DefaultHasher::new();
    ns.hash(&mut h);
    format!("mem-{:x}", h.finish())
}

fn epoch_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}
