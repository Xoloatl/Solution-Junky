use serde::Serialize;

/// Serialized payload for `voice:audio_chunk` events.
#[derive(Clone, Serialize)]
pub struct AudioChunk {
    pub samples: Vec<f32>,
    pub timestamp_ms: u64,
}

/// Serialized payload for `voice:transcript` after Whisper decodes the session.
#[derive(Clone, Serialize)]
pub struct TranscriptPayload {
    pub text: String,
}
