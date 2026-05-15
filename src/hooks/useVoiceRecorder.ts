import { useEffect, useCallback } from "react";
import {
  useVoiceStore,
  startDurationTimer,
  stopDurationTimer,
} from "@/store/voice";
import * as voiceLib from "@/lib/voice";

/**
 * useVoiceRecorder: Manages offline audio recording lifecycle and event subscriptions.
 *
 * Handles:
 * - Starting/stopping recording via CPAL
 * - Listening to backend events (audio chunks, recording started/stopped)
 * - Duration tracking
 * - Error cleanup
 *
 * Usage in a component:
 *   const { isRecording, startRecording, stopRecording, error } = useVoiceRecorder();
 *   return (
 *     <button onClick={() => isRecording ? stopRecording() : startRecording()}>
 *       {isRecording ? "Stop" : "Start"}
 *     </button>
 *   );
 */
export function useVoiceRecorder() {
  const {
    isRecording,
    recordingDuration,
    recordingState,
    error,
    startRecording: zustandStart,
    stopRecording: zustandStop,
    cancelRecording,
    addAudioChunk,
    setRecordingState,
    setError,
    clearError,
  } = useVoiceStore();

  /// Start recording: update Zustand state, then invoke backend
  const startRecording = useCallback(async () => {
    clearError();
    zustandStart();
    startDurationTimer();

    try {
      await voiceLib.startRecording();
    } catch (err) {
      zustandStop();
      stopDurationTimer();
      setError(`Failed to start recording: ${String(err)}`);
      console.error("[useVoiceRecorder] startRecording error:", err);
    }
  }, [zustandStart, zustandStop, setError, clearError]);

  /// Stop recording: invoke backend, update state
  const stopRecording = useCallback(async () => {
    try {
      await voiceLib.stopRecording();
      zustandStop();
      stopDurationTimer();
    } catch (err) {
      setError(`Failed to stop recording: ${String(err)}`);
      console.error("[useVoiceRecorder] stopRecording error:", err);
    }
  }, [zustandStop, setError]);

  /// Cancel recording without saving
  const cancel = useCallback(async () => {
    try {
      await voiceLib.stopRecording();
      cancelRecording();
      stopDurationTimer();
    } catch (err) {
      console.error("[useVoiceRecorder] cancel error:", err);
    }
  }, [cancelRecording]);

  /// Set up event listeners
  useEffect(() => {
    let unlistenStart: (() => void) | null = null;
    let unlistenStop: (() => void) | null = null;
    let unlistenChunk: (() => void) | null = null;

    async function setupListeners() {
      try {
        unlistenStart = await voiceLib.onRecordingStarted(() => {
          setRecordingState("recording");
        });

        unlistenStop = await voiceLib.onRecordingStopped(() => {
          setRecordingState("idle");
          stopDurationTimer();
        });

        unlistenChunk = await voiceLib.onAudioChunk((chunk) => {
          // Convert array to Float32Array if needed
          const samples = chunk.samples instanceof Float32Array
            ? chunk.samples
            : new Float32Array(chunk.samples);
          addAudioChunk(samples, chunk.timestamp_ms);
        });
      } catch (err) {
        console.error("[useVoiceRecorder] Failed to setup listeners:", err);
      }
    }

    setupListeners();

    /// Cleanup: unsubscribe from events
    return () => {
      if (unlistenStart) unlistenStart();
      if (unlistenStop) unlistenStop();
      if (unlistenChunk) unlistenChunk();
      // If recording is still active when component unmounts, stop it
      if (isRecording) {
        voiceLib.stopRecording().catch((err) =>
          console.error("[useVoiceRecorder] cleanup stop failed:", err)
        );
      }
    };
  }, [addAudioChunk, setRecordingState, isRecording]);

  return {
    isRecording,
    recordingDuration,
    recordingState,
    error,
    startRecording,
    stopRecording,
    cancelRecording: cancel,
    clearError,
  };
}
