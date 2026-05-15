import { Mic, Square } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Button } from "@/components/ui/button";

/**
 * RecordButton: Start/stop audio recording button.
 *
 * Shows microphone icon when idle, stop icon when recording.
 * Displays recording duration.
 */
export function RecordButton() {
  const { isRecording, recordingDuration, error, startRecording, stopRecording } =
    useVoiceRecorder();

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClick = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleClick}
        variant={isRecording ? "destructive" : "default"}
        size="lg"
        className="gap-2"
        disabled={!!error}
      >
        {isRecording ? (
          <>
            <Square className="w-4 h-4" />
            Stop ({formatDuration(recordingDuration)})
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" />
            Record
          </>
        )}
      </Button>

      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
