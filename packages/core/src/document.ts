import { z } from 'zod';
import { elementStyleSchema, designSystemSchema, type PortSide } from './styles';

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/);
const text = z.string().max(2000);
const color = z.enum(['slate', 'blue', 'teal', 'amber', 'violet']);
const position = z
  .object({
    x: z.number().finite().min(-10000).max(10000),
    y: z.number().finite().min(-10000).max(10000),
  })
  .strict();
const portCount = z.number().int().min(1).max(12);
export const portCountsSchema = z
  .object({
    top: portCount.optional(),
    right: portCount.optional(),
    bottom: portCount.optional(),
    left: portCount.optional(),
  })
  .strict();
export type PortCounts = z.infer<typeof portCountsSchema>;
export const nodeSchema = z
  .object({
    id,
    label: z.string().min(1).max(240),
    description: text.optional(),
    kind: z.string().min(1).max(80).default('service'),
    role: id.optional(),
    style: elementStyleSchema.optional(),
    placement: z
      .object({ column: z.number().int().min(0).max(50), row: z.number().int().min(0).max(50) })
      .strict()
      .optional(),
    group: id.optional(),
    emphasis: z.enum(['normal', 'primary', 'muted']).default('normal'),
    ports: portCountsSchema.optional(),
  })
  .strict();
export const edgeSchema = z
  .object({
    id,
    source: id,
    target: id,
    label: z.string().max(120).optional(),
    style: z.enum(['solid', 'dashed']).default('solid'),
    role: id.optional(),
    appearance: elementStyleSchema.optional(),
    path: z.array(position).min(1).max(24).optional(),
  })
  .strict();
export const groupSchema = z
  .object({
    id,
    label: z.string().min(1).max(120),
    parent: id.optional(),
    role: id.optional(),
    style: elementStyleSchema.optional(),
    description: text.optional(),
    color: color.default('slate'),
  })
  .strict();
export const documentSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    title: z.string().min(1).max(200),
    description: text.optional(),
    type: z.string().min(1).max(80).default('diagram'),
    nodes: z.array(nodeSchema).max(200),
    edges: z.array(edgeSchema).max(600),
    groups: z.array(groupSchema).max(40).default([]),
    layout: z
      .object({
        mode: z.enum(['layered', 'grid']).optional(),
        direction: z.enum(['RIGHT', 'DOWN']).default('RIGHT'),
        spacing: z.enum(['comfortable', 'compact']).default('comfortable'),
      })
      .strict()
      .default({ direction: 'RIGHT', spacing: 'comfortable' }),
    presentation: z
      .object({
        theme: z.enum(['paper', 'midnight']).default('paper'),
        designSystem: designSystemSchema.optional(),
        nodes: z
          .record(
            id,
            z
              .object({
                position: position.optional(),
                color: color.optional(),
                style: elementStyleSchema.optional(),
              })
              .strict(),
          )
          .default({}),
      })
      .strict()
      .default({ theme: 'paper', nodes: {} }),
  })
  .strict();
export type Diagram = z.infer<typeof documentSchema>;
export type DiagramNode = Diagram['nodes'][number];
export type DiagramEdge = Diagram['edges'][number];
export type DiagramGroup = Diagram['groups'][number];
export type Accent = z.infer<typeof color>;
export type Point = z.infer<typeof position>;
export type NodeOverride = Diagram['presentation']['nodes'][string];
export class DocumentError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'DocumentError';
  }
}
export function parseDocument(input: unknown): Diagram {
  const source =
    input &&
    typeof input === 'object' &&
    (input as Record<string, unknown>).version === 1 &&
    !('type' in input)
      ? { ...input, type: 'architecture' }
      : input;
  const result = documentSchema.safeParse(source);
  if (!result.success)
    throw new DocumentError(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  const doc = result.data;
  const issues: { path: string; message: string }[] = [];
  if (doc.version === 1 && hasV2Features(doc))
    issues.push({
      path: 'version',
      message: 'General composition and styles require version 2. Use forma migrate.',
    });
  if (doc.layout.mode === 'grid') {
    const cells = new Set<string>();
    for (const [i, n] of doc.nodes.entries()) {
      const p = n.placement ?? { column: i, row: 0 };
      const cell = `${p.column}:${p.row}`;
      if (cells.has(cell))
        issues.push({ path: `nodes.${n.id}.placement`, message: 'Grid cell already occupied' });
      cells.add(cell);
    }
  }
  const seen = new Set<string>();
  for (const [collection, values] of Object.entries({
    nodes: doc.nodes,
    edges: doc.edges,
    groups: doc.groups,
  })) {
    for (const item of values) {
      if (seen.has(item.id)) issues.push({ path: collection, message: `Duplicate ID: ${item.id}` });
      seen.add(item.id);
    }
  }
  const nodes = new Set(doc.nodes.map((n) => n.id));
  const groups = new Map(doc.groups.map((g) => [g.id, g]));
  for (const n of doc.nodes)
    if (n.group && !groups.has(n.group))
      issues.push({ path: `nodes.${n.id}.group`, message: 'Unknown group' });
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const e of doc.edges) {
    for (const side of ['source', 'target'] as const)
      if (!nodes.has(e[side]))
        issues.push({ path: `edges.${e.id}.${side}`, message: `Unknown node: ${e[side]}` });
    const source = nodeById.get(e.source),
      target = nodeById.get(e.target);
    if (source)
      checkPortIndex(
        issues,
        e.id,
        'source',
        e.appearance?.sourcePort,
        e.appearance?.sourceIndex,
        source.ports,
        doc.layout.direction,
      );
    if (target)
      checkPortIndex(
        issues,
        e.id,
        'target',
        e.appearance?.targetPort,
        e.appearance?.targetIndex,
        target.ports,
        doc.layout.direction,
      );
  }
  for (const g of doc.groups) {
    if (g.parent && !groups.has(g.parent))
      issues.push({ path: `groups.${g.id}.parent`, message: 'Unknown parent' });
    const chain = new Set([g.id]);
    let parent = g.parent;
    while (parent && groups.has(parent)) {
      if (chain.has(parent)) {
        issues.push({ path: `groups.${g.id}.parent`, message: 'Group hierarchy cycle' });
        break;
      }
      chain.add(parent);
      parent = groups.get(parent)?.parent;
    }
  }
  for (const key of Object.keys(doc.presentation.nodes))
    if (!nodes.has(key))
      issues.push({
        path: `presentation.nodes.${key}`,
        message: 'Override references unknown node',
      });
  if (issues.length) throw new DocumentError(issues);
  return doc;
}
export const patchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: text.optional(),
    nodes: z.array(z.object({ id }).passthrough()).optional(),
    edges: z.array(z.object({ id }).passthrough()).optional(),
    groups: z.array(z.object({ id }).passthrough()).optional(),
    remove: z
      .object({
        nodes: z.array(id).optional(),
        edges: z.array(id).optional(),
        groups: z.array(id).optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        mode: z.enum(['layered', 'grid']).optional(),
        direction: z.enum(['RIGHT', 'DOWN']).optional(),
        spacing: z.enum(['comfortable', 'compact']).optional(),
      })
      .strict()
      .optional(),
    theme: z.enum(['paper', 'midnight']).optional(),
    designSystem: designSystemSchema.nullable().optional(),
    overrides: z
      .record(
        id,
        z
          .object({
            position: position.nullable().optional(),
            color: color.nullable().optional(),
            style: elementStyleSchema.nullable().optional(),
          })
          .strict()
          .nullable(),
      )
      .optional(),
  })
  .strict();
export type Patch = z.input<typeof patchSchema>;
/** Transactional: validate the entire result; input is never mutated. */
export function patchDocument(input: Diagram, raw: unknown): Diagram {
  const doc = structuredClone(parseDocument(input));
  const patch = patchSchema.parse(raw);
  if (patch.title !== undefined) doc.title = patch.title;
  if (patch.description !== undefined) doc.description = patch.description;
  if (patch.layout) Object.assign(doc.layout, patch.layout);
  if (patch.theme) doc.presentation.theme = patch.theme;
  if (patch.designSystem === null) delete doc.presentation.designSystem;
  else if (patch.designSystem) doc.presentation.designSystem = patch.designSystem;
  for (const key of ['nodes', 'edges', 'groups'] as const) {
    const map = new Map<string, Record<string, unknown>>(doc[key].map((n) => [n.id, { ...n }]));
    for (const item of patch[key] ?? []) {
      const prior = map.get(item.id);
      const next = { ...prior, ...item };
      for (const field of ['style', 'appearance', 'ports'] as const) {
        if (item[field] === null) {
          delete next[field];
          continue;
        }
        if (item[field] && typeof item[field] === 'object') {
          const merged: Record<string, unknown> = {
            ...((prior?.[field] as Record<string, unknown>) ?? {}),
            ...(item[field] as Record<string, unknown>),
          };
          for (const [key, value] of Object.entries(merged)) if (value === null) delete merged[key];
          if (Object.keys(merged).length) next[field] = merged;
          else delete next[field];
        }
      }
      if (next.path === null) delete next.path;
      map.set(item.id, next);
    }
    for (const keyToRemove of patch.remove?.[key] ?? []) map.delete(keyToRemove);
    (doc[key] as unknown) = [...map.values()];
  }
  const removedNodes = new Set(patch.remove?.nodes ?? []);
  doc.edges = doc.edges.filter((e) => !removedNodes.has(e.source) && !removedNodes.has(e.target));
  for (const key of removedNodes) delete doc.presentation.nodes[key];
  const removedGroups = new Set(patch.remove?.groups ?? []);
  for (const n of doc.nodes) if (n.group && removedGroups.has(n.group)) delete n.group;
  for (const g of doc.groups) if (g.parent && removedGroups.has(g.parent)) delete g.parent;
  for (const [key, value] of Object.entries(patch.overrides ?? {})) {
    if (value === null) {
      delete doc.presentation.nodes[key];
      continue;
    }
    const merged: Record<string, unknown> = { ...doc.presentation.nodes[key] };
    for (const [k, v] of Object.entries(value)) {
      if (v === null) delete merged[k];
      else merged[k] = k === 'style' ? { ...((merged[k] as object) ?? {}), ...(v as object) } : v;
    }
    if (Object.keys(merged).length) doc.presentation.nodes[key] = merged as NodeOverride;
    else delete doc.presentation.nodes[key];
  }
  if (hasV2Features(doc)) doc.version = 2;
  return parseDocument(doc);
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function serializeDocument(doc: Diagram): string {
  return JSON.stringify(stable(parseDocument(doc)), null, 2) + '\n';
}
export function fingerprint(doc: Diagram): string {
  let hash = 2166136261;
  for (const ch of serializeDocument(doc)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function portCountOn(ports: PortCounts | undefined, side: PortSide) {
  return ports?.[side] ?? 1;
}
function checkPortIndex(
  issues: { path: string; message: string }[],
  edgeId: string,
  end: 'source' | 'target',
  side: PortSide | undefined,
  index: number | undefined,
  ports: PortCounts | undefined,
  direction: 'RIGHT' | 'DOWN',
) {
  if (index === undefined) return;
  const chosen =
    side ??
    (direction === 'DOWN'
      ? end === 'source'
        ? 'bottom'
        : 'top'
      : end === 'source'
        ? 'right'
        : 'left');
  const count = portCountOn(ports, chosen);
  if (index >= count)
    issues.push({
      path: `edges.${edgeId}.appearance.${end}Index`,
      message: `Port ${index} is outside ${chosen} (${count} ${count === 1 ? 'point' : 'points'})`,
    });
}
function hasV2Features(doc: Diagram): boolean {
  return !!(
    !['architecture', 'flow'].includes(doc.type) ||
    doc.presentation.designSystem ||
    doc.layout.mode ||
    doc.nodes.some(
      (n) =>
        n.style ||
        n.role ||
        n.placement ||
        n.ports ||
        !['service', 'database', 'queue', 'person', 'process', 'decision', 'client'].includes(
          n.kind,
        ),
    ) ||
    doc.edges.some((e) => e.appearance || e.role || e.path) ||
    doc.groups.some((g) => g.style || g.role) ||
    Object.values(doc.presentation.nodes).some((n) => n.style)
  );
}
/** Explicit, lossless upgrade. v1 files remain v1 until migration or use of a v2 feature. */
export function migrateDocument(input: unknown): Diagram {
  const doc = parseDocument(input);
  return parseDocument({ ...doc, version: 2 });
}
