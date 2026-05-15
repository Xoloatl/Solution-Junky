import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { CitationBadge } from "./CitationBadge";
import type { ChunkResult } from "@/lib/db";

interface Props {
  content: string;
  chunks: ChunkResult[];
  isStreaming?: boolean;
}

/**
 * Split text on [N] citation markers and return segments with citation indices.
 */
function splitOnCitations(text: string): Array<{ type: "text" | "cite"; value: string | number }> {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((p) => {
    const m = p.match(/^\[(\d+)\]$/);
    if (m) return { type: "cite" as const, value: parseInt(m[1], 10) };
    return { type: "text" as const, value: p };
  });
}

function CitationText({ text, chunks }: { text: string; chunks: ChunkResult[] }) {
  const segments = splitOnCitations(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "cite" ? (
          <CitationBadge key={i} index={seg.value as number} chunks={chunks} />
        ) : (
          <span key={i}>{seg.value as string}</span>
        )
      )}
    </>
  );
}

export function MessageContent({ content, chunks, isStreaming }: Props) {
  const hasCitations = chunks.length > 0;

  const components: Components = hasCitations
    ? {
        p({ children }) {
          // Intercept paragraph text nodes to inject citation badges
          const processed = processChildren(children, chunks);
          return <p>{processed}</p>;
        },
        li({ children }) {
          const processed = processChildren(children, chunks);
          return <li>{processed}</li>;
        },
      }
    : {};

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-primary/70 ml-0.5 animate-pulse rounded-sm" />
      )}
    </div>
  );
}

function processChildren(children: React.ReactNode, chunks: ChunkResult[]): React.ReactNode {
  if (typeof children === "string") {
    return <CitationText text={children} chunks={chunks} />;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? (
        <CitationText key={i} text={child} chunks={chunks} />
      ) : (
        child
      )
    );
  }
  return children;
}
