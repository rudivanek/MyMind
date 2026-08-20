import type { Item } from "@/types";
import { CARD_DEFAULT_W, CARD_DEFAULT_H } from "@/lib/layout";

export type AlignMode = "left" | "right" | "top" | "bottom" | "center-h" | "center-v";
export type DistributeAxis = "horizontal" | "vertical";

function itemWidth(item: Item): number {
  return item.width ?? CARD_DEFAULT_W;
}

function itemHeight(item: Item): number {
  return item.height ?? CARD_DEFAULT_H;
}

export function alignItems(
  items: Item[],
  mode: AlignMode,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (items.length < 2) return positions;

  if (mode === "left") {
    const minX = Math.min(...items.map((item) => item.posX));
    for (const item of items) {
      if (item.posX !== minX) positions.set(item.id, { x: minX, y: item.posY });
    }
  } else if (mode === "right") {
    const maxRight = Math.max(...items.map((item) => item.posX + itemWidth(item)));
    for (const item of items) {
      const newX = maxRight - itemWidth(item);
      if (item.posX !== newX) positions.set(item.id, { x: newX, y: item.posY });
    }
  } else if (mode === "top") {
    const minY = Math.min(...items.map((item) => item.posY));
    for (const item of items) {
      if (item.posY !== minY) positions.set(item.id, { x: item.posX, y: minY });
    }
  } else if (mode === "bottom") {
    const maxBottom = Math.max(...items.map((item) => item.posY + itemHeight(item)));
    for (const item of items) {
      const newY = maxBottom - itemHeight(item);
      if (item.posY !== newY) positions.set(item.id, { x: item.posX, y: newY });
    }
  } else if (mode === "center-h") {
    const meanCenter = items.reduce((sum, item) => sum + item.posX + itemWidth(item) / 2, 0) / items.length;
    for (const item of items) {
      const newX = Math.round(meanCenter - itemWidth(item) / 2);
      if (item.posX !== newX) positions.set(item.id, { x: newX, y: item.posY });
    }
  } else if (mode === "center-v") {
    const meanCenter = items.reduce((sum, item) => sum + item.posY + itemHeight(item) / 2, 0) / items.length;
    for (const item of items) {
      const newY = Math.round(meanCenter - itemHeight(item) / 2);
      if (item.posY !== newY) positions.set(item.id, { x: item.posX, y: newY });
    }
  }

  return positions;
}

export function distributeItems(
  items: Item[],
  axis: DistributeAxis,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (items.length < 3) return positions;

  const horizontal = axis === "horizontal";
  const sorted = [...items].sort((a, b) =>
    horizontal ? a.posX - b.posX : a.posY - b.posY,
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const size = (item: Item) => (horizontal ? itemWidth(item) : itemHeight(item));
  const pos = (item: Item) => (horizontal ? item.posX : item.posY);

  const firstEdge = pos(first);
  const lastEdge = pos(last) + size(last);
  const totalSize = sorted.reduce((sum, item) => sum + size(item), 0);
  const totalGap = lastEdge - firstEdge - totalSize;
  const gap = totalGap / (sorted.length - 1);

  let cursor = firstEdge + size(first);
  for (let i = 1; i < sorted.length - 1; i++) {
    const item = sorted[i];
    const newPos = cursor + gap;
    if (horizontal) {
      if (item.posX !== newPos) positions.set(item.id, { x: newPos, y: item.posY });
    } else {
      if (item.posY !== newPos) positions.set(item.id, { x: item.posX, y: newPos });
    }
    cursor = newPos + size(item);
  }

  return positions;
}
