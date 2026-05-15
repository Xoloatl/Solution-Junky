import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

const inTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

export interface AudioChunk {
  samples: number[];
  timestamp_ms: number;
}

/// Start recording from the microphone.
/// Backend will emit voice:audio_chunk events as audio data arrives.
export async function startRecording(): Promise<void> {
  if (!inTauri) {
    console.warn("[Voice] Not running in Tauri, skipping startRecording");
    return;
  }
  return invoke("start_recording");
}

/// Stop recording.
export async function stopRecording(): Promise<void> {
  if (!inTauri) {
    console.warn("[Voice] Not running in Tauri, skipping stopRecording");
    return;
  }
  return invoke("stop_recording");
}

/// Listen to recording started events
export async function onRecordingStarted(
  callback: () => void
): Promise<UnlistenFn> {
  if (!inTauri) {
    return () => {};
  }
  const unlisten = await listen("voice:recording_started", () => {
    callback();
  });
  return unlisten;
}

/// Listen to recording stopped events
export async function onRecordingStopped(
  callback: () => void
): Promise<UnlistenFn> {
  if (!inTauri) {
    return () => {};
  }
  const unlisten = await listen("voice:recording_stopped", () => {
    callback();
  });
  return unlisten;
}

/// Listen to audio chunk events.
/// Called whenever backend has processed a chunk of audio.
export async function onAudioChunk(
  callback: (chunk: AudioChunk) => void
): Promise<UnlistenFn> {
  if (!inTauri) {
    return () => {};
  }
  const unlisten = await listen<AudioChunk>("voice:audio_chunk", (event) => {
    callback(event.payload);
  });
  return unlisten;
}

/** Payload for `voice:transcript` (Whisper, after stop). */
export interface TranscriptPayload {
  text: string;
}

/// Fired once per recording after local Whisper finishes decoding.
export async function onTranscript(
  callback: (text: string) => void
): Promise<UnlistenFn> {
  if (!inTauri) {
    return () => {};
  }
  const unlisten = await listen<TranscriptPayload>("voice:transcript", (event) => {
    callback(event.payload.text ?? "");
  });
  return unlisten;
}
