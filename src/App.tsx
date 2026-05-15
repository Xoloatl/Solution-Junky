import { useCallback, useEffect, useState } from "react";
import { PanelRight, FilePlus, Network, Settings } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ChatPane } from "@/components/ChatPane";
import { RightRail } from "@/components/RightRail";
import { DropZone } from "@/components/DropZone";
import { IngestToastStack, type IngestJob } from "@/components/IngestToast";
import { SearchPalette } from "@/components/SearchPalette";
import { CategorySuggestionToast } from "@/components/CategorySuggestionToast";
import { GraphView } from "@/components/GraphView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";

export default function App() {
  const {
    rightRailOpen, setRightRailOpen, setSearchPaletteOpen, setGraphOpen,
    setSettingsPanelOpen, setSettings, settingsLoaded,
  } = useAppStore();

  // Load settings once on mount
  useEffect(() => {
    if (settingsLoaded) return;
    import("@/lib/settings").then(({ loadSettings }) =>
      loadSettings().then(setSettings)
    );
  }, [settingsLoaded, setSettings]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsPanelOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSearchPaletteOpen, setSettingsPanelOpen]);
  const [ingestJobs, setIngestJobs] = useState<IngestJob[]>([]);

  const handleJobUpdate = useCallback((update: IngestJob) => {
    setIngestJobs((prev) => {
      const idx = prev.findIndex((j) => j.docId === update.docId);
      if (idx === -1) return [...prev, update];
      const next = [...prev];
      // Preserve filename if the progress event didn't include it
      next[idx] = {
        ...next[idx],
        ...update,
        filename: update.filename || next[idx].filename,
      };
      return next;
    });
  }, []);

  const handleDismiss = useCallback((docId: string) => {
    setIngestJobs((prev) => prev.filter((j) => j.docId !== docId));
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />

      <main className="flex flex-col flex-1 min-w-0 h-full relative">
        {/* Toolbar overlay buttons */}
        <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Add PDF"
            onClick={() => document.getElementById("drop-zone-trigger")?.click()}
          >
            <FilePlus className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Knowledge Graph"
            onClick={() => setGraphOpen(true)}
          >
            <Network className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Settings (Ctrl+,)"
            onClick={() => setSettingsPanelOpen(true)}
          >
            <Settings className="w-4 h-4" />
          </Button>
          {!rightRailOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setRightRailOpen(true)}
            >
              <PanelRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        <ChatPane />
      </main>

      <RightRail />

      {/* Invisible drop zone + file picker */}
      <DropZone onJobUpdate={handleJobUpdate} />

      {/* Progress toasts */}
      <IngestToastStack jobs={ingestJobs} onDismiss={handleDismiss} />

      {/* Search palette (Ctrl+K) */}
      <SearchPalette />

      {/* Category suggestion toast */}
      <CategorySuggestionToast />

      {/* Knowledge Graph */}
      <GraphView />

      {/* Settings */}
      <SettingsPanel />
    </div>
  );
}
