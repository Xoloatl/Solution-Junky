import { invoke } from "@tauri-apps/api/core";
import type { Chat, Message } from "@/store";

export const inTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

// ── Types mirroring Rust structs ──────────────────────────────────────────────

interface CreateChatArgs {
  id: string;
  title: string;
  created_at: string;
}

interface SaveMessageArgs {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  model_used: string;
  created_at: string;
}
export interface ChatMessage {
  role: string;
  content: string;
}

export interface AiTokens {
  prompt?: number;
  completion?: number;
  total?: number;
}

export interface ChatCompletionResponse {
  content: string;
  model_used: string;
  tokens?: AiTokens;
}

export interface OllamaModel {
  name: string;
  size: number;
  details?: { family?: string };
}

export async function getModels(): Promise<OllamaModel[]> {
  if (!inTauri) return [];
  return invoke<OllamaModel[]>("get_models");
}

export async function chatCompletion(
  messages: ChatMessage[],
): Promise<ChatCompletionResponse> {
  if (!inTauri) {
    return { content: "", model_used: "", tokens: undefined };
  }
  return invoke<ChatCompletionResponse>("chat_completion", { messages });
}
// ── Chat ──────────────────────────────────────────────────────────────────────

export async function listChats(): Promise<Chat[]> {
  if (!inTauri) return [];
  return invoke<Chat[]>("list_chats");
}

export async function createChat(args: CreateChatArgs): Promise<Chat> {
  if (!inTauri) {
    const now = args.created_at;
    return {
      id: args.id, title: args.title, category_id: null,
      created_at: now, updated_at: now, pinned: false, archived: false,
    };
  }
  return invoke<Chat>("create_chat", { args });
}

export async function updateChatTitle(chatId: string, title: string): Promise<void> {
  if (!inTauri) return;
  return invoke("update_chat_title", { chatId, title, updatedAt: new Date().toISOString() });
}

export async function touchChat(chatId: string): Promise<void> {
  if (!inTauri) return;
  return invoke("touch_chat", { chatId, updatedAt: new Date().toISOString() });
}

export async function pinChat(chatId: string, pinned: boolean): Promise<void> {
  if (!inTauri) return;
  return invoke("pin_chat", { chatId, pinned });
}

export async function archiveChat(chatId: string): Promise<void> {
  if (!inTauri) return;
  return invoke("archive_chat", { chatId });
}

export async function deleteChat(chatId: string): Promise<void> {
  if (!inTauri) return;
  return invoke("delete_chat", { chatId });
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(chatId: string): Promise<Message[]> {
  if (!inTauri) return [];
  const rows = await invoke<Message[]>("get_messages", { chatId });
  return rows.map((m) => ({ ...m, chatId: m.chat_id ?? m.chatId }));
}

export async function saveMessage(args: SaveMessageArgs): Promise<Message> {
  if (!inTauri) {
    return {
      id: args.id, chat_id: args.chat_id, chatId: args.chat_id,
      role: args.role as Message["role"], content: args.content,
      model_used: args.model_used, created_at: args.created_at,
    };
  }
  const row = await invoke<Message>("save_message", { args });
  return { ...row, chatId: row.chat_id ?? row.chatId };
}

export async function updateMessageContent(messageId: string, content: string): Promise<void> {
  if (!inTauri) return;
  return invoke("update_message_content", { messageId, content });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface DbDocument {
  id: string;
  filename: string;
  filepath: string;
  page_count: number | null;
  ocr_applied: boolean;
  uploaded_at: string;
  category_id: string | null;
}

export interface IngestComplete {
  doc_id: string;
  filename: string;
  chunk_count: number;
  page_count: number;
  ocr_applied: boolean;
}

export async function listDocuments(): Promise<DbDocument[]> {
  if (!inTauri) return [];
  return invoke<DbDocument[]>("list_documents");
}

export async function ingestFile(
  docId: string,
  filepath: string,
  filename: string
): Promise<IngestComplete> {
  return invoke<IngestComplete>("ingest_file", { docId, filepath, filename });
}

export async function ingestPdf(
  docId: string,
  filepath: string,
  filename: string
): Promise<IngestComplete> {
  return ingestFile(docId, filepath, filename);
}

// ── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryFact {
  id: string;
  fact: string;
  source_chat_id: string | null;
  confidence: number;
  category_tags: string | null;
  created_at: string;
  last_referenced_at: string | null;
  user_pinned: boolean;
  user_disabled: boolean;
}

export async function extractMemory(chatId: string, model: string): Promise<number> {
  if (!inTauri) return 0;
  return invoke<number>("extract_memory", { chatId, model });
}

export async function getRelevantMemory(query: string, topK = 8): Promise<MemoryFact[]> {
  if (!inTauri) return [];
  return invoke<MemoryFact[]>("get_relevant_memory", { query, topK });
}

export async function listMemoryFacts(): Promise<MemoryFact[]> {
  if (!inTauri) return [];
  return invoke<MemoryFact[]>("list_memory_facts");
}

export async function updateMemoryFact(args: {
  id: string;
  fact?: string;
  user_pinned?: boolean;
  user_disabled?: boolean;
}): Promise<void> {
  if (!inTauri) return;
  return invoke("update_memory_fact", { args });
}

export async function deleteMemoryFact(id: string): Promise<void> {
  if (!inTauri) return;
  return invoke("delete_memory_fact", { id });
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export interface ChunkResult {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number;
  content: string;
  rrf_score: number;
  citation_index: number;
}

export async function retrieveChunks(query: string): Promise<ChunkResult[]> {
  if (!inTauri) return [];
  return invoke<ChunkResult[]>("retrieve_chunks", { query });
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  auto_generated: boolean;
}

export async function listCategories(): Promise<Category[]> {
  if (!inTauri) return [];
  return invoke<Category[]>("list_categories");
}

export async function createCategory(args: {
  id: string;
  name: string;
  color?: string;
  auto_generated: boolean;
}): Promise<Category> {
  if (!inTauri) {
    return { id: args.id, name: args.name, color: args.color ?? null, icon: null, auto_generated: args.auto_generated };
  }
  return invoke<Category>("create_category", { args });
}

export async function deleteCategory(id: string): Promise<void> {
  if (!inTauri) return;
  return invoke("delete_category", { id });
}

export async function assignChatCategory(chatId: string, categoryId: string | null): Promise<void> {
  if (!inTauri) return;
  return invoke("assign_chat_category", { chatId, categoryId });
}

export async function suggestChatCategory(chatId: string, model: string): Promise<string | null> {
  if (!inTauri) return null;
  return invoke<string | null>("suggest_chat_category", { chatId, model });
}

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  node_type: "chat" | "document" | "concept" | "category";
  ref_id: string;
  label: string;
  metadata_json: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraph(): Promise<GraphData> {
  if (!inTauri) return { nodes: [], edges: [] };
  return invoke<GraphData>("get_graph");
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: "message" | "chunk";
  id: string;
  chat_id: string | null;
  chat_title: string | null;
  document_id: string | null;
  filename: string | null;
  page_number: number | null;
  snippet: string;
  score: number;
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!inTauri) return [];
  return invoke<SearchResult[]>("global_search", { query });
}

// ── Web search ────────────────────────────────────────────────────────────────

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
  citation_index: number;
}

export async function webSearch(baseUrl: string, query: string): Promise<WebResult[]> {
  if (!inTauri) return [];
  return invoke<WebResult[]>("web_search", { baseUrl, query });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function deriveTitle(firstUserMessage: string): string {
  const clean = firstUserMessage.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}
