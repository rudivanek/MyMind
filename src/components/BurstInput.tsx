import { useEffect, useRef, useState } from "react";
import { Zap, X } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useBoardStore } from "@/store/useBoardStore";
import { CARD_DEFAULT_W, CARD_DEFAULT_H } from "@/lib/layout";
import type { Item } from "@/types";

const COLUMN_GAP = 24;
const COLUMN_STEP_X = CARD_DEFAULT_W + 32;
const STRIP_MARGIN = 16;
const MAX_STRIP_STEPS = 6;

type Anchor = { x: number; y: number; bottomY: number };

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  margin: number,
): boolean {
  return (
    a.x - margin < b.x + b.w + margin &&
    a.x + a.w + margin > b.x - margin &&
    a.y - margin < b.y + b.h + margin &&
    a.y + a.h + margin > b.y - margin
  );
}

function stripClear(
  x: number,
  topY: number,
  bottomY: number,
  items: Item[],
): boolean {
  const strip = { x, y: topY, w: CARD_DEFAULT_W, h: bottomY - topY };
  return !items.some((it) => {
    const w = it.width ?? CARD_DEFAULT_W;
    const h = it.height ?? CARD_DEFAULT_H;
    return rectsOverlap(strip, { x: it.posX, y: it.posY, w, h }, STRIP_MARGIN);
  });
}

export default function BurstInput() {
  const open = useBoardStore((s) => s.burstInputOpen);
  const setOpen = useBoardStore((s) => s.setBurstInputOpen);
  const createBurstItem = useBoardStore((s) => s.createBurstItem);
  const { screenToFlowPosition, flowToScreenPosition, getViewport, setViewport } = useReactFlow();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [count, setCount] = useState(0);
  const anchorRef = useRef<Anchor | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setValue("");
      setCount(0);
      anchorRef.current = null;
      cursorRef.current = null;
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onModalState = (e: Event) => {
      const detail = (e as CustomEvent<{ source: string; open: boolean }>).detail;
      if (detail.source !== "burst-input") setOpen(false);
    };
    window.addEventListener("mymind:modal-state", onModalState);
    window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "burst-input", open: true } }));
    return () => {
      window.removeEventListener("mymind:modal-state", onModalState);
      window.dispatchEvent(new CustomEvent("mymind:modal-state", { detail: { source: "burst-input", open: false } }));
    };
  }, [open, setOpen]);

  if (!open) return null;

  const computeAnchor = (): Anchor => {
    const sidebarWidth = useBoardStore.getState().sidebarCollapsed ? 0 : 240;
    const screenCentreX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    const screenTopY = 80;
    const screenBottomY = window.innerHeight - 120;
    const anchorScreenY = screenTopY + (screenBottomY - screenTopY) * 0.28;

    const centre = screenToFlowPosition({ x: screenCentreX, y: anchorScreenY });
    const bottomFlow = screenToFlowPosition({ x: 0, y: screenBottomY });
    const visibleBottomY = bottomFlow.y;

    const items = useBoardStore.getState().items;

    const tryX = (x: number): boolean =>
      stripClear(x, centre.y, visibleBottomY, items);

    const candidates: number[] = [];
    for (let i = 1; i <= MAX_STRIP_STEPS; i++) candidates.push(centre.x + i * COLUMN_STEP_X);
    for (let i = 1; i <= MAX_STRIP_STEPS; i++) candidates.push(centre.x - i * COLUMN_STEP_X);

    for (const cx of candidates) {
      if (tryX(cx)) return { x: cx, y: centre.y, bottomY: visibleBottomY };
    }

    // No clear strip: place below the bottom-most card in the viewport X range.
    const stripLeft = centre.x - CARD_DEFAULT_W / 2;
    const stripRight = centre.x + CARD_DEFAULT_W / 2;
    let maxBottom = centre.y;
    for (const it of items) {
      const w = it.width ?? CARD_DEFAULT_W;
      const h = it.height ?? CARD_DEFAULT_H;
      if (it.posX + w < stripLeft || it.posX > stripRight) continue;
      maxBottom = Math.max(maxBottom, it.posY + h + COLUMN_GAP);
    }
    return { x: centre.x, y: maxBottom, bottomY: visibleBottomY };
  };

  const ensureAnchor = (): Anchor => {
    if (anchorRef.current) return anchorRef.current;
    const a = computeAnchor();
    anchorRef.current = a;
    cursorRef.current = { x: a.x, y: a.y };
    return a;
  };

  const findClearColumnX = (startX: number, topY: number, bottomY: number): number => {
    const items = useBoardStore.getState().items;
    if (stripClear(startX, topY, bottomY, items)) return startX;
    for (let i = 1; i <= MAX_STRIP_STEPS; i++) {
      const rx = startX + i * COLUMN_STEP_X;
      if (stripClear(rx, topY, bottomY, items)) return rx;
    }
    for (let i = 1; i <= MAX_STRIP_STEPS; i++) {
      const lx = startX - i * COLUMN_STEP_X;
      if (stripClear(lx, topY, bottomY, items)) return lx;
    }
    return startX;
  };

  const panToReveal = (flowX: number, flowY: number) => {
    const vp = getViewport();
    const screen = flowToScreenPosition({ x: flowX, y: flowY });
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const sidebarWidth = useBoardStore.getState().sidebarCollapsed ? 0 : 240;
    const usableW = screenW - sidebarWidth;
    let dx = 0;
    let dy = 0;
    if (screen.x < sidebarWidth + 40) dx = sidebarWidth + 40 - screen.x;
    else if (screen.x > screenW - 40) dx = screenW - 40 - screen.x;
    if (screen.y < 80) dy = 80 - screen.y;
    else if (screen.y > screenH - 120) dy = screenH - 120 - screen.y;
    if (dx === 0 && dy === 0) return;
    setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    const anchor = ensureAnchor();
    let cursor = cursorRef.current!;

    if (cursor.y + CARD_DEFAULT_H > anchor.bottomY) {
      const newX = findClearColumnX(cursor.x + COLUMN_STEP_X, anchor.y, anchor.bottomY);
      cursor = { x: newX, y: anchor.y };
    }

    const id = createBurstItem(trimmed, cursor.x, cursor.y);
    if (id) {
      const newItem = useBoardStore.getState().items.find((it) => it.id === id);
      const h = newItem?.height ?? CARD_DEFAULT_H;
      cursorRef.current = { x: cursor.x, y: cursor.y + h + COLUMN_GAP };
      panToReveal(cursor.x, cursor.y);
    }
    setValue("");
    setCount((c) => c + 1);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      className="nodrag nopan fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Zap size={16} className="shrink-0 text-slate-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.code === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            submit();
          } else if (e.code === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        onBlur={() => setOpen(false)}
        placeholder="Type a thought, press Enter"
        className="w-72 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      {count > 0 && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {count} {count === 1 ? "card" : "cards"}
        </span>
      )}
      <button
        type="button"
        aria-label="Close burst input"
        className="shrink-0 rounded-full p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={() => setOpen(false)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
