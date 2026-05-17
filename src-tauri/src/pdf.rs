use crate::error::{AppError, Result};
use lopdf::Document;

pub struct PageText {
    pub page_number: u32,
    pub text: String,
}

pub struct Chunk {
    pub content: String,
    pub page_number: u32,
    pub char_start: usize,
    pub char_end: usize,
}

// ~512 tokens at ~4 chars/token
const CHUNK_CHARS: usize = 2048;
const OVERLAP_CHARS: usize = 256;

pub fn extract_text(path: &str) -> Result<Vec<PageText>> {
    let doc = Document::load(path).map_err(|e| AppError::Other(format!("PDF load failed: {e}")))?;
    let pages = doc.get_pages();
    let mut result = Vec::with_capacity(pages.len());

    for page_num in pages.keys() {
        let text = doc
            .extract_text(&[*page_num])
            .unwrap_or_default()
            .replace('\u{0000}', "") // strip null bytes that lopdf sometimes produces
            .trim()
            .to_string();
        result.push(PageText {
            page_number: *page_num,
            text,
        });
    }
    Ok(result)
}

pub fn average_chars_per_page(pages: &[PageText]) -> usize {
    if pages.is_empty() {
        return 0;
    }
    let total: usize = pages.iter().map(|p| p.text.len()).sum();
    total / pages.len()
}

/// Splits pages into overlapping chunks preserving page attribution.
pub fn chunk_pages(pages: &[PageText]) -> Vec<Chunk> {
    let mut chunks = Vec::new();

    for page in pages {
        if page.text.is_empty() {
            continue;
        }
        let text = &page.text;
        let len = text.len();
        let mut start = 0;

        while start < len {
            let end = (start + CHUNK_CHARS).min(len);
            // Extend to next paragraph boundary if within 200 chars
            let end = snap_to_boundary(text, end, 200).unwrap_or(end);

            let content = text[start..end].trim().to_string();
            if !content.is_empty() {
                chunks.push(Chunk {
                    content,
                    page_number: page.page_number,
                    char_start: start,
                    char_end: end,
                });
            }

            if end >= len {
                break;
            }
            start = end.saturating_sub(OVERLAP_CHARS);
        }
    }
    chunks
}

/// Try to snap `pos` forward to the next paragraph/sentence break within `window`.
fn snap_to_boundary(text: &str, pos: usize, window: usize) -> Option<usize> {
    if pos >= text.len() {
        return None;
    }
    let end = (pos + window).min(text.len());
    let slice = &text[pos..end];
    if let Some(idx) = slice.find("\n\n") {
        return Some(pos + idx + 2);
    }
    if let Some(idx) = slice.find('\n') {
        return Some(pos + idx + 1);
    }
    if let Some(idx) = slice.find(". ") {
        return Some(pos + idx + 2);
    }
    None
}
