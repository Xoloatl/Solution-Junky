use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

#[derive(Debug, Serialize, Clone)]
pub struct WebResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub engine: String,
    pub citation_index: usize,
}

#[derive(Deserialize)]
struct SearxResponse {
    results: Vec<SearxHit>,
}

#[derive(Deserialize)]
struct SearxHit {
    title: String,
    url: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    engine: String,
}

const MAX_RESULTS: usize = 6;

pub async fn search(base_url: &str, query: &str) -> Result<Vec<WebResult>> {
    let url = format!(
        "{}/search?q={}&format=json&categories=general&language=en",
        base_url.trim_end_matches('/'),
        urlencoding::encode(query),
    );

    let resp = Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| AppError::Other(format!("SearXNG request: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Other(format!("SearXNG returned {}", resp.status())));
    }

    let body: SearxResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("SearXNG parse: {e}")))?;

    Ok(body
        .results
        .into_iter()
        .take(MAX_RESULTS)
        .enumerate()
        .map(|(i, hit)| WebResult {
            title: hit.title,
            url: hit.url,
            snippet: hit.content,
            engine: hit.engine,
            citation_index: i + 1,
        })
        .collect())
}
