import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { bindings, displayOnlyShortcuts, type Action } from "@/lib/keyboardBindings";

type ModalStateEvent = CustomEvent<{ source: string; open: boolean }>;

/** A single runnable command in the palette, derived from the dispatch table. */
type Command = {
  action: Action;
  label: string;
  displays: string[];
  section: string;
  editorOnly?: boolean;
  /** When set, the command is shown but disabled with this reason. */
  disabledReason?: string;
};

/** Actions that require a card selection to be runnable. */
const SELECTION_ACTIONS = new Set<Action>([
  "alignLeft", "alignRight", "alignTop", "alignBottom",
  "distributeH", "distributeV",
  "scaleUp", "scaleDown", "resetSize",
  "toggleFocus",
  "deleteCards",
  "typeNote", "typeDecision", "typeOption", "typeAssumption", "typeRisk", "typeEvidence",
]);

/** Actions excluded from the canvas palette entirely because they require an
 *  open popup editor, a focused text field, a specific mode, or are not useful
 *  when triggered from a palette search.
 *  - editTitle: needs a focused inline title editor on a selected card.
 *  - openPopupEditor: needs a selection and opens a popup editor.
 *  - connectMode: needs a selection and enters a keyboard-navigation mode.
 *  - tabNext / tabPrev: create connected cards / navigate parent — require a
 *    selection and are designed to run from the inline editor context.
 *  - selectNextConnection: requires an existing connection selection.
 *  - escape: clears the current editor/selection — meaningless from a palette.
 *  - nudge*: require a selection and are designed for direct key repeat.
 *  - nav*: require a selection and are designed for direct key repeat. */
const HIDDEN_ACTIONS = new Set<Action>([
  "escape",
  "nudgeUp", "nudgeDown", "nudgeLeft", "nudgeRight",
  "nudgeUp1", "nudgeDown1", "nudgeLeft1", "nudgeRight1",
  "navUp", "navDown", "navLeft", "navRight",
  "selectNextConnection",
  "editTitle", "openPopupEditor", "connectMode", "tabNext", "tabPrev",
]);

const SECTION_ORDER = ["Creating", "Editing", "Selection & navigation", "Connections", "Layout", "Focus mode", "Styles", "Card type", "Status", "Sizing", "Markdown editing"];

/** Build the command list from the dispatch table + display-only shortcuts.
 *  Deduplicates by ACTION (not by display), so an action with multiple
 *  bindings renders a single row with its displays joined by " / ". */
function buildCommands(): Command[] {
  const commands: Command[] = [];
  const byAction = new Map<Action, Command>();
  const seenDisplayOnly = new Set<string>();

  for (const b of bindings) {
    if (HIDDEN_ACTIONS.has(b.action)) continue;
    const existing = byAction.get(b.action);
    if (existing) {
      if (!existing.displays.includes(b.display)) existing.displays.push(b.display);
      continue;
    }
    byAction.set(b.action, {
      action: b.action,
      label: b.label,
      displays: [b.display],
      section: b.section,
      disabledReason: SELECTION_ACTIONS.has(b.action) ? "needs a selection" : undefined,
    });
  }
  for (const cmd of byAction.values()) commands.push(cmd);

  for (const d of displayOnlyShortcuts) {
    const key = d.display + "|" + d.label;
    if (seenDisplayOnly.has(key)) continue;
    seenDisplayOnly.add(key);
    commands.push({ action: "newCard" as Action, label: d.label, displays: [d.display], section: d.section, editorOnly: true });
  }
  return commands;
}

const ALL_COMMANDS = buildCommands();

/** Normalize a string for case- and accent-insensitive comparison. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Subsequence match: returns the matched indices if query is a subsequence
 *  of name (case/accent-insensitive), or null if it is not. */
function subsequenceMatch(query: string, name: string): number[] | null {
  const q = normalize(query);
  const n = normalize(name);
  if (!q) return [];
  const indices: number[] = [];
  let qi = 0;
  for (let ni = 0; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) {
      indices.push(ni);
      qi++;
    }
  }
  return qi === q.length ? indices : null;
}

/** Rank: 0 = exact prefix, 1 = word-boundary prefix, 2 = mid-word, 3 = scattered. */
function rankMatch(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q) return 0;
  if (n.startsWith(q)) return 0;
  // Word-boundary prefix: query matches at start of a word (after space or punctuation).
  const wordStart = n.search(new RegExp(`(?:^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
  if (wordStart !== -1) return 1;
  // Mid-word: query appears as a contiguous substring.
  if (n.includes(q)) return 2;
  return 3;
}

type FlatRow = Command & { matchIndices: number[]; rank: number };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalSourcesRef = useRef<Record<string, boolean>>({});

  useEffect(() => { openRef.current = open; window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "commandPalette", open } })); }, [open]);

  useEffect(() => {
    const handleModalState = (event: Event) => {
      const { source, open: isOpen } = (event as ModalStateEvent).detail;
      if (source === "commandPalette") return;
      modalSourcesRef.current = { ...modalSourcesRef.current, [source]: isOpen };
    };
    window.addEventListener("mymind:modal-state", handleModalState);
    return () => window.removeEventListener("mymind:modal-state", handleModalState);
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);

  // Listen for the open command from the keyboard handler / hint button.
  useEffect(() => {
    const handler = () => openPalette();
    window.addEventListener("mymind:open-command-palette", handler);
    return () => window.removeEventListener("mymind:open-command-palette", handler);
  }, [openPalette]);

  // Keyboard: Cmd/Ctrl+K to open (canvas-only, tiered guard), Escape to close.
  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (event.code !== "KeyK") return;
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (Object.values(modalSourcesRef.current).some(Boolean)) return;
      event.preventDefault();
      openPalette();
    };
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.code === "Escape" && openRef.current) {
        event.stopImmediatePropagation();
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("keydown", escapeHandler, true);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("keydown", escapeHandler, true);
    };
  }, [openPalette]);

  // Filter + group + rank.
  const grouped = useMemo(() => {
    const trimmed = query.trim();
    const rows: FlatRow[] = [];
    for (const cmd of ALL_COMMANDS) {
      // Hide editor-only entries when opened from the canvas (always, for now).
      if (cmd.editorOnly) continue;
      const indices = subsequenceMatch(trimmed, cmd.label);
      if (indices === null) continue;
      rows.push({ ...cmd, matchIndices: indices, rank: rankMatch(trimmed, cmd.label) });
    }
    rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));

    const sections: { title: string; rows: FlatRow[] }[] = [];
    const bySection = new Map<string, FlatRow[]>();
    for (const row of rows) {
      const list = bySection.get(row.section) ?? [];
      list.push(row);
      bySection.set(row.section, list);
    }
    for (const title of SECTION_ORDER) {
      const list = bySection.get(title);
      if (list && list.length > 0) sections.push({ title, rows: list });
    }
    return sections;
  }, [query]);

  const flatRows = useMemo(() => grouped.flatMap((g) => g.rows), [grouped]);

  // Keep selection in bounds when results change.
  useEffect(() => {
    if (selected >= flatRows.length) setSelected(0);
  }, [flatRows.length, selected]);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll selected row into view.
  useEffect(() => {
    if (!open) return;
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-row-index="${selected}"]`);
    if (el) {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
    }
  }, [selected, open]);

  const [toast, setToast] = useState<string | null>(null);

  const runCommand = useCallback((row: FlatRow) => {
    if (row.editorOnly || row.disabledReason) return;
    setOpen(false);
    try {
      window.dispatchEvent(new CustomEvent("mymind:run-action", { detail: { action: row.action } }));
    } catch (err) {
      console.error(`[commandPalette] action "${row.action}" failed`, err);
      setToast("That command failed");
      window.setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.code === "ArrowDown") {
      event.preventDefault();
      setSelected((s) => (flatRows.length === 0 ? 0 : (s + 1) % flatRows.length));
    } else if (event.code === "ArrowUp") {
      event.preventDefault();
      setSelected((s) => (flatRows.length === 0 ? 0 : (s - 1 + flatRows.length) % flatRows.length));
    } else if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault();
      const row = flatRows[selected];
      if (row) runCommand(row);
    }
  }, [flatRows, selected, runCommand]);

  if (!open) return null;

  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/30 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <section
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-slate-100 px-3 py-[7px]">
          <Search size={15} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-[13.5px] leading-none text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close command palette"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setOpen(false)}
          >
            <X size={14} />
          </button>
        </div>
        <div ref={listRef} className="min-h-0 max-h-[460px] flex-1 overflow-y-auto pt-0.5 pb-1">
          {flatRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {trimmed ? <>No commands match &lsquo;{trimmed}&rsquo;</> : "No commands available"}
            </div>
          ) : (
            grouped.map((section) => (
              <div key={section.title} className="mt-[5px] mb-0.5">
                <h3 className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400">{section.title}</h3>
                {section.rows.map((row) => {
                  const flatIndex = flatRows.indexOf(row);
                  const isSelected = flatIndex === selected;
                  const isDisabled = !!row.disabledReason;
                  return (
                    <button
                      key={row.section + "|" + row.label + "|" + row.action}
                      data-row-index={flatIndex}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => runCommand(row)}
                      onMouseEnter={() => !isDisabled && setSelected(flatIndex)}
                      className={`flex h-[28px] w-full items-center justify-between px-2.5 py-1 text-left text-[12.5px] leading-none transition ${
                        isSelected && !isDisabled ? "bg-slate-100 text-slate-900" : isDisabled ? "text-slate-300" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <HighlightMatch label={row.label} indices={row.matchIndices} />
                      </span>
                      {isDisabled ? (
                        <span className="text-[10.5px] italic text-slate-400">{row.disabledReason}</span>
                      ) : (
                        <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-slate-500">{row.displays.join(" / ")}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>
      {toast && <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

/** Renders a label with the matched subsequence characters highlighted. */
function HighlightMatch({ label, indices }: { label: string; indices: number[] }) {
  if (indices.length === 0) return <span>{label}</span>;
  const set = new Set(indices);
  const chars = Array.from(label);
  return (
    <span>
      {chars.map((ch, i) => (
        <span key={i} className={set.has(i) ? "font-semibold text-slate-900" : ""}>{ch}</span>
      ))}
    </span>
  );
}
