use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use crate::embeddings::{cosine_similarity, from_blob, to_blob};
use crate::error::{AppError, Result};

const DEDUP_THRESHOLD: f32 = 0.92;
const OLLAMA_CHAT_URL: &str = "http://localhost:11434/api/chat";

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
    let mut stmt = conn.prepare(
        "SELECT role, content FROM messages WHERE chat_id = ?1 ORDER BY created_at ASC",
    )?;
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
        let blob: Option<Vec<u8>> = if emb.is_empty() { None } else { Some(to_blob(emb)) };
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

// ── Async LLM / embedding calls (no DB access — no lock) ─────────────────────

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<OllamaMsg>,
    stream: bool,
    format: &'a str,
}

#[derive(Serialize)]
struct OllamaMsg {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    message: OllamaRespMsg,
}

#[derive(Deserialize)]
struct OllamaRespMsg {
    content: String,
}

pub async fn call_extraction(model: &str, conversation: &str) -> Result<Vec<String>> {
    let prompt = format!(
        r#"Extract important facts about the user from this conversation for future reference.

Focus on: preferences, goals, skills, projects, background, constraints.
Be specific and concise. Skip generic statements.

Conversation:
{conversation}

Return a JSON object: {{"facts": ["fact1", "fact2", ...]}} (max 6 facts).
ONLY return the JSON."#
    );
    let client = reqwest::Client::new();
    let req = ChatRequest {
        model,
        messages: vec![OllamaMsg { role: "user".into(), content: prompt }],
        stream: false,
        format: "json",
    };
    let resp = client
        .post(OLLAMA_CHAT_URL)
        .json(&req)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("extraction request: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Other(format!("extraction API {}", resp.status())));
    }
    let body: ChatResponse = resp.json().await
        .map_err(|e| AppError::Other(format!("extraction parse: {e}")))?;
    parse_facts_json(&body.message.content)
}

pub async fn embed_texts(ollama_url: &str, model: &str, texts: &[String]) -> Vec<Vec<f32>> {
    use crate::embeddings::embed_batch;
    let refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    embed_batch(ollama_url, model, &refs)
        .await
        .unwrap_or_else(|_| vec![vec![]; texts.len()])
}

pub async fn embed_query(ollama_url: &str, model: &str, query: &str) -> Option<Vec<f32>> {
    use crate::embeddings::embed_batch;
    embed_batch(ollama_url, model, &[query]).await.ok().and_then(|mut v| v.pop())
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
        None => facts_with_emb.into_iter().take(top_k).map(|(f, _)| f).collect(),
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn parse_facts_json(raw: &str) -> Result<Vec<String>> {
    #[derive(Deserialize)]
    struct W { facts: Vec<String> }
    serde_json::from_str::<W>(raw)
        .map(|w| w.facts)
        .or_else(|_| serde_json::from_str::<Vec<String>>(raw))
        .map_err(|e| AppError::Other(format!("facts JSON: {e}")))
}

fn new_id() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h = DefaultHasher::new();
    ns.hash(&mut h);
    format!("mem-{:x}", h.finish())
}

fn epoch_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}
