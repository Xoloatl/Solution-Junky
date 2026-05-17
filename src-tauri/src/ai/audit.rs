use crate::ai::types::AiAuditEntry;
use crate::error::Result;
use rusqlite::{params, Connection};

pub fn log_ai_audit(conn: &Connection, entry: &AiAuditEntry) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO ai_audit (
            id,
            task,
            model,
            status,
            started_at,
            finished_at,
            duration_ms,
            details_json,
            error_message,
            tokens_in,
            tokens_out
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            entry.id,
            entry.task,
            entry.model,
            entry.status,
            entry.started_at,
            entry.finished_at,
            entry.duration_ms,
            entry.details_json,
            entry.error_message,
            entry.tokens_in,
            entry.tokens_out,
        ],
    )?;
    Ok(())
}
