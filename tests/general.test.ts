import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  parseDocument,
  patchDocument,
  migrateDocument,
  serializeDocument,
  layoutDiagram,
  renderSvg,
  inspectScene,
  atelier,
  signal,
  shapeBoundary,
  segmentHitsBox,
  designSystemSchema,
} from '../packages/core/src';
const read = async (name: string) =>
  parseDocument(JSON.parse(await readFile(`examples/gallery/${name}.forma.json`, 'utf8')));
test('v1 remains unchanged and v2 is explicit, lossless, and rejects invalid style data', async () => {
  const old = parseDocument(JSON.parse(await readFile('examples/platform.forma.json', 'utf8')));
  assert.equal(parseDocument(serializeToObject(old)).version, 1);
  assert.deepEqual({ ...migrateDocument(old), version: 1 }, old);
  assert.throws(() =>
    parseDocument({ ...old, nodes: old.nodes.map((n) => ({ ...n, style: { fill: '#fff' } })) }),
  );
  const patched = patchDocument(old, { overrides: { gateway: { style: { fill: '#fff' } } } });
  assert.equal(patched.version, 2);
  assert.throws(() =>
    patchDocument(patched, {
      overrides: { gateway: { style: { fill: 'url(https://example.org)' } } },
    }),
  );
  assert.throws(() => designSystemSchema.parse({ ...atelier, node: { fill: '#12345' } }));
});
const serializeToObject = (value: any) => JSON.parse(serializeDocument(value));
test('every conventional and custom example renders with no visual diagnostics', async () => {
  for (const file of (await readdir('examples/gallery')).filter((f) => f.endsWith('.json'))) {
    const doc = parseDocument(JSON.parse(await readFile(`examples/gallery/${file}`, 'utf8')));
    const scene = await layoutDiagram(doc);
    assert.deepEqual(inspectScene(scene).issues, [], file);
    assert.ok(renderSvg(scene).includes('<svg'));
    assert.equal(scene.nodes.length, doc.nodes.length);
  }
});
test('design systems change presentation, not semantics; human overrides and unknown kinds survive agent edits', async () => {
  const original = await read('development');
  const human = patchDocument(original, {
    nodes: [{ id: 'verify', label: 'Human verification', kind: 'quality-gate' }],
    overrides: {
      verify: {
        position: { x: 550, y: 400 },
        style: { fill: '#ffefaa', radius: 0, opacity: 0.85 },
      },
    },
  });
  const agent = patchDocument(parseDocument(serializeToObject(human)), {
    nodes: [{ id: 'verify', description: 'Independent evidence', style: { fontSize: 20 } }],
    designSystem: signal,
  });
  assert.deepEqual(agent.presentation.nodes.verify, human.presentation.nodes.verify);
  assert.equal(agent.nodes.find((n) => n.id === 'verify')?.style?.dash, 'dashed');
  assert.equal(agent.nodes.find((n) => n.id === 'verify')?.label, 'Human verification');
  assert.equal(agent.nodes.find((n) => n.id === 'verify')?.kind, 'quality-gate');
  const scene = await layoutDiagram(agent),
    node = scene.nodes.find((n) => n.id === 'verify')!;
  assert.equal(node.x, 550);
  assert.equal(node.style?.fill, '#ffefaa');
  assert.equal(node.style?.radius, 0);
  assert.equal(node.style?.fontSize, 20);
  assert.equal(node.style?.dash, 'dashed');
  const restyled = patchDocument(original, { designSystem: signal });
  assert.deepEqual(restyled.nodes, original.nodes);
  assert.deepEqual(restyled.edges, original.edges);
  assert.deepEqual(restyled.groups, original.groups);
  assert.notEqual(
    renderSvg(await layoutDiagram(restyled)),
    renderSvg(await layoutDiagram(original)),
  );
});
test('grid geometry reflows with content; pins win and side ports route without crossings', async () => {
  const original = await read('decision');
  const scene = await layoutDiagram(original);
  const decision = scene.nodes.find((n) => n.id === 'gate')!,
    retry = scene.nodes.find((n) => n.id === 'revise')!;
  const branch = scene.edges.find((e) => e.id === 'gate-revise')!;
  assert.equal(branch.points[0].x, decision.x + decision.width);
  assert.equal(branch.points.at(-1)!.x, retry.x);
  const expanded = patchDocument(original, { nodes: [{ id: 'gate', style: { width: 400 } }] });
  const wide = await layoutDiagram(expanded);
  assert.ok(wide.nodes.find((n) => n.id === 'revise')!.x > retry.x);
  assert.deepEqual(inspectScene(wide).issues, []);
  assert.throws(() =>
    parseDocument({
      ...original,
      nodes: original.nodes.map((n) => ({ ...n, placement: { row: 0, column: 0 } })),
    }),
  );
});
test('diagonal intersection and curved shape attachments are measured', () => {
  assert.ok(
    segmentHitsBox({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 40, y: 40, width: 20, height: 20 }),
  );
  assert.ok(
    !segmentHitsBox({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 40, y: 70, width: 10, height: 10 }),
  );
  const p = shapeBoundary({ x: 0, y: 0, width: 200, height: 100 }, { x: 300, y: 200 }, 'ellipse');
  assert.ok(Math.abs(((p.x - 100) / 100) ** 2 + ((p.y - 50) / 50) ** 2 - 1) < 1e-9);
});
