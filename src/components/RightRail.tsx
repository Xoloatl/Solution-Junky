import { Brain, FileText, X, BookOpen, Globe, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

export function RightRail() {
  const { rightRailOpen, setRightRailOpen, citations, webCitations, activeCitationMessageId } = useAppStore();

  if (!rightRailOpen) return null;

  const activeCitations = activeCitationMessageId
    ? (citations[activeCitationMessageId] ?? [])
    : [];

  const activeWebCitations = activeCitationMessageId
    ? (webCitations[activeCitationMessageId] ?? [])
    : [];

  return (
    <aside className="w-64 shrink-0 border-l border-border flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0 no-select">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Context
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setRightRailOpen(false)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        {/* Memory facts */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Memory</span>
            <button
              onClick={() => useAppStore.getState().setMemoryManagerOpen(true)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage
            </button>
          </div>
          <p className="text-xs text-muted-foreground italic">
            Facts injected into each turn from your memory.
          </p>
        </div>

        <Separator />

        {/* Document Citations */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Citations</span>
            {activeCitations.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {activeCitations.length} sources
              </span>
            )}
          </div>

          {activeCitations.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Cited chunks appear here after each response.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeCitations.map((chunk) => (
                <div
                  key={chunk.chunk_id}
                  className="rounded-md border border-border bg-background p-2 text-xs"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold shrink-0">
                      {chunk.citation_index}
                    </span>
                    <div className="min-w-0">
                      <p className={cn("font-medium text-foreground truncate")}>
                        {chunk.filename}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        page {chunk.page_number}
                      </p>
                    </div>
                    <BookOpen className="w-3 h-3 text-muted-foreground/50 shrink-0 ml-auto" />
                  </div>
                  <p className="text-muted-foreground line-clamp-3 leading-relaxed">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Web Citations */}
        {activeWebCitations.length > 0 && (
          <>
            <Separator />
            <div className="px-3 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Web</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {activeWebCitations.length} results
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {activeWebCitations.map((r) => (
                  <div
                    key={r.url}
                    className="rounded-md border border-border bg-background p-2 text-xs"
                  >
                    <div className="flex items-start gap-1.5 mb-1">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold shrink-0 mt-0.5">
                        W{r.citation_index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground line-clamp-1">{r.title}</p>
                        <p className="text-muted-foreground text-[10px] truncate">{r.engine}</p>
                      </div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                        title={r.url}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {r.snippet && (
                      <p className="text-muted-foreground line-clamp-3 leading-relaxed">
                        {r.snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </ScrollArea>
    </aside>
  );
}
