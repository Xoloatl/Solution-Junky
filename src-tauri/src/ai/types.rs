use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AiTask {
    ChatCompletion,
    ModelListing,
    Categorization,
    MemoryExtraction,
    Retrieval,
    CodeCompletion,
    CodeGeneration,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiTokens {
    pub prompt: Option<u64>,
    pub completion: Option<u64>,
    pub total: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatCompletionResponse {
    pub content: String,
    pub model_used: String,
    pub tokens: Option<AiTokens>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModelDetails {
    pub family: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiAuditEntry {
    pub id: String,
    pub task: String,
    pub model: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: String,
    pub duration_ms: i64,
    pub details_json: Option<String>,
    pub error_message: Option<String>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
}
