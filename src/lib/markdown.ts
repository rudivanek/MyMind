import type { Item } from "@/types";
import { maskCodeBlocks, restoreCodeBlocks } from "@/lib/codeMask";

export type MarkdownSection = {
  title: string;
  id: string | null;
  tags: string[];
  dueDate: string | null;
  description: string;
};

export type ParsedMarkdown = {
  sections: MarkdownSection[];
  malformedCount: number;
};

export function promoteFirstH1(description: string, currentTitle: string): { title: string | null; description: string } {
  if (currentTitle.trim() && currentTitle.trim() !== "Untitled") {
    return { title: null, description };
  }

  const lines = description.replace(/\r\n/g, "\n").split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstNonEmptyIndex === -1) return { title: null, description };

  const heading = lines[firstNonEmptyIndex].match(/^#[ \t]+(.+?)\s*$/);
  if (!heading?.[1]) return { title: null, description };

  return { title: heading[1].trim(), description };
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_COMMENT_LINE = /^<!--[ \t]*id:[ \t]*[^\s]+[ \t]*-->$/i;

/** Strip any stray id comments out of free text. Repairs already-corrupted descriptions. */
export function stripIdComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !ID_COMMENT_LINE.test(line.trim()))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

export function serializeItems(items: Item[]): string {
  return items
    .map((item) => {
      // Heading + metadata are SINGLE-newline separated so the parser can read them
      // as a contiguous block. Only the description is set off by a blank line.
      const head = [
        `## ${item.title}`,
        `<!-- id: ${item.id} -->`,
        item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : null,
        item.dueDate ? `Due: ${item.dueDate}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const body = item.description ?? "";
      return body.trim() ? `${head}\n\n${body}` : head;
    })
    .join("\n\n---\n\n");
}

/** Display-only serializer: same as serializeItems but with id comment lines removed. */
export function serializeItemsForDisplay(items: Item[]): string {
  return items
    .map((item) => {
      const head = [
        `## ${item.title}`,
        item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : null,
        item.dueDate ? `Due: ${item.dueDate}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const body = item.description ?? "";
      return body.trim() ? `${head}\n\n${body}` : head;
    })
    .join("\n\n---\n\n");
}

function parseSection(lines: string[]): MarkdownSection | null {
  const heading = lines[0]?.match(/^##[ \t]+(.+?)\s*$/);
  if (!heading || !heading[1]) return null;

  let index = 1;
  let id: string | null = null;
  let tags: string[] = [];
  let dueDate: string | null = null;

  // Tolerate blank lines between the heading and the metadata block.
  const skipBlanks = () => {
    while (index < lines.length && lines[index].trim() === "") index += 1;
  };

  skipBlanks();
  const idLine = lines[index]?.trim().match(/^<!--[ \t]*id:[ \t]*([^\s]+)[ \t]*-->$/i);
  if (idLine) {
    // An unrecognised id is ignored rather than failing the whole section —
    // a malformed section must never cause a card to be treated as deleted.
    if (ID_PATTERN.test(idLine[1])) id = idLine[1];
    index += 1;
  }

  skipBlanks();
  if (lines[index]?.match(/^Tags:/i)) {
    tags = lines[index]
      .replace(/^Tags:[ \t]*/i, "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    index += 1;
  }

  skipBlanks();
  if (lines[index]?.match(/^Due:/i)) {
    const value = lines[index].replace(/^Due:[ \t]*/i, "").trim();
    if (value && !DATE_PATTERN.test(value)) return null;
    dueDate = value || null;
    index += 1;
  }

  return {
    title: heading[1].trim(),
    id,
    tags,
    dueDate,
    description: lines.slice(index).join("\n"),
  };
}

export function parseMarkdown(markdown: string): ParsedMarkdown {
  const { masked, placeholders } = maskCodeBlocks(markdown.replace(/\r\n/g, "\n"));
  const lines = masked.split("\n").filter((line) => line.trim() !== "---");
  const starts = lines.reduce<number[]>((result, line, index) => {
    if (/^##[ \t]+/.test(line)) result.push(index);
    return result;
  }, []);
  const sections: MarkdownSection[] = [];
  let malformedCount = 0;
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const section = parseSection(lines.slice(start, end));
    if (section) {
      section.description = restoreCodeBlocks(section.description, placeholders);
      sections.push(section);
    } else {
      malformedCount += 1;
    }
  });
  return { sections, malformedCount };
}