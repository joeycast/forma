import { resolveNodeStyle, resolveEdgeStyle, resolveGroupStyle } from './resolve-style';
import type { ElkNode, ElkExtendedEdge, ELK } from 'elkjs';
import { fingerprint, parseDocument, type Diagram, type Point } from './document';
import { nodeText, styledNodeText, textWidth, wrapText } from './text';
import type { Box, Scene, SceneEdge, SceneGroup, SceneNode } from './scene';
import { overlaps, routeBetween, simplify, segmentHitsBox, shapeBoundary } from './geometry';
let elkPromise: Promise<ELK> | undefined;
const groupMinWidth = (label: string) =>
  Math.max(180, Math.ceil(textWidth(label.toUpperCase(), 11, 600) + label.length * 1.2 + 64));

export async function layoutDiagram(input: Diagram): Promise<Scene> {
  const elk = await (elkPromise ??= import('elkjs/lib/elk.bundled.js').then(
    (module) => new module.default(),
  ));
  const doc = parseDocument(input),
    compact = doc.layout.spacing === 'compact';
  const system = doc.presentation.designSystem;
  const nodeStyles = new Map(doc.nodes.map((n) => [n.id, resolveNodeStyle(doc, n)]));
  const measured = new Map(
    doc.nodes.map((n) => {
      const style = nodeStyles.get(n.id)!;
      return [
        n.id,
        Object.keys(style).length
          ? styledNodeText(n.label, n.description, style)
          : nodeText(n.label, n.description),
      ];
    }),
  );
  const buildChildren = (parent?: string): ElkNode[] => [
    ...doc.groups
      .filter((g) => g.parent === parent)
      .map((g) => ({
        id: g.id,
        children: buildChildren(g.id),
        width: groupMinWidth(g.label),
        height: 100,
        layoutOptions: {
          'elk.padding': '[top=64,left=24,bottom=24,right=24]',
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': `(${groupMinWidth(g.label)},100)`,
        },
      })),
    ...doc.nodes
      .filter((n) => n.group === parent)
      .map((n) => ({
        id: n.id,
        width: measured.get(n.id)!.width,
        height: measured.get(n.id)!.height,
      })),
  ];
  const graph = await elk.layout({
    id: '__forma_root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': doc.layout.direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(system?.spacing?.node ?? (compact ? 32 : 48)),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(
        system?.spacing?.layer ?? (compact ? 56 : 88),
      ),
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '16',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.randomSeed': '1',
      'elk.separateConnectedComponents': 'true',
    },
    children: buildChildren(),
    edges: doc.edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      ...(e.label
        ? { labels: [{ text: e.label, width: textWidth(e.label, 11) + 20, height: 24 }] }
        : {}),
    })),
  });
  const nodes: SceneNode[] = [],
    groups: SceneGroup[] = [],
    edges: SceneEdge[] = [];
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n])),
    groupMap = new Map(doc.groups.map((g) => [g.id, g]));
  const rawEdges: { edge: ElkExtendedEdge; x: number; y: number }[] = [];
  function walk(container: ElkNode, x: number, y: number, depth: number) {
    for (const e of container.edges ?? []) rawEdges.push({ edge: e, x, y });
    for (const child of container.children ?? []) {
      const box = {
        x: x + (child.x ?? 0),
        y: y + (child.y ?? 0),
        width: child.width ?? 224,
        height: child.height ?? 120,
      };
      const semantic = nodeMap.get(child.id);
      if (semantic) {
        const override = doc.presentation.nodes[child.id];
        nodes.push({
          ...box,
          ...measured.get(child.id)!,
          id: child.id,
          semantic,
          style: nodeStyles.get(child.id),
          accent:
            override?.color ??
            (semantic.emphasis === 'primary'
              ? 'blue'
              : semantic.group
                ? groupMap.get(semantic.group)!.color
                : doc.type === 'flow'
                  ? 'blue'
                  : 'slate'),
          pinned: !!override?.position,
        });
      } else {
        const semantic = groupMap.get(child.id)!;
        groups.push({
          ...box,
          id: child.id,
          semantic,
          depth,
          style: resolveGroupStyle(doc, semantic),
        });
        walk(child, box.x, box.y, depth + 1);
      }
    }
  }
  walk(graph, 0, 0, 0);
  const allNodes = new Map(nodes.map((n) => [n.id, n]));
  const rawMap = new Map(
    rawEdges.map((e) => {
      const container = groups.find(
        (g) => g.id === (e.edge as ElkExtendedEdge & { container?: string }).container,
      );
      return [e.edge.id, { ...e, x: container?.x ?? e.x, y: container?.y ?? e.y }];
    }),
  );
  const labelBoxes: Box[] = [];
  const pinned = nodes.some((n) => n.pinned);
  // ELK reserves generous compound boundary channels. Compress only wholly empty
  // bands between top-level containers, keeping enough space for labels.
  const axis = doc.layout.direction === 'RIGHT' ? 'x' : 'y';
  const extent = axis === 'x' ? 'width' : 'height';
  const occupied = [
    ...groups.filter((g) => !g.semantic.parent),
    ...nodes.filter((n) => !n.semantic.group),
  ]
    .map((b) => [b[axis], b[axis] + b[extent]])
    .sort((a, b) => a[0] - b[0]);
  const bands: { start: number; end: number; remove: number }[] = [];
  let end = occupied[0]?.[1] ?? 0;
  for (const interval of occupied.slice(1)) {
    if (interval[0] - end > 120)
      bands.push({ start: end, end: interval[0], remove: interval[0] - end - 120 });
    end = Math.max(end, interval[1]);
  }
  const mapAxis = (value: number) =>
    value -
    bands.reduce(
      (sum, b) =>
        sum +
        (value >= b.end
          ? b.remove
          : value > b.start
            ? ((value - b.start) / (b.end - b.start)) * b.remove
            : 0),
      0,
    );
  const composePoint = (point: Point) => ({
    ...point,
    [axis]: Math.round(mapAxis(point[axis]) * 100) / 100,
  });
  for (const box of [...nodes, ...groups]) {
    const max = mapAxis(box[axis] + box[extent]);
    box[axis] = mapAxis(box[axis]);
    box[extent] = max - box[axis];
  }
  if (doc.layout.mode === 'grid') {
    const columns = new Map<number, number>(),
      rows = new Map<number, number>();
    for (const [i, n] of nodes.entries()) {
      const p = n.semantic.placement ?? {
        column: doc.nodes.findIndex((item) => item.id === n.id),
        row: 0,
      };
      columns.set(p.column, Math.max(columns.get(p.column) ?? 0, n.width));
      rows.set(p.row, Math.max(rows.get(p.row) ?? 0, n.height));
    }
    const offset = (map: Map<number, number>, index: number, gap: number) =>
      [...map].filter(([key]) => key < index).reduce((sum, [, size]) => sum + size + gap, 0);
    for (const [i, n] of nodes.entries()) {
      const p = n.semantic.placement ?? {
        column: doc.nodes.findIndex((item) => item.id === n.id),
        row: 0,
      };
      n.x =
        offset(columns, p.column, system?.spacing?.layer ?? 88) +
        ((columns.get(p.column) ?? n.width) - n.width) / 2;
      n.y =
        offset(rows, p.row, system?.spacing?.node ?? 64) +
        ((rows.get(p.row) ?? n.height) - n.height) / 2;
    }
  }
  for (const n of nodes)
    if (doc.presentation.nodes[n.id]?.position)
      Object.assign(n, doc.presentation.nodes[n.id].position);
  // Bounds follow human-moved descendants, preserving the semantic container.
  if (nodes.some((n) => n.pinned) || doc.layout.mode === 'grid') {
    for (const g of [...groups].sort((a, b) => b.depth - a.depth)) {
      const children: Box[] = [
        ...nodes.filter((n) => n.semantic.group === g.id),
        ...groups.filter((c) => c.semantic.parent === g.id),
      ];
      if (!children.length) continue;
      const x = Math.min(...children.map((c) => c.x)) - 24,
        y = Math.min(...children.map((c) => c.y)) - 64;
      Object.assign(g, {
        x,
        y,
        width: Math.max(
          groupMinWidth(g.semantic.label),
          Math.max(...children.map((c) => c.x + c.width)) + 24 - x,
        ),
        height: Math.max(...children.map((c) => c.y + c.height)) + 24 - y,
      });
    }
  }
  for (const semantic of doc.edges) {
    const edgeStyle = resolveEdgeStyle(doc, semantic);
    const raw = rawMap.get(semantic.id),
      sections = raw?.edge.sections;
    let points: Point[];
    if (sections?.length)
      points = simplify(
        sections
          .flatMap((s) => [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
          .map((p) => ({
            x: Math.round((p.x + raw!.x) * 100) / 100,
            y: Math.round((p.y + raw!.y) * 100) / 100,
          }))
          .map(composePoint),
      );
    else
      points = routeBetween(
        allNodes.get(semantic.source)!,
        allNodes.get(semantic.target)!,
        nodes,
        doc.layout.direction === 'DOWN',
        semantic.source === semantic.target,
        edgeStyle.sourcePort,
        edgeStyle.targetPort,
      );
    if (
      edgeStyle.sourcePort ||
      edgeStyle.targetPort ||
      doc.layout.mode === 'grid' ||
      [semantic.source, semantic.target].some((id) =>
        ['diamond', 'ellipse', 'pill'].includes(nodeStyles.get(id)?.shape ?? ''),
      ) ||
      (pinned &&
        (allNodes.get(semantic.source)!.pinned ||
          allNodes.get(semantic.target)!.pinned ||
          nodes.some(
            (n) => n.pinned && points.some((p, i) => i > 0 && segmentHitsBox(points[i - 1], p, n)),
          )))
    ) {
      points = routeBetween(
        allNodes.get(semantic.source)!,
        allNodes.get(semantic.target)!,
        nodes,
        doc.layout.direction === 'DOWN',
        semantic.source === semantic.target,
        edgeStyle.sourcePort,
        edgeStyle.targetPort,
      );
    }
    const style = edgeStyle;
    if (style.routing === 'straight') {
      const source = allNodes.get(semantic.source)!,
        target = allNodes.get(semantic.target)!;
      const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      const a = center(source),
        b = center(target);
      if (source.id !== target.id)
        points = [
          shapeBoundary(source, b, source.style?.shape),
          shapeBoundary(target, a, target.style?.shape),
        ];
    }
    const edge: SceneEdge = { id: semantic.id, semantic, points, style };
    if (semantic.label) {
      const lines = wrapText(semantic.label, 156, 11),
        width = Math.max(...lines.map((l) => textWidth(l, 11))) + 16,
        height = lines.length * 15 + 8;
      const candidates: { box: Box; score: number }[] = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        for (const ratio of [0.5, 0.3, 0.7]) {
          const x = a.x + (b.x - a.x) * ratio,
            y = a.y + (b.y - a.y) * ratio;
          const horizontal = a.y === b.y;
          const box = {
            x: horizontal ? x - width / 2 : x + 9,
            y: horizontal ? y - height - 7 : y - height / 2,
            width,
            height,
          };
          const collisions = [
            ...nodes,
            ...labelBoxes,
            ...groups.map((g) => ({ x: g.x, y: g.y, width: g.width, height: 48 })),
          ].filter((n) => overlaps(n, box, 4)).length;
          candidates.push({
            box,
            score:
              collisions * 100000 +
              (length < (horizontal ? width : height) + 12 ? 5000 : 0) -
              length +
              Math.abs(0.5 - ratio),
          });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const box = candidates[0]?.box ?? {
        x: points[0]?.x ?? 0,
        y: points[0]?.y ?? 0,
        width,
        height,
      };
      edge.label = { ...box, lines };
      labelBoxes.push(box);
    }
    edges.push(edge);
  }
  const content: Box[] = [
    ...nodes,
    ...groups,
    ...labelBoxes,
    ...edges.flatMap((e) => e.points.map((p) => ({ ...p, width: 0, height: 0 }))),
  ];
  const minX = Math.min(0, ...content.map((c) => c.x)),
    minY = Math.min(0, ...content.map((c) => c.y));
  const maxX = Math.max(620, ...content.map((c) => c.x + c.width)),
    maxY = Math.max(
      doc.version === 1 || !nodes.length ? 240 : 0,
      ...content.map((c) => c.y + c.height),
    );
  const width = maxX - minX + 112;
  const titleLines = wrapText(doc.title, width - 112, 30, 600),
    descriptionLines = wrapText(doc.description ?? '', width - 112, 13);
  const header = Math.max(128, 48 + titleLines.length * 38 + descriptionLines.length * 19 + 28);
  return {
    document: doc,
    fingerprint: fingerprint(doc),
    nodes,
    groups,
    edges,
    bounds: { x: minX - 56, y: minY - header, width, height: maxY - minY + header + 76 },
    titleLines,
    descriptionLines,
  };
}
