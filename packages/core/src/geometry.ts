import type { Point, PortCounts } from './document';
import type { Box } from './scene';
import type { PortSide } from './styles';
import { SHAPE_REGISTRY, type ShapeName } from './shapes';
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
  const unique: Point[] = [];
  for (const point of points) {
    const p = quantize(point);
    const last = unique.at(-1);
    if (!last || last.x !== p.x || last.y !== p.y) unique.push(p);
  }
  // Remove a middle point only when the path continues in the same direction.
  // A collinear reversal is an intentional U-turn and must remain visible.
  return unique.filter((p, i) => {
    const a = unique[i - 1],
      b = unique[i + 1];
    if (!a || !b) return true;
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    const dot = (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y);
    return Math.abs(cross) > 0.01 || dot < 0;
  });
}
export function samePoints(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}
/** Keep the dragged channel's two constraints and unaffected prior absolute waypoints. */
export function segmentWaypoints(
  original: Point[],
  moved: Point[],
  segment: number,
  intent: Point[],
  previous: Point[] = [],
): Point[] {
  if (original.length < 2 || moved.length < 2 || segment < 0 || segment >= original.length - 1)
    return previous.map((p) => ({ ...p }));
  const oldStart = original[segment],
    oldEnd = original[segment + 1];
  const retained = previous.filter((point) => pointSegmentDistance(point, oldStart, oldEnd) > 0.51);
  const order = (route: Point[], point: Point) => {
    let best = { distance: Infinity, position: 0 },
      walked = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy),
        t = len
          ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (len * len)))
          : 0;
      const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
      if (distance < best.distance) best = { distance, position: walked + t * len };
      walked += len;
    }
    return best.position;
  };
  const combined = [...retained, ...intent].map((point, index) => ({
    point: { ...point },
    order: order(moved, point),
    index,
  }));
  combined.sort((a, b) => a.order - b.order || a.index - b.index);
  const result: Point[] = [];
  for (const item of combined)
    if (!result.some((p) => samePoints([p], [item.point]))) result.push(item.point);
  return result;
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
export function slideOrthogonalSegmentWithIntent(
  points: Point[],
  segment: number,
  value: number,
): { points: Point[]; intent: Point[] } {
  if (points.length < 2 || segment < 0 || segment >= points.length - 1)
    return { points, intent: [] };
  const start = points[segment],
    end = points[segment + 1];
  const horizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
  const next = points.map((p) => ({ ...p }));
  const shift = (index: number) => {
    next[index] = horizontal ? { ...next[index], y: value } : { ...next[index], x: value };
  };
  shift(segment);
  shift(segment + 1);
  let intent: Point[];
  if (segment === 0) {
    const port = points[0],
      moved = next[1];
    next[0] = { ...port };
    next.splice(1, 0, horizontal ? { x: port.x, y: moved.y } : { x: moved.x, y: port.y });
    intent = [next[1], next[2]];
  } else if (segment + 1 === points.length - 1) {
    const port = points[points.length - 1],
      at = next.length - 1,
      moved = next[at - 1];
    next[at] = { ...port };
    next.splice(at, 0, horizontal ? { x: port.x, y: moved.y } : { x: moved.x, y: port.y });
    intent = [next[segment], next[segment + 1]];
  } else {
    intent = [next[segment], next[segment + 1]];
  }
  return { points: simplify(next), intent: intent.map(quantize) };
}
export function slideOrthogonalSegment(points: Point[], segment: number, value: number): Point[] {
  return slideOrthogonalSegmentWithIntent(points, segment, value).points;
}
/** Closest connection point on a shape to an existing line end. */
export function nearestPort(box: Box, ports: PortCounts | undefined, point: Point, shape = 'rect') {
  let best: { side: PortSide; index: number; distance: number } | undefined;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const count = ports?.[side] ?? 1;
    for (let index = 0; index < count; index++) {
      const candidate = portPoint(box, side, index, count, shape);
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
export function portPoint(
  box: Box,
  side: PortSide,
  index: number,
  count: number,
  shape = 'rect',
): Point {
  const n = Math.max(1, count);
  const i = Math.min(Math.max(0, index), n - 1);
  const t = (i + 1) / (n + 1);
  const x = box.x + box.width * t,
    y = box.y + box.height * t;
  if (shape in SHAPE_REGISTRY && SHAPE_REGISTRY[shape as ShapeName].points)
    return shapeBoundary(box, { x, y }, shape);
  if (shape === 'ellipse') {
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    if (side === 'top' || side === 'bottom') {
      const dx = x - cx,
        edge = cy - (box.height / 2) * Math.sqrt(Math.max(0, 1 - (dx * dx) / (box.width / 2) ** 2));
      return quantize({ x, y: side === 'top' ? edge : 2 * cy - edge });
    }
    const dy = y - cy,
      edge = cx - (box.width / 2) * Math.sqrt(Math.max(0, 1 - (dy * dy) / (box.height / 2) ** 2));
    return quantize({ x: side === 'left' ? edge : 2 * cx - edge, y });
  }
  if (shape === 'diamond') {
    const dx = Math.abs(x - (box.x + box.width / 2)),
      dy = Math.abs(y - (box.y + box.height / 2));
    if (side === 'top' || side === 'bottom')
      return quantize({
        x,
        y:
          side === 'top'
            ? box.y + (box.height * dx) / box.width
            : box.y + box.height * (1 - dx / box.width),
      });
    return quantize({
      x:
        side === 'left'
          ? box.x + (box.width * dy) / box.height
          : box.x + box.width * (1 - dy / box.height),
      y,
    });
  }
  if (shape === 'pill') {
    const r = Math.min(box.height / 2, box.width / 2);
    if (side === 'left' || side === 'right') {
      const dy = y - (box.y + box.height / 2),
        cx = side === 'left' ? box.x + r : box.x + box.width - r;
      const edge =
        Math.abs(dy) <= r
          ? cx + (side === 'left' ? -1 : 1) * Math.sqrt(Math.max(0, r * r - dy * dy))
          : side === 'left'
            ? box.x
            : box.x + box.width;
      return quantize({ x: edge, y });
    }
    const cx = box.x + box.width / 2,
      dx = x - cx;
    const edge =
      Math.abs(dx) > box.width / 2 - r
        ? box.y + r - Math.sqrt(Math.max(0, r * r - (Math.abs(dx) - (box.width / 2 - r)) ** 2))
        : box.y;
    return quantize({ x, y: side === 'top' ? edge : box.y + box.height - (edge - box.y) });
  }
  if (shape === 'cylinder' && (side === 'top' || side === 'bottom')) {
    // Match the cubic rim used by render.ts (M0 14 C0 -4 w -4 w 14).
    let lo = 0,
      hi = 1,
      target = t;
    for (let n = 0; n < 24; n++) {
      const m = (lo + hi) / 2,
        px = 3 * m * m - 2 * m * m * m;
      if (px < target) lo = m;
      else hi = m;
    }
    const u = (lo + hi) / 2,
      v = 1 - u;
    const rimY = 14 * v ** 3 - 4 * (3 * v * v * u + 3 * v * u * u) + 14 * u ** 3;
    return quantize({ x, y: box.y + (side === 'top' ? rimY : box.height - rimY) });
  }
  if (side === 'top') return quantize({ x, y: box.y });
  if (side === 'bottom') return quantize({ x, y: box.y + box.height });
  if (side === 'left') return quantize({ x: box.x, y });
  return quantize({ x: box.x + box.width, y });
}
export function shapePortPoint(
  box: Box,
  side: PortSide,
  index: number,
  count: number,
  shape: string,
): Point {
  return portPoint(box, side, index, count, shape);
}

export function attachmentPoint(
  box: Box,
  ports: PortCounts | undefined,
  side: PortSide | undefined,
  index: number | undefined,
  fallback: PortSide,
  shape = 'rect',
) {
  const chosen = side ?? fallback;
  const count = ports?.[chosen] ?? 1;
  const resolved = Math.min(index ?? centerPortIndex(count), count - 1);
  return {
    side: chosen,
    index: resolved,
    count,
    point: portPoint(box, chosen, resolved, count, shape),
  };
}
export function exitVector(side: PortSide, distance = 20): Point {
  if (side === 'left') return { x: -distance, y: 0 };
  if (side === 'right') return { x: distance, y: 0 };
  if (side === 'top') return { x: 0, y: -distance };
  return { x: 0, y: distance };
}
const aligned = (a: number, b: number) => Math.abs(a - b) < 0.51;
export function shapeBoundaryPoint(box: Box, toward: Point, shape: string): Point {
  return shapeBoundary(box, toward, shape);
}
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
/** Rebuild a live route with the same routing rule used by committed geometry. */
export function previewRoute(
  points: Point[],
  source: Point,
  target: Point,
  sourceSide: PortSide,
  targetSide: PortSide,
  routing: 'orthogonal' | 'straight' = 'orthogonal',
  waypoints?: Point[],
): Point[] {
  if (waypoints?.length) return routeThrough(source, waypoints, target, sourceSide, targetSide);
  if (routing === 'straight') return simplify([source, target]);
  return (
    retargetRoute(points, source, target, sourceSide, targetSide) ??
    routeThrough(source, points.slice(1, -1), target, sourceSide, targetSide)
  );
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
  const candidate = quantize(point);
  const existing = anchors.slice(1, -1);
  if (existing.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < 0.51))
    return existing.map((p) => ({ ...p }));
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
  next.splice(best, 0, candidate);
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
  options?: {
    maxCoordinates?: number;
    onBudgetExceeded?: () => void;
    sourceShape?: string;
    targetShape?: string;
    workBudget?: { remaining: number };
  },
): Point[] {
  const spendWork = () => {
    if (!options?.workBudget) return true;
    if (options.workBudget.remaining <= 0) return false;
    options.workBudget.remaining--;
    return true;
  };
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
  const a = portPoint(
      source,
      startSide,
      sourceIndex ?? centerPortIndex(sourceCount),
      sourceCount,
      options?.sourceShape,
    ),
    b = portPoint(
      target,
      endSide,
      targetIndex ?? centerPortIndex(targetCount),
      targetCount,
      options?.targetShape,
    );
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
    endpoint:
      o.x === source.x && o.y === source.y && o.width === source.width && o.height === source.height
        ? 'source'
        : o.x === target.x &&
            o.y === target.y &&
            o.width === target.width &&
            o.height === target.height
          ? 'target'
          : undefined,
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
  if (
    options?.maxCoordinates !== undefined &&
    (xs.length > options.maxCoordinates || ys.length > options.maxCoordinates)
  ) {
    options.onBudgetExceeded?.();
    // Keep the obstacle-aware escape search bounded. The two nearest exterior
    // lanes on each axis usually cover the useful alternatives while retaining
    // the endpoint elbows above as always-cheap candidates.
    const exhausted = !!options?.workBudget && options.workBudget.remaining <= 0;
    const laneLimit = Math.max(2, Math.min(exhausted ? 2 : 4, options.maxCoordinates));
    const start = stub(a, startSide),
      end = stub(b, endSide);
    const unique = (values: number[]) => [...new Set(values.map(round))];
    const xLaneCandidates = unique([
      start.x,
      end.x,
      ...boxes.flatMap((o) => [o.x - 1, o.x + o.width + 1]),
    ]).sort(
      (x, y) =>
        Math.min(Math.abs(x - start.x), Math.abs(x - end.x)) -
        Math.min(Math.abs(y - start.x), Math.abs(y - end.x)),
    );
    const yLaneCandidates = unique([
      start.y,
      end.y,
      ...boxes.flatMap((o) => [o.y - 1, o.y + o.height + 1]),
    ]).sort(
      (x, y) =>
        Math.min(Math.abs(x - start.y), Math.abs(x - end.y)) -
        Math.min(Math.abs(y - start.y), Math.abs(y - end.y)),
    );
    // Keep both outer escape channels even when the nearest-lane search is
    // capped. They can clear a dense obstacle cluster that blocks every local lane.
    const xLanes = unique(
      [...xLaneCandidates.slice(0, laneLimit), xLaneCandidates[0], xLaneCandidates.at(-1)].filter(
        (lane): lane is number => lane !== undefined,
      ),
    );
    const yLanes = unique(
      [...yLaneCandidates.slice(0, laneLimit), yLaneCandidates[0], yLaneCandidates.at(-1)].filter(
        (lane): lane is number => lane !== undefined,
      ),
    );
    const candidates: Point[][] = [
      [a, start, end, b],
      [a, start, { x: end.x, y: start.y }, end, b],
      [a, start, { x: start.x, y: end.y }, end, b],
      ...xLanes.map((x) => [a, start, { x, y: start.y }, { x, y: end.y }, end, b]),
      ...yLanes.map((y) => [a, start, { x: start.x, y }, { x: end.x, y }, end, b]),
    ].map(simplify);
    const clear = (route: Point[]) => {
      for (let i = 1; i < route.length; i++) {
        const p = route[i - 1],
          q = route[i];
        spendWork(); // Candidate clearance is always checked, even at the safety boundary.
        if (
          boxes.some((o) => {
            // Ignore only the owning endpoint's expanded box on its outward stub.
            if (i === 1 && o.endpoint === 'source') return false;
            if (i === route.length - 1 && o.endpoint === 'target') return false;
            return inside(q, o) || segmentHitsBox(p, q, o);
          })
        )
          return false;
      }
      return true;
    };
    const score = (route: Point[]) => {
      let length = 0,
        crossings = 0;
      for (let i = 1; i < route.length; i++) {
        const p = route[i - 1],
          q = route[i];
        length += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        for (const peer of peers) {
          spendWork();
          for (let j = 1; j < peer.length; j++)
            if (segmentCross(p, q, peer[j - 1], peer[j])) crossings++;
        }
      }
      return length + crossings * 900;
    };
    let best: Point[] | undefined,
      bestScore = Infinity;
    for (const candidate of candidates) {
      if (!isOrthogonal(candidate) || !clear(candidate)) continue;
      if (options?.workBudget && options.workBudget.remaining <= 0) {
        best ??= candidate;
        break;
      }
      const candidateScore = score(candidate);
      if (candidateScore < bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    if (best) return best;
    return routeThrough(a, [], b, startSide, endSide);
  }
  const width = xs.length,
    count = width * ys.length;
  const startIndex = ys.indexOf(round(start.y)) * width + xs.indexOf(round(start.x)),
    endIndex = ys.indexOf(round(end.y)) * width + xs.indexOf(round(end.x));
  const distances = new Float64Array(count * 2).fill(Infinity),
    previous = new Int32Array(count * 2).fill(-1);
  const visited = new Uint8Array(count * 2);
  // Adjacent visibility-grid cells are considered from both direction states.
  // Cache their obstacle and crossing work so those scans happen only once.
  const horizontalCount = Math.max(0, width - 1) * ys.length;
  const blockedTransitions = new Uint8Array(horizontalCount + width * Math.max(0, ys.length - 1));
  const crossingCosts = new Int16Array(blockedTransitions.length).fill(-1);
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
    if (!spendWork()) {
      finish = -2;
      break;
    }
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
      const transition =
        dx !== 0
          ? y * (width - 1) + Math.min(x, nx)
          : horizontalCount + Math.min(y, ny) * width + x;
      if (blockedTransitions[transition] === 0) {
        if (!spendWork()) {
          finish = -2;
          break;
        }
        let blocked = false;
        for (const obstacle of boxes) {
          if (inside(q, obstacle) || segmentHitsBox(p, q, obstacle)) {
            blocked = true;
            break;
          }
        }
        blockedTransitions[transition] = blocked ? 2 : 1;
      }
      if (blockedTransitions[transition] === 2) continue;
      let penalty = crossingCosts[transition];
      if (penalty < 0) {
        if (!spendWork()) {
          finish = -2;
          break;
        }
        penalty = 0;
        for (const route of peers) {
          for (let i = 1; i < route.length; i++)
            if (segmentCross(p, q, route[i - 1], route[i])) {
              penalty = 900;
              break;
            }
          if (penalty >= 900) break;
        }
        crossingCosts[transition] = penalty;
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
    if (finish === -2) break;
  }
  if (finish === -2) {
    options?.onBudgetExceeded?.();
    return routeBetween(
      source,
      target,
      obstacles,
      down,
      self,
      sourcePort,
      targetPort,
      sourceIndex,
      targetIndex,
      sourceCount,
      targetCount,
      peers,
      {
        maxCoordinates: 1,
        sourceShape: options?.sourceShape,
        targetShape: options?.targetShape,
        workBudget: options?.workBudget,
      },
    );
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
  const definition = shape in SHAPE_REGISTRY ? SHAPE_REGISTRY[shape as ShapeName] : undefined;
  if (definition?.points) {
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2,
      dx = toward.x - cx,
      dy = toward.y - cy,
      outline = definition
        .points(box.width, box.height)
        .map((p) => ({ x: p.x + box.x, y: p.y + box.y }));
    let nearest = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i],
        q = outline[(i + 1) % outline.length],
        sx = q.x - p.x,
        sy = q.y - p.y,
        det = dx * sy - dy * sx;
      if (Math.abs(det) < 1e-9) continue;
      const t = ((p.x - cx) * sy - (p.y - cy) * sx) / det,
        u = ((p.x - cx) * dy - (p.y - cy) * dx) / det;
      if (t >= 0 && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
    }
    if (Number.isFinite(nearest)) return quantize({ x: cx + nearest * dx, y: cy + nearest * dy });
  }
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2,
    dx = toward.x - x,
    dy = toward.y - y;
  if (!dx && !dy) return { x: box.x + box.width, y };
  const nx = Math.abs(dx) / (box.width / 2),
    ny = Math.abs(dy) / (box.height / 2);
  if (shape === 'pill' || shape === 'cylinder') {
    let outline: Point[];
    if (shape === 'pill') {
      const r = Math.min(box.height / 2, box.width / 2),
        steps = 12;
      outline = [];
      for (const [cx, cy, start] of [
        [box.x + box.width - r, box.y + r, -Math.PI / 2],
        [box.x + box.width - r, box.y + box.height - r, 0],
        [box.x + r, box.y + box.height - r, Math.PI / 2],
        [box.x + r, box.y + r, Math.PI],
      ])
        for (let i = 0; i <= steps; i++) {
          const a = start + (i * (Math.PI / 2)) / steps;
          outline.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
    } else {
      const rim = (u: number) => {
        const v = 1 - u;
        return {
          x: box.x + box.width * (3 * u * u - 2 * u * u * u),
          y: box.y + 14 * v ** 3 - 4 * (3 * v * v * u + 3 * v * u * u) + 14 * u ** 3,
        };
      };
      outline = Array.from({ length: 25 }, (_, i) => rim(i / 24));
      outline.push({ x: box.x + box.width, y: box.y + box.height - 14 });
      outline.push(
        ...Array.from({ length: 25 }, (_, i) => {
          const u = 1 - i / 24,
            top = rim(u);
          return { x: top.x, y: box.y + box.height - (top.y - box.y) };
        }),
      );
      outline.push({ x: box.x, y: box.y + 14 });
    }
    let best = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      const sx = b.x - a.x,
        sy = b.y - a.y;
      const det = dx * sy - dy * sx;
      if (Math.abs(det) < 1e-9) continue;
      const qx = a.x - x,
        qy = a.y - y;
      const t = (qx * sy - qy * sx) / det,
        u = (qx * dy - qy * dx) / det;
      if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    if (Number.isFinite(best)) return quantize({ x: x + best * dx, y: y + best * dy });
  }
  const scale =
    shape === 'ellipse'
      ? 1 / Math.hypot(nx, ny)
      : shape === 'diamond'
        ? 1 / (nx + ny)
        : 1 / Math.max(nx, ny);
  return { x: x + dx * scale, y: y + dy * scale };
}
