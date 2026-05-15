//! Local speech-to-text using whisper.cpp via `whisper-rs`.

use std::path::Path;
use std::sync::Mutex;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::error::{Result, VoiceError};

/// Run Whisper on 16 kHz mono PCM (`f32` in [-1, 1]). Reuses `ctx_cache` after first load.
pub fn transcribe_pcm16k_mono(
    ctx_cache: &Mutex<Option<WhisperContext>>,
    model_path: &Path,
    audio: &[f32],
) -> Result<String> {
    if audio.len() < 4800 {
        // ~0.3 s at 16 kHz — too little signal for useful text
        return Ok(String::new());
    }

    let path_str = model_path
        .to_str()
        .ok_or_else(|| VoiceError::Other("invalid model path".into()))?;

    let mut guard = ctx_cache
        .lock()
        .map_err(|_| VoiceError::Other("whisper cache mutex poisoned".into()))?;

    if guard.is_none() {
        let ctx = WhisperContext::new_with_params(path_str, WhisperContextParameters::default())
            .map_err(|e| VoiceError::Whisper(format!("load model: {e:?}")))?;
        *guard = Some(ctx);
    }

    let ctx = guard
        .as_ref()
        .ok_or_else(|| VoiceError::Whisper("context missing after load".into()))?;

    let mut state = ctx
        .create_state()
        .map_err(|e| VoiceError::Whisper(format!("create_state: {e:?}")))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8) as i32)
        .unwrap_or(4);
    params.set_n_threads(threads);
    params.set_translate(false);
    params.set_language(Some("en"));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    state
        .full(params, audio)
        .map_err(|e| VoiceError::Whisper(format!("inference: {e:?}")))?;

    let n = state
        .full_n_segments()
        .map_err(|e| VoiceError::Whisper(format!("segments: {e:?}")))?;

    let mut out = String::new();
    for i in 0..n {
        let seg = state
            .full_get_segment_text(i)
            .map_err(|e| VoiceError::Whisper(format!("segment text: {e:?}")))?;
        let seg = seg.trim();
        if seg.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(seg);
    }

    Ok(out.trim().to_string())
}
