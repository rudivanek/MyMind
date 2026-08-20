import type { Item, Connection } from "@/types";

export const CARD_W = 240;
export const CARD_DEFAULT_W = CARD_W;
export const CARD_DEFAULT_H = 92;
export const CARD_MARGIN = 16;
export const GRID = 16;

export function estimateCardHeight(description: string): number {
  const PADDING = 24;
  const TITLE_H = 18;
  const TAGS_H = 22;
  const LINE_H = 17;
  const MAX_LINES = 4;
  const CHARS_PER_LINE = 34;
  const fixed = PADDING + TITLE_H + TAGS_H;
  const lines = description ? Math.min(Math.max(1, Math.ceil(description.length / CHARS_PER_LINE)), MAX_LINES) : 1;
  return fixed + lines * LINE_H;
}

type Rect = { x: number; y: number; w: number; h: number };

function cardRect(item: Item): Rect {
  return { x: item.posX, y: item.posY, w: item.width ?? CARD_DEFAULT_W, h: item.height ?? CARD_DEFAULT_H };
}

function pillRect(centerX: number, centerY: number, w = 96, h = 28): Rect {
  return { x: centerX - w / 2, y: centerY - h / 2, w, h };
}

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return !(a.x + a.w + margin <= b.x || b.x + b.w + margin <= a.x || a.y + a.h + margin <= b.y || b.y + b.h + margin <= a.y);
}

export function findFreeCardPosition(
  posX: number,
  posY: number,
  items: Item[],
  excludeId?: string,
  candidateDescription?: string,
): { x: number; y: number } {
  const snapped = { x: Math.round(posX / GRID) * GRID, y: Math.round(posY / GRID) * GRID };
  const others = items.filter((it) => it.id !== excludeId).map(cardRect);
  const candidateH = CARD_DEFAULT_H;

  const isFree = (x: number, y: number) => {
    const r = { x, y, w: CARD_DEFAULT_W, h: candidateH };
    return !others.some((o) => rectsOverlap(r, o, CARD_MARGIN));
  };

  if (isFree(snapped.x, snapped.y)) return snapped;

  const maxRing = 80;
  for (let ring = 1; ring < maxRing; ring += 1) {
    const step = GRID;
    for (let i = -ring; i <= ring; i += 1) {
      const candidates = [
        { x: snapped.x + i * step, y: snapped.y - ring * step },
        { x: snapped.x + i * step, y: snapped.y + ring * step },
        { x: snapped.x - ring * step, y: snapped.y + i * step },
        { x: snapped.x + ring * step, y: snapped.y + i * step },
      ];
      for (const c of candidates) {
        if (isFree(c.x, c.y)) return c;
      }
    }
  }
  return snapped;
}

export function findFreePillOffset(
  anchorX: number,
  anchorY: number,
  items: Item[],
  otherPills: { x: number; y: number }[],
  pillW = 96,
  pillH = 28,
): { dx: number; dy: number } {
  const cardRects = items.map(cardRect);
  const pillRects = otherPills.map((p) => pillRect(p.x, p.y, pillW, pillH));
  const baseDist = 56;
  const distStep = 24;

  const tryOffset = (dx: number, dy: number) => {
    const cx = anchorX + dx;
    const cy = anchorY + dy;
    const r = pillRect(cx, cy, pillW, pillH);
    if (cardRects.some((c) => rectsOverlap(r, c, 8))) return false;
    if (pillRects.some((p) => rectsOverlap(r, p, 8))) return false;
    return true;
  };

  const perpendicularAngles = [Math.PI / 2, -Math.PI / 2];
  for (const angle of perpendicularAngles) {
    for (let dist = baseDist; dist <= baseDist + distStep * 4; dist += distStep) {
      const dx = Math.round(Math.cos(angle) * dist);
      const dy = Math.round(Math.sin(angle) * dist);
      if (tryOffset(dx, dy)) return { dx, dy };
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    for (let dist = baseDist; dist <= baseDist + distStep * 4; dist += distStep) {
      const dx = Math.round(Math.cos(angle) * dist);
      const dy = Math.round(Math.sin(angle) * dist);
      if (tryOffset(dx, dy)) return { dx, dy };
    }
  }

  return { dx: 60, dy: -40 };
}

export function nudgeCardToFree(
  item: Item,
  items: Item[],
): { x: number; y: number } {
  return findFreeCardPosition(item.posX, item.posY, items, item.id);
}

export function nudgePillToFree(
  anchorX: number,
  anchorY: number,
  currentDx: number,
  currentDy: number,
  items: Item[],
  otherPills: { x: number; y: number }[],
  pillW = 96,
  pillH = 28,
): { dx: number; dy: number } {
  const cx = anchorX + currentDx;
  const cy = anchorY + currentDy;
  const r = pillRect(cx, cy, pillW, pillH);
  const cardRects = items.map(cardRect);
  const pillRects = otherPills.map((p) => pillRect(p.x, p.y, pillW, pillH));
  const overlapsCard = cardRects.some((c) => rectsOverlap(r, c, 8));
  const overlapsPill = pillRects.some((p) => rectsOverlap(r, p, 8));
  if (!overlapsCard && !overlapsPill) return { dx: currentDx, dy: currentDy };
  return findFreePillOffset(anchorX, anchorY, items, otherPills, pillW, pillH);
}

import dagre from "dagre";

export function tidyLayout(items: Item[], connections: Connection[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 56, edgesep: 32, ranksep: 96, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const item of items) {
    g.setNode(item.id, { width: CARD_W, height: item.height ?? CARD_DEFAULT_H });
  }
  for (const conn of connections) {
    if (items.some((it) => it.id === conn.sourceId) && items.some((it) => it.id === conn.targetId)) {
      g.setEdge(conn.sourceId, conn.targetId);
    }
  }
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    positions.set(nodeId, {
      x: Math.round((node.x - node.width / 2) / GRID) * GRID,
      y: Math.round((node.y - node.height / 2) / GRID) * GRID,
    });
  });
  return positions;
}
