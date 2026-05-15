//! Download and cache Whisper `ggml-base.en.bin` in the app data directory.

use std::path::Path;

use crate::error::AppError;

/// Official whisper.cpp English-only base model (smallest “base” English variant).
const BASE_EN_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";

/// Minimum file size (bytes) to treat an existing file as valid (avoids partial downloads).
const MIN_MODEL_BYTES: u64 = 32 * 1024 * 1024;

/// Ensure `ggml-base.en.bin` exists at `model_path`. Downloads once if missing or too small.
pub async fn ensure_base_en_model(model_path: &Path) -> Result<(), AppError> {
    if model_path.exists() {
        let len = std::fs::metadata(model_path)?.len();
        if len >= MIN_MODEL_BYTES {
            return Ok(());
        }
        let _ = std::fs::remove_file(model_path);
    }

    if let Some(parent) = model_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let client = reqwest::Client::builder()
        .user_agent("solution-junky/1.0 (Whisper model download)")
        .build()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let res = client
        .get(BASE_EN_URL)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Whisper model download failed: {e}")))?;

    let res = res
        .error_for_status()
        .map_err(|e| AppError::Other(format!("Whisper model HTTP error: {e}")))?;

    let bytes = res
        .bytes()
        .await
        .map_err(|e| AppError::Other(format!("Whisper model read body: {e}")))?;

    let tmp_path = model_path.with_extension("bin.part");
    std::fs::write(&tmp_path, &bytes)?;
    std::fs::rename(&tmp_path, model_path)?;
    Ok(())
}
