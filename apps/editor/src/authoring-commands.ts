import {
  parseDocument,
  type Diagram,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
} from '../../../packages/core/src';

export type IdFactory = (prefix: string) => string;
export type ClipboardSelection = Pick<Diagram, 'nodes' | 'edges' | 'groups' | 'presentation'> & {
  sourcePositions: Record<string, { x: number; y: number }>;
};

function descendants(doc: Diagram, ids: Set<string>) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of doc.groups)
      if (group.parent && ids.has(group.parent) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    for (const node of doc.nodes)
      if (node.group && ids.has(node.group) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
  }
  return ids;
}

export function copySelection(
  doc: Diagram,
  ids: string[],
  scenePositions: Record<string, { x: number; y: number }> = {},
): ClipboardSelection {
  const included = descendants(doc, new Set(ids));
  const nodes = doc.nodes.filter((item) => included.has(item.id));
  const groups = doc.groups.filter((item) => included.has(item.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = doc.edges.filter(
    (edge) => included.has(edge.id) || (nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  );
  const includedNodes = new Set(nodes.map((node) => node.id));
  const overrides = Object.fromEntries(
    Object.entries(doc.presentation.nodes).filter(([id]) => includedNodes.has(id)),
  );
  return structuredClone({
    nodes,
    edges,
    groups,
    presentation: { nodes: overrides },
    sourcePositions: Object.fromEntries(
      nodes.flatMap((node) => {
        const position = doc.presentation.nodes[node.id]?.position ?? scenePositions[node.id];
        return position ? [[node.id, structuredClone(position)]] : [];
      }),
    ),
  } as ClipboardSelection);
}

export function pasteSelection(
  doc: Diagram,
  payload: ClipboardSelection,
  makeId: IdFactory,
  offset = { x: 32, y: 32 },
) {
  const sourceIds = [...payload.groups, ...payload.nodes, ...payload.edges].map((item) => item.id);
  const remap = new Map(sourceIds.map((id) => [id, makeId(id.split('-')[0] || 'item')]));
  const targetGroups = new Set(doc.groups.map((group) => group.id));
  const groups: DiagramGroup[] = payload.groups.map((group) => {
    const { parent, ...rest } = structuredClone(group);
    const nextParent =
      parent && (remap.get(parent) ?? (targetGroups.has(parent) ? parent : undefined));
    return { ...rest, id: remap.get(group.id)!, ...(nextParent ? { parent: nextParent } : {}) };
  });
  const nodes: DiagramNode[] = payload.nodes.map((node) => {
    const { group, ...rest } = structuredClone(node);
    const nextGroup = group && (remap.get(group) ?? (targetGroups.has(group) ? group : undefined));
    return { ...rest, id: remap.get(node.id)!, ...(nextGroup ? { group: nextGroup } : {}) };
  });
  const edges: DiagramEdge[] = payload.edges
    .filter((edge) => remap.has(edge.source) && remap.has(edge.target))
    .map((edge) => ({
      ...structuredClone(edge),
      id: remap.get(edge.id)!,
      source: remap.get(edge.source)!,
      target: remap.get(edge.target)!,
      ...(edge.path
        ? { path: edge.path.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }
        : {}),
    }));
  const overrides = Object.fromEntries(
    Object.entries(payload.presentation.nodes).flatMap(([id, value]) => {
      const newId = remap.get(id);
      if (!newId) return [];
      const clone = structuredClone(value);
      if (clone.position)
        clone.position = { x: clone.position.x + offset.x, y: clone.position.y + offset.y };
      return [[newId, clone]];
    }),
  );
  for (const node of nodes) {
    if (overrides[node.id]?.position) continue;
    const source = payload.nodes.find((item) => remap.get(item.id) === node.id)!;
    const sourceOverride = payload.presentation.nodes[source.id];
    const position = sourceOverride?.position ?? payload.sourcePositions[source.id];
    if (position)
      overrides[node.id] = {
        ...structuredClone(sourceOverride ?? {}),
        position: { x: position.x + offset.x, y: position.y + offset.y },
      };
  }
  const next = structuredClone(doc);
  next.groups.push(...groups);
  next.nodes.push(...nodes);
  next.edges.push(...edges);
  Object.assign(next.presentation.nodes, overrides);
  return { doc: parseDocument(next), ids: [...nodes, ...groups, ...edges].map((item) => item.id) };
}

export function groupSelection(
  doc: Diagram,
  ids: string[],
  makeId: IdFactory,
  label = 'New group',
) {
  const nodeIds = new Set(ids.filter((id) => doc.nodes.some((node) => node.id === id)));
  const groupIds = new Set(ids.filter((id) => doc.groups.some((group) => group.id === id)));
  if (!nodeIds.size && !groupIds.size) return { doc, groupId: null as string | null };
  const groupId = makeId('group');
  const next = structuredClone(doc);
  next.groups.push({ id: groupId, label, color: 'slate' });
  next.nodes = next.nodes.map((node) =>
    nodeIds.has(node.id) && !(node.group && groupIds.has(node.group))
      ? { ...node, group: groupId }
      : node,
  );
  next.groups = next.groups.map((group) =>
    groupIds.has(group.id) && !(group.parent && groupIds.has(group.parent))
      ? { ...group, parent: groupId }
      : group,
  );
  return { doc: parseDocument(next), groupId };
}

export function ungroupSelection(doc: Diagram, ids: string[]) {
  const groups = ids.filter((id) => doc.groups.some((group) => group.id === id));
  if (!groups.length) return doc;
  const next = structuredClone(doc);
  const removed = new Set(groups);
  const parentAfterRemoval = (groupId: string): string | undefined => {
    let parent = doc.groups.find((group) => group.id === groupId)?.parent;
    while (parent && removed.has(parent))
      parent = doc.groups.find((group) => group.id === parent)?.parent;
    return parent;
  };
  next.nodes = next.nodes.map((node) =>
    node.group && removed.has(node.group)
      ? { ...node, group: parentAfterRemoval(node.group) }
      : node,
  );
  next.groups = next.groups
    .filter((group) => !groups.includes(group.id))
    .map((group) =>
      group.parent && removed.has(group.parent)
        ? { ...group, parent: parentAfterRemoval(group.parent) }
        : group,
    );
  return parseDocument(next);
}
