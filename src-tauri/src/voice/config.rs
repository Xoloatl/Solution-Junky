/// Audio capture and processing configuration
#[derive(Clone, Copy, Debug)]
pub struct AudioConfig {
    /// Sample rate in Hz. 16000 Hz is standard for speech recognition
    pub sample_rate: u32,

    /// Mono = 1 channel, Stereo = 2 channels.
    /// For voice, mono is sufficient and reduces CPU.
    pub channels: u16,

    /// Buffer size for ring buffer. At 16kHz mono, this is:
    /// 16000 samples/sec * 2 bytes/sample = 32 KB/sec
    /// 262144 samples = ~16.4 sec of audio
    /// Provides headroom for processing delays
    pub ring_buffer_size: usize,

    /// Chunk size emitted to frontend. At 16kHz, 1024 samples = 64ms of audio.
    /// Balances latency (smaller = more real-time) vs. IPC overhead.
    pub chunk_size_samples: usize,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            channels: 1,
            ring_buffer_size: 262144, // ~16 sec @ 16kHz mono
            chunk_size_samples: 1024,  // 64 ms chunks
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = AudioConfig::default();
        assert_eq!(cfg.sample_rate, 16000);
        assert_eq!(cfg.channels, 1);
    }
}
