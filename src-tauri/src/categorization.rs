use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

const OLLAMA_CHAT_URL: &str = "http://localhost:11434/api/chat";

/// Ask the LLM to suggest a short category name for the conversation.
/// Returns None if the model returns something unparseable or empty.
pub async fn suggest_category(model: &str, conversation: &str) -> Result<Option<String>> {
    let prompt = format!(
        r#"Read this conversation and suggest ONE short category label (2–4 words maximum).
Examples: "Machine Learning", "Rust Programming", "Tax Planning", "Recipe Ideas".

Conversation:
{conversation}

Return ONLY a JSON object: {{"category": "Your Label Here"}}
If you cannot determine a category, return {{"category": ""}}."#
    );

    #[derive(Serialize)]
    struct Req<'a> {
        model: &'a str,
        messages: Vec<Msg>,
        stream: bool,
        format: &'a str,
    }
    #[derive(Serialize)]
    struct Msg { role: String, content: String }
    #[derive(Deserialize)]
    struct Resp { message: RespMsg }
    #[derive(Deserialize)]
    struct RespMsg { content: String }
    #[derive(Deserialize)]
    struct Body { category: String }

    let client = reqwest::Client::new();
    let resp = client
        .post(OLLAMA_CHAT_URL)
        .json(&Req {
            model,
            messages: vec![Msg { role: "user".into(), content: prompt }],
            stream: false,
            format: "json",
        })
        .send()
        .await
        .map_err(|e| AppError::Other(format!("category request: {e}")))?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let body: Resp = resp.json().await
        .map_err(|e| AppError::Other(format!("category parse: {e}")))?;

    let name = serde_json::from_str::<Body>(&body.message.content)
        .map(|b| b.category.trim().to_string())
        .unwrap_or_default();

    Ok(if name.is_empty() { None } else { Some(name) })
}
