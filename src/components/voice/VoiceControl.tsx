import { RecordButton } from "./RecordButton";
import { TranscriptDisplay } from "./TranscriptDisplay";
import { useVoiceStore } from "@/store/voice";

/**
 * VoiceControl: optional debug panel for local CPAL + Whisper pipeline.
 */
export function VoiceControl() {
  const { error, clearError } = useVoiceStore();

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4 space-y-1">
        <h2 className="text-lg font-semibold leading-none tracking-tight">Voice (local)</h2>
        <p className="text-sm text-muted-foreground">
          CPAL capture, Whisper transcription on stop, events via Tauri.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Recording</h3>
          <RecordButton />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Audio stream</h3>
          <TranscriptDisplay />
        </div>

        {error && (
          <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded p-3 flex items-center justify-between">
            <span className="text-sm">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
