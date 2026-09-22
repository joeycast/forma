import type { Point, PortCounts } from './document';
import type { Box } from './scene';
import type { PortSide } from './styles';
const round = (n: number) => Math.round(n * 100) / 100;
export const quantize = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });
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
  // Slab intersection, excluding touches along the box border.
  let low = 0,
    high = 1;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, box.x + 0.01, box.x + box.width - 0.01],
    [a.y, b.y - a.y, box.y + 0.01, box.y + box.height - 0.01],
  ]) {
    if (!delta) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const one = (min - origin) / delta,
      two = (max - origin) / delta;
    low = Math.max(low, Math.min(one, two));
    high = Math.min(high, Math.max(one, two));
    if (low > high) return false;
  }
  return low < high;
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
/** Slide one orthogonal segment, keeping both ends attached to their ports. */
export function slideOrthogonalSegment(points: Point[], segment: number, value: number): Point[] {
  if (points.length < 2 || segment < 0 || segment >= points.length - 1) return points;
  const start = points[segment],
    end = points[segment + 1];
  const horizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
  const next = points.map((p) => ({ ...p }));
  const shift = (index: number) => {
    next[index] = horizontal ? { ...next[index], y: value } : { ...next[index], x: value };
  };
  shift(segment);
  shift(segment + 1);
  if (segment === 0) {
    const port = points[0],
      moved = next[1];
    next[0] = { ...port };
    next.splice(1, 0, horizontal ? { x: port.x, y: moved.y } : { x: moved.x, y: port.y });
  }
  if (segment + 1 === points.length - 1) {
    const port = points[points.length - 1],
      at = next.length - 1,
      moved = next[at - 1];
    next[at] = { ...port };
    next.splice(at, 0, horizontal ? { x: port.x, y: moved.y } : { x: moved.x, y: port.y });
  }
  return simplify(next);
}
/** Closest connection point on a shape to an existing line end. */
export function nearestPort(box: Box, ports: PortCounts | undefined, point: Point) {
  let best: { side: PortSide; index: number; distance: number } | undefined;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const count = ports?.[side] ?? 1;
    for (let index = 0; index < count; index++) {
      const candidate = portPoint(box, side, index, count);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (!best || distance < best.distance) best = { side, index, distance };
    }
  }
  return best ?? { side: 'right' as PortSide, index: 0, distance: 0 };
}
export function centerPortIndex(count: number) {
  return Math.floor((Math.max(1, count) - 1) / 2);
}
/** Evenly spaced. One point sits on the middle of the side; extra points spread toward the corners. */
export function portPoint(box: Box, side: PortSide, index: number, count: number): Point {
  const n = Math.max(1, count);
  const i = Math.min(Math.max(0, index), n - 1);
  const t = (i + 1) / (n + 1);
  if (side === 'top') return quantize({ x: box.x + box.width * t, y: box.y });
  if (side === 'bottom') return quantize({ x: box.x + box.width * t, y: box.y + box.height });
  if (side === 'left') return quantize({ x: box.x, y: box.y + box.height * t });
  return quantize({ x: box.x + box.width, y: box.y + box.height * t });
}
export function attachmentPoint(
  box: Box,
  ports: PortCounts | undefined,
  side: PortSide | undefined,
  index: number | undefined,
  fallback: PortSide,
) {
  const chosen = side ?? fallback;
  const count = ports?.[chosen] ?? 1;
  const resolved = Math.min(index ?? centerPortIndex(count), count - 1);
  return { side: chosen, index: resolved, count, point: portPoint(box, chosen, resolved, count) };
}
export function exitVector(side: PortSide, distance = 20): Point {
  if (side === 'left') return { x: -distance, y: 0 };
  if (side === 'right') return { x: distance, y: 0 };
  if (side === 'top') return { x: 0, y: -distance };
  return { x: 0, y: distance };
}
const aligned = (a: number, b: number) => Math.abs(a - b) < 0.51;
export function isOrthogonal(points: Point[]) {
  return points.every(
    (p, i) => !i || aligned(p.x, points[i - 1].x) || aligned(p.y, points[i - 1].y),
  );
}
/** One elbow. An exit side keeps the first leg on that axis. */
export function elbow(a: Point, b: Point, fromSide?: PortSide): Point {
  const horizontalFirst = { x: b.x, y: a.y };
  if (fromSide === 'left' || fromSide === 'right') return horizontalFirst;
  if (fromSide === 'top' || fromSide === 'bottom') return { x: a.x, y: b.y };
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? horizontalFirst : { x: a.x, y: b.y };
}
/** Orthogonal polyline through absolute waypoints. Endpoints stay on the chosen ports. */
export function routeThrough(
  source: Point,
  waypoints: Point[],
  target: Point,
  sourceSide: PortSide,
  targetSide: PortSide,
): Point[] {
  const points: Point[] = [quantize(source)];
  const pushOrtho = (stop: Point, fromSide?: PortSide) => {
    const prev = points[points.length - 1],
      next = quantize(stop);
    if (aligned(prev.x, next.x) || aligned(prev.y, next.y)) {
      points.push(next);
      return;
    }
    points.push(quantize(elbow(prev, next, fromSide)), next);
  };
  const out = exitVector(sourceSide, 20);
  const first = waypoints[0];
  const leaves =
    !!first &&
    ((sourceSide === 'right' && first.x > source.x + 1 && aligned(first.y, source.y)) ||
      (sourceSide === 'left' && first.x < source.x - 1 && aligned(first.y, source.y)) ||
      (sourceSide === 'bottom' && first.y > source.y + 1 && aligned(first.x, source.x)) ||
      (sourceSide === 'top' && first.y < source.y - 1 && aligned(first.x, source.x)));
  if (!leaves) pushOrtho({ x: source.x + out.x, y: source.y + out.y }, sourceSide);
  for (const stop of waypoints) pushOrtho(stop);
  const into = exitVector(targetSide, 20);
  pushOrtho({ x: target.x + into.x, y: target.y + into.y });
  pushOrtho(target);
  return simplify(points);
}
/**
 * Slide only the segments that already leave and enter on the requested sides.
 * Returns null when keeping those bends would reverse a port or break orthogonality.
 */
export function retargetRoute(
  points: Point[],
  source: Point,
  target: Point,
  sourceSide: PortSide,
  targetSide: PortSide,
): Point[] | null {
  const base = simplify(points.map((p) => ({ ...p })));
  if (base.length < 4) return null;
  const horizontalExit = sourceSide === 'left' || sourceSide === 'right';
  const firstHorizontal = aligned(base[0].y, base[1].y);
  if (horizontalExit !== firstHorizontal) return null;
  const last = base.length - 1;
  const horizontalEntry = targetSide === 'left' || targetSide === 'right';
  const lastHorizontal = aligned(base[last].y, base[last - 1].y);
  if (horizontalEntry !== lastHorizontal) return null;
  const next = base.map((p) => ({ ...p }));
  next[0] = quantize(source);
  next[1] = firstHorizontal ? { x: next[1].x, y: next[0].y } : { x: next[0].x, y: next[1].y };
  next[last] = quantize(target);
  next[last - 1] = lastHorizontal
    ? { x: next[last - 1].x, y: next[last].y }
    : { x: next[last].x, y: next[last - 1].y };
  const dx = next[1].x - next[0].x,
    dy = next[1].y - next[0].y;
  const backward =
    (sourceSide === 'right' && dx < -0.5) ||
    (sourceSide === 'left' && dx > 0.5) ||
    (sourceSide === 'bottom' && dy < -0.5) ||
    (sourceSide === 'top' && dy > 0.5);
  const tdx = next[last].x - next[last - 1].x,
    tdy = next[last].y - next[last - 1].y;
  const arriveBad =
    (targetSide === 'left' && tdx < -0.5) ||
    (targetSide === 'right' && tdx > 0.5) ||
    (targetSide === 'top' && tdy < -0.5) ||
    (targetSide === 'bottom' && tdy > 0.5);
  const simplified = simplify(next);
  if (backward || arriveBad || !isOrthogonal(simplified)) return null;
  return simplified;
}
export function routesCross(a: Point[], b: Point[]) {
  for (let s = 1; s < a.length; s++)
    for (let t = 1; t < b.length; t++)
      if (segmentCross(a[s - 1], a[s], b[t - 1], b[t])) return true;
  return false;
}
export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** Insert a corner on the closest segment. Anchors include the port endpoints; the result does not. */
export function insertWaypoint(anchors: Point[], point: Point): Point[] {
  let best = 1,
    bestDist = Infinity;
  for (let i = 1; i < anchors.length; i++) {
    const dist = pointSegmentDistance(point, anchors[i - 1], anchors[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  const next = anchors.map((p) => ({ ...p }));
  next.splice(best, 0, quantize(point));
  return next.slice(1, -1);
}
export function departSide(from: Point, toward: Point): PortSide {
  const dx = toward.x - from.x,
    dy = toward.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}
export function arriveSide(from: Point, at: Point): PortSide {
  const dx = at.x - from.x,
    dy = at.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
  return dy >= 0 ? 'top' : 'bottom';
}
/** Which side an endpoint sits on. A hint point is the next bend, used to break corner ties. */
/** Orthogonal visibility-grid Dijkstra. Crossing an occupied route is expensive; sharing a line is free. */
export function routeBetween(
  source: Box,
  target: Box,
  obstacles: Box[],
  down: boolean,
  self = false,
  sourcePort?: PortSide,
  targetPort?: PortSide,
  sourceIndex?: number,
  targetIndex?: number,
  sourceCount = 1,
  targetCount = 1,
  peers: Point[][] = [],
): Point[] {
  if (self)
    return [
      { x: source.x + source.width, y: source.y + source.height * 0.65 },
      { x: source.x + source.width + 40, y: source.y + source.height * 0.65 },
      { x: source.x + source.width + 40, y: source.y - 28 },
      { x: source.x + source.width * 0.6, y: source.y - 28 },
      { x: source.x + source.width * 0.6, y: source.y },
    ];
  const startSide = sourcePort ?? (down ? 'bottom' : 'right'),
    endSide = targetPort ?? (down ? 'top' : 'left');
  const a = portPoint(source, startSide, sourceIndex ?? centerPortIndex(sourceCount), sourceCount),
    b = portPoint(target, endSide, targetIndex ?? centerPortIndex(targetCount), targetCount);
  const stub = (point: Point, side: string) => ({
    x: point.x + (side === 'left' ? -20 : side === 'right' ? 20 : 0),
    y: point.y + (side === 'top' ? -20 : side === 'bottom' ? 20 : 0),
  });
  const start = stub(a, startSide),
    end = stub(b, endSide);
  const boxes = obstacles.map((o) => ({
    x: o.x - 12,
    y: o.y - 12,
    width: o.width + 24,
    height: o.height + 24,
  }));
  const peerPoints = peers.flat();
  const xs = [
    ...new Set(
      [
        start.x,
        end.x,
        ...boxes.flatMap((o) => [o.x, o.x + o.width]),
        ...peerPoints.map((p) => p.x),
      ].map(round),
    ),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set(
      [
        start.y,
        end.y,
        ...boxes.flatMap((o) => [o.y, o.y + o.height]),
        ...peerPoints.map((p) => p.y),
      ].map(round),
    ),
  ].sort((a, b) => a - b);
  const width = xs.length,
    count = width * ys.length;
  const startIndex = ys.indexOf(round(start.y)) * width + xs.indexOf(round(start.x)),
    endIndex = ys.indexOf(round(end.y)) * width + xs.indexOf(round(end.x));
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
      let penalty = 0;
      for (const route of peers) {
        for (let i = 1; i < route.length; i++)
          if (segmentCross(p, q, route[i - 1], route[i])) {
            penalty += 900;
            break;
          }
        if (penalty >= 900) break;
      }
      const next = (ny * width + nx) * 2 + nextDir,
        cost =
          distance +
          Math.abs(p.x - q.x) +
          Math.abs(p.y - q.y) +
          (dir === nextDir ? 0 : 24) +
          penalty;
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

/** Ray from shape center to an exterior point, used for direct connectors. */
export function shapeBoundary(box: Box, toward: Point, shape = 'rect'): Point {
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2,
    dx = toward.x - x,
    dy = toward.y - y;
  if (!dx && !dy) return { x: box.x + box.width, y };
  const nx = Math.abs(dx) / (box.width / 2),
    ny = Math.abs(dy) / (box.height / 2);
  const scale =
    shape === 'ellipse'
      ? 1 / Math.hypot(nx, ny)
      : shape === 'diamond'
        ? 1 / (nx + ny)
        : 1 / Math.max(nx, ny);
  return { x: x + dx * scale, y: y + dy * scale };
}
