import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  MarkerType,
  SelectionMode,
  useStore,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
  type OnConnect,
  type OnMoveEnd,
  type Viewport,
  type OnReconnect,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Copy, ClipboardCopy, Edit3, Palette, Trash2, Circle, CheckCircle2, HelpCircle, AlertCircle, X, Minus, Plus, Command, GitFork, CircleDot, AlertTriangle, FileText } from "lucide-react";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import ItemNode from "@/components/ItemNode";
import FloatingCommentEdge from "@/components/edges/FloatingCommentEdge";
import ConnectionCommentInput from "@/components/ConnectionCommentInput";
import PopupEditor from "@/components/PopupEditor";
import ShortcutHintBar from "@/components/ShortcutHintBar";
import ImportPreviewDialog from "@/components/ImportPreviewDialog";
import { CARD_DEFAULT_H, CARD_DEFAULT_W, CARD_DEFAULT_W as CARD_W, CARD_MARGIN, GRID, findFreeCardPosition } from "@/lib/layout";
import { resolvePaste } from "@/lib/smartPaste";
import { copyItemsDualFlavour } from "@/lib/clipboard";
import { parseMarkdownImport, isMarkdownFile, type ImportSection } from "@/lib/importMarkdown";
import type { Item } from "@/types";

const nodeTypes: NodeTypes = { item: ItemNode };
const edgeTypes: EdgeTypes = { floatingComment: FloatingCommentEdge };
const viewportKeyFor = (mapId: string) => `mymind.viewport.${mapId}`;
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.2 };
const SNAP_GRID: [number, number] = [GRID, GRID];
// Arrowheads are set per-edge in derivedEdges, not in DEFAULT_EDGE_OPTIONS:
// defaultEdgeOptions only applies to NEWLY created edges, so edges loaded from
// the database would never get one.
const EDGE_MARKER = { type: MarkerType.ArrowClosed, width: 20, height: 20, color: "#94a3b8" };
const EDGE_MARKER_SELECTED = { type: MarkerType.ArrowClosed, width: 20, height: 20, color: "#94a3b8" };
const DEFAULT_EDGE_OPTIONS = { type: "floatingComment", reconnectable: true };
const PRO_OPTIONS = { hideAttribution: true };
const MINI_MAP_NODE_COLOR = (node: Node) => ((node.data as { item?: { color?: string } }).item?.color) ?? "#6366f1";
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MAX_PASTED_CARDS = 30;

/** Breadth-first search outward from a source card along edges (undirected),
 *  recording each card's hop distance. Unreachable cards get Infinity. */
function computeFocusDistances(items: Item[], connections: { sourceId: string; targetId: string }[], focusedId: string): Map<string, number> {
  const distances = new Map<string, number>();
  for (const item of items) distances.set(item.id, Infinity);
  distances.set(focusedId, 0);
  const adjacency = new Map<string, string[]>();
  for (const item of items) adjacency.set(item.id, []);
  for (const conn of connections) {
    const s = adjacency.get(conn.sourceId);
    const t = adjacency.get(conn.targetId);
    if (s) s.push(conn.targetId);
    if (t) t.push(conn.sourceId);
  }
  const queue: string[] = [focusedId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = distances.get(current)!;
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (distances.get(neighbor) !== Infinity) continue;
      distances.set(neighbor, d + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}

type PastedSection = { title: string; description: string };

function splitPasteMarkdown(markdown: string): PastedSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingStarts = lines.reduce<number[]>((starts, line, index) => {
    if (/^#{1,2}[ \t]+/.test(line)) starts.push(index);
    return starts;
  }, []);
  if (headingStarts.length > 0) {
    return headingStarts.map((start, index) => {
      const end = headingStarts[index + 1] ?? lines.length;
      const match = lines[start].match(/^#{1,2}[ \t]+(.+?)\s*$/);
      return { title: match?.[1]?.trim() ?? "", description: lines.slice(start + 1, end).join("\n").trim() };
    }).filter((section) => section.title || section.description);
  }

  const bulletStarts = lines.reduce<number[]>((starts, line, index) => {
    if (/^[-*][ \t]+/.test(line)) starts.push(index);
    return starts;
  }, []);
  if (bulletStarts.length > 0) {
    return bulletStarts.map((start, index) => {
      const end = bulletStarts[index + 1] ?? lines.length;
      const title = lines[start].replace(/^[-*][ \t]+/, "").trim();
      const description = lines.slice(start + 1, end).map((line) => line.replace(/^[ \t]{2,}/, "")).join("\n").trim();
      return { title, description };
    }).filter((section) => section.title || section.description);
  }

  const trimmed = markdown.trim();
  if (!trimmed) return [];
  const singleLines = trimmed.split("\n");
  if (singleLines[0].length > 80) return [{ title: "", description: trimmed }];
  return [{ title: singleLines[0].trim(), description: singleLines.slice(1).join("\n").trim() }];
}

function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number, margin: number) {
  return !(ax + aw + margin <= bx || bx + bw + margin <= ax || ay + ah + margin <= by || by + bh + margin <= ay);
}

type PendingComment = { connectionId: string; screenX: number; screenY: number };
type ContextMenu = { itemId: string; x: number; y: number };

type ItemNodeData = {
  item: ReturnType<typeof useBoardStore.getState>["items"][number];
  dimmed?: boolean;
  focusDimmed?: boolean;
  editing: boolean;
  zoom: number;
  onOpenEditor: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
  creationHighlight?: boolean;
};

function Canvas() {
  const items = useBoardStore((s) => s.items);
  const connections = useBoardStore((s) => s.connections);
  const activeTagFilter = useBoardStore((s) => s.activeTagFilter);
  const editingItemId = useBoardStore((s) => s.editingItemId);
  const selectedConnectionId = useBoardStore((s) => s.selectedConnectionId);
  const selectedNodeId = useBoardStore((s) => s.selectedNodeId);
  const selectedNodeIds = useBoardStore((s) => s.selectedNodeIds);
  const setSelectedNode = useBoardStore((s) => s.setSelectedNode);
  const toggleNodeSelection = useBoardStore((s) => s.toggleNodeSelection);
  const snapEnabled = useBoardStore((s) => s.snapEnabled);
  const connectMode = useBoardStore((s) => s.connectMode);
  const connectModeSourceId = useBoardStore((s) => s.connectModeSourceId);
  const activeMapId = useBoardStore((s) => s.activeMapId);
  const focusMode = useBoardStore((s) => s.focusMode);
  const focusedCardId = useBoardStore((s) => s.focusedCardId);
  const focusDepth = useBoardStore((s) => s.focusDepth);
  const setFocusState = useBoardStore((s) => s.setFocusState);
  const setFocusDepth = useBoardStore((s) => s.setFocusDepth);
  const exitFocus = useBoardStore((s) => s.exitFocus);
  const createItem = useBoardStore((s) => s.createItem);
  const createItems = useBoardStore((s) => s.createItems);
  const updateItem = useBoardStore((s) => s.updateItem);
  const setItemStyle = useBoardStore((s) => s.setItemStyle);
  const updateConnection = useBoardStore((s) => s.updateConnection);
  const deleteConnection = useBoardStore((s) => s.deleteConnection);
  const deleteItem = useBoardStore((s) => s.deleteItem);
  const duplicateItem = useBoardStore((s) => s.duplicateItem);
  const selectConnection = useBoardStore((s) => s.selectConnection);
  const setEditingItem = useBoardStore((s) => s.setEditingItem);
  const commitDrag = useBoardStore((s) => s.commitDrag);
  const commitDragMany = useBoardStore((s) => s.commitDragMany);
  const commitPillDrag = useBoardStore((s) => s.commitPillDrag);
  const tidy = useBoardStore((s) => s.tidy);
  const arrangeItems = useBoardStore((s) => s.arrangeItems);
  const { screenToFlowPosition, flowToScreenPosition, getViewport, setViewport, fitView, getNodes } = useReactFlow();

  // Expose the measured React Flow nodes for PDF export, which needs
  // node.measured dimensions (not Zustand items, which lack them).
  useEffect(() => {
    (window as unknown as { __mymindGetNodes?: () => Node[] }).__mymindGetNodes = () => getNodes();
    return () => { delete (window as unknown as { __mymindGetNodes?: () => Node[] }).__mymindGetNodes; };
  }, [getNodes]);
  const zoom = useStore((s) => s.transform[2]);
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
  const [popupItemId, setPopupItemId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [importPreview, setImportPreview] = useState<{ fileName: string; fileSize: number; fileText: string; dropPoint: { x: number; y: number } } | null>(null);
  const [myMindGuard, setMyMindGuard] = useState(false);
  const dragCounterRef = useRef(0);
  const overlapStateRef = useRef<{ id: string | null; x: number; y: number; raf: number | null; overlapping: boolean }>({ id: null, x: 0, y: 0, raf: null, overlapping: false });
  const draggingRef = useRef(false);
  // Each card renders both source and target handles at the same positions. With
  // ConnectionMode.Loose, a drag that BEGINS on a target handle comes back from
  // React Flow with source/target swapped. Record where the drag started so
  // onConnect can put them back in the right order.
  const connectStartNodeRef = useRef<string | null>(null);
  const viewportHandledRef = useRef(false);
  const pointerPositionRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  // Focus mode viewport save/restore — in-memory only, never persisted.
  const focusSavedViewportRef = useRef<Viewport | null>(null);
  const prevFocusModeRef = useRef(false);
  const prevFocusedCardIdRef = useRef<string | null>(null);
  const prevFocusDepthRef = useRef(1);

  const savedViewport = useMemo<Viewport | null>(() => {
    if (!activeMapId) return null;
    try {
      const raw = localStorage.getItem(viewportKeyFor(activeMapId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Viewport;
      return typeof parsed.x === "number" && typeof parsed.y === "number" && typeof parsed.zoom === "number" ? parsed : null;
    } catch {
      return null;
    }
  }, [activeMapId]);

  useEffect(() => {
    viewportHandledRef.current = false;
    if (savedViewport) {
      setViewport(savedViewport);
      viewportHandledRef.current = true;
    } else {
      setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [activeMapId, savedViewport, setViewport]);

  useEffect(() => {
    if (viewportHandledRef.current) return;
    if (items.length === 0) return;
    viewportHandledRef.current = true;
    const raf = requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
    return () => cancelAnimationFrame(raf);
  }, [items, fitView]);

  const moveTimer = useRef<number | undefined>(undefined);
  const onMoveEnd = useCallback<OnMoveEnd>(() => {
    const viewport = getViewport();
    const mid = useBoardStore.getState().activeMapId;
    if (!mid) return;
    if (moveTimer.current) window.clearTimeout(moveTimer.current);
    moveTimer.current = window.setTimeout(() => localStorage.setItem(viewportKeyFor(mid), JSON.stringify(viewport)), 300);
  }, [getViewport]);

  const openEditor = useCallback((id: string) => {
    setContextMenu(null);
    setPopupItemId(id);
    setEditingItem(null);
  }, [setEditingItem]);

  const openContextMenu = useCallback((event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setPopupItemId(null);
    setContextMenu({ itemId: id, x: Math.min(event.clientX, window.innerWidth - 164), y: Math.min(event.clientY, window.innerHeight - 126) });
  }, []);

  // Focus mode: compute BFS distances from the focused card and derive which
  // cards/edges are dimmed. This is display-only — nothing is moved or modified.
  const focusDistances = useMemo(() => {
    if (!focusMode || !focusedCardId) return null;
    return computeFocusDistances(items, connections, focusedCardId);
  }, [focusMode, focusedCardId, items, connections]);

  const maxFocusDistance = useMemo(() => {
    if (!focusDistances) return 0;
    let max = 0;
    for (const d of focusDistances.values()) if (d !== Infinity && d > max) max = d;
    return max;
  }, [focusDistances]);

  const visibleFocusCount = useMemo(() => {
    if (!focusDistances) return 0;
    let count = 0;
    for (const d of focusDistances.values()) if (d !== Infinity && d <= focusDepth) count++;
    return count;
  }, [focusDistances, focusDepth]);

  const focusedItem = useMemo(() => items.find((it) => it.id === focusedCardId) ?? null, [items, focusedCardId]);

  // Focus mode viewport management: fit to visible cards on enter, depth change,
  // and re-focus; restore the original viewport on exit. User panning/zooming
  // while focus mode is active is never overridden — only these three triggers
  // cause a programmatic viewport change.
  useEffect(() => {
    const wasFocus = prevFocusModeRef.current;
    const wasFocusedId = prevFocusedCardIdRef.current;
    const wasDepth = prevFocusDepthRef.current;
    prevFocusModeRef.current = focusMode;
    prevFocusedCardIdRef.current = focusedCardId;
    prevFocusDepthRef.current = focusDepth;

    // Entering focus mode: save the current viewport, then fit to visible.
    if (focusMode && !wasFocus) {
      focusSavedViewportRef.current = getViewport();
      const visibleIds = items
        .filter((it) => {
          const d = focusDistances?.get(it.id);
          return d !== undefined && d !== Infinity && d <= focusDepth;
        })
        .map((it) => it.id);
      if (visibleIds.length > 0) {
        requestAnimationFrame(() => fitView({ nodes: visibleIds.map((id) => ({ id })), maxZoom: 1.5, padding: 0.2, duration: 300 }));
      }
      return;
    }

    // Exiting focus mode: restore the saved viewport.
    if (!focusMode && wasFocus) {
      const saved = focusSavedViewportRef.current;
      focusSavedViewportRef.current = null;
      if (saved) setViewport(saved, { duration: 300 });
      return;
    }

    // Still in focus mode — re-fit only if depth or focused card changed.
    // Re-focus does NOT overwrite the saved original viewport.
    if (focusMode && (focusedCardId !== wasFocusedId || focusDepth !== wasDepth)) {
      const visibleIds = items
        .filter((it) => {
          const d = focusDistances?.get(it.id);
          return d !== undefined && d !== Infinity && d <= focusDepth;
        })
        .map((it) => it.id);
      if (visibleIds.length > 0) {
        requestAnimationFrame(() => fitView({ nodes: visibleIds.map((id) => ({ id })), maxZoom: 1.5, padding: 0.2, duration: 300 }));
      }
    }
  }, [focusMode, focusedCardId, focusDepth, focusDistances, items, getViewport, setViewport, fitView]);

  const derivedNodes = useMemo(() => items.map((item) => {
    const dist = focusDistances?.get(item.id);
    const focusDimmed = focusMode && (dist === undefined || dist === Infinity || dist > focusDepth);
    return {
      id: item.id,
      type: "item",
      position: { x: item.posX, y: item.posY },
      selected: selectedNodeIds.includes(item.id),
      dragHandle: ".card-drag-dot",
      data: {
        item,
        dimmed: activeTagFilter !== null && !item.tags.includes(activeTagFilter),
        focusDimmed,
        editing: editingItemId === item.id,
        zoom,
        onOpenEditor: openEditor,
        onContextMenu: openContextMenu,
        creationHighlight: highlightedNodeId === item.id,
      },
    };
  }), [items, activeTagFilter, editingItemId, selectedNodeIds, zoom, highlightedNodeId, openEditor, openContextMenu, focusMode, focusDistances, focusDepth]);

  const derivedEdges = useMemo(() => connections.map((connection) => {
    const sourceItem = items.find((item) => item.id === connection.sourceId);
    const targetItem = items.find((item) => item.id === connection.targetId);
    const tagDimmed = activeTagFilter !== null && (!sourceItem?.tags.includes(activeTagFilter) || !targetItem?.tags.includes(activeTagFilter));
    const hovered = hoveredNodeId === connection.sourceId || hoveredNodeId === connection.targetId;
    const hasHover = hoveredNodeId !== null;
    const selected = selectedConnectionId === connection.id;
    const mutedEndpoint = sourceItem?.color === "muted" || targetItem?.color === "muted";
    const sourceDist = focusDistances?.get(connection.sourceId);
    const targetDist = focusDistances?.get(connection.targetId);
    const focusDimmed = focusMode && (sourceDist === undefined || sourceDist === Infinity || sourceDist > focusDepth || targetDist === undefined || targetDist === Infinity || targetDist > focusDepth);
    const focusOpacity = focusDimmed ? 0.12 : 1;
    return {
      id: connection.id,
      source: connection.sourceId,
      target: connection.targetId,
      type: "floatingComment",
      data: { comment: connection.comment, labelDx: connection.labelDx, labelDy: connection.labelDy, onPillDragEnd: commitPillDrag, focusDimmed },
      selected,
      interactionWidth: 20,
      markerEnd: selected ? EDGE_MARKER_SELECTED : EDGE_MARKER,
      style: { opacity: focusOpacity * (selected ? 1 : Math.min(tagDimmed ? 0.25 : hasHover && !hovered ? 0.18 : 1, mutedEndpoint ? 0.5 : 1)), stroke: selected ? "#6366f1" : hovered ? "#94a3b8" : "#cbd5e1", strokeWidth: selected ? 3 : hovered ? 2 : 1.2 },
    };
  }), [connections, items, activeTagFilter, hoveredNodeId, commitPillDrag, focusMode, focusDistances, focusDepth]);

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  useEffect(() => {
    if (draggingRef.current) return;
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    if (draggingRef.current) return;
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  const onNodeDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onNodeDrag: OnNodeDrag = useCallback((_event: MouseEvent | TouchEvent, draggedNode: Node) => {
    const state = overlapStateRef.current;
    if (state.id !== draggedNode.id) {
      state.id = draggedNode.id;
      state.x = 0;
      state.y = 0;
      state.overlapping = false;
    }
    const x = draggedNode.position.x;
    const y = draggedNode.position.y;
    if (Math.abs(x - state.x) < 4 && Math.abs(y - state.y) < 4) return;
    state.x = x;
    state.y = y;
    if (state.raf !== null) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = null;
      const draggedItem = (draggedNode.data as Partial<ItemNodeData>).item;
      const overlaps = items.some((item) => {
        if (item.id === draggedNode.id) return false;
        return rectsOverlap(state.x, state.y, draggedItem?.width ?? CARD_DEFAULT_W, draggedItem?.height ?? CARD_DEFAULT_H, item.posX, item.posY, item.width ?? CARD_DEFAULT_W, item.height ?? CARD_DEFAULT_H, 12);
      });
      if (state.overlapping === overlaps) return;
      state.overlapping = overlaps;
      const el = document.querySelector<HTMLElement>(`[data-nodeid="${draggedNode.id}"]`);
      if (el) el.style.boxShadow = overlaps ? "0 0 0 2px #f87171" : "";
    });
  }, [items]);

  const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    const state = overlapStateRef.current;
    if (state.raf !== null) { cancelAnimationFrame(state.raf); state.raf = null; }
    if (state.id === node.id) {
      const el = document.querySelector<HTMLElement>(`[data-nodeid="${node.id}"]`);
      if (el) el.style.boxShadow = "";
      state.overlapping = false;
      state.id = null;
    }
    const allNodes = getNodes();
    const selected = allNodes.filter((n: Node) => n.selected || n.id === node.id);
    const updates = selected.map((n: Node) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    if (updates.length > 1) commitDragMany(updates);
    else commitDrag(node.id, node.position.x, node.position.y);
    draggingRef.current = false;
  }, [commitDrag, commitDragMany, getNodes]);

  const onNodeClick: NodeMouseHandler<Node> = useCallback((event, node) => {
    if (event.shiftKey) { toggleNodeSelection(node.id); return; }
    if (event.metaKey || event.ctrlKey) return;
    const { selectedNodeIds, focusMode } = useBoardStore.getState();
    if (selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)) return;
    // In focus mode, selecting a different card re-focuses on it.
    if (focusMode) {
      setFocusState(true, node.id, 1);
    }
    setSelectedNode(node.id);
  }, [setSelectedNode, toggleNodeSelection, setFocusState]);

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    const ids = nodes.map((n) => n.id);
    useBoardStore.setState({
      selectedNodeIds: ids,
      selectedNodeId: ids.length === 1 ? ids[0] : null,
      selectedConnectionId: null,
    });
  }, []);

  useEffect(() => {
    const handleCreationHighlight = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setHighlightedNodeId(id);
      window.setTimeout(() => setHighlightedNodeId((current) => current === id ? null : current), 500);
    };
    window.addEventListener("mymind:creation-highlight", handleCreationHighlight);
    return () => window.removeEventListener("mymind:creation-highlight", handleCreationHighlight);
  }, []);

  useEffect(() => {
    const handleOpenPopup = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      openEditor(id);
    };
    window.addEventListener("mymind:open-popup-editor", handleOpenPopup);
    return () => window.removeEventListener("mymind:open-popup-editor", handleOpenPopup);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "canvas", open: popupItemId !== null || contextMenu !== null } }));
    return () => { window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "canvas", open: false } })); };
  }, [contextMenu, popupItemId]);

  useEffect(() => {
    const handleCanvasPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const focused = target?.closest("input, textarea, [contenteditable=\"true\"]") || active?.closest("input, textarea, [contenteditable=\"true\"]");
      if (focused || editingItemId !== null || popupItemId !== null) return;
      const markdown = resolvePaste(event.clipboardData, Boolean((event as ClipboardEvent & { shiftKey?: boolean }).shiftKey), "canvas");
      if (!markdown.trim()) return;
      const sections = splitPasteMarkdown(markdown);
      if (sections.length === 0) return;
      const state = useBoardStore.getState();
      if (!state.activeMapId) return;
      event.preventDefault();
      const start = screenToFlowPosition(pointerPositionRef.current);
      const created: Item[] = [];
      for (const section of sections.slice(0, MAX_PASTED_CARDS)) {
        const desired = { x: start.x, y: start.y + created.length * (CARD_DEFAULT_H + 24) };
        const position = findFreeCardPosition(desired.x, desired.y, [...state.items, ...created], undefined, section.description);
        created.push({
          id: crypto.randomUUID(),
          title: section.title,
          tags: [],
          createdAt: new Date().toISOString(),
          dueDate: null,
          description: section.description,
          posX: position.x,
          posY: position.y,
          color: null,
          width: null,
          height: null,
          scale: null,
          status: null,
          cardType: "note",
          mapId: state.activeMapId,
        });
      }
      createItems(created, created.length === 1 ? created[0].id : null);
      if (sections.length > MAX_PASTED_CARDS) {
        setToast(`${sections.length - MAX_PASTED_CARDS} card${sections.length - MAX_PASTED_CARDS === 1 ? "" : "s"} skipped (maximum ${MAX_PASTED_CARDS})`);
        window.setTimeout(() => setToast(null), 3200);
      }
    };
    window.addEventListener("paste", handleCanvasPaste);
    return () => window.removeEventListener("paste", handleCanvasPaste);
  }, [createItems, editingItemId, popupItemId, screenToFlowPosition]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const focused = target?.closest("input, textarea, [contenteditable=\"true\"]") || active?.closest("input, textarea, [contenteditable=\"true\"]");
      if (focused || editingItemId !== null || popupItemId !== null) return;
      const { selectedNodeIds, items } = useBoardStore.getState();
      if (selectedNodeIds.length === 0) return;
      const selectedItems = items.filter((item) => selectedNodeIds.includes(item.id));
      if (selectedItems.length === 0) return;
      event.preventDefault();
      void copyItemsDualFlavour(selectedItems);
    };
    window.addEventListener("copy", handleCopy);
    return () => window.removeEventListener("copy", handleCopy);
  }, [editingItemId, popupItemId]);

  useEffect(() => {
    const clearSelectionOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const el = event.target as HTMLElement | null;
      const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (inField) return;
      if (useBoardStore.getState().focusMode) { exitFocus(); return; }
      setSelectedNode(null);
    };
    window.addEventListener("keydown", clearSelectionOnEscape);
    return () => window.removeEventListener("keydown", clearSelectionOnEscape);
  }, [setSelectedNode, exitFocus]);

  useEffect(() => {
    const dismissCanvasOverlays = () => {
      setPopupItemId(null);
      setContextMenu(null);
    };
    window.addEventListener("mymind:dismiss-overlays", dismissCanvasOverlays);
    return () => window.removeEventListener("mymind:dismiss-overlays", dismissCanvasOverlays);
  }, []);
  const onNodeMouseEnter: NodeMouseHandler<Node> = useCallback((_, node) => setHoveredNodeId(node.id), []);
  const onNodeMouseLeave: NodeMouseHandler<Node> = useCallback(() => setHoveredNodeId(null), []);
  const onNodeDoubleClick: NodeMouseHandler<Node> = useCallback((event, node) => {
    const target = event.target as HTMLElement;
    if (target.closest(".item-node-resizer-handle") || target.closest(".react-flow__resize-control")) return;
    openEditor(node.id);
  }, [openEditor]);
  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => { event.stopPropagation(); selectConnection(edge.id); setSelectedNode(null); setContextMenu(null); }, [selectConnection, setSelectedNode]);
  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => { event.preventDefault(); event.stopPropagation(); selectConnection(edge.id); }, [selectConnection]);
  const onPaneClick = useCallback(() => { selectConnection(null); setSelectedNode(null); setContextMenu(null); setPopupItemId(null); if (useBoardStore.getState().focusMode) exitFocus(); }, [selectConnection, setSelectedNode, exitFocus]);

  const deleteCard = useCallback(async (itemId: string) => {
    const state = useBoardStore.getState();
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const wasFocused = state.focusMode && state.focusedCardId === itemId;
    const connectionIds = state.connections
      .filter((connection) => connection.sourceId === itemId || connection.targetId === itemId)
      .map((connection) => connection.id);
    for (const connectionId of connectionIds) {
      const connectionDelete = await supabase.from("connections").delete().eq("id", connectionId);
      if (connectionDelete.error) {
        console.error("Supabase connection delete failed", connectionDelete.error);
        setToast("Could not delete the card");
        window.setTimeout(() => setToast(null), 3000);
        return;
      }
    }
    const itemDelete = await supabase.from("items").delete().eq("id", itemId);
    if (itemDelete.error) {
      console.error("Supabase item delete failed", itemDelete.error);
      setToast("Could not delete the card");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    useBoardStore.getState().deleteItem(itemId);
    if (wasFocused) exitFocus();
  }, [exitFocus]);

  const onReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
    if (newConnection.source && newConnection.target) updateConnection(oldEdge.id, { sourceId: newConnection.source, targetId: newConnection.target });
  }, [updateConnection]);

  const onConnectStart = useCallback((_event: unknown, params: { nodeId: string | null }) => {
    connectStartNodeRef.current = params.nodeId ?? null;
  }, []);

  const onConnectEnd = useCallback(() => {
    connectStartNodeRef.current = null;
  }, []);

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return;
    // The arrow must point at the card the drag ENDED on. If React Flow reports the
    // starting node as the target, the roles were swapped by loose connection mode.
    const startedOn = connectStartNodeRef.current;
    const swap = startedOn !== null && startedOn === connection.target && startedOn !== connection.source;
    const sourceId = swap ? connection.target : connection.source;
    const targetId = swap ? connection.source : connection.target;
    const store = useBoardStore.getState();
    const connectionId = store.createConnection(sourceId, targetId, "");
    const source = store.items.find((item) => item.id === sourceId);
    const target = store.items.find((item) => item.id === targetId);
    if (!source || !target) return;
    const midpoint = flowToScreenPosition({ x: (source.posX + target.posX) / 2, y: (source.posY + target.posY) / 2 });
    setPendingComment({ connectionId, screenX: midpoint.x >= 0 && midpoint.x <= window.innerWidth ? midpoint.x : window.innerWidth / 2, screenY: midpoint.y >= 0 && midpoint.y <= window.innerHeight ? midpoint.y : window.innerHeight / 2 });
  }, [flowToScreenPosition]);

  const onDoubleClick = useCallback((event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".react-flow__node")) return;
    if (!useBoardStore.getState().activeMapId) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createItem(position.x, position.y, undefined, { startEditing: true });
  }, [createItem, screenToFlowPosition]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const runImport = useCallback((sections: ImportSection[], dropPoint: { x: number; y: number }, fileName: string) => {
    const state = useBoardStore.getState();
    if (!state.activeMapId) return;
    const activeMapId = state.activeMapId;
    const start = screenToFlowPosition(dropPoint);
    const columns = Math.ceil(Math.sqrt(sections.length));
    const gapX = CARD_W + CARD_MARGIN;
    const gapY = CARD_DEFAULT_H + CARD_MARGIN;
    const created: Item[] = sections.map((section, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = start.x + col * gapX;
      const y = start.y + row * gapY;
      return {
        id: crypto.randomUUID(),
        title: section.title,
        tags: [],
        createdAt: new Date().toISOString(),
        dueDate: null,
        description: section.body,
        posX: x,
        posY: y,
        color: null,
        width: null,
        height: null,
        scale: null,
        status: null,
        cardType: "note",
        mapId: activeMapId,
      };
    });
    createItems(created);
    showToast(`Imported ${created.length} card${created.length === 1 ? "" : "s"} from ${fileName}.`);
  }, [screenToFlowPosition, createItems, showToast]);

  const handleFileDrop = useCallback((file: File, dropPoint: { x: number; y: number }) => {
    if (!isMarkdownFile(file)) {
      showToast("Only .md, .markdown and .txt files can be imported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const parsed = parseMarkdownImport(text, file.name, 1);
      if (parsed.isMyMindExport) {
        setMyMindGuard(true);
        return;
      }
      setImportPreview({ fileName: file.name, fileSize: file.size, fileText: text, dropPoint });
    };
    reader.readAsText(file);
  }, [showToast]);

  const onCanvasDragEnter = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragCounterRef.current++;
    setDragOverCanvas(true);
  }, []);

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onCanvasDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOverCanvas(false);
    }
  }, []);

  const onCanvasDrop = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragCounterRef.current = 0;
    setDragOverCanvas(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    const dropPoint = { x: event.clientX, y: event.clientY };
    handleFileDrop(files[0], dropPoint);
    if (files.length > 1) {
      showToast(`${files.length - 1} additional file${files.length - 1 === 1 ? "" : "s"} ignored — only the first file is imported.`);
    }
  }, [handleFileDrop, showToast]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ file: File }>).detail;
      if (!detail?.file) return;
      const sidebarWidth = useBoardStore.getState().sidebarCollapsed ? 0 : 240;
      handleFileDrop(detail.file, { x: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, y: window.innerHeight / 2 });
    };
    window.addEventListener("mymind:import-markdown-file", handler);
    return () => window.removeEventListener("mymind:import-markdown-file", handler);
  }, [handleFileDrop]);

  const popupItem = items.find((item) => item.id === popupItemId);
  const popupPosition = popupItem ? flowToScreenPosition({ x: popupItem.posX + 240, y: popupItem.posY }) : null;
  const popupLeft = popupPosition && popupPosition.x + 360 <= window.innerWidth ? popupPosition.x + 16 : (popupPosition?.x ?? 16) - 376;
  const popupTop = Math.max(16, Math.min(window.innerHeight - 16, popupPosition?.y ?? 16));
  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Control"]}
        onSelectionChange={onSelectionChange}
        edgesReconnectable
        onReconnect={onReconnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onDoubleClick={onDoubleClick}
        onPaneMouseMove={(event) => { pointerPositionRef.current = { x: event.clientX, y: event.clientY }; }}
        onMoveEnd={onMoveEnd}
        onDragEnter={onCanvasDragEnter}
        onDragOver={onCanvasDragOver}
        onDragLeave={onCanvasDragLeave}
        onDrop={onCanvasDrop}
        minZoom={0.2}
        maxZoom={1.5}
        snapToGrid={snapEnabled}
        snapGrid={SNAP_GRID}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        proOptions={PRO_OPTIONS}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#d1d5db" />
        <Controls position="bottom-left" showInteractive={false} className="react-flow-controls" />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={MINI_MAP_NODE_COLOR} maskColor="rgba(0,0,0,0.05)" />
      </ReactFlow>
      <ShortcutHintBar />
      {focusMode && focusedItem && (
        <div className="nodrag nopan pointer-events-auto absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur">
          <span className="text-slate-500">Focus:</span>
          <span className="max-w-[160px] truncate font-semibold text-slate-800">{focusedItem.title || "Untitled"}</span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">depth</span>
            <button onClick={() => setFocusDepth(Math.max(1, focusDepth - 1))} disabled={focusDepth <= 1} className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30" title="Decrease depth"><Minus size={10} /></button>
            <span className="min-w-[12px] text-center font-semibold text-slate-800">{focusDepth}</span>
            <button onClick={() => setFocusDepth(Math.min(maxFocusDistance, focusDepth + 1))} disabled={focusDepth >= maxFocusDistance} className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30" title="Increase depth"><Plus size={10} /></button>
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">{visibleFocusCount}/{items.length} cards</span>
          <button onClick={exitFocus} className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" title="Exit focus mode"><X size={13} /></button>
        </div>
      )}
      {connectMode && <div className="nodrag nopan pointer-events-none absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">Connection mode — use {IS_MAC ? "Cmd" : "Ctrl"}+Arrows to navigate, Enter to connect, Esc to cancel</div>}
      {popupItem && popupPosition && <PopupEditor item={popupItem} left={popupLeft} top={popupTop} onClose={() => setPopupItemId(null)} />}
      {contextMenu && <div className="nodrag nopan fixed z-50 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <button className="menu nodrag nopan" onClick={() => openEditor(contextMenu.itemId)}><Edit3 size={14} /> Edit</button>
        <button className="menu nodrag nopan" onClick={() => { duplicateItem(contextMenu.itemId); setContextMenu(null); }}><Copy size={14} /> Duplicate</button>
        <button className="menu nodrag nopan" onClick={() => { const selected = useBoardStore.getState(); const item = selected.items.find((i) => i.id === contextMenu.itemId); if (item) void copyItemsDualFlavour([item]); setContextMenu(null); }}><ClipboardCopy size={14} /> Copy</button>
        <div className="group relative">
          <button className="menu nodrag nopan justify-between"><span className="flex items-center gap-2"><Palette size={14} /> Style</span><ChevronRight size={14} /></button>
          <div className="absolute left-full top-0 hidden w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl group-hover:block group-focus-within:block">
            {([['normal', 'Normal', 'Alt+1'], ['highlighted', 'Highlighted', 'Alt+2'], ['muted', 'Muted', 'Alt+3'], ['red', 'Red', 'Alt+4'], ['black', 'Black', 'Alt+5']] as const).map(([style, label, shortcut]) => <button key={style} className="menu nodrag nopan justify-between" onClick={() => { setItemStyle(contextMenu.itemId, style); setContextMenu(null); }}><span>{label}</span><span className="text-[10px] text-slate-400">{shortcut}</span></button>)}
            <button className="menu nodrag nopan justify-between" onClick={() => { setItemStyle(contextMenu.itemId, "normal"); setContextMenu(null); }}><span>Reset</span><span className="text-[10px] text-slate-400">Alt+0</span></button>
          </div>
        </div>
        <div className="group relative">
          <button className="menu nodrag nopan justify-between"><span className="flex items-center gap-2"><Circle size={14} className="text-slate-400" /> Status</span><ChevronRight size={14} /></button>
          <div className="absolute left-full top-0 hidden w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl group-hover:block group-focus-within:block">
            {([['todo', 'Todo', Circle, 'text-slate-400', 'Alt+6'], ['done', 'Done', CheckCircle2, 'text-emerald-600', 'Alt+7'], ['question', 'Question', HelpCircle, 'text-amber-500', 'Alt+8'], ['important', 'Important', AlertCircle, 'text-red-600', 'Alt+9']] as const).map(([status, label, Icon, color, shortcut]) => <button key={status} className="menu nodrag nopan justify-between" onClick={() => { useBoardStore.getState().setItemStatus(contextMenu.itemId, status); setContextMenu(null); }}><span className="flex items-center gap-2"><Icon size={14} className={color} /> {label}</span><span className="text-[10px] text-slate-400">{shortcut}</span></button>)}
            <button className="menu nodrag nopan justify-between" onClick={() => { useBoardStore.getState().setItemStatus(contextMenu.itemId, null); setContextMenu(null); }}><span>Clear</span><span className="text-[10px] text-slate-400">Alt+Shift+0</span></button>
          </div>
        </div>
        <div className="group relative">
          <button className="menu nodrag nopan justify-between"><span className="flex items-center gap-2"><GitFork size={14} className="text-amber-500" /> Type</span><ChevronRight size={14} /></button>
          <div className="absolute left-full top-0 hidden w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl group-hover:block group-focus-within:block">
            {([['note', 'Note', null, '#94a3b8', 'Alt+Shift+1'], ['decision', 'Decision', GitFork, '#f59e0b', 'Alt+Shift+2'], ['option', 'Option', CircleDot, '#3b82f6', 'Alt+Shift+3'], ['assumption', 'Assumption', HelpCircle, '#8b5cf6', 'Alt+Shift+4'], ['risk', 'Risk', AlertTriangle, '#ef4444', 'Alt+Shift+5'], ['evidence', 'Evidence', FileText, '#22c55e', 'Alt+Shift+6']] as const).map(([type, label, Icon, color, shortcut]) => {
              const currentItem = useBoardStore.getState().items.find((i) => i.id === contextMenu.itemId);
              const currentType = currentItem?.cardType ?? "note";
              return <button key={type} className="menu nodrag nopan justify-between" onClick={() => { useBoardStore.getState().setCardTypeMany([contextMenu.itemId], type); setContextMenu(null); }}><span className="flex items-center gap-2">{Icon ? <Icon size={14} style={{ color }} /> : <span className="inline-block w-[14px]" />} {label}{currentType === type && <span className="ml-1 text-slate-400">✓</span>}</span><span className="text-[10px] text-slate-400">{shortcut}</span></button>;
            })}
          </div>
        </div>
        <button className="menu nodrag nopan text-red-600" onClick={() => { void deleteCard(contextMenu.itemId); setContextMenu(null); }}><Trash2 size={14} /> Delete</button>
      </div>}
      {pendingComment && <ConnectionCommentInput screenX={pendingComment.screenX} screenY={pendingComment.screenY} onCommit={(comment) => { updateConnection(pendingComment.connectionId, { comment }); setPendingComment(null); }} onClose={() => setPendingComment(null)} />}
      {toast && <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">{toast}</div>}
      <button onClick={tidy} className="absolute right-5 bottom-5 z-30 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white">Tidy</button>
      <button onClick={() => window.dispatchEvent(new Event("mymind:open-command-palette"))} className="nodrag nopan absolute right-5 bottom-16 z-30 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-500 shadow-lg transition hover:bg-white hover:text-slate-700" title="Open command palette"><Command size={13} /> {IS_MAC ? "⌘" : "Ctrl"}K</button>
      <button onClick={() => arrangeItems()} className="absolute right-20 bottom-5 z-30 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white">Arrange <span className="text-[10px] text-slate-400">Alt+L</span></button>
      {dragOverCanvas && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/30" />
          <div className="rounded-xl bg-white/90 px-5 py-3 text-sm font-semibold text-indigo-600 shadow-lg">Drop markdown to create cards</div>
        </div>
      )}
      {importPreview && (
        <ImportPreviewDialog
          fileName={importPreview.fileName}
          fileSize={importPreview.fileSize}
          fileText={importPreview.fileText}
          onCancel={() => setImportPreview(null)}
          onImport={(sections) => {
            runImport(sections, importPreview.dropPoint, importPreview.fileName);
            setImportPreview(null);
          }}
        />
      )}
      {myMindGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMyMindGuard(false)}>
          <div className="w-[400px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">This looks like a MyMind export</h3>
            <p className="mt-2 text-xs text-slate-500">
              Re-importing it here would create duplicate cards and lose your connections. Round-trip import is not available yet.
            </p>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setMyMindGuard(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Canvas;
