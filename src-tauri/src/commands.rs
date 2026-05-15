use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;
use crate::error::AppError;
use crate::ingest;
use crate::memory;
use crate::retrieval;
use crate::search;
use crate::categorization;
use crate::export;
use crate::websearch;
use crate::memory::load_conversation;
use crate::db::DbPathState;

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub category_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pinned: bool,
    pub archived: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub model_used: String,
    pub created_at: String,
    pub token_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChatArgs {
    pub id: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveMessageArgs {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub model_used: String,
    pub created_at: String,
}

// ── Chat commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_chats(state: State<DbState>) -> Result<Vec<Chat>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, title, category_id, created_at, updated_at, pinned, archived
         FROM chats
         WHERE archived = 0
         ORDER BY pinned DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            category_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            pinned: row.get::<_, i32>(5)? != 0,
            archived: row.get::<_, i32>(6)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

#[tauri::command]
pub fn create_chat(state: State<DbState>, args: CreateChatArgs) -> Result<Chat, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "INSERT INTO chats (id, title, created_at, updated_at, pinned, archived)
         VALUES (?1, ?2, ?3, ?3, 0, 0)",
        params![args.id, args.title, args.created_at],
    )?;
    Ok(Chat {
        id: args.id,
        title: args.title,
        category_id: None,
        created_at: args.created_at.clone(),
        updated_at: args.created_at,
        pinned: false,
        archived: false,
    })
}

#[tauri::command]
pub fn update_chat_title(
    state: State<DbState>,
    chat_id: String,
    title: String,
    updated_at: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE chats SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, updated_at, chat_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn touch_chat(
    state: State<DbState>,
    chat_id: String,
    updated_at: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE chats SET updated_at = ?1 WHERE id = ?2",
        params![updated_at, chat_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn pin_chat(state: State<DbState>, chat_id: String, pinned: bool) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE chats SET pinned = ?1 WHERE id = ?2",
        params![pinned as i32, chat_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn archive_chat(state: State<DbState>, chat_id: String) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE chats SET archived = 1 WHERE id = ?1",
        params![chat_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_chat(state: State<DbState>, chat_id: String) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute("DELETE FROM chats WHERE id = ?1", params![chat_id])?;
    Ok(())
}

// ── Message commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_messages(state: State<DbState>, chat_id: String) -> Result<Vec<Message>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, chat_id, role, content, model_used, created_at, token_count
         FROM messages
         WHERE chat_id = ?1
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![chat_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            model_used: row.get(4)?,
            created_at: row.get(5)?,
            token_count: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

#[tauri::command]
pub fn save_message(state: State<DbState>, args: SaveMessageArgs) -> Result<Message, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "INSERT INTO messages (id, chat_id, role, content, model_used, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content",
        params![
            args.id,
            args.chat_id,
            args.role,
            args.content,
            args.model_used,
            args.created_at,
        ],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO fts_messages (message_id, chat_id, content)
         VALUES (?1, ?2, ?3)",
        params![args.id, args.chat_id, args.content],
    )?;
    // Bubble updated_at on the parent chat
    conn.execute(
        "UPDATE chats SET updated_at = ?1 WHERE id = ?2",
        params![args.created_at, args.chat_id],
    )?;
    Ok(Message {
        id: args.id,
        chat_id: args.chat_id,
        role: args.role,
        content: args.content,
        model_used: args.model_used,
        created_at: args.created_at,
        token_count: None,
    })
}

/// Overwrite the content of an existing message (used to persist the final
/// streamed text after generation completes).
#[tauri::command]
pub fn update_message_content(
    state: State<DbState>,
    message_id: String,
    content: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, message_id],
    )?;
    conn.execute(
        "UPDATE fts_messages SET content = ?1 WHERE message_id = ?2",
        params![content, message_id],
    )?;
    Ok(())
}

// ── Document commands ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub filename: String,
    pub filepath: String,
    pub page_count: Option<i64>,
    pub ocr_applied: bool,
    pub uploaded_at: String,
    pub category_id: Option<String>,
}

#[tauri::command]
pub fn list_documents(state: State<DbState>) -> Result<Vec<Document>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, filename, filepath, page_count, ocr_applied, uploaded_at, category_id
         FROM documents ORDER BY uploaded_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Document {
            id: row.get(0)?,
            filename: row.get(1)?,
            filepath: row.get(2)?,
            page_count: row.get(3)?,
            ocr_applied: row.get::<_, i32>(4)? != 0,
            uploaded_at: row.get(5)?,
            category_id: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

#[tauri::command]
pub async fn ingest_pdf(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    doc_id: String,
    filepath: String,
    filename: String,
) -> Result<ingest::IngestComplete, AppError> {
    // Read ocr_lang from settings (sync, brief lock)
    let ocr_lang = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'ocr_lang'",
            [],
            |row| row.get::<_, String>(0),
        ).unwrap_or_else(|_| "eng".to_string())
    };
    ingest::run(app, &state, doc_id, filepath, filename, ocr_lang).await
}

#[tauri::command]
pub fn check_tesseract() -> bool {
    crate::ocr::is_available()
}

#[tauri::command]
pub async fn retrieve_chunks(
    state: State<'_, DbState>,
    query: String,
) -> Result<Vec<retrieval::ChunkResult>, AppError> {
    // 1. BM25 search (sync — acquire and release lock)
    let bm25 = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        retrieval::bm25_search(&conn, &query)?
    };

    // 2. Embed query (async — lock must NOT be held)
    let (ollama_url, embedding_model) = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        let url = crate::db::get_setting(&conn, "ollama_url", "http://localhost:11434")?;
        let model = crate::db::get_setting(&conn, "embedding_model", "nomic-embed-text")?;
        (url, model)
    };
    let query_embedding = crate::embeddings::embed_batch(&ollama_url, &embedding_model, &[&query])
        .await
        .ok()
        .and_then(|mut v| v.pop());

    // 3. Vector search + RRF + resolve (sync)
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let vector = query_embedding
        .as_deref()
        .map(|emb| retrieval::vector_search(&conn, emb).unwrap_or_default())
        .unwrap_or_default();
    let fused = retrieval::rrf_fuse(&bm25, &vector, retrieval::FINAL_TOP);
    retrieval::resolve_chunks(&conn, &fused).map_err(AppError::from)
}

// ── Memory commands ───────────────────────────────────────────────────────────

/// Run memory extraction on a completed chat. Returns number of new facts stored.
/// Lock is released before every async call.
#[tauri::command]
pub async fn extract_memory(
    state: State<'_, DbState>,
    chat_id: String,
    model: String,
) -> Result<usize, AppError> {
    // 1. Load conversation (sync)
    let conversation = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        memory::load_conversation(&conn, &chat_id)?
    };
    if conversation.len() < 100 { return Ok(0); }

    // 2. Call LLM for fact extraction (async, no lock)
    let facts = memory::call_extraction(&model, &conversation).await?;
    if facts.is_empty() { return Ok(0); }

    // 3. Embed new facts (async, no lock)
    let (ollama_url, embedding_model) = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        let url = crate::db::get_setting(&conn, "ollama_url", "http://localhost:11434")?;
        let model = crate::db::get_setting(&conn, "embedding_model", "nomic-embed-text")?;
        (url, model)
    };
    let embeddings = memory::embed_texts(&ollama_url, &embedding_model, &facts).await;

    // 4. Load existing embeddings for dedup + store new facts (sync)
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let existing = memory::load_fact_embeddings(&conn)?;
    memory::store_facts(&conn, &chat_id, &facts, &embeddings, &existing)
}

/// Fetch top-K relevant facts for injection into a chat turn.
#[tauri::command]
pub async fn get_relevant_memory(
    state: State<'_, DbState>,
    query: String,
    limit: usize,
) -> Result<Vec<memory::MemoryFact>, AppError> {
    // 1. Load facts with embeddings (sync)
    let facts_with_emb = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        memory::load_active_facts_with_embeddings(&conn, limit * 3)?
    };

    // 2. Embed query (async, no lock)
    let (ollama_url, embedding_model) = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        let url = crate::db::get_setting(&conn, "ollama_url", "http://localhost:11434")?;
        let model = crate::db::get_setting(&conn, "embedding_model", "nomic-embed-text")?;
        (url, model)
    };
    let query_emb = memory::embed_query(&ollama_url, &embedding_model, &query).await;

    // 3. Rank (pure, no IO)
    Ok(memory::rank_facts_by_relevance(facts_with_emb, query_emb.as_deref(), limit))
}

/// List all memory facts (for Memory Manager).
#[tauri::command]
pub fn list_memory_facts(state: State<DbState>) -> Result<Vec<memory::MemoryFact>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    memory::load_all_facts(&conn)
}

#[derive(Deserialize)]
pub struct UpdateMemoryArgs {
    pub id: String,
    pub fact: Option<String>,
    pub user_pinned: Option<bool>,
    pub user_disabled: Option<bool>,
}

#[tauri::command]
pub fn update_memory_fact(
    state: State<DbState>,
    args: UpdateMemoryArgs,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    if let Some(fact) = &args.fact {
        conn.execute("UPDATE memory_facts SET fact = ?1 WHERE id = ?2", params![fact, args.id])?;
    }
    if let Some(pinned) = args.user_pinned {
        conn.execute("UPDATE memory_facts SET user_pinned = ?1 WHERE id = ?2", params![pinned as i32, args.id])?;
    }
    if let Some(disabled) = args.user_disabled {
        conn.execute("UPDATE memory_facts SET user_disabled = ?1 WHERE id = ?2", params![disabled as i32, args.id])?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_memory_fact(state: State<DbState>, id: String) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute("DELETE FROM memory_facts WHERE id = ?1", params![id])?;
    Ok(())
}

// ── Search commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn global_search(
    state: State<DbState>,
    query: String,
) -> Result<Vec<search::SearchResult>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    search::global_search(&conn, &query).map_err(AppError::from)
}

// ── Category commands ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub auto_generated: bool,
}

#[tauri::command]
pub fn list_categories(state: State<DbState>) -> Result<Vec<Category>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, color, icon, auto_generated FROM categories ORDER BY name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            icon: row.get(3)?,
            auto_generated: row.get::<_, i32>(4)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryArgs {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub auto_generated: bool,
}

#[tauri::command]
pub fn create_category(
    state: State<DbState>,
    args: CreateCategoryArgs,
) -> Result<Category, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "INSERT OR IGNORE INTO categories (id, name, color, auto_generated) VALUES (?1, ?2, ?3, ?4)",
        params![args.id, args.name, args.color, args.auto_generated as i32],
    )?;
    Ok(Category {
        id: args.id,
        name: args.name,
        color: args.color,
        icon: None,
        auto_generated: args.auto_generated,
    })
}

#[tauri::command]
pub fn delete_category(state: State<DbState>, id: String) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    // Unlink chats first so FK is not violated
    conn.execute("UPDATE chats SET category_id = NULL WHERE category_id = ?1", params![id])?;
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn assign_chat_category(
    state: State<DbState>,
    chat_id: String,
    category_id: Option<String>,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "UPDATE chats SET category_id = ?1 WHERE id = ?2",
        params![category_id, chat_id],
    )?;
    Ok(())
}

// ── Knowledge Graph commands ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub ref_id: String,
    pub label: String,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
    pub weight: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Load (and lazily populate) the full knowledge graph.
/// Creates nodes for any chats/categories that don't have one yet.
#[tauri::command]
pub fn get_graph(state: State<DbState>) -> Result<GraphData, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;

    // Ensure every chat has a graph node
    conn.execute_batch(
        "INSERT OR IGNORE INTO nodes (id, node_type, ref_id, label)
         SELECT 'node:chat:' || id, 'chat', id, title FROM chats WHERE archived = 0;"
    )?;

    // Ensure every category has a graph node
    conn.execute_batch(
        "INSERT OR IGNORE INTO nodes (id, node_type, ref_id, label)
         SELECT 'node:cat:' || id, 'category', id, name FROM categories;"
    )?;

    // Create edges: category → chat
    conn.execute_batch(
        "INSERT OR IGNORE INTO edges (id, source_node_id, target_node_id, edge_type, weight, created_at)
         SELECT 'edge:cat-chat:' || c.id,
                'node:cat:' || c.category_id,
                'node:chat:' || c.id,
                'categorized_as', 1.0, '0'
         FROM chats c
         WHERE c.category_id IS NOT NULL AND c.archived = 0;"
    )?;

    // Load nodes
    let mut nstmt = conn.prepare(
        "SELECT id, node_type, ref_id, label, metadata_json FROM nodes ORDER BY node_type",
    )?;
    let nodes = nstmt.query_map([], |row| {
        Ok(GraphNode {
            id: row.get(0)?,
            node_type: row.get(1)?,
            ref_id: row.get(2)?,
            label: row.get(3)?,
            metadata_json: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>().map_err(AppError::from)?;

    // Load edges (only between existing nodes to avoid FK issues)
    let mut estmt = conn.prepare(
        "SELECT id, source_node_id, target_node_id, edge_type, weight FROM edges",
    )?;
    let edges = estmt.query_map([], |row| {
        Ok(GraphEdge {
            id: row.get(0)?,
            source: row.get(1)?,
            target: row.get(2)?,
            edge_type: row.get(3)?,
            weight: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>().map_err(AppError::from)?;

    Ok(GraphData { nodes, edges })
}

/// Suggest a category label for an existing chat by running the conversation
/// through the LLM. Returns None if the chat has too few messages or Ollama
/// returns nothing useful.
#[tauri::command]
pub async fn suggest_chat_category(
    state: State<'_, DbState>,
    chat_id: String,
    model: String,
) -> Result<Option<String>, AppError> {
    // Load conversation (sync, brief lock)
    let conversation = {
        let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
        load_conversation(&conn, &chat_id)?
    };
    if conversation.len() < 80 {
        return Ok(None);
    }
    // Call LLM (async, no lock)
    categorization::suggest_category(&model, &conversation).await
}

// ── Export / Backup commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn export_chat_markdown(
    state: State<DbState>,
    chat_id: String,
) -> Result<String, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    export::to_markdown(&conn, &chat_id).map_err(AppError::from)
}

#[tauri::command]
pub fn export_chat_json(
    state: State<DbState>,
    chat_id: String,
) -> Result<String, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    export::to_json(&conn, &chat_id).map_err(AppError::from)
}

/// Copy the SQLite database file to `dest_path` after checkpointing the WAL.
/// The dest_path must be an absolute path chosen via the frontend save dialog.
#[tauri::command]
pub fn backup_database(
    state: State<DbState>,
    db_path_state: State<DbPathState>,
    dest_path: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    // Checkpoint WAL so the main file is up-to-date
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    let src = &db_path_state.0;
    std::fs::copy(src, &dest_path)
        .map_err(|e| AppError::Other(format!("backup copy failed: {e}")))?;
    Ok(())
}

// ── Settings commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_settings(
    state: State<DbState>,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut map = std::collections::HashMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        map.insert(row.get::<_, String>(0)?, row.get::<_, String>(1)?);
    }
    Ok(map)
}

#[tauri::command]
pub fn set_setting(
    state: State<DbState>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

// ── Web search commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn web_search(
    base_url: String,
    query: String,
) -> Result<Vec<websearch::WebResult>, AppError> {
    websearch::search(&base_url, &query).await
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModelDetails {
    pub family: Option<String>,
}

#[tauri::command]
pub async fn get_models(ollama_url: String) -> Result<Vec<OllamaModel>, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let res = client
        .get(format!("{}/api/tags", ollama_url))
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let data: serde_json::Value = res.json().await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let models = data["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| serde_json::from_value(m.clone()).ok())
        .collect();
    Ok(models)
}
/* pub use crate::voice::{AudioChunk, TranscriptPayload}; */

/* #[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::voice::VoiceState>,
) -> Result<(), AppError> {
    state.start_recording(app).await?;
    Ok(())
}
*/

/* #[tauri::command]
pub async fn stop_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::voice::VoiceState>,
) -> Result<(), AppError> {
    state.stop_recording(app).await?;
    Ok(())
}
*/