import { useVoiceStore } from "@/store/voice";

/**
 * TranscriptDisplay: Shows audio metadata and raw chunk info.
 *
 * Phase 2A: Just display raw audio chunk data (samples, timestamp).
 * Phase 2B: Will replace with Whisper transcription display.
 *
 * Shows:
 * - Number of audio chunks captured
 * - Total samples
 * - Latest timestamp
 */
export function TranscriptDisplay() {
  const { audioChunks, timestamp_ms, recordingState, isRecording } =
    useVoiceStore();

  const totalSamples = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  if (recordingState === "idle" && audioChunks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Click "Record" to start capturing audio...
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-muted-foreground">State:</span>
          <span className="ml-2 font-mono font-semibold">
            {recordingState}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Chunks:</span>
          <span className="ml-2 font-mono font-semibold">
            {audioChunks.length}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Total samples:</span>
          <span className="ml-2 font-mono font-semibold">
            {totalSamples.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Latest timestamp:</span>
          <span className="ml-2 font-mono font-semibold">
            {timestamp_ms ? `${timestamp_ms} ms` : "—"}
          </span>
        </div>
      </div>

      {isRecording && (
        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">
          🎤 Recording in progress...
        </div>
      )}
    </div>
  );
}
