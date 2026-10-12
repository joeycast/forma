import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDocument,
  patchDocument,
  resolveNodeStyleProperty,
  resolveEdgeStyleProperty,
  resolveEdgeStyle,
  SHAPE_NAMES,
  SHAPE_REGISTRY,
  shapeTextRegion,
  constrainShapeSize,
  styledNodeText,
  resolveNodeVariant,
  serializeDocument,
  layoutDiagram,
  renderSvg,
} from '../packages/core/src';
import { shapeBoundaryPoint, shapePortPoint } from '../packages/core/src/geometry';

const source = {
  version: 2,
  title: 'Foundation',
  nodes: [
    { id: 'a', label: 'Card', kind: 'service', role: 'emphasis', placement: { column: 1, row: 2 } },
  ],
  edges: [],
  groups: [],
  presentation: {
    theme: 'paper',
    nodes: { a: { position: { x: 20, y: 30 }, style: { fill: '#abc', stroke: '#123' } } },
    designSystem: {
      version: 1,
      id: 'test',
      name: 'Test',
      revision: '1',
      node: { fill: '#fff', radius: 10 },
      roles: { emphasis: { stroke: '#f00', radius: 20 } },
    },
  },
} as const;

test('effective node style reports the winning source and per-property reset state', () => {
  const doc = parseDocument(source),
    node = doc.nodes[0];
  assert.deepEqual(resolveNodeStyleProperty(doc, node, 'stroke'), {
    key: 'stroke',
    value: '#123',
    source: 'override',
    overridden: true,
    canReset: true,
  });
  assert.deepEqual(resolveNodeStyleProperty(doc, node, 'radius'), {
    key: 'radius',
    value: 20,
    source: 'role',
    overridden: false,
    canReset: false,
  });
  const builtInDoc = parseDocument({
    version: 2,
    title: 'Built-in',
    nodes: [{ id: 'plain', label: 'Plain' }],
    edges: [],
  });
  assert.deepEqual(resolveNodeStyleProperty(builtInDoc, builtInDoc.nodes[0], 'fill'), {
    key: 'fill',
    value: '#ffffff',
    source: 'builtIn',
    overridden: false,
    canReset: false,
  });
});

test('nullable style, role, placement, and variant patches clear only their own values', () => {
  const doc = parseDocument(source);
  const next = patchDocument(doc, {
    nodes: [{ id: 'a', role: null, placement: null, style: { stroke: null } }],
    overrides: { a: { style: { fill: null }, variant: 'classic' } },
  });
  assert.equal(next.nodes[0].role, undefined);
  assert.equal(next.nodes[0].placement, undefined);
  assert.deepEqual(next.nodes[0].style, undefined);
  assert.equal(next.presentation.nodes.a.style?.fill, undefined);
  assert.equal(next.presentation.nodes.a.style?.stroke, '#123');
  assert.equal(next.presentation.nodes.a.position?.x, 20);
  assert.equal(resolveNodeVariant(next, next.nodes[0]), 'classic');
  assert.equal(
    parseDocument(JSON.parse(serializeDocument(next))).presentation.nodes.a.variant,
    'classic',
  );
});

test('override resets retain prior presentation, including implicit emphasis roles', () => {
  const classic = parseDocument({
    version: 2,
    title: 'Override',
    nodes: [{ id: 'card', label: 'Card' }],
    edges: [],
  });
  const styled = patchDocument(classic, { overrides: { card: { style: { radius: 26 } } } });
  assert.equal(resolveNodeVariant(styled, styled.nodes[0]), 'classic');
  assert.equal(styled.presentation.nodes.card.variant, 'classic');
  const selectedByOverride = patchDocument(classic, {
    overrides: { card: { style: { shape: 'ellipse' } } },
  });
  assert.equal(resolveNodeVariant(selectedByOverride, selectedByOverride.nodes[0]), 'shape');
  const oldStyled = parseDocument({
    version: 2,
    title: 'Legacy override',
    nodes: [{ id: 'card', label: 'Card' }],
    edges: [],
    presentation: { nodes: { card: { style: { fill: '#eee' } } } },
  });
  const cleared = patchDocument(oldStyled, { overrides: { card: { style: null } } });
  assert.equal(resolveNodeVariant(cleared, cleared.nodes[0]), 'shape');

  const legacyShape = parseDocument({
    version: 2,
    title: 'Shape',
    nodes: [{ id: 'ellipse', label: 'Ellipse', style: { shape: 'ellipse', fill: '#eee' } }],
    edges: [],
  });
  const reset = patchDocument(legacyShape, { nodes: [{ id: 'ellipse', style: null }] });
  assert.equal(resolveNodeVariant(reset, reset.nodes[0]), 'shape');

  const roleStyled = parseDocument({
    version: 2,
    title: 'Role',
    nodes: [{ id: 'quiet', label: 'Quiet', emphasis: 'muted' }],
    edges: [],
    presentation: {
      theme: 'paper',
      designSystem: {
        version: 1,
        id: 'roles',
        name: 'Roles',
        revision: '1',
        roles: { quiet: { fill: '#eee' } },
      },
    },
  });
  const edited = patchDocument(roleStyled, { nodes: [{ id: 'quiet', style: { radius: 18 } }] });
  assert.equal(resolveNodeVariant(edited, edited.nodes[0]), 'shape');
});

test('new styled nodes retain legacy shape presentation and edge dash provenance follows rendering', () => {
  const doc = parseDocument({
    version: 2,
    title: 'Style sources',
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', style: 'solid' }],
    presentation: {
      theme: 'paper',
      designSystem: {
        version: 1,
        id: 'line',
        name: 'Line',
        revision: '1',
        edge: { dash: 'dashed' },
      },
    },
  });
  const added = patchDocument(doc, { nodes: [{ id: 'c', label: 'New', style: { radius: 4 } }] });
  assert.equal(
    resolveNodeVariant(
      added,
      added.nodes.find((node) => node.id === 'c')!,
    ),
    'shape',
  );
  const addedWithOverride = patchDocument(doc, {
    nodes: [{ id: 'd', label: 'New' }],
    overrides: { d: { style: { radius: 4 } } },
  });
  assert.equal(
    resolveNodeVariant(
      addedWithOverride,
      addedWithOverride.nodes.find((node) => node.id === 'd')!,
    ),
    'shape',
  );
  assert.deepEqual(resolveEdgeStyleProperty(added, added.edges[0], 'dash'), {
    key: 'dash',
    value: 'dashed',
    source: 'designSystem',
    overridden: false,
    canReset: false,
  });
  assert.equal(resolveEdgeStyle(added, added.edges[0]).dash, 'dashed');
});

test('style-only edits pin legacy classic presentation while explicit shape remains possible', () => {
  const classic = parseDocument({
    version: 2,
    title: 'Classic',
    nodes: [{ id: 'a', label: 'A' }],
    edges: [],
  });
  assert.equal(resolveNodeVariant(classic, classic.nodes[0]), 'classic');
  const styled = patchDocument(classic, { nodes: [{ id: 'a', style: { radius: 24 } }] });
  assert.equal(resolveNodeVariant(styled, styled.nodes[0]), 'classic');
  const shape = patchDocument(styled, { overrides: { a: { variant: 'shape' } } });
  assert.equal(resolveNodeVariant(shape, shape.nodes[0]), 'shape');
  const chosenShape = patchDocument(styled, {
    nodes: [{ id: 'a', style: { shape: 'ellipse' } }],
  });
  assert.equal(resolveNodeVariant(chosenShape, chosenShape.nodes[0]), 'shape');
});

test('radius edits keep classic-card geometry and badges', async () => {
  const original = parseDocument({
    version: 2,
    title: 'Card',
    nodes: [{ id: 'a', label: 'Checkout', kind: 'service' }],
    edges: [],
  });
  const edited = patchDocument(original, { nodes: [{ id: 'a', style: { radius: 26 } }] });
  const [before, after] = await Promise.all([layoutDiagram(original), layoutDiagram(edited)]);
  assert.deepEqual(
    [after.nodes[0].width, after.nodes[0].height, after.nodes[0].variant],
    [before.nodes[0].width, before.nodes[0].height, 'classic'],
  );
  assert.match(renderSvg(after), /SERVICE/);
  assert.match(renderSvg(after), /rx="26"/);
});

test('classic typography, padding, alignment, and vertical alignment are effective', async () => {
  const original = parseDocument({
    version: 2,
    title: 'Typography',
    nodes: [{ id: 'a', label: 'A label that needs several lines in this card' }],
    edges: [],
  });
  const node = original.nodes[0];
  assert.equal(resolveNodeStyleProperty(original, node, 'align').value, 'left');
  assert.equal(resolveNodeStyleProperty(original, node, 'verticalAlign').value, 'top');
  const edited = patchDocument(original, {
    nodes: [
      {
        id: 'a',
        style: { fontSize: 22, padding: 30, height: 40, align: 'center', verticalAlign: 'bottom' },
      },
    ],
  });
  const [before, after] = await Promise.all([layoutDiagram(original), layoutDiagram(edited)]);
  assert.ok(after.nodes[0].height > before.nodes[0].height);
  assert.equal(resolveNodeStyleProperty(edited, edited.nodes[0], 'align').value, 'center');
  assert.equal(resolveNodeStyleProperty(edited, edited.nodes[0], 'verticalAlign').value, 'bottom');
  assert.equal(
    resolveNodeStyleProperty(edited, edited.nodes[0], 'height').value,
    after.nodes[0].height,
  );
  const svg = renderSvg(after);
  assert.match(svg, /font-size="22"/);
  assert.match(svg, /text-anchor="middle"/);
});

test('shape registry keeps accepted new shapes renderable and 1:1 constraints portable', async () => {
  assert.deepEqual(shapeTextRegion('pill', 240, 120, 20), {
    x: 20,
    y: 20,
    width: 200,
    height: 80,
  });
  const triangleText = styledNodeText('Triangle', 'Shared render and connector outline', {
      shape: 'triangle',
    }),
    parallelogramText = styledNodeText('Parallelogram', undefined, {
      shape: 'parallelogram',
    }),
    cloudText = styledNodeText('Cloud', 'Shared render and connector outline', {
      shape: 'cloud',
    });
  assert.deepEqual(triangleText.titleLines, ['Triangle']);
  assert.deepEqual(parallelogramText.titleLines, ['Parallelogram']);
  assert.ok(cloudText.descriptionLines.some((line) => line.includes('connector')));
  const newShapes = SHAPE_NAMES.filter((shape) =>
    ['triangle', 'hexagon', 'parallelogram', 'trapezoid', 'document', 'cloud'].includes(shape),
  );
  const doc = parseDocument({
    version: 2,
    title: 'Shape gallery',
    nodes: newShapes.map((shape, index) => ({
      id: `shape-${index}`,
      label: SHAPE_REGISTRY[shape].label,
      style: { shape },
    })),
    edges: [],
  });
  const scene = await layoutDiagram(doc),
    svg = renderSvg(scene);
  for (const [index, shape] of newShapes.entries()) {
    const path = SHAPE_REGISTRY[shape].path(scene.nodes[index].width, scene.nodes[index].height);
    assert.ok(path, `${shape} has a path`);
    assert.ok(svg.includes(`d="${path}"`), `${shape} path is rendered`);
    assert.ok(shapeTextRegion(shape, 240, 120).width > 0);
    const region = shapeTextRegion(shape, 240, 120),
      outline = SHAPE_REGISTRY[shape].points!(240, 120);
    const contains = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const a = outline[i],
          b = outline[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      return inside;
    };
    for (const [x, y] of [
      [region.x, region.y],
      [region.x + region.width, region.y],
      [region.x, region.y + region.height],
      [region.x + region.width, region.y + region.height],
    ])
      assert.ok(contains(x, y), `${shape} text-region corner is within the outline`);
  }
  for (const shape of SHAPE_NAMES) {
    const box = { x: 10, y: 20, width: 240, height: 120 };
    const boundary = shapeBoundaryPoint(box, { x: 500, y: 80 }, shape);
    const port = shapePortPoint(box, 'right', 0, 1, shape);
    assert.ok(Number.isFinite(boundary.x) && Number.isFinite(boundary.y), `${shape} boundary`);
    assert.ok(Number.isFinite(port.x) && Number.isFinite(port.y), `${shape} port`);
  }
  const circle = styledNodeText('Circle', undefined, { shape: 'ellipse', aspectRatio: 1 });
  const square = styledNodeText('Square', undefined, { shape: 'rect', aspectRatio: 1 });
  assert.equal(circle.width, circle.height);
  assert.equal(square.width, square.height);
  const constrained = constrainShapeSize({ width: 200, height: 90 }, 1, {
    width: 160,
    height: 120,
  });
  assert.equal(constrained.width, constrained.height);
  assert.ok(constrained.height >= 120);
});

test('the six pre-registry shape measurements retain their v2 baseline', () => {
  const expected = {
    rect: [184, 88],
    pill: [184, 88],
    diamond: [184, 176],
    ellipse: [184, 136],
    cylinder: [184, 112],
    text: [184, 88],
  } as const;
  for (const [shape, dimensions] of Object.entries(expected)) {
    const measured = styledNodeText('Compatibility label', 'Existing layout', {
      shape: shape as keyof typeof expected,
    });
    assert.deepEqual([measured.width, measured.height], dimensions, `${shape} baseline`);
  }
});

test('explicit widths on legacy shapes remain exact and keep the old long-label wrapping', () => {
  const cases = {
    rect: [
      [
        928,
        [
          '',
          'A',
          '',
          'l',
          'o',
          'n',
          'g',
          '',
          'c',
          'o',
          'm',
          'p',
          'a',
          't',
          'i',
          'b',
          'i',
          'l',
          'i',
          't',
          'y',
          '',
          'l',
          'a',
          'b',
          'e',
          'l',
        ],
      ],
      [240, ['A', 'long', 'com', 'patib', 'ility', 'label']],
      [136, ['A long', 'compatibil', 'ity label']],
    ],
    pill: [
      [
        928,
        [
          '',
          'A',
          '',
          'l',
          'o',
          'n',
          'g',
          '',
          'c',
          'o',
          'm',
          'p',
          'a',
          't',
          'i',
          'b',
          'i',
          'l',
          'i',
          't',
          'y',
          '',
          'l',
          'a',
          'b',
          'e',
          'l',
        ],
      ],
      [240, ['A', 'long', 'com', 'patib', 'ility', 'label']],
      [136, ['A long', 'compatibil', 'ity label']],
    ],
    diamond: [
      [840, ['A', 'lo', 'ng', 'co', 'm', 'pa', 'tib', 'ilit', 'y', 'la', 'be', 'l']],
      [408, ['A', 'long', 'comp', 'atibili', 'ty', 'label']],
      [304, ['A long', 'compati', 'bility', 'label']],
    ],
    ellipse: [
      [440, ['A', 'lon', 'g', 'co', 'mp', 'ati', 'bili', 'ty', 'lab', 'el']],
      [208, ['A long', 'compa', 'tibility', 'label']],
      [160, ['A long', 'compatibil', 'ity label']],
    ],
    cylinder: [
      [
        952,
        [
          '',
          'A',
          '',
          'l',
          'o',
          'n',
          'g',
          '',
          'c',
          'o',
          'm',
          'p',
          'a',
          't',
          'i',
          'b',
          'i',
          'l',
          'i',
          't',
          'y',
          '',
          'l',
          'a',
          'b',
          'e',
          'l',
        ],
      ],
      [256, ['A', 'long', 'com', 'patib', 'ility', 'label']],
      [160, ['A long', 'compatibil', 'ity label']],
    ],
    text: [
      [
        928,
        [
          '',
          'A',
          '',
          'l',
          'o',
          'n',
          'g',
          '',
          'c',
          'o',
          'm',
          'p',
          'a',
          't',
          'i',
          'b',
          'i',
          'l',
          'i',
          't',
          'y',
          '',
          'l',
          'a',
          'b',
          'e',
          'l',
        ],
      ],
      [240, ['A', 'long', 'com', 'patib', 'ility', 'label']],
      [136, ['A long', 'compatibil', 'ity label']],
    ],
  } as const;
  for (const [shape, measurements] of Object.entries(cases)) {
    for (const [index, width] of [40, 80, 120].entries()) {
      const measured = styledNodeText('A long compatibility label', 'Existing layout', {
        shape: shape as keyof typeof cases,
        width,
      });
      assert.equal(measured.width, width, `${shape} explicit width ${width}`);
      assert.equal(measured.height, measurements[index][0], `${shape} baseline height at ${width}`);
      assert.deepEqual(
        measured.titleLines,
        measurements[index][1],
        `${shape} wrapping at ${width}`,
      );
    }
  }
  const ratioOnly = styledNodeText('Ratio', undefined, { aspectRatio: 1 });
  assert.ok(ratioOnly.titleLines.length > 0);
  // Aspect ratio constrains size; it must not silently change the default rect identity.
  assert.deepEqual(
    ratioOnly,
    styledNodeText('Ratio', undefined, { shape: 'rect', aspectRatio: 1 }),
  );
});

test('design-system changes preserve classic variants when local style objects are empty', async () => {
  const original = parseDocument({
    version: 2,
    title: 'Empty styles',
    nodes: [
      { id: 'node-style', label: 'Node style', kind: 'service', style: {} },
      { id: 'override-style', label: 'Override style', kind: 'service' },
    ],
    edges: [],
    presentation: { nodes: { 'override-style': { style: {} } } },
  });
  const originalScene = await layoutDiagram(original);
  assert.deepEqual(
    original.nodes.map((node) => resolveNodeVariant(original, node)),
    ['classic', 'classic'],
  );
  const styled = patchDocument(original, {
    designSystem: {
      version: 1,
      id: 'added-system',
      name: 'Added system',
      revision: '1',
      node: { fill: '#eeeeee', radius: 24 },
    },
  });
  const styledScene = await layoutDiagram(styled);
  assert.deepEqual(
    styled.nodes.map((node) => resolveNodeVariant(styled, node)),
    ['classic', 'classic'],
  );
  assert.deepEqual(
    styledScene.nodes.map(({ width, height }) => [width, height]),
    originalScene.nodes.map(({ width, height }) => [width, height]),
  );
  assert.equal((renderSvg(styledScene).match(/SERVICE/g) ?? []).length, 2);
  const reset = patchDocument(styled, { designSystem: null });
  assert.deepEqual(
    reset.nodes.map((node) => resolveNodeVariant(reset, node)),
    ['classic', 'classic'],
  );
});
