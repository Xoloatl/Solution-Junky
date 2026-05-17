use crate::ai::types::{AiAuditEntry, ChatCompletionResponse, ChatMessage, OllamaModel};
use crate::ai::{audit, client::OllamaClient, tasks};
use crate::db::{get_setting, DbState};
use crate::retrieval;
use crate::error::Result;
use chrono::Utc;
use rusqlite::Connection;
use serde_json::Value;

pub struct AiRouter {
    ollama_url: String,
    chat_model: String,
    embedding_model: String,
}

impl AiRouter {
    pub fn from_connection(conn: &Connection) -> Result<Self> {
        Ok(Self {
            ollama_url: get_setting(conn, "ollama_url", "http://localhost:11434")?,
            chat_model: get_setting(conn, "chat_model", "qwen2.5:7b")?,
            embedding_model: get_setting(conn, "embedding_model", "nomic-embed-text")?,
        })
    }

    pub async fn chat_completion(
        &self,
        state: &DbState,
        messages: &[ChatMessage],
    ) -> Result<ChatCompletionResponse> {
        let start = Utc::now();

        // Attempt to detect attachments in the most recent user message and
        // build an "ATTACHED CONTEXT" system prompt that injects relevant
        // chunks from the referenced documents. This uses existing retrieval
        // functions and does NOT re-run ingestion / OCR / embedding.
        let mut augmented: Vec<ChatMessage> = messages.to_vec();

        if let Some((idx, last_user)) = messages.iter().enumerate().rev().find(|(_, m)| m.role == "user") {
            if let Ok(json) = serde_json::from_str::<Value>(&last_user.content) {
                if json.get("attachments").is_some() {
                    // Extract text field if present; fallback to raw content
                    let user_text = json.get("text").and_then(|v| v.as_str()).unwrap_or(&last_user.content).to_string();

                    let mut attached_context = String::new();
                    attached_context.push_str("ATTACHED CONTEXT:\n");

                    if let Some(arr) = json.get("attachments").and_then(|v| v.as_array()) {
                        for item in arr.iter() {
                            if let Some(doc_id) = item.get("docId").and_then(|v| v.as_str()) {
                                let filename = item.get("filename").and_then(|v| v.as_str()).unwrap_or("(unknown)");

                                // 1) BM25 search (sync)
                                let bm25 = {
                                    let conn = state.0.lock().map_err(|_| crate::error::AppError::Other("db lock poisoned".into()))?;
                                    retrieval::bm25_search(&conn, &user_text)?
                                };

                                // 2) Embed query (async, do not hold lock)
                                let query_embedding = self.embed_query(&user_text).await?;

                                // 3) Vector search + RRF + resolve (sync)
                                let resolved = {
                                    let conn = state.0.lock().map_err(|_| crate::error::AppError::Other("db lock poisoned".into()))?;
                                    let vector = query_embedding
                                        .as_deref()
                                        .map(|emb| retrieval::vector_search(&conn, emb).unwrap_or_default())
                                        .unwrap_or_default();
                                    let fused = retrieval::rrf_fuse(&bm25, &vector, retrieval::FINAL_TOP);
                                    retrieval::resolve_chunks(&conn, &fused)?
                                };

                                // Filter to this document and limit size
                                let mut doc_chunks: Vec<_> = resolved.into_iter().filter(|c| c.document_id == doc_id).collect();
                                if !doc_chunks.is_empty() {
                                    attached_context.push_str(&format!("[File: {}]\n", filename));
                                    // include top N chunk contents
                                    doc_chunks.truncate(retrieval::FINAL_TOP);
                                    for ch in doc_chunks.iter() {
                                        attached_context.push_str(&ch.content);
                                        attached_context.push_str("\n\n---\n\n");
                                    }
                                }
                            }
                        }
                    }

                    if attached_context.len() > "ATTACHED CONTEXT:\n".len() {
                        // Insert as a system message before the user message
                        let sys = ChatMessage { role: "system".to_string(), content: attached_context };
                        // place before the found user message index
                        augmented.insert(idx, sys);
                    }
                }
            }
        }

        let result = self.execute_chat_completion(&augmented).await;
        let finished = Utc::now();

        let details_json = result
            .as_ref()
            .ok()
            .and_then(|r| serde_json::to_string(r).ok());
        let error_message = result.as_ref().err().map(|e| e.to_string());

        let audit_entry = AiAuditEntry {
            id: format!(
                "ai-audit-{}",
                start
                    .timestamp_nanos_opt()
                    .unwrap_or(start.timestamp() * 1_000_000)
            ),
            task: "chat_completion".to_string(),
            model: self.chat_model.clone(),
            status: if result.is_ok() {
                "success".to_string()
            } else {
                "failure".to_string()
            },
            started_at: start.to_rfc3339(),
            finished_at: finished.to_rfc3339(),
            duration_ms: (finished - start).num_milliseconds(),
            details_json,
            error_message,
            tokens_in: None,
            tokens_out: None,
        };

        if let Ok(conn) = state.0.lock() {
            let _ = audit::log_ai_audit(&conn, &audit_entry);
        }

        result
    }

    async fn execute_chat_completion(
        &self,
        messages: &[ChatMessage],
    ) -> Result<ChatCompletionResponse> {
        let client = OllamaClient::new(&self.ollama_url)?;
        tasks::chat_completion(&client, &self.chat_model, messages).await
    }

    pub async fn get_models(&self, state: &DbState) -> Result<Vec<OllamaModel>> {
        let start = Utc::now();
        let result = self.execute_get_models().await;
        let finished = Utc::now();

        let details_json = result
            .as_ref()
            .ok()
            .and_then(|models| serde_json::to_string(models).ok());
        let error_message = result.as_ref().err().map(|e| e.to_string());

        let audit_entry = AiAuditEntry {
            id: format!(
                "ai-audit-{}",
                start
                    .timestamp_nanos_opt()
                    .unwrap_or(start.timestamp() * 1_000_000)
            ),
            task: "model_listing".to_string(),
            model: self.chat_model.clone(),
            status: if result.is_ok() {
                "success".to_string()
            } else {
                "failure".to_string()
            },
            started_at: start.to_rfc3339(),
            finished_at: finished.to_rfc3339(),
            duration_ms: (finished - start).num_milliseconds(),
            details_json,
            error_message,
            tokens_in: None,
            tokens_out: None,
        };

        if let Ok(conn) = state.0.lock() {
            let _ = audit::log_ai_audit(&conn, &audit_entry);
        }

        result
    }

    async fn execute_get_models(&self) -> Result<Vec<OllamaModel>> {
        let client = OllamaClient::new(&self.ollama_url)?;
        tasks::list_models(&client).await
    }

    pub async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        let client = OllamaClient::new(&self.ollama_url)?;
        tasks::embed_batch(&client, &self.embedding_model, texts).await
    }

    pub async fn embed_query(&self, query: &str) -> Result<Option<Vec<f32>>> {
        let embeddings = self.embed_batch(&[query]).await?;
        Ok(embeddings.into_iter().next())
    }

    pub async fn extract_memory(&self, conversation: &str, model: &str) -> Result<Vec<String>> {
        let client = OllamaClient::new(&self.ollama_url)?;
        tasks::extract_facts(&client, model, conversation).await
    }

    pub async fn suggest_category(&self, conversation: &str, model: &str) -> Result<Option<String>> {
        let client = OllamaClient::new(&self.ollama_url)?;
        tasks::suggest_category(&client, model, conversation).await
    }
}
