use rusqlite::params;
use serde::Serialize;
use tauri::Emitter;

use crate::db::DbState;
use crate::embeddings;
use crate::error::{AppError, Result};
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

    // ── 1. Extract text ───────────────────────────────────────────────────────
    emit("Extracting text…", 0, 1);
    let mut pages = pdf::extract_text(&filepath)?;
    let page_count = pages.len();

    // ── 2. OCR check + fallback ───────────────────────────────────────────────
    let avg_chars = pdf::average_chars_per_page(&pages);
    let needs_ocr = avg_chars < 100;
    let ocr_applied;

    if needs_ocr {
        if ocr::is_available() {
            emit("Running OCR…", 0, pages.len());
            match ocr::ocr_pdf(&filepath, &ocr_lang) {
                Ok(ocr_pages) if !ocr_pages.is_empty() => {
                    pages = ocr_pages;
                    ocr_applied = true;
                }
                Ok(_) => {
                    // Tesseract returned nothing — keep lopdf output
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
    } else {
        ocr_applied = false;
    }

    // ── 3. Chunk ──────────────────────────────────────────────────────────────
    emit("Chunking…", 0, 1);
    let chunks = pdf::chunk_pages(&pages);
    let chunk_count = chunks.len();

    // ── 4. Embed ──────────────────────────────────────────────────────────────
    let texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let embeddings = {
        let mut all = Vec::with_capacity(texts.len());
        let batch_size = 32;
        for (batch_idx, batch) in texts.chunks(batch_size).enumerate() {
            emit(
                "Embedding…",
                batch_idx * batch_size,
                texts.len(),
            );
            let refs: Vec<&str> = batch.iter().map(|s| s.as_str()).collect();
            let (ollama_url, embedding_model) = {
                let conn = state.0.lock().map_err(|_| AppError::Other("db lock poisoned".into()))?;
                let url = crate::db::get_setting(&conn, "ollama_url", "http://localhost:11434")?;
                let model = crate::db::get_setting(&conn, "embedding_model", "nomic-embed-text")?;
                (url, model)
            };
            match embeddings::embed_batch(&ollama_url, &embedding_model, &refs).await {
                Ok(mut v) => all.append(&mut v),
                Err(e) => {
                    // Embedding failed (nomic not pulled?) — store chunks without embeddings
                    eprintln!("embed batch failed: {e}");
                    for _ in batch {
                        all.push(vec![]);
                    }
                }
            }
        }
        all
    };

    // ── 5. Persist ────────────────────────────────────────────────────────────
    emit("Saving…", 0, 1);
    {
        let conn = state
            .0
            .lock()
            .map_err(|_| AppError::Other("db lock poisoned".into()))?;

        let now = chrono_now();

        // Document record
        conn.execute(
            "INSERT OR REPLACE INTO documents
             (id, filename, filepath, mime_type, page_count, ocr_applied, uploaded_at)
             VALUES (?1, ?2, ?3, 'application/pdf', ?4, ?5, ?6)",
            params![doc_id, filename, filepath, page_count as i64, ocr_applied as i32, now],
        )?;

        // Chunks + embeddings
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
            // Index in FTS for BM25 retrieval
            conn.execute(
                "INSERT INTO fts_chunks (chunk_id, content) VALUES (?1, ?2)",
                params![chunk_id, chunk.content],
            )?;
        }

        // Graph node
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
    // ISO-ish string without chrono dep
    format!("{secs}")
}
