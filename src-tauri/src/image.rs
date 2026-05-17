use crate::error::{AppError, Result};
use image::io::Reader as ImageReader;
use image::{GenericImageView, ImageFormat};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub color_type: String,
    pub has_alpha: bool,
    pub file_size: Option<u64>,
}

pub fn read_metadata(filepath: &str) -> Result<ImageMetadata> {
    let path = Path::new(filepath);
    let reader = ImageReader::open(path)
        .map_err(|e| AppError::Other(format!("image metadata failed: {e}")))?;

    let format = reader
        .format()
        .or_else(|| infer_image_format(path))
        .ok_or_else(|| AppError::Other("Unsupported image format".into()))?;

    let image = reader
        .with_guessed_format()
        .map_err(|e| AppError::Other(format!("image read failed: {e}")))?
        .decode()
        .map_err(|e| AppError::Other(format!("image decode failed: {e}")))?;

    let dimensions = image.dimensions();
    let color_type = format!("{:?}", image.color());
    let has_alpha = image.color().has_alpha();
    let file_size = fs::metadata(path).ok().map(|meta| meta.len());

    Ok(ImageMetadata {
        width: dimensions.0,
        height: dimensions.1,
        format: format_to_string(format),
        color_type,
        has_alpha,
        file_size,
    })
}

fn infer_image_format(path: &Path) -> Option<ImageFormat> {
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());

    match ext.as_deref() {
        Some("png") => Some(ImageFormat::Png),
        Some("jpg") | Some("jpeg") => Some(ImageFormat::Jpeg),
        Some("gif") => Some(ImageFormat::Gif),
        Some("bmp") => Some(ImageFormat::Bmp),
        Some("tiff") | Some("tif") => Some(ImageFormat::Tiff),
        Some("webp") => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn format_to_string(format: ImageFormat) -> String {
    match format {
        ImageFormat::Png => "png".to_string(),
        ImageFormat::Jpeg => "jpeg".to_string(),
        ImageFormat::Gif => "gif".to_string(),
        ImageFormat::Bmp => "bmp".to_string(),
        ImageFormat::Tiff => "tiff".to_string(),
        ImageFormat::WebP => "webp".to_string(),
        ImageFormat::Pnm => "pnm".to_string(),
        ImageFormat::Ico => "ico".to_string(),
        ImageFormat::Hdr => "hdr".to_string(),
        ImageFormat::Tga => "tga".to_string(),
        ImageFormat::Dds => "dds".to_string(),
        ImageFormat::Farbfeld => "farbfeld".to_string(),
        ImageFormat::Avif => "avif".to_string(),
        ImageFormat::OpenExr => "openexr".to_string(),
        _ => "unknown".to_string(),
    }
}
