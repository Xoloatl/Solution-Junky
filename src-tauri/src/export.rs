use crate::error::Result;
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Serialize)]
pub struct ExportMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub model_used: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ExportChat {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<ExportMessage>,
}

fn load_export(conn: &Connection, chat_id: &str) -> Result<ExportChat> {
    let (id, title, created_at, updated_at) = conn.query_row(
        "SELECT id, title, created_at, updated_at FROM chats WHERE id = ?1",
        params![chat_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, role, content, model_used, created_at
         FROM messages WHERE chat_id = ?1 ORDER BY created_at ASC",
    )?;
    let messages = stmt
        .query_map(params![chat_id], |row| {
            Ok(ExportMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                model_used: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(ExportChat {
        id,
        title,
        created_at,
        updated_at,
        messages,
    })
}

pub fn to_markdown(conn: &Connection, chat_id: &str) -> Result<String> {
    let chat = load_export(conn, chat_id)?;
    let mut out = format!("# {}\n\n", chat.title);
    out.push_str(&format!("*Exported from Solution Junky*\n\n---\n\n"));
    for msg in &chat.messages {
        let label = match msg.role.as_str() {
            "user" => "**You**",
            "assistant" => "**Assistant**",
            _ => "**System**",
        };
        out.push_str(&format!("{label}\n\n{}\n\n---\n\n", msg.content));
    }
    Ok(out)
}

pub fn to_json(conn: &Connection, chat_id: &str) -> Result<String> {
    let chat = load_export(conn, chat_id)?;
    serde_json::to_string_pretty(&chat)
        .map_err(|e| crate::error::AppError::Other(format!("json: {e}")))
}
