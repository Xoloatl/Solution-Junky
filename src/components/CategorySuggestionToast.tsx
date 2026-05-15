import { useEffect, useRef, useState } from "react";
import { Tag, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import * as db from "@/lib/db";
import { categoryColor } from "@/lib/categoryColors";

export function CategorySuggestionToast() {
  const {
    pendingSuggestion,
    setPendingSuggestion,
    upsertCategory,
    upsertChat,
    chats,
    categories,
  } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingSuggestion) {
      setEditing(false);
      setEditValue(pendingSuggestion.suggestion);
    }
  }, [pendingSuggestion]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!pendingSuggestion) return null;

  const { chatId, suggestion } = pendingSuggestion;
  const label = editing ? editValue : suggestion;
  const color = categoryColor(label);

  async function handleAccept() {
    const name = label.trim();
    if (!name) return;

    // Reuse existing category with same name (case-insensitive), or create new
    let cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      cat = await db.createCategory({
        id: crypto.randomUUID(),
        name,
        color,
        auto_generated: true,
      });
      upsertCategory(cat);
    }

    await db.assignChatCategory(chatId, cat.id);
    const chat = chats.find((c) => c.id === chatId);
    if (chat) upsertChat({ ...chat, category_id: cat.id });

    setPendingSuggestion(null);
  }

  function handleDismiss() {
    setPendingSuggestion(null);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-border bg-popover shadow-xl p-3 flex flex-col gap-2.5 animate-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold text-foreground flex-1">
          Suggested category
        </span>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAccept();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
        />
      ) : (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted">
          <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground flex-1 truncate">
            {label}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className={cn("h-7 text-xs flex-1 gap-1.5")}
          onClick={handleAccept}
        >
          <Check className="w-3 h-3" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={handleDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
