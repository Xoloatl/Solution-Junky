import * as Tooltip from "@radix-ui/react-tooltip";
import type { ChunkResult } from "@/lib/db";
import { cn } from "@/lib/utils";

interface Props {
  index: number;
  chunks: ChunkResult[];
}

export function CitationBadge({ index, chunks }: Props) {
  const chunk = chunks.find((c) => c.citation_index === index);

  const badge = (
    <sup
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold cursor-pointer mx-0.5",
        chunk
          ? "bg-primary/20 text-primary hover:bg-primary/30"
          : "bg-muted text-muted-foreground"
      )}
    >
      {index}
    </sup>
  );

  if (!chunk) return badge;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{badge}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={4}
            className={cn(
              "z-50 max-w-xs rounded-lg border border-border bg-card p-3 shadow-xl text-xs",
              "animate-in fade-in-0 zoom-in-95"
            )}
          >
            <p className="font-semibold text-foreground mb-1">
              {chunk.filename} · p.{chunk.page_number}
            </p>
            <p className="text-muted-foreground line-clamp-5 leading-relaxed">
              {chunk.content}
            </p>
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
