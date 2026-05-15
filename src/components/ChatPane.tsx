import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import { Send, Square, Bot, User, Mic, MicOff, Volume2, VolumeX, Globe, Volume, Network, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/ModelSelector";
import { MessageContent } from "@/components/MessageContent";
import { cn } from "@/lib/utils";
import { useAppStore, type Message } from "@/store";
import * as db from "@/lib/db";
import { invoke } from "@tauri-apps/api/core";
import { buildContextPrompt, buildMemoryPrompt, buildWebPrompt } from "@/lib/rag";
import { useSTT, useTTS } from "@/hooks/useVoice";
import { webSearch } from "@/lib/db";
import type { ChunkResult, MemoryFact, WebResult } from "@/lib/db";

function MessageBubble({
  message,
  chunks,
  onSpeak,
  isSpeaking,
}: {
  message: Message;
  chunks: ChunkResult[];
  onSpeak?: (content: string) => void;
  isSpeaking?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 px-4 py-3 group", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex items-start justify-center w-7 h-7 rounded-full shrink-0 mt-0.5",
          isUser ? "bg-primary/20" : "bg-muted"
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 mt-1.5 text-primary" />
        ) : (
          <Bot className="w-3.5 h-3.5 mt-1.5 text-muted-foreground" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary/10 text-foreground rounded-tr-sm"
            : "bg-card text-foreground rounded-tl-sm"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MessageContent
            content={message.content}
            chunks={chunks}
            isStreaming={message.isStreaming}
          />
        )}
        <div
          className={cn(
            "flex items-center gap-2 text-[10px] mt-1.5 text-muted-foreground/50",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          {!isUser && (message.model_used || message.modelUsed) && (
            <span>{message.model_used || message.modelUsed}</span>
          )}
          {!isUser && !message.isStreaming && onSpeak && (
            <button
              onClick={() => onSpeak(message.content)}
              title={isSpeaking ? "Stop speaking" : "Read aloud"}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
            >
              {isSpeaking ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPane() {
  const {
    activeChatId, messages, messagesLoaded,
    setMessages, setMessagesLoaded, appendMessage, updateStreamingMessage,
    finalizeMessage, upsertChat, chats, citations, setCitations,
    setActiveCitationMessageId, setPendingSuggestion, settings,
    setGraphOpen, setSettingsPanelOpen, setWebCitations,
  } = useAppStore();

  const [webSearchActive, setWebSearchActive] = useState(settings.web_search_enabled);

  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sentenceBufferRef = useRef<string>("");
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state: sttState, start: startListening, stop: stopListening, supported: sttSupported } =
    useSTT({
      onTranscript: useCallback((text: string) => {
        setInput((prev) => (prev ? prev + " " + text : text));
      }, []),
      lang: settings.voice_stt_lang,
    });

  const { state: ttsState, speak, stop: stopSpeaking, supported: ttsSupported } = useTTS();

  function handleSpeak(msgId: string, content: string) {
    if (ttsState === "speaking" && speakingMsgId === msgId) {
      stopSpeaking();
      setSpeakingMsgId(null);
    } else {
      setSpeakingMsgId(msgId);
      speak(content, settings.voice_tts_rate);
    }
  }

  function processQueue() {
    if (isSpeakingRef.current) return;
    if (speechQueueRef.current.length === 0) return;
    const sentence = speechQueueRef.current.shift();
    if (!sentence) return;

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.onend = () => {
      isSpeakingRef.current = false;
      processQueue();
    };
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      processQueue();
    };

    isSpeakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  }

  // Sync auto-speak setting from app settings
  useEffect(() => {
    setAutoSpeakEnabled(settings.voice_tts_auto_speak);
  }, [settings.voice_tts_auto_speak]);

  // Clear speakingMsgId when TTS finishes
  useEffect(() => {
    if (ttsState === "idle") setSpeakingMsgId(null);
  }, [ttsState]);

  const chatMessages = activeChatId ? (messages[activeChatId] ?? []) : [];
  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    if (!activeChatId || messagesLoaded[activeChatId]) return;
    db.getMessages(activeChatId).then((rows) => {
      setMessages(activeChatId, rows);
      setMessagesLoaded(activeChatId);
    });
  }, [activeChatId, messagesLoaded, setMessages, setMessagesLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, chatMessages[chatMessages.length - 1]?.content]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    if (!input.trim() || !activeChatId || isGenerating) return;

    // Stop any currently playing speech and clear the queue when starting a new message
    if (ttsState === "speaking") {
      stopSpeaking();
    }
    window.speechSynthesis.cancel();
    speechQueueRef.current = [];
    isSpeakingRef.current = false;
    sentenceBufferRef.current = "";

    const now = new Date().toISOString();
    const userContent = input.trim();
    setInput("");

    // Retrieve relevant chunks, memory facts, and (optionally) web results in parallel
    const [retrievedChunks, memoryFacts, webResults] = await Promise.all([
      db.retrieveChunks(userContent).catch(() => [] as ChunkResult[]),
      db.getRelevantMemory(userContent).catch(() => [] as MemoryFact[]),
      webSearchActive
        ? webSearch(settings.searxng_url, userContent).catch(() => [] as WebResult[])
        : Promise.resolve([] as WebResult[]),
    ]);
    const contextPrompt =
      buildMemoryPrompt(memoryFacts) +
      buildContextPrompt(retrievedChunks) +
      buildWebPrompt(webResults);

    // Persist user message
    const userMsg = await db.saveMessage({
      id: crypto.randomUUID(),
      chat_id: activeChatId,
      role: "user",
      content: userContent,
      model_used: "",
      created_at: now,
    });
    appendMessage(activeChatId, userMsg);

    // Auto-title on first message
    const isFirst = chatMessages.length === 0;
    if (isFirst && activeChat?.title === "New Chat") {
      const title = db.deriveTitle(userContent);
      await db.updateChatTitle(activeChatId, title);
      upsertChat({ ...activeChat, title });
    }

    const assistantId = crypto.randomUUID();
    const assistantCreatedAt = new Date().toISOString();
    appendMessage(activeChatId, {
      id: assistantId,
      chat_id: activeChatId,
      role: "assistant",
      content: "",
      model_used: settings.chat_model,
      created_at: assistantCreatedAt,
      isStreaming: true,
    });

    // Store citations for this assistant turn
    if (retrievedChunks.length > 0) {
      setCitations(assistantId, retrievedChunks);
      setActiveCitationMessageId(assistantId);
    }
    if (webResults.length > 0) {
      setWebCitations(assistantId, webResults);
      setActiveCitationMessageId(assistantId);
    }

    setIsGenerating(true);
    abortRef.current = new AbortController();
    let finalContent = "";
    
    // Clear sentence buffer for streaming TTS
    sentenceBufferRef.current = "";

    try {
      // Build message history with context system prompt injected at the front
      // First: ask the backend for relevant memory facts to inject
      let tauriMemoryFacts: { fact: string }[] = [];
      try {
        // call Tauri command; if it fails, fall back to empty list
        // note: use `limit` as the parameter name expected by the Rust command
        // (we request up to 10 facts)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tauriMemoryFacts = (await invoke<any>("get_relevant_memory", { query: userContent, limit: 10 })) ?? [];
      } catch {
        tauriMemoryFacts = [];
      }

      const history: { role: string; content: string }[] = [];

      if (tauriMemoryFacts.length > 0) {
        const sys =
          "You are a helpful assistant. Here is what you know about the user, use these facts naturally in conversation:\n" +
          tauriMemoryFacts.map((f) => "- " + f.fact).join("\n");
        history.push({ role: "system", content: sys });
      }

      if (contextPrompt) {
        history.push({ role: "system", content: contextPrompt });
      }

      for (const m of chatMessages) {
        history.push({ role: m.role, content: m.content });
      }
      history.push({ role: "user", content: userContent });

      // Log history for verification before sending to Ollama
      // eslint-disable-next-line no-console
      console.log(history);

      const res = await fetch(`${settings.ollama_url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.chat_model, messages: history, stream: true }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const chunk = JSON.parse(line) as { message?: { content?: string } };
            if (chunk.message?.content) {
              finalContent += chunk.message.content;
              updateStreamingMessage(activeChatId, assistantId, chunk.message.content);

              // Streaming TTS: queue complete sentences and play them sequentially
              if (autoSpeakEnabled && ttsSupported) {
                sentenceBufferRef.current += chunk.message.content;

                let sentenceMatch = sentenceBufferRef.current.match(/[.!?]\s/);
                while (sentenceMatch) {
                  const endIndex = sentenceMatch.index! + sentenceMatch[0].length;
                  const sentenceToSpeak = sentenceBufferRef.current.substring(0, endIndex).trim();
                  sentenceBufferRef.current = sentenceBufferRef.current.substring(endIndex).trim();
                  if (sentenceToSpeak) {
                    speechQueueRef.current.push(sentenceToSpeak);
                  }
                  sentenceMatch = sentenceBufferRef.current.match(/[.!?]\s/);
                }
                processQueue();
              }
            }
          } catch {
            // malformed chunk
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const errText = "\n\n_Error: could not reach Ollama._";
        finalContent += errText;
        updateStreamingMessage(activeChatId, assistantId, errText);
      }
    } finally {
      finalizeMessage(activeChatId, assistantId);
      setIsGenerating(false);
      abortRef.current = null;
      await db.saveMessage({
        id: assistantId,
        chat_id: activeChatId,
        role: "assistant",
        content: finalContent,
        model_used: settings.chat_model,
        created_at: assistantCreatedAt,
      });

      // Queue any remaining buffered text once streaming ends
      if (autoSpeakEnabled && ttsSupported && sentenceBufferRef.current.trim()) {
        speechQueueRef.current.push(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = "";
        processQueue();
      }

      // Schedule memory extraction after 5 min of idle (if enabled)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const chatIdSnapshot = activeChatId;
      const modelSnapshot = settings.chat_model;
      if (settings.memory_auto_extract) {
        idleTimerRef.current = setTimeout(() => {
          db.extractMemory(chatIdSnapshot, modelSnapshot).catch(() => {});
        }, 5 * 60 * 1000);
      }

      // Suggest category on first assistant response if enabled and chat has none
      const currentChat = chats.find((c) => c.id === chatIdSnapshot);
      if (isFirst && !currentChat?.category_id && settings.category_auto_suggest) {
        db.suggestChatCategory(chatIdSnapshot, modelSnapshot)
          .then((suggestion) => {
            if (suggestion) setPendingSuggestion({ chatId: chatIdSnapshot, suggestion });
          })
          .catch(() => {});
      }
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  if (!activeChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Bot className="w-12 h-12 opacity-20" />
        <p className="text-sm">Select a chat or create a new one</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <div className="flex items-center justify-between pl-4 pr-4 py-2.5 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground truncate">
          {activeChat?.title || "New Chat"}
        </span>
        <div className="flex items-center gap-2">
          {ttsSupported && (
            <Button
              size="icon"
              variant="ghost"
              onClick={async () => {
                const newState = !autoSpeakEnabled;
                setAutoSpeakEnabled(newState);
                await import("@/lib/settings").then((m) =>
                  m.saveSetting("voice_tts_auto_speak", String(newState))
                );
              }}
              title={autoSpeakEnabled ? "Auto-speak on — click to disable" : "Enable auto-speak"}
              className={cn(
                "h-8 w-8 transition-colors",
                autoSpeakEnabled
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {autoSpeakEnabled ? (
                <Volume className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setGraphOpen(true)}
            title="Open knowledge graph"
            className="h-8 w-8"
          >
            <Network className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSettingsPanelOpen(true)}
            title="Open settings"
            className="h-8 w-8"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {chatMessages.length === 0 && messagesLoaded[activeChatId] && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
              <Bot className="w-8 h-8 opacity-30" />
              <p className="text-xs">Start a conversation</p>
            </div>
          )}
          {chatMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              chunks={msg.role === "assistant" ? (citations[msg.id] ?? []) : []}
              onSpeak={ttsSupported ? (content) => handleSpeak(msg.id, content) : undefined}
              isSpeaking={speakingMsgId === msg.id}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-end gap-2 bg-card rounded-xl border border-border px-3 py-2">
          <ModelSelector />
          {sttSupported && (
            <Button
              size="icon"
              variant="ghost"
              onClick={sttState === "listening" ? stopListening : startListening}
              title={sttState === "listening" ? "Stop recording" : "Speak your message"}
              className={cn(
                "h-8 w-8 shrink-0 transition-colors",
                sttState === "listening" && "text-destructive animate-pulse"
              )}
            >
              {sttState === "listening" ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setWebSearchActive((v) => !v)}
            title={webSearchActive ? "Web search on — click to disable" : "Enable web search (requires SearXNG)"}
            className={cn(
              "h-8 w-8 shrink-0 transition-colors",
              webSearchActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Globe className="w-4 h-4" />
          </Button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sttState === "listening" ? "Listening…" : "Message… (Shift+Enter for newline)"}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
              "outline-none resize-none max-h-40 leading-relaxed"
            )}
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${t.scrollHeight}px`;
            }}
          />
          {isGenerating ? (
            <Button size="icon" variant="ghost" onClick={handleStop} className="h-8 w-8 shrink-0">
              <Square className="w-4 h-4 text-destructive" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-8 w-8 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
          All inference is local via Ollama
        </p>
      </div>
    </div>
  );
}
