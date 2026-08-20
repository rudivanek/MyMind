type Mask = { placeholders: string[] };

const PLACEHOLDER_PREFIX = "\u0000CODEBLOCK\u0000";

function maskFenced(text: string, placeholders: string[], fence: string): string {
  const re = new RegExp(`^${fence}{3,}\\s*$`, "gm");
  let result = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const openEnd = m.index + m[0].length;
    const closeRe = new RegExp(`^${fence}{3,}\\s*$`, "gm");
    closeRe.lastIndex = openEnd;
    const close = closeRe.exec(text);
    if (!close) {
      result += text.slice(last, m.index);
      last = m.index;
      break;
    }
    const block = text.slice(m.index, close.index + close[0].length);
    const idx = placeholders.length;
    placeholders.push(block);
    result += text.slice(last, m.index) + `${PLACEHOLDER_PREFIX}${idx}\u0000`;
    last = close.index + close[0].length;
    re.lastIndex = last;
  }
  result += text.slice(last);
  return result;
}

function maskIndented(text: string, placeholders: string[]): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^    \S/.test(lines[i]) || /^    /.test(lines[i]) && lines[i] !== "") {
      const blockLines: string[] = [];
      while (i < lines.length && (/^    /.test(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim() === "" && i + 1 < lines.length && !/^    /.test(lines[i + 1]) && lines[i + 1].trim() !== "") break;
        blockLines.push(lines[i]);
        i++;
      }
      while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === "") blockLines.pop();
      if (blockLines.length > 0) {
        const idx = placeholders.length;
        placeholders.push(blockLines.join("\n"));
        out.push(`${PLACEHOLDER_PREFIX}${idx}\u0000`);
      }
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

export function maskCodeBlocks(text: string): { masked: string; placeholders: string[] } {
  const placeholders: string[] = [];
  let masked = maskFenced(text, placeholders, "`");
  masked = maskFenced(masked, placeholders, "~");
  masked = maskIndented(masked, placeholders);
  return { masked, placeholders };
}

export function restoreCodeBlocks(masked: string, placeholders: string[]): string {
  return masked.replace(new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)\u0000`, "g"), (_, idx) => placeholders[Number(idx)] ?? "");
}

export function withCodeMasking<T>(text: string, fn: (masked: string) => T): T {
  const { masked, placeholders } = maskCodeBlocks(text);
  const result = fn(masked);
  if (typeof result === "string") return restoreCodeBlocks(result, placeholders) as unknown as T;
  return result;
}
