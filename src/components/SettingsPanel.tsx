import { useEffect, useState } from "react";
import { X, Server, Brain, Mic, Database, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { saveSetting, type AppSettings } from "@/lib/settings";
import { backupDatabase } from "@/lib/export";

// ── Reusable form primitives ──────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

// ── Tab sections ──────────────────────────────────────────────────────────────

function GeneralTab({ s, update }: { s: AppSettings; update: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Ollama base URL"
        hint="All inference is local via Ollama at this address."
      >
        <TextInput
          value={s.ollama_url}
          onChange={(v) => update("ollama_url", v)}
          placeholder="http://localhost:11434"
        />
      </Field>

      <Field
        label="Embedding model"
        hint="Used for semantic search and memory deduplication."
      >
        <TextInput
          value={s.embedding_model}
          onChange={(v) => update("embedding_model", v)}
          placeholder="nomic-embed-text"
        />
      </Field>

      <Field
        label="SearXNG URL"
        hint="Self-hosted SearXNG instance for web search. Enable the Globe toggle in the chat input to use it."
      >
        <TextInput
          value={s.searxng_url}
          onChange={(v) => update("searxng_url", v)}
          placeholder="http://localhost:8888"
        />
      </Field>
    </div>
  );
}

function MemoryTab({ s, update }: { s: AppSettings; update: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Auto-extract memory facts">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.memory_auto_extract}
            onChange={(v) => update("memory_auto_extract", v)}
          />
          <span className="text-xs text-muted-foreground">
            {s.memory_auto_extract ? "Enabled — facts are extracted after idle" : "Disabled"}
          </span>
        </div>
      </Field>

      <Field
        label="Minimum conversation length"
        hint="Only extract facts when the conversation exceeds this many characters."
      >
        <Slider
          value={s.memory_min_length}
          min={50}
          max={500}
          step={50}
          onChange={(v) => update("memory_min_length", v)}
        />
      </Field>

      <Field label="Auto-suggest categories">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.category_auto_suggest}
            onChange={(v) => update("category_auto_suggest", v)}
          />
          <span className="text-xs text-muted-foreground">
            {s.category_auto_suggest ? "Enabled — suggests a category after first response" : "Disabled"}
          </span>
        </div>
      </Field>
    </div>
  );
}

function VoiceTab({ s, update }: { s: AppSettings; update: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const LANGS = [
    { value: "en-US", label: "English (US)" },
    { value: "en-GB", label: "English (UK)" },
    { value: "de-DE", label: "German" },
    { value: "fr-FR", label: "French" },
    { value: "es-ES", label: "Spanish" },
    { value: "ja-JP", label: "Japanese" },
    { value: "zh-CN", label: "Chinese (Simplified)" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Field label="Speech-to-text language" hint="Language used when you speak your message.">
        <select
          value={s.voice_stt_lang}
          onChange={(e) => update("voice_stt_lang", e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        >
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Text-to-speech rate" hint="Speed of the assistant's voice (0.5 = slow, 2.0 = fast).">
        <Slider
          value={s.voice_tts_rate}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={(v) => update("voice_tts_rate", v)}
        />
      </Field>
    </div>
  );
}

function DataTab({ s, update }: { s: AppSettings; update: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const [resetting, setResetting] = useState(false);
  const [tesseract, setTesseract] = useState<boolean | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<boolean>("check_tesseract"))
      .then(setTesseract)
      .catch(() => setTesseract(false));
  }, []);

  const OCR_LANGS = [
    { value: "eng", label: "English" },
    { value: "deu", label: "German" },
    { value: "fra", label: "French" },
    { value: "spa", label: "Spanish" },
    { value: "ita", label: "Italian" },
    { value: "por", label: "Portuguese" },
    { value: "chi_sim", label: "Chinese (Simplified)" },
    { value: "jpn", label: "Japanese" },
    { value: "kor", label: "Korean" },
    { value: "ara", label: "Arabic" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* OCR section */}
      <div className="rounded-md border border-border p-3 flex flex-col gap-3">
        <p className="text-xs font-medium text-foreground">OCR (Optical Character Recognition)</p>
        <div className="flex items-center gap-2 text-xs">
          {tesseract === null ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : tesseract ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-foreground">Tesseract found — scanned PDFs will be OCR'd automatically</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span className="text-muted-foreground">
                Tesseract not found. Install via{" "}
                <code className="font-mono bg-muted px-1 rounded text-[10px]">winget install UB-Mannheim.TesseractOCR</code>
              </span>
            </>
          )}
        </div>
        {tesseract && (
          <Field label="OCR language">
            <select
              value={s.ocr_lang}
              onChange={(e) => update("ocr_lang", e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {OCR_LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Backup database" hint="Save a copy of the SQLite database to your chosen location.">
        <div>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={backupDatabase}>
            <Database className="w-3.5 h-3.5" />
            Save backup…
          </Button>
        </div>
      </Field>

      <div className="rounded-md border border-destructive/30 p-3 flex flex-col gap-3">
        <p className="text-xs font-medium text-destructive">Danger zone</p>
        <Field label="Reset all settings to defaults">
          <div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                const { saveSetting: save, DEFAULTS: D } = await import("@/lib/settings");
                await Promise.all(
                  (Object.entries(D) as [keyof typeof D, unknown][]).map(([k, v]) =>
                    save(k, String(v))
                  )
                );
                const { loadSettings } = await import("@/lib/settings");
                const fresh = await loadSettings();
                useAppStore.getState().setSettings(fresh);
                setResetting(false);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resetting ? "Resetting…" : "Reset to defaults"}
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "general", label: "General", Icon: Server },
  { id: "memory",  label: "Memory",  Icon: Brain },
  { id: "voice",   label: "Voice",   Icon: Mic },
  { id: "data",    label: "Data",    Icon: Database },
] as const;

export function SettingsPanel() {
  const { settingsPanelOpen, setSettingsPanelOpen, settings, updateSetting } = useAppStore();
  const [activeTab, setActiveTab] = useState<string>("general");

  async function handleUpdate<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSetting(key, value);
    await saveSetting(key, String(value));
  }

  return (
    <Dialog.Root open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-2xl outline-none flex flex-col max-h-[80vh]">
          <Dialog.Title className="sr-only">Settings</Dialog.Title>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-foreground">Settings</span>
            <div className="flex items-center gap-2">
              <kbd className="text-[10px] text-muted-foreground font-mono bg-muted border border-border rounded px-1.5">Ctrl+,</kbd>
              <Dialog.Close asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <X className="w-4 h-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body: sidebar tabs + content */}
          <Tabs.Root
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-1 min-h-0"
            orientation="vertical"
          >
            <Tabs.List className="flex flex-col gap-0.5 p-2 border-r border-border w-36 shrink-0">
              {TABS.map(({ id, label, Icon }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left w-full",
                    activeTab === id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-5">
              <Tabs.Content value="general" className="outline-none">
                <GeneralTab s={settings} update={handleUpdate} />
              </Tabs.Content>
              <Tabs.Content value="memory" className="outline-none">
                <MemoryTab s={settings} update={handleUpdate} />
              </Tabs.Content>
              <Tabs.Content value="voice" className="outline-none">
                <VoiceTab s={settings} update={handleUpdate} />
              </Tabs.Content>
              <Tabs.Content value="data" className="outline-none">
                <DataTab s={settings} update={handleUpdate} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
