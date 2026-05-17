use rusqlite::params;
use serde::Serialize;
use serde_json;
use tauri::Emitter;

use crate::ai::router::AiRouter;
use crate::db::DbState;
use crate::embeddings;
use crate::error::{AppError, Result};
use crate::image;
use crate::ocr;
use crate::pdf;

// ── Progress events emitted to the frontend ───────────────────────────────────

#[derive(Clone, Serialize)]
pub struct IngestProgress {
    pub doc_id: String,
    pub stage: String,
    pub current: usize,
    pub total: usize,
}

#[derive(Clone, Serialize)]
pub struct IngestComplete {
    pub doc_id: String,
    pub filename: String,
    pub chunk_count: usize,
    pub page_count: usize,
    pub ocr_applied: bool,
}

#[derive(Clone, Serialize)]
pub struct IngestError {
    pub doc_id: String,
    pub message: String,
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

pub async fn run(
    app: tauri::AppHandle,
    state: &DbState,
    doc_id: String,
    filepath: String,
    filename: String,
    ocr_lang: String,
) -> Result<IngestComplete> {
    let extension = std::path::Path::new(&filepath)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "pdf" => run_pdf(app, state, doc_id, filepath, filename, ocr_lang).await,
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tiff" | "tif" => {
            run_image(app, state, doc_id, filepath, filename, ocr_lang).await
        }
        other => Err(AppError::Other(format!("Unsupported file type: {other}"))),
    }
}

async fn run_pdf(
    app: tauri::AppHandle,
    state: &DbState,
    doc_id: String,
    filepath: String,
    filename: String,
    ocr_lang: String,
) -> Result<IngestComplete> {
    let emit = |stage: &str, current: usize, total: usize| {
        let _ = app.emit(
            "ingest:progress",
            IngestProgress {
                doc_id: doc_id.clone(),
                stage: stage.to_string(),
                current,
                total,
            },
        );
    };

    emit("Extracting text…", 0, 1);
    let mut pages = pdf::extract_text(&filepath)?;
    let mut ocr_applied = false;

    let avg_chars = pdf::average_chars_per_page(&pages);
    let needs_ocr = avg_chars < 100;

    if needs_ocr {
        if ocr::is_available() {
            emit("Running OCR…", 0, pages.len());
            match ocr::ocr_pdf(&filepath, &ocr_lang) {
                Ok(ocr_pages) if !ocr_pages.is_empty() => {
                    pages = ocr_pages;
                    ocr_applied = true;
                }
                Ok(_) => {
                    ocr_applied = false;
                }
                Err(e) => {
                    eprintln!("OCR failed, falling back to lopdf: {e}");
                    let _ = app.emit(
                        "ingest:progress",
                        IngestProgress {
                            doc_id: doc_id.clone(),
                            stage: format!("OCR failed — {e}"),
                            current: 0,
                            total: 1,
                        },
                    );
                    ocr_applied = false;
                }
            }
        } else {
            let _ = app.emit(
                "ingest:progress",
                IngestProgress {
                    doc_id: doc_id.clone(),
                    stage: "Low text density — install Tesseract for OCR support".to_string(),
                    current: 0,
                    total: 1,
                },
            );
            ocr_applied = false;
        }
    }

    let metadata_json = Some(
        serde_json::json!({
            "extractor": "lopdf",
            "ocr_fallback": ocr_applied,
        })
        .to_string(),
    );

    run_common(
        app,
        state,
        doc_id,
        filepath,
        filename,
        "pdf",
        "application/pdf",
        metadata_json,
        pages,
        ocr_applied,
    )
    .await
}

async fn run_image(
    app: tauri::AppHandle,
    state: &DbState,
    doc_id: String,
    filepath: String,
    filename: String,
    ocr_lang: String,
) -> Result<IngestComplete> {
    let emit = |stage: &str, current: usize, total: usize| {
        let _ = app.emit(
            "ingest:progress",
            IngestProgress {
                doc_id: doc_id.clone(),
                stage: stage.to_string(),
                current,
                total,
            },
        );
    };

    emit("Reading image metadata…", 0, 1);
    let metadata = image::read_metadata(&filepath)?;
    let metadata_json = Some(
        serde_json::to_string(&metadata)
            .map_err(|e| AppError::Other(format!("failed to serialize image metadata: {e}")))?,
    );

    emit("Running OCR…", 0, 1);
    let pages = ocr::ocr_image(&filepath, &ocr_lang)?;
    let ocr_applied = true;

    let mime_type = image_mime_type(&metadata.format);

    run_common(
        app,
        state,
        doc_id,
        filepath,
        filename,
        "image",
        &mime_type,
        metadata_json,
        pages,
        ocr_applied,
    )
    .await
}

fn image_mime_type(format: &str) -> String {
    match format {
        "png" => "image/png".to_string(),
        "jpeg" => "image/jpeg".to_string(),
        "jpg" => "image/jpeg".to_string(),
        "webp" => "image/webp".to_string(),
        "bmp" => "image/bmp".to_string(),
        "tiff" => "image/tiff".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

async fn run_common(
    app: tauri::AppHandle,
    state: &DbState,
    doc_id: String,
    filepath: String,
    filename: String,
    source_type: &str,
    mime_type: &str,
    metadata_json: Option<String>,
    pages: Vec<pdf::PageText>,
    ocr_applied: bool,
) -> Result<IngestComplete> {
    let emit = |stage: &str, current: usize, total: usize| {
        let _ = app.emit(
            "ingest:progress",
            IngestProgress {
                doc_id: doc_id.clone(),
                stage: stage.to_string(),
                current,
                total,
            },
        );
    };

    emit("Chunking…", 0, 1);
    let chunks = pdf::chunk_pages(&pages);
    let chunk_count = chunks.len();
    let page_count = pages.len();

    let texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let embeddings = {
        let mut all = Vec::with_capacity(texts.len());
        let batch_size = 32;
        for (batch_idx, batch) in texts.chunks(batch_size).enumerate() {
            emit("Embedding…", batch_idx * batch_size, texts.len());
            let refs: Vec<&str> = batch.iter().map(|s| s.as_str()).collect();
            let router = {
                let conn = state
                    .0
                    .lock()
                    .map_err(|_| AppError::Other("db lock poisoned".into()))?;
                AiRouter::from_connection(&conn)?
            };
            match router.embed_batch(&refs).await {
                Ok(mut v) => all.append(&mut v),
                Err(e) => {
                    eprintln!("embed batch failed: {e}");
                    for _ in batch {
                        all.push(vec![]);
                    }
                }
            }
        }
        all
    };

    emit("Saving…", 0, 1);
    {
        let conn = state
            .0
            .lock()
            .map_err(|_| AppError::Other("db lock poisoned".into()))?;

        let now = chrono_now();

        conn.execute(
            "INSERT OR REPLACE INTO documents
             (id, filename, filepath, mime_type, source_type, metadata_json, page_count, ocr_applied, uploaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                doc_id,
                filename,
                filepath,
                mime_type,
                source_type,
                metadata_json.as_deref(),
                page_count as i64,
                ocr_applied as i32,
                now,
            ],
        )?;

        for (i, (chunk, embedding)) in chunks.iter().zip(embeddings.iter()).enumerate() {
            let chunk_id = format!("{doc_id}:{i}");
            let blob = if embedding.is_empty() {
                None
            } else {
                Some(embeddings::to_blob(embedding))
            };
            conn.execute(
                "INSERT OR REPLACE INTO chunks
                 (id, document_id, page_number, char_start, char_end, content, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    chunk_id,
                    doc_id,
                    chunk.page_number,
                    chunk.char_start as i64,
                    chunk.char_end as i64,
                    chunk.content,
                    blob,
                ],
            )?;
            conn.execute(
                "INSERT INTO fts_chunks (chunk_id, content) VALUES (?1, ?2)",
                params![chunk_id, chunk.content],
            )?;
        }

        let node_id = format!("node:doc:{doc_id}");
        conn.execute(
            "INSERT OR REPLACE INTO nodes (id, node_type, ref_id, label)
             VALUES (?1, 'document', ?2, ?3)",
            params![node_id, doc_id, filename],
        )?;
    }

    Ok(IngestComplete {
        doc_id,
        filename,
        chunk_count,
        page_count,
        ocr_applied,
    })
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}
