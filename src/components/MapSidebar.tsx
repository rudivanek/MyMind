import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  Map as MapIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Plus,
  Trash2,
  Edit3,
  MoreHorizontal,
  Search,
  X,
  Star,
  Copy,
  HelpCircle,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import type { Map, Folder } from "@/types";
import HelpPanel from "@/components/HelpPanel";

const MAX_DEPTH = 3;
const EXPANDED_KEY = "mymind.expandedFolders";
const FAV_COLLAPSED_KEY = "mymind.favoritesCollapsed";

type ContextMenu =
  | { kind: "map"; id: string; x: number; y: number }
  | { kind: "folder"; id: string; x: number; y: number };

type ConfirmState =
  | { kind: "map"; id: string }
  | { kind: "folder"; id: string; subfolderCount: number; mapCount: number; name: string };

type CreatingState =
  | { kind: "map"; parentId: string | null }
  | { kind: "folder"; parentId: string | null }
  | null;

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore corrupt storage
  }
  return new Set();
}

function saveExpanded(set: Set<string>) {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
}

/** Normalize a string for case- and accent-insensitive matching. */
function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Check if folderId or any of its ancestors is in the given set. */
function folderOrAncestorInSet(folderId: string | null, set: Set<string>, folders: Folder[]): boolean {
  let current = folderId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (set.has(current)) return true;
    visited.add(current);
    const f = folders.find((fo) => fo.id === current);
    current = f?.parentId ?? null;
  }
  return false;
}

/** Compute the depth of a folder by walking its parent chain. Root = 1. */
function folderDepth(folderId: string, folders: Folder[]): number {
  let depth = 1;
  let current = folders.find((f) => f.id === folderId);
  const visited = new Set<string>();
  while (current && current.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth++;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return depth;
}

/** Collect all descendant folder ids of a folder (not including itself). */
function descendantFolderIds(folderId: string, folders: Folder[]): string[] {
  const result: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    const children = folders.filter((f) => f.parentId === id);
    for (const child of children) {
      result.push(child.id);
      stack.push(child.id);
    }
  }
  return result;
}

/** Collect all map ids inside a folder and all its descendants. */
function mapsInFolderTree(folderId: string, folders: Folder[], maps: Map[]): string[] {
  const ids = new Set<string>([folderId, ...descendantFolderIds(folderId, folders)]);
  return maps.filter((m) => m.folderId && ids.has(m.folderId)).map((m) => m.id);
}

/** Compute the maximum subtree height of a folder (1 = leaf, 2 = has one level of children, etc.). */
function subtreeHeight(folderId: string, folders: Folder[]): number {
  const children = folders.filter((f) => f.parentId === folderId);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((c) => subtreeHeight(c.id, folders)));
}

/** Check if `ancestorId` is an ancestor of (or equal to) `descendantId`. */
function isAncestorOrSelf(ancestorId: string, descendantId: string, folders: Folder[]): boolean {
  if (ancestorId === descendantId) return true;
  let current = folders.find((f) => f.id === descendantId);
  const visited = new Set<string>();
  while (current && current.parentId && !visited.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    visited.add(current.id);
    current = folders.find((f) => f.id === current!.parentId);
  }
  return false;
}

type FilterResult = {
  visibleFolderIds: Set<string>;
  visibleMapIds: Set<string>;
  searchExpanded: Set<string>;
};

/** Escape %, _ and \ in user input for safe use inside an ilike pattern. */
function escapeIlike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Strip markdown syntax so snippets read as plain text. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~#>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a one-line snippet around the first match, with ellipses on both sides. */
function makeSnippet(text: string, query: string, radius = 48): string {
  const plain = stripMarkdown(text);
  if (!plain) return "";
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return plain.length > 120 ? plain.slice(0, 120) + "…" : plain;
  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";
  return prefix + plain.slice(start, end) + suffix;
}

/** Render a snippet with the matched substring highlighted. */
function HighlightedSnippet({ snippet, query }: { snippet: string; query: string }) {
  if (!snippet) return null;
  const lower = snippet.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <span className="truncate text-slate-400">{snippet}</span>;
  return (
    <span className="truncate text-slate-400">
      {snippet.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 text-slate-700">{snippet.slice(idx, idx + query.length)}</mark>
      {snippet.slice(idx + query.length)}
    </span>
  );
}

type CardHit = {
  id: string;
  mapId: string;
  title: string;
  description: string;
};

function MapSidebar() {
  const maps = useBoardStore((s) => s.maps);
  const folders = useBoardStore((s) => s.folders);
  const activeMapId = useBoardStore((s) => s.activeMapId);
  const sidebarCollapsed = useBoardStore((s) => s.sidebarCollapsed);
  const setActiveMap = useBoardStore((s) => s.setActiveMap);
  const setSidebarCollapsed = useBoardStore((s) => s.setSidebarCollapsed);
  const updateMap = useBoardStore((s) => s.updateMap);
  const removeMap = useBoardStore((s) => s.removeMap);
  const removeMaps = useBoardStore((s) => s.removeMaps);
  const addFolder = useBoardStore((s) => s.addFolder);
  const updateFolder = useBoardStore((s) => s.updateFolder);
  const removeFolder = useBoardStore((s) => s.removeFolder);
  const removeFolders = useBoardStore((s) => s.removeFolders);
  const replaceItems = useBoardStore((s) => s.replaceItems);
  const replaceConnections = useBoardStore((s) => s.replaceConnections);
  const moveMapToFolder = useBoardStore((s) => s.moveMapToFolder);
  const moveFolderToParent = useBoardStore((s) => s.moveFolderToParent);

  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingKind, setEditingKind] = useState<"map" | "folder">("map");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [creating, setCreating] = useState<CreatingState>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "map-sidebar", open: confirmState !== null } }));
    return () => { window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "map-sidebar", open: false } })); };
  }, [confirmState]);
  const [newName, setNewName] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const newInputRef = useRef<HTMLInputElement | null>(null);
  const [dragData, setDragData] = useState<{ kind: "map" | "folder"; id: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Every database write in this file must surface its failure. Silent writes have
  // caused maps and folders to appear in the sidebar without ever being persisted.
  const showError = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };
  const expandTimerRef = useRef<number | null>(null);

  // ---- Favorites collapsed state ----
  const [favCollapsed, setFavCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FAV_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggleFavCollapsed = () => {
    setFavCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(FAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleFavorite = async (mapId: string) => {
    const current = useBoardStore.getState().maps.find((m) => m.id === mapId);
    if (!current) return;
    const next = !current.isFavorite;
    updateMap(mapId, { isFavorite: next });
    const { error } = await supabase.from("maps").update({ is_favorite: next }).eq("id", mapId);
    if (error) {
      updateMap(mapId, { isFavorite: !next });
      showError("Could not update favorite");
    }
  };

  // ---- Search ----

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const preSearchExpandedRef = useRef<Set<string> | null>(null);
  const prevQueryRef = useRef("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 120);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Snapshot expanded state when search starts, restore when it clears.
  useEffect(() => {
    if (debouncedQuery && !prevQueryRef.current) {
      preSearchExpandedRef.current = new Set(expanded);
    } else if (!debouncedQuery && prevQueryRef.current) {
      if (preSearchExpandedRef.current) {
        setExpanded(preSearchExpandedRef.current);
        preSearchExpandedRef.current = null;
      }
    }
    prevQueryRef.current = debouncedQuery;
  }, [debouncedQuery, expanded]);

  const filter: FilterResult | null = useMemo(() => {
    if (!debouncedQuery) return null;
    const nq = normalize(debouncedQuery);
    if (!nq) return null;

    const folderIdsByName = new Set(folders.filter((f) => normalize(f.name).includes(nq)).map((f) => f.id));
    const mapIdsByName = new Set(maps.filter((m) => normalize(m.name).includes(nq)).map((m) => m.id));

    const visibleFolderIds = new Set<string>();
    for (const f of folders) {
      if (folderIdsByName.has(f.id) || folderOrAncestorInSet(f.parentId, folderIdsByName, folders)) {
        visibleFolderIds.add(f.id);
        continue;
      }
      const subtreeMaps = mapsInFolderTree(f.id, folders, maps);
      if (subtreeMaps.some((id) => mapIdsByName.has(id))) {
        visibleFolderIds.add(f.id);
        continue;
      }
      const subtreeFolders = descendantFolderIds(f.id, folders);
      if (subtreeFolders.some((id) => folderIdsByName.has(id))) {
        visibleFolderIds.add(f.id);
      }
    }

    const visibleMapIds = new Set<string>();
    for (const m of maps) {
      if (mapIdsByName.has(m.id) || folderOrAncestorInSet(m.folderId, folderIdsByName, folders)) {
        visibleMapIds.add(m.id);
      }
    }

    return { visibleFolderIds, visibleMapIds, searchExpanded: new Set(visibleFolderIds) };
  }, [debouncedQuery, folders, maps]);

  const isSearching = filter !== null;

  // ---- Card content search (Supabase) ----
  // NOTE: the Supabase ilike match below is NOT accent-insensitive unless the
  // database has the `unaccent` extension enabled. We do not add a migration
  // for that here; the client-side name filter above remains accent-insensitive
  // via normalize(), but card body/title matching relies on plain ilike.
  const [cardHits, setCardHits] = useState<CardHit[]>([]);
  const [cardHitsLoading, setCardHitsLoading] = useState(false);
  const [cardHitsError, setCardHitsError] = useState(false);
  const cardQueryReqRef = useRef<number>(0);

  useEffect(() => {
    const q = debouncedQuery;
    if (q.length < 2) {
      setCardHits([]);
      setCardHitsLoading(false);
      setCardHitsError(false);
      cardQueryReqRef.current++;
      return;
    }
    const reqId = ++cardQueryReqRef.current;
    setCardHitsLoading(true);
    setCardHitsError(false);
    const pattern = `%${escapeIlike(q)}%`;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, map_id, title, description")
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .limit(50);
      if (reqId !== cardQueryReqRef.current) return;
      if (error) {
        setCardHits([]);
        setCardHitsLoading(false);
        setCardHitsError(true);
        return;
      }
      setCardHits((data ?? []).map((row) => ({
        id: row.id,
        mapId: row.map_id,
        title: row.title,
        description: row.description ?? "",
      })));
      setCardHitsLoading(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery]);

  // Group card hits by map id for rendering.
  const cardHitsByMap = useMemo(() => {
    const groups = new Map<string, CardHit[]>();
    for (const hit of cardHits) {
      const arr = groups.get(hit.mapId);
      if (arr) arr.push(hit);
      else groups.set(hit.mapId, [hit]);
    }
    return groups;
  }, [cardHits]);

  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow();

  const navigateToCard = useCallback((cardId: string, mapId: string) => {
    setSearchInput("");
    const pulseCard = () => {
      window.dispatchEvent(new CustomEvent("mymind:creation-highlight", { detail: { id: cardId } }));
    };
    const selectAndCenter = () => {
      useBoardStore.getState().setSelectedNode(cardId);
      const item = useBoardStore.getState().items.find((it) => it.id === cardId);
      if (item) {
        const w = item.width ?? 240;
        const h = item.height ?? 92;
        const vp = getViewport();
        // Centre the card in the viewport without changing zoom.
        setViewport({ x: -(item.posX + w / 2) * vp.zoom + window.innerWidth / 2, y: -(item.posY + h / 2) * vp.zoom + window.innerHeight / 2, zoom: vp.zoom }, { duration: 300 });
      }
      pulseCard();
      window.setTimeout(pulseCard, 500);
      window.setTimeout(pulseCard, 1000);
    };
    const state = useBoardStore.getState();
    if (mapId === state.activeMapId) {
      selectAndCenter();
    } else {
      const ok = state.setActiveMap(mapId);
      if (!ok) return;
      const checkLoaded = () => {
        if (useBoardStore.getState().items.some((it) => it.id === cardId)) {
          selectAndCenter();
        } else {
          window.setTimeout(checkLoaded, 100);
        }
      };
      window.setTimeout(checkLoaded, 200);
    }
  }, [screenToFlowPosition, getViewport, setViewport]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (searchInput) {
        setSearchInput("");
      } else {
        searchInputRef.current?.blur();
      }
    }
  };

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (creating && newInputRef.current) {
      newInputRef.current.focus();
      newInputRef.current.select();
    }
  }, [creating]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  const toggleExpanded = (id: string) => {
    if (isSearching) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpanded(next);
      return next;
    });
  };

  // ---- Rename ----

  const startRenameMap = (map: Map) => {
    setEditingKind("map");
    setEditingId(map.id);
    setEditingName(map.name);
    setContextMenu(null);
  };

  const startRenameFolder = (folder: Folder) => {
    setEditingKind("folder");
    setEditingId(folder.id);
    setEditingName(folder.name);
    setContextMenu(null);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    if (editingKind === "map") {
      const now = new Date().toISOString();
      updateMap(editingId, { name: trimmed, updatedAt: now });
      void supabase.from("maps").update({ name: trimmed, updated_at: now }).eq("id", editingId).then(({ error }) => {
        if (error) {
          console.error("MAP RENAME FAILED", error);
          showError("Could not rename map");
        }
      });
    } else {
      updateFolder(editingId, { name: trimmed });
      void supabase.from("folders").update({ name: trimmed }).eq("id", editingId).then(({ error }) => {
        if (error) {
          console.error("FOLDER RENAME FAILED", error);
          showError("Could not rename folder");
        }
      });
    }
    setEditingId(null);
  };

  // ---- New map / folder creation ----

  const handleNewRootMap = () => {
    setCreating({ kind: "map", parentId: null });
    setNewName("");
  };

  const handleNewMapInside = (folderId: string) => {
    setCreating({ kind: "map", parentId: folderId });
    setNewName("");
    setContextMenu(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(folderId);
      saveExpanded(next);
      return next;
    });
  };

  const handleNewSubfolder = (parentId: string) => {
    setCreating({ kind: "folder", parentId });
    setNewName("");
    setContextMenu(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(parentId);
      saveExpanded(next);
      return next;
    });
  };

  const commitCreating = async () => {
    if (!creating) return;
    const trimmed = newName.trim() || (creating.kind === "map" ? "Untitled map" : "New folder");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    if (creating.kind === "map") {
      const newMap: Map = { id, name: trimmed, createdAt: now, updatedAt: now, folderId: creating.parentId, isFavorite: false };
      useBoardStore.getState().addMap(newMap);
      setActiveMap(id);
      void supabase.from("maps").insert({
        id,
        name: trimmed,
        created_at: now,
        updated_at: now,
        folder_id: creating.parentId,
      }).then(({ error }) => {
        if (error) {
          // The map was never written. Remove the phantom row from local state so the
          // user cannot add cards to a map that does not exist in the database.
          console.error("MAP INSERT FAILED", error);
          useBoardStore.getState().removeMap(id);
          showError("Could not create map");
        }
      });
    } else {
      const newFolder: Folder = { id, name: trimmed, parentId: creating.parentId, createdAt: now };
      addFolder(newFolder);
      void supabase.from("folders").insert({
        id,
        name: trimmed,
        parent_id: creating.parentId,
        created_at: now,
      }).then(({ error }) => {
        if (error) {
          console.error("FOLDER INSERT FAILED", error);
          removeFolder(id);
          showError("Could not create folder");
        }
      });
    }
    setCreating(null);
    setNewName("");
  };

  const cancelCreating = () => {
    setCreating(null);
    setNewName("");
  };

  // ---- Drag and drop ----

  const clearExpandTimer = () => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  };

  useEffect(() => () => clearExpandTimer(), []);

  const isValidFolderDrop = (draggedId: string, targetFolderId: string): boolean => {
    if (isAncestorOrSelf(draggedId, targetFolderId, folders)) return false;
    const targetDepth = folderDepth(targetFolderId, folders);
    const draggedHeight = subtreeHeight(draggedId, folders);
    return targetDepth + draggedHeight <= MAX_DEPTH;
  };

  const handleDragStart = (e: React.DragEvent, kind: "map" | "folder", id: string) => {
    setDragData({ kind, id });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    if (!dragData) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragData.kind === "folder" && !isValidFolderDrop(dragData.id, folderId)) {
      setDragOverFolderId(null);
      return;
    }
    if (dragData.kind === "map") {
      const map = maps.find((m) => m.id === dragData.id);
      if (map && map.folderId === folderId) { setDragOverFolderId(null); return; }
    }
    if (dragData.kind === "folder") {
      const folder = folders.find((f) => f.id === dragData.id);
      if (folder && folder.parentId === folderId) { setDragOverFolderId(null); return; }
    }
    setDragOverFolderId(folderId);
    setDragOverRoot(false);
    const effectiveExpanded = isSearching ? filter!.searchExpanded : expanded;
    if (!effectiveExpanded.has(folderId)) {
      clearExpandTimer();
      expandTimerRef.current = window.setTimeout(() => {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(folderId);
          saveExpanded(next);
          return next;
        });
      }, 600);
    }
  };

  const handleDragOverRoot = (e: React.DragEvent) => {
    if (!dragData) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(null);
    setDragOverRoot(true);
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    clearExpandTimer();
    if (!dragData) return;
    if (dragData.kind === "folder" && !isValidFolderDrop(dragData.id, folderId)) {
      setDragData(null); setDragOverFolderId(null); return;
    }
    if (dragData.kind === "map") {
      const map = maps.find((m) => m.id === dragData.id);
      if (!map || map.folderId === folderId) { setDragData(null); setDragOverFolderId(null); return; }
      const prevFolderId = map.folderId;
      moveMapToFolder(dragData.id, folderId);
      setDragData(null); setDragOverFolderId(null);
      const { error } = await supabase.from("maps").update({ folder_id: folderId }).eq("id", dragData.id);
      if (error) {
        moveMapToFolder(dragData.id, prevFolderId);
        setToast("Could not move map");
        window.setTimeout(() => setToast(null), 3000);
      }
    } else {
      const folder = folders.find((f) => f.id === dragData.id);
      if (!folder || folder.parentId === folderId) { setDragData(null); setDragOverFolderId(null); return; }
      const prevParent = folder.parentId;
      moveFolderToParent(dragData.id, folderId);
      setDragData(null); setDragOverFolderId(null);
      const { error } = await supabase.from("folders").update({ parent_id: folderId }).eq("id", dragData.id);
      if (error) {
        moveFolderToParent(dragData.id, prevParent);
        setToast("Could not move folder");
        window.setTimeout(() => setToast(null), 3000);
      }
    }
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearExpandTimer();
    if (!dragData) return;
    if (dragData.kind === "map") {
      const map = maps.find((m) => m.id === dragData.id);
      if (!map || map.folderId === null) { setDragData(null); setDragOverRoot(false); return; }
      const prevFolderId = map.folderId;
      moveMapToFolder(dragData.id, null);
      setDragData(null); setDragOverRoot(false);
      const { error } = await supabase.from("maps").update({ folder_id: null }).eq("id", dragData.id);
      if (error) {
        moveMapToFolder(dragData.id, prevFolderId);
        setToast("Could not move map");
        window.setTimeout(() => setToast(null), 3000);
      }
    } else {
      const folder = folders.find((f) => f.id === dragData.id);
      if (!folder || folder.parentId === null) { setDragData(null); setDragOverRoot(false); return; }
      const prevParent = folder.parentId;
      moveFolderToParent(dragData.id, null);
      setDragData(null); setDragOverRoot(false);
      const { error } = await supabase.from("folders").update({ parent_id: null }).eq("id", dragData.id);
      if (error) {
        moveFolderToParent(dragData.id, prevParent);
        setToast("Could not move folder");
        window.setTimeout(() => setToast(null), 3000);
      }
    }
  };

  const handleDragEnd = () => {
    clearExpandTimer();
    setDragData(null);
    setDragOverFolderId(null);
    setDragOverRoot(false);
  };

  // ---- Duplicate map ----

  const uniqueCopyName = (baseName: string, folderId: string | null): string => {
    const existing = new Set(maps.filter((m) => m.folderId === folderId).map((m) => m.name));
    if (!existing.has(baseName + " copy")) return baseName + " copy";
    let n = 2;
    while (existing.has(`${baseName} copy ${n}`)) n++;
    return `${baseName} copy ${n}`;
  };

  const duplicateMap = async (mapId: string) => {
    setDuplicatingId(mapId);
    try {
      const sourceMap = maps.find((m) => m.id === mapId);
      if (!sourceMap) { showError("Map not found"); return; }

      // Read all source data from the database (read-only, never touch the source)
      const [itemsRes, connectionsRes] = await Promise.all([
        supabase.from("items").select("*").eq("map_id", mapId),
        supabase.from("connections").select("*").eq("map_id", mapId),
      ]);
      if (itemsRes.error || connectionsRes.error) {
        showError("Could not read the map");
        return;
      }

      const sourceItems = itemsRes.data ?? [];
      const sourceConnections = connectionsRes.data ?? [];

      // Generate new ids and build the remapping table
      const newMapId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newName = uniqueCopyName(sourceMap.name, sourceMap.folderId);
      const idMap = new Map<string, string>();
      for (const row of sourceItems) idMap.set(row.id, crypto.randomUUID());

      // Remap connections and validate every source/target resolves
      const remappedConnections = sourceConnections.map((c) => {
        const newSource = idMap.get(c.source_id);
        const newTarget = idMap.get(c.target_id);
        if (!newSource || !newTarget) return null;
        return {
          id: crypto.randomUUID(),
          map_id: newMapId,
          source_id: newSource,
          target_id: newTarget,
          comment: c.comment,
          label_dx: c.label_dx,
          label_dy: c.label_dy,
        };
      });
      if (remappedConnections.some((c) => c === null)) {
        showError("Could not duplicate all connections");
        return;
      }

      // Build new item rows with remapped ids
      const newItemRows = sourceItems.map((row) => ({
        id: idMap.get(row.id)!,
        map_id: newMapId,
        title: row.title,
        tags: row.tags,
        created_at: now,
        due_date: row.due_date,
        description: row.description,
        pos_x: row.pos_x,
        pos_y: row.pos_y,
        color: row.color,
        width: row.width,
        height: row.height,
        scale: row.scale,
        status: row.status,
        card_type: row.card_type,
      }));

      // Insert the map row
      const mapInsert = await supabase.from("maps").insert({
        id: newMapId,
        name: newName,
        created_at: now,
        updated_at: now,
        folder_id: sourceMap.folderId,
        is_favorite: false,
      });
      if (mapInsert.error) {
        showError("Could not create the duplicate map");
        return;
      }

      // Insert cards
      if (newItemRows.length > 0) {
        const itemsInsert = await supabase.from("items").insert(newItemRows);
        if (itemsInsert.error) {
          await supabase.from("maps").delete().eq("id", newMapId);
          showError("Could not copy the cards");
          return;
        }
      }

      // Insert connections
      if (remappedConnections.length > 0) {
        const connsInsert = await supabase.from("connections").insert(remappedConnections as NonNullable<typeof remappedConnections[number]>[]);
        if (connsInsert.error) {
          await supabase.from("items").delete().eq("map_id", newMapId);
          await supabase.from("maps").delete().eq("id", newMapId);
          showError("Could not copy the connections");
          return;
        }
      }

      // Add to local state so the sidebar shows it immediately
      useBoardStore.getState().addMap({
        id: newMapId,
        name: newName,
        createdAt: now,
        updatedAt: now,
        folderId: sourceMap.folderId,
        isFavorite: false,
      });

      setToast(`Duplicated as '${newName}'`);
      window.setTimeout(() => setToast(null), 4000);
    } catch (err) {
      console.error("Duplicate map failed", err);
      showError("Could not duplicate the map");
    } finally {
      setDuplicatingId(null);
    }
  };

  // ---- Delete map ----

  const confirmDeleteMap = async () => {
    if (!confirmState || confirmState.kind !== "map") return;
    const id = confirmState.id;
    const remaining = maps.filter((m) => m.id !== id);
    const connectionDelete = await supabase.from("connections").delete().eq("map_id", id);
    const itemDelete = await supabase.from("items").delete().eq("map_id", id);
    const mapDelete = await supabase.from("maps").delete().eq("id", id);
    const deleteError = connectionDelete.error ?? itemDelete.error ?? mapDelete.error;
    if (deleteError) {
      console.error("Supabase map deletion failed", deleteError);
      setToast("Could not delete the map");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    removeMap(id);
    if (activeMapId === id) {
      if (remaining.length > 0) {
        setActiveMap(remaining[0].id, true);
      } else {
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        const newMap: Map = { id: newId, name: "My board", createdAt: now, updatedAt: now, folderId: null, isFavorite: false };
        useBoardStore.getState().addMap(newMap);
        setActiveMap(newId, true);
        const { error: fallbackError } = await supabase.from("maps").insert({ id: newId, name: "My board", created_at: now, updated_at: now, folder_id: null });
        if (fallbackError) {
          console.error("FALLBACK MAP INSERT FAILED", fallbackError);
          useBoardStore.getState().removeMap(newId);
          setToast("Could not create a new board");
          window.setTimeout(() => setToast(null), 3000);
        }
      }
    }
    setConfirmState(null);
  };

  // ---- Delete folder ----

  const confirmDeleteFolder = async () => {
    if (!confirmState || confirmState.kind !== "folder") return;
    const folderId = confirmState.id;
    const subfolderIds = descendantFolderIds(folderId, folders);
    const allFolderIds = [folderId, ...subfolderIds];
    const mapIds = mapsInFolderTree(folderId, folders, maps);

    // 1. Delete cards and connections explicitly before deleting maps.
    if (mapIds.length > 0) {
      const connectionDelete = await supabase.from("connections").delete().in("map_id", mapIds);
      const itemDelete = await supabase.from("items").delete().in("map_id", mapIds);
      const mapDelete = await supabase.from("maps").delete().in("id", mapIds);
      const deleteError = connectionDelete.error ?? itemDelete.error ?? mapDelete.error;
      if (deleteError) {
        console.error("Supabase folder map deletion failed", deleteError);
        setToast("Could not delete the folder contents");
        window.setTimeout(() => setToast(null), 3000);
        return;
      }
      removeMaps(mapIds);
    }

    // 2. Delete subfolders first, then the folder itself
    const folderDelete = await supabase.from("folders").delete().in("id", allFolderIds);
    if (folderDelete.error) {
      console.error("Supabase folder deletion failed", folderDelete.error);
      setToast("Could not delete the folder");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    removeFolders(allFolderIds);

    // 3. If the active map was deleted, switch to the first remaining map
    if (activeMapId && mapIds.includes(activeMapId)) {
      const remainingMaps = maps.filter((m) => !mapIds.includes(m.id));
      if (remainingMaps.length > 0) {
        setActiveMap(remainingMaps[0].id, true);
      } else {
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        const newMap: Map = { id: newId, name: "My board", createdAt: now, updatedAt: now, folderId: null, isFavorite: false };
        useBoardStore.getState().addMap(newMap);
        setActiveMap(newId, true);
        const { error: fallbackError } = await supabase.from("maps").insert({ id: newId, name: "My board", created_at: now, updated_at: now, folder_id: null });
        if (fallbackError) {
          console.error("FALLBACK MAP INSERT FAILED", fallbackError);
          useBoardStore.getState().removeMap(newId);
          setToast("Could not create a new board");
          window.setTimeout(() => setToast(null), 3000);
        }
      }
    }

    // Clear canvas if the active map was removed
    if (activeMapId && mapIds.includes(activeMapId)) {
      replaceItems([]);
      replaceConnections([]);
    }

    setConfirmState(null);
  };

  const startDeleteFolder = (folder: Folder) => {
    const subfolderIds = descendantFolderIds(folder.id, folders);
    const mapIds = mapsInFolderTree(folder.id, folders, maps);
    setConfirmState({
      kind: "folder",
      id: folder.id,
      subfolderCount: subfolderIds.length,
      mapCount: mapIds.length,
      name: folder.name,
    });
    setContextMenu(null);
  };

  // ---- Tree rendering ----

  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  const sortedMaps = [...maps].sort((a, b) => a.name.localeCompare(b.name));

  const rootFolders = sortedFolders.filter(
    (f) => f.parentId === null && (!filter || filter.visibleFolderIds.has(f.id))
  );
  const rootMaps = sortedMaps.filter(
    (m) => m.folderId === null && (!filter || filter.visibleMapIds.has(m.id))
  );

  const childFolders = (parentId: string) =>
    sortedFolders.filter(
      (f) => f.parentId === parentId && (!filter || filter.visibleFolderIds.has(f.id))
    );
  const childMaps = (parentId: string) =>
    sortedMaps.filter(
      (m) => m.folderId === parentId && (!filter || filter.visibleMapIds.has(m.id))
    );

  const renderMapRow = (map: Map, level: number) => {
    const isActive = activeMapId === map.id;
    const isEditing = editingKind === "map" && editingId === map.id;
    const isDragging = dragData?.kind === "map" && dragData.id === map.id;
    return (
      <div
        key={map.id}
        draggable={!isEditing}
        onDragStart={(e) => handleDragStart(e, "map", map.id)}
        onDragEnd={handleDragEnd}
        onClick={() => { if (!isEditing && map.id !== activeMapId) setActiveMap(map.id); }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ kind: "map", id: map.id, x: Math.min(e.clientX, window.innerWidth - 160), y: Math.min(e.clientY, window.innerHeight - 100) });
        }}
        className={`group mb-px flex select-none cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 text-[13px] transition ${
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
        } ${isDragging ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        <MapIcon size={14} className={isActive ? "text-white" : "text-slate-400"} />
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
          />
        ) : (
          <span className="flex-1 truncate">{map.name}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(map.id); }}
          className={`shrink-0 rounded p-0.5 transition ${
            map.isFavorite
              ? "text-amber-400 opacity-100"
              : "text-slate-400 opacity-0 hover:text-amber-400 group-hover:opacity-100"
          } ${isActive ? "opacity-70 hover:opacity-100" : ""}`}
          title={map.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {map.isFavorite ? <Star size={13} className="fill-amber-400" /> : <Star size={13} />}
        </button>
      </div>
    );
  };

  const renderFolderRow = (folder: Folder, level: number) => {
    const isExpanded = isSearching ? filter!.searchExpanded.has(folder.id) : expanded.has(folder.id);
    const isEditing = editingKind === "folder" && editingId === folder.id;
    const depth = folderDepth(folder.id, folders);
    const canCreateSubfolder = depth < MAX_DEPTH;
    const children = childFolders(folder.id);
    const mapsInside = childMaps(folder.id);

    const isDragging = dragData?.kind === "folder" && dragData.id === folder.id;
    const isDropTarget = dragOverFolderId === folder.id;
    return (
      <div key={folder.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, "folder", folder.id)}
          onDragOver={(e) => handleDragOverFolder(e, folder.id)}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          onDragEnd={handleDragEnd}
          onClick={() => !isEditing && toggleExpanded(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ kind: "folder", id: folder.id, x: Math.min(e.clientX, window.innerWidth - 160), y: Math.min(e.clientY, window.innerHeight - 140) });
          }}
          className={`group mb-px flex select-none cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-2 text-[13px] text-slate-600 transition hover:bg-slate-100 ${
            isDragging ? "opacity-50" : ""
          } ${isDropTarget ? "bg-blue-50 ring-1 ring-blue-300" : ""}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRightSmall size={14} className="shrink-0 text-slate-400" />
          )}
          {isExpanded ? (
            <FolderOpenIcon size={14} className="shrink-0 text-slate-500" />
          ) : (
            <FolderIcon size={14} className="shrink-0 text-slate-500" />
          )}
          {isEditing ? (
            <input
              ref={editInputRef}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
            />
          ) : (
            <span className="flex-1 truncate font-medium">{folder.name}</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ kind: "folder", id: folder.id, x: Math.min(e.clientX, window.innerWidth - 160), y: Math.min(e.clientY, window.innerHeight - 140) });
            }}
            className={`shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 ${
              contextMenu?.kind === "folder" && contextMenu.id === folder.id ? "opacity-100" : ""
            }`}
            title="Folder options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {isExpanded && (
          <div
            onDragOver={(e) => handleDragOverFolder(e, folder.id)}
            onDrop={(e) => handleDropOnFolder(e, folder.id)}
          >
            {children.map((child) => renderFolderRow(child, level + 1))}
            {mapsInside.map((map) => renderMapRow(map, level + 1))}
            {creating && creating.kind === "map" && creating.parentId === folder.id && (
              <div className="mb-px flex items-center gap-2 rounded-lg bg-slate-100 py-1 pr-2" style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}>
                <MapIcon size={14} className="text-slate-400" />
                <input
                  ref={newInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={commitCreating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCreating();
                    if (e.key === "Escape") cancelCreating();
                  }}
                  placeholder="Map name"
                  className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
                />
              </div>
            )}
            {creating && creating.kind === "folder" && creating.parentId === folder.id && (
              <div className="mb-px flex items-center gap-2 rounded-lg bg-slate-100 py-1 pr-2" style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}>
                <FolderIcon size={14} className="text-slate-400" />
                <input
                  ref={newInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={commitCreating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCreating();
                    if (e.key === "Escape") cancelCreating();
                  }}
                  placeholder="Folder name"
                  className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- Favorites section ----
  const favoriteMaps = useMemo(() => {
    const favs = maps
      .filter((m) => m.isFavorite)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!filter) return favs;
    return favs.filter((m) => filter.visibleMapIds.has(m.id));
  }, [maps, filter]);

  // Sorted list of [mapId, hits] for the In cards section, grouped by map name.
  const sortedCardGroups = useMemo(() => {
    return [...cardHitsByMap.entries()].sort((a, b) => {
      const nameA = maps.find((m) => m.id === a[0])?.name ?? "";
      const nameB = maps.find((m) => m.id === b[0])?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [cardHitsByMap, maps]);

  // ---- Collapsed sidebar ----

  if (sidebarCollapsed) {
    return (
      <button
        onClick={() => setSidebarCollapsed(false)}
        className="absolute left-5 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white/90 px-2 py-4 text-slate-400 shadow-lg transition hover:text-slate-700 hover:bg-white"
        title="Show sidebar"
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  // ---- Expanded sidebar ----

  const showEmptyState = isSearching && rootFolders.length === 0 && rootMaps.length === 0 && cardHits.length === 0 && !cardHitsLoading;
  const nameResultCount = rootFolders.length + rootMaps.length;
  const folderNameFor = (folderId: string | null): string | null => {
    if (!folderId) return null;
    const f = folders.find((fo) => fo.id === folderId);
    return f?.name ?? null;
  };

  return (
    <>
      <aside className="absolute left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <MapIcon size={16} className="text-slate-700" />
            <span className="text-xs  tracking-wide text-slate-600">MAPS</span>
            <span className="text-[14px] font-medium tracking-wide text-slate-400">V{__APP_VERSION__}</span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="flex items-center justify-center rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Hide sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <div className="px-2 pb-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search maps and folders"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-7 text-[13px] text-slate-700 outline-none focus:border-slate-400"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2" onDragOver={handleDragOverRoot} onDrop={handleDropOnRoot}>
          {/* ---- Favorites section ---- */}
          {favoriteMaps.length > 0 && (
            <div className="mb-2">
              <button
                onClick={toggleFavCollapsed}
                className="mb-1 flex w-full items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 transition hover:text-slate-600"
              >
                {favCollapsed ? <ChevronRightSmall size={12} /> : <ChevronDown size={12} />}
                Favorites · {favoriteMaps.length}
              </button>
              {!favCollapsed && favoriteMaps.map((map) => {
                const isActive = activeMapId === map.id;
                const folderLabel = map.folderId ? folderNameFor(map.folderId) : null;
                return (
                  <div
                    key={map.id}
                    onClick={() => { if (map.id !== activeMapId) setActiveMap(map.id); }}
                    className={`group mb-px flex select-none cursor-pointer items-center gap-2 rounded-lg py-1 px-2 text-[13px] transition ${
                      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <MapIcon size={14} className={isActive ? "text-white" : "text-slate-400"} />
                    <span className="flex-1 truncate">{map.name}</span>
                    {folderLabel && <span className={`truncate text-[10px] ${isActive ? "text-slate-300" : "text-slate-400"}`}>· {folderLabel}</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(map.id); }}
                      className={`shrink-0 rounded p-0.5 transition ${
                        map.isFavorite
                          ? "text-amber-400 opacity-100"
                          : "text-slate-400 opacity-0 hover:text-amber-400 group-hover:opacity-100"
                      } ${isActive ? "opacity-70 hover:opacity-100" : ""}`}
                      title={map.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      {map.isFavorite ? <Star size={13} className="fill-amber-400" /> : <Star size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {showEmptyState ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="text-xs text-slate-400">
                No maps or folders match &lsquo;{debouncedQuery}&rsquo;
              </p>
              <button
                onClick={() => setSearchInput("")}
                className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {isSearching && nameResultCount > 0 && (
                <div className="mb-1 mt-1 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Maps &amp; folders · {nameResultCount}</div>
              )}
              {/* Root folders first, alphabetically */}
              {rootFolders.map((folder) => renderFolderRow(folder, 0))}
              {/* Root-level loose maps */}
              {rootMaps.map((map) => renderMapRow(map, 0))}
              {/* Inline new map at root */}
              {creating && creating.kind === "map" && creating.parentId === null && (
                <div className="mb-px flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1">
                  <MapIcon size={14} className="text-slate-400" />
                  <input
                    ref={newInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={commitCreating}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCreating();
                      if (e.key === "Escape") cancelCreating();
                    }}
                    placeholder="Map name"
                    className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
                  />
                </div>
              )}
              {/* Inline new folder at root */}
              {creating && creating.kind === "folder" && creating.parentId === null && (
                <div className="mb-px flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1">
                  <FolderIcon size={14} className="text-slate-400" />
                  <input
                    ref={newInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={commitCreating}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCreating();
                      if (e.key === "Escape") cancelCreating();
                    }}
                    placeholder="Folder name"
                    className="nodrag nopan flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
                  />
                </div>
              )}
              {dragOverRoot && dragData && <div className="mb-1 h-0.5 rounded-full bg-blue-500" />}
              {/* ---- In cards section ---- */}
              {isSearching && debouncedQuery.length >= 2 && (
                <div className="mt-3">
                  {cardHitsLoading && (
                    <div className="px-2 py-1 text-[11px] text-slate-400">Searching cards…</div>
                  )}
                  {cardHitsError && (
                    <div className="px-2 py-1 text-[11px] text-slate-400">Couldn't search card contents</div>
                  )}
                  {!cardHitsLoading && !cardHitsError && cardHits.length > 0 && (
                    <>
                      <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">In cards · {cardHits.length}</div>
                      {sortedCardGroups.map(([mapId, hits]) => {
                        const map = maps.find((m) => m.id === mapId);
                        const mapName = map?.name ?? "Unknown map";
                        const folderLabel = map?.folderId ? folderNameFor(map.folderId) : null;
                        return (
                          <div key={mapId} className="mb-2">
                            <div className="flex items-center gap-1.5 px-2 py-0.5">
                              <MapIcon size={11} className="shrink-0 text-slate-400" />
                              <span className="truncate text-[11px] font-semibold text-slate-600">{mapName}</span>
                              {folderLabel && <span className="truncate text-[10px] text-slate-400">· {folderLabel}</span>}
                            </div>
                            {hits.map((hit) => (
                              <button
                                key={hit.id}
                                onClick={() => navigateToCard(hit.id, hit.mapId)}
                                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1 pl-6 text-left transition hover:bg-slate-100"
                              >
                                <span className="truncate text-[12px] font-medium text-slate-700">{hit.title || "Untitled"}</span>
                                <HighlightedSnippet snippet={makeSnippet(hit.description, debouncedQuery)} query={debouncedQuery} />
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                  {!cardHitsLoading && !cardHitsError && cardHits.length === 0 && nameResultCount === 0 && (
                    <div className="px-2 py-1 text-[11px] text-slate-400">No cards match &lsquo;{debouncedQuery}&rsquo;</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-slate-100 p-2">
          <button
            onClick={handleNewRootMap}
            className="flex w-full items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            <Plus size={15} /> New map
          </button>
          <button
            onClick={() => { setCreating({ kind: "folder", parentId: null }); setNewName(""); }}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Plus size={15} /> New folder
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <HelpCircle size={15} /> Help
          </button>
        </div>
      </aside>

      {/* ---- Context menu ---- */}
      {contextMenu && (
        <div
          className="nodrag nopan fixed z-50 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "map" && (
            <>
              <button
                className="menu nodrag nopan"
                onClick={() => {
                  const map = maps.find((m) => m.id === contextMenu.id);
                  if (map) startRenameMap(map);
                }}
              >
                <Edit3 size={14} /> Rename
              </button>
              <button
                className="menu nodrag nopan"
                disabled={duplicatingId === contextMenu.id}
                onClick={() => {
                  const id = contextMenu.id;
                  setContextMenu(null);
                  void duplicateMap(id);
                }}
              >
                {duplicatingId === contextMenu.id
                  ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" /> Duplicating…</>
                  : <><Copy size={14} /> Duplicate</>}
              </button>
              <button
                className="menu nodrag nopan"
                onClick={() => {
                  toggleFavorite(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                <Star size={14} className={maps.find((m) => m.id === contextMenu.id)?.isFavorite ? "fill-amber-400 text-amber-400" : ""} />
                {maps.find((m) => m.id === contextMenu.id)?.isFavorite ? "Remove from favorites" : "Add to favorites"}
              </button>
              <button
                className="menu nodrag nopan text-red-600"
                onClick={() => {
                  setConfirmState({ kind: "map", id: contextMenu.id });
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
          {contextMenu.kind === "folder" && (() => {
            const folder = folders.find((f) => f.id === contextMenu.id);
            if (!folder) return null;
            const depth = folderDepth(folder.id, folders);
            const canCreateSubfolder = depth < MAX_DEPTH;
            return (
              <>
                <button
                  className="menu nodrag nopan"
                  onClick={() => startRenameFolder(folder)}
                >
                  <Edit3 size={14} /> Rename
                </button>
                <button
                  className="menu nodrag nopan"
                  onClick={() => handleNewMapInside(folder.id)}
                >
                  <MapIcon size={14} /> New map inside
                </button>
                <button
                  className="menu nodrag nopan"
                  onClick={() => handleNewSubfolder(folder.id)}
                  disabled={!canCreateSubfolder}
                  style={!canCreateSubfolder ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  title={!canCreateSubfolder ? "Maximum depth reached (3 levels)" : undefined}
                >
                  <FolderIcon size={14} /> New subfolder
                  {!canCreateSubfolder && <span className="ml-auto text-[10px] text-slate-400">max</span>}
                </button>
                <button
                  className="menu nodrag nopan text-red-600"
                  onClick={() => startDeleteFolder(folder)}
                >
                  <Trash2 size={14} /> Delete folder
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ---- Delete confirmation dialog ---- */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmState(null)}>
          <div className="w-80 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {confirmState.kind === "map" ? (
              <>
                <h3 className="text-sm font-bold text-slate-900">Delete this map?</h3>
                <p className="mt-2 text-xs text-slate-500">
                  This will permanently delete the map and all of its cards and connections. This cannot be undone.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-slate-900">
                  Delete &lsquo;{confirmState.name}&rsquo;?
                </h3>
                <p className="mt-2 text-xs text-slate-500">
                  This will also delete {confirmState.subfolderCount === 1 ? "1 subfolder" : `${confirmState.subfolderCount} subfolders`}
                  {" and "}
                  {confirmState.mapCount === 1 ? "1 map" : `${confirmState.mapCount} maps`}
                  {", including all their cards and connections."}
                </p>
              </>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmState(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmState.kind === "map" ? confirmDeleteMap : confirmDeleteFolder}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">
          <span>{toast}</span>
        </div>
      )}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export default MapSidebar;
