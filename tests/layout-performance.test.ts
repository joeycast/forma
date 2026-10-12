import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDiagram, parseDocument } from '../packages/core/src';

test('grid layout never constructs ELK and remains deterministic', async () => {
  const doc = parseDocument({
    version: 2,
    title: 'grid worker bypass fixture',
    layout: { mode: 'grid', direction: 'RIGHT' },
    nodes: [
      { id: 'a', label: 'A', placement: { column: 0, row: 0 } },
      { id: 'b', label: 'B', placement: { column: 1, row: 0 } },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
  });
  let requestedElk = false;
  const makeElk = async () => {
    requestedElk = true;
    throw new Error('grid layout should not load ELK');
  };
  const first = await layoutDiagram(doc, makeElk),
    second = await layoutDiagram(doc, makeElk);
  assert.equal(requestedElk, false);
  assert.deepEqual(
    first.nodes.map(({ id, x, y }) => [id, x, y]),
    second.nodes.map(({ id, x, y }) => [id, x, y]),
  );
  assert.deepEqual(
    first.edges.map(({ points }) => points),
    second.edges.map(({ points }) => points),
  );
});

test('cosmetic style edits reuse geometry but refresh styles and document fingerprint', async () => {
  const base = {
    version: 2,
    title: 'safe geometry cache fixture',
    layout: { mode: 'grid', direction: 'RIGHT' },
    nodes: [
      { id: 'a', label: 'A', placement: { column: 0, row: 0 } },
      { id: 'b', label: 'B', placement: { column: 1, row: 0 } },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
    presentation: { nodes: { a: { variant: 'shape', style: { shape: 'rect', fill: '#fff' } } } },
  } as const;
  const first = await layoutDiagram(parseDocument(base));
  const changed = parseDocument({
    ...base,
    presentation: { nodes: { a: { variant: 'shape', style: { shape: 'rect', fill: '#abc' } } } },
  });
  const second = await layoutDiagram(changed);
  assert.deepEqual(
    second.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
    first.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
  );
  assert.equal(second.nodes.find((node) => node.id === 'a')?.style?.fill, '#abc');
  assert.deepEqual(second.document, changed);
  assert.notEqual(second.fingerprint, first.fingerprint);
});
