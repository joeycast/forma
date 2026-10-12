import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDocument,
  patchDocument,
  layoutDiagram,
  nodeMarkup,
  portPoint,
  retargetRoute,
  routeThrough,
  isOrthogonal,
  segmentCross,
  routesCross,
  slideOrthogonalSegment,
  nearestPort,
  simplify,
  previewRoute,
  samePoints,
  insertWaypoint,
  segmentWaypoints,
  shapeBoundary,
  slideOrthogonalSegmentWithIntent,
  routeBetween,
  segmentHitsBox,
} from '../packages/core/src';

const box = { x: 0, y: 0, width: 120, height: 60 };

test('one port is centered and extra ports spread along the side', () => {
  assert.deepEqual(portPoint(box, 'right', 0, 1), { x: 120, y: 30 });
  const first = portPoint(box, 'top', 0, 3),
    middle = portPoint(box, 'top', 1, 3),
    last = portPoint(box, 'top', 2, 3);
  assert.ok(first.x < middle.x && middle.x < last.x);
  assert.equal(middle.x, 60);
  assert.equal(first.y, 0);
});

test('route normalization is repeatable and retains a deliberate reversal', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 40 },
    { x: 20, y: 40 },
  ];
  const once = simplify(route);
  assert.deepEqual(simplify(once), once);
  assert.deepEqual(once, [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 40 },
  ]);
  const duplicatedStops = routeThrough(
    { x: 0, y: 0 },
    [
      { x: 30, y: 20 },
      { x: 30, y: 20 },
    ],
    { x: 90, y: 0 },
    'right',
    'left',
  );
  assert.equal(isOrthogonal(duplicatedStops), true);
  assert.equal(
    duplicatedStops.some(
      (p, i) => i > 0 && p.x === duplicatedStops[i - 1].x && p.y === duplicatedStops[i - 1].y,
    ),
    false,
  );
});

test('straight preview remains a single segment while orthogonal preview stays orthogonal', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 60 },
    { x: 100, y: 60 },
  ];
  const straight = previewRoute(
    points,
    { x: 0, y: 0 },
    { x: 100, y: 60 },
    'right',
    'left',
    'straight',
  );
  assert.deepEqual(straight, [
    { x: 0, y: 0 },
    { x: 100, y: 60 },
  ]);
  const orthogonal = previewRoute(points, { x: 0, y: 20 }, { x: 110, y: 60 }, 'right', 'left');
  assert.equal(isOrthogonal(orthogonal), true);
});

test('repeated segment moves settle and duplicate waypoint clicks are no-ops', () => {
  const route = [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
    { x: 100, y: 150 },
    { x: 200, y: 150 },
  ];
  let origin = route;
  let previous: { x: number; y: number }[] = [];
  for (const x of [140, 150, 160, 170, 180]) {
    const result = slideOrthogonalSegmentWithIntent(origin, 1, x);
    const intent = segmentWaypoints(origin, result.points, 1, result.intent, previous);
    assert.equal(intent.length, 2, 'the same channel keeps a bounded two-point intent');
    assert.ok(intent.every((p) => p.x === x));
    previous = intent;
    origin = result.points;
  }
  const unchanged = slideOrthogonalSegmentWithIntent(origin, 1, 180).points;
  assert.equal(
    samePoints(origin, unchanged),
    true,
    'returning to the current position is unchanged',
  );
  const movedResult = slideOrthogonalSegmentWithIntent(route, 1, 140);
  const moved = movedResult.points;
  assert.equal(
    samePoints(
      route,
      route.map((p) => ({ ...p })),
    ),
    true,
  );
  const anchors = [
    { x: 0, y: 0 },
    { x: 40, y: 40 },
    { x: 100, y: 0 },
  ];
  assert.deepEqual(insertWaypoint(anchors, { x: 40, y: 40 }), [{ x: 40, y: 40 }]);
  const intent = segmentWaypoints(route, moved, 1, movedResult.intent, [{ x: 30, y: 20 }]);
  assert.equal(intent.length, 3);
  assert.ok(intent.some((p) => p.x === 30 && p.y === 20));
  assert.ok(intent.some((p) => p.x === 140 && p.y === 50));
  assert.ok(intent.some((p) => p.x === 140 && p.y === 150));
});

test('first and last segment intents survive simplification at their fixed endpoints', () => {
  const firstOrigin = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 200, y: 50 },
  ];
  const first = slideOrthogonalSegmentWithIntent(firstOrigin, 0, 10);
  assert.deepEqual(first.intent, [
    { x: 0, y: 10 },
    { x: 100, y: 10 },
  ]);
  assert.deepEqual(first.points[0], firstOrigin[0]);
  assert.equal(isOrthogonal(first.points), true);

  const lastOrigin = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  const last = slideOrthogonalSegmentWithIntent(lastOrigin, 2, 110);
  assert.deepEqual(last.intent, [
    { x: 100, y: 110 },
    { x: 200, y: 110 },
  ]);
  assert.deepEqual(last.points.at(-1), lastOrigin.at(-1));
  assert.equal(isOrthogonal(last.points), true);
});

test('route coordinate budget keeps an orthogonal fallback and reports it', () => {
  let exceeded = 0;
  const route = routeBetween(
    { x: 0, y: 0, width: 80, height: 50 },
    { x: 300, y: 120, width: 80, height: 50 },
    [{ x: 120, y: 0, width: 40, height: 180 }],
    false,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    1,
    1,
    [],
    { maxCoordinates: 2, onBudgetExceeded: () => exceeded++ },
  );
  assert.equal(exceeded, 1);
  assert.equal(isOrthogonal(route), true);
});

test('route work budget uses a clear bounded fallback and reports exhaustion', () => {
  let exceeded = 0;
  const source = { x: 0, y: 0, width: 40, height: 40 };
  const target = { x: 240, y: 0, width: 40, height: 40 };
  const obstacle = { x: 100, y: -20, width: 80, height: 80 };
  const expanded = { x: 88, y: -32, width: 104, height: 104 };
  const route = routeBetween(
    source,
    target,
    [obstacle],
    false,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    1,
    1,
    [],
    { workBudget: { remaining: 0 }, onBudgetExceeded: () => exceeded++ },
  );
  assert.equal(exceeded, 1);
  assert.ok(isOrthogonal(route));
  for (let i = 1; i < route.length; i++)
    assert.equal(segmentHitsBox(route[i - 1], route[i], expanded), false);
});

test('multiports land on ellipse, diamond, and pill outlines', () => {
  const shapes = ['ellipse', 'diamond', 'pill'] as const;
  for (const shape of shapes) {
    const point = portPoint(box, 'top', 0, 3, shape);
    const dx = Math.abs(point.x - (box.x + box.width / 2));
    const dy = Math.abs(point.y - (box.y + box.height / 2));
    if (shape === 'ellipse') assert.ok(Math.abs(dx ** 2 / 60 ** 2 + dy ** 2 / 30 ** 2 - 1) < 0.001);
    if (shape === 'diamond') assert.ok(Math.abs(dx / 60 + dy / 30 - 1) < 0.001);
    if (shape === 'pill') {
      const r = 30,
        straight = 60 - r,
        offset = Math.max(0, dx - straight);
      assert.ok(Math.abs(point.y - box.y - (r - Math.sqrt(r * r - offset * offset))) < 0.01);
    }
  }
  const cylinderTop = portPoint(box, 'top', 1, 3, 'cylinder');
  assert.ok(Math.abs(cylinderTop.y - (box.y + 0.5)) < 0.01);
  assert.equal(portPoint(box, 'left', 1, 3, 'cylinder').x, box.x);
  assert.equal(shapeBoundary(box, { x: 200, y: 30 }, 'pill').x, box.x + box.width);
  assert.equal(shapeBoundary(box, { x: 60, y: -100 }, 'cylinder').y, box.y + 0.5);
});

test('registered polygon ports and ray boundaries follow the shared outline', () => {
  for (const shape of ['triangle', 'hexagon', 'parallelogram', 'trapezoid', 'document', 'cloud']) {
    const port = portPoint(box, 'left', 0, 1, shape);
    const toward = { x: box.x - 100, y: box.y + box.height / 2 };
    const boundary = shapeBoundary(box, toward, shape);
    assert.ok(port.x >= box.x && port.x <= box.x + box.width);
    assert.ok(port.y >= box.y && port.y <= box.y + box.height);
    assert.ok(boundary.x < box.x + box.width / 2);
    assert.ok(boundary.x >= box.x && boundary.x <= box.x + box.width);
  }
});

test('port indexes and path patches validate without dropping other fields', () => {
  assert.throws(() =>
    parseDocument({
      version: 2,
      title: 'Ports',
      nodes: [
        { id: 'a', label: 'A', ports: { right: 2 } },
        { id: 'b', label: 'B' },
      ],
      edges: [
        {
          id: 'ab',
          source: 'a',
          target: 'b',
          appearance: { sourcePort: 'right', sourceIndex: 4 },
        },
      ],
    }),
  );
  const doc = parseDocument({
    version: 2,
    title: 'Ports',
    nodes: [
      { id: 'a', label: 'A', ports: { top: 2 } },
      { id: 'b', label: 'B' },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', path: [{ x: 10, y: 20 }] }],
  });
  const more = patchDocument(doc, { nodes: [{ id: 'a', ports: { right: 3 } }] });
  assert.equal(more.nodes[0].ports?.top, 2);
  assert.equal(more.nodes[0].ports?.right, 3);
  const cleared = patchDocument(more, {
    nodes: [{ id: 'a', ports: { right: null } }],
    edges: [{ id: 'ab', path: null }],
  });
  assert.equal(cleared.nodes[0].ports?.right, undefined);
  assert.equal(cleared.nodes[0].ports?.top, 2);
  assert.equal(cleared.edges[0].path, undefined);
  assert.equal(cleared.version, 2);
});

test('a custom path stays put when a component is pinned', async () => {
  const doc = parseDocument({
    version: 2,
    title: 'Path',
    nodes: [
      { id: 'a', label: 'Source' },
      { id: 'b', label: 'Target' },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', path: [{ x: 40, y: 400 }] }],
  });
  const before = await layoutDiagram(doc);
  assert.ok(before.edges[0].points.some((p) => p.x === 40 && p.y === 400));
  assert.ok(isOrthogonal(before.edges[0].points));
  const moved = patchDocument(doc, { overrides: { a: { position: { x: 30, y: 30 } } } });
  const after = await layoutDiagram(moved);
  assert.equal(after.nodes.find((n) => n.id === 'a')!.x, 30);
  assert.ok(after.edges[0].points.some((p) => p.x === 40 && p.y === 400));
});

test('connectors that share a point may run on top of each other', async () => {
  const scene = await layoutDiagram(
    parseDocument({
      version: 2,
      title: 'Shared',
      layout: { mode: 'grid', direction: 'RIGHT' },
      nodes: [
        { id: 'a', label: 'A', placement: { column: 0, row: 0 } },
        { id: 'c', label: 'C', placement: { column: 2, row: 0 } },
        { id: 'd', label: 'D', placement: { column: 2, row: 1 } },
      ],
      edges: [
        {
          id: 'ac',
          source: 'a',
          target: 'c',
          appearance: { sourcePort: 'right', targetPort: 'left' },
        },
        {
          id: 'ad',
          source: 'a',
          target: 'd',
          appearance: { sourcePort: 'right', targetPort: 'left' },
        },
      ],
    }),
  );
  const ac = scene.edges.find((e) => e.id === 'ac')!,
    ad = scene.edges.find((e) => e.id === 'ad')!;
  assert.deepEqual(ac.points[0], ad.points[0]);
  assert.equal(segmentCross(ac.points[0], ac.points[1], ad.points[0], ad.points[1]), null);
});

test('a later connector takes a free channel instead of crossing', async () => {
  const scene = await layoutDiagram(
    parseDocument({
      version: 2,
      title: 'Cross',
      layout: { mode: 'grid', direction: 'RIGHT' },
      nodes: [
        { id: 'a', label: 'A', placement: { column: 0, row: 0 } },
        { id: 'b', label: 'B', placement: { column: 1, row: 0 } },
        { id: 'c', label: 'C', placement: { column: 0, row: 1 } },
        { id: 'd', label: 'D', placement: { column: 1, row: 1 } },
      ],
      edges: [
        {
          id: 'ad',
          source: 'a',
          target: 'd',
          appearance: { sourcePort: 'bottom', targetPort: 'left' },
        },
        {
          id: 'bc',
          source: 'b',
          target: 'c',
          appearance: { sourcePort: 'bottom', targetPort: 'right' },
        },
      ],
    }),
  );
  const ad = scene.edges.find((e) => e.id === 'ad')!,
    bc = scene.edges.find((e) => e.id === 'bc')!;
  assert.equal(routesCross(ad.points, bc.points), false);
});

test('sliding a segment keeps both ends attached', () => {
  const slid = slideOrthogonalSegment(
    [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 150 },
      { x: 200, y: 150 },
    ],
    1,
    140,
  );
  assert.deepEqual(slid[0], { x: 0, y: 50 });
  assert.deepEqual(slid.at(-1), { x: 200, y: 150 });
  assert.ok(slid.some((point) => point.x === 140));
  assert.equal(isOrthogonal(slid), true);
  const port = nearestPort({ x: 0, y: 0, width: 120, height: 60 }, { right: 3 }, { x: 120, y: 15 });
  assert.equal(port.side, 'right');
  assert.equal(port.index, 0);
});
test('retarget slides the attached segment and keeps the channel', () => {
  const kept = retargetRoute(
    [
      { x: 0, y: 50 },
      { x: 40, y: 50 },
      { x: 40, y: 120 },
      { x: 200, y: 120 },
    ],
    { x: 0, y: 80 },
    { x: 220, y: 140 },
    'right',
    'left',
  );
  assert.ok(kept);
  assert.equal(kept![0].y, 80);
  assert.equal(kept![1].x, 40);
  assert.equal(kept![1].y, 80);
  assert.ok(kept!.some((p) => p.x === 40 && p.y === 140));
  assert.equal(
    routeThrough({ x: 0, y: 0 }, [{ x: 30, y: 80 }], { x: 90, y: 0 }, 'right', 'left').some(
      (p) => p.x === 30 && p.y === 80,
    ),
    true,
  );
});

test('text alignment covers left, center, right and top, middle, bottom', async () => {
  const placed = async (
    align: 'left' | 'center' | 'right',
    verticalAlign: 'top' | 'middle' | 'bottom',
  ) => {
    const scene = await layoutDiagram(
      parseDocument({
        version: 2,
        title: 'Text',
        nodes: [
          {
            id: 'a',
            label: 'Hello',
            style: { align, verticalAlign, shape: 'rect', width: 220, height: 140 },
          },
        ],
        edges: [],
      }),
    );
    return nodeMarkup(scene.nodes[0], 'paper');
  };
  assert.match(await placed('right', 'top'), /text-anchor="end"/);
  assert.match(await placed('center', 'middle'), /text-anchor="middle"/);
  assert.doesNotMatch(await placed('left', 'bottom'), /text-anchor=/);
  const top = await placed('left', 'top');
  const bottom = await placed('left', 'bottom');
  const y = (markup: string) => Number(markup.match(/<text x="[\d.]+" y="([\d.]+)"/)?.[1]);
  assert.ok(y(top) < y(bottom));
  const pill = await layoutDiagram(
    parseDocument({
      version: 2,
      title: 'Pill',
      nodes: [{ id: 'a', label: 'Pill', style: { shape: 'pill' } }],
      edges: [],
    }),
  );
  assert.match(nodeMarkup(pill.nodes[0], 'paper'), /text-anchor="middle"/);
});
