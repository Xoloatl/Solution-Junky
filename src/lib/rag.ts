import type { ChunkResult, MemoryFact, WebResult } from "./db";

/**
 * Build the system prompt prefix that injects retrieved chunks as numbered context.
 * The model is instructed to cite using [N] superscripts.
 */
export function buildContextPrompt(chunks: ChunkResult[]): string {
  if (chunks.length === 0) return "";

  const contextBlock = chunks
    .map(
      (c) =>
        `[${c.citation_index}] "${c.filename}", page ${c.page_number}:\n${c.content.trim()}`
    )
    .join("\n\n");

  return `You are a knowledgeable research assistant with access to the user's document library.
Use the context below when it is relevant to the question. When you draw on a source, cite it inline with its number in square brackets like [1] or [2].

<context>
${contextBlock}
</context>

`;
}

/**
 * Build the memory section of the system prompt from relevant facts.
 */
export function buildMemoryPrompt(facts: MemoryFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- ${f.fact}`).join("\n");
  return `Here are some things you know about the user from previous conversations:\n${lines}\n\n`;
}

/**
 * Build the web search results section of the system prompt.
 * Uses [W1], [W2] etc. to distinguish from document citations [1], [2].
 */
export function buildWebPrompt(results: WebResult[]): string {
  if (results.length === 0) return "";
  const block = results
    .map((r) => `[W${r.citation_index}] ${r.title}\nURL: ${r.url}\n${r.snippet.trim()}`)
    .join("\n\n");
  return `You also have access to the following live web search results. Cite them with [W1], [W2], etc. when relevant.

<web_results>
${block}
</web_results>

`;
}

/**
 * Parse citation markers [N] from assistant response text.
 * Returns a list of unique citation indices that appear in the text.
 */
export function parseCitations(text: string): number[] {
  const matches = text.matchAll(/\[(\d+)\]/g);
  const seen = new Set<number>();
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Replace [N] markers in text with HTML-safe superscript placeholders
 * that the CitationRenderer component can pick up.
 * We use a unique delimiter so the renderer can split on it safely.
 */
export const CITE_DELIM = "\u{E001}";

export function markCitations(text: string): string {
  return text.replace(/\[(\d+)\]/g, `${CITE_DELIM}$1${CITE_DELIM}`);
}
