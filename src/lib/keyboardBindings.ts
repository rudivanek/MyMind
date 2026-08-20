export type Scope = "global" | "canvas";

export type Action =
  | "newCard"
  | "burstEntry"
  | "editTitle"
  | "deleteConnection"
  | "deleteCards"
  | "undo"
  | "redo"
  | "toggleMarkdown"
  | "escape"
  | "arrange"
  | "alignLeft"
  | "alignRight"
  | "alignTop"
  | "alignBottom"
  | "distributeH"
  | "distributeV"
  | "colourNormal"
  | "colourHighlighted"
  | "colourMuted"
  | "colourRed"
  | "colourBlack"
  | "statusTodo"
  | "statusDone"
  | "statusQuestion"
  | "statusImportant"
  | "clearStatus"
  | "scaleUp"
  | "scaleDown"
  | "resetSize"
  | "nudgeUp"
  | "nudgeDown"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeUp1"
  | "nudgeDown1"
  | "nudgeLeft1"
  | "nudgeRight1"
  | "navUp"
  | "navDown"
  | "navLeft"
  | "navRight"
  | "tabNext"
  | "tabPrev"
  | "connectMode"
  | "selectNextConnection"
  | "openPopupEditor"
  | "toggleSidebar"
  | "fitView"
  | "tidy"
  | "toggleSnap"
  | "exportPdf"
  | "toggleFocus"
  | "focusDepthIncrease"
  | "focusDepthDecrease"
  | "openCommandPalette"
  | "typeNote"
  | "typeDecision"
  | "typeOption"
  | "typeAssumption"
  | "typeRisk"
  | "typeEvidence";

export interface Binding {
  code: string | string[];
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  scope: Scope;
  action: Action;
  /** Human-readable key combination for the shortcuts modal */
  display: string;
  /** Section heading in the shortcuts modal */
  section: string;
  /** Description for the shortcuts modal */
  label: string;
}

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export const bindings: Binding[] = [
  // Creating
  { code: "KeyN", scope: "canvas", action: "newCard", display: "N", section: "Creating", label: "New card" },
  { code: "KeyN", shift: true, scope: "canvas", action: "burstEntry", display: "Shift+N", section: "Creating", label: "Burst entry" },
  { code: "Tab", scope: "canvas", action: "tabNext", display: "Tab", section: "Creating", label: "Create connected card" },
  { code: "Tab", shift: true, scope: "canvas", action: "tabPrev", display: "Shift+Tab", section: "Selection & navigation", label: "Previous card" },

  // Editing
  { code: "Enter", scope: "canvas", action: "editTitle", display: "Enter", section: "Editing", label: "Edit title" },
  { code: "Enter", shift: true, scope: "canvas", action: "openPopupEditor", display: "Shift+Enter", section: "Editing", label: "Open card editor" },
  { code: "Delete", scope: "canvas", action: "deleteCards", display: "Del", section: "Editing", label: "Delete selection" },
  { code: "Backspace", scope: "canvas", action: "deleteCards", display: "⌫", section: "Editing", label: "Delete selection" },
  { code: "KeyZ", meta: true, scope: "global", action: "undo", display: `${mod}+Z`, section: "Editing", label: "Undo" },
  { code: "KeyZ", ctrl: true, scope: "global", action: "undo", display: `${mod}+Z`, section: "Editing", label: "Undo" },
  { code: "KeyZ", meta: true, shift: true, scope: "global", action: "redo", display: `${mod}+Shift+Z`, section: "Editing", label: "Redo" },
  { code: "KeyZ", ctrl: true, shift: true, scope: "global", action: "redo", display: `${mod}+Shift+Z`, section: "Editing", label: "Redo" },
  { code: "KeyY", meta: true, scope: "global", action: "redo", display: `${mod}+Y`, section: "Editing", label: "Redo" },
  { code: "KeyY", ctrl: true, scope: "global", action: "redo", display: `${mod}+Y`, section: "Editing", label: "Redo" },
  { code: "KeyM", meta: true, scope: "global", action: "toggleMarkdown", display: `${mod}+M`, section: "Editing", label: "Markdown panel" },
  { code: "KeyM", ctrl: true, scope: "global", action: "toggleMarkdown", display: `${mod}+M`, section: "Editing", label: "Markdown panel" },
  { code: "KeyB", meta: true, scope: "global", action: "toggleSidebar", display: `${mod}+B`, section: "Editing", label: "Toggle sidebar" },
  { code: "KeyB", ctrl: true, scope: "global", action: "toggleSidebar", display: `${mod}+B`, section: "Editing", label: "Toggle sidebar" },

  // Escape
  { code: "Escape", scope: "canvas", action: "escape", display: "Esc", section: "Editing", label: "Exit editor / clear selection" },

  // Connections
  { code: "KeyC", scope: "canvas", action: "connectMode", display: "C", section: "Connections", label: "Start connection mode" },
  { code: "KeyE", scope: "canvas", action: "selectNextConnection", display: "E", section: "Connections", label: "Cycle connections" },

  // Layout
  { code: "KeyL", alt: true, scope: "global", action: "arrange", display: "Alt+L", section: "Layout", label: "Arrange" },
  { code: "KeyT", scope: "canvas", action: "tidy", display: "T", section: "Layout", label: "Tidy layout" },
  { code: "KeyF", scope: "canvas", action: "fitView", display: "F", section: "Layout", label: "Fit to view" },
  { code: "KeyG", scope: "canvas", action: "toggleSnap", display: "G", section: "Layout", label: "Toggle snap-to-grid" },
  { code: "KeyP", alt: true, scope: "canvas", action: "exportPdf", display: "Alt+P", section: "Layout", label: "Export map as PDF" },

  // Focus mode
  { code: "KeyF", alt: true, scope: "canvas", action: "toggleFocus", display: "Alt+F", section: "Focus mode", label: "Toggle focus mode" },
  { code: "BracketRight", scope: "canvas", action: "focusDepthIncrease", display: "]", section: "Focus mode", label: "Increase focus depth" },
  { code: "BracketLeft", scope: "canvas", action: "focusDepthDecrease", display: "[", section: "Focus mode", label: "Decrease focus depth" },

  // Command palette
  { code: "KeyK", meta: true, scope: "canvas", action: "openCommandPalette", display: `${mod}+K`, section: "Layout", label: "Open command palette" },
  { code: "KeyK", ctrl: true, scope: "canvas", action: "openCommandPalette", display: `${mod}+K`, section: "Layout", label: "Open command palette" },
  { code: "ArrowLeft", alt: true, shift: true, scope: "global", action: "alignLeft", display: "Alt+Shift+←", section: "Layout", label: "Align left" },
  { code: "ArrowRight", alt: true, shift: true, scope: "global", action: "alignRight", display: "Alt+Shift+→", section: "Layout", label: "Align right" },
  { code: "ArrowUp", alt: true, shift: true, scope: "global", action: "alignTop", display: "Alt+Shift+↑", section: "Layout", label: "Align top" },
  { code: "ArrowDown", alt: true, shift: true, scope: "global", action: "alignBottom", display: "Alt+Shift+↓", section: "Layout", label: "Align bottom" },
  { code: "KeyH", alt: true, shift: true, scope: "global", action: "distributeH", display: "Alt+Shift+H", section: "Layout", label: "Distribute horizontally" },
  { code: "KeyV", alt: true, shift: true, scope: "global", action: "distributeV", display: "Alt+Shift+V", section: "Layout", label: "Distribute vertically" },

  // Styles
  { code: ["Digit1", "Numpad1"], alt: true, scope: "global", action: "colourNormal", display: "Alt+1", section: "Styles", label: "Normal colour" },
  { code: ["Digit2", "Numpad2"], alt: true, scope: "global", action: "colourHighlighted", display: "Alt+2", section: "Styles", label: "Highlighted colour" },
  { code: ["Digit3", "Numpad3"], alt: true, scope: "global", action: "colourMuted", display: "Alt+3", section: "Styles", label: "Muted colour" },
  { code: ["Digit4", "Numpad4"], alt: true, scope: "global", action: "colourRed", display: "Alt+4", section: "Styles", label: "Red colour" },
  { code: ["Digit5", "Numpad5"], alt: true, scope: "global", action: "colourBlack", display: "Alt+5", section: "Styles", label: "Black colour" },
  // Intentional alias: Alt+0 resets to the normal colour, same action as Alt+1.
  { code: ["Digit0", "Numpad0"], alt: true, scope: "global", action: "colourNormal", display: "Alt+0", section: "Styles", label: "Reset colour" },

  // Card type
  { code: ["Digit1", "Numpad1"], alt: true, shift: true, scope: "canvas", action: "typeNote", display: "Alt+Shift+1", section: "Card type", label: "Type: Note" },
  { code: ["Digit2", "Numpad2"], alt: true, shift: true, scope: "canvas", action: "typeDecision", display: "Alt+Shift+2", section: "Card type", label: "Type: Decision" },
  { code: ["Digit3", "Numpad3"], alt: true, shift: true, scope: "canvas", action: "typeOption", display: "Alt+Shift+3", section: "Card type", label: "Type: Option" },
  { code: ["Digit4", "Numpad4"], alt: true, shift: true, scope: "canvas", action: "typeAssumption", display: "Alt+Shift+4", section: "Card type", label: "Type: Assumption" },
  { code: ["Digit5", "Numpad5"], alt: true, shift: true, scope: "canvas", action: "typeRisk", display: "Alt+Shift+5", section: "Card type", label: "Type: Risk" },
  { code: ["Digit6", "Numpad6"], alt: true, shift: true, scope: "canvas", action: "typeEvidence", display: "Alt+Shift+6", section: "Card type", label: "Type: Evidence" },

  // Status
  { code: ["Digit6", "Numpad6"], alt: true, scope: "global", action: "statusTodo", display: "Alt+6", section: "Status", label: "Mark as todo" },
  { code: ["Digit7", "Numpad7"], alt: true, scope: "global", action: "statusDone", display: "Alt+7", section: "Status", label: "Mark as done" },
  { code: ["Digit8", "Numpad8"], alt: true, scope: "global", action: "statusQuestion", display: "Alt+8", section: "Status", label: "Mark as question" },
  { code: ["Digit9", "Numpad9"], alt: true, scope: "global", action: "statusImportant", display: "Alt+9", section: "Status", label: "Mark as important" },
  { code: ["Digit0", "Numpad0"], alt: true, shift: true, scope: "global", action: "clearStatus", display: "Alt+Shift+0", section: "Status", label: "Clear status" },

  // Sizing
  { code: ["Equal", "NumpadAdd"], alt: true, scope: "global", action: "scaleUp", display: "Alt+=", section: "Sizing", label: "Scale selected up 10%" },
  { code: ["Minus", "NumpadSubtract"], alt: true, scope: "global", action: "scaleDown", display: "Alt+-", section: "Sizing", label: "Scale selected down 10%" },
  { code: "KeyR", alt: true, shift: true, scope: "global", action: "resetSize", display: "Alt+Shift+R", section: "Sizing", label: "Reset selected to default size" },

  // Navigation (Cmd/Ctrl+Arrows) — register meta on Mac, ctrl elsewhere, not both.
  ...(typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? [
        { code: "ArrowUp", meta: true, scope: "canvas" as const, action: "navUp" as const, display: `${mod}+↑`, section: "Selection & navigation", label: "Move selection up" },
        { code: "ArrowDown", meta: true, scope: "canvas" as const, action: "navDown" as const, display: `${mod}+↓`, section: "Selection & navigation", label: "Move selection down" },
        { code: "ArrowLeft", meta: true, scope: "canvas" as const, action: "navLeft" as const, display: `${mod}+←`, section: "Selection & navigation", label: "Move selection left" },
        { code: "ArrowRight", meta: true, scope: "canvas" as const, action: "navRight" as const, display: `${mod}+→`, section: "Selection & navigation", label: "Move selection right" },
      ]
    : [
        { code: "ArrowUp", ctrl: true, scope: "canvas" as const, action: "navUp" as const, display: `${mod}+↑`, section: "Selection & navigation", label: "Move selection up" },
        { code: "ArrowDown", ctrl: true, scope: "canvas" as const, action: "navDown" as const, display: `${mod}+↓`, section: "Selection & navigation", label: "Move selection down" },
        { code: "ArrowLeft", ctrl: true, scope: "canvas" as const, action: "navLeft" as const, display: `${mod}+←`, section: "Selection & navigation", label: "Move selection left" },
        { code: "ArrowRight", ctrl: true, scope: "canvas" as const, action: "navRight" as const, display: `${mod}+→`, section: "Selection & navigation", label: "Move selection right" },
      ]
  ),

  // Nudge (bare arrows)
  { code: "ArrowUp", scope: "canvas", action: "nudgeUp", display: "↑", section: "Editing", label: "Nudge up 16px" },
  { code: "ArrowDown", scope: "canvas", action: "nudgeDown", display: "↓", section: "Editing", label: "Nudge down 16px" },
  { code: "ArrowLeft", scope: "canvas", action: "nudgeLeft", display: "←", section: "Editing", label: "Nudge left 16px" },
  { code: "ArrowRight", scope: "canvas", action: "nudgeRight", display: "→", section: "Editing", label: "Nudge right 16px" },
  { code: "ArrowUp", shift: true, scope: "canvas", action: "nudgeUp1", display: "Shift+↑", section: "Editing", label: "Nudge up 1px" },
  { code: "ArrowDown", shift: true, scope: "canvas", action: "nudgeDown1", display: "Shift+↓", section: "Editing", label: "Nudge down 1px" },
  { code: "ArrowLeft", shift: true, scope: "canvas", action: "nudgeLeft1", display: "Shift+←", section: "Editing", label: "Nudge left 1px" },
  { code: "ArrowRight", shift: true, scope: "canvas", action: "nudgeRight1", display: "Shift+→", section: "Editing", label: "Nudge right 1px" },
];

/** Display-only entries for the shortcuts modal. These are handled locally in
 *  the popup editor textarea and are NOT matched by matchBinding. */
export const displayOnlyShortcuts: { display: string; section: string; label: string }[] = [
  { display: "Tab", section: "Markdown editing", label: "Indent list / insert spaces" },
  { display: "Shift+Tab", section: "Markdown editing", label: "Outdent list" },
  { display: "Enter", section: "Markdown editing", label: "List continuation / end list" },
  { display: `${mod}+B`, section: "Markdown editing", label: "Bold" },
  { display: `${mod}+I`, section: "Markdown editing", label: "Italic" },
  { display: `${mod}+Shift+X`, section: "Markdown editing", label: "Strikethrough" },
  { display: `${mod}+E`, section: "Markdown editing", label: "Inline code" },
  { display: `${mod}+K`, section: "Markdown editing", label: "Link" },
  { display: `${mod}+1`, section: "Markdown editing", label: "Heading level 1" },
  { display: `${mod}+2`, section: "Markdown editing", label: "Heading level 2" },
  { display: `${mod}+3`, section: "Markdown editing", label: "Heading level 3" },
  { display: `${mod}+4`, section: "Markdown editing", label: "Heading level 4" },
  { display: `${mod}+5`, section: "Markdown editing", label: "Heading level 5" },
  { display: `${mod}+6`, section: "Markdown editing", label: "Heading level 6" },
  { display: `${mod}+Shift+7`, section: "Markdown editing", label: "Ordered list" },
  { display: `${mod}+Shift+8`, section: "Markdown editing", label: "Bullet list" },
  { display: `${mod}+Shift+9`, section: "Markdown editing", label: "Blockquote" },
  { display: `${mod}+Shift+Enter`, section: "Markdown editing", label: "Task item" },
  { display: `${mod}+Enter`, section: "Markdown editing", label: "Toggle checkbox" },
  { display: "Alt+Enter", section: "Markdown editing", label: "Expand / collapse editor" },
];

/** Dev-only: assert no two bindings share the same code+modifier combination. */
export function assertNoDuplicates(): void {
  if (import.meta.env.PROD) return;
  const seen = new Map<string, Binding>();
  for (const b of bindings) {
    const codes = Array.isArray(b.code) ? b.code : [b.code];
    for (const code of codes) {
      const key = `${code}|alt:${!!b.alt}|shift:${!!b.shift}|meta:${!!b.meta}|ctrl:${!!b.ctrl}`;
      const prev = seen.get(key);
      if (prev) {
        console.error(`[keyboard] Duplicate binding: ${key} → "${prev.action}" and "${b.action}"`);
      }
      seen.set(key, b);
    }
  }
}

/** Dev-only: assert every action in the union has at least one binding. */
export function assertAllActionsBound(): void {
  if (import.meta.env.PROD) return;
  const allActions: Action[] = [
    "newCard", "burstEntry", "editTitle", "deleteCards",
    "undo", "redo", "toggleMarkdown", "escape", "arrange", "alignLeft", "alignRight",
    "alignTop", "alignBottom", "distributeH", "distributeV",
    "colourNormal", "colourHighlighted", "colourMuted", "colourRed", "colourBlack",
    "statusTodo", "statusDone", "statusQuestion", "statusImportant", "clearStatus",
    "scaleUp", "scaleDown", "resetSize",
    "nudgeUp", "nudgeDown", "nudgeLeft", "nudgeRight",
    "nudgeUp1", "nudgeDown1", "nudgeLeft1", "nudgeRight1",
    "navUp", "navDown", "navLeft", "navRight",
    "tabNext", "tabPrev", "connectMode", "selectNextConnection",
    "openPopupEditor", "toggleSidebar", "fitView", "tidy", "toggleSnap", "exportPdf",
    "toggleFocus", "focusDepthIncrease", "focusDepthDecrease", "openCommandPalette",
    "typeNote", "typeDecision", "typeOption", "typeAssumption", "typeRisk", "typeEvidence",
  ];
  const bound = new Set(bindings.map((b) => b.action));
  for (const action of allActions) {
    if (!bound.has(action)) {
      console.error(`[keyboard] Action "${action}" has no binding`);
    }
  }
}

/** Dev-only: assert every binding's action has a case in the runAction switch. */
export function assertAllBindingsHandled(handledActions: Set<string>): void {
  if (import.meta.env.PROD) return;
  for (const b of bindings) {
    if (!handledActions.has(b.action)) {
      console.error(`[keyboard] Binding action "${b.action}" has no case in runAction switch`);
    }
  }
}

/** Match a keydown event against the dispatch table. Returns the first exact match or null. */
export function matchBinding(event: KeyboardEvent): Binding | null {
  const isAltGraph = event.getModifierState("AltGraph");
  const altPressed = event.altKey || isAltGraph;
  for (const b of bindings) {
    const codes = Array.isArray(b.code) ? b.code : [b.code];
    if (!codes.includes(event.code)) continue;
    // AltGr (right Alt on Windows/Linux) reports altKey:true AND ctrlKey:true.
    // Alt bindings must tolerate that side-effect on ctrlKey.
    if (b.alt) {
      if (!altPressed) continue;
      if (b.ctrl !== undefined && !!b.ctrl !== event.ctrlKey) continue;
    } else {
      if (altPressed) continue;
      if (!!b.ctrl !== event.ctrlKey) continue;
    }
    if (!!b.shift !== event.shiftKey) continue;
    if (!!b.meta !== event.metaKey) continue;
    return b;
  }
  return null;
}

/** Group bindings by section for the shortcuts modal, deduplicating by action
 *  (and by label for display-only entries). When an action has multiple
 *  bindings, their displays are joined with " / " on a single row. */
export function getShortcutSections(): { title: string; entries: { key: string; label: string }[] }[] {
  const sectionMap = new Map<string, { key: string; label: string }[]>();
  const actionDisplays = new Map<string, string[]>();
  const seenDisplayOnly = new Set<string>();

  for (const b of bindings) {
    const arr = actionDisplays.get(b.action) ?? [];
    if (!arr.includes(b.display)) arr.push(b.display);
    actionDisplays.set(b.action, arr);
  }

  for (const b of bindings) {
    const arr = actionDisplays.get(b.action);
    if (!arr) continue;
    const key = arr.join(" / ");
    const dedupeKey = b.action + "|" + b.label;
    if (seenDisplayOnly.has(dedupeKey)) continue;
    seenDisplayOnly.add(dedupeKey);
    actionDisplays.set(b.action, [] as string[]);
    const list = sectionMap.get(b.section) ?? [];
    list.push({ key, label: b.label });
    sectionMap.set(b.section, list);
  }
  for (const d of displayOnlyShortcuts) {
    const dedupeKey = d.display + "|" + d.label;
    if (seenDisplayOnly.has(dedupeKey)) continue;
    seenDisplayOnly.add(dedupeKey);
    const list = sectionMap.get(d.section) ?? [];
    list.push({ key: d.display, label: d.label });
    sectionMap.set(d.section, list);
  }
  const order = ["Creating", "Editing", "Selection & navigation", "Connections", "Layout", "Focus mode", "Styles", "Card type", "Status", "Sizing", "Markdown editing"];
  return order
    .filter((title) => sectionMap.has(title))
    .map((title) => ({ title, entries: sectionMap.get(title)! }));
}
