use crossbeam_channel::{bounded, Receiver, Sender};
use crate::voice::error::{Result, VoiceError};

/// Audio frame chunk sent through ring buffer
#[derive(Clone, Debug)]
pub struct AudioFrame {
    /// Raw PCM samples (f32, range -1.0..1.0)
    pub samples: Vec<f32>,
    /// Timestamp in milliseconds since recording started
    pub timestamp_ms: u64,
}

/// Ring buffer for audio samples.
///
/// Decouples CPAL's hard real-time capture callbacks from speech processing.
/// CPAL pushes frames at fixed intervals (hard real-time);
/// we need to decouple from processing which may have variable latency.
///
/// Architecture:
/// - Producer: CPAL callback thread (pushes frames)
/// - Consumer: Voice processing thread (pops frames)
/// - Bounded channel: Prevents unbounded memory growth
/// - Non-blocking: Producer never waits; if buffer full, we drop samples (tolerable)
pub struct RingBuffer {
    tx: Sender<AudioFrame>,
    rx: Receiver<AudioFrame>,
}

impl RingBuffer {
    /// Create a new ring buffer with given capacity (in frames)
    pub fn new(capacity: usize) -> Self {
        let (tx, rx) = bounded(capacity);
        Self { tx, rx }
    }

    /// Try to send a frame to the buffer (non-blocking).
    ///
    /// If buffer is full, returns BufferFull error.
    /// In production, you'd:
    /// - Log a warning (buffer overrun, audio lag)
    /// - Drop the oldest samples and continue (tolerable for live audio)
    ///
    /// We return error here; caller decides what to do (drop or log).
    pub fn push(&self, frame: AudioFrame) -> Result<()> {
        self.tx.try_send(frame)
            .map_err(|_| VoiceError::BufferFull)
    }

    /// Try to receive a frame from the buffer (non-blocking).
    /// Returns None if buffer is empty.
    pub fn pop(&self) -> Option<AudioFrame> {
        self.rx.try_recv().ok()
    }

    /// Drain all frames currently in buffer.
    /// Useful for cleanup on stop recording.
    pub fn drain(&self) -> Vec<AudioFrame> {
        let mut frames = Vec::new();
        while let Ok(frame) = self.rx.try_recv() {
            frames.push(frame);
        }
        frames
    }

    /// Get approximate number of frames in buffer.
    /// Note: This is approximate because frames may be in-flight on another thread.
    pub fn approximate_len(&self) -> usize {
        self.rx.len()
    }

    /// Get sender for external producers (useful for testing)
    pub fn sender(&self) -> Sender<AudioFrame> {
        self.tx.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_push_pop() {
        let rb = RingBuffer::new(10);
        let frame = AudioFrame {
            samples: vec![0.1, 0.2, 0.3],
            timestamp_ms: 0,
        };
        rb.push(frame.clone()).unwrap();
        let popped = rb.pop();
        assert!(popped.is_some());
        assert_eq!(popped.unwrap().samples, vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn test_ring_buffer_full() {
        let rb = RingBuffer::new(1);
        let frame1 = AudioFrame {
            samples: vec![0.1],
            timestamp_ms: 0,
        };
        let frame2 = AudioFrame {
            samples: vec![0.2],
            timestamp_ms: 1,
        };
        
        rb.push(frame1).unwrap();
        // Next push should fail (buffer full)
        assert!(rb.push(frame2).is_err());
    }

    #[test]
    fn test_ring_buffer_drain() {
        let rb = RingBuffer::new(10);
        for i in 0..5 {
            rb.push(AudioFrame {
                samples: vec![i as f32],
                timestamp_ms: i as u64,
            }).unwrap();
        }
        let drained = rb.drain();
        assert_eq!(drained.len(), 5);
        assert!(rb.pop().is_none());
    }
}
