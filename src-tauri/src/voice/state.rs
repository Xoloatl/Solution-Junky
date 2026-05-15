use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::Emitter;
use tokio::task::JoinHandle;
use whisper_rs::WhisperContext;

use crate::voice::audio::AudioCapture;
use crate::voice::config::AudioConfig;
use crate::voice::error::{Result, VoiceError};
use crate::voice::model;
use crate::voice::payload::{AudioChunk, TranscriptPayload};
use crate::voice::send_capture::SendAudioCapture;
use crate::voice::transcribe;

/// One active CPAL + consumer session.
struct RecordingSession {
    run: Arc<AtomicBool>,
    samples: Arc<Mutex<Vec<f32>>>,
    capture: SendAudioCapture,
    consumer: JoinHandle<()>,
}

/// Managed state: capture pipeline + cached Whisper context.
pub struct VoiceState {
    inner: tokio::sync::Mutex<VoiceStateInner>,
    model_path: PathBuf,
    whisper_cache: Arc<Mutex<Option<WhisperContext>>>,
}

struct VoiceStateInner {
    session: Option<RecordingSession>,
}

impl VoiceState {
    pub fn new(model_path: PathBuf) -> Self {
        Self {
            inner: tokio::sync::Mutex::new(VoiceStateInner { session: None }),
            model_path,
            whisper_cache: Arc::new(Mutex::new(None)),
        }
    }

    pub fn default_for_app_data(app_voice_dir: PathBuf) -> Self {
        let model_path = app_voice_dir.join("ggml-base.en.bin");
        Self::new(model_path)
    }

    /// Start microphone capture and the ring-buffer consumer (emits `voice:audio_chunk`).
    pub async fn start_recording(&self, app: tauri::AppHandle) -> Result<()> {
        let mut inner = self.inner.lock().await;
        if inner.session.is_some() {
            return Err(VoiceError::AlreadyRecording);
        }

        let (audio_capture, ring_buffer) = AudioCapture::new(AudioConfig::default())?;
        let run = Arc::new(AtomicBool::new(true));
        let samples = Arc::new(Mutex::new(Vec::new()));

        let run_c = run.clone();
        let samples_c = samples.clone();
        let rb = ring_buffer.clone();
        let app_c = app.clone();

        let consumer = tokio::spawn(async move {
            loop {
                while let Some(frame) = rb.pop() {
                    if let Ok(mut acc) = samples_c.lock() {
                        acc.extend_from_slice(&frame.samples);
                    }
                    let _ = app_c.emit(
                        "voice:audio_chunk",
                        AudioChunk {
                            samples: frame.samples.clone(),
                            timestamp_ms: frame.timestamp_ms,
                        },
                    );
                }

                if !run_c.load(Ordering::Relaxed) {
                    while let Some(frame) = rb.pop() {
                        if let Ok(mut acc) = samples_c.lock() {
                            acc.extend_from_slice(&frame.samples);
                        }
                        let _ = app_c.emit(
                            "voice:audio_chunk",
                            AudioChunk {
                                samples: frame.samples.clone(),
                                timestamp_ms: frame.timestamp_ms,
                            },
                        );
                    }
                    break;
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
            }
        });

        inner.session = Some(RecordingSession {
            run,
            samples,
            capture: SendAudioCapture::new(audio_capture),
            consumer,
        });

        let _ = app.emit("voice:recording_started", ());
        Ok(())
    }

    /// Stop capture, drain consumer, run Whisper, emit `voice:recording_stopped` then `voice:transcript`.
    pub async fn stop_recording(&self, app: tauri::AppHandle) -> Result<()> {
        let session = {
            let mut inner = self.inner.lock().await;
            inner.session.take()
        };

        let Some(session) = session else {
            return Err(VoiceError::NotRecording);
        };

        session.run.store(false, Ordering::SeqCst);
        drop(session.capture.take());

        session.consumer.await.map_err(|e| {
            VoiceError::Other(format!("consumer task join: {e}"))
        })?;

        let pcm: Vec<f32> = session
            .samples
            .lock()
            .map_err(|_| VoiceError::Other("samples mutex poisoned".into()))?
            .clone();

        let _ = app.emit("voice:recording_stopped", ());

        model::ensure_base_en_model(&self.model_path)
            .await
            .map_err(|e| VoiceError::Other(e.to_string()))?;

        let model_path = self.model_path.clone();
        let cache = self.whisper_cache.clone();
        let text = tokio::task::spawn_blocking(move || {
            transcribe::transcribe_pcm16k_mono(&*cache, &model_path, &pcm)
        })
        .await
        .map_err(|e| VoiceError::Other(format!("transcribe join: {e}")))??;

        let _ = app.emit("voice:transcript", TranscriptPayload { text: text.clone() });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_voice_state_paths() {
        let dir = std::env::temp_dir().join("sj-voice-test");
        let state = VoiceState::default_for_app_data(dir.clone());
        assert!(state.model_path.ends_with("ggml-base.en.bin"));
    }
}
