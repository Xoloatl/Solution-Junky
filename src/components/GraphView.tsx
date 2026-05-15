import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X, RefreshCw, MessageSquare, FileText, Tag, Lightbulb } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { getGraph, type GraphNode as GNode } from "@/lib/db";
import { categoryColor } from "@/lib/categoryColors";

// ── Node type colors ──────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { color: string; bg: string; Icon: React.FC<{ className?: string }> }> = {
  chat:     { color: "#6366f1", bg: "#eef2ff", Icon: ({ className }) => <MessageSquare className={className} /> },
  document: { color: "#10b981", bg: "#ecfdf5", Icon: ({ className }) => <FileText className={className} /> },
  category: { color: "#f59e0b", bg: "#fffbeb", Icon: ({ className }) => <Tag className={className} /> },
  concept:  { color: "#8b5cf6", bg: "#f5f3ff", Icon: ({ className }) => <Lightbulb className={className} /> },
};

// ── Custom node renderer ───────────────────────────────────────────────────────

function GraphNodeCard({ data }: { data: { label: string; nodeType: string; color?: string } }) {
  const cfg = TYPE_CONFIG[data.nodeType] ?? TYPE_CONFIG.concept;
  const color = data.color ?? cfg.color;
  const { Icon } = cfg;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm text-xs font-medium max-w-[160px]"
      style={{ borderColor: color, backgroundColor: cfg.bg, color: "#1e293b" }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="shrink-0 rounded-full p-1" style={{ backgroundColor: color + "33" }}>
        <Icon className="w-3 h-3" />
      </div>
      <span className="truncate leading-tight">{data.label}</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { graphNode: GraphNodeCard };

// ── Layout: stratified by type ────────────────────────────────────────────────

function layoutNodes(rawNodes: GNode[]): Node[] {
  const typeOrder = ["category", "document", "chat", "concept"];
  const groups: Record<string, GNode[]> = {};
  for (const n of rawNodes) {
    (groups[n.node_type] ??= []).push(n);
  }

  const nodes: Node[] = [];
  const rowGap = 180;
  const colGap = 200;

  typeOrder.forEach((type, rowIdx) => {
    const group = groups[type] ?? [];
    group.forEach((n, colIdx) => {
      const totalWidth = (group.length - 1) * colGap;
      nodes.push({
        id: n.id,
        type: "graphNode",
        position: {
          x: colIdx * colGap - totalWidth / 2,
          y: rowIdx * rowGap,
        },
        data: {
          label: n.label,
          nodeType: n.node_type,
          color: n.node_type === "category" ? categoryColor(n.label) : undefined,
        },
      });
    });
  });

  return nodes;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GraphView() {
  const { graphOpen, setGraphOpen, setActiveChatId } = useAppStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGraph();
      setNodes(layoutNodes(data.nodes));
      setEdges(
        data.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.edge_type.replace(/_/g, " "),
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
          labelStyle: { fontSize: 9, fill: "#94a3b8" },
          animated: e.edge_type === "categorized_as",
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (graphOpen) load();
  }, [graphOpen, load]);

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const nodeType = (node.data as { nodeType: string }).nodeType;
    if (nodeType === "chat") {
      const refId = node.id.replace("node:chat:", "");
      setActiveChatId(refId);
      setGraphOpen(false);
    }
  }

  const miniMapNodeColor = useCallback((node: Node) => {
    const cfg = TYPE_CONFIG[(node.data as { nodeType: string }).nodeType];
    return cfg?.color ?? "#94a3b8";
  }, []);

  const isEmpty = nodes.length === 0 && !loading;

  return (
    <Dialog.Root open={graphOpen} onOpenChange={setGraphOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-4 z-40 rounded-2xl border border-border bg-background shadow-2xl flex flex-col outline-none overflow-hidden">
          <Dialog.Title className="sr-only">Knowledge Graph</Dialog.Title>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground">Knowledge Graph</span>
              <Legend />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={load}
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Dialog.Close asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <X className="w-4 h-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative">
            {isEmpty ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">No graph data yet</p>
                <p className="text-xs">Ingest a document or start a categorized chat to see connections.</p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={2}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
                <Controls showInteractive={false} />
                <MiniMap nodeColor={miniMapNodeColor} maskColor="rgba(0,0,0,0.08)" />
              </ReactFlow>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3">
      {Object.entries(TYPE_CONFIG).map(([type, { color }]) => (
        <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="capitalize">{type}</span>
        </div>
      ))}
    </div>
  );
}
