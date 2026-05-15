import { create } from "zustand";
import type { ChunkResult, Category, WebResult } from "@/lib/db";
import { type AppSettings, DEFAULTS } from "@/lib/settings";

export interface Chat {
  id: string;
  title: string;
  category_id: string | null;
  // snake_case mirrors Rust/DB; components read both forms via helpers
  categoryId?: string | null;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
  pinned: boolean;
  archived: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  chatId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_used: string;
  modelUsed?: string;
  created_at: string;
  createdAt?: string;
  isStreaming?: boolean;
}

export interface OllamaModel {
  name: string;
  size: number;
  family: string;
}

interface AppState {
  // Sidebar
  activeChatId: string | null;
  chats: Chat[];
  chatsLoaded: boolean;
  setActiveChatId: (id: string | null) => void;
  setChats: (chats: Chat[]) => void;
  setChatsLoaded: (v: boolean) => void;
  upsertChat: (chat: Chat) => void;
  removeChat: (id: string) => void;

  // Messages
  messages: Record<string, Message[]>;
  messagesLoaded: Record<string, boolean>;
  setMessages: (chatId: string, messages: Message[]) => void;
  setMessagesLoaded: (chatId: string) => void;
  appendMessage: (chatId: string, message: Message) => void;
  updateStreamingMessage: (chatId: string, messageId: string, delta: string) => void;
  finalizeMessage: (chatId: string, messageId: string) => void;

  // Models
  availableModels: OllamaModel[];
  setAvailableModels: (models: OllamaModel[]) => void;

  // Memory Manager
  memoryFacts: import("@/lib/db").MemoryFact[];
  memoryLoaded: boolean;
  setMemoryFacts: (facts: import("@/lib/db").MemoryFact[]) => void;
  setMemoryLoaded: (v: boolean) => void;
  upsertMemoryFact: (fact: import("@/lib/db").MemoryFact) => void;
  removeMemoryFact: (id: string) => void;
  memoryManagerOpen: boolean;
  setMemoryManagerOpen: (open: boolean) => void;

  // Citations: messageId → chunks used for that turn
  citations: Record<string, ChunkResult[]>;
  setCitations: (messageId: string, chunks: ChunkResult[]) => void;
  activeCitationMessageId: string | null;
  setActiveCitationMessageId: (id: string | null) => void;

  // Web citations: messageId → web results for that turn
  webCitations: Record<string, WebResult[]>;
  setWebCitations: (messageId: string, results: WebResult[]) => void;

  // Right rail
  rightRailOpen: boolean;
  setRightRailOpen: (open: boolean) => void;

  // Search palette
  searchPaletteOpen: boolean;
  setSearchPaletteOpen: (open: boolean) => void;

  // Graph view
  graphOpen: boolean;
  setGraphOpen: (open: boolean) => void;

  // Settings
  settings: AppSettings;
  settingsLoaded: boolean;
  setSettings: (s: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  settingsPanelOpen: boolean;
  setSettingsPanelOpen: (open: boolean) => void;

  // Categories
  categories: Category[];
  categoriesLoaded: boolean;
  setCategories: (cats: Category[]) => void;
  setCategoriesLoaded: (v: boolean) => void;
  upsertCategory: (cat: Category) => void;
  removeCategory: (id: string) => void;

  // Category suggestion toast
  pendingSuggestion: { chatId: string; suggestion: string } | null;
  setPendingSuggestion: (v: { chatId: string; suggestion: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeChatId: null,
  chats: [],
  chatsLoaded: false,
  setActiveChatId: (id) => set({ activeChatId: id }),
  setChats: (chats) => set({ chats }),
  setChatsLoaded: (v) => set({ chatsLoaded: v }),
  upsertChat: (chat) =>
    set((s) => {
      const idx = s.chats.findIndex((c) => c.id === chat.id);
      if (idx === -1) return { chats: [chat, ...s.chats] };
      const next = [...s.chats];
      next[idx] = { ...next[idx], ...chat };
      return { chats: next };
    }),
  removeChat: (id) =>
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id) })),

  messages: {},
  messagesLoaded: {},
  setMessages: (chatId, messages) =>
    set((s) => ({ messages: { ...s.messages, [chatId]: messages } })),
  setMessagesLoaded: (chatId) =>
    set((s) => ({ messagesLoaded: { ...s.messagesLoaded, [chatId]: true } })),
  appendMessage: (chatId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: [...(s.messages[chatId] ?? []), message],
      },
    })),
  updateStreamingMessage: (chatId, messageId, delta) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + delta } : m
        ),
      },
    })),
  finalizeMessage: (chatId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, isStreaming: false } : m
        ),
      },
    })),

  availableModels: [],
  setAvailableModels: (models) => set({ availableModels: models }),

  memoryFacts: [],
  memoryLoaded: false,
  setMemoryFacts: (facts) => set({ memoryFacts: facts }),
  setMemoryLoaded: (v) => set({ memoryLoaded: v }),
  upsertMemoryFact: (fact) =>
    set((s) => {
      const idx = s.memoryFacts.findIndex((f) => f.id === fact.id);
      if (idx === -1) return { memoryFacts: [fact, ...s.memoryFacts] };
      const next = [...s.memoryFacts];
      next[idx] = fact;
      return { memoryFacts: next };
    }),
  removeMemoryFact: (id) =>
    set((s) => ({ memoryFacts: s.memoryFacts.filter((f) => f.id !== id) })),
  memoryManagerOpen: false,
  setMemoryManagerOpen: (open) => set({ memoryManagerOpen: open }),

  citations: {},
  setCitations: (messageId, chunks) =>
    set((s) => ({ citations: { ...s.citations, [messageId]: chunks } })),
  activeCitationMessageId: null,
  setActiveCitationMessageId: (id) => set({ activeCitationMessageId: id }),

  webCitations: {},
  setWebCitations: (messageId, results) =>
    set((s) => ({ webCitations: { ...s.webCitations, [messageId]: results } })),

  rightRailOpen: true,
  setRightRailOpen: (open) => set({ rightRailOpen: open }),

  searchPaletteOpen: false,
  setSearchPaletteOpen: (open) => set({ searchPaletteOpen: open }),

  graphOpen: false,
  setGraphOpen: (open) => set({ graphOpen: open }),

  settings: { ...DEFAULTS },
  settingsLoaded: false,
  setSettings: (s) => set({ settings: s, settingsLoaded: true }),
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
  settingsPanelOpen: false,
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),

  categories: [],
  categoriesLoaded: false,
  setCategories: (cats) => set({ categories: cats }),
  setCategoriesLoaded: (v) => set({ categoriesLoaded: v }),
  upsertCategory: (cat) =>
    set((s) => {
      const idx = s.categories.findIndex((c) => c.id === cat.id);
      if (idx === -1) return { categories: [...s.categories, cat] };
      const next = [...s.categories];
      next[idx] = cat;
      return { categories: next };
    }),
  removeCategory: (id) =>
    set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),

  pendingSuggestion: null,
  setPendingSuggestion: (v) => set({ pendingSuggestion: v }),
}));
