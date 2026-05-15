/// Voice subsystem error types
#[derive(Debug, thiserror::Error)]
pub enum VoiceError {
    #[error("No audio device found")]
    NoAudioDevice,

    #[error("Failed to build audio stream: {0}")]
    StreamBuildError(String),

    #[error("Audio stream creation failed: {0}")]
    StreamCreationError(String),

    #[error("Recording not in progress")]
    NotRecording,

    #[error("Already recording")]
    AlreadyRecording,

    #[error("Audio ring buffer is full")]
    BufferFull,

    #[error("Whisper model error: {0}")]
    Whisper(String),

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, VoiceError>;
