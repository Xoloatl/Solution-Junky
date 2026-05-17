use crate::ai::client::OllamaClient;
use crate::ai::types::{ChatCompletionResponse, ChatMessage, OllamaModel};
use crate::error::Result;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<&'a str>,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMessage,
}

#[derive(Deserialize)]
struct OllamaChatMessage {
    content: String,
}

#[derive(Serialize)]
struct OllamaEmbedRequest<'a> {
    model: &'a str,
    input: Vec<&'a str>,
}

#[derive(Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Deserialize)]
struct CategoryBody {
    category: String,
}

#[derive(Deserialize)]
struct FactsBody {
    facts: Vec<String>,
}

pub async fn chat_completion(
    client: &OllamaClient,
    model: &str,
    messages: &[ChatMessage],
) -> Result<ChatCompletionResponse> {
    let response: OllamaChatResponse = client
        .post_json(
            "api/chat",
            &OllamaChatRequest {
                model,
                messages,
                stream: false,
                format: None,
            },
        )
        .await?;

    Ok(ChatCompletionResponse {
        content: response.message.content,
        model_used: model.to_string(),
        tokens: None,
    })
}

pub async fn list_models(client: &OllamaClient) -> Result<Vec<OllamaModel>> {
    let response: OllamaTagsResponse = client.get_json("api/tags").await?;
    Ok(response.models)
}

pub async fn embed_batch(
    client: &OllamaClient,
    model: &str,
    texts: &[&str],
) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(vec![]);
    }

    let response: OllamaEmbedResponse = client
        .post_json(
            "api/embed",
            &OllamaEmbedRequest {
                model,
                input: texts.to_vec(),
            },
        )
        .await?;

    Ok(response.embeddings)
}

pub async fn extract_facts(
    client: &OllamaClient,
    model: &str,
    conversation: &str,
) -> Result<Vec<String>> {
    let prompt = format!(
        r#"Extract important facts about the user from this conversation for future reference.

Focus on: preferences, goals, skills, projects, background, constraints.
Be specific and concise. Skip generic statements.

Conversation:
{conversation}

Return a JSON object: {{"facts": ["fact1", "fact2", ...]}} (max 6 facts).
ONLY return the JSON."#
    );

    let response: OllamaChatResponse = client
        .post_json(
            "api/chat",
            &OllamaChatRequest {
                model,
                messages: &[ChatMessage {
                    role: "user".to_string(),
                    content: prompt,
                }],
                stream: false,
                format: Some("json"),
            },
        )
        .await?;

    parse_facts_json(&response.message.content)
}

pub async fn suggest_category(
    client: &OllamaClient,
    model: &str,
    conversation: &str,
) -> Result<Option<String>> {
    let prompt = format!(
        r#"Read this conversation and suggest ONE short category label (2–4 words maximum).
Examples: "Machine Learning", "Rust Programming", "Tax Planning", "Recipe Ideas".

Conversation:
{conversation}

Return ONLY a JSON object: {{"category": "Your Label Here"}}
If you cannot determine a category, return {{"category": ""}}."#
    );

    let response: OllamaChatResponse = client
        .post_json(
            "api/chat",
            &OllamaChatRequest {
                model,
                messages: &[ChatMessage {
                    role: "user".to_string(),
                    content: prompt,
                }],
                stream: false,
                format: Some("json"),
            },
        )
        .await?;

    let body = serde_json::from_str::<CategoryBody>(&response.message.content)
        .map(|b| b.category.trim().to_string())
        .unwrap_or_default();

    Ok(if body.is_empty() { None } else { Some(body) })
}

fn parse_facts_json(raw: &str) -> Result<Vec<String>> {
    serde_json::from_str::<FactsBody>(raw)
        .map(|body| body.facts)
        .or_else(|_| serde_json::from_str::<Vec<String>>(raw))
        .map_err(|e| crate::error::AppError::Other(format!("facts JSON: {e}")))
}
