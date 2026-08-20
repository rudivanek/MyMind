import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Item } from "@/types";
import { serializeItemsForDisplay } from "@/lib/markdown";

const INLINE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
  h2 { font-size: 1.3em; font-weight: 700; margin: 0.5em 0; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0; }
  h4 { font-size: 1em; font-weight: 600; margin: 0.5em 0; }
  p { margin: 0.5em 0; }
  ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
  li { margin: 0.25em 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  a { color: #2563eb; text-decoration: underline; }
  code { font-family: "SF Mono", Monaco, monospace; background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75em; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #cbd5e1; margin: 0.5em 0; padding-left: 1em; color: #64748b; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 0.4em 0.6em; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1em 0; }
`;

function markdownToHtml(markdown: string): string {
  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkBreaks] }, markdown),
    ),
  );
  return `<html><head><style>${INLINE_STYLES}</style></head><body>${html}</body></html>`;
}

export async function copyItemsDualFlavour(items: Item[]): Promise<void> {
  const plain = serializeItemsForDisplay(items);
  const html = markdownToHtml(plain);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard && typeof navigator.clipboard.write === "function") {
    try {
      const clipboardItem = new ClipboardItem({
        "text/plain": new Blob([plain], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return;
    } catch {
      // fall through to legacy
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      // silently ignore — do not throw if async API is blocked
    }
  }
}

export async function copyMarkdownDualFlavour(markdown: string): Promise<void> {
  const html = markdownToHtml(markdown);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard && typeof navigator.clipboard.write === "function") {
    try {
      const clipboardItem = new ClipboardItem({
        "text/plain": new Blob([markdown], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return;
    } catch {
      // fall through to legacy
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // silently ignore
    }
  }
}
