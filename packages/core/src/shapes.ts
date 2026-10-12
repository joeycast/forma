export const SHAPE_NAMES = [
  'rect',
  'pill',
  'diamond',
  'ellipse',
  'cylinder',
  'text',
  'triangle',
  'hexagon',
  'parallelogram',
  'trapezoid',
  'document',
  'cloud',
] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];

export interface ShapeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface ShapeTextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ShapeSize {
  width: number;
  height: number;
}
export interface ShapePoint {
  x: number;
  y: number;
}
export type ShapeGeometry = 'rect' | 'ellipse' | 'path' | 'none';
export interface ShapeDefinition {
  label: string;
  geometry: ShapeGeometry;
  defaultAlign: 'left' | 'center';
  minWidth: number;
  minHeight: number;
  textInsets: (width: number, height: number, padding: number) => ShapeInsets;
  /** SVG path data; polygon shapes and cylinders use this same outline for rendering. */
  path: (width: number, height: number) => string | undefined;
  /** Shared normalized outline for geometry and port placement; absent for analytic shapes. */
  points?: (width: number, height: number) => ShapePoint[];
}

const pointsPath = (points: ShapePoint[]) =>
  points.length ? `M${points.map((p) => `${p.x} ${p.y}`).join(' L')} Z` : '';
const scaled = (points: ShapePoint[], width: number, height: number) =>
  points.map((p) => ({ x: p.x * width, y: p.y * height }));
const polygon = (width: number, height: number, points: ShapePoint[]) =>
  pointsPath(scaled(points, width, height));
const uniformInsets = (width: number, height: number, padding: number): ShapeInsets => ({
  left: padding,
  right: padding,
  top: padding,
  bottom: padding,
});
const normalized = (points: ShapePoint[]) => (width: number, height: number) =>
  scaled(points, width, height);
const sampleCubic = (
  start: ShapePoint,
  control1: ShapePoint,
  control2: ShapePoint,
  end: ShapePoint,
  steps = 12,
): ShapePoint[] =>
  Array.from({ length: steps }, (_, index) => {
    const t = index / steps,
      u = 1 - t;
    return {
      x:
        u ** 3 * start.x + 3 * u * u * t * control1.x + 3 * u * t * t * control2.x + t ** 3 * end.x,
      y:
        u ** 3 * start.y + 3 * u * u * t * control1.y + 3 * u * t * t * control2.y + t ** 3 * end.y,
    };
  });
type CubicSegment = readonly [ShapePoint, ShapePoint, ShapePoint];
const curvePoints = (start: ShapePoint, segments: CubicSegment[]) => [
  ...segments.flatMap(([control1, control2, end]) => {
    const points = sampleCubic(start, control1, control2, end);
    start = end;
    return points;
  }),
];
const cubicPath = (start: ShapePoint, segments: CubicSegment[], width: number, height: number) =>
  `M${start.x * width} ${start.y * height} ${segments
    .map(
      ([c1, c2, end]) =>
        `C${c1.x * width} ${c1.y * height} ${c2.x * width} ${c2.y * height} ${end.x * width} ${end.y * height}`,
    )
    .join(' ')} Z`;
const curvedDefinition = (
  label: string,
  points: ShapePoint[],
  minWidth: number,
  minHeight: number,
  insetX: number,
  insetY: number,
  path: (width: number, height: number) => string,
): ShapeDefinition => ({
  ...polygonDefinition(label, points, minWidth, minHeight, insetX, insetY),
  path,
});

const fixedPoints: Partial<Record<ShapeName, ShapePoint[]>> = {
  triangle: [
    { x: 0.5, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
  hexagon: [
    { x: 0.25, y: 0 },
    { x: 0.75, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.75, y: 1 },
    { x: 0.25, y: 1 },
    { x: 0, y: 0.5 },
  ],
  parallelogram: [
    { x: 0.22, y: 0 },
    { x: 1, y: 0 },
    { x: 0.78, y: 1 },
    { x: 0, y: 1 },
  ],
  trapezoid: [
    { x: 0.18, y: 0 },
    { x: 0.82, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
};

const polygonDefinition = (
  label: string,
  points: ShapePoint[],
  minWidth: number,
  minHeight: number,
  insetX: number,
  insetY: number,
): ShapeDefinition => ({
  label,
  geometry: 'path',
  defaultAlign: 'center',
  minWidth,
  minHeight,
  points: normalized(points),
  path: (width, height) => polygon(width, height, points),
  textInsets: (width, height) => ({
    left: width * insetX,
    right: width * insetX,
    top: height * insetY,
    bottom: height * insetY,
  }),
});

export const SHAPE_REGISTRY: Record<ShapeName, ShapeDefinition> = {
  rect: {
    label: 'Rectangle',
    geometry: 'rect',
    defaultAlign: 'left',
    minWidth: 180,
    minHeight: 40,
    path: () => undefined,
    textInsets: uniformInsets,
  },
  pill: {
    label: 'Pill',
    geometry: 'rect',
    defaultAlign: 'center',
    minWidth: 180,
    minHeight: 40,
    path: () => undefined,
    // Keep the original shape renderer's 20px style padding semantics.
    textInsets: uniformInsets,
  },
  diamond: polygonDefinition(
    'Diamond',
    [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ],
    180,
    40,
    0.23,
    0.28,
  ),
  ellipse: {
    label: 'Ellipse',
    geometry: 'ellipse',
    defaultAlign: 'center',
    minWidth: 180,
    minHeight: 40,
    path: () => undefined,
    textInsets: (width, height) => ({
      left: width * 0.16,
      right: width * 0.16,
      top: height * 0.2,
      bottom: height * 0.2,
    }),
  },
  cylinder: {
    label: 'Cylinder',
    geometry: 'path',
    defaultAlign: 'left',
    minWidth: 180,
    minHeight: 40,
    path: (w, h) =>
      `M0 14 C0 -4 ${w} -4 ${w} 14 V${h - 14} C${w} ${h + 4} 0 ${h + 4} 0 ${h - 14}Z M0 14 C0 32 ${w} 32 ${w} 14`,
    textInsets: uniformInsets,
  },
  text: {
    label: 'Text',
    geometry: 'none',
    defaultAlign: 'left',
    minWidth: 80,
    minHeight: 40,
    path: () => undefined,
    textInsets: uniformInsets,
  },
  triangle: polygonDefinition('Triangle', fixedPoints.triangle!, 80, 72, 0.35, 0.32),
  hexagon: polygonDefinition('Hexagon', fixedPoints.hexagon!, 104, 64, 0.2, 0.16),
  parallelogram: polygonDefinition(
    'Parallelogram',
    fixedPoints.parallelogram!,
    100,
    48,
    0.22,
    0.14,
  ),
  trapezoid: polygonDefinition('Trapezoid', fixedPoints.trapezoid!, 100, 48, 0.2, 0.14),
  document: curvedDefinition(
    'Document',
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.82 },
      ...curvePoints({ x: 1, y: 0.82 }, [
        [
          { x: 0.92, y: 0.98 },
          { x: 0.78, y: 0.7 },
          { x: 0.62, y: 0.86 },
        ],
        [
          { x: 0.42, y: 1.02 },
          { x: 0.25, y: 0.7 },
          { x: 0.12, y: 0.86 },
        ],
        [
          { x: 0.02, y: 0.98 },
          { x: 0, y: 0.9 },
          { x: 0, y: 0.82 },
        ],
      ]),
    ],
    100,
    80,
    0.16,
    0.24,
    (w, h) =>
      `M0 0 H${w} V${h * 0.82} C${w * 0.92} ${h * 0.98} ${w * 0.78} ${h * 0.7} ${w * 0.62} ${h * 0.86} C${w * 0.42} ${h * 1.02} ${w * 0.25} ${h * 0.7} ${w * 0.12} ${h * 0.86} C${w * 0.02} ${h * 0.98} 0 ${h * 0.9} 0 ${h * 0.82} Z`,
  ),
  cloud: curvedDefinition(
    'Cloud',
    curvePoints({ x: 0.2, y: 0.82 }, [
      [
        { x: 0.02, y: 0.82 },
        { x: 0, y: 0.68 },
        { x: 0.04, y: 0.55 },
      ],
      [
        { x: 0.02, y: 0.38 },
        { x: 0.14, y: 0.38 },
        { x: 0.2, y: 0.41 },
      ],
      [
        { x: 0.19, y: 0.18 },
        { x: 0.41, y: 0.12 },
        { x: 0.5, y: 0.3 },
      ],
      [
        { x: 0.57, y: 0.05 },
        { x: 0.85, y: 0.12 },
        { x: 0.84, y: 0.4 },
      ],
      [
        { x: 1, y: 0.4 },
        { x: 1, y: 0.75 },
        { x: 0.82, y: 0.82 },
      ],
      [
        { x: 0.6, y: 0.9 },
        { x: 0.36, y: 0.9 },
        { x: 0.2, y: 0.82 },
      ],
    ]),
    120,
    80,
    0.36,
    0.34,
    (w, h) =>
      cubicPath(
        { x: 0.2, y: 0.82 },
        [
          [
            { x: 0.02, y: 0.82 },
            { x: 0, y: 0.68 },
            { x: 0.04, y: 0.55 },
          ],
          [
            { x: 0.02, y: 0.38 },
            { x: 0.14, y: 0.38 },
            { x: 0.2, y: 0.41 },
          ],
          [
            { x: 0.19, y: 0.18 },
            { x: 0.41, y: 0.12 },
            { x: 0.5, y: 0.3 },
          ],
          [
            { x: 0.57, y: 0.05 },
            { x: 0.85, y: 0.12 },
            { x: 0.84, y: 0.4 },
          ],
          [
            { x: 1, y: 0.4 },
            { x: 1, y: 0.75 },
            { x: 0.82, y: 0.82 },
          ],
          [
            { x: 0.6, y: 0.9 },
            { x: 0.36, y: 0.9 },
            { x: 0.2, y: 0.82 },
          ],
        ],
        w,
        h,
      ),
  ),
};

export function shapeTextRegion(
  shape: ShapeName,
  width: number,
  height: number,
  padding = 20,
): ShapeTextRegion {
  const { left, right, top, bottom } = SHAPE_REGISTRY[shape].textInsets(width, height, padding);
  return {
    x: left,
    y: top,
    width: Math.max(0, width - left - right),
    height: Math.max(0, height - top - bottom),
  };
}

/** Fit a requested size to an aspect ratio and minimum without shrinking either requested dimension. */
export function constrainShapeSize(
  requested: ShapeSize,
  aspectRatio?: number,
  minimum: ShapeSize = { width: 0, height: 0 },
): ShapeSize {
  let width = Math.max(requested.width, minimum.width),
    height = Math.max(requested.height, minimum.height);
  if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    if (width / height > aspectRatio) height = width / aspectRatio;
    else width = height * aspectRatio;
    if (width < minimum.width) {
      width = minimum.width;
      height = Math.max(height, width / aspectRatio);
    }
    if (height < minimum.height) {
      height = minimum.height;
      width = Math.max(width, height * aspectRatio);
    }
  }
  return { width, height };
}
