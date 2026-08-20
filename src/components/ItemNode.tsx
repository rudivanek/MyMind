import { memo, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, useStore, type NodeProps, type Node } from "@xyflow/react";
import { MoreHorizontal, CircleDot, CheckCircle2, HelpCircle, AlertCircle, GitFork, AlertTriangle, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Item, CardType } from "@/types";
import { CARD_DEFAULT_H, CARD_DEFAULT_W } from "@/lib/layout";
import { useBoardStore } from "@/store/useBoardStore";
import InlineTitleEditor from "@/components/inline/InlineTitleEditor";
import { toggleCheckboxInBody } from "@/lib/markdownEditing";

type ItemNodeData = {
  item: Item;
  dimmed?: boolean;
  focusDimmed?: boolean;
  editing: boolean;
  zoom: number;
  onOpenEditor: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
  creationHighlight?: boolean;
};
type ItemNodeType = Node<ItemNodeData, "item">;

function dueDateState(dueDate: string | null): "none" | "neutral" | "amber" | "red" {
  if (!dueDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diffDays = (due.getTime() - today.getTime()) / 86400000;
  if (diffDays < 0) return "red";
  if (diffDays <= 3) return "amber";
  return "neutral";
}

const dueBadgeClass = (state: string) => state === "red" ? "bg-red-50 text-red-700 border border-red-200" : state === "amber" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-600 border border-gray-200";

const CARD_TYPE_CONFIG: Record<CardType, { icon: typeof GitFork | null; accent: string; shapeClass: string; shapeStyle: Record<string, string> }> = {
  note:       { icon: null,         accent: "transparent", shapeClass: "rounded-xl",            shapeStyle: {} },
  decision:   { icon: GitFork,       accent: "#f59e0b",     shapeClass: "rounded-[4px]",          shapeStyle: { clipPath: "polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)", borderWidth: "2px", borderStyle: "solid", borderColor: "#f59e0b" } },
  option:     { icon: CircleDot,     accent: "#3b82f6",     shapeClass: "rounded-[18px]",         shapeStyle: {} },
  assumption: { icon: HelpCircle,    accent: "#8b5cf6",     shapeClass: "rounded-[28px]",         shapeStyle: { borderStyle: "dashed", borderWidth: "2px", borderColor: "#8b5cf6" } },
  risk:       { icon: AlertTriangle, accent: "#ef4444",     shapeClass: "rounded-[4px]",          shapeStyle: { clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)", borderWidth: "2px", borderStyle: "solid", borderColor: "#ef4444" } },
  evidence:   { icon: FileText,     accent: "#22c55e",     shapeClass: "rounded-xl",            shapeStyle: {} },
};

function ItemNode({ id, data, selected }: NodeProps<ItemNodeType>) {
  const { item, dimmed, focusDimmed, editing, zoom, onOpenEditor, onContextMenu, creationHighlight } = data;
  const isConnecting = useStore((s) => s.connection.inProgress);
  const canEditInline = zoom >= 0.6;
  const setEditingItem = useBoardStore((s) => s.setEditingItem);
  const updateItem = useBoardStore((s) => s.updateItem);
  const beginResize = useBoardStore((s) => s.beginResize);
  const commitResize = useBoardStore((s) => s.commitResize);
  const resizeStartRef = useRef<{ width: number; height: number; storedWidth: number | null; storedHeight: number | null } | null>(null);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<number | null>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dueState = dueDateState(item.dueDate);
  const preview = item.description.trim();
  const cardType: CardType = item.cardType ?? "note";
  const typeConfig = CARD_TYPE_CONFIG[cardType];
  const TypeIcon = typeConfig.icon;
  const statusConfig: { icon: typeof CircleDot; className: string; label: string } | null =
    item.status === "todo" ? { icon: CircleDot, className: "text-indigo-500", label: "todo" }
    : item.status === "done" ? { icon: CheckCircle2, className: "text-emerald-600", label: "done" }
    : item.status === "question" ? { icon: HelpCircle, className: "text-amber-500", label: "question" }
    : item.status === "important" ? { icon: AlertCircle, className: "text-red-600", label: "important" }
    : null;

  useEffect(() => {
    if (!descriptionEditing || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
    textarea.focus();
  }, [descriptionEditing]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const fitHeightToContent = () => {
    const desc = descriptionRef.current;
    if (!desc) return;
    const renderedDescHeight = desc.getBoundingClientRect().height;
    const prevFlex = desc.style.flex;
    const prevHeight = desc.style.height;
    const prevMaxHeight = desc.style.maxHeight;
    const prevOverflow = desc.style.overflow;
    desc.style.flex = "0 0 auto";
    desc.style.height = "auto";
    desc.style.maxHeight = "none";
    desc.style.overflow = "visible";
    const naturalDescHeight = desc.scrollHeight;
    desc.style.flex = prevFlex;
    desc.style.height = prevHeight;
    desc.style.maxHeight = prevMaxHeight;
    desc.style.overflow = prevOverflow;
    const fixedHeight = (item.height ?? CARD_DEFAULT_H) - renderedDescHeight;
    const newHeight = Math.round(Math.min(Math.max(fixedHeight + naturalDescHeight, CARD_DEFAULT_H), 800));
    const currentWidth = item.width ?? CARD_DEFAULT_W;
    if (newHeight === (item.height ?? CARD_DEFAULT_H)) return;
    commitResize(id, currentWidth, newHeight, item.width ?? null, item.height ?? null);
  };

  useEffect(() => {
    const onEditDescription = (e: Event) => {
      if (!selected) return;
      setDescriptionDraft(item.description);
      setDescriptionEditing(true);
    };
    window.addEventListener("mymind:edit-description", onEditDescription);
    return () => window.removeEventListener("mymind:edit-description", onEditDescription);
  }, [selected, item.description]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !selected) return;
    const handles = card.querySelectorAll<HTMLElement>(
      ".item-node-resizer-handle.bottom:not(.left)"
    );
    if (handles.length === 0) return;
    const onDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      fitHeightToContent();
    };
    handles.forEach((handle) => handle.addEventListener("dblclick", onDoubleClick));
    return () => handles.forEach((handle) => handle.removeEventListener("dblclick", onDoubleClick));
  }, [selected, item.height, item.width, item.description]);

  if (!item) return null;

  const styleTier = item.color === "highlighted" || item.color === "muted" || item.color === "red" || item.color === "black" ? item.color : "normal";
  const styleConfig = {
    normal: { stripe: "#7F77DD", card: "bg-white", title: "font-medium text-gray-900", description: "text-gray-500" },
    highlighted: { stripe: "#1D9E75", card: "bg-white bg-[linear-gradient(90deg,rgba(29,158,117,0.07),transparent_72%)]", title: "font-medium text-gray-900", description: "text-gray-500" },
    muted: { stripe: "#94a3b8", card: "bg-[var(--surface-1)] border-[0.5px] border-dashed border-slate-300", title: "font-normal text-slate-500", description: "text-slate-400" },
    red: { stripe: "#DC2626", card: "bg-white bg-[linear-gradient(90deg,rgba(220,38,38,0.07),transparent_72%)]", title: "font-medium text-gray-900", description: "text-gray-500" },
    black: { stripe: "#111827", card: "bg-white bg-[linear-gradient(90deg,rgba(17,24,39,0.06),transparent_72%)]", title: "font-semibold text-gray-900", description: "text-gray-500" },
  }[styleTier];

  const resizeDescription = (value: string) => {
    setDescriptionDraft(value);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    });
  };

  const commitDescription = () => {
    updateItem(id, { description: descriptionDraft });
    setDescriptionEditing(false);
  };

  const startDescriptionEdit = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canEditInline) {
      onOpenEditor(id);
      return;
    }
    setDescriptionDraft(item.description);
    setDescriptionEditing(true);
  };

  const handleTitleDoubleClick = (event: React.MouseEvent) => {
    // stopImmediatePropagation on the NATIVE event is required: plain stopPropagation
    // does not always prevent React Flow's own onNodeDoubleClick on the node wrapper,
    // which is what was opening the popup editor instead of editing inline.
    event.stopPropagation();
    event.preventDefault();
    event.nativeEvent.stopImmediatePropagation();
    // Title always edits inline, at any zoom level. InlineTitleEditor focuses and
    // selects the whole value so typing overwrites it immediately.
    setEditingItem(id);
  };

  return (
    <div
      ref={cardRef}
      data-nodeid={id}
      className={`relative flex h-full flex-col transition-[box-shadow,transform,opacity] duration-[150ms] ${styleConfig.card} ${typeConfig.shapeClass}${cardType !== "note" ? " card-type--" + cardType : ""}${selected ? " scale-[1.02] origin-center ring-2 ring-[#6366f1] ring-offset-0" : styleTier === "muted" ? " shadow-sm" : " ring-1 ring-black/5 shadow-md hover:shadow-lg"}${isConnecting ? " is-connecting" : ""}${creationHighlight ? " creation-highlight" : ""}${focusDimmed ? " pointer-events-none" : ""}`}
      style={{ width: item.width ?? CARD_DEFAULT_W, height: item.height ?? CARD_DEFAULT_H, ["--card-scale" as string]: item.scale ?? 1, opacity: focusDimmed ? 0.12 : (dimmed ? 0.25 : 1), cursor: "default", boxShadow: selected ? "0 0 0 4px rgba(99,102,241,0.12), 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)" : undefined, ...typeConfig.shapeStyle }}
      onContextMenu={(event) => onContextMenu(event, id)}
    >
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl" style={{ backgroundColor: styleConfig.stripe }} />
      {cardType !== "note" && <div className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: typeConfig.accent, zIndex: 4, borderRadius: "2px" }} />}
      <NodeResizer
        isVisible={selected}
        minHeight={CARD_DEFAULT_H}
        maxHeight={800}
        minWidth={180}
        maxWidth={700}
        keepAspectRatio={false}
        handleClassName="item-node-resizer-handle"
        lineClassName="item-node-resizer-line"
        shouldResize={(_, params) => params.direction[0] >= 0 && params.direction[1] >= 0 && (params.direction[0] !== 0 || params.direction[1] !== 0)}
        onResizeStart={() => {
          resizeStartRef.current = { width: item.width ?? CARD_DEFAULT_W, height: item.height ?? CARD_DEFAULT_H, storedWidth: item.width ?? null, storedHeight: item.height ?? null };
          beginResize(id);
        }}
        onResize={(_, params) => updateItem(id, { width: Math.round(params.width), height: Math.round(params.height) })}
        onResizeEnd={(_, params) => {
          const previous = resizeStartRef.current;
          if (previous) commitResize(id, Math.round(params.width), Math.round(params.height), previous.storedWidth, previous.storedHeight);
          resizeStartRef.current = null;
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pl-4 pt-5">
        {editing ? (
          <InlineTitleEditor id={id} value={item.title} onCommit={(value) => { updateItem(id, { title: value }); setEditingItem(null); }} onCancel={() => setEditingItem(null)} />
        ) : (
          <div onDoubleClick={handleTitleDoubleClick} className={`flex items-center gap-1 truncate text-sm ${styleConfig.title} leading-tight cursor-text`} style={{ overflowWrap: "anywhere", fontSize: "calc(13px * var(--card-scale, 1))" }}>
            {TypeIcon && <TypeIcon size={13} className="flex-shrink-0" style={{ color: typeConfig.accent, width: "calc(13px * var(--card-scale, 1))", height: "calc(13px * var(--card-scale, 1))" }} />}
            <span className="truncate">{item.title || "Untitled"}</span>
          </div>
        )}
        {descriptionEditing ? (
          <textarea
            ref={textareaRef}
            className="nodrag nopan mt-1 block max-h-[300px] min-h-[24px] w-full resize-none overflow-y-auto rounded border border-slate-200 p-1 leading-snug text-slate-600 outline-none focus:border-slate-400"
            style={{ fontSize: "calc(12px * var(--card-scale, 1))" }}
            value={descriptionDraft}
            onChange={(event) => resizeDescription(event.target.value)}
            onBlur={commitDescription}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                setDescriptionDraft(item.description);
                setDescriptionEditing(false);
              }
            }}
          />
        ) : (
          <div ref={descriptionRef} onClick={startDescriptionEdit} className={`card-markdown-preview mt-1 min-h-0 flex-1 overflow-hidden ${styleConfig.description} ${preview ? "cursor-text" : "cursor-text min-h-4"}`} style={{ overflowWrap: "anywhere" }}>
            {preview ? (
              (() => {
                let taskCounter = 0;
                return (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      li: ({ children, node }) => {
                        const liNode = node as unknown as { properties?: { className?: string[] } };
                        const isTask = liNode?.properties?.className?.includes("task-list-item");
                        if (!isTask) return <li>{children}</li>;
                        const idx = taskCounter++;
                        const childArr = Array.isArray(children) ? children : [children];
                        const checkboxChild = childArr.find((c) => {
                          if (!c || typeof c !== "object") return false;
                          const p = (c as { props?: { checked?: boolean } }).props;
                          return p && "checked" in p;
                        });
                        const checked = !!((checkboxChild as { props?: { checked?: boolean } } | null)?.props?.checked);
                        return (
                          <li className="task-list-item" style={{ listStyle: "none", display: "flex", alignItems: "flex-start", gap: "4px" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const newBody = toggleCheckboxInBody(item.description, idx);
                                updateItem(id, { description: newBody });
                              }}
                              style={{ marginTop: "2px", flexShrink: 0, width: "calc(12px * var(--card-scale, 1))", height: "calc(12px * var(--card-scale, 1))" }}
                            />
                            <span>{childArr.filter((c) => {
                              if (!c || typeof c !== "object") return true;
                              const p = (c as { props?: { type?: string } }).props;
                              return !(p && p.type === "checkbox");
                            })}</span>
                          </li>
                        );
                      },
                    }}
                  >
                    {item.description}
                  </ReactMarkdown>
                );
              })()
            ) : "Add description…"}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1">
          {item.tags.slice(0, 2).map((tag) => <span key={tag} className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600" style={{ fontSize: "calc(11px * var(--card-scale, 1))" }}>{tag}</span>)}
          {item.tags.length > 2 && <span className="font-medium text-gray-400" style={{ fontSize: "calc(11px * var(--card-scale, 1))" }}>+{item.tags.length - 2}</span>}
          {dueState !== "none" && <span className={`ml-auto inline-flex items-center rounded-md px-1.5 py-0.5 font-medium ${dueBadgeClass(dueState)}`} style={{ fontSize: "calc(11px * var(--card-scale, 1))" }}>{item.dueDate}</span>}
        </div>
      </div>
      <div className="card-drag-dot" role="button" tabIndex={0} aria-label="Drag card" onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }} />
      {statusConfig && (() => { const StatusIcon = statusConfig.icon; return <div className="pointer-events-none absolute z-[3]" style={{ top: 6, right: 8, fontSize: "calc(14px * var(--card-scale, 1))" }} title={statusConfig.label} aria-label={statusConfig.label}><StatusIcon size={14} className={statusConfig.className} style={{ width: "calc(14px * var(--card-scale, 1))", height: "calc(14px * var(--card-scale, 1))" }} /></div>; })()}
      <span className="export-badge" aria-hidden="true" />
      <button onClick={(event) => { event.stopPropagation(); onOpenEditor(id); }} className="nodrag nopan absolute bottom-[-10px] left-1/2 flex h-6 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-400 shadow-sm transition hover:text-gray-700 hover:shadow-md"><MoreHorizontal size={14} /></button>
      <Handle type="target" position={Position.Top} isConnectable className="card-handle card-handle--top card-handle--ghost" />
      <Handle type="target" position={Position.Bottom} isConnectable className="card-handle card-handle--bottom card-handle--ghost" />
      <Handle type="target" position={Position.Left} isConnectable className="card-handle card-handle--left card-handle--ghost" />
      <Handle type="target" position={Position.Right} isConnectable className="card-handle card-handle--right card-handle--ghost" />
      <Handle type="source" position={Position.Top} isConnectable className="card-handle card-handle--top" />
      <Handle type="source" position={Position.Bottom} isConnectable className="card-handle card-handle--bottom" />
      <Handle type="source" position={Position.Left} isConnectable className="card-handle card-handle--left" />
      <Handle type="source" position={Position.Right} isConnectable className="card-handle card-handle--right" />
    </div>
  );
}

export default memo(ItemNode);

