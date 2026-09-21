import type { Point } from './document';
import type { Box, SceneNode } from './scene';
import { overlaps } from './geometry';

export const alignEdges = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const;
export type AlignEdge = (typeof alignEdges)[number];
export const distributeAxes = ['horizontal', 'vertical'] as const;
export type DistributeAxis = (typeof distributeAxes)[number];
export const NEAR_ALIGN_PX = 8;

const round = (value: number) => Math.round(value * 100) / 100;
const horizontal = (edge: AlignEdge) => edge === 'left' || edge === 'center' || edge === 'right';

export function edgeValue(box: Box, edge: AlignEdge) {
  if (edge === 'left') return box.x;
  if (edge === 'center') return box.x + box.width / 2;
  if (edge === 'right') return box.x + box.width;
  if (edge === 'top') return box.y;
  if (edge === 'middle') return box.y + box.height / 2;
  return box.y + box.height;
}

export function placeBox(box: Box, edge: AlignEdge, value: number): Point {
  if (edge === 'left') return { x: round(value), y: round(box.y) };
  if (edge === 'center') return { x: round(value - box.width / 2), y: round(box.y) };
  if (edge === 'right') return { x: round(value - box.width), y: round(box.y) };
  if (edge === 'top') return { x: round(box.x), y: round(value) };
  if (edge === 'middle') return { x: round(box.x), y: round(value - box.height / 2) };
  return { x: round(box.x), y: round(value - box.height) };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 - 0.5 && b0 < a1 - 0.5;
}

function columnPair(a: Box, b: Box) {
  const yOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const xOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
  const centerGap = Math.abs(a.x + a.width / 2 - (b.x + b.width / 2));
  return !yOverlap && (xOverlap || centerGap < Math.max(a.width, b.width));
}

function rowPair(a: Box, b: Box) {
  const yOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const xOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
  const centerGap = Math.abs(a.y + a.height / 2 - (b.y + b.height / 2));
  return !xOverlap && (yOverlap || centerGap < Math.max(a.height, b.height));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function alignmentTarget(boxes: Box[], edge: AlignEdge) {
  if (edge === 'left') return Math.min(...boxes.map((b) => b.x));
  if (edge === 'right') return Math.max(...boxes.map((b) => b.x + b.width));
  if (edge === 'top') return Math.min(...boxes.map((b) => b.y));
  if (edge === 'bottom') return Math.max(...boxes.map((b) => b.y + b.height));
  if (edge === 'center') {
    const min = Math.min(...boxes.map((b) => b.x));
    const max = Math.max(...boxes.map((b) => b.x + b.width));
    return (min + max) / 2;
  }
  const min = Math.min(...boxes.map((b) => b.y));
  const max = Math.max(...boxes.map((b) => b.y + b.height));
  return (min + max) / 2;
}

export interface AlignmentCluster {
  edge: AlignEdge;
  ids: string[];
  target: number;
  delta: number;
}

export function nearAlignmentClusters(nodes: SceneNode[]): AlignmentCluster[] {
  const found: AlignmentCluster[] = [];
  for (const edge of alignEdges) {
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    const unite = (i: number, j: number) => {
      i = find(i);
      j = find(j);
      if (i !== j) parent[i] = j;
    };
    const related = (a: SceneNode, b: SceneNode) =>
      !overlaps(a, b) && (horizontal(edge) ? columnPair(a, b) : rowPair(a, b));
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const gap = Math.abs(edgeValue(nodes[i]!, edge) - edgeValue(nodes[j]!, edge));
        if (gap >= 1 && gap <= NEAR_ALIGN_PX && related(nodes[i]!, nodes[j]!)) unite(i, j);
      }
    const groups = new Map<number, SceneNode[]>();
    for (const [i, node] of nodes.entries()) {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), node]);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const values = members.map((n) => edgeValue(n, edge));
      const delta = round(Math.max(...values) - Math.min(...values));
      if (delta < 1 || delta > NEAR_ALIGN_PX) continue;
      const sizes = members.map((n) => (horizontal(edge) ? n.width : n.height));
      const centers = members.map((n) =>
        horizontal(edge) ? n.x + n.width / 2 : n.y + n.height / 2,
      );
      const centerSpan = Math.max(...centers) - Math.min(...centers);
      const sizeDiff = Math.max(...sizes) - Math.min(...sizes);
      const allowed =
        edge === 'top' || edge === 'bottom'
          ? NEAR_ALIGN_PX
          : edge === 'left' || edge === 'right'
            ? NEAR_ALIGN_PX + sizeDiff / 2
            : Infinity;
      if (centerSpan > allowed + 0.01) continue;
      const pinned = members.filter((n) => n.pinned);
      if (!pinned.length) continue;
      found.push({
        edge,
        ids: members.map((n) => n.id),
        target: round(
          pinned.length ? median(pinned.map((n) => edgeValue(n, edge))) : median(values),
        ),
        delta,
      });
    }
  }
  return found;
}

const edgePreference = (edge: AlignEdge) =>
  edge === 'center' || edge === 'middle' ? 2 : edge === 'left' || edge === 'top' ? 1 : 0;

export function selectedAlignmentClusters(nodes: SceneNode[]) {
  const assignedX = new Set<string>(),
    assignedY = new Set<string>(),
    chosen: AlignmentCluster[] = [];
  const ranked = [...nearAlignmentClusters(nodes)].sort(
    (a, b) =>
      b.ids.length - a.ids.length ||
      a.delta - b.delta ||
      edgePreference(b.edge) - edgePreference(a.edge),
  );
  for (const cluster of ranked) {
    const xAxis = horizontal(cluster.edge);
    const used = xAxis ? assignedX : assignedY;
    const ids = cluster.ids.filter((id) => !used.has(id));
    if (ids.length < 2) continue;
    chosen.push({ ...cluster, ids });
    for (const id of ids) used.add(id);
  }
  return chosen;
}

export function alignNodes(nodes: SceneNode[], ids: string[], edge: AlignEdge) {
  const boxes = ids.map((id) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  });
  if (boxes.length < 2) throw new Error('Alignment needs at least two components.');
  const target = round(alignmentTarget(boxes, edge));
  return boxes.map((node) => ({ id: node.id, position: placeBox(node, edge, target) }));
}

export function distributeNodes(nodes: SceneNode[], ids: string[], axis: DistributeAxis) {
  const boxes = ids.map((id) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  });
  if (boxes.length < 3) throw new Error('Distribution needs at least three components.');
  const vertical = axis === 'vertical';
  const sorted = [...boxes].sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
  const start = vertical ? sorted[0]!.y : sorted[0]!.x;
  const end = vertical
    ? sorted.at(-1)!.y + sorted.at(-1)!.height
    : sorted.at(-1)!.x + sorted.at(-1)!.width;
  const total = sorted.reduce((sum, n) => sum + (vertical ? n.height : n.width), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  let cursor = start;
  return sorted.map((node) => {
    const position = vertical
      ? { x: round(node.x), y: round(cursor) }
      : { x: round(cursor), y: round(node.y) };
    cursor += (vertical ? node.height : node.width) + gap;
    return { id: node.id, position };
  });
}

export function snapUnpinned(nodes: SceneNode[]) {
  for (const cluster of selectedAlignmentClusters(nodes)) {
    for (const id of cluster.ids) {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.pinned) continue;
      Object.assign(node, placeBox(node, cluster.edge, cluster.target));
    }
  }
}

export function mergeAlignmentPins(
  nodes: SceneNode[],
  operations: { ids: string[]; edge: AlignEdge }[],
) {
  const positions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  for (const operation of operations) {
    for (const move of alignNodes(nodes, operation.ids, operation.edge)) {
      const current = positions.get(move.id)!;
      const xAxis = horizontal(operation.edge);
      positions.set(move.id, {
        x: xAxis ? move.position.x : current.x,
        y: xAxis ? current.y : move.position.y,
      });
    }
  }
  return [...positions]
    .filter(([id, position]) => {
      const node = nodes.find((n) => n.id === id)!;
      return node.x !== position.x || node.y !== position.y;
    })
    .map(([id, position]) => ({ id, position }));
}

export function nudgeNodes(
  nodes: SceneNode[],
  ids: string[],
  delta: Point,
): { id: string; position: Point }[] {
  return ids.flatMap((id) => {
    const node = nodes.find((n) => n.id === id);
    return node
      ? [{ id, position: { x: round(node.x + delta.x), y: round(node.y + delta.y) } }]
      : [];
  });
}
