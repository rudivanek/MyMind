import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useBoardStore } from "@/store/useBoardStore";
import { supabase } from "@/lib/supabase";
import { getEdgeParams } from "@/components/edges/floatingEdgeUtils";

type CommentEdgeData = {
  comment?: string;
  labelDx?: number;
  labelDy?: number;
  onPillDragEnd?: (id: string, anchorX: number, anchorY: number) => void;
  focusDimmed?: boolean;
};

type CommentEdge = Edge<CommentEdgeData>;

export default function FloatingCommentEdge({
  id,
  source,
  target,
  markerEnd,
  data,
  selected,
  style,
}: EdgeProps<CommentEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const updateConnection = useBoardStore((s) => s.updateConnection);
  const selectConnection = useBoardStore((s) => s.selectConnection);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(data?.comment ?? "");
  const [pillSize, setPillSize] = useState({ w: 0, h: 0 });
  const [dragOffset, setDragOffset] = useState({ x: data?.labelDx ?? 0, y: data?.labelDy ?? 0 });
  const [edgeHovered, setEdgeHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const leaderRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef({ x: data?.labelDx ?? 0, y: data?.labelDy ?? 0 });
  const renderData = useRef({ anchor: { x: 0, y: 0 }, labelX: 0, labelY: 0, pillSize: { w: 0, h: 0 } });

  useEffect(() => {
    setDragOffset({ x: data?.labelDx ?? 0, y: data?.labelDy ?? 0 });
    offsetRef.current = { x: data?.labelDx ?? 0, y: data?.labelDy ?? 0 };
  }, [data?.labelDx, data?.labelDy]);

  useLayoutEffect(() => {
    if (pillRef.current) {
      const w = pillRef.current.offsetWidth;
      const h = pillRef.current.offsetHeight;
      setPillSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    }
  }, [data?.comment, editing]);

  const [toast, setToast] = useState<string | null>(null);

  const handleDeleteConnection = useCallback(async (connectionId: string) => {
    const result = await supabase.from("connections").delete().eq("id", connectionId);
    if (result.error) {
      console.error("Supabase connection delete failed", result.error);
      setToast("Could not delete the connection");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    useBoardStore.getState().deleteConnection(connectionId);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.key !== "Delete" && event.key !== "Backspace") || target.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleDeleteConnection(id);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleDeleteConnection, id, selected]);

  if (!sourceNode || !targetNode) return null;
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  const dx = dragOffset.x;
  const dy = dragOffset.y;
  const opacity = (style?.opacity as number | undefined) ?? 1;
  const focusDimmed = data?.focusDimmed ?? false;
  const labelOpacity = focusDimmed ? 0.12 : opacity;

  const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathEl.setAttribute("d", edgePath);
  const totalLength = pathEl.getTotalLength();
  const midPoint = pathEl.getPointAtLength(totalLength / 2);

  const pillCenterX = labelX + dx;
  const pillCenterY = labelY + dy;
  // The leader is darker than the connection line on purpose: a short dotted
  // segment needs more contrast than a long curve to read at all.
  const showLeader = Math.abs(dx) > 1 || Math.abs(dy) > 1;

  const halfW = pillSize.w / 2;
  const halfH = pillSize.h / 2;
  const dirX = pillCenterX - midPoint.x;
  const dirY = pillCenterY - midPoint.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / dirLen;
  const ny = dirY / dirLen;
  const txScale = nx !== 0 ? halfW / Math.abs(nx) : Infinity;
  const tyScale = ny !== 0 ? halfH / Math.abs(ny) : Infinity;
  const scale = Math.min(txScale, tyScale);
  const lineEndX = pillCenterX - nx * scale;
  const lineEndY = pillCenterY - ny * scale;

  renderData.current = { anchor: { x: midPoint.x, y: midPoint.y }, labelX, labelY, pillSize };

  const hasComment = Boolean(data?.comment);
  const showDelete = (edgeHovered || buttonHovered || selected) && !editing;

  const finishEdit = () => {
    updateConnection(id, { comment: draft });
    setEditing(false);
  };

  const updatePillDom = (offsetX: number, offsetY: number) => {
    const { anchor: a, labelX: lx, labelY: ly, pillSize: ps } = renderData.current;
    const cx = lx + offsetX;
    const cy = ly + offsetY;
    if (pillRef.current) {
      pillRef.current.style.transform = `translate(-50%, -50%) translate(${cx}px, ${cy}px)`;
    }
    const visible = Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1;
    if (leaderRef.current) {
      leaderRef.current.style.display = visible ? "" : "none";
    }
    if (lineRef.current && visible) {
      const hw = ps.w / 2;
      const hh = ps.h / 2;
      const ddx = cx - a.x;
      const ddy = cy - a.y;
      const dLen = Math.hypot(ddx, ddy) || 1;
      const nnx = ddx / dLen;
      const nny = ddy / dLen;
      const tsx = nnx !== 0 ? hw / Math.abs(nnx) : Infinity;
      const tsy = nny !== 0 ? hh / Math.abs(nny) : Infinity;
      const sc = Math.min(tsx, tsy);
      lineRef.current.setAttribute("x2", String(cx - nnx * sc));
      lineRef.current.setAttribute("y2", String(cy - nny * sc));
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    dragStart.current = { x: event.clientX - offsetRef.current.x, y: event.clientY - offsetRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.addEventListener("pointermove", onPointerMoveLive);
  };

  const onPointerMoveLive = (event: PointerEvent) => {
    if (!dragStart.current) return;
    const offsetX = event.clientX - dragStart.current.x;
    const offsetY = event.clientY - dragStart.current.y;
    offsetRef.current = { x: offsetX, y: offsetY };
    updatePillDom(offsetX, offsetY);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.removeEventListener("pointermove", onPointerMoveLive);
    const { x, y } = offsetRef.current;
    if (data?.onPillDragEnd) data.onPillDragEnd(id, renderData.current.labelX + x, renderData.current.labelY + y);
    else updateConnection(id, { labelDx: x, labelDy: y });
  };

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    selectConnection(id);
    setMenuOpen(true);
  };

  return (
    <>
      <g
        onMouseEnter={() => setEdgeHovered(true)}
        onMouseLeave={() => setEdgeHovered(false)}
      >
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          pointerEvents="stroke"
        />
        <BaseEdge
          path={edgePath}
          markerEnd={(markerEnd as string | undefined) ?? undefined}
          style={style}
        />
      </g>
      {toast && <div className="nodrag nopan pointer-events-auto absolute left-1/2 top-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl">{toast}</div>}
      <EdgeLabelRenderer>
        {hasComment && (
          <svg
            ref={leaderRef}
           className="pointer-events-none absolute left-0 top-0"
            style={{ width: "100000px", height: "100000px", overflow: "visible", opacity: labelOpacity, display: showLeader ? "" : "none" }}
          >
            <line
              ref={lineRef}
              x1={midPoint.x}
              y1={midPoint.y}
              x2={lineEndX}
              y2={lineEndY}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              strokeWidth={1.2}
              pointerEvents="none"
            />
            <circle cx={midPoint.x} cy={midPoint.y} r={2.5} fill="#94a3b8" pointerEvents="none" />
          </svg>
        )}
        {hasComment && (
          <div
            ref={pillRef}
            className="nodrag nopan absolute pointer-events-auto"
            style={{
              zIndex: 1000,
              transform: `translate(-50%, -50%) translate(${pillCenterX}px, ${pillCenterY}px)`,
              opacity: labelOpacity,
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setDraft(data?.comment ?? "");
              setEditing(true);
            }}
            onContextMenu={openMenu}
          >
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={finishEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") finishEdit();
                  if (event.key === "Escape") setEditing(false);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="w-36 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-lg outline-none"
              />
            ) : (
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-md">
                {data?.comment}
              </div>
            )}
            {menuOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-36 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-xl">
                <button
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  Edit comment
                </button>
                <button
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                  onClick={() => {
                    useBoardStore.getState().reverseConnection(id);
                    setMenuOpen(false);
                  }}
                >
                  Reverse direction
                </button>
                <button
                  className="block w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                  onClick={() => {
                    void handleDeleteConnection(id);
                    setMenuOpen(false);
                  }}
                >
                  Delete connection
                </button>
              </div>
            )}
          </div>
        )}
        <div
          className="nodrag nopan absolute pointer-events-auto"
          style={{
            transform: `translate(-50%, -50%) translate(${midPoint.x}px, ${midPoint.y}px)`,
          }}
          onMouseEnter={() => setButtonHovered(true)}
          onMouseLeave={() => setButtonHovered(false)}
        >
          <button
            className={`edge-midpoint-delete${showDelete ? " edge-midpoint-delete--visible" : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void handleDeleteConnection(id);
            }}
            aria-label="Delete connection"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

