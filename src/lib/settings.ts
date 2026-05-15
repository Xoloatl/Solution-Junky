import { invoke } from "@tauri-apps/api/core";

const inTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

export interface AppSettings {
  ollama_url: string;
  embedding_model: string;
  chat_model: string;
  memory_auto_extract: boolean;
  memory_min_length: number;
  category_auto_suggest: boolean;
  voice_stt_lang: string;
  voice_tts_rate: number;
  voice_tts_auto_speak: boolean;
  ocr_lang: string;
  searxng_url: string;
  web_search_enabled: boolean;
}

export const DEFAULTS: AppSettings = {
  ollama_url: "http://localhost:11434",
  embedding_model: "nomic-embed-text",
  chat_model: "llama3.2:1b",
  memory_auto_extract: true,
  memory_min_length: 100,
  category_auto_suggest: true,
  voice_stt_lang: "en-US",
  voice_tts_rate: 1.0,
  voice_tts_auto_speak: false,
  ocr_lang: "eng",
  searxng_url: "http://localhost:8888",
  web_search_enabled: false,
};

export async function loadSettings(): Promise<AppSettings> {
  if (!inTauri) return { ...DEFAULTS };
  const raw = await invoke<Record<string, string>>("get_all_settings");
  return {
    ollama_url: raw.ollama_url ?? DEFAULTS.ollama_url,
    embedding_model: raw.embedding_model ?? DEFAULTS.embedding_model,
    chat_model: raw.chat_model ?? DEFAULTS.chat_model,
    memory_auto_extract: (raw.memory_auto_extract ?? "true") === "true",
    memory_min_length: parseInt(raw.memory_min_length ?? "100", 10),
    category_auto_suggest: (raw.category_auto_suggest ?? "true") === "true",
    voice_stt_lang: raw.voice_stt_lang ?? DEFAULTS.voice_stt_lang,
    voice_tts_rate: parseFloat(raw.voice_tts_rate ?? "1.0"),
    voice_tts_auto_speak: (raw.voice_tts_auto_speak ?? "false") === "true",
    ocr_lang: raw.ocr_lang ?? DEFAULTS.ocr_lang,
    searxng_url: raw.searxng_url ?? DEFAULTS.searxng_url,
    web_search_enabled: (raw.web_search_enabled ?? "false") === "true",
  };
}

export async function saveSetting(key: keyof AppSettings, value: string): Promise<void> {
  if (!inTauri) return;
  await invoke("set_setting", { key, value });
}
