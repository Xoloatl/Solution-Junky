use crate::error::{AppError, Result};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::time::Duration;

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new(base_url: &str) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        })
    }

    pub async fn post_json<B: Serialize, R: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<R> {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        let res = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(AppError::Other(format!(
                "Ollama request failed: {} {}",
                status, text
            )));
        }
        res.json().await.map_err(|e| AppError::Other(e.to_string()))
    }

    pub async fn get_json<R: DeserializeOwned>(&self, path: &str) -> Result<R> {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        let res = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(AppError::Other(format!(
                "Ollama request failed: {} {}",
                status, text
            )));
        }
        res.json().await.map_err(|e| AppError::Other(e.to_string()))
    }
}
