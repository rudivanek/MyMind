export type EditState = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type EditResult = EditState;

type LineRange = { start: number; end: number };

function lineRangeAt(value: string, pos: number): LineRange {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  let end = value.indexOf("\n", pos);
  if (end === -1) end = value.length;
  return { start, end };
}

function lineAt(value: string, pos: number): string {
  const { start, end } = lineRangeAt(value, pos);
  return value.slice(start, end);
}

type ListPrefix = {
  indent: string;
  marker: "bullet" | "ordered" | "task" | "blockquote";
  prefix: string;
  number?: number;
};

const BULLET_RE = /^(\s*)([-*+])\s+/;
const ORDERED_RE = /^(\s*)(\d+)\.\s+/;
const TASK_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
const BLOCKQUOTE_RE = /^(\s*)(>)\s+/;

function detectPrefix(line: string): ListPrefix | null {
  let m = line.match(TASK_RE);
  if (m) return { indent: m[1], marker: "task", prefix: `${m[2]} [${m[3]}] ` };
  m = line.match(ORDERED_RE);
  if (m) return { indent: m[1], marker: "ordered", prefix: `${m[2]}. `, number: parseInt(m[2], 10) };
  m = line.match(BULLET_RE);
  if (m) return { indent: m[1], marker: "bullet", prefix: `${m[2]} ` };
  m = line.match(BLOCKQUOTE_RE);
  if (m) return { indent: m[1], marker: "blockquote", prefix: `${m[2]} ` };
  return null;
}

function isInCodeBlock(value: string, pos: number): boolean {
  const text = value.slice(0, pos);
  const fenceCount = (text.match(/^(`{3,}|~{3,})/gm) ?? []).length;
  if (fenceCount % 2 === 1) return true;
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^    \S/.test(lines[i])) return true;
    if (lines[i].trim() !== "" && !/^    /.test(lines[i])) break;
  }
  return false;
}

function isListLine(line: string): boolean {
  return detectPrefix(line) !== null;
}

function renumberOrdered(lines: string[], startIdx: number): string[] {
  const line = lines[startIdx];
  const m = line.match(/^(\s*)(\d+)\.\s+/);
  if (!m) return lines;
  const indent = m[1];
  let num = parseInt(m[2], 10);
  const result = [...lines];
  for (let i = startIdx + 1; i < result.length; i++) {
    const om = result[i].match(new RegExp(`^${indent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)\\.\\s+`));
    if (!om) break;
    num += 1;
    result[i] = result[i].replace(/^(\s*)(\d+)\.\s+/, `${indent}${num}. `);
  }
  return result;
}

// ─── LIST CONTINUATION (Enter) ───

export function handleEnter(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  if (selectionStart !== selectionEnd) {
    const deleted = value.slice(0, selectionStart) + value.slice(selectionEnd);
    return handleEnter({ value: deleted, selectionStart, selectionEnd: selectionStart });
  }
  const pos = selectionStart;
  if (isInCodeBlock(value, pos)) {
    const line = lineAt(value, pos);
    const indent = (line.match(/^\s*/) ?? [""])[0];
    const insert = "\n" + indent;
    return {
      value: value.slice(0, pos) + insert + value.slice(pos),
      selectionStart: pos + insert.length,
      selectionEnd: pos + insert.length,
    };
  }
  const { start, end } = lineRangeAt(value, pos);
  const line = value.slice(start, end);
  const prefix = detectPrefix(line);
  if (!prefix) {
    return {
      value: value.slice(0, pos) + "\n" + value.slice(pos),
      selectionStart: pos + 1,
      selectionEnd: pos + 1,
    };
  }
  const contentAfterPrefix = line.slice(prefix.indent.length + prefix.prefix.length);
  if (contentAfterPrefix.trim() === "") {
    if (prefix.indent.length >= 2) {
      const newLine = line.slice(prefix.indent.length);
      const newValue = value.slice(0, start) + newLine + value.slice(end);
      const newPos = start + newLine.length;
      return { value: newValue, selectionStart: newPos, selectionEnd: newPos };
    }
    const newValue = value.slice(0, start) + value.slice(end);
    const newPos = start;
    if (start > 0 && value[start - 1] !== "\n" && start < value.length) {
      return {
        value: value.slice(0, start) + "\n" + value.slice(end + (end < value.length ? 1 : 0)),
        selectionStart: start + 1,
        selectionEnd: start + 1,
      };
    }
    return { value: newValue, selectionStart: newPos, selectionEnd: newPos };
  }
  let newPrefix: string;
  if (prefix.marker === "ordered") {
    newPrefix = `${prefix.indent}${(prefix.number ?? 1) + 1}. `;
  } else if (prefix.marker === "task") {
    newPrefix = `${prefix.indent}- [ ] `;
  } else {
    newPrefix = `${prefix.indent}${prefix.prefix}`;
  }
  const insert = "\n" + newPrefix;
  return {
    value: value.slice(0, pos) + insert + value.slice(pos),
    selectionStart: pos + insert.length,
    selectionEnd: pos + insert.length,
  };
}

// ─── INDENT / OUTDENT (Tab / Shift+Tab) ───

export function handleTab(state: EditState, shift: boolean): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const hasSelection = selectionStart !== selectionEnd;
  const pos = shift ? selectionStart : selectionEnd;

  if (isInCodeBlock(value, pos)) {
    if (hasSelection) return insertTabForSelection(state, shift);
    if (shift) return outdentSpaces(state);
    return insertTwoSpaces(state);
  }

  if (hasSelection) {
    const firstLineStart = value.lastIndexOf("\n", Math.min(selectionStart, selectionEnd) - 1) + 1;
    let selEnd = Math.max(selectionStart, selectionEnd);
    const lines = value.slice(firstLineStart, selEnd).split("\n");
    const anyList = lines.some((l) => isListLine(l));
    if (!anyList) return insertTabForSelection(state, shift);
    const newLines = lines.map((l) => shift ? outdentLine(l) : indentLine(l));
    const newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(selEnd);
    const newSelEnd = firstLineStart + newLines.join("\n").length;
    return { value: newValue, selectionStart: firstLineStart, selectionEnd: newSelEnd };
  }

  const { start, end } = lineRangeAt(value, pos);
  const line = value.slice(start, end);
  if (isListLine(line)) {
    const newLine = shift ? outdentLine(line) : indentLine(line);
    let newValue = value.slice(0, start) + newLine + value.slice(end);
    if (!shift) {
      const lineIdx = value.slice(0, start).split("\n").length - 1;
      const allLines = newValue.split("\n");
      const renumbered = renumberOrdered(allLines, lineIdx);
      if (renumbered.join("\n") !== allLines.join("\n")) newValue = renumbered.join("\n");
    }
    const newPos = start + newLine.length;
    return { value: newValue, selectionStart: newPos, selectionEnd: newPos };
  }

  if (shift) return outdentSpaces(state);
  return insertTwoSpaces(state);
}

function indentLine(line: string): string {
  return "  " + line;
}

function outdentLine(line: string): string {
  if (line.startsWith("  ")) return line.slice(2);
  if (line.startsWith(" ")) return line.slice(1);
  return line;
}

function insertTwoSpaces(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const insert = "  ";
  return {
    value: value.slice(0, selectionStart) + insert + value.slice(selectionEnd),
    selectionStart: selectionStart + insert.length,
    selectionEnd: selectionStart + insert.length,
  };
}

function outdentSpaces(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const line = value.slice(lineStart, selectionStart);
  if (line.endsWith("  ")) {
    const newPos = selectionStart - 2;
    return {
      value: value.slice(0, lineStart) + line.slice(0, -2) + value.slice(selectionStart),
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }
  if (line.endsWith(" ")) {
    const newPos = selectionStart - 1;
    return {
      value: value.slice(0, lineStart) + line.slice(0, -1) + value.slice(selectionStart),
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  }
  return state;
}

function insertTabForSelection(state: EditState, shift: boolean): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const firstLineStart = value.lastIndexOf("\n", Math.min(selectionStart, selectionEnd) - 1) + 1;
  let selEnd = Math.max(selectionStart, selectionEnd);
  const lines = value.slice(firstLineStart, selEnd).split("\n");
  const newLines = lines.map((l) => shift ? outdentLine(l) : indentLine(l));
  const newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(selEnd);
  const newSelEnd = firstLineStart + newLines.join("\n").length;
  return { value: newValue, selectionStart: firstLineStart, selectionEnd: newSelEnd };
}

// ─── INLINE FORMATTING (wrap/unwrap toggle) ───

function trimSelectionEdges(sel: string): { leadingWs: string; core: string; trailingWs: string } {
  const leadingMatch = sel.match(/^\s*/);
  const trailingMatch = sel.match(/\s*$/);
  const leadingWs = leadingMatch ? leadingMatch[0] : "";
  const trailingWs = trailingMatch ? trailingMatch[0] : "";
  const core = sel.slice(leadingWs.length, sel.length - trailingWs.length);
  return { leadingWs, core, trailingWs };
}

function hasMultilineSelection(state: EditState): boolean {
  const { value, selectionStart, selectionEnd } = state;
  if (selectionStart === selectionEnd) return false;
  const sel = value.slice(selectionStart, selectionEnd);
  const { core } = trimSelectionEdges(sel);
  return core.includes("\n");
}

function wrapInline(state: EditState, marker: string): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const hasSelection = selectionStart !== selectionEnd;
  if (hasSelection) {
    const sel = value.slice(selectionStart, selectionEnd);
    const { leadingWs, core, trailingWs } = trimSelectionEdges(sel);
    if (core.length === 0) return state;

    const coreStart = selectionStart + leadingWs.length;
    const coreEnd = coreStart + core.length;
    const before = value.slice(0, coreStart);
    const after = value.slice(coreEnd);

    if (core.startsWith(marker) && core.endsWith(marker) && core.length >= marker.length * 2) {
      const unwrapped = core.slice(marker.length, core.length - marker.length);
      return {
        value: before + unwrapped + after,
        selectionStart: coreStart,
        selectionEnd: coreStart + unwrapped.length,
      };
    }
    return {
      value: before + marker + core + marker + after,
      selectionStart: coreStart + marker.length,
      selectionEnd: coreStart + marker.length + core.length,
    };
  }
  return {
    value: value.slice(0, selectionStart) + marker + marker + value.slice(selectionStart),
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionStart + marker.length,
  };
}

export function toggleBold(state: EditState): EditResult {
  if (hasMultilineSelection(state)) return state;
  return wrapInline(state, "**");
}
export function toggleItalic(state: EditState): EditResult {
  if (hasMultilineSelection(state)) return state;
  return wrapInline(state, "*");
}
export function toggleStrikethrough(state: EditState): EditResult {
  if (hasMultilineSelection(state)) return state;
  return wrapInline(state, "~~");
}
export function toggleCode(state: EditState): EditResult {
  if (hasMultilineSelection(state)) return state;
  return wrapInline(state, "`");
}

export function toggleLink(state: EditState): EditResult {
  if (hasMultilineSelection(state)) return state;
  const { value, selectionStart, selectionEnd } = state;
  const hasSelection = selectionStart !== selectionEnd;
  const sel = hasSelection ? value.slice(selectionStart, selectionEnd) : "";
  const { leadingWs, core, trailingWs } = trimSelectionEdges(sel);
  if (hasSelection && core.length === 0) return state;
  const coreStart = selectionStart + leadingWs.length;
  const url = "";
  const insert = `${leadingWs}[${core}](${url})${trailingWs}`;
  const newValue = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  const cursorPos = coreStart + core.length + 3; // after "]("
  return { value: newValue, selectionStart: cursorPos, selectionEnd: cursorPos };
}

// ─── BLOCK FORMATTING ───

function getSelectedLines(value: string, selStart: number, selEnd: number): { firstLineStart: number; lastLineEnd: number; lines: string[]; lineIndices: number[] } {
  const firstLineStart = value.lastIndexOf("\n", Math.min(selStart, selEnd) - 1) + 1;
  let lastLineEnd = value.indexOf("\n", Math.max(selStart, selEnd));
  if (lastLineEnd === -1) lastLineEnd = value.length;
  const block = value.slice(firstLineStart, lastLineEnd);
  const lines = block.split("\n");
  const lineIndices: number[] = [];
  let acc = firstLineStart;
  for (const l of lines) {
    lineIndices.push(acc);
    acc += l.length + 1;
  }
  return { firstLineStart, lastLineEnd, lines, lineIndices };
}

function setHeadingLevel(line: string, level: number): string {
  const stripped = line.replace(/^#{1,6}\s+/, "");
  if (level === 0) return stripped;
  return `${"#".repeat(level)} ${stripped}`;
}

export function toggleHeading(state: EditState, level: number): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const { firstLineStart, lastLineEnd, lines } = getSelectedLines(value, selectionStart, selectionEnd);
  const currentLevel = lines[0].match(/^#{1,6}/)?.[0].length ?? 0;
  const newLevel = currentLevel === level ? 0 : level;
  const newLines = lines.map((l) => setHeadingLevel(l, newLevel));
  const newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(lastLineEnd);
  return { value: newValue, selectionStart: firstLineStart, selectionEnd: firstLineStart + newLines.join("\n").length };
}

function toggleListPrefix(line: string, ordered: boolean): string {
  const existing = detectPrefix(line);
  if (existing && (existing.marker === "bullet" || existing.marker === "ordered" || existing.marker === "task")) {
    return line.slice(existing.indent.length + existing.prefix.length);
  }
  const indent = (line.match(/^\s*/) ?? [""])[0];
  return ordered ? `${indent}1. ${line.trimStart()}` : `${indent}- ${line.trimStart()}`;
}

export function toggleOrderedList(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const { firstLineStart, lastLineEnd, lines } = getSelectedLines(value, selectionStart, selectionEnd);
  const allOrdered = lines.every((l) => /^\s*\d+\.\s+/.test(l));
  const newLines = lines.map((l) => toggleListPrefix(l, !allOrdered));
  let newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(lastLineEnd);
  if (!allOrdered) {
    const allLines = newValue.split("\n");
    const startLineIdx = newValue.slice(0, firstLineStart).split("\n").length - 1;
    const renumbered = renumberOrdered(allLines, startLineIdx);
    newValue = renumbered.join("\n");
  }
  return { value: newValue, selectionStart: firstLineStart, selectionEnd: firstLineStart + newLines.join("\n").length };
}

export function toggleBulletList(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const { firstLineStart, lastLineEnd, lines } = getSelectedLines(value, selectionStart, selectionEnd);
  const allBullet = lines.every((l) => /^\s*[-*+]\s+/.test(l));
  const newLines = lines.map((l) => toggleListPrefix(l, false));
  const newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(lastLineEnd);
  return { value: newValue, selectionStart: firstLineStart, selectionEnd: firstLineStart + newLines.join("\n").length };
}

export function toggleBlockquote(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const { firstLineStart, lastLineEnd, lines } = getSelectedLines(value, selectionStart, selectionEnd);
  const allQuote = lines.every((l) => /^\s*>\s+/.test(l));
  const newLines = lines.map((l) => {
    if (allQuote) return l.replace(/^(\s*)>\s+/, "$1");
    const indent = (l.match(/^\s*/) ?? [""])[0];
    return `${indent}> ${l.trimStart()}`;
  });
  const newValue = value.slice(0, firstLineStart) + newLines.join("\n") + value.slice(lastLineEnd);
  return { value: newValue, selectionStart: firstLineStart, selectionEnd: firstLineStart + newLines.join("\n").length };
}

export function toggleTaskItem(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const pos = selectionEnd;
  const { start, end } = lineRangeAt(value, pos);
  const line = value.slice(start, end);
  const taskMatch = line.match(/^(\s*[-*+])\s+\[([ xX])\]\s+/);
  if (taskMatch) {
    const newLine = line.slice(taskMatch[0].length);
    return {
      value: value.slice(0, start) + newLine + value.slice(end),
      selectionStart: start + newLine.length,
      selectionEnd: start + newLine.length,
    };
  }
  const bulletMatch = line.match(/^(\s*[-*+])\s+/);
  if (bulletMatch) {
    const newLine = `${bulletMatch[1]} [ ] ` + line.slice(bulletMatch[0].length);
    return {
      value: value.slice(0, start) + newLine + value.slice(end),
      selectionStart: start + newLine.length,
      selectionEnd: start + newLine.length,
    };
  }
  const indent = (line.match(/^\s*/) ?? [""])[0];
  const newLine = `${indent}- [ ] ${line.trimStart()}`;
  return {
    value: value.slice(0, start) + newLine + value.slice(end),
    selectionStart: start + newLine.length,
    selectionEnd: start + newLine.length,
  };
}

export function toggleTaskCheckbox(state: EditState): EditResult {
  const { value, selectionStart, selectionEnd } = state;
  const pos = selectionEnd;
  const { start, end } = lineRangeAt(value, pos);
  const line = value.slice(start, end);
  const taskMatch = line.match(/^(\s*[-*+])\s+\[([ xX])\]\s+/);
  if (!taskMatch) return state;
  const current = taskMatch[2];
  const newState2 = current === " " ? "x" : " ";
  const newLine = `${taskMatch[1]} [${newState2}] ` + line.slice(taskMatch[0].length);
  return {
    value: value.slice(0, start) + newLine + value.slice(end),
    selectionStart: start + newLine.length,
    selectionEnd: start + newLine.length,
  };
}

// ─── Task checkbox toggle for rendered card (operates on full body) ───

export function toggleCheckboxInBody(body: string, itemIndex: number): string {
  const lines = body.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*[-*+])\s+\[([ xX])\]\s+/);
    if (!m) continue;
    if (count === itemIndex) {
      const newState2 = m[2] === " " ? "x" : " ";
      lines[i] = `${m[1]} [${newState2}] ` + lines[i].slice(m[0].length);
      return lines.join("\n");
    }
    count++;
  }
  return body;
}

// ─── ACTIVE STATE DETECTION (for toolbar buttons) ───

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isInlineActive(value: string, selectionStart: number, selectionEnd: number, marker: string): boolean {
  if (selectionStart !== selectionEnd) {
    const sel = value.slice(selectionStart, selectionEnd);
    const { core } = trimSelectionEdges(sel);
    if (core.length === 0) return false;
    return core.startsWith(marker) && core.endsWith(marker) && core.length >= marker.length * 2;
  }
  const esc = escapeRegex(marker);
  const beforeCount = (value.slice(0, selectionStart).match(new RegExp(esc, "g")) ?? []).length;
  const afterCount = (value.slice(selectionStart).match(new RegExp(esc, "g")) ?? []).length;
  return beforeCount % 2 === 1 && afterCount % 2 === 1;
}

export function isHeadingActive(value: string, pos: number, level: number): boolean {
  const line = lineAt(value, pos);
  const m = line.match(/^(#{1,6})\s+/);
  return m !== null && m[1].length === level;
}

export function isBulletListActive(value: string, pos: number): boolean {
  const line = lineAt(value, pos);
  return /^\s*[-*+]\s+/.test(line) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line);
}

export function isOrderedListActive(value: string, pos: number): boolean {
  const line = lineAt(value, pos);
  return /^\s*\d+\.\s+/.test(line);
}

export function isTaskItemActive(value: string, pos: number): boolean {
  const line = lineAt(value, pos);
  return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line);
}

export function isBlockquoteActive(value: string, pos: number): boolean {
  const line = lineAt(value, pos);
  return /^\s*>\s+/.test(line);
}

export function isLinkActive(value: string, selectionStart: number, selectionEnd: number): boolean {
  if (selectionStart !== selectionEnd) {
    const sel = value.slice(selectionStart, selectionEnd);
    const { core } = trimSelectionEdges(sel);
    if (core.length === 0) return false;
    return /^\[.*\]\(.*\)$/.test(core);
  }
  const pos = selectionStart;
  const before = value.slice(0, pos);
  const lastOpen = before.lastIndexOf("[");
  if (lastOpen === -1) return false;
  const segment = value.slice(lastOpen);
  const closeMatch = segment.match(/\]\(/);
  if (!closeMatch) return true;
  const urlStart = lastOpen + (closeMatch.index ?? 0) + 2;
  if (pos < urlStart) return true;
  const afterUrl = value.slice(urlStart);
  const closeParen = afterUrl.indexOf(")");
  if (closeParen === -1) return true;
  return pos < urlStart + closeParen;
}
