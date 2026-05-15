import { useEffect, useState } from "react";
import { Brain, Pin, EyeOff, Trash2, Edit2, Check, X, PinOff, Eye } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import * as db from "@/lib/db";
import type { MemoryFact } from "@/lib/db";

function FactRow({ fact }: { fact: MemoryFact }) {
  const { upsertMemoryFact, removeMemoryFact } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.fact);

  async function handleSave() {
    await db.updateMemoryFact({ id: fact.id, fact: draft });
    upsertMemoryFact({ ...fact, fact: draft });
    setEditing(false);
  }

  async function handlePin() {
    await db.updateMemoryFact({ id: fact.id, user_pinned: !fact.user_pinned });
    upsertMemoryFact({ ...fact, user_pinned: !fact.user_pinned });
  }

  async function handleToggleDisable() {
    await db.updateMemoryFact({ id: fact.id, user_disabled: !fact.user_disabled });
    upsertMemoryFact({ ...fact, user_disabled: !fact.user_disabled });
  }

  async function handleDelete() {
    await db.deleteMemoryFact(fact.id);
    removeMemoryFact(fact.id);
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg border transition-colors",
        fact.user_disabled
          ? "border-border/50 bg-muted/20 opacity-50"
          : fact.user_pinned
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      )}
    >
      {/* Pin indicator */}
      {fact.user_pinned && (
        <Pin className="w-3 h-3 text-primary shrink-0 mt-1" />
      )}

      {/* Fact content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground outline-none resize-none"
            rows={2}
            autoFocus
          />
        ) : (
          <p className="text-sm text-foreground leading-relaxed">{fact.fact}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {fact.source_chat_id ? `From chat · ` : ""}
          {fact.last_referenced_at
            ? `Last used: ${new Date(Number(fact.last_referenced_at) * 1000).toLocaleDateString()}`
            : `Added: ${new Date(Number(fact.created_at) * 1000).toLocaleDateString()}`}
        </p>
      </div>

      {/* Actions */}
      <div className={cn("flex items-center gap-1 shrink-0", editing ? "" : "opacity-0 group-hover:opacity-100 transition-opacity")}>
        {editing ? (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave}>
              <Check className="w-3.5 h-3.5 text-green-500" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(false); setDraft(fact.fact); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)} title="Edit">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handlePin} title={fact.user_pinned ? "Unpin" : "Pin"}>
              {fact.user_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleToggleDisable} title={fact.user_disabled ? "Enable" : "Disable"}>
              {fact.user_disabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive" onClick={handleDelete} title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function MemoryManager() {
  const { memoryManagerOpen, setMemoryManagerOpen, memoryFacts, memoryLoaded, setMemoryFacts, setMemoryLoaded } =
    useAppStore();

  useEffect(() => {
    if (!memoryManagerOpen || memoryLoaded) return;
    db.listMemoryFacts().then((facts) => {
      setMemoryFacts(facts);
      setMemoryLoaded(true);
    });
  }, [memoryManagerOpen, memoryLoaded, setMemoryFacts, setMemoryLoaded]);

  const pinned = memoryFacts.filter((f) => f.user_pinned && !f.user_disabled);
  const active = memoryFacts.filter((f) => !f.user_pinned && !f.user_disabled);
  const disabled = memoryFacts.filter((f) => f.user_disabled);

  return (
    <Dialog.Root open={memoryManagerOpen} onOpenChange={setMemoryManagerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[80vh] flex flex-col rounded-xl border border-border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-5 py-4 shrink-0">
            <Brain className="w-4 h-4 text-primary" />
            <Dialog.Title className="text-sm font-semibold text-foreground">
              Memory
            </Dialog.Title>
            <span className="text-xs text-muted-foreground ml-1">
              {memoryFacts.filter((f) => !f.user_disabled).length} active facts
            </span>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto">
                <X className="w-3.5 h-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <Separator />

          <ScrollArea className="flex-1 px-5 py-4">
            {memoryFacts.length === 0 && memoryLoaded && (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <Brain className="w-8 h-8 opacity-20" />
                <p className="text-sm">No memories yet.</p>
                <p className="text-xs text-center max-w-xs">
                  Facts are extracted automatically after conversations. Chat for a while, then check back.
                </p>
              </div>
            )}

            {pinned.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pinned</p>
                <div className="flex flex-col gap-2">
                  {pinned.map((f) => <FactRow key={f.id} fact={f} />)}
                </div>
              </div>
            )}

            {active.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active</p>
                <div className="flex flex-col gap-2">
                  {active.map((f) => <FactRow key={f.id} fact={f} />)}
                </div>
              </div>
            )}

            {disabled.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Disabled</p>
                <div className="flex flex-col gap-2">
                  {disabled.map((f) => <FactRow key={f.id} fact={f} />)}
                </div>
              </div>
            )}
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
