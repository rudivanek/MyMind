export type ImportSection = {
  title: string;
  body: string;
};

export type ImportParseResult = {
  sections: ImportSection[];
  frontmatter: Record<string, string> | null;
  isMyMindExport: boolean;
  headingCounts: { 1: number; 2: number; 3: number; 4: number };
  defaultLevel: 1 | 2 | 3 | 4;
};

const HEADING_RE = /^(#{1,4})[ \t]+(.+?)\s*$/;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]+\]/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .trim();
}

function parseFrontmatter(text: string): { body: string; frontmatter: Record<string, string> | null } {
  if (!text.startsWith("---")) return { body: text, frontmatter: null };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { body: text, frontmatter: null };
  const fmText = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, "");
  const frontmatter: Record<string, string> = {};
  for (const line of fmText.split("\n")) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (match) frontmatter[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return { body, frontmatter };
}

export function parseMarkdownImport(text: string, filename: string, level: 1 | 2 | 3 | 4): ImportParseResult {
  const { body: afterFm, frontmatter } = parseFrontmatter(text);
  const isMyMindExport = frontmatter !== null && "mymind" in frontmatter;

  const lines = afterFm.replace(/\r\n/g, "\n").split("\n");

  const headingCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      const lvl = m[1].length as 1 | 2 | 3 | 4;
      headingCounts[lvl]++;
    }
  }

  let defaultLevel: 1 | 2 | 3 | 4 = 1;
  let maxCount = -1;
  for (const lvl of [1, 2, 3, 4] as const) {
    if (headingCounts[lvl] > maxCount) {
      maxCount = headingCounts[lvl];
      defaultLevel = lvl;
    }
  }

  const splitLevel = level;
  const sections: ImportSection[] = [];

  const headingIndices: { index: number; level: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      const lvl = m[1].length;
      if (lvl <= splitLevel) {
        headingIndices.push({ index: i, level: lvl, text: m[2] });
      }
    }
  }

  const baseName = filename.replace(/\.(md|markdown|txt)$/i, "").replace(/[/\\]/g, " ").trim() || "Imported";

  if (headingIndices.length === 0) {
    const trimmed = afterFm.trim();
    const title = frontmatter?.title ?? baseName;
    if (title || trimmed) {
      sections.push({ title, body: trimmed });
    }
    return { sections, frontmatter, isMyMindExport, headingCounts, defaultLevel };
  }

  if (headingIndices[0].index > 0) {
    const preLines = lines.slice(0, headingIndices[0].index);
    const preBody = preLines.join("\n").trim();
    if (preBody) {
      const title = frontmatter?.title ?? baseName;
      sections.push({ title, body: preBody });
    }
  }

  for (let i = 0; i < headingIndices.length; i++) {
    const start = headingIndices[i].index;
    const end = i + 1 < headingIndices.length ? headingIndices[i + 1].index : lines.length;
    const title = stripInlineMarkdown(headingIndices[i].text);
    const body = lines.slice(start + 1, end).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    if (title || body) {
      sections.push({ title, body });
    }
  }

  return { sections, frontmatter, isMyMindExport, headingCounts, defaultLevel };
}

export function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name);
}
