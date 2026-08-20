import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileDown, FileJson, FileText, Grid3x3, LogOut, Network, Plus, Tags, Upload, X } from "lucide-react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import Canvas from "@/components/Canvas";
import BurstInput from "@/components/BurstInput";
import FitViewButton from "@/components/FitViewButton";
import MapSidebar from "@/components/MapSidebar";
import MarkdownPanel from "@/components/MarkdownPanel";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import { assertNoDuplicates, assertAllActionsBound, assertAllBindingsHandled, matchBinding, type Action } from "@/lib/keyboardBindings";
import { exportMapToPdf } from "@/utils/exportMapToPdf";
import { computeReadingOrder } from "@/utils/pdfAppendix";
import PdfExportDialog from "@/components/PdfExportDialog";
import CommandPalette from "@/components/CommandPalette";
import CanvasErrorBoundary from "@/components/CanvasErrorBoundary";
import type { Item, Connection, Map, Folder, CardType } from "@/types";

const ACTIVE_MAP_KEY = "mymind.activeMapId";

const signOut = () => void supabase.auth.signOut();

function NewItemButton() {
  const { screenToFlowPosition } = useReactFlow();
  const activeMapId = useBoardStore((s) => s.activeMapId);
  const createItem = useBoardStore((s) => s.createItem);
  return (
    <button
      disabled={!activeMapId}
      title="New item (N)"
      onClick={() => {
        const sidebarWidth = useBoardStore.getState().sidebarCollapsed ? 0 : 240;
        const center = screenToFlowPosition({ x: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, y: window.innerHeight / 2 });
        createItem(center.x, center.y, undefined, { startEditing: true });
      }}
      className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus size={16} /> New item
    </button>
  );
}

function KeyboardShortcuts() {
  const { screenToFlowPosition, flowToScreenPosition, setCenter, getZoom, fitView } = useReactFlow();

  useEffect(() => {
    assertNoDuplicates();
    assertAllActionsBound();
    const handledActions = new Set(["toggleMarkdown","undo","redo","escape","deleteCards","newCard","burstEntry","editTitle","arrange","alignLeft","alignRight","alignTop","alignBottom","distributeH","distributeV","colourNormal","colourHighlighted","colourMuted","colourRed","colourBlack","statusTodo","statusDone","statusQuestion","statusImportant","clearStatus","scaleUp","scaleDown","resetSize","nudgeUp","nudgeDown","nudgeLeft","nudgeRight","nudgeUp1","nudgeDown1","nudgeLeft1","nudgeRight1","navUp","navDown","navLeft","navRight","tabNext","tabPrev","connectMode","selectNextConnection","openPopupEditor","toggleSidebar","fitView","tidy","toggleSnap","exportPdf","toggleFocus","focusDepthIncrease","focusDepthDecrease","openCommandPalette","typeNote","typeDecision","typeOption","typeAssumption","typeRisk","typeEvidence"]);
    assertAllBindingsHandled(handledActions);

    const reassertEditorFocus = (delay: number) => {
      const editingNow = useBoardStore.getState().editingItemId;
      if (!editingNow) return;
      window.setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>(`input[data-inline-title="${editingNow}"]`);
        if (el) { el.focus(); el.setSelectionRange(0, el.value.length); }
      }, delay);
    };

    const panIfNeeded = (posX: number, posY: number, cardW = 240, cardH = 92) => {
      const screenPosition = flowToScreenPosition({ x: posX, y: posY });
      const sidebarWidth = useBoardStore.getState().sidebarCollapsed ? 0 : 240;
      const isOutside = screenPosition.x < sidebarWidth + 16 || screenPosition.x + cardW > window.innerWidth - 16 || screenPosition.y < 16 || screenPosition.y + cardH > window.innerHeight - 16;
      if (isOutside) {
        setCenter(posX + cardW / 2, posY + cardH / 2, { zoom: getZoom(), duration: 250 });
        return true;
      }
      return false;
    };

    const runAction = (action: Action, event: KeyboardEvent) => {
      const state = useBoardStore.getState();

      switch (action) {
        case "toggleMarkdown": {
          state.setMarkdownPanelCollapsed(!state.markdownPanelCollapsed);
          break;
        }
        case "undo": {
          state.undo();
          break;
        }
        case "redo": {
          state.redo();
          break;
        }
        case "escape": {
          // Innermost overlay first: burst input, popup editor, shortcuts modal
          // all listen for Escape themselves with stopPropagation. If we reach
          // here, none of them consumed it.
          if (state.connectMode) {
            state.setConnectMode(false);
            break;
          }
          if (state.editingItemId) {
            // First Escape: commit the edit, exit editor, keep card selected,
            // return focus to the canvas pane.
            state.setEditingItem(null);
            // Return focus to the React Flow pane so canvas-scope shortcuts work.
            const pane = document.querySelector(".react-flow__pane") as HTMLElement | null;
            if (pane) pane.focus();
            break;
          }
          // Second Escape: clear selection.
          useBoardStore.setState({ selectedNodeId: null, selectedNodeIds: [], selectedConnectionId: null });
          window.dispatchEvent(new Event("mymind:dismiss-overlays"));
          break;
        }
        case "deleteCards": {
          if (state.selectedConnectionId && state.getSelectedIds().length === 0) {
            void supabase.from("connections").delete().eq("id", state.selectedConnectionId).then(({ error }) => {
              if (error) console.error("Supabase connection delete failed", error);
              else useBoardStore.getState().deleteConnection(state.selectedConnectionId as string);
            });
            break;
          }
          const ids = state.getSelectedIds();
          if (ids.length === 0) break;
          const idSet = new Set(ids);
          const connectionIds = state.connections
            .filter((c) => idSet.has(c.sourceId) || idSet.has(c.targetId))
            .map((c) => c.id);
          void (async () => {
            if (connectionIds.length > 0) {
              const err = (await supabase.from("connections").delete().in("id", connectionIds)).error;
              if (err) { console.error("Supabase connection delete failed", err); return; }
            }
            const itemErr = (await supabase.from("items").delete().in("id", ids)).error;
            if (itemErr) { console.error("Supabase item delete failed", itemErr); return; }
            useBoardStore.getState().deleteItems(ids);
          })();
          break;
        }
        case "newCard": {
          if (!state.activeMapId) break;
          const sidebarWidth = state.sidebarCollapsed ? 0 : 240;
          const center = screenToFlowPosition({ x: sidebarWidth + (window.innerWidth - sidebarWidth) / 2, y: window.innerHeight / 2 });
          state.createItem(center.x, center.y, undefined, { startEditing: true });
          break;
        }
        case "burstEntry": {
          if (!state.activeMapId) break;
          state.setBurstInputOpen(true);
          break;
        }
        case "editTitle": {
          if (state.connectMode && state.connectModeSourceId) {
            const targetIds = state.getSelectedIds();
            if (targetIds.length === 0) break;
            const targetId = targetIds[0];
            if (targetId === state.connectModeSourceId) break;
            state.createConnection(state.connectModeSourceId, targetId, "");
            state.setConnectMode(false);
            break;
          }
          const ids = state.getSelectedIds();
          if (ids.length === 0) break;
          state.setEditingItem(ids[0]);
          break;
        }
        case "arrange": {
          const ids = state.getSelectedIds();
          if (state.focusMode) {
            const visible = focusVisibleIds(state);
            state.arrangeItems(ids.length > 0 ? ids.filter((id) => visible.has(id)) : [...visible]);
          } else {
            state.arrangeItems(ids.length > 0 ? ids : undefined);
          }
          break;
        }
        case "alignLeft": { focusAwareAlign(state, "left"); break; }
        case "alignRight": { focusAwareAlign(state, "right"); break; }
        case "alignTop": { focusAwareAlign(state, "top"); break; }
        case "alignBottom": { focusAwareAlign(state, "bottom"); break; }
        case "distributeH": { focusAwareDistribute(state, "horizontal"); break; }
        case "distributeV": { focusAwareDistribute(state, "vertical"); break; }
        case "colourNormal": { applyStyle("normal"); break; }
        case "colourHighlighted": { applyStyle("highlighted"); break; }
        case "colourMuted": { applyStyle("muted"); break; }
        case "colourRed": { applyStyle("red"); break; }
        case "colourBlack": { applyStyle("black"); break; }
        case "statusTodo": { applyStatus("todo"); break; }
        case "statusDone": { applyStatus("done"); break; }
        case "statusQuestion": { applyStatus("question"); break; }
        case "statusImportant": { applyStatus("important"); break; }
        case "clearStatus": {
          const ids = useBoardStore.getState().getSelectedIds();
          if (ids.length > 0) useBoardStore.getState().setItemStatusMany(ids, null);
          break;
        }
        case "scaleUp": {
          const ids = useBoardStore.getState().getSelectedIds();
          if (ids.length > 0) useBoardStore.getState().scaleSelected(1.1);
          break;
        }
        case "scaleDown": {
          const ids = useBoardStore.getState().getSelectedIds();
          if (ids.length > 0) useBoardStore.getState().scaleSelected(1 / 1.1);
          break;
        }
        case "resetSize": {
          const ids = useBoardStore.getState().getSelectedIds();
          if (ids.length > 0) useBoardStore.getState().resetSizeSelected();
          break;
        }
        case "nudgeUp": { nudge(state, 0, -16); break; }
        case "nudgeDown": { nudge(state, 0, 16); break; }
        case "nudgeLeft": { nudge(state, -16, 0); break; }
        case "nudgeRight": { nudge(state, 16, 0); break; }
        case "nudgeUp1": { nudge(state, 0, -1); break; }
        case "nudgeDown1": { nudge(state, 0, 1); break; }
        case "nudgeLeft1": { nudge(state, -1, 0); break; }
        case "nudgeRight1": { nudge(state, 1, 0); break; }
        case "navUp": { navigate(state, 0, -1); break; }
        case "navDown": { navigate(state, 0, 1); break; }
        case "navLeft": { navigate(state, -1, 0); break; }
        case "navRight": { navigate(state, 1, 0); break; }
        case "tabNext": { doTabNext(); break; }
        case "tabPrev": { doTabPrev(); break; }
        case "connectMode": {
          const ids = state.getSelectedIds();
          if (ids.length === 0) break;
          state.setConnectMode(true, ids[0]);
          break;
        }
        case "selectNextConnection": {
          state.cycleConnection();
          break;
        }
        case "openPopupEditor": {
          const ids = state.getSelectedIds();
          if (ids.length === 0) break;
          window.dispatchEvent(new CustomEvent("mymind:open-popup-editor", { detail: { id: ids[0] } }));
          break;
        }
        case "toggleSidebar": {
          state.setSidebarCollapsed(!state.sidebarCollapsed);
          break;
        }
        case "fitView": {
          fitView({ maxZoom: 1, padding: 0.2 });
          break;
        }
        case "tidy": {
          state.tidy();
          break;
        }
        case "toggleSnap": {
          state.setSnapEnabled(!state.snapEnabled);
          break;
        }
        case "exportPdf": {
          window.dispatchEvent(new CustomEvent("mymind:export-pdf"));
          break;
        }
        case "toggleFocus": {
          const st = useBoardStore.getState();
          if (st.focusMode) { st.exitFocus(); break; }
          const ids = st.getSelectedIds();
          if (ids.length !== 1) break;
          st.setFocusState(true, ids[0], 1);
          break;
        }
        case "focusDepthIncrease": {
          const st = useBoardStore.getState();
          if (!st.focusMode) break;
          const maxDist = (() => {
            let max = 0;
            const adj = new Map<string, string[]>();
            for (const it of st.items) adj.set(it.id, []);
            for (const c of st.connections) { adj.get(c.sourceId)?.push(c.targetId); adj.get(c.targetId)?.push(c.sourceId); }
            const dist = new Map<string, number>();
            for (const it of st.items) dist.set(it.id, Infinity);
            if (!st.focusedCardId) return 0;
            dist.set(st.focusedCardId, 0);
            const q: string[] = [st.focusedCardId];
            while (q.length) { const cur = q.shift()!; const d = dist.get(cur)!; for (const n of adj.get(cur) ?? []) { if (dist.get(n) !== Infinity) continue; dist.set(n, d + 1); q.push(n); } }
            for (const d of dist.values()) if (d !== Infinity && d > max) max = d;
            return max;
          })();
          if (st.focusDepth < maxDist) st.setFocusDepth(st.focusDepth + 1);
          break;
        }
        case "focusDepthDecrease": {
          const st = useBoardStore.getState();
          if (!st.focusMode) break;
          if (st.focusDepth > 1) st.setFocusDepth(st.focusDepth - 1);
          break;
        }
        case "openCommandPalette": {
          window.dispatchEvent(new Event("mymind:open-command-palette"));
          break;
        }
        case "typeNote": { applyCardType("note"); break; }
        case "typeDecision": { applyCardType("decision"); break; }
        case "typeOption": { applyCardType("option"); break; }
        case "typeAssumption": { applyCardType("assumption"); break; }
        case "typeRisk": { applyCardType("risk"); break; }
        case "typeEvidence": { applyCardType("evidence"); break; }
      }
    };

    const doTabNext = () => {
      const st = useBoardStore.getState();
      if (!st.activeMapId) return;
      const ids = st.getSelectedIds();
      if (ids.length === 0) return;
      const newId = st.createConnectedItem(ids[0]);
      if (!newId) return;
      const newItem = useBoardStore.getState().items.find((i) => i.id === newId);
      if (!newItem) return;
      window.dispatchEvent(new CustomEvent("mymind:creation-highlight", { detail: { id: newId } }));
      const panned = panIfNeeded(newItem.posX, newItem.posY);
      if (panned) reassertEditorFocus(270);
    };

    const doTabPrev = () => {
      const st = useBoardStore.getState();
      if (st.items.length === 0) return;
      const prevId = st.selectParentCard();
      if (!prevId) return;
      useBoardStore.getState().setEditingItem(prevId);
      const prevItem = useBoardStore.getState().items.find((i) => i.id === prevId);
      if (!prevItem) return;
      const panned = panIfNeeded(prevItem.posX, prevItem.posY);
      if (panned) reassertEditorFocus(270);
    };

    const applyStyle = (style: "normal" | "highlighted" | "muted" | "red" | "black") => {
      const ids = useBoardStore.getState().getSelectedIds();
      if (ids.length > 0) useBoardStore.getState().setItemStyleMany(ids, style);
    };

    const applyStatus = (status: "todo" | "done" | "question" | "important") => {
      const ids = useBoardStore.getState().getSelectedIds();
      if (ids.length > 0) useBoardStore.getState().setItemStatusMany(ids, status);
    };

    const applyCardType = (cardType: CardType) => {
      const ids = useBoardStore.getState().getSelectedIds();
      if (ids.length > 0) useBoardStore.getState().setCardTypeMany(ids, cardType);
    };

    // Focus mode helpers: when active, layout operations must only touch visible
    // (non-dimmed) cards. Dimmed cards have pointer-events:none so they can never
    // be in the selection, but arrange-with-no-selection would hit every card.
    const focusVisibleIds = (st: ReturnType<typeof useBoardStore.getState>): Set<string> => {
      if (!st.focusMode || !st.focusedCardId) return new Set(st.items.map((i) => i.id));
      const adj = new Map<string, string[]>();
      for (const it of st.items) adj.set(it.id, []);
      for (const c of st.connections) { adj.get(c.sourceId)?.push(c.targetId); adj.get(c.targetId)?.push(c.sourceId); }
      const dist = new Map<string, number>();
      for (const it of st.items) dist.set(it.id, Infinity);
      dist.set(st.focusedCardId, 0);
      const q: string[] = [st.focusedCardId];
      while (q.length) { const cur = q.shift()!; const d = dist.get(cur)!; for (const n of adj.get(cur) ?? []) { if (dist.get(n) !== Infinity) continue; dist.set(n, d + 1); q.push(n); } }
      const result = new Set<string>();
      for (const it of st.items) { const d = dist.get(it.id); if (d !== undefined && d !== Infinity && d <= st.focusDepth) result.add(it.id); }
      return result;
    };

    const focusAwareAlign = (st: ReturnType<typeof useBoardStore.getState>, mode: "left" | "right" | "top" | "bottom") => {
      if (!st.focusMode) { st.alignSelected(mode); return; }
      const visible = focusVisibleIds(st);
      const selected = st.selectedNodeIds.filter((id) => visible.has(id));
      if (selected.length < 2) return;
      useBoardStore.setState({ selectedNodeIds: selected, selectedNodeId: selected.length === 1 ? selected[0] : null });
      st.alignSelected(mode);
    };

    const focusAwareDistribute = (st: ReturnType<typeof useBoardStore.getState>, axis: "horizontal" | "vertical") => {
      if (!st.focusMode) { st.distributeSelected(axis); return; }
      const visible = focusVisibleIds(st);
      const selected = st.selectedNodeIds.filter((id) => visible.has(id));
      if (selected.length < 3) return;
      useBoardStore.setState({ selectedNodeIds: selected, selectedNodeId: selected.length === 1 ? selected[0] : null });
      st.distributeSelected(axis);
    };

    const nudge = (state: ReturnType<typeof useBoardStore.getState>, dx: number, dy: number) => {
      const ids = state.getSelectedIds();
      if (ids.length === 0) return;
      const updates = ids
        .map((id) => {
          const item = state.items.find((e) => e.id === id);
          return item ? { id, x: item.posX + dx, y: item.posY + dy } : null;
        })
        .filter((u): u is { id: string; x: number; y: number } => u !== null);
      if (updates.length === 0) return;
      if (updates.length === 1) useBoardStore.getState().commitDrag(updates[0].id, updates[0].x, updates[0].y);
      else useBoardStore.getState().commitDragMany(updates);
    };

    const navigate = (state: ReturnType<typeof useBoardStore.getState>, dx: number, dy: number) => {
      const ids = state.getSelectedIds();
      if (ids.length === 0) return;
      const currentId = ids[0];
      const current = state.items.find((i) => i.id === currentId);
      if (!current) return;
      const best = state.items
        .filter((i) => i.id !== current.id)
        .map((i) => ({ item: i, ox: i.posX - current.posX, oy: i.posY - current.posY }))
        .filter(({ ox, oy }) => {
          const along = ox * dx + oy * dy;
          if (along <= 0) return false;
          const across = Math.abs(dx !== 0 ? oy : ox);
          return across <= along;
        })
        .sort((a, b) => Math.hypot(a.ox, a.oy) - Math.hypot(b.ox, b.oy))[0];
      if (best) {
        useBoardStore.getState().setSelectedNode(best.item.id);
        const panned = panIfNeeded(best.item.posX, best.item.posY);
        if (panned) reassertEditorFocus(220);
      }
    };

    const handler = (event: KeyboardEvent) => {
      const binding = matchBinding(event);
      if (!binding) return;

      // Tiered guard: canvas-only shortcuts are skipped when typing in a field.
      const el = event.target as HTMLElement | null;
      const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (binding.scope === "canvas" && inField) return;

      event.preventDefault();
      runAction(binding.action, event);
    };

    const onEditorTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { shift: boolean };
      if (detail.shift) doTabPrev();
      else doTabNext();
    };
    // Command palette dispatches through this listener so it reuses the SAME
    //  runAction path the keyboard shortcuts use — no duplicated logic.
    const onPaletteRun = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: Action }>).detail;
      if (!action) return;
      runAction(action, new KeyboardEvent("keydown"));
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("mymind:editor-tab", onEditorTab);
    window.addEventListener("mymind:run-action", onPaletteRun);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mymind:editor-tab", onEditorTab);
      window.removeEventListener("mymind:run-action", onPaletteRun);
    };
  }, [screenToFlowPosition, flowToScreenPosition, setCenter, getZoom, fitView]);

  return null;
}

function App() {
  const items = useBoardStore((s) => s.items);
  const connections = useBoardStore((s) => s.connections);
  const activeTagFilter = useBoardStore((s) => s.activeTagFilter);
  const setTagFilter = useBoardStore((s) => s.setTagFilter);
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const replaceItems = useBoardStore((s) => s.replaceItems);
  const replaceConnections = useBoardStore((s) => s.replaceConnections);
  const snapEnabled = useBoardStore((s) => s.snapEnabled);
  const resizingItemId = useBoardStore((s) => s.resizingItemId);
  const setSnapEnabled = useBoardStore((s) => s.setSnapEnabled);
  const maps = useBoardStore((s) => s.maps);
  const activeMapId = useBoardStore((s) => s.activeMapId);
  const setMaps = useBoardStore((s) => s.setMaps);
  const setFolders = useBoardStore((s) => s.setFolders);
  const setActiveMap = useBoardStore((s) => s.setActiveMap);
  const sidebarCollapsed = useBoardStore((s) => s.sidebarCollapsed);
  const markdownPanelCollapsed = useBoardStore((s) => s.markdownPanelCollapsed);
  const setMarkdownPanelCollapsed = useBoardStore((s) => s.setMarkdownPanelCollapsed);
  const setMapLoading = useBoardStore((s) => s.setMapLoading);
  const [showTags, setShowTags] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfIncludeAppendix, setPdfIncludeAppendix] = useState(() => {
    try { return localStorage.getItem("mymind.pdfExport.includeAppendix") !== "false"; } catch { return true; }
  });
  const [toast, setToast] = useState<string | null>(null);
  const saveFailedRef = useRef(false);
  const loadingMapRef = useRef(false);
  // Tracks which map's rows have actually finished loading into the store.
  const loadedMapIdRef = useRef<string | null>(null);
  const tags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))), [items]);

  // Load maps on mount, then load the active map's items/connections
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [mapResult, folderResult] = await Promise.all([
        supabase.from("maps").select("*").order("created_at"),
        supabase.from("folders").select("*").order("created_at"),
      ]);
      if (!active) return;
      if (mapResult.error) { setToast("Could not load your maps"); return; }
      if (folderResult.error) { setToast("Could not load your folders"); return; }
      const loadedMaps: Map[] = (mapResult.data ?? []).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, folderId: row.folder_id ?? null, isFavorite: !!row.is_favorite }));
      const loadedFolders: Folder[] = (folderResult.data ?? []).map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id ?? null, createdAt: row.created_at }));
      setMaps(loadedMaps);
      setFolders(loadedFolders);

      if (loadedMaps.length === 0) {
        // No maps yet — create one
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const { error: insertError } = await supabase.from("maps").insert({ id, name: "My board", created_at: now, updated_at: now });
        if (insertError) { setToast("Could not create your first map"); return; }
        const newMap: Map = { id, name: "My board", createdAt: now, updatedAt: now, folderId: null, isFavorite: false };
        setMaps([newMap]);
        setActiveMap(id);
        replaceItems([]);
        replaceConnections([]);
        return;
      }

      // Determine active map: saved localStorage id or the first map
      const savedId = localStorage.getItem(ACTIVE_MAP_KEY);
      const targetId = savedId && loadedMaps.some((m) => m.id === savedId) ? savedId : loadedMaps[0].id;
      setActiveMap(targetId);
    };
    void load();
    return () => { active = false; };
  }, [setMaps, setFolders, setActiveMap, replaceItems, replaceConnections]);

  // Load items/connections when activeMapId changes
  useEffect(() => {
    if (!activeMapId) return;
    loadingMapRef.current = true;
    loadedMapIdRef.current = null;
    setMapLoading(true);
    let active = true;
    const load = async () => {
      const [itemResult, connectionResult] = await Promise.all([
        supabase.from("items").select("*").eq("map_id", activeMapId).order("created_at"),
        supabase.from("connections").select("*").eq("map_id", activeMapId),
      ]);
      if (!active) return;
      if (itemResult.error || connectionResult.error) { loadingMapRef.current = false; setMapLoading(false); setToast("Could not load the saved board"); return; }
      loadBoard({
        items: itemResult.data.map((row) => ({ id: row.id, title: row.title, tags: row.tags, createdAt: row.created_at, dueDate: row.due_date, description: row.description, posX: row.pos_x, posY: row.pos_y, color: row.color, width: row.width ?? null, height: row.height ?? null, scale: row.scale ?? null, status: row.status ?? null, cardType: row.card_type ?? "note", mapId: row.map_id })),
        connections: connectionResult.data.map((row) => ({ id: row.id, sourceId: row.source_id, targetId: row.target_id, comment: row.comment, labelDx: row.label_dx, labelDy: row.label_dy, mapId: row.map_id })),
      });
      loadedMapIdRef.current = activeMapId;
      loadingMapRef.current = false;
      setMapLoading(false);
    };
    void load();
    return () => { active = false; loadingMapRef.current = false; setMapLoading(false); };
  }, [activeMapId, loadBoard, setMapLoading]);

  // Debounced save — scoped to activeMapId
  useEffect(() => {
    if (!activeMapId) return;
    if (loadingMapRef.current) return;
    if (saveFailedRef.current) return;
    if (resizingItemId !== null) return;
    const timer = window.setTimeout(async () => {
      if (saveFailedRef.current || loadingMapRef.current) return;
      const state = useBoardStore.getState();
      const currentItems = state.items;
      const currentConnections = state.connections;
      const currentMapId = state.activeMapId;
      if (currentMapId !== activeMapId) return;
      // CRITICAL: never write for a map whose rows have not finished loading.
      // An empty items array passes every other guard ([].some() is false) and
      // falls through to the unconditional delete().eq("map_id", ...) branch,
      // which wipes the entire map.
      if (loadedMapIdRef.current !== activeMapId) return;
      // Stale-state guard: never write items/connections that belong to a different
      // map. During a map switch the store still holds the previous map's rows until
      // the async load completes; writing here would reassign them to the new map.
      if (currentItems.some((item) => item.mapId !== activeMapId)) return;
      if (currentConnections.some((connection) => connection.mapId !== activeMapId)) return;

      const itemRows = currentItems.map((item) => ({ id: item.id, map_id: item.mapId, title: item.title, tags: item.tags, created_at: item.createdAt, due_date: item.dueDate, description: item.description, pos_x: item.posX, pos_y: item.posY, color: item.color, width: item.width, height: item.height, scale: item.scale, status: item.status, card_type: item.cardType }));
      const connectionRows = currentConnections.map((connection) => ({ id: connection.id, map_id: connection.mapId, source_id: connection.sourceId, target_id: connection.targetId, comment: connection.comment, label_dx: connection.labelDx, label_dy: connection.labelDy }));
      const itemWrite = itemRows.length ? await supabase.from("items").upsert(itemRows) : null;
      const connectionWrite = connectionRows.length ? await supabase.from("connections").upsert(connectionRows) : null;

      const errors = [itemWrite?.error, connectionWrite?.error]
        .filter((error): error is NonNullable<typeof error> => error !== null && error !== undefined);
      if (errors.length > 0) {
        saveFailedRef.current = true;
        errors.forEach((error) => console.error("Supabase save failed", error));
        setToast("Your latest change could not be saved");
        window.setTimeout(() => setToast(null), 3000);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [items, connections, activeMapId, resizingItemId]);

  const download = (name: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); setShowExport(false);
  };
  const exportMarkdown = () => download("mymind-board.md", items.map((item) => { const outgoing = connections.filter((c) => c.sourceId === item.id); return `## ${item.title}\n\nCreated: ${item.createdAt} · Due: ${item.dueDate ?? "None"} · Tags: ${item.tags.join(", ")}\n\n${item.description}\n\n${outgoing.map((c) => `- → **${items.find((target) => target.id === c.targetId)?.title ?? "Untitled"}** — ${c.comment}`).join("\n")}`; }).join("\n\n"), "text/markdown");

  const handleExportPdf = async (includeAppendix: boolean) => {
    if (useBoardStore.getState().items.length === 0) return;
    setExporting(true);
    const wrapper = document.querySelector(".react-flow") as HTMLElement | null;
    const store = useBoardStore.getState();
    const prevSelection = { selectedNodeId: store.selectedNodeId, selectedNodeIds: [...store.selectedNodeIds], selectedConnectionId: store.selectedConnectionId };
    useBoardStore.setState({ selectedNodeId: null, selectedNodeIds: [], selectedConnectionId: null });
    if (wrapper) wrapper.classList.add("is-exporting");

    let readingOrder: { item: Item; number: number }[] = [];
    if (includeAppendix) {
      readingOrder = computeReadingOrder(store.items, store.connections);
      for (const { item, number } of readingOrder) {
        const badgeEl = document.querySelector(`[data-nodeid="${item.id}"] .export-badge`);
        if (badgeEl) badgeEl.setAttribute("data-number", String(number));
      }
      if (wrapper) wrapper.classList.add("is-exporting-with-appendix");
    }

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const getMeasuredNodes = (window as unknown as { __mymindGetNodes?: () => unknown[] }).__mymindGetNodes;
      const measuredNodes = (getMeasuredNodes?.() ?? []) as { id: string; position: { x: number; y: number }; measured?: { width?: number; height?: number }; width?: number; height?: number; data: Record<string, unknown> }[];
      const nodes = measuredNodes.length > 0
        ? measuredNodes
        : store.items.map((item) => ({ id: item.id, position: { x: item.posX, y: item.posY }, width: item.width ?? 240, height: item.height ?? 92, data: {} }));
      const mapName = store.maps.find((m) => m.id === store.activeMapId)?.name ?? "map";
      await exportMapToPdf({
        nodes,
        mapName,
        includeAppendix,
        items: includeAppendix ? store.items : undefined,
        connections: includeAppendix ? store.connections : undefined,
        readingOrder: includeAppendix ? readingOrder : undefined,
      });
    } catch (err) {
      console.error("PDF export failed", err);
      setToast("Could not export the map as PDF");
      window.setTimeout(() => setToast(null), 3000);
    } finally {
      if (wrapper) {
        wrapper.classList.remove("is-exporting");
        wrapper.classList.remove("is-exporting-with-appendix");
      }
      document.querySelectorAll(".export-badge").forEach((el) => el.removeAttribute("data-number"));
      useBoardStore.setState(prevSelection);
      setExporting(false);
    }
  };

  useEffect(() => {
    const handler = () => { setShowPdfDialog(true); };
    window.addEventListener("mymind:export-pdf", handler);
    return () => window.removeEventListener("mymind:export-pdf", handler);
  }, []);


  const importJson = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)) as { items: Item[]; connections: Connection[] }; if (!Array.isArray(data.items) || !Array.isArray(data.connections)) throw new Error(); loadBoard(data); setToast("Board imported"); } catch { setToast("That file is not a valid MyMind board"); } }; reader.readAsText(file); event.target.value = ""; };

  return <ReactFlowProvider><main className="relative h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
    <KeyboardShortcuts />
    <MapSidebar />
    <div className={`h-full ${sidebarCollapsed ? "" : "pl-60"}`}>
      <header className="absolute left-5 right-5 top-5 z-20 flex items-center justify-between pointer-events-none" style={{ left: sidebarCollapsed ? undefined : "1rem" }}>
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-lg shadow-slate-200/50 backdrop-blur">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><Network size={19} /></div>
          <div>
            <div className="text-sm font-bold tracking-tight">MyMind</div>
            <div className="text-[11px] text-slate-500">{maps.find((m) => m.id === activeMapId)?.name ?? "Your ideas, connected"}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={() => setShowTags((v) => !v)} className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-lg transition ${showTags ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/90 text-slate-600 hover:bg-white"}`}><Tags size={15} /> Filter tags</button>
          <button onClick={() => setShowPdfDialog(true)} disabled={exporting || items.length === 0} title="Export map as PDF (Alt+P)" className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${exporting ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/90 text-slate-600 hover:bg-white"}`}><FileDown size={15} /> {exporting ? "Exporting…" : "PDF"}</button>
          <div className="relative">
            <button onClick={() => setShowExport((v) => !v)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white"><Download size={15} /> Export</button>
            {showExport && <div className="absolute right-0 top-12 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button onClick={() => download("mymind-board.json", JSON.stringify({ items, connections }, null, 2), "application/json")} className="menu"><FileJson size={14} /> JSON</button><button onClick={exportMarkdown} className="menu"><Download size={14} /> Markdown</button></div>}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white"><Upload size={15} /> Import JSON<input type="file" accept="application/json,.json" onChange={importJson} className="hidden" /></label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white"><FileText size={15} /> Import markdown<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(e) => { const file = e.target.files?.[0]; if (file) window.dispatchEvent(new CustomEvent("mymind:import-markdown-file", { detail: { file } })); e.target.value = ""; }} className="hidden" /></label>
          <FitViewButton />
          <button onClick={() => setMarkdownPanelCollapsed(!markdownPanelCollapsed)} className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-lg transition ${!markdownPanelCollapsed ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/90 text-slate-600 hover:bg-white"}`} title={`${markdownPanelCollapsed ? "Show" : "Hide"} markdown panel (⌘/Ctrl+M)`}><FileText size={15} /> Markdown</button>
          <button onClick={() => setSnapEnabled(!snapEnabled)} title={snapEnabled ? "Disable grid snapping" : "Enable grid snapping"} className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-lg transition ${snapEnabled ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/90 text-slate-600 hover:bg-white"}`}><Grid3x3 size={15} /> {snapEnabled ? "Snapping" : "Free"}</button>
          <NewItemButton />
          <button onClick={signOut} title="Sign out" className="flex items-center justify-center rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-lg hover:bg-white"><LogOut size={15} /></button>
        </div>
      </header>
      {showTags && <div className="absolute right-5 top-[84px] z-30 flex max-w-xs flex-wrap justify-end gap-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">{tags.map((tag) => <button key={tag} onClick={() => setTagFilter(activeTagFilter === tag ? null : tag)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${activeTagFilter === tag ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{tag}</button>)}</div>}
      <CanvasErrorBoundary>
        <Canvas />
      </CanvasErrorBoundary>
      <BurstInput />
      <MarkdownPanel />
      <CommandPalette />
      {items.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><p className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-500 shadow-lg backdrop-blur">Double-click anywhere to create your first card.</p></div>}
      {toast && <div className="absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl"><span>{toast}</span><button onClick={() => setToast(null)}><X size={14} /></button></div>}
      {showPdfDialog && items.length > 0 && (
        <PdfExportDialog
          defaultInclude={pdfIncludeAppendix}
          onExport={(include) => {
            setPdfIncludeAppendix(include);
            try { localStorage.setItem("mymind.pdfExport.includeAppendix", String(include)); } catch { /* ignore */ }
            setShowPdfDialog(false);
            void handleExportPdf(include);
          }}
          onCancel={() => setShowPdfDialog(false)}
        />
      )}
    </div>
  </main></ReactFlowProvider>;
}

export default App;



