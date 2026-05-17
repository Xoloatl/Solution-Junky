use crate::error::Result;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;

pub struct DbState(pub std::sync::Mutex<Connection>);

/// Holds the on-disk path of the database file so backup can copy it.
pub struct DbPathState(pub std::path::PathBuf);

pub fn open(app_dir: &Path) -> Result<(Connection, std::path::PathBuf)> {
    let db_path = app_dir.join("solution_junky.db");
    let conn = Connection::open(&db_path)?;
    conn.execute_batch(PRAGMAS)?;
    conn.execute_batch(SCHEMA)?;
    migrate_database(&conn)?;
    Ok((conn, db_path))
}

fn migrate_database(conn: &Connection) -> Result<()> {
    let columns = get_table_columns(conn, "documents")?;

    if !columns.contains("source_type") {
        conn.execute(
            "ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'",
            [],
        )?;
    }

    if !columns.contains("metadata_json") {
        conn.execute("ALTER TABLE documents ADD COLUMN metadata_json TEXT", [])?;
    }

    Ok(())
}

fn get_table_columns(conn: &Connection, table: &str) -> Result<HashSet<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut rows = stmt.query([])?;
    let mut result = HashSet::new();
    while let Some(row) = rows.next()? {
        let col_name: String = row.get(1)?;
        result.insert(col_name);
    }
    Ok(result)
}

pub fn get_setting(conn: &Connection, key: &str, default: &str) -> Result<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .or_else(|_| Ok(default.to_string()))
}

const PRAGMAS: &str = "
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA synchronous=NORMAL;
";

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS categories (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    parent_id      TEXT REFERENCES categories(id),
    color          TEXT,
    icon           TEXT,
    auto_generated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chats (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    category_id TEXT REFERENCES categories(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content     TEXT NOT NULL,
    model_used  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    token_count INTEGER
);

CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    filename     TEXT NOT NULL,
    filepath     TEXT NOT NULL,
    mime_type    TEXT NOT NULL DEFAULT 'application/pdf',
    source_type  TEXT NOT NULL DEFAULT 'pdf',
    metadata_json TEXT,
    page_count   INTEGER,
    ocr_applied  INTEGER NOT NULL DEFAULT 0,
    uploaded_at  TEXT NOT NULL,
    category_id  TEXT REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER,
    char_start  INTEGER,
    char_end    INTEGER,
    content     TEXT NOT NULL,
    embedding   BLOB
);

CREATE TABLE IF NOT EXISTS concepts (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,
    extracted_from_type TEXT NOT NULL CHECK(extracted_from_type IN ('chat','document')),
    extracted_from_id   TEXT NOT NULL,
    confidence          REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS nodes (
    id            TEXT PRIMARY KEY,
    node_type     TEXT NOT NULL CHECK(node_type IN ('chat','document','concept','category')),
    ref_id        TEXT NOT NULL,
    label         TEXT NOT NULL,
    metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    id             TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type      TEXT NOT NULL,
    weight         REAL NOT NULL DEFAULT 1.0,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_facts (
    id                 TEXT PRIMARY KEY,
    fact               TEXT NOT NULL,
    source_chat_id     TEXT REFERENCES chats(id),
    source_message_id  TEXT REFERENCES messages(id),
    confidence         REAL NOT NULL DEFAULT 1.0,
    category_tags      TEXT,
    created_at         TEXT NOT NULL,
    last_referenced_at TEXT,
    user_pinned        INTEGER NOT NULL DEFAULT 0,
    user_disabled      INTEGER NOT NULL DEFAULT 0,
    embedding          BLOB
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
    content,
    source_type UNINDEXED,
    source_id   UNINDEXED,
    content='',
    tokenize='porter unicode61'
);

-- FTS5 for full-text / BM25 search over chunks
CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
    chunk_id  UNINDEXED,
    content,
    tokenize='porter unicode61'
);

-- FTS5 for full-text search over messages
CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
    message_id UNINDEXED,
    chat_id    UNINDEXED,
    content,
    tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_audit (
    id            TEXT PRIMARY KEY,
    task          TEXT NOT NULL,
    model         TEXT NOT NULL,
    status        TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    finished_at   TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL,
    details_json  TEXT,
    error_message TEXT,
    tokens_in     INTEGER,
    tokens_out    INTEGER
);

-- Seed defaults (INSERT OR IGNORE so existing values are never overwritten)
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('ollama_url',            'http://localhost:11434'),
    ('embedding_model',       'nomic-embed-text'),
    ('chat_model',            'qwen2.5:7b'),
    ('code_completion_model', 'qwen2.5:7b'),
    ('code_generation_model', 'qwen2.5:7b'),
    ('memory_auto_extract',   'true'),
    ('memory_min_length',     '100'),
    ('category_auto_suggest', 'true'),
    ('voice_stt_lang',        'en-US'),
    ('voice_tts_rate',        '1.0'),
    ('ocr_lang',              'eng'),
    ('searxng_url',           'http://localhost:8888'),
    ('web_search_enabled',    'false');

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_memory_facts_disabled ON memory_facts(user_disabled);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
";
