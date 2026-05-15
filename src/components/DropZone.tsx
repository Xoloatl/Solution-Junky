import { useEffect, useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { IngestJob } from "./IngestToast";

const inTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

interface TauriDropPayload {
  paths?: string[];
  position?: { x: number; y: number };
}

interface Props {
  onJobUpdate: (job: IngestJob) => void;
}

export function DropZone({ onJobUpdate }: Props) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const ingestFile = useCallback(
    async (filepath: string) => {
      const filename = filepath.split(/[\\/]/).pop() ?? filepath;
      if (!filename.toLowerCase().endsWith(".pdf")) return;

      const docId = crypto.randomUUID();

      onJobUpdate({
        docId,
        filename,
        stage: "Starting…",
        current: 0,
        total: 1,
        status: "running",
      });

      try {
        const result = await invoke<{
          doc_id: string;
          filename: string;
          chunk_count: number;
          page_count: number;
          ocr_applied: boolean;
        }>("ingest_pdf", { docId, filepath, filename });

        onJobUpdate({
          docId,
          filename,
          stage: "Done",
          current: result.chunk_count,
          total: result.chunk_count,
          status: "done",
          chunkCount: result.chunk_count,
        });
      } catch (err) {
        onJobUpdate({
          docId,
          filename,
          stage: "Error",
          current: 0,
          total: 1,
          status: "error",
          errorMessage: String(err),
        });
      }
    },
    [onJobUpdate]
  );

  useEffect(() => {
    if (!inTauri) return;

    // Listen to Tauri progress events to update the job
    const unlistenProgress = listen<{
      doc_id: string;
      stage: string;
      current: number;
      total: number;
    }>("ingest:progress", (event) => {
      const { doc_id, stage, current, total } = event.payload;
      onJobUpdate({
        docId: doc_id,
        filename: "",
        stage,
        current,
        total,
        status: "running",
      });
    });

    // Tauri 2 file drop event
    const unlistenDrop = listen<TauriDropPayload>("tauri://drag-drop", (event) => {
      setIsDraggingOver(false);
      const paths = event.payload.paths ?? [];
      for (const p of paths) {
        ingestFile(p);
      }
    });

    const unlistenEnter = listen("tauri://drag-enter", () => setIsDraggingOver(true));
    const unlistenLeave = listen("tauri://drag-leave", () => setIsDraggingOver(false));

    return () => {
      unlistenProgress.then((f) => f());
      unlistenDrop.then((f) => f());
      unlistenEnter.then((f) => f());
      unlistenLeave.then((f) => f());
    };
  }, [ingestFile, onJobUpdate]);

  async function handlePickFile() {
    if (!inTauri) return;
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
      ingestFile(p);
    }
  }

  // Drag overlay shown when a file is dragged over the Tauri window
  if (isDraggingOver && inTauri) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none">
        <div className="flex flex-col items-center gap-3 text-primary">
          <Upload className="w-12 h-12" />
          <p className="text-lg font-semibold">Drop PDF to ingest</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handlePickFile}
      title="Add PDF"
      className="hidden"
      id="drop-zone-trigger"
    />
  );
}
