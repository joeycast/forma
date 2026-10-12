import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../packages/core/src';
import {
  copySelection,
  groupSelection,
  pasteSelection,
  ungroupSelection,
} from '../apps/editor/src/authoring-commands';

const sample = parseDocument({
  version: 2,
  title: 'Commands',
  nodes: [
    { id: 'node-a', label: 'A', group: 'group-a' },
    { id: 'node-b', label: 'B' },
    { id: 'node-c', label: 'C' },
  ],
  groups: [{ id: 'group-a', label: 'Original group', color: 'slate' }],
  edges: [
    {
      id: 'edge-ab',
      source: 'node-a',
      target: 'node-b',
      label: 'internal',
      path: [{ x: 20, y: 30 }],
    },
    { id: 'edge-bc', source: 'node-b', target: 'node-c' },
  ],
  presentation: {
    theme: 'paper',
    nodes: {
      'node-a': { position: { x: 10, y: 20 }, variant: 'shape', style: { shape: 'diamond' } },
    },
  },
});

test('copy and paste remaps node IDs, internal edges, groups and overrides with nearby pins', () => {
  let sequence = 0;
  const makeId = (prefix: string) => `${prefix}-copy${++sequence}`;
  const payload = copySelection(sample, ['node-a', 'node-b'], { 'node-b': { x: 50, y: 60 } });
  const changedAfterCopy = parseDocument({
    ...sample,
    presentation: {
      ...sample.presentation,
      nodes: { ...sample.presentation.nodes, 'node-b': { position: { x: 900, y: 900 } } },
    },
  });
  const result = pasteSelection(changedAfterCopy, payload, makeId, { x: 32, y: 32 });
  assert.equal(result.doc.nodes.length, 5);
  assert.equal(result.doc.edges.length, 3);
  const a = result.doc.nodes.find((node) => node.id === 'node-copy1');
  const b = result.doc.nodes.find((node) => node.id === 'node-copy2');
  assert.ok(a && b);
  assert.equal(result.doc.edges.find((edge) => edge.id === 'edge-copy3')?.source, a.id);
  assert.equal(result.doc.edges.find((edge) => edge.id === 'edge-copy3')?.target, b.id);
  assert.deepEqual(result.doc.edges.find((edge) => edge.id === 'edge-copy3')?.path, [
    { x: 52, y: 62 },
  ]);
  assert.deepEqual(result.doc.presentation.nodes[a.id].position, { x: 42, y: 52 });
  assert.deepEqual(result.doc.presentation.nodes[b.id].position, { x: 82, y: 92 });
  assert.equal(result.doc.presentation.nodes[a.id].variant, 'shape');
  assert.ok(!result.doc.edges.some((edge) => edge.id === 'edge-copy4'));
});

test('group and ungroup selection preserve valid membership', () => {
  let nextId = 0;
  const grouped = groupSelection(sample, ['node-a', 'node-b'], () => `group-${++nextId}`);
  assert.equal(grouped.doc.nodes.find((node) => node.id === 'node-a')?.group, grouped.groupId);
  assert.equal(grouped.doc.nodes.find((node) => node.id === 'node-b')?.group, grouped.groupId);
  const flat = ungroupSelection(grouped.doc, [grouped.groupId!]);
  assert.equal(flat.groups.length, sample.groups.length);
  assert.ok(flat.nodes.every((node) => !node.group));
});

test('pasting a group remaps its descendants and their membership', () => {
  const payload = copySelection(sample, ['group-a']);
  let sequence = 0;
  const result = pasteSelection(sample, payload, (prefix: string) => `${prefix}-copy${++sequence}`);
  const pastedGroup = result.doc.groups.find((group) => group.id === 'group-copy1');
  const pastedNode = result.doc.nodes.find((node) => node.id === 'node-copy2');
  assert.ok(pastedGroup && pastedNode);
  assert.equal(pastedNode.group, pastedGroup.id);
});

test('pasting across documents strips group references that do not exist in the target', () => {
  const target = parseDocument({
    version: 2,
    title: 'Other document',
    nodes: [],
    groups: [],
    edges: [],
  });
  const nodePayload = copySelection(sample, ['node-a']);
  const detachedNode = pasteSelection(target, nodePayload, () => 'node-detached');
  assert.equal(detachedNode.doc.nodes[0].group, undefined);
  assert.equal(detachedNode.doc.groups.length, 0);

  const nested = parseDocument({
    version: 2,
    title: 'Nested source',
    nodes: [{ id: 'child-node', label: 'Child', group: 'child-group' }],
    groups: [
      { id: 'root-group', label: 'Root', color: 'slate' },
      { id: 'child-group', label: 'Child group', parent: 'root-group', color: 'blue' },
    ],
    edges: [],
  });
  const groupPayload = copySelection(nested, ['child-group']);
  let sequence = 0;
  const pastedGroup = pasteSelection(target, groupPayload, () => `copy-${++sequence}`);
  assert.equal(pastedGroup.doc.groups[0].parent, undefined);
  assert.equal(pastedGroup.doc.nodes[0].group, pastedGroup.doc.groups[0].id);
});

test('pasting preserves an external group reference that exists in the target document', () => {
  const target = parseDocument({
    version: 2,
    title: 'Other document',
    nodes: [],
    groups: [{ id: 'group-a', label: 'Shared target group', color: 'slate' }],
    edges: [],
  });
  const result = pasteSelection(target, copySelection(sample, ['node-a']), () => 'node-copy');
  assert.equal(result.doc.nodes[0].group, 'group-a');
});

test('grouping an ancestor and its descendant preserves their hierarchy', () => {
  const nested = parseDocument({
    version: 2,
    title: 'Nested',
    nodes: [{ id: 'nested-node', label: 'Nested', group: 'child-group' }],
    groups: [
      { id: 'root-group', label: 'Root', color: 'slate' },
      { id: 'child-group', label: 'Child', parent: 'root-group', color: 'blue' },
    ],
    edges: [],
  });
  const result = groupSelection(nested, ['root-group', 'child-group'], () => 'wrapper-group');
  assert.equal(
    result.doc.groups.find((group) => group.id === 'root-group')?.parent,
    'wrapper-group',
  );
  assert.equal(result.doc.groups.find((group) => group.id === 'child-group')?.parent, 'root-group');
  assert.equal(result.doc.nodes[0].group, 'child-group');
});

test('ungrouping a nested group reparents its children to the surviving parent', () => {
  const nested = parseDocument({
    version: 2,
    title: 'Nested',
    nodes: [{ id: 'direct-node', label: 'Direct', group: 'middle-group' }],
    groups: [
      { id: 'root-group', label: 'Root', color: 'slate' },
      { id: 'middle-group', label: 'Middle', parent: 'root-group', color: 'blue' },
      { id: 'child-group', label: 'Child', parent: 'middle-group', color: 'teal' },
    ],
    edges: [],
  });
  const result = ungroupSelection(nested, ['middle-group']);
  assert.equal(result.nodes[0].group, 'root-group');
  assert.equal(result.groups.find((group) => group.id === 'child-group')?.parent, 'root-group');
});
