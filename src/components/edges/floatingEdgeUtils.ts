import { Position, type InternalNode } from "@xyflow/react";

export type EdgeParams = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
};

function getNodeCenter(node: InternalNode) {
  return {
    x: node.internals.positionAbsolute.x + node.measured.width! / 2,
    y: node.internals.positionAbsolute.y + node.measured.height! / 2,
  };
}

function getIntersection(
  intersectionNode: InternalNode,
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const { width = 0, height = 0 } = intersectionNode.measured;
  const center = getNodeCenter(intersectionNode);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const w = width / 2;
  const h = height / 2;
  const t = Math.min(
    Math.abs(w / (dx || 0.00001)),
    Math.abs(h / (dy || 0.00001)),
  );
  return { x: center.x + dx * t, y: center.y + dy * t };
}

function getPosition({ x, y }: { x: number; y: number }, node: InternalNode): Position {
  const center = getNodeCenter(node);
  const dx = x - center.x;
  const dy = y - center.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Position.Right : Position.Left;
  return dy > 0 ? Position.Bottom : Position.Top;
}

export function getEdgeParams(sourceNode: InternalNode, targetNode: InternalNode): EdgeParams {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const source = getIntersection(sourceNode, sourceCenter, targetCenter);
  const target = getIntersection(targetNode, targetCenter, sourceCenter);
  return {
    sx: source.x,
    sy: source.y,
    tx: target.x,
    ty: target.y,
    sourcePos: getPosition(source, sourceNode),
    targetPos: getPosition(target, targetNode),
  };
}
