import { useEffect, useRef, useState, useCallback } from "react";
import { Search, MessageSquare, FileText, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { globalSearch, type SearchResult } from "@/lib/db";

function Highlight({ html }: { html: string }) {
  return (
    <span
      className="[&_b]:font-semibold [&_b]:text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ResultRow({
  result,
  active,
  onSelect,
}: {
  result: SearchResult;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-start gap-2.5 rounded-md transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        {result.kind === "message" ? (
          <MessageSquare className="w-3.5 h-3.5" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">
          {result.kind === "message"
            ? (result.chat_title ?? "Untitled Chat")
            : `${result.filename ?? "Document"}${result.page_number != null ? ` · p${result.page_number}` : ""}`}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
          <Highlight html={result.snippet} />
        </p>
      </div>
    </button>
  );
}

export function SearchPalette() {
  const { searchPaletteOpen, setSearchPaletteOpen, setActiveChatId } = useAppStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (searchPaletteOpen) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchPaletteOpen]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await globalSearch(trimmed);
      setResults(res);
      setActiveIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 220);
  }

  function handleSelect(result: SearchResult) {
    if (result.kind === "message" && result.chat_id) {
      setActiveChatId(result.chat_id);
    }
    setSearchPaletteOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[activeIdx]) handleSelect(results[activeIdx]);
    } else if (e.key === "Escape") {
      setSearchPaletteOpen(false);
    }
  }

  return (
    <Dialog.Root open={searchPaletteOpen} onOpenChange={setSearchPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[20vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-border bg-popover shadow-2xl outline-none"
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title className="sr-only">Global Search</Dialog.Title>

          {/* Input row */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              placeholder="Search chats and documents…"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">searching…</span>
            )}
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 && query.trim().length >= 2 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-6">No results</p>
            )}
            {results.length === 0 && query.trim().length < 2 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Type at least 2 characters to search
              </p>
            )}
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                active={i === activeIdx}
                onSelect={() => handleSelect(r)}
              />
            ))}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
            <span><kbd className="font-mono bg-muted px-1 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> open</span>
            <span><kbd className="font-mono bg-muted px-1 rounded">esc</kbd> close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
