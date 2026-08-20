import { create } from "zustand";
import type { Item, ItemStatus, CardType, Connection, Map, Folder } from "@/types";
import {
  CARD_DEFAULT_H,
  CARD_DEFAULT_W,
  findFreeCardPosition,
  findFreePillOffset,
  nudgeCardToFree,
  nudgePillToFree,
  tidyLayout,
} from "@/lib/layout";
import { arrangeItems as arrangeLayout } from "@/lib/arrange";
import { alignItems, distributeItems } from "@/lib/align";
import type { AlignMode, DistributeAxis } from "@/lib/align";

type Snapshot = { items: Item[]; connections: Connection[] };

type BoardState = {
  items: Item[];
  connections: Connection[];
  maps: Map[];
  folders: Folder[];
  activeMapId: string | null;
  sidebarCollapsed: boolean;
  markdownPanelCollapsed: boolean;
  markdownDirty: boolean;
  mapLoading: boolean;
  selectedConnectionId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectionHistory: string[];
  activeTagFilter: string | null;
  editingItemId: string | null;
  burstInputOpen: boolean;
  snapEnabled: boolean;
  resizingItemId: string | null;
  connectMode: boolean;
  connectModeSourceId: string | null;
  focusMode: boolean;
  focusedCardId: string | null;
  focusDepth: number;
  history: Snapshot[];
  future: Snapshot[];
  setSnapEnabled: (value: boolean) => void;
  setConnectMode: (active: boolean, sourceId?: string | null) => void;
  setFocusState: (focusMode: boolean, focusedCardId: string | null, focusDepth: number) => void;
  setFocusDepth: (depth: number) => void;
  exitFocus: () => void;
  setMaps: (maps: Map[]) => void;
  setFolders: (folders: Folder[]) => void;
  addMap: (map: Map) => void;
  addFolder: (folder: Folder) => void;
  updateMap: (id: string, patch: Partial<Map>) => void;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  removeMap: (id: string) => void;
  removeFolder: (id: string) => void;
  removeMaps: (ids: string[]) => void;
  removeFolders: (ids: string[]) => void;
  moveMapToFolder: (mapId: string, folderId: string | null) => void;
  moveFolderToParent: (folderId: string, parentId: string | null) => void;
  setActiveMap: (id: string, force?: boolean) => boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMarkdownPanelCollapsed: (collapsed: boolean) => void;
  setMarkdownDirty: (dirty: boolean) => void;
  setMapLoading: (loading: boolean) => void;
  createItem: (posX: number, posY: number, partial?: Partial<Item>, opts?: { startEditing?: boolean; skipNudge?: boolean }) => string;
  createItems: (items: Item[], editingItemId?: string | null) => void;
  createConnectedItem: (sourceId: string) => string | null;
  updateItem: (id: string, patch: Partial<Item>) => void;
  setItemStyle: (id: string, style: "normal" | "highlighted" | "muted" | "red" | "black") => void;
  setItemStyleMany: (ids: string[], style: "normal" | "highlighted" | "muted" | "red" | "black") => void;
  setItemStatus: (id: string, status: ItemStatus | null) => void;
  setItemStatusMany: (ids: string[], status: ItemStatus | null) => void;
  setCardTypeMany: (ids: string[], cardType: CardType) => void;
  getSelectedIds: () => string[];
  deleteItem: (id: string) => void;
  deleteItems: (ids: string[]) => void;
  duplicateItem: (id: string) => string | null;
  createConnection: (sourceId: string, targetId: string, comment: string) => string;
  updateConnection: (id: string, patch: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  reverseConnection: (id: string) => void;
  selectConnection: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  toggleNodeSelection: (id: string) => void;
  selectPreviousCard: () => void;
  selectParentCard: () => string | null;
  cycleConnection: () => void;
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (axis: DistributeAxis) => void;
  scaleSelected: (factor: number) => void;
  resetSizeSelected: () => void;
  setEditingItem: (id: string | null) => void;
  setBurstInputOpen: (open: boolean) => void;
  createBurstItem: (text: string, posX: number, posY: number) => string | null;
  setTagFilter: (tag: string | null) => void;
  loadBoard: (data: { items: Item[]; connections: Connection[] }) => void;
  replaceItems: (items: Item[]) => void;
  replaceConnections: (connections: Connection[]) => void;
  applyMarkdownChanges: (items: Item[], connections: Connection[]) => void;
  clearBoard: () => void;
  commitDrag: (id: string, x: number, y: number) => void;
  commitDragMany: (updates: { id: string; x: number; y: number }[]) => void;
  beginResize: (id: string) => void;
  commitResize: (id: string, width: number, height: number, previousWidth: number | null, previousHeight: number | null) => void;
  commitPillDrag: (id: string, anchorX: number, anchorY: number) => void;
  tidy: () => void;
  arrangeItems: (ids?: string[]) => void;
  undo: () => void;
  redo: () => void;
};

const SNAP_KEY = "mymind.snap";
const SIDEBAR_KEY = "mymind.sidebar.collapsed";
const MARKDOWN_PANEL_KEY = "mymind.markdown-panel.collapsed";
const ACTIVE_MAP_KEY = "mymind.activeMapId";

const initialSnap = typeof window !== "undefined" && localStorage.getItem(SNAP_KEY) === "false" ? false : true;
const initialSidebarCollapsed = typeof window !== "undefined" && localStorage.getItem(SIDEBAR_KEY) === "true";
const initialMarkdownPanelCollapsed = typeof window !== "undefined" && localStorage.getItem(MARKDOWN_PANEL_KEY) === "true";

function pushHistory(state: { items: Item[]; connections: Connection[]; history: Snapshot[] }): { history: Snapshot[]; future: Snapshot[] } {
  const snapshot: Snapshot = { items: state.items, connections: state.connections };
  return { history: [...state.history, snapshot].slice(-50), future: [] };
}

export const useBoardStore = create<BoardState>((set, get) => ({
  items: [],
  connections: [],
  maps: [],
  folders: [],
  activeMapId: null,
  sidebarCollapsed: initialSidebarCollapsed,
  markdownPanelCollapsed: initialMarkdownPanelCollapsed,
  markdownDirty: false,
  mapLoading: false,
  selectedConnectionId: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionHistory: [],
  activeTagFilter: null,
  editingItemId: null,
  burstInputOpen: false,
  snapEnabled: initialSnap,
  resizingItemId: null,
  connectMode: false,
  connectModeSourceId: null,
  focusMode: false,
  focusedCardId: null,
  focusDepth: 1,
  history: [],
  future: [],
  setConnectMode: (active, sourceId = null) => set({ connectMode: active, connectModeSourceId: active ? sourceId : null }),
  setFocusState: (focusMode, focusedCardId, focusDepth) => set({ focusMode, focusedCardId, focusDepth }),
  setFocusDepth: (depth) => set({ focusDepth: depth }),
  exitFocus: () => set({ focusMode: false, focusedCardId: null, focusDepth: 1 }),
  setSnapEnabled: (value) => { localStorage.setItem(SNAP_KEY, String(value)); set({ snapEnabled: value }); },
  setMaps: (maps) => set({ maps }),
  setFolders: (folders) => set({ folders }),
  addMap: (map) => set((s) => ({ maps: [...s.maps, map] })),
  addFolder: (folder) => set((s) => ({ folders: [...s.folders, folder] })),
  updateMap: (id, patch) => set((s) => ({ maps: s.maps.map((m) => m.id === id ? { ...m, ...patch } : m) })),
  updateFolder: (id, patch) => set((s) => ({ folders: s.folders.map((f) => f.id === id ? { ...f, ...patch } : f) })),
  removeMap: (id) => { set((s) => ({ maps: s.maps.filter((m) => m.id !== id) })); },
  removeFolder: (id) => set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
  removeMaps: (ids) => { set((s) => {
    const idSet = new Set(ids);
    return { maps: s.maps.filter((m) => !idSet.has(m.id)) };
  }); },
  removeFolders: (ids) => set((s) => {
    const idSet = new Set(ids);
    return { folders: s.folders.filter((f) => !idSet.has(f.id)) };
  }),
  moveMapToFolder: (mapId, folderId) => set((s) => ({
    maps: s.maps.map((m) => m.id === mapId ? { ...m, folderId } : m),
  })),
  moveFolderToParent: (folderId, parentId) => set((s) => ({
    folders: s.folders.map((f) => f.id === folderId ? { ...f, parentId } : f),
  })),
  setActiveMap: (id, force = false) => {
    if (!force && id === get().activeMapId) return true;
    if (!force && get().markdownDirty && typeof window !== "undefined" && !window.confirm("Discard your unparsed markdown edits and switch maps?")) return false;
    localStorage.setItem(ACTIVE_MAP_KEY, id);
    set({ activeMapId: id, items: [], connections: [], markdownDirty: false, selectedConnectionId: null, selectedNodeId: null, selectedNodeIds: [], selectionHistory: [], activeTagFilter: null, editingItemId: null, history: [], future: [], focusMode: false, focusedCardId: null, focusDepth: 1 });
    return true;
  },
  setSidebarCollapsed: (collapsed) => { localStorage.setItem(SIDEBAR_KEY, String(collapsed)); set({ sidebarCollapsed: collapsed }); },
  setMarkdownPanelCollapsed: (collapsed) => { localStorage.setItem(MARKDOWN_PANEL_KEY, String(collapsed)); set({ markdownPanelCollapsed: collapsed }); },
  setMarkdownDirty: (dirty) => set({ markdownDirty: dirty }),
  setMapLoading: (loading) => set({ mapLoading: loading }),
  createItem: (posX, posY, partial, opts) => {
    const state = get();
    if (!state.activeMapId) { console.warn("createItem called with no active map"); return ""; }
    const activeMapId = state.activeMapId;
    const position = opts?.skipNudge ? { x: posX, y: posY } : findFreeCardPosition(posX, posY, state.items, undefined, partial?.description);
    const id = crypto.randomUUID();
    const item: Item = { id, title: partial?.title ?? "Untitled", tags: partial?.tags ?? [], createdAt: new Date().toISOString(), dueDate: partial?.dueDate ?? null, description: partial?.description ?? "", posX: position.x, posY: position.y, color: partial?.color ?? null, width: partial?.width ?? null, height: partial?.height ?? null, scale: null, status: partial?.status ?? null, cardType: partial?.cardType ?? "note", mapId: activeMapId };
    set((s) => ({ items: [...s.items, item], selectedNodeId: id, selectedNodeIds: [id], editingItemId: opts?.startEditing ? id : s.editingItemId, ...pushHistory(s) }));
    return id;
  },
  createItems: (items, editingItemId = null) => {
    if (items.length === 0) return;
    set((s) => ({
      ...pushHistory(s),
      items: [...s.items, ...items],
      selectedNodeId: items.length === 1 ? items[0].id : null,
      selectedNodeIds: items.map((item) => item.id),
      selectedConnectionId: null,
      editingItemId,
    }));
  },
  createConnectedItem: (sourceId) => {
    const state = get();
    if (!state.activeMapId) return null;
    const source = state.items.find((item) => item.id === sourceId);
    if (!source) return null;
    const position = findFreeCardPosition(source.posX + 300, source.posY, state.items, undefined, "");
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: Item = { id: newId, title: "Untitled", tags: [], createdAt: now, dueDate: null, description: "", posX: position.x, posY: position.y, color: null, width: null, height: null, scale: null, status: null, cardType: "note", mapId: state.activeMapId };
    const connection: Connection = { id: crypto.randomUUID(), sourceId, targetId: newId, comment: "", labelDx: 60, labelDy: -40, mapId: state.activeMapId };
    set((s) => ({ ...pushHistory(s), items: [...s.items, item], connections: [...s.connections, connection], selectedNodeId: newId, selectedNodeIds: [newId], selectedConnectionId: null, editingItemId: newId }));
    return newId;
  },
  updateItem: (id, patch) => set((s) => ({ items: s.items.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  setItemStyle: (id, style) => set((s) => {
    const next = style === "normal" ? null : style;
    const current = s.items.find((item) => item.id === id)?.color ?? null;
    if (current === next) return {};
    return { ...pushHistory(s), items: s.items.map((item) => item.id === id ? { ...item, color: next } : item) };
  }),
  setItemStyleMany: (ids, style) => set((s) => {
    if (ids.length === 0) return {};
    const idSet = new Set(ids);
    const next = style === "normal" ? null : style;
    const anyChange = s.items.some((item) => idSet.has(item.id) && (item.color ?? null) !== next);
    if (!anyChange) return {};
    return { ...pushHistory(s), items: s.items.map((item) => idSet.has(item.id) ? { ...item, color: next } : item) };
  }),
  setItemStatus: (id, status) => set((s) => {
    const current = s.items.find((item) => item.id === id)?.status ?? null;
    if (current === status) return {};
    return { ...pushHistory(s), items: s.items.map((item) => item.id === id ? { ...item, status } : item) };
  }),
  setItemStatusMany: (ids, status) => set((s) => {
    if (ids.length === 0) return {};
    const idSet = new Set(ids);
    const anyChange = s.items.some((item) => idSet.has(item.id) && (item.status ?? null) !== status);
    if (!anyChange) return {};
    return { ...pushHistory(s), items: s.items.map((item) => idSet.has(item.id) ? { ...item, status } : item) };
  }),
  setCardTypeMany: (ids, cardType) => set((s) => {
    if (ids.length === 0) return {};
    const idSet = new Set(ids);
    const anyChange = s.items.some((item) => idSet.has(item.id) && (item.cardType ?? "note") !== cardType);
    if (!anyChange) return {};
    return { ...pushHistory(s), items: s.items.map((item) => idSet.has(item.id) ? { ...item, cardType } : item) };
  }),
  getSelectedIds: () => {
    const s = get();
    return s.selectedNodeIds.length > 0 ? s.selectedNodeIds : s.selectedNodeId ? [s.selectedNodeId] : [];
  },
  deleteItem: (id) => { set((s) => ({ ...pushHistory(s), items: s.items.filter((item) => item.id !== id), connections: s.connections.filter((connection) => connection.sourceId !== id && connection.targetId !== id), editingItemId: s.editingItemId === id ? null : s.editingItemId })); },
  deleteItems: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    set((s) => ({
      ...pushHistory(s),
      items: s.items.filter((item) => !idSet.has(item.id)),
      connections: s.connections.filter((connection) => !idSet.has(connection.sourceId) && !idSet.has(connection.targetId)),
      editingItemId: s.editingItemId && idSet.has(s.editingItemId) ? null : s.editingItemId,
      selectedNodeId: null,
      selectedNodeIds: [],
      selectedConnectionId: null,
    }));
  },
  duplicateItem: (id) => {
    const state = get();
    if (!state.activeMapId) { console.warn("duplicateItem called with no active map"); return null; }
    const original = state.items.find((item) => item.id === id);
    if (!original) return null;
    const position = findFreeCardPosition(original.posX + 32, original.posY + 32, state.items, id, original.description);
    const newId = crypto.randomUUID();
    const copy: Item = { ...original, id: newId, title: `${original.title} copy`, posX: position.x, posY: position.y, createdAt: new Date().toISOString() };
    set((s) => ({ ...pushHistory(s), items: [...s.items, copy], selectedNodeId: newId, selectedNodeIds: [newId], editingItemId: newId }));
    return newId;
  },
  createConnection: (sourceId, targetId, comment) => {
    const state = get();
    if (!state.activeMapId) { console.warn("createConnection called with no active map"); return ""; }
    const activeMapId = state.activeMapId;
    const id = crypto.randomUUID();
    const source = state.items.find((item) => item.id === sourceId);
    const target = state.items.find((item) => item.id === targetId);
    let labelDx = 60;
    let labelDy = -40;
    if (source && target) {
      const anchorX = (source.posX + 240 / 2 + target.posX + 240 / 2) / 2;
      const anchorY = (source.posY + 92 / 2 + target.posY + 92 / 2) / 2;
      const otherPills = state.connections
        .filter((c) => c.id !== id)
        .map((c) => {
          const s = state.items.find((it) => it.id === c.sourceId);
          const t = state.items.find((it) => it.id === c.targetId);
          if (!s || !t) return null;
          const ax = (s.posX + 120 + t.posX + 120) / 2;
          const ay = (s.posY + 46 + t.posY + 46) / 2;
          return { x: ax + c.labelDx, y: ay + c.labelDy };
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      const offset = findFreePillOffset(anchorX, anchorY, state.items, otherPills);
      labelDx = offset.dx;
      labelDy = offset.dy;
    }
    set((s) => ({ ...pushHistory(s), connections: [...s.connections, { id, sourceId, targetId, comment, labelDx, labelDy, mapId: activeMapId }] }));
    return id;
  },
  updateConnection: (id, patch) => set((s) => ({ connections: s.connections.map((connection) => connection.id === id ? { ...connection, ...patch } : connection) })),
  deleteConnection: (id) => set((s) => ({ ...pushHistory(s), connections: s.connections.filter((connection) => connection.id !== id), selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId })),
  reverseConnection: (id) => set((s) => ({ ...pushHistory(s), connections: s.connections.map((connection) => connection.id === id ? { ...connection, sourceId: connection.targetId, targetId: connection.sourceId } : connection) })),
  selectConnection: (id) => set({ selectedConnectionId: id, selectedNodeId: null }),
  setSelectedNode: (id) => set((s) => {
    if (id === s.selectedNodeId) return { selectedConnectionId: null, selectedNodeIds: id ? [id] : [] };
    const nextHistory = s.selectedNodeId ? [...s.selectionHistory, s.selectedNodeId].slice(-20) : s.selectionHistory;
    return { selectedNodeId: id, selectedNodeIds: id ? [id] : [], selectionHistory: nextHistory, selectedConnectionId: null };
  }),
  toggleNodeSelection: (id) => set((s) => {
    if (s.selectedNodeIds.includes(id)) {
      const next = s.selectedNodeIds.filter((nid) => nid !== id);
      return { selectedNodeIds: next, selectedNodeId: next.length === 1 ? next[0] : null, selectedConnectionId: null };
    }
    const next = [...s.selectedNodeIds, id];
    return { selectedNodeIds: next, selectedNodeId: next.length === 1 ? next[0] : null, selectedConnectionId: null };
  }),
  selectPreviousCard: () => set((s) => {
    const previousId = s.selectionHistory[s.selectionHistory.length - 1];
    if (!previousId || !s.items.some((item) => item.id === previousId)) return {};
    return { selectedNodeId: previousId, selectedNodeIds: [previousId], selectionHistory: s.selectionHistory.slice(0, -1), selectedConnectionId: null };
  }),
  selectParentCard: () => {
    const s = get();
    const currentId = s.selectedNodeId;
    if (!currentId) return null;
    const parentConns = s.connections.filter((c) => c.targetId === currentId);
    if (parentConns.length > 0) {
      const parentConn = parentConns[parentConns.length - 1];
      const parentId = parentConn.sourceId;
      if (s.items.some((item) => item.id === parentId)) {
        set({ selectedNodeId: parentId, selectedNodeIds: [parentId], selectedConnectionId: null });
        return parentId;
      }
    }
    const previousId = s.selectionHistory[s.selectionHistory.length - 1];
    if (previousId && s.items.some((item) => item.id === previousId)) {
      set({ selectedNodeId: previousId, selectedNodeIds: [previousId], selectedConnectionId: null });
      return previousId;
    }
    return null;
  },
  setEditingItem: (id) => set({ editingItemId: id }),
  cycleConnection: () => {
    const s = get();
    const selectedId = s.selectedNodeId;
    if (!selectedId) return;
    const attached = s.connections.filter((c) => c.sourceId === selectedId || c.targetId === selectedId);
    if (attached.length === 0) return;
    if (!s.selectedConnectionId) {
      set({ selectedConnectionId: attached[0].id, selectedNodeId: null, selectedNodeIds: [] });
      return;
    }
    const currentIdx = attached.findIndex((c) => c.id === s.selectedConnectionId);
    if (currentIdx === -1) {
      set({ selectedConnectionId: attached[0].id, selectedNodeId: null, selectedNodeIds: [] });
      return;
    }
    const nextIdx = (currentIdx + 1) % attached.length;
    set({ selectedConnectionId: attached[nextIdx].id, selectedNodeId: null, selectedNodeIds: [] });
  },
  setBurstInputOpen: (open) => set({ burstInputOpen: open }),
  createBurstItem: (text, posX, posY) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const state = get();
    if (!state.activeMapId) return null;
    const activeMapId = state.activeMapId;
    const isLong = trimmed.length > 80;
    const title = isLong ? "" : trimmed;
    const description = isLong ? trimmed : "";
    const id = crypto.randomUUID();
    const item: Item = { id, title, tags: [], createdAt: new Date().toISOString(), dueDate: null, description, posX, posY, color: null, width: null, height: null, scale: null, status: null, cardType: "note", mapId: activeMapId };
    set((s) => ({ ...pushHistory(s), items: [...s.items, item] }));
    return id;
  },
  setTagFilter: (tag) => set({ activeTagFilter: tag }),
  loadBoard: (data) => { set({ items: data.items.map((item) => ({ ...item, width: item.width ?? null, height: item.height ?? null, scale: item.scale ?? null, status: item.status ?? null, cardType: item.cardType ?? "note" })), connections: data.connections, selectedConnectionId: null, selectedNodeId: null, selectedNodeIds: [], selectionHistory: [], activeTagFilter: null, editingItemId: null, history: [], future: [], focusMode: false, focusedCardId: null, focusDepth: 1 }); },
  replaceItems: (items) => { set({ items }); },
  replaceConnections: (connections) => set({ connections }),
  applyMarkdownChanges: (items, connections) => { set((s) => ({ ...pushHistory(s), items, connections, markdownDirty: false, editingItemId: null, selectedConnectionId: null, selectedNodeId: null, selectedNodeIds: [] })); },
  clearBoard: () => { set({ items: [], connections: [], maps: [], activeMapId: null, markdownDirty: false, selectedConnectionId: null, selectedNodeId: null, selectionHistory: [], activeTagFilter: null, editingItemId: null, resizingItemId: null, history: [], future: [] }); },
  commitDrag: (id, x, y) => {
    const state = get();
    const nudged = nudgeCardToFree({ ...state.items.find((it) => it.id === id)!, posX: x, posY: y }, state.items);
    set((s) => ({ ...pushHistory(s), items: s.items.map((item) => item.id === id ? { ...item, posX: nudged.x, posY: nudged.y } : item) }));
  },
  commitDragMany: (updates) => set((s) => {
    if (updates.length === 0) return {};
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    return {
      ...pushHistory(s),
      items: s.items.map((item) => {
        const u = updateMap.get(item.id);
        return u ? { ...item, posX: u.x, posY: u.y } : item;
      }),
    };
  }),
  beginResize: (id) => set({ resizingItemId: id }),
  commitResize: (id, width, height, previousWidth, previousHeight) => set((s) => {
    const current = s.items.find((item) => item.id === id);
    if (!current || (current.width ?? null) === width && (current.height ?? null) === height) return { resizingItemId: null };
    const previousItems = s.items.map((item) => item.id === id ? { ...item, width: previousWidth, height: previousHeight } : item);
    return {
      ...pushHistory({ ...s, items: previousItems }),
      items: s.items.map((item) => item.id === id ? { ...item, width, height } : item),
      resizingItemId: null,
    };
  }),
  commitPillDrag: (id, anchorX, anchorY) => {
    const state = get();
    const conn = state.connections.find((c) => c.id === id);
    if (!conn) return;
    const otherPills = state.connections
      .filter((c) => c.id !== id)
      .map((c) => {
        const s = state.items.find((it) => it.id === c.sourceId);
        const t = state.items.find((it) => it.id === c.targetId);
        if (!s || !t) return null;
        const ax = (s.posX + 120 + t.posX + 120) / 2;
        const ay = (s.posY + 46 + t.posY + 46) / 2;
        return { x: ax + c.labelDx, y: ay + c.labelDy };
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    const nudged = nudgePillToFree(anchorX, anchorY, conn.labelDx, conn.labelDy, state.items, otherPills);
    set((s) => ({ connections: s.connections.map((c) => c.id === id ? { ...c, labelDx: nudged.dx, labelDy: nudged.dy } : c) }));
  },
  tidy: () => {
    const state = get();
    const positions = tidyLayout(state.items, state.connections);
    const nextItems = state.items.map((item) => {
      const pos = positions.get(item.id);
      return pos ? { ...item, posX: pos.x, posY: pos.y } : item;
    });
    const placedPills: { x: number; y: number }[] = [];
    const nextConnections = state.connections.map((connection) => {
      const source = nextItems.find((item) => item.id === connection.sourceId);
      const target = nextItems.find((item) => item.id === connection.targetId);
      if (!source || !target) return connection;
      const anchorX = (source.posX + 120 + target.posX + 120) / 2;
      const anchorY = (source.posY + 46 + target.posY + 46) / 2;
      const offset = findFreePillOffset(anchorX, anchorY, nextItems, placedPills);
      placedPills.push({ x: anchorX + offset.dx, y: anchorY + offset.dy });
      return { ...connection, labelDx: offset.dx, labelDy: offset.dy };
    });
    set((s) => ({ ...pushHistory(s), items: nextItems, connections: nextConnections }));
  },
  alignSelected: (mode) => {
    const state = get();
    if (state.selectedNodeIds.length < 2) return;
    const idSet = new Set(state.selectedNodeIds);
    const selected = state.items.filter((item) => idSet.has(item.id));
    if (selected.length < 2) return;
    const positions = alignItems(selected, mode);
    if (positions.size === 0) return;
    const nextItems = state.items.map((item) => {
      const pos = positions.get(item.id);
      return pos ? { ...item, posX: pos.x, posY: pos.y } : item;
    });
    set((s) => ({ ...pushHistory(s), items: nextItems }));
  },
  distributeSelected: (axis) => {
    const state = get();
    if (state.selectedNodeIds.length < 3) return;
    const idSet = new Set(state.selectedNodeIds);
    const selected = state.items.filter((item) => idSet.has(item.id));
    if (selected.length < 3) return;
    const positions = distributeItems(selected, axis);
    if (positions.size === 0) return;
    const nextItems = state.items.map((item) => {
      const pos = positions.get(item.id);
      return pos ? { ...item, posX: pos.x, posY: pos.y } : item;
    });
    set((s) => ({ ...pushHistory(s), items: nextItems }));
  },
  scaleSelected: (factor) => {
    const state = get();
    if (state.selectedNodeIds.length === 0) return;
    const idSet = new Set(state.selectedNodeIds);
    const selected = state.items.filter((item) => idSet.has(item.id));
    if (selected.length === 0) return;
    const MIN_W = 180;
    const MAX_W = 700;
    const MIN_H = CARD_DEFAULT_H;
    const MAX_H = 800;
    const MIN_SCALE = 0.6;
    const MAX_SCALE = 2.5;
    const computeW = (item: Item) => Math.round(Math.min(Math.max((item.width ?? CARD_DEFAULT_W) * factor, MIN_W), MAX_W));
    const computeH = (item: Item) => Math.round(Math.min(Math.max((item.height ?? CARD_DEFAULT_H) * factor, MIN_H), MAX_H));
    const computeScale = (item: Item) => Math.round(Math.min(Math.max((item.scale ?? 1) * factor, MIN_SCALE), MAX_SCALE) * 100) / 100;
    const allClamped = selected.every(
      (item) => {
        const w = item.width ?? CARD_DEFAULT_W;
        const h = item.height ?? CARD_DEFAULT_H;
        const sc = item.scale ?? 1;
        const nw = Math.min(Math.max(w * factor, MIN_W), MAX_W);
        const nh = Math.min(Math.max(h * factor, MIN_H), MAX_H);
        const ns = Math.min(Math.max(sc * factor, MIN_SCALE), MAX_SCALE);
        return Math.round(nw) === w && Math.round(nh) === h && Math.round(ns * 100) / 100 === sc;
      },
    );
    if (allClamped) return;
    let cx = 0;
    let cy = 0;
    for (const item of selected) {
      const w = item.width ?? CARD_DEFAULT_W;
      const h = item.height ?? CARD_DEFAULT_H;
      cx += item.posX + w / 2;
      cy += item.posY + h / 2;
    }
    cx /= selected.length;
    cy /= selected.length;
    const nextItems = state.items.map((item) => {
      if (!idSet.has(item.id)) return item;
      const newW = computeW(item);
      const newH = computeH(item);
      const newScale = computeScale(item);
      const oldW = item.width ?? CARD_DEFAULT_W;
      const oldH = item.height ?? CARD_DEFAULT_H;
      const newPosX = cx + (item.posX + oldW / 2 - cx) * (newW / oldW) - newW / 2;
      const newPosY = cy + (item.posY + oldH / 2 - cy) * (newH / oldH) - newH / 2;
      return { ...item, width: newW, height: newH, scale: newScale, posX: Math.round(newPosX), posY: Math.round(newPosY) };
    });
    set((s) => ({ ...pushHistory(s), items: nextItems }));
  },
  resetSizeSelected: () => {
    const state = get();
    if (state.selectedNodeIds.length === 0) return;
    const idSet = new Set(state.selectedNodeIds);
    const anyCustom = state.items.some((item) => idSet.has(item.id) && (item.width !== null || item.height !== null || item.scale !== null));
    if (!anyCustom) return;
    const nextItems = state.items.map((item) =>
      idSet.has(item.id) ? { ...item, width: null, height: null, scale: null } : item,
    );
    set((s) => ({ ...pushHistory(s), items: nextItems }));
  },
  arrangeItems: (ids) => {
    const state = get();
    if (state.items.length === 0) return;
    const scoped = ids && ids.length > 0;
    const idSet = scoped ? new Set(ids as string[]) : null;
    const layoutItems = idSet ? state.items.filter((item) => idSet.has(item.id)) : state.items;
    if (layoutItems.length === 0) return;
    const layoutConns = idSet
      ? state.connections.filter((c) => idSet.has(c.sourceId) && idSet.has(c.targetId))
      : state.connections;
    const positions = arrangeLayout(layoutItems, layoutConns);
    let nextItems = state.items.map((item) => {
      const pos = positions.get(item.id);
      return pos ? { ...item, posX: pos.x, posY: pos.y } : item;
    });
    if (scoped) {
      let minX = Infinity;
      let minY = Infinity;
      for (const item of layoutItems) {
        minX = Math.min(minX, item.posX);
        minY = Math.min(minY, item.posY);
      }
      let layoutMinX = Infinity;
      let layoutMinY = Infinity;
      positions.forEach((pos) => {
        layoutMinX = Math.min(layoutMinX, pos.x);
        layoutMinY = Math.min(layoutMinY, pos.y);
      });
      const dx = minX - layoutMinX;
      const dy = minY - layoutMinY;
      if (dx !== 0 || dy !== 0) {
        const movedIds = new Set(positions.keys());
        nextItems = nextItems.map((item) =>
          movedIds.has(item.id) ? { ...item, posX: item.posX + dx, posY: item.posY + dy } : item,
        );
      }
    }
    set((s) => ({ ...pushHistory(s), items: nextItems }));
  },
  undo: () => set((s) => {
    if (s.history.length === 0) return {};
    const prev = s.history[s.history.length - 1];
    const current: Snapshot = { items: s.items, connections: s.connections };
    return { items: prev.items, connections: prev.connections, history: s.history.slice(0, -1), future: [...s.future, current].slice(-50) };
  }),
  redo: () => set((s) => {
    if (s.future.length === 0) return {};
    const next = s.future[s.future.length - 1];
    const current: Snapshot = { items: s.items, connections: s.connections };
    return { items: next.items, connections: next.connections, future: s.future.slice(0, -1), history: [...s.history, current].slice(-50) };
  }),
}));
