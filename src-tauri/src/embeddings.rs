use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

const BATCH_SIZE: usize = 32;

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: Vec<&'a str>,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

/// Embed a batch of texts. Returns one Vec<f32> per input, in order.
pub async fn embed_batch(ollama_url: &str, model: &str, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(vec![]);
    }
    let client = reqwest::Client::new();
    let body = EmbedRequest {
        model,
        input: texts.to_vec(),
    };
    let resp = client
        .post(format!("{}/api/embed", ollama_url.trim_end_matches('/')))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("embedding request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("embed API {status}: {text}")));
    }

    let parsed: EmbedResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("embed parse failed: {e}")))?;

    Ok(parsed.embeddings)
}

/// Embed all texts in batches of BATCH_SIZE. Returns embeddings in original order.
pub async fn embed_all(ollama_url: &str, model: &str, texts: &[String]) -> Result<Vec<Vec<f32>>> {
    let mut all = Vec::with_capacity(texts.len());
    for chunk in texts.chunks(BATCH_SIZE) {
        let refs: Vec<&str> = chunk.iter().map(|s| s.as_str()).collect();
        let mut batch = embed_batch(ollama_url, model, &refs).await?;
        all.append(&mut batch);
    }
    Ok(all)
}

/// Serialize an embedding to bytes for SQLite BLOB storage.
pub fn to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize an embedding from SQLite BLOB.
pub fn from_blob(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

/// Cosine similarity between two embeddings.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let mag_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}
