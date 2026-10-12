import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, previewDocumentPatch, serializeDocument } from '../packages/core/src';

const document = parseDocument({
  version: 2,
  title: 'Human diagram',
  nodes: [
    { id: 'one', label: 'One' },
    { id: 'two', label: 'Two' },
  ],
  edges: [
    {
      id: 'link',
      source: 'one',
      target: 'two',
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
  ],
  presentation: {
    theme: 'midnight',
    nodes: { one: { position: { x: -30, y: 80 }, color: 'amber', style: { fill: '#f0e0c0' } } },
  },
});

test('native patch preview is deterministic, ID-addressed, and leaves its base untouched', () => {
  const before = serializeDocument(document);
  const preview = previewDocumentPatch(document, {
    nodes: [{ id: 'one', description: 'agent detail' }],
  });
  assert.equal(serializeDocument(document), before);
  assert.deepEqual(
    preview.changes.map(({ path, kind }) => ({ path, kind })),
    [{ path: 'document.nodes[one].description', kind: 'added' }],
  );
  assert.equal(preview.summary.updated, 0);
  assert.equal(preview.summary.noOp, false);
  assert.deepEqual(preview.candidate.presentation.nodes.one, document.presentation.nodes.one);
  assert.deepEqual(preview.candidate.edges[0].path, document.edges[0].path);
});

test('no-op patch preview reports no changes and invalid native fields have stable paths', () => {
  const noOp = previewDocumentPatch(document, { nodes: [{ id: 'one', label: 'One' }] });
  assert.equal(noOp.summary.noOp, true);
  assert.deepEqual(noOp.changes, []);
  assert.throws(
    () => previewDocumentPatch(document, { nodes: [{ id: 'one', label: '' }] }),
    (error: unknown) => {
      assert.equal((error as { name: string }).name, 'DocumentError');
      assert.deepEqual(
        (error as { issues: { path: string }[] }).issues.map((item) => item.path),
        ['nodes.0.label'],
      );
      return true;
    },
  );
  assert.throws(
    () => previewDocumentPatch(document, { nodes: [{ id: 'two', label: '' }] }),
    (error: unknown) => {
      assert.deepEqual(
        (error as { issues: { path: string }[] }).issues.map((item) => item.path),
        ['nodes.1.label'],
      );
      return true;
    },
  );
});
