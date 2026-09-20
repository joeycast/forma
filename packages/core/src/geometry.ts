import type { Point } from './document';
import type { Box } from './scene';
export function overlaps(a: Box, b: Box, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
export function inside(p: Point, b: Box) {
  return p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;
}
export function segmentHitsBox(a: Point, b: Point, box: Box) {
  if (a.x === b.x)
    return (
      a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    );
  if (a.y === b.y)
    return (
      a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width
    );
  return false;
}
export function segmentCross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;
  const r = { x: b.x - a.x, y: b.y - a.y },
    s = { x: d.x - c.x, y: d.y - c.y };
  const det = cross(r, s);
  if (!det) return null;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(q, s) / det,
    u = cross(q, r) / det;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999
    ? { x: a.x + t * r.x, y: a.y + t * r.y }
    : null;
}
export function simplify(points: Point[]): Point[] {
  return points.filter((p, i) => {
    const a = points[i - 1],
      b = points[i + 1];
    if (a && a.x === p.x && a.y === p.y) return false;
    return !a || !b || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}
export function polylinePath(points: Point[], radius = 8): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      p = points[i],
      b = points[i + 1];
    const d1 = Math.hypot(p.x - a.x, p.y - a.y),
      d2 = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (!d1 || !d2) continue;
    path += ` L ${p.x + ((a.x - p.x) * r) / d1} ${p.y + ((a.y - p.y) * r) / d1} Q ${p.x} ${p.y} ${p.x + ((b.x - p.x) * r) / d2} ${p.y + ((b.y - p.y) * r) / d2}`;
  }
  return path + ` L ${points.at(-1)!.x} ${points.at(-1)!.y}`;
}
/** Orthogonal visibility-grid Dijkstra. Used when a human pin invalidates ELK routes. */
export function routeBetween(
  source: Box,
  target: Box,
  obstacles: Box[],
  down: boolean,
  self = false,
): Point[] {
  if (self)
    return [
      { x: source.x + source.width, y: source.y + source.height * 0.65 },
      { x: source.x + source.width + 40, y: source.y + source.height * 0.65 },
      { x: source.x + source.width + 40, y: source.y - 28 },
      { x: source.x + source.width * 0.6, y: source.y - 28 },
      { x: source.x + source.width * 0.6, y: source.y },
    ];
  const a = down
    ? { x: source.x + source.width / 2, y: source.y + source.height }
    : { x: source.x + source.width, y: source.y + source.height / 2 };
  const b = down
    ? { x: target.x + target.width / 2, y: target.y }
    : { x: target.x, y: target.y + target.height / 2 };
  const start = { x: a.x + (down ? 0 : 20), y: a.y + (down ? 20 : 0) };
  const end = { x: b.x - (down ? 0 : 20), y: b.y - (down ? 20 : 0) };
  const boxes = obstacles.map((o) => ({
    x: o.x - 12,
    y: o.y - 12,
    width: o.width + 24,
    height: o.height + 24,
  }));
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap((o) => [o.x, o.x + o.width])])].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap((o) => [o.y, o.y + o.height])])].sort(
    (a, b) => a - b,
  );
  const width = xs.length,
    count = width * ys.length;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x),
    endIndex = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const distances = new Float64Array(count * 2).fill(Infinity),
    previous = new Int32Array(count * 2).fill(-1);
  const visited = new Uint8Array(count * 2);
  // Small binary heap keeps routing practical on medium diagrams.
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= item[0]) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const root = heap[0],
      tail = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
        if (heap[c][0] >= tail[0]) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = tail;
    }
    return root;
  };
  distances[startIndex * 2] = 0;
  distances[startIndex * 2 + 1] = 0;
  push([0, startIndex * 2]);
  push([0, startIndex * 2 + 1]);
  let finish = -1;
  while (heap.length) {
    const [distance, state] = pop();
    if (visited[state]) continue;
    visited[state] = 1;
    const index = state >> 1,
      dir = state % 2,
      x = index % width,
      y = Math.floor(index / width);
    if (index === endIndex) {
      finish = state;
      break;
    }
    for (const [dx, dy, nextDir] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 1],
      [0, -1, 1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= ys.length) continue;
      const p = { x: xs[x], y: ys[y] },
        q = { x: xs[nx], y: ys[ny] };
      if (boxes.some((o) => inside(q, o) || segmentHitsBox(p, q, o))) continue;
      const next = (ny * width + nx) * 2 + nextDir,
        cost = distance + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + (dir === nextDir ? 0 : 24);
      if (cost < distances[next]) {
        distances[next] = cost;
        previous[next] = state;
        push([cost, next]);
      }
    }
  }
  if (finish < 0) return simplify([a, start, { x: start.x, y: end.y }, end, b]); // Inspector reports impossible pinned routes.
  const path: Point[] = [];
  for (let s = finish; s !== -1; s = previous[s]) {
    const i = s >> 1;
    path.push({ x: xs[i % width], y: ys[Math.floor(i / width)] });
  }
  return simplify([a, ...path.reverse(), b]);
}
