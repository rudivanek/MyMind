import dagre from "dagre";
import type { Item, Connection } from "@/types";
import { CARD_DEFAULT_W, CARD_DEFAULT_H } from "@/lib/layout";

export function arrangeItems(items: Item[], connections: Connection[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 96, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const idSet = new Set(items.map((item) => item.id));

  for (const item of items) {
    const width = item.width ?? CARD_DEFAULT_W;
    const height = item.height ?? CARD_DEFAULT_H;
    g.setNode(item.id, { width, height });
  }

  for (const conn of connections) {
    if (idSet.has(conn.sourceId) && idSet.has(conn.targetId)) {
      g.setEdge(conn.sourceId, conn.targetId);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId);
    positions.set(nodeId, {
      x: Math.round(node.x - node.width / 2),
      y: Math.round(node.y - node.height / 2),
    });
  });

  return positions;
}
