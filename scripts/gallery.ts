import { writeFile, mkdir } from 'node:fs/promises';
import {
  parseDocument,
  serializeDocument,
  atelier,
  signal,
  type DesignSystem,
} from '../packages/core/src/index';
const dir = new URL('../examples/gallery/', import.meta.url);
async function save(
  name: string,
  title: string,
  description: string,
  nodes: unknown[],
  edges: unknown[],
  extra: Record<string, unknown> = {},
) {
  const doc = parseDocument({
    version: 2,
    title,
    description,
    nodes,
    edges,
    presentation: { designSystem: atelier },
    ...extra,
  });
  await writeFile(new URL(`${name}.forma.json`, dir), serializeDocument(doc));
  return doc;
}
const node = (id: string, label: string, description = '', extra = {}) => ({
  id,
  label,
  description,
  ...extra,
});
const edge = (source: string, target: string, label?: string, extra = {}) => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(label ? { label } : {}),
  ...extra,
});
await save(
  'architecture',
  'A platform built around clear boundaries',
  '01 / SYSTEMS     A focused view of the checkout path and its asynchronous work.',
  [
    node('customer', 'Customer', 'Browses and buys', {
      kind: 'person',
      group: 'experience',
      style: { shape: 'pill' },
      role: 'emphasis',
    }),
    node('storefront', 'Storefront', 'Web application', { group: 'experience' }),
    node('api', 'Checkout API', 'Owns the purchase boundary', {
      group: 'services',
      role: 'emphasis',
    }),
    node('orders', 'Order store', 'Durable purchase records', {
      kind: 'database',
      group: 'data',
      style: { shape: 'cylinder' },
    }),
    node('events', 'Event queue', 'Order placed', { kind: 'queue', group: 'data' }),
    node('fulfillment', 'Fulfillment', 'Asynchronous processing', { group: 'services' }),
  ],
  [
    edge('customer', 'storefront'),
    edge('storefront', 'api', 'HTTPS'),
    edge('api', 'orders', 'write'),
    edge('api', 'events', 'publish'),
    edge('events', 'fulfillment', 'consume'),
  ],
  {
    groups: [
      { id: 'experience', label: 'Customer experience' },
      { id: 'services', label: 'Application services' },
      { id: 'data', label: 'Persistence' },
    ],
  },
);
await save(
  'decision',
  'Every release earns its way to production',
  '02 / DECISIONS     Keep the happy path direct. Make the exception legible.',
  [
    node('change', 'Proposed change', 'Small, reviewable increment', {
      placement: { column: 0, row: 0 },
      style: { shape: 'pill' },
      role: 'quiet',
    }),
    node('checks', 'Run quality checks', 'Tests · security · compatibility', {
      placement: { column: 0, row: 1 },
    }),
    node('gate', 'Ready to ship?', '', {
      placement: { column: 0, row: 2 },
      style: { shape: 'diamond', width: 220 },
      role: 'caution',
    }),
    node('ship', 'Deploy safely', 'Observe the rollout', {
      placement: { column: 0, row: 3 },
      role: 'emphasis',
      style: { shape: 'pill' },
    }),
    node('revise', 'Revise the change', 'Use feedback to reduce uncertainty', {
      placement: { column: 1, row: 2 },
    }),
  ],
  [
    edge('change', 'checks'),
    edge('checks', 'gate'),
    edge('gate', 'ship', 'Yes'),
    edge('gate', 'revise', 'No', { appearance: { sourcePort: 'right', targetPort: 'left' } }),
    edge('revise', 'checks', 'Retry', {
      style: 'dashed',
      appearance: { sourcePort: 'top', targetPort: 'right' },
    }),
  ],
  { layout: { mode: 'grid', direction: 'DOWN' } },
);
await save(
  'organization',
  'A small team with explicit ownership',
  '03 / ORGANIZATION     Reporting lines show accountability; descriptions show the work.',
  [
    node('head', 'Head of product', 'Product & engineering', {
      role: 'emphasis',
      style: { width: 240 },
    }),
    node('design', 'Design lead', 'Research · interaction'),
    node('eng', 'Engineering lead', 'Delivery · reliability'),
    node('designers', 'Product designers', 'Experience quality', { role: 'quiet' }),
    node('platform', 'Platform team', 'Shared infrastructure', { role: 'quiet' }),
    node('product', 'Product team', 'Customer outcomes', { role: 'quiet' }),
  ],
  [
    edge('head', 'design'),
    edge('head', 'eng'),
    edge('design', 'designers'),
    edge('eng', 'platform'),
    edge('eng', 'product'),
  ],
  {
    layout: { direction: 'DOWN' },
    presentation: { designSystem: { ...atelier, edge: { ...atelier.edge, arrowEnd: 'none' } } },
  },
);
await save(
  'entities',
  'Orders are the center of the model',
  '04 / DATA MODEL     Keys and cardinalities describe ownership without hiding the data.',
  [
    node('customers', 'Customer', 'PK  customer_id\nname\nemail', { kind: 'entity' }),
    node('orders', 'Order', 'PK  order_id\nFK  customer_id\nplaced_at · status', {
      kind: 'entity',
      role: 'emphasis',
    }),
    node(
      'items',
      'Order item',
      'PK  item_id\nFK  order_id\nFK  product_id\nquantity · unit_price',
      { kind: 'entity' },
    ),
    node('products', 'Product', 'PK  product_id\nname\ncurrent_price', { kind: 'entity' }),
  ],
  [
    edge('customers', 'orders', '1 → many'),
    edge('orders', 'items', '1 → many'),
    edge('products', 'items', '1 → many'),
  ],
  {
    presentation: {
      designSystem: {
        ...atelier,
        node: { ...atelier.node, width: 240 },
        edge: { ...atelier.edge, arrowEnd: 'none' },
      },
    },
  },
);
await save(
  'timeline',
  'A deliberate path from discovery to launch',
  '05 / ROADMAP     Equal spacing denotes phases, not elapsed calendar time.',
  [
    node('discover', '01 / Discover', 'Weeks 1–2\nInterviews & evidence', {
      placement: { column: 0, row: 0 },
    }),
    node('prototype', '02 / Prototype', 'Weeks 3–4\nTest the riskiest idea', {
      placement: { column: 1, row: 0 },
    }),
    node('build', '03 / Build', 'Weeks 5–8\nDeliver in small slices', {
      placement: { column: 2, row: 0 },
      role: 'emphasis',
    }),
    node('launch', '04 / Launch', 'Week 9\nMeasure & learn', {
      placement: { column: 3, row: 0 },
      role: 'caution',
    }),
  ],
  [edge('discover', 'prototype'), edge('prototype', 'build'), edge('build', 'launch')],
  {
    layout: { mode: 'grid' },
    presentation: {
      designSystem: {
        ...atelier,
        node: { ...atelier.node, width: 210 },
        spacing: { layer: 88, node: 48 },
      },
    },
  },
);
await save(
  'mindmap',
  'What makes an effective developer experience?',
  '06 / EXPLORATION     Read from the central question to the contributing capabilities.',
  [
    node('center', 'Developer experience', 'Fast feedback. Clear intent.', {
      placement: { column: 1, row: 1 },
      role: 'emphasis',
      style: { shape: 'ellipse', width: 270 },
    }),
    node('feedback', 'Feedback', 'Tests · preview · observability', {
      placement: { column: 1, row: 0 },
    }),
    node('flow', 'Flow', 'Small batches · fewer handoffs', { placement: { column: 0, row: 1 } }),
    node('clarity', 'Clarity', 'Ownership · documentation', { placement: { column: 2, row: 1 } }),
    node('safety', 'Safety', 'Reversible changes · guardrails', {
      placement: { column: 1, row: 2 },
    }),
  ],
  [
    edge('center', 'feedback'),
    edge('center', 'flow'),
    edge('center', 'clarity'),
    edge('center', 'safety'),
  ],
  {
    layout: { mode: 'grid' },
    presentation: {
      designSystem: {
        ...atelier,
        edge: { ...atelier.edge, arrowEnd: 'none', routing: 'straight' },
      },
    },
  },
);
const custom = await save(
  'development',
  'More creation. The same verification bottleneck.',
  'A custom visual explanation / Parallel generation changes where engineering attention is needed.',
  [
    node('brief', 'Brief', 'One work stream', {
      group: 'traditional',
      placement: { column: 0, row: 0 },
      style: { width: 150 },
      role: 'quiet',
    }),
    node('implement', 'Implement', 'Serial development', {
      group: 'traditional',
      placement: { column: 0, row: 1 },
      style: { width: 150 },
    }),
    node('review', 'Review', 'One change at a time', {
      group: 'traditional',
      placement: { column: 0, row: 2 },
      style: { width: 150 },
    }),
    node('deliver', 'Deliver', 'Steady throughput', {
      group: 'traditional',
      placement: { column: 0, row: 3 },
      style: { width: 150 },
      role: 'quiet',
    }),
    node('intent', 'Shared intent', 'One clear specification', {
      group: 'enabled',
      placement: { column: 2, row: 0 },
      role: 'emphasis',
    }),
    node('streamA', 'Explore', 'Alternative approaches', {
      group: 'enabled',
      placement: { column: 1, row: 1 },
    }),
    node('streamB', 'Implement', 'Parallel work packages', {
      group: 'enabled',
      placement: { column: 2, row: 1 },
    }),
    node('streamC', 'Test', 'Independent checks', {
      group: 'enabled',
      placement: { column: 3, row: 1 },
    }),
    node('verify', 'Verify & integrate', 'Human attention is finite', {
      group: 'enabled',
      placement: { column: 2, row: 2 },
      role: 'caution',
      style: {
        fill: '#fff0be',
        stroke: '#4a4a45',
        dash: 'dashed',
        radius: 0,
        text: '#243b30',
        secondary: '#657367',
        fontFamily: 'IBM Plex Sans',
        fontSize: 18,
        strokeWidth: 2,
      },
    }),
    node('release', 'Release with confidence', 'Verified outcomes, not generated volume', {
      group: 'enabled',
      placement: { column: 2, row: 3 },
      role: 'emphasis',
    }),
  ],
  [
    edge('brief', 'implement'),
    edge('implement', 'review'),
    edge('review', 'deliver'),
    edge('intent', 'streamA'),
    edge('intent', 'streamB'),
    edge('intent', 'streamC'),
    edge('streamA', 'verify'),
    edge('streamB', 'verify'),
    edge('streamC', 'verify'),
    edge('verify', 'release', undefined, {
      appearance: { dash: 'dotted', arrowEnd: 'open', strokeWidth: 2 },
    }),
  ],
  {
    layout: { mode: 'grid', direction: 'DOWN' },
    groups: [
      { id: 'traditional', label: 'Traditional' },
      { id: 'enabled', label: 'AI-enabled' },
    ],
    presentation: {
      designSystem: {
        ...atelier,
        spacing: { node: 64, layer: 80 },
        node: { ...atelier.node, width: 220 },
        edge: { ...atelier.edge, routing: 'straight' },
      },
    },
  },
);
await writeFile(
  new URL('development-signal.forma.json', dir),
  serializeDocument(
    parseDocument({
      ...custom,
      presentation: {
        ...custom.presentation,
        designSystem: {
          ...signal,
          spacing: { node: 64, layer: 80 },
          node: { ...signal.node, width: 220 },
          edge: { ...signal.edge, routing: 'straight' },
        },
      },
    }),
  ),
);
for (const system of [atelier, signal])
  await writeFile(
    new URL(`../examples/design-systems/${system.id}.json`, import.meta.url),
    JSON.stringify(system, null, 2) + '\n',
  );
console.log('Generated 8 native examples and 2 design systems.');
