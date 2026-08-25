import TurndownService from "turndown";
import type { ClipboardEvent } from "react";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndownService.remove([
  "script", "style", "nav", "footer", "header", "aside", "form", "iframe", "noscript", "hr",
]);

export type PasteTarget = "canvas" | "popup" | "inline" | "sidebar";

const STRONG_MD_EVIDENCE = [
  /^#{1,6}\s+\S/m,
  /^(`{3,}|~{3,})/m,
  /\[[^\]]*\]\([^)]*\)/,
  /^\|.*\|/m,
  /^>\s+\S/m,
  /\*\*\S[\s\S]*?\S\*\*/,
];

function hasStrongMarkdownEvidence(text: string): boolean {
  return STRONG_MD_EVIDENCE.some((re) => re.test(text));
}

export function clipboardToMarkdown(plain: string, html: string, forcePlain: boolean, target: PasteTarget = "canvas"): string {
  const hasHtml = Boolean(html);
  const hasPlain = Boolean(plain);
  let result: string;

  if (forcePlain || !hasHtml) {
    result = plain;
  } else if (!hasPlain) {
    result = turndownService.turndown(html);
  } else {
    const strongMarkdown = hasStrongMarkdownEvidence(plain);
    if (strongMarkdown) {
      result = plain;
    } else {
      result = turndownService.turndown(html);
    }
  }

  return result;
}

export function resolvePaste(clipboardData: DataTransfer | null, shiftKey: boolean, target: PasteTarget): string {
  const plain = clipboardData?.getData("text/plain") ?? "";
  const html = clipboardData?.getData("text/html") ?? "";
  return clipboardToMarkdown(plain, html, shiftKey, target);
}

export function handleTextareaPaste(e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, target: PasteTarget): void {
  const markdown = resolvePaste(e.clipboardData, Boolean((e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey), target);
  e.preventDefault();
  document.execCommand("insertText", false, markdown);
}
