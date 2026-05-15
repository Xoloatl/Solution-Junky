use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::voice::config::AudioConfig;
use crate::voice::error::{Result, VoiceError};
use super::ring_buffer::{AudioFrame, RingBuffer};

/// Captures audio from microphone using CPAL
pub struct AudioCapture {
/// CPAL stream (kept for RAII; dropped after `ring_buffer` / `pending` in struct drop order).
    #[allow(dead_code)]
    stream: Stream,
    ring_buffer: Arc<RingBuffer>,
    /// Samples not yet forming a full frame (CPAL callbacks are often smaller than `chunk_size`).
    pending: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<AtomicBool>,
    frame_count: Arc<std::sync::atomic::AtomicU64>,
    config: AudioConfig,
}

impl AudioCapture {
    /// Create a new audio capture session
    pub fn new(config: AudioConfig) -> Result<(Self, Arc<RingBuffer>)> {
        let host = cpal::default_host();

        let device = host
            .default_input_device()
            .ok_or(VoiceError::NoAudioDevice)?;

        eprintln!("[Voice] Using audio device: {}", device.name().unwrap_or_default());

        let stream_config = StreamConfig {
            channels: config.channels,
            sample_rate: cpal::SampleRate(config.sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let ring_buffer = Arc::new(RingBuffer::new(config.ring_buffer_size / config.chunk_size_samples));
        let is_recording = Arc::new(AtomicBool::new(true));
        let frame_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let pending = Arc::new(Mutex::new(Vec::new()));

        let rb_clone = ring_buffer.clone();
        let is_recording_clone = is_recording.clone();
        let frame_count_clone = frame_count.clone();
        let pending_clone = pending.clone();
        let sample_rate = config.sample_rate;
        let chunk_size = config.chunk_size_samples;

        let stream = device
            .build_input_stream(
                &stream_config,
                move |input_data: &[f32], _info| {
                    if !is_recording_clone.load(Ordering::Relaxed) {
                        return;
                    }

                    let mut buf = match pending_clone.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };

                    buf.extend_from_slice(input_data);

                    while buf.len() >= chunk_size {
                        let frame_num = frame_count_clone.fetch_add(1, Ordering::Relaxed);
                        let timestamp_ms =
                            (frame_num as u64 * chunk_size as u64 * 1000) / sample_rate as u64;
                        let samples: Vec<f32> = buf.drain(..chunk_size).collect();
                        let frame = AudioFrame {
                            samples,
                            timestamp_ms,
                        };
                        if rb_clone.push(frame).is_err() {
                            eprintln!("[Voice] Ring buffer full - dropping audio frame");
                        }
                    }
                },
                |err| {
                    eprintln!("[Voice] Stream error: {err}");
                },
                None,
            )
            .map_err(|e| VoiceError::StreamBuildError(e.to_string()))?;

        stream.play().map_err(|e| VoiceError::StreamCreationError(e.to_string()))?;

        Ok((
            Self {
                stream,
                ring_buffer: ring_buffer.clone(),
                pending,
                is_recording,
                frame_count,
                config,
            },
            ring_buffer,
        ))
    }

    pub fn pause(&self) {
        self.is_recording.store(false, Ordering::Release);
    }

    pub fn resume(&self) {
        self.frame_count.store(0, Ordering::Release);
        self.is_recording.store(true, Ordering::Release);
    }

    pub fn ring_buffer(&self) -> Arc<RingBuffer> {
        self.ring_buffer.clone()
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count.load(Ordering::Acquire)
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.is_recording.store(false, Ordering::Release);
        if let Ok(mut buf) = self.pending.lock() {
            if !buf.is_empty() {
                let samples = std::mem::take(&mut *buf);
                let frame_num = self.frame_count.fetch_add(1, Ordering::Relaxed);
                let n = samples.len() as u64;
                let timestamp_ms = (frame_num * n * 1000) / self.config.sample_rate as u64;
                let frame = AudioFrame {
                    samples,
                    timestamp_ms,
                };
                if self.ring_buffer.push(frame).is_err() {
                    eprintln!("[Voice] Ring buffer full on flush - dropping tail frame");
                }
            }
        }
        eprintln!("[Voice] Audio capture stream closed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // Requires audio device; skip in CI
    fn test_audio_capture_init() {
        let config = AudioConfig::default();
        let result = AudioCapture::new(config);
        assert!(result.is_ok());
    }
}
