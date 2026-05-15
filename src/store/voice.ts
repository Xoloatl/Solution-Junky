import { create } from "zustand";

type RecordingState = "idle" | "recording";

interface VoiceState {
  audioChunks: Float32Array[];
  timestamp_ms: number | null;
  recordingState: RecordingState;
  isRecording: boolean;
  recordingDuration: number; // seconds
  error: string | null;

  // actions
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  addAudioChunk: (samples: Float32Array, timestamp_ms?: number) => void;
  setRecordingState: (s: RecordingState) => void;
  setError: (e: string | null) => void;
  clearError: () => void;
}

let durationTimer: number | null = null;

export const useVoiceStore = create<VoiceState>((set) => ({
  audioChunks: [],
  timestamp_ms: null,
  recordingState: "idle",
  isRecording: false,
  recordingDuration: 0,
  error: null,

  startRecording: () => set(() => ({ isRecording: true, recordingState: "recording", recordingDuration: 0 })),
  stopRecording: () => set(() => ({ isRecording: false, recordingState: "idle" })),
  cancelRecording: () => set(() => ({ isRecording: false, recordingState: "idle", audioChunks: [] })),
  addAudioChunk: (samples: Float32Array, timestamp_ms?: number) =>
    set((s) => ({ audioChunks: [...s.audioChunks, samples], timestamp_ms: timestamp_ms ?? s.timestamp_ms })),
  setRecordingState: (s) => set(() => ({ recordingState: s })),
  setError: (e) => set(() => ({ error: e })),
  clearError: () => set(() => ({ error: null })),
}));

export function startDurationTimer() {
  if (durationTimer) return;
  durationTimer = window.setInterval(() => {
    useVoiceStore.setState((s) => ({ recordingDuration: s.recordingDuration + 1 }));
  }, 1000);
}

export function stopDurationTimer() {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
}

export default useVoiceStore;
