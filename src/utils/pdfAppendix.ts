import { jsPDF } from "jspdf";
import type { Item, Connection } from "@/types";
import { maskCodeBlocks } from "@/lib/codeMask";

export type ReadingOrderEntry = { item: Item; number: number };

type Cursor = { y: number };

// ─── Reading order ───

export function computeReadingOrder(items: Item[], connections: Connection[]): ReadingOrderEntry[] {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const conn of connections) {
    if (!incoming.has(conn.targetId)) incoming.set(conn.targetId, []);
    incoming.get(conn.targetId)!.push(conn.sourceId);
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    outgoing.get(conn.sourceId)!.push(conn.targetId);
  }

  const roots = items.filter((i) => !incoming.has(i.id) || incoming.get(i.id)!.length === 0);
  roots.sort((a, b) => a.posY - b.posY || a.posX - b.posX);

  const visited = new Set<string>();
  const result: Item[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const item = itemMap.get(id);
    if (item) result.push(item);
    const children = (outgoing.get(id) ?? [])
      .map((cid) => itemMap.get(cid))
      .filter((i): i is Item => i !== undefined)
      .sort((a, b) => a.posY - b.posY || a.posX - b.posX);
    for (const child of children) visit(child.id);
  };

  for (const root of roots) visit(root.id);

  const unreachable = items
    .filter((i) => !visited.has(i.id))
    .sort((a, b) => a.posY - b.posY || a.posX - b.posX);
  for (const item of unreachable) result.push(item);

  return result.map((item, idx) => ({ item, number: idx + 1 }));
}

// ─── Inline parsing ───

type InlineSegment =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "italic"; content: string }
  | { type: "bolditalic"; content: string }
  | { type: "code"; content: string }
  | { type: "link"; text: string; url: string };

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastEnd) {
      segments.push({ type: "text", content: text.slice(lastEnd, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: "bolditalic", content: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ type: "bold", content: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ type: "italic", content: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ type: "code", content: match[4] });
    } else if (match[5] !== undefined) {
      segments.push({ type: "link", text: match[5], url: match[6] });
    }
    lastEnd = re.lastIndex;
  }
  if (lastEnd < text.length) {
    segments.push({ type: "text", content: text.slice(lastEnd) });
  }
  return segments;
}

// ─── Rendering helpers ───

function ensureSpace(pdf: jsPDF, cursor: Cursor, needed: number, bottomLimit: number, margin: number): void {
  if (cursor.y + needed > bottomLimit) {
    pdf.addPage();
    cursor.y = margin;
  }
}

function setFontForSegment(pdf: jsPDF, segment: InlineSegment, baseBold: boolean): void {
  if (segment.type === "code") {
    pdf.setFont("courier", "normal");
  } else if (segment.type === "link") {
    pdf.setFont("helvetica", baseBold ? "bold" : "normal");
  } else if (segment.type === "bold") {
    pdf.setFont("helvetica", "bold");
  } else if (segment.type === "italic") {
    pdf.setFont("helvetica", baseBold ? "bolditalic" : "italic");
  } else if (segment.type === "bolditalic") {
    pdf.setFont("helvetica", "bolditalic");
  } else {
    pdf.setFont("helvetica", baseBold ? "bold" : "normal");
  }
}

function renderRichLine(
  pdf: jsPDF,
  text: string,
  x: number,
  cursor: Cursor,
  colW: number,
  fontSize: number,
  bottomLimit: number,
  margin: number,
  baseBold: boolean,
): void {
  const lineHeight = fontSize * 0.3528 * 1.4;
  const hasInline = /[*`]/.test(text) || /\[.+?\]\(/.test(text);

  if (!hasInline) {
    pdf.setFont("helvetica", baseBold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const wrapped = pdf.splitTextToSize(text, colW) as string[];
    for (const line of wrapped) {
      ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);
      pdf.text(line, x, cursor.y + lineHeight * 0.75);
      cursor.y += lineHeight;
    }
    return;
  }

  ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);
  const segments = parseInline(text);
  let currentX = x;

  for (const segment of segments) {
    if (segment.type === "link") {
      setFontForSegment(pdf, segment, baseBold);
      pdf.setFontSize(fontSize);
      for (const word of segment.text.split(/(\s+)/)) {
        if (!word) continue;
        const ww = pdf.getTextWidth(word);
        if (currentX + ww > x + colW && currentX > x) {
          cursor.y += lineHeight;
          ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);
          currentX = x;
        }
        pdf.text(word, currentX, cursor.y + lineHeight * 0.75);
        currentX += ww;
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize - 2);
      pdf.setTextColor(100, 116, 139);
      const urlText = ` (${segment.url})`;
      for (const word of urlText.split(/(\s+)/)) {
        if (!word) continue;
        const ww = pdf.getTextWidth(word);
        if (currentX + ww > x + colW && currentX > x) {
          cursor.y += lineHeight;
          ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);
          currentX = x;
        }
        pdf.text(word, currentX, cursor.y + lineHeight * 0.75);
        currentX += ww;
      }
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(fontSize);
    } else {
      setFontForSegment(pdf, segment, baseBold);
      pdf.setFontSize(fontSize);
      for (const word of segment.content.split(/(\s+)/)) {
        if (!word) continue;
        const ww = pdf.getTextWidth(word);
        if (currentX + ww > x + colW && currentX > x) {
          cursor.y += lineHeight;
          ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);
          currentX = x;
        }
        pdf.text(word, currentX, cursor.y + lineHeight * 0.75);
        currentX += ww;
      }
    }
  }

  cursor.y += lineHeight;
}

// ─── Code block rendering ───

function renderCodeBlock(
  pdf: jsPDF,
  block: string,
  x: number,
  cursor: Cursor,
  colW: number,
  bottomLimit: number,
  margin: number,
): void {
  const allLines = block.split("\n");
  let contentLines: string[];
  if (allLines.length > 0 && /^(`{3,}|~{3,})/.test(allLines[0].trim())) {
    contentLines = allLines.slice(1, allLines.length - 1);
  } else {
    contentLines = allLines;
  }

  const fontSize = 9;
  const lineHeight = fontSize * 0.3528 * 1.3;
  const padding = 2;
  const maxWidth = colW - padding * 2;

  for (const line of contentLines) {
    ensureSpace(pdf, cursor, lineHeight, bottomLimit, margin);

    pdf.setFillColor(245, 247, 250);
    pdf.rect(x, cursor.y, colW, lineHeight, "F");

    pdf.setFont("courier", "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(30, 41, 59);

    let displayLine = line;
    if (/^    /.test(displayLine)) displayLine = displayLine.slice(4);
    while (pdf.getTextWidth(displayLine) > maxWidth && displayLine.length > 0) {
      displayLine = displayLine.slice(0, -1);
    }
    pdf.text(displayLine, x + padding, cursor.y + lineHeight * 0.75);
    cursor.y += lineHeight;
  }

  pdf.setTextColor(30, 41, 59);
  cursor.y += 2;
}

// ─── Markdown body rendering ───

function renderMarkdownBody(
  pdf: jsPDF,
  text: string,
  x: number,
  cursor: Cursor,
  colW: number,
  bottomLimit: number,
  margin: number,
): void {
  const { masked, placeholders } = maskCodeBlocks(text);
  const lines = masked.split("\n");
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const paraText = paragraphBuffer.join(" ");
    renderRichLine(pdf, paraText, x, cursor, colW, 10, bottomLimit, margin, false);
    paragraphBuffer = [];
  };

  for (const line of lines) {
    const codeMatch = line.match(/^\u0000CODEBLOCK\u0000(\d+)\u0000$/);
    if (codeMatch) {
      flushParagraph();
      const block = placeholders[Number(codeMatch[1])] ?? "";
      renderCodeBlock(pdf, block, x, cursor, colW, bottomLimit, margin);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      cursor.y += 1.5;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const size = Math.max(14 - level, 10);
      renderRichLine(pdf, headingMatch[2], x, cursor, colW, size, bottomLimit, margin, true);
      continue;
    }

    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      flushParagraph();
      ensureSpace(pdf, cursor, 4, bottomLimit, margin);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      pdf.line(x, cursor.y, x + colW, cursor.y);
      cursor.y += 4;
      continue;
    }

    const taskMatch = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)/);
    if (taskMatch) {
      flushParagraph();
      const nestingLevel = Math.floor(taskMatch[1].length / 2);
      const checked = taskMatch[3] !== " ";
      const itemX = x + nestingLevel * 6;
      const glyph = checked ? "\u2611" : "\u2610";
      renderRichLine(pdf, `${glyph}  ${taskMatch[4]}`, itemX, cursor, colW - nestingLevel * 6, 10, bottomLimit, margin, false);
      continue;
    }

    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
    if (bulletMatch) {
      flushParagraph();
      const nestingLevel = Math.floor(bulletMatch[1].length / 2);
      const itemX = x + nestingLevel * 6;
      renderRichLine(pdf, `\u2022  ${bulletMatch[3]}`, itemX, cursor, colW - nestingLevel * 6, 10, bottomLimit, margin, false);
      continue;
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      flushParagraph();
      const nestingLevel = Math.floor(orderedMatch[1].length / 2);
      const itemX = x + nestingLevel * 6;
      renderRichLine(pdf, `${orderedMatch[2]}.  ${orderedMatch[3]}`, itemX, cursor, colW - nestingLevel * 6, 10, bottomLimit, margin, false);
      continue;
    }

    const quoteMatch = line.match(/^(\s*)>\s+(.*)/);
    if (quoteMatch) {
      flushParagraph();
      const quoteX = x + 4;
      const startY = cursor.y;
      renderRichLine(pdf, quoteMatch[2], quoteX, cursor, colW - 4, 10, bottomLimit, margin, false);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.line(x + 1, startY + 1, x + 1, cursor.y - 1);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
}

// ─── Main appendix renderer ───

export function renderAppendix(
  pdf: jsPDF,
  items: Item[],
  connections: Connection[],
  readingOrder: ReadingOrderEntry[],
): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const colX = margin;
  const colW = pageW - margin * 2;
  const bottomLimit = pageH - margin;

  const cursor: Cursor = { y: margin };
  const numberMap = new Map(readingOrder.map((r) => [r.item.id, r.number]));

  for (let i = 0; i < readingOrder.length; i++) {
    const { item, number } = readingOrder[i];

    if (cursor.y + 20 > bottomLimit) {
      pdf.addPage();
      cursor.y = margin;
    }

    const title = item.title || "Untitled";
    const cardType = item.cardType ?? "note";
    const typeLabel = cardType !== "note" ? `[${cardType.charAt(0).toUpperCase() + cardType.slice(1)}] ` : "";
    const headingSize = 14;
    const headingLineHeight = headingSize * 0.3528 * 1.4;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(headingSize);
    pdf.setTextColor(15, 23, 42);
    const headingText = `${number}. ${typeLabel}${title}`;
    const headingLines = pdf.splitTextToSize(headingText, colW) as string[];
    for (const line of headingLines) {
      ensureSpace(pdf, cursor, headingLineHeight, bottomLimit, margin);
      pdf.text(line, colX, cursor.y + headingLineHeight * 0.75);
      cursor.y += headingLineHeight;
    }

    if (item.description.trim()) {
      cursor.y += 1;
      pdf.setTextColor(30, 41, 59);
      renderMarkdownBody(pdf, item.description, colX, cursor, colW, bottomLimit, margin);
    }

    const cardConnections = connections.filter((c) => c.sourceId === item.id || c.targetId === item.id);
    if (cardConnections.length > 0) {
      cursor.y += 2;
      const connSize = 8;
      const connLineHeight = connSize * 0.3528 * 1.4;

      for (const conn of cardConnections) {
        const isOutgoing = conn.sourceId === item.id;
        const otherId = isOutgoing ? conn.targetId : conn.sourceId;
        const otherNumber = numberMap.get(otherId) ?? 0;
        const otherItem = items.find((it) => it.id === otherId);
        const otherTitle = otherItem?.title || "Untitled";
        const arrow = isOutgoing ? "\u2192" : "\u2190";
        let line = `${arrow} ${otherNumber}. ${otherTitle}`;
        if (conn.comment) line += ` \u2014 ${conn.comment}`;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(connSize);
        pdf.setTextColor(100, 116, 139);
        const connLines = pdf.splitTextToSize(line, colW) as string[];
        for (const cl of connLines) {
          ensureSpace(pdf, cursor, connLineHeight, bottomLimit, margin);
          pdf.text(cl, colX, cursor.y + connLineHeight * 0.75);
          cursor.y += connLineHeight;
        }
      }
      pdf.setTextColor(30, 41, 59);
    }

    cursor.y += 3;
    ensureSpace(pdf, cursor, 2, bottomLimit, margin);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(colX, cursor.y, colX + colW, cursor.y);
    cursor.y += 5;
  }

  const totalPages = pdf.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(String(p), pageW - margin, pageH - 4, { align: "right" });
  }
  pdf.setTextColor(0, 0, 0);
}
