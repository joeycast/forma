import type { Point } from './document';
import type { Scene, Box, SceneNode } from './scene';
import { overlaps, segmentCross, segmentHitsBox, shapeBoundary } from './geometry';
import { textWidth } from './text';
import { selectedAlignmentClusters, type AlignEdge } from './align';
export interface VisualIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  ids: string[];
  location?: { x: number; y: number };
  fix?: { edge: AlignEdge; target: number };
}
export interface InspectionResult {
  fingerprint: string;
  issues: VisualIssue[];
  summary: {
    errors: number;
    warnings: number;
    nodes: number;
    edges: number;
    crossings: number;
    pinned: number;
    density: number;
  };
}

const recentInspections = new Map<string, InspectionResult>();

function inspectionSignature(scene: Scene) {
  return JSON.stringify({
    bounds: scene.bounds,
    nodes: scene.nodes.map((node) => [
      node.id,
      node.semantic.label,
      node.semantic.group,
      node.x,
      node.y,
      node.width,
      node.height,
      node.titleLines,
      node.descriptionLines,
      node.style?.shape,
      node.style?.fontFamily,
      node.style?.fontSize,
      node.style?.fontWeight,
      node.style?.padding,
      node.pinned,
    ]),
    groups: scene.groups.map((group) => [
      group.id,
      group.semantic.label,
      group.semantic.parent,
      group.x,
      group.y,
      group.width,
      group.height,
    ]),
    edges: scene.edges.map((edge) => [
      edge.id,
      edge.semantic.source,
      edge.semantic.target,
      edge.style?.routing,
      edge.points,
      edge.label,
      edge.routingBudgetExceeded,
    ]),
  });
}

export function inspectScene(scene: Scene): InspectionResult {
  const signature = inspectionSignature(scene);
  const cached = recentInspections.get(signature);
  if (cached) {
    recentInspections.delete(signature);
    recentInspections.set(signature, cached);
    return { ...cached, fingerprint: scene.fingerprint };
  }
  const issues: VisualIssue[] = [];
  const add = (code: string, severity: VisualIssue['severity'], message: string, ids: string[]) =>
    issues.push({ code, severity, message, ids });
  const { nodes, groups, edges, bounds } = scene;
  // Sweep by the left edge to avoid testing every distant node pair. The 20px
  // expansion retains every pair that can produce either overlap diagnostic.
  const nodeOrder = nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.x - b.node.x || a.index - b.index);
  const nodeCandidates = new Set<string>();
  for (let a = 0; a < nodeOrder.length; a++) {
    const left = nodeOrder[a];
    for (
      let b = a + 1;
      b < nodeOrder.length && nodeOrder[b].node.x < left.node.x + left.node.width + 20;
      b++
    ) {
      const i = Math.min(left.index, nodeOrder[b].index),
        j = Math.max(left.index, nodeOrder[b].index);
      nodeCandidates.add(`${i}:${j}`);
    }
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (!nodeCandidates.has(`${i}:${j}`)) continue;
      const a = nodes[i],
        b = nodes[j];
      if (overlaps(a, b))
        add(
          'node-overlap',
          'error',
          `${a.semantic.label} overlaps ${b.semantic.label}. Move a pinned node or reset its position.`,
          [a.id, b.id],
        );
      else if (overlaps(a, b, 20))
        add('tight-spacing', 'warning', 'Nodes have less than 20px of breathing room.', [
          a.id,
          b.id,
        ]);
    }
  for (const cluster of selectedAlignmentClusters(nodes)) {
    const labels = cluster.ids
      .map((id) => nodes.find((n) => n.id === id)?.semantic.label ?? id)
      .join(', ');
    issues.push({
      code: 'near-alignment',
      severity: 'warning',
      message: `${cluster.edge} edges of ${labels} are ${cluster.delta}px apart. Snap them to a shared ${cluster.edge} edge.`,
      ids: cluster.ids,
      fix: { edge: cluster.edge, target: cluster.target },
    });
  }
  for (const n of nodes) {
    if (n.style?.fontFamily && n.style.fontFamily !== 'IBM Plex Sans')
      add(
        'font-fallback',
        'warning',
        'Only IBM Plex Sans is bundled and measured. Other font families may use platform fallback; inspect the export.',
        [n.id],
      );
    if (
      n.titleLines.some(
        (l) =>
          textWidth(l, n.style?.fontSize ?? 16, n.style?.fontWeight ?? 600) >
          n.width - 2 * (n.style?.padding ?? 19.5),
      ) ||
      n.descriptionLines.some((l) => textWidth(l, 12) > n.width - 39)
    )
      add('text-clipping', 'error', 'Text exceeds the measured card width.', [n.id]);
    if (
      n.x < bounds.x ||
      n.y < bounds.y ||
      n.x + n.width > bounds.x + bounds.width ||
      n.y + n.height > bounds.y + bounds.height
    )
      add('canvas-clipping', 'error', 'Node extends beyond the export bounds.', [n.id]);
  }
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i],
        b = groups[j];
      if (a.semantic.parent === b.semantic.parent && overlaps(a, b))
        add('group-overlap', 'warning', 'Sibling groups overlap after a manual edit.', [
          a.id,
          b.id,
        ]);
    }
  for (const g of groups)
    for (const n of nodes)
      if (n.semantic.group !== g.id && !isAncestor(g.id, n.semantic.group, scene) && overlaps(g, n))
        add('group-intrusion', 'warning', 'A node sits inside a group it does not belong to.', [
          n.id,
          g.id,
        ]);
  for (const g of groups)
    if (
      textWidth(g.semantic.label.toUpperCase(), 11, 600) + g.semantic.label.length * 1.2 + 63 >
      g.width
    )
      add('group-heading-clipping', 'error', 'The group heading exceeds its container.', [g.id]);
  for (const edge of edges) {
    if (edge.routingBudgetExceeded)
      add(
        'routing-budget-fallback',
        'warning',
        'Automatic routing reached its work budget. The connector remains visible; review its clearance and crossings.',
        [edge.id],
      );
    const onBoundary = (p: Point | undefined, b: SceneNode | undefined) =>
      p &&
      b &&
      Math.hypot(
        p.x - shapeBoundary(b, p, b.style?.shape).x,
        p.y - shapeBoundary(b, p, b.style?.shape).y,
      ) < 1.5;
    if (
      !onBoundary(
        edge.points[0],
        nodes.find((n) => n.id === edge.semantic.source),
      ) ||
      !onBoundary(
        edge.points.at(-1),
        nodes.find((n) => n.id === edge.semantic.target),
      )
    )
      add(
        'detached-connector',
        'error',
        'A connector endpoint does not meet its component boundary.',
        [edge.id],
      );
    if (
      edge.style?.routing !== 'straight' &&
      edge.points.some(
        (p, i) =>
          i > 0 &&
          Math.abs(p.x - edge.points[i - 1].x) > 0.01 &&
          Math.abs(p.y - edge.points[i - 1].y) > 0.01,
      )
    )
      add('nonorthogonal-connector', 'warning', 'A connector contains a diagonal segment.', [
        edge.id,
      ]);
    for (const n of nodes) {
      if (n.id === edge.semantic.source || n.id === edge.semantic.target) continue;
      if (edge.points.some((p, i) => i > 0 && segmentHitsBox(edge.points[i - 1], p, n)))
        add(
          'edge-node-collision',
          'error',
          'A connector passes through a node. Release a conflicting pin or increase spacing.',
          [edge.id, n.id],
        );
    }
    if (edge.label) {
      for (const n of nodes)
        if (overlaps(edge.label, n))
          add('label-overlap', 'error', 'A relationship label overlaps a node.', [edge.id, n.id]);
      for (const g of groups)
        if (overlaps(edge.label, { x: g.x, y: g.y, width: g.width, height: 46 }))
          add('group-label-overlap', 'warning', 'Relationship label overlaps a group heading.', [
            edge.id,
            g.id,
          ]);
    }
  }
  let crossings = 0;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i],
        b = edges[j];
      if (a.label && b.label && overlaps(a.label, b.label))
        add('label-overlap', 'warning', 'Relationship labels overlap.', [a.id, b.id]);
      let cross = false;
      for (let s = 1; s < a.points.length; s++)
        for (let t = 1; t < b.points.length; t++)
          if (segmentCross(a.points[s - 1], a.points[s], b.points[t - 1], b.points[t]))
            cross = true;
      if (cross) {
        crossings++;
        add(
          'edge-crossing',
          'warning',
          'Connectors cross. Consider changing direction or separating branches.',
          [a.id, b.id],
        );
      }
    }
  const nodeArea = nodes.reduce((area, n) => area + n.width * n.height, 0);
  const contentBounds: Box = nodes.length
    ? {
        x: Math.min(...nodes.map((n) => n.x)),
        y: Math.min(...nodes.map((n) => n.y)),
        width: 0,
        height: 0,
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  if (nodes.length) {
    contentBounds.width = Math.max(...nodes.map((n) => n.x + n.width)) - contentBounds.x;
    contentBounds.height = Math.max(...nodes.map((n) => n.y + n.height)) - contentBounds.y;
  }
  const density = nodeArea / (contentBounds.width * contentBounds.height || 1);
  if (nodes.length > 3 && density > 0.78)
    add(
      'high-density',
      'warning',
      'Nodes occupy more than 78% of the composition. Use comfortable spacing.',
      nodes.map((n) => n.id),
    );
  const result: InspectionResult = {
    fingerprint: scene.fingerprint,
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      nodes: nodes.length,
      edges: edges.length,
      crossings,
      pinned: nodes.filter((n) => n.pinned).length,
      density: Math.round(density * 100) / 100,
    },
  };
  recentInspections.set(signature, result);
  if (recentInspections.size > 16) recentInspections.delete(recentInspections.keys().next().value!);
  return result;
}
function isAncestor(ancestor: string, child: string | undefined, scene: Scene): boolean {
  while (child) {
    if (child === ancestor) return true;
    child = scene.groups.find((g) => g.id === child)?.semantic.parent;
  }
  return false;
}
