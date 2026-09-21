import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDocument,
  patchDocument,
  layoutDiagram,
  inspectScene,
  alignNodes,
  distributeNodes,
  snapUnpinned,
  mergeAlignmentPins,
  type SceneNode,
} from '../packages/core/src/index';

const node = (
  id: string,
  x: number,
  y: number,
  pinned = false,
  size = { width: 80, height: 40 },
): SceneNode => ({
  id,
  x,
  y,
  ...size,
  pinned,
  semantic: { id, label: id, kind: 'service', emphasis: 'normal' },
  titleLines: [id],
  descriptionLines: [],
  accent: 'slate',
});

test('align left uses the leftmost edge and distribute evens gaps', () => {
  const nodes = [node('a', 40, 10), node('b', 48, 90), node('c', 120, 170)];
  const aligned = alignNodes(nodes, ['a', 'b', 'c'], 'left');
  assert.deepEqual(
    aligned.map((move) => [move.id, move.position.x]),
    [
      ['a', 40],
      ['b', 40],
      ['c', 40],
    ],
  );
  const spread = [node('a', 0, 0), node('b', 20, 0), node('c', 200, 0)];
  const distributed = distributeNodes(spread, ['a', 'b', 'c'], 'horizontal');
  assert.equal(distributed[0]?.position.x, 0);
  assert.equal(distributed[2]?.position.x, 200);
  assert.equal(distributed[1]?.position.x, 100);
});

test('near-alignment inspects pinned columns and --fix merges x/y snaps', async () => {
  const doc = parseDocument({
    version: 2,
    title: 'Almost aligned',
    nodes: [
      { id: 'top', label: 'Top' },
      { id: 'mid', label: 'Mid' },
      { id: 'side', label: 'Side' },
    ],
    edges: [],
    presentation: {
      nodes: {
        top: { position: { x: 40, y: 20 }, style: { width: 80, height: 40 } },
        mid: { position: { x: 44, y: 200 }, style: { width: 80, height: 40 } },
        side: { position: { x: 200, y: 24 }, style: { width: 80, height: 40 } },
      },
    },
  });
  const scene = await layoutDiagram(doc);
  const issues = inspectScene(scene).issues.filter((issue) => issue.code === 'near-alignment');
  assert.ok(
    issues.some(
      (issue) =>
        (issue.fix?.edge === 'left' || issue.fix?.edge === 'center') && issue.ids.includes('top'),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        (issue.fix?.edge === 'top' || issue.fix?.edge === 'middle') && issue.ids.includes('side'),
    ),
  );
  const pins = mergeAlignmentPins(
    scene.nodes,
    issues.filter((issue) => issue.fix).map((issue) => ({ ids: issue.ids, edge: issue.fix!.edge })),
  );
  const updated = patchDocument(doc, {
    overrides: Object.fromEntries(pins.map((move) => [move.id, { position: move.position }])),
  });
  const after = await layoutDiagram(updated);
  assert.equal(
    inspectScene(after).issues.filter((issue) => issue.code === 'near-alignment').length,
    0,
  );
  const top = after.nodes.find((n) => n.id === 'top')!,
    mid = after.nodes.find((n) => n.id === 'mid')!,
    side = after.nodes.find((n) => n.id === 'side')!;
  assert.equal(top.x, mid.x);
  assert.equal(top.y, side.y);
});

test('snapUnpinned moves free nodes to a pinned neighbor', () => {
  const nodes = [node('a', 40, 0, true), node('b', 44, 90, false)];
  snapUnpinned(nodes);
  assert.equal(nodes[1]?.x, nodes[0]?.x);
  assert.equal(nodes[1]?.pinned, false);
});
