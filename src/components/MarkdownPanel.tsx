import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, Check } from "lucide-react";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import { findFreeCardPosition } from "@/lib/layout";
import { parseMarkdown, promoteFirstH1, serializeItemsForDisplay, type MarkdownSection } from "@/lib/markdown";
import { handleTextareaPaste } from "@/lib/smartPaste";
import type { Item, Connection } from "@/types";

const REORDER_MESSAGE = "Reordering cards in the markdown panel isn't supported yet — reorder was not applied.";

type PendingApply = {
  items: Item[];
  connections: Connection[];
  deletedTitles: string[];
};

function sectionToItem(section: MarkdownSection, activeMapId: string, items: Item[]): Item {
  const promoted = promoteFirstH1(section.description, section.title);
  const position = findFreeCardPosition(0, 0, items, undefined, promoted.description);
  return {
    id: crypto.randomUUID(),
    title: promoted.title ?? section.title,
    tags: section.tags,
    createdAt: new Date().toISOString(),
    dueDate: section.dueDate,
    description: promoted.description,
    posX: position.x,
    posY: position.y,
    color: null,
    width: null,
    height: null,
    scale: null,
    status: null,
    cardType: "note",
    mapId: activeMapId,
  };
}

function MarkdownPanel() {
  const activeMapId = useBoardStore((s) => s.activeMapId);
  const items = useBoardStore((s) => s.items);
  const collapsed = useBoardStore((s) => s.markdownPanelCollapsed);
  const mapLoading = useBoardStore((s) => s.mapLoading);
  const markdownDirty = useBoardStore((s) => s.markdownDirty);
  const setCollapsed = useBoardStore((s) => s.setMarkdownPanelCollapsed);
  const setDirty = useBoardStore((s) => s.setMarkdownDirty);
  const applyMarkdownChanges = useBoardStore((s) => s.applyMarkdownChanges);

  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "markdown-panel", open: pendingApply !== null } }));
    return () => { window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "markdown-panel", open: false } })); };
  }, [pendingApply]);

  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const previousMapIdRef = useRef<string | null>(activeMapId);
  const valueRef = useRef("");
  const sectionIdsRef = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateValue = useCallback((next: string, ids: string[]) => {
    valueRef.current = next;
    sectionIdsRef.current = ids;
    setValue(next);
  }, []);

  const regenerateFromCanvas = useCallback((currentItems: Item[]) => {
    updateValue(serializeItemsForDisplay(currentItems), currentItems.map((item) => item.id));
    dirtyRef.current = false;
    setDirty(false);
  }, [updateValue, setDirty]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (previousMapIdRef.current === activeMapId) return;
    previousMapIdRef.current = activeMapId;
    dirtyRef.current = false;
    setDirty(false);
    setNotice(null);
    regenerateFromCanvas(items);
  }, [activeMapId, items, regenerateFromCanvas, setDirty]);

  // Canvas → markdown: live regeneration, but never while focused or dirty.
  useEffect(() => {
    if (!activeMapId || mapLoading || focusedRef.current || dirtyRef.current) return;
    regenerateFromCanvas(items);
  }, [activeMapId, items, mapLoading, regenerateFromCanvas]);

  const computeApply = useCallback((): { kind: "apply"; pending: PendingApply } | { kind: "skip"; reason: string } | { kind: "reorder" } | { kind: "malformed"; pending: PendingApply } => {
    const text = valueRef.current;
    const currentItems = useBoardStore.getState().items;
    const currentConnections = useBoardStore.getState().connections;

    if (mapLoading) {
      regenerateFromCanvas(currentItems);
      return { kind: "skip", reason: "Map is still loading — panel refreshed from canvas." };
    }

    if (text.trim() === "" && currentItems.length > 0) {
      regenerateFromCanvas(currentItems);
      return { kind: "skip", reason: "Panel was empty — refreshed from canvas instead of applying." };
    }

    const parsed = parseMarkdown(text);
    const storedIds = sectionIdsRef.current;
    const byId = new Map(currentItems.map((item) => [item.id, item]));

    const sections = parsed.sections;
    const usedIds = new Set<string>();
    const representedIds = new Set<string>();
    const nextItems: Item[] = [];
    let malformed = parsed.malformedCount > 0;

    const mismatchedTitles: string[] = [];
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      const storedId = storedIds[i];
      if (storedId) {
        const existing = byId.get(storedId);
        if (!existing || usedIds.has(storedId)) {
          malformed = true;
          continue;
        }
        if (existing.title !== section.title) mismatchedTitles.push(section.title);
        usedIds.add(storedId);
        representedIds.add(storedId);
        const promoted = promoteFirstH1(section.description, existing.title);
        nextItems.push({
          ...existing,
          title: promoted.title ?? (existing.title.trim() && existing.title !== "Untitled" ? existing.title : section.title),
          tags: section.tags,
          dueDate: section.dueDate,
          description: promoted.description,
        });
        continue;
      }
      const newItem = sectionToItem(section, activeMapId!, [...currentItems, ...nextItems]);
      usedIds.add(newItem.id);
      nextItems.push(newItem);
    }

    if (!malformed && mismatchedTitles.length > 1) {
      const expectedTitles = storedIds.slice(0, sections.length).map((id) => byId.get(id)?.title).filter((t): t is string => Boolean(t));
      const parsedSet = new Set(sections.map((s) => s.title));
      const expectedSet = new Set(expectedTitles);
      const sameMembers = parsedSet.size === expectedSet.size && [...parsedSet].every((t) => expectedSet.has(t));
      if (sameMembers) {
        return { kind: "reorder" };
      }
    }

    const deleted = currentItems.filter((item) => !representedIds.has(item.id));
    const deletedTitles = deleted.map((item) => item.title);

    if (malformed) {
      currentItems.forEach((item) => {
        if (!representedIds.has(item.id)) nextItems.push(item);
      });
    }

    nextItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const nextIds = new Set(nextItems.map((item) => item.id));
    const nextConnections = currentConnections.filter((connection) => nextIds.has(connection.sourceId) && nextIds.has(connection.targetId));

    if (malformed) {
      return { kind: "malformed", pending: { items: nextItems, connections: nextConnections, deletedTitles: [] } };
    }

    return { kind: "apply", pending: { items: nextItems, connections: nextConnections, deletedTitles } };
  }, [activeMapId, mapLoading, regenerateFromCanvas]);

  const commitApply = useCallback((pending: PendingApply) => {
    applyMarkdownChanges(pending.items, pending.connections);
    updateValue(serializeItemsForDisplay(pending.items), pending.items.map((item) => item.id));
    dirtyRef.current = false;
    setDirty(false);
    setNotice(null);
    showToast("Applied to canvas.");
  }, [applyMarkdownChanges, updateValue, setDirty, showToast]);

  const handleApply = useCallback(() => {
    if (!dirtyRef.current) return;
    const result = computeApply();
    if (result.kind === "skip") {
      showToast(result.reason);
      return;
    }
    if (result.kind === "reorder") {
      setNotice(REORDER_MESSAGE);
      regenerateFromCanvas(useBoardStore.getState().items);
      return;
    }
    if (result.kind === "malformed") {
      commitApply(result.pending);
      return;
    }
    if (result.pending.deletedTitles.length > 0) {
      setPendingApply(result.pending);
      return;
    }
    commitApply(result.pending);
  }, [computeApply, commitApply, regenerateFromCanvas, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!pendingApply) return;
    const pending = pendingApply;
    const currentState = useBoardStore.getState();
    const deletedItems = currentState.items.filter((item) => !pending.items.some((nextItem) => nextItem.id === item.id));
    const deletedItemIds = new Set(deletedItems.map((item) => item.id));
    const deletedConnections = currentState.connections.filter((connection) =>
      deletedItemIds.has(connection.sourceId) || deletedItemIds.has(connection.targetId) || !pending.connections.some((nextConnection) => nextConnection.id === connection.id),
    );
    for (const connection of deletedConnections) {
      const { error } = await supabase.from("connections").delete().eq("id", connection.id);
      if (error) {
        console.error("Supabase connection delete failed", error);
        showToast("Could not delete the selected cards");
        return;
      }
    }
    for (const item of deletedItems) {
      const { error } = await supabase.from("items").delete().eq("id", item.id);
      if (error) {
        console.error("Supabase item delete failed", error);
        showToast("Could not delete the selected cards");
        return;
      }
    }
    setPendingApply(null);
    commitApply(pending);
  }, [pendingApply, commitApply, showToast]);

  const cancelDelete = useCallback(() => {
    setPendingApply(null);
  }, []);

  const handleChange = (next: string) => {
    updateValue(next, sectionIdsRef.current);
    dirtyRef.current = true;
    setDirty(true);
    setNotice(null);
  };

  // Escape closes the delete modal.
  useEffect(() => {
    if (!pendingApply) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPendingApply(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingApply]);

  // Opening focuses the textarea with the cursor at the start; closing blurs it
  // so canvas shortcuts keep working. Dirty text is preserved in state and restored.
  useEffect(() => {
    if (collapsed) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const canvas = document.querySelector(".react-flow__pane") as HTMLElement | null;
      canvas?.focus();
      return;
    }
    const timer = setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    }, 50);
    return () => clearTimeout(timer);
  }, [collapsed]);

  if (collapsed) return null;

  return (
    <>
      <aside className="absolute right-0 top-0 z-40 flex h-full w-[360px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-slate-700" />
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-bold tracking-wide text-slate-700">MARKDOWN</div>
              {markdownDirty && <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" title="Unsaved edits" />}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleApply}
              disabled={!markdownDirty || !activeMapId || mapLoading}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              title="Apply markdown to canvas (Cmd/Ctrl+S)"
            >
              <Check size={13} />
              Apply to canvas
            </button>
            <button onClick={() => setCollapsed(true)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Collapse markdown panel">
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        {notice && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] leading-5 text-amber-800">{notice}</div>}

        {toast && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[12px] leading-5 text-slate-600">
            {toast}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => { focusedRef.current = false; }}
          onPaste={(e) => handleTextareaPaste(e, "sidebar")}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              handleApply();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              const canvas = document.querySelector(".react-flow__pane") as HTMLElement | null;
              canvas?.focus();
            }
          }}
          disabled={!activeMapId || mapLoading}
          spellCheck={false}
          aria-label="Map markdown"
          placeholder={mapLoading ? "Loading map…" : "## Start writing a card"}
          className="min-h-0 flex-1 resize-none border-0 px-4 py-4 font-mono text-[13px] leading-6 text-slate-700 outline-none placeholder:text-slate-300 disabled:bg-slate-50"
        />
      </aside>

      {pendingApply && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={cancelDelete}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-800">
              Delete {pendingApply.deletedTitles.length === 1 ? "this 1 card" : `these ${pendingApply.deletedTitles.length} cards`}?
            </h3>
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-6 text-slate-700">
              {pendingApply.deletedTitles.map((title) => (
                <li key={title} className="truncate">{title}</li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cancelDelete}
                className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MarkdownPanel;
