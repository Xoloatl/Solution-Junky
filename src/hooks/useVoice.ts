import { useCallback, useEffect, useRef, useState } from "react";

// Browser type augmentation for webkit-prefixed Speech API
declare global {
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }
  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
    onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
    onerror: ((this: SpeechRecognition, ev: Event) => unknown) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  }
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export type VoiceState = "idle" | "listening" | "processing";

interface UseVoiceOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export function useSTT({ onTranscript, lang = "en-US" }: UseVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const supported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported || state !== "idle") return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;

    rec.onstart = () => setState("listening");

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const result = e.results[e.results.length - 1];
      if (result.isFinal) {
        setState("processing");
        onTranscript(result[0].transcript.trim());
      }
    };

    rec.onend = () => setState("idle");
    rec.onerror = () => setState("idle");

    recognitionRef.current = rec;
    rec.start();
  }, [supported, state, lang, onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { state, start, stop, supported };
}

// ── Text-to-Speech ─────────────────────────────────────────────────────────────

export type TTSState = "idle" | "speaking";

export function useTTS() {
  const [state, setState] = useState<TTSState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback((text: string, rate = 1.0) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const clean = stripMarkdown(text);
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = rate;
    utt.pitch = 1.0;
    utt.onstart = () => setState("speaking");
    utt.onend = () => setState("idle");
    utt.onerror = () => setState("idle");
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [supported]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  return { state, speak: speak as (text: string, rate?: number) => void, stop, supported };
}

// Strips common markdown syntax before passing to TTS so it doesn't read
// asterisks, backticks, brackets, etc. aloud.
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "code block")     // fenced code blocks → "code block"
    .replace(/`[^`]+`/g, "")                      // inline code
    .replace(/#{1,6}\s+/g, "")                    // headings (# followed by space)
    .replace(/\*\*(.+?)\*\*/g, "$1")              // bold
    .replace(/\*(.+?)\*/g, "$1")                  // italic
    .replace(/__(.+?)__/g, "$1")                  // bold alt
    .replace(/_(.+?)_/g, "$1")                    // italic alt
    .replace(/\[(\d+)\]/g, "")                    // citation markers [1]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // markdown links [text](url)
    .replace(/https?:\/\/\S+/g, "link")           // bare URLs → "link"
    .replace(/www\.\S+/g, "link")                 // www URLs → "link"
    .replace(/^\s*[-*+]\s/gm, "")                 // list bullets
    .replace(/^\s*\d+\.\s/gm, "")                 // ordered lists
    .replace(/^>\s*/gm, "")                       // blockquotes
    .replace(/\n{2,}/g, ". ")                     // double newlines → pause
    .replace(/\n/g, " ")
    .trim();
}
