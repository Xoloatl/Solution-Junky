use std::sync::Mutex;

use super::audio::AudioCapture;

/// CPAL's `Stream` is intentionally `!Send` on some platforms, but we only create and drop
/// capture from the async runtime while holding `VoiceState`'s lock (no concurrent access).
/// Tauri `State<T>` requires `T: Send + Sync`.
pub(crate) struct SendAudioCapture(pub(crate) Mutex<Option<AudioCapture>>);

unsafe impl Send for SendAudioCapture {}
unsafe impl Sync for SendAudioCapture {}

impl SendAudioCapture {
    pub(crate) fn new(capture: AudioCapture) -> Self {
        Self(Mutex::new(Some(capture)))
    }

    pub(crate) fn take(&self) -> Option<AudioCapture> {
        self.0.lock().ok().and_then(|mut g| g.take())
    }
}
