import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, patchDocument, layoutDiagram, renderSvg } from '../packages/core/src';

const source = {
  version: 2,
  title: 'Footer',
  nodes: [{ id: 'a', label: 'One' }],
  edges: [],
};

test('the sheet footer can be rewritten or hidden', async () => {
  const shown = renderSvg(await layoutDiagram(parseDocument(source)));
  assert.match(shown, /FORMA {2}\/ {2}DIAGRAM/);
  assert.match(shown, /1 components/);
  const edited = patchDocument(parseDocument(source), {
    footer: { label: 'Northwind', detail: 'Draft' },
  });
  const custom = renderSvg(await layoutDiagram(edited));
  assert.match(custom, /Northwind/);
  assert.match(custom, /Draft/);
  assert.doesNotMatch(custom, /FORMA/);
  const hiddenDoc = patchDocument(edited, { footer: { hidden: true } });
  const hidden = await layoutDiagram(hiddenDoc);
  const svg = renderSvg(hidden);
  assert.doesNotMatch(svg, /Northwind|FORMA|<line /);
  const shownAgain = await layoutDiagram(parseDocument(source));
  assert.ok(shownAgain.bounds.height > hidden.bounds.height);
  const restored = patchDocument(hiddenDoc, {
    footer: { hidden: null, label: null, detail: null },
  });
  assert.equal(restored.presentation.footer, undefined);
});
