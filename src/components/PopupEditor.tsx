import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Item } from "@/types";
import { useBoardStore } from "@/store/useBoardStore";
import { isMarkdownFile } from "@/lib/importMarkdown";
import { resolvePaste } from "@/lib/smartPaste";
import FormattingToolbar from "@/components/FormattingToolbar";
import {
  handleEnter, handleTab, toggleBold, toggleItalic, toggleStrikethrough,
  toggleCode, toggleLink, toggleHeading, toggleOrderedList, toggleBulletList,
  toggleBlockquote, toggleTaskItem, toggleTaskCheckbox,
  type EditState,
} from "@/lib/markdownEditing";

type PopupEditorProps = {
  item: Item;
  left: number;
  top: number;
  onClose: () => void;
};

export default function PopupEditor({ item, left, top, onClose }: PopupEditorProps) {
  const updateItem = useBoardStore((s) => s.updateItem);
  const [tagDraft, setTagDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ fileName: string; text: string } | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("mymind.popupEditor.expanded") === "true"; } catch { return false; }
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!editorRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const addTag = () => {
    const tag = tagDraft.trim();
    if (tag && !item.tags.includes(tag)) updateItem(item.id, { tags: [...item.tags, tag] });
    setTagDraft("");
  };

  const onDropFile = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!isMarkdownFile(file)) return;
    const reader = new FileReader();
    reader.onload = () => {
      setConfirmReplace({ fileName: file.name, text: String(reader.result) });
    };
    reader.readAsText(file);
  };

  const confirmReplaceBody = () => {
    if (!confirmReplace) return;
    updateItem(item.id, { description: confirmReplace.text });
    setConfirmReplace(null);
  };

  const toggleExpanded = () => {
    const ta = textareaRef.current;
    const selStart = ta?.selectionStart ?? 0;
    const selEnd = ta?.selectionEnd ?? 0;
    const scrollTop = ta?.scrollTop ?? 0;
    setExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem("mymind.popupEditor.expanded", String(next)); } catch { /* ignore */ }
      return next;
    });
    requestAnimationFrame(() => {
      const ta2 = textareaRef.current;
      if (ta2) {
        ta2.focus();
        ta2.selectionStart = selStart;
        ta2.selectionEnd = selEnd;
        ta2.scrollTop = scrollTop;
      }
      setSelectionTick((t) => t + 1);
    });
  };

  const handleToolbarEdit = (fn: (state: EditState) => EditState) => {
    applyEdit(fn(currentState()));
  };

  const applyEdit = (result: EditState) => {
    updateItem(item.id, { description: result.value });
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.selectionStart = result.selectionStart;
        ta.selectionEnd = result.selectionEnd;
      }
      setSelectionTick((t) => t + 1);
    });
  };

  const currentState = (): EditState => {
    const ta = textareaRef.current;
    if (!ta) return { value: item.description, selectionStart: 0, selectionEnd: 0 };
    return {
      value: item.description,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
    };
  };

  const onTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey;

    if (event.code === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.code === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      applyEdit(handleTab(currentState(), event.shiftKey));
      return;
    }
    if ((event.code === "Enter" || event.code === "NumpadEnter") && event.altKey && !mod) {
      event.preventDefault();
      event.stopPropagation();
      toggleExpanded();
      return;
    }
    if (event.code === "Enter" && !mod && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      applyEdit(handleEnter(currentState()));
      return;
    }

    if (mod && !event.shiftKey && !event.altKey) {
      switch (event.code) {
        case "KeyB": event.preventDefault(); event.stopPropagation(); applyEdit(toggleBold(currentState())); return;
        case "KeyI": event.preventDefault(); event.stopPropagation(); applyEdit(toggleItalic(currentState())); return;
        case "KeyX": event.preventDefault(); event.stopPropagation(); applyEdit(toggleStrikethrough(currentState())); return;
        case "KeyE": event.preventDefault(); event.stopPropagation(); applyEdit(toggleCode(currentState())); return;
        case "KeyK": event.preventDefault(); event.stopPropagation(); applyEdit(toggleLink(currentState())); return;
        case "Enter": event.preventDefault(); event.stopPropagation(); applyEdit(toggleTaskCheckbox(currentState())); return;
      }
      const digitMatch = event.code.match(/^Digit([1-6])$|^Numpad([1-6])$/);
      if (digitMatch) {
        const level = parseInt(digitMatch[1] || digitMatch[2], 10);
        event.preventDefault(); event.stopPropagation();
        applyEdit(toggleHeading(currentState(), level));
        return;
      }
    }

    if (mod && event.shiftKey && !event.altKey) {
      switch (event.code) {
        case "KeyX": event.preventDefault(); event.stopPropagation(); applyEdit(toggleStrikethrough(currentState())); return;
        case "Digit7": case "Numpad7": event.preventDefault(); event.stopPropagation(); applyEdit(toggleOrderedList(currentState())); return;
        case "Digit8": case "Numpad8": event.preventDefault(); event.stopPropagation(); applyEdit(toggleBulletList(currentState())); return;
        case "Digit9": case "Numpad9": event.preventDefault(); event.stopPropagation(); applyEdit(toggleBlockquote(currentState())); return;
        case "Enter": event.preventDefault(); event.stopPropagation(); applyEdit(toggleTaskItem(currentState())); return;
      }
    }
  };

  const onTextareaPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const markdown = resolvePaste(event.clipboardData, Boolean((event.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey), "popup");
    event.preventDefault();
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = item.description.slice(0, start) + markdown + item.description.slice(end);
    updateItem(item.id, { description: next });
    requestAnimationFrame(() => {
      const ta2 = textareaRef.current;
      if (ta2) {
        const caret = start + markdown.length;
        ta2.selectionStart = caret;
        ta2.selectionEnd = caret;
        setSelectionTick((t) => t + 1);
      }
    });
  };

  return (
    <div
      ref={editorRef}
      className={expanded
        ? "nodrag nopan fixed z-50 flex h-[92vh] w-[95vw] max-w-[1400px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-all duration-150 ease-in-out max-sm:h-[94vh] max-sm:w-[96vw] max-sm:max-w-none"
        : "nodrag nopan fixed z-50 flex max-h-[70vh] w-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-all duration-150 ease-in-out"}
      style={expanded ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" } : { left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDrop={onDropFile}
      onKeyDown={(event) => {
        if (event.code === "Escape") { event.stopPropagation(); onClose(); }
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Edit card</span>
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            onClick={toggleExpanded}
            title={expanded ? "Collapse editor" : "Expand editor"}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      <input
        className="nodrag nopan mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
        value={item.title}
        onChange={(event) => updateItem(item.id, { title: event.target.value })}
        autoFocus
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 p-2">
        {item.tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {tag}
            <button className="nodrag nopan" onClick={() => updateItem(item.id, { tags: item.tags.filter((value) => value !== tag) })}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="nodrag nopan min-w-20 flex-1 px-1 py-1 text-xs outline-none"
          value={tagDraft}
          placeholder="Add tag"
          onChange={(event) => setTagDraft(event.target.value)}
          onBlur={addTag}
          onKeyDown={(event) => {
            if (event.code === "Enter" || event.key === ",") {
              event.preventDefault();
              event.stopPropagation();
              addTag();
            } else if (event.code === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        />
      </div>
      <label className="mb-3 block text-xs font-semibold text-slate-500">
        Due date
        <input
          className="nodrag nopan mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 font-normal text-slate-700 outline-none focus:border-slate-400"
          type="date"
          value={item.dueDate ?? ""}
          onChange={(event) => updateItem(item.id, { dueDate: event.target.value || null })}
        />
      </label>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Description</span>
        <button className="nodrag nopan text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => setPreview((value) => !value)}>
          {preview ? "Edit markdown" : "Preview"}
        </button>
      </div>
      {preview ? (
        <div className="md-render min-h-40 flex-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700 prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{item.description || "Nothing to preview yet."}</ReactMarkdown>
        </div>
      ) : (
        <>
          <FormattingToolbar
            textareaRef={textareaRef}
            value={item.description}
            selectionTick={selectionTick}
            onEdit={handleToolbarEdit}
          />
          <textarea
            ref={textareaRef}
            className="nodrag nopan min-h-40 flex-1 resize-none rounded-lg border border-slate-200 p-3 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-slate-400"
            value={item.description}
            onChange={(event) => updateItem(item.id, { description: event.target.value })}
            onKeyDown={onTextareaKeyDown}
            onPaste={onTextareaPaste}
            onKeyUp={() => setSelectionTick((t) => t + 1)}
            onClick={() => setSelectionTick((t) => t + 1)}
            onSelect={() => setSelectionTick((t) => t + 1)}
          />
        </>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Created {new Date(item.createdAt).toLocaleString()}</p>
      {confirmReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmReplace(null)}>
          <div className="w-80 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Replace the contents of this card?</h3>
            <p className="mt-2 text-xs text-slate-500">The file <span className="font-medium">{confirmReplace.fileName}</span> will replace the current description.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmReplace(null)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
              <button onClick={confirmReplaceBody} className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
