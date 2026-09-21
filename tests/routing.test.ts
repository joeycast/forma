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
