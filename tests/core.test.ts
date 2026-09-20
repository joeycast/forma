import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseDocument,
  patchDocument,
  serializeDocument,
  DocumentError,
  layoutDiagram,
  renderSvg,
  inspectScene,
  overlaps,
  type Diagram,
  type Scene,
  type Box,
} from '../packages/core/src/index';

const doc = (extra: Record<string, unknown> = {}) =>
  parseDocument({
    version: 1,
    title: 'Test composition',
    nodes: [
      { id: 'a', label: 'Entry' },
      { id: 'b', label: 'Service' },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
    ...extra,
  });
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
function sound(scene: Scene) {
  for (const box of [scene.bounds, ...scene.nodes, ...scene.groups]) {
    assert.ok(
      Object.values({ x: box.x, y: box.y, width: box.width, height: box.height }).every(
        Number.isFinite,
      ),
    );
    assert.ok(box.width > 0 && box.height > 0);
    if (box !== scene.bounds) assert.ok(contains(scene.bounds, box));
  }
  for (const e of scene.edges) {
    assert.ok(e.points.length >= 2);
    for (let i = 1; i < e.points.length; i++)
      assert.ok(
        e.points[i].x === e.points[i - 1].x || e.points[i].y === e.points[i - 1].y,
        'connector is orthogonal',
      );
  }
}

test('schema rejects unsupported versions, duplicate IDs and all dangling references', () => {
  for (const value of [
    { version: 2 },
    {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'a', label: 'Duplicate' },
      ],
    },
    { groups: [{ id: 'a', label: 'Global ID conflict' }] },
    { edges: [{ id: 'bad', source: 'a', target: 'missing' }] },
    { nodes: [{ id: 'a', label: 'A', group: 'missing' }] },
    { groups: [{ id: 'g', label: 'G', parent: 'missing' }] },
    { presentation: { nodes: { missing: { color: 'blue' } } } },
    {
      groups: [
        { id: 'g', label: 'G', parent: 'h' },
        { id: 'h', label: 'H', parent: 'g' },
      ],
    },
    { groups: [{ id: 'g', label: 'G', parent: 'g' }] },
  ])
    assert.throws(() => doc(value), DocumentError);
});

test('semantic patches preserve human overrides and input, invalid patches are transactional', () => {
  const original = doc({
    presentation: {
      theme: 'midnight',
      nodes: { a: { position: { x: -128, y: 64 }, color: 'amber' }, b: { color: 'teal' } },
    },
  });
  const before = serializeDocument(original);
  const modified = patchDocument(original, {
    nodes: [{ id: 'a', label: 'New entry' }],
    edges: [{ id: 'ab', label: 'request' }],
  });
  assert.deepEqual(modified.presentation, original.presentation);
  assert.equal(modified.nodes[0].label, 'New entry');
  assert.throws(() => patchDocument(original, { nodes: [{ id: 'a', label: '' }] }));
  assert.equal(serializeDocument(original), before);
  const unpinned = patchDocument(modified, { overrides: { a: { position: null } } });
  assert.deepEqual(unpinned.presentation.nodes.a, { color: 'amber' });
  assert.deepEqual(unpinned.presentation.nodes.b, { color: 'teal' });
});

test('deleting a node removes incident edges and overrides; deleting groups releases children', () => {
  const original = doc({
    nodes: [
      { id: 'a', label: 'A', group: 'g' },
      { id: 'b', label: 'B', group: 'h' },
    ],
    groups: [
      { id: 'g', label: 'G' },
      { id: 'h', label: 'H', parent: 'g' },
    ],
    presentation: { nodes: { a: { color: 'amber' }, b: { color: 'teal' } } },
  });
  const next = patchDocument(original, { remove: { nodes: ['a'], groups: ['g'] } });
  assert.deepEqual(next.edges, []);
  assert.equal(next.presentation.nodes.a, undefined);
  assert.equal(next.groups[0].parent, undefined);
  assert.equal(next.nodes[0].group, 'h');
  assert.equal(original.edges.length, 1);
});

test('serialization is stable across property insertion order and round trips', () => {
  const a = doc();
  const b = parseDocument(JSON.parse(serializeDocument(a)));
  assert.equal(serializeDocument(a), serializeDocument(b));
  assert.ok(serializeDocument(a).endsWith('\n'));
});

test('both shipped examples produce repeatable, contained geometry without error diagnostics', async () => {
  for (const name of ['platform', 'release']) {
    const document = parseDocument(
      JSON.parse(
        await readFile(new URL(`../examples/${name}.forma.json`, import.meta.url), 'utf8'),
      ),
    );
    const first = await layoutDiagram(document);
    const second = await layoutDiagram(document);
    assert.deepEqual(first, second);
    sound(first);
    assert.deepEqual(
      inspectScene(first).issues.filter((i) => i.severity === 'error'),
      [],
    );
  }
});

test('nested groups contain descendants and respect exact negative-coordinate human pins', async () => {
  const document = doc({
    nodes: [
      { id: 'a', label: 'Entry', group: 'inner' },
      { id: 'b', label: 'Service', group: 'outer' },
    ],
    groups: [
      { id: 'outer', label: 'Platform' },
      { id: 'inner', label: 'Application', parent: 'outer' },
    ],
    presentation: { nodes: { a: { position: { x: -450, y: -230 }, color: 'violet' } } },
  });
  const scene = await layoutDiagram(document);
  sound(scene);
  const a = scene.nodes.find((n) => n.id === 'a')!;
  const inner = scene.groups.find((g) => g.id === 'inner')!;
  const outer = scene.groups.find((g) => g.id === 'outer')!;
  assert.equal(a.x, -450);
  assert.equal(a.y, -230);
  assert.equal(a.pinned, true);
  assert.equal(a.accent, 'violet');
  assert.ok(contains(inner, a));
  assert.ok(contains(outer, inner));
});

test('branching, cyclic, self-edge, disconnected and empty graphs render finite orthogonal scenes', async () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id.toUpperCase() }));
  const cases = [
    doc({
      nodes,
      edges: [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ac', source: 'a', target: 'c' },
        { id: 'bd', source: 'b', target: 'd' },
        { id: 'cd', source: 'c', target: 'd' },
      ],
    }),
    doc({
      nodes,
      edges: [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
        { id: 'ca', source: 'c', target: 'a' },
        { id: 'dd', source: 'd', target: 'd' },
      ],
    }),
    doc({ nodes, edges: [] }),
    doc({ nodes: [], edges: [], groups: [{ id: 'empty', label: 'Empty group' }] }),
    doc({ nodes: [], edges: [] }),
  ];
  for (const document of cases)
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      document.layout.direction = direction;
      const scene = await layoutDiagram(document);
      sound(scene);
      assert.ok(!renderSvg(scene).includes('NaN'));
      for (let i = 0; i < scene.nodes.length; i++)
        for (let j = i + 1; j < scene.nodes.length; j++)
          assert.ok(!overlaps(scene.nodes[i], scene.nodes[j]));
    }
});

test('long labels wrap inside cards and SVG text is escaped rather than executed', async () => {
  const malicious = '<script>alert("x")</script> & \'quote\'';
  const scene = await layoutDiagram(
    doc({
      title: malicious,
      nodes: [
        { id: 'a', label: 'W'.repeat(240), description: malicious },
        { id: 'b', label: malicious },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', label: malicious }],
    }),
  );
  sound(scene);
  assert.ok(scene.nodes[0].titleLines.length > 1);
  assert.deepEqual(
    inspectScene(scene).issues.filter((i) => i.code === 'text-clipping'),
    [],
  );
  const svg = renderSvg(scene);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&amp;'));
});

test('inspection reports actual overlaps, clipping, collisions and edge crossings', async () => {
  const scene = await layoutDiagram(doc());
  scene.nodes[1].x = scene.nodes[0].x + 20;
  scene.nodes[1].y = scene.nodes[0].y + 20;
  scene.bounds.width = 1;
  scene.edges = [
    {
      id: 'one',
      semantic: { id: 'one', source: 'a', target: 'a', style: 'solid' },
      points: [
        { x: -100, y: 50 },
        { x: 500, y: 50 },
      ],
    },
    {
      id: 'two',
      semantic: { id: 'two', source: 'b', target: 'b', style: 'solid' },
      points: [
        { x: 100, y: -100 },
        { x: 100, y: 500 },
      ],
    },
  ];
  const result = inspectScene(scene);
  const codes = new Set(result.issues.map((i) => i.code));
  for (const code of ['node-overlap', 'canvas-clipping', 'edge-node-collision', 'edge-crossing'])
    assert.ok(codes.has(code), code);
  assert.equal(result.summary.crossings, 1);
});

test('long group headings fit their container, including after child pinning', async () => {
  const { textWidth } = await import('../packages/core/src/text');
  for (const pinned of [false, true]) {
    const document = doc({
      nodes: [{ id: 'a', label: 'A', group: 'g' }],
      edges: [],
      groups: [{ id: 'g', label: 'wide group label '.repeat(7) }],
      ...(pinned ? { presentation: { nodes: { a: { position: { x: -200, y: -100 } } } } } : {}),
    });
    const scene = await layoutDiagram(document),
      g = scene.groups[0];
    // Renderer uppercases group headings at 11px with 1.2px letter spacing.
    const headingWidth =
      textWidth(g.semantic.label.toUpperCase(), 11) + g.semantic.label.length * 1.2;
    assert.ok(
      g.width >= headingWidth + 63,
      `group width ${g.width} must fit ${headingWidth + 63}px heading`,
    );
  }
});

test('a human pin preserves unrelated node positions and connector routes', async () => {
  const document = parseDocument(
    JSON.parse(await readFile(new URL('../examples/platform.forma.json', import.meta.url), 'utf8')),
  );
  const original = await layoutDiagram(document);
  const web = original.nodes.find((n) => n.id === 'web')!;
  const pinned = await layoutDiagram(
    patchDocument(document, { overrides: { web: { position: { x: web.x, y: web.y + 40 } } } }),
  );
  for (const n of original.nodes.filter((n) => n.id !== 'web')) {
    const after = pinned.nodes.find((a) => a.id === n.id)!;
    assert.equal(after.x, n.x);
    assert.equal(after.y, n.y);
  }
  for (const e of original.edges.filter(
    (e) => e.semantic.source !== 'web' && e.semantic.target !== 'web',
  ))
    assert.deepEqual(pinned.edges.find((p) => p.id === e.id)!.points, e.points);
  assert.equal(pinned.nodes.find((n) => n.id === 'web')!.y, web.y + 40);
});

test('user IDs cannot collide with engine internals, and disconnected edges are diagnosed', async () => {
  const scene = await layoutDiagram(
    doc({
      nodes: [
        { id: 'root', label: 'Root' },
        { id: 'b', label: 'Child' },
      ],
      edges: [{ id: 'ab', source: 'root', target: 'b' }],
    }),
  );
  assert.deepEqual(
    inspectScene(scene).issues.filter((i) => i.severity === 'error'),
    [],
  );
  scene.edges[0].points[0].x -= 20;
  assert.ok(inspectScene(scene).issues.some((i) => i.code === 'detached-connector'));
});

test('SVG removes XML-forbidden controls and embeds both font weights', async () => {
  const scene = await layoutDiagram(doc({ title: 'A\u0000B' }));
  const svg = renderSvg(scene, {
    fontDataUri: 'data:font/ttf;base64,AAA',
    boldFontDataUri: 'data:font/ttf;base64,BBB',
  });
  assert.ok(!svg.includes('\u0000'));
  assert.ok(svg.includes('font-weight:400'));
  assert.ok(svg.includes('font-weight:600'));
});
