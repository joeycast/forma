import {
  resolveNodeStyle,
  resolveEdgeStyle,
  resolveGroupStyle,
  resolveNodeVariant,
} from './resolve-style';
import type { ElkNode, ElkExtendedEdge, ELK } from 'elkjs';
import { fingerprint, parseDocument, type Diagram, type Point } from './document';
import type { PortSide } from './styles';
import { classicNodeText, styledNodeText, textWidth, wrapText } from './text';
import type { Box, Scene, SceneEdge, SceneGroup, SceneNode } from './scene';
import {
  arriveSide,
  attachmentPoint,
  departSide,
  isOrthogonal,
  overlaps,
  routeBetween,
  previewRoute,
  routesCross,
  routeThrough,
  segmentHitsBox,
  shapeBoundary,
  simplify,
} from './geometry';
let elkPromise: Promise<ELK> | undefined;
type ElkFactory = () => Promise<ELK>;
const groupMinWidth = (label: string) =>
  Math.max(180, Math.ceil(textWidth(label.toUpperCase(), 11, 600) + label.length * 1.2 + 64));
const recentLayouts = new Map<string, Scene>();

function geometrySignature(doc: Diagram) {
  return JSON.stringify({
    version: doc.version,
    title: doc.title,
    description: doc.description,
    layout: doc.layout,
    footer: doc.presentation.footer,
    systemSpacing: doc.presentation.designSystem?.spacing,
    groups: doc.groups.map((g) => [g.id, g.label, g.parent]),
    nodes: doc.nodes.map((n) => {
      const style = resolveNodeStyle(doc, n);
      return [
        n.id,
        n.label,
        n.description,
        n.kind,
        n.group,
        n.placement,
        doc.presentation.nodes[n.id]?.position ?? null,
        n.ports,
        resolveNodeVariant(doc, n),
        style.shape,
        style.aspectRatio,
        style.width,
        style.height,
        style.fontSize,
        style.fontWeight,
        style.padding,
      ];
    }),
    edges: doc.edges.map((e) => {
      const style = resolveEdgeStyle(doc, e);
      return [
        e.id,
        e.source,
        e.target,
        e.label,
        e.path,
        style.routing,
        style.sourcePort,
        style.targetPort,
        style.sourceIndex,
        style.targetIndex,
      ];
    }),
  });
}

function refreshCachedScene(scene: Scene, doc: Diagram): Scene {
  const groups = new Map(doc.groups.map((g) => [g.id, g]));
  return {
    ...scene,
    document: doc,
    fingerprint: fingerprint(doc),
    nodes: scene.nodes.map((node) => {
      const semantic = doc.nodes.find((n) => n.id === node.id)!;
      const group = semantic.group ? groups.get(semantic.group) : undefined;
      return {
        ...node,
        semantic,
        style: resolveNodeStyle(doc, semantic),
        variant: resolveNodeVariant(doc, semantic),
        accent:
          doc.presentation.nodes[node.id]?.color ??
          (semantic.emphasis === 'primary'
            ? 'blue'
            : semantic.group
              ? group!.color
              : doc.type === 'flow'
                ? 'blue'
                : 'slate'),
      };
    }),
    groups: scene.groups.map((group) => {
      const semantic = doc.groups.find((g) => g.id === group.id)!;
      return { ...group, semantic, style: resolveGroupStyle(doc, semantic) };
    }),
    edges: scene.edges.map((edge) => {
      const semantic = doc.edges.find((e) => e.id === edge.id)!;
      return { ...edge, semantic, style: resolveEdgeStyle(doc, semantic) };
    }),
  };
}

export async function layoutDiagram(input: Diagram, makeElk?: ElkFactory): Promise<Scene> {
  const doc = parseDocument(input),
    compact = doc.layout.spacing === 'compact';
  const signature = geometrySignature(doc);
  const cached = recentLayouts.get(signature);
  if (cached) {
    recentLayouts.delete(signature);
    recentLayouts.set(signature, cached);
    return refreshCachedScene(cached, doc);
  }
  const system = doc.presentation.designSystem;
  const nodeStyles = new Map(doc.nodes.map((n) => [n.id, resolveNodeStyle(doc, n)]));
  const measured = new Map(
    doc.nodes.map((n) => {
      const style = nodeStyles.get(n.id)!;
      return [
        n.id,
        resolveNodeVariant(doc, n) === 'shape'
          ? styledNodeText(n.label, n.description, style)
          : classicNodeText(n.label, n.description, style),
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
  // Grid placement is fully determined by explicit row/column placement below.
  // Do not even load ELK for this mode: it is a large dependency and contributes
  // no geometry to the final scene.
  const graph =
    doc.layout.mode === 'grid'
      ? { id: '__forma_root__', children: buildChildren() }
      : await (async () => {
          const elk = await (elkPromise ??= makeElk
            ? makeElk()
            : import('elkjs/lib/elk.bundled.js').then((module) => new module.default()));
          return elk.layout({
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
              'elk.spacing.edgeEdge': '0',
              'elk.layered.spacing.edgeEdgeBetweenLayers': '0',
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
        })();
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
          variant: resolveNodeVariant(doc, semantic),
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
  const down = doc.layout.direction === 'DOWN';
  const routed: { points: Point[]; bounds: Box; custom: boolean; straight: boolean }[] = [];
  // Bound aggregate Dijkstra expansions per composition, not only each edge.
  // Remaining edges receive deterministic obstacle-aware fallbacks and a
  // visible inspection diagnostic when the budget is exhausted.
  const sceneRouteBudget = {
    // Shared across Dijkstra expansions, cached transition checks, and peer
    // crossing work. The cap keeps dense scenes bounded while scaling the
    // ordinary budget with diagram size.
    remaining: Math.min(3_000_000, Math.max(200_000, nodes.length * doc.edges.length * 200)),
  };
  const routeBounds = (route: Point[]): Box => {
    const xs = route.map((point) => point.x),
      ys = route.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  };
  const boxesOverlap = (a: Box, b: Box) =>
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
  const commit = (points: Point[], custom: boolean, straight: boolean) => {
    routed.push({ points, bounds: routeBounds(points), custom, straight });
    return points;
  };
  for (const semantic of doc.edges) {
    let routingBudgetExceeded = false;
    const edgeStyle = resolveEdgeStyle(doc, semantic);
    const source = allNodes.get(semantic.source)!,
      target = allNodes.get(semantic.target)!;
    const skip = new Set([source.id, target.id]);
    const blocked = (points: Point[]) => {
      const bounds = routeBounds(points);
      return nodes.some(
        (n) =>
          !skip.has(n.id) &&
          boxesOverlap(bounds, n) &&
          points.some((p, i) => i > 0 && segmentHitsBox(points[i - 1], p, n)),
      );
    };
    const peerRoutes = () => routed.filter((r) => !r.straight);
    const peers = () => peerRoutes().map((r) => r.points);
    const nearby = (route: Point[], margin: number) => {
      const x1 = Math.min(...route.map((p) => p.x)) - margin,
        x2 = Math.max(...route.map((p) => p.x)) + margin,
        y1 = Math.min(...route.map((p) => p.y)) - margin,
        y2 = Math.max(...route.map((p) => p.y)) + margin;
      return (box: Box) =>
        box.x <= x2 && box.x + box.width >= x1 && box.y <= y2 && box.y + box.height >= y1;
    };
    const routeAutomatically = (
      fromPoint: Point,
      toPoint: Point,
      sourceSide: PortSide,
      targetSide: PortSide,
      self = false,
    ) => {
      const allPeerRoutes = peerRoutes();
      const allPeers = allPeerRoutes.map((r) => r.points);
      const relevant = nearby([fromPoint, toPoint], 80);
      const localPeers = allPeerRoutes
        .map((peer, index) => ({ route: peer.points, index, close: relevant(peer.bounds) }))
        .filter((item) => item.close)
        .sort((a, b) => a.index - b.index)
        .slice(-12)
        .map((item) => item.route);
      const localNodes = nodes.filter(relevant);
      const bounded = {
        maxCoordinates: 36,
        sourceShape: source.style?.shape,
        targetShape: target.style?.shape,
        workBudget: sceneRouteBudget,
        onBudgetExceeded: () => {
          routingBudgetExceeded = true;
        },
      };
      const route = routeBetween(
        source,
        target,
        localNodes,
        down,
        self,
        sourceSide,
        targetSide,
        from.index,
        to.index,
        from.count,
        to.count,
        localPeers,
        bounded,
      );
      const routeBox = routeBounds(route);
      const needsFullSearch =
        blocked(route) ||
        allPeerRoutes.some(
          (peer) => boxesOverlap(routeBox, peer.bounds) && routesCross(route, peer.points),
        );
      return needsFullSearch &&
        (localNodes.length !== nodes.length || localPeers.length !== allPeers.length)
        ? routeBetween(
            source,
            target,
            nodes,
            down,
            self,
            sourceSide,
            targetSide,
            from.index,
            to.index,
            from.count,
            to.count,
            allPeers,
            bounded,
          )
        : route;
    };
    const raw = rawMap.get(semantic.id),
      sections = raw?.edge.sections;
    const elkPoints = sections?.length
      ? simplify(
          sections
            .flatMap((s) => [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
            .map((p) => ({
              x: Math.round((p.x + raw!.x) * 100) / 100,
              y: Math.round((p.y + raw!.y) * 100) / 100,
            }))
            .map(composePoint),
        )
      : null;
    const explicitSide = !!(edgeStyle.sourcePort || edgeStyle.targetPort);
    const elkUsable = !!(elkPoints && elkPoints.length > 1 && doc.layout.mode !== 'grid');
    const sourceSide =
      edgeStyle.sourcePort ??
      (elkUsable ? departSide(elkPoints![0], elkPoints![1]) : undefined) ??
      (down ? 'bottom' : 'right');
    const targetSide =
      edgeStyle.targetPort ??
      (elkUsable ? arriveSide(elkPoints!.at(-2)!, elkPoints!.at(-1)!) : undefined) ??
      (down ? 'top' : 'left');
    const from = attachmentPoint(
      source,
      source.semantic.ports,
      sourceSide,
      edgeStyle.sourceIndex,
      sourceSide,
      source.style?.shape,
    );
    const to = attachmentPoint(
      target,
      target.semantic.ports,
      targetSide,
      edgeStyle.targetIndex,
      targetSide,
      target.style?.shape,
    );
    let points: Point[];
    const straight = edgeStyle.routing === 'straight' && source.id !== target.id;
    if (straight) {
      if (semantic.path?.length)
        points = previewRoute(
          [],
          from.point,
          to.point,
          from.side,
          to.side,
          'straight',
          semantic.path,
        );
      else {
        const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        points =
          edgeStyle.sourcePort || edgeStyle.targetPort
            ? [from.point, to.point]
            : [
                shapeBoundary(source, center(target), source.style?.shape),
                shapeBoundary(target, center(source), target.style?.shape),
              ];
      }
      commit(points, !!semantic.path?.length, true);
    } else if (semantic.path?.length && source.id !== target.id) {
      points = commit(
        previewRoute([], from.point, to.point, from.side, to.side, 'orthogonal', semantic.path),
        true,
        false,
      );
    } else if (source.id === target.id) {
      points = commit(
        routeAutomatically(from.point, to.point, from.side, to.side, true),
        false,
        false,
      );
    } else {
      let kept: Point[] | null = null;
      if (elkPoints && doc.layout.mode !== 'grid') {
        const adjusted = previewRoute(elkPoints, from.point, to.point, from.side, to.side);
        if (
          adjusted &&
          isOrthogonal(adjusted) &&
          !blocked(adjusted) &&
          !peers().some((route) => routesCross(adjusted, route))
        )
          kept = adjusted;
      }
      points = commit(
        kept ?? routeAutomatically(from.point, to.point, from.side, to.side),
        false,
        false,
      );
    }
    const style = edgeStyle;
    const edge: SceneEdge = {
      id: semantic.id,
      semantic,
      points,
      style,
      ...(routingBudgetExceeded ? { routingBudgetExceeded: true } : {}),
    };
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
  const scene: Scene = {
    document: doc,
    fingerprint: fingerprint(doc),
    nodes,
    groups,
    edges,
    bounds: {
      x: minX - 56,
      y: minY - header,
      width,
      height: maxY - minY + header + (doc.presentation.footer?.hidden ? 28 : 76),
    },
    titleLines,
    descriptionLines,
  };
  recentLayouts.set(signature, scene);
  if (recentLayouts.size > 8) recentLayouts.delete(recentLayouts.keys().next().value!);
  return scene;
}
