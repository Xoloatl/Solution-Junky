use crate::error::{AppError, Result};
use crate::pdf::PageText;
use std::process::Command;

/// Returns true if `tesseract` is found on PATH.
pub fn is_available() -> bool {
    Command::new("tesseract")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Run Tesseract on a PDF file and return per-page text.
///
/// Requires the UB-Mannheim Windows build (or any build with PDF/pdfrenderer
/// support). Tesseract outputs pages separated by form-feed characters (\x0C).
fn run_tesseract(filepath: &str, lang: &str) -> Result<String> {
    let output = Command::new("tesseract")
        .args([filepath, "stdout", "-l", lang])
        .output()
        .map_err(|e| AppError::Other(format!("tesseract exec: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("tesseract: {stderr}")));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn parse_tesseract_output(raw: String) -> Result<Vec<PageText>> {
    let pages: Vec<PageText> = raw
        .split('\x0C')
        .enumerate()
        .filter_map(|(i, page_text)| {
            let text = page_text.trim().to_string();
            if text.is_empty() {
                return None;
            }
            Some(PageText {
                page_number: (i + 1) as u32,
                text,
            })
        })
        .collect();

    if pages.is_empty() {
        let text = raw.trim().to_string();
        Ok(vec![PageText {
            page_number: 1,
            text,
        }])
    } else {
        Ok(pages)
    }
}

pub fn ocr_pdf(filepath: &str, lang: &str) -> Result<Vec<PageText>> {
    let raw = run_tesseract(filepath, lang)?;
    parse_tesseract_output(raw)
}

pub fn ocr_image(filepath: &str, lang: &str) -> Result<Vec<PageText>> {
    let raw = run_tesseract(filepath, lang)?;
    parse_tesseract_output(raw)
}
