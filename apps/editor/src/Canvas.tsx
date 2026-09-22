import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
  type Node,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type NodeChange,
  type Edge,
} from '@xyflow/react';
import {
  MousePointer2,
  Hand,
  Plus,
  Minus,
  Maximize,
  Scan,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react';
import type { AlignEdge, DistributeAxis } from '../../../packages/core/src';
import {
  nodeMarkup,
  groupMarkup,
  frameMarkup,
  edgeMarkup,
  edgeLabelMarkup,
  attachmentPoint,
  insertWaypoint,
  nearestPort,
  retargetRoute,
  routeThrough,
  slideOrthogonalSegment,
  portSides,
  type Scene,
  type SceneNode,
  type SceneEdge,
  type Point,
  type PortSide,
} from '../../../packages/core/src';
type CardData = { node: SceneNode; theme: 'paper' | 'midnight'; down: boolean };
const handlePosition = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
} as const;
const DiagramCard = memo(({ data, selected }: NodeProps<Node<CardData>>) => (
  <div className={`diagram-card ${selected ? 'is-selected' : ''}`} data-node-id={data.node.id}>
    {portSides.flatMap((side) => {
      const count = data.node.semantic.ports?.[side] ?? 1;
      return Array.from({ length: count }, (_, index) => {
        const along = `${((index + 1) / (count + 1)) * 100}%`;
        return (
          <Handle
            key={`${side}:${index}`}
            id={`${side}:${index}`}
            type="source"
            position={handlePosition[side]}
            style={side === 'top' || side === 'bottom' ? { left: along } : { top: along }}
          />
        );
      });
    })}
    <svg
      width={data.node.width}
      height={data.node.height}
      role="img"
      aria-label={data.node.semantic.label}
      dangerouslySetInnerHTML={{ __html: nodeMarkup(data.node, data.theme) }}
    />
    {data.node.pinned && (
      <span className="pin-indicator" title="Position preserved">
        ⌖
      </span>
    )}
  </div>
));
const Decoration = memo(({ data }: NodeProps) => (
  <svg
    width={data.width as number}
    height={data.height as number}
    viewBox={data.viewBox as string}
    style={{ overflow: 'visible' }}
    dangerouslySetInnerHTML={{ __html: data.markup as string }}
  />
));
const DiagramConnector = memo(({ data, selected }: EdgeProps) => {
  const { edge, theme, onPath, onPreview, onDraftPoints } = data as {
    edge: SceneEdge;
    theme: 'paper' | 'midnight';
    onPath?: (id: string, path: Point[] | null) => void;
    onPreview?: (id: string, path: Point[]) => void;
    onDraftPoints?: (id: string, points: Point[] | null) => void;
  };
  const { screenToFlowPosition } = useReactFlow();
  const [hover, setHover] = useState(false);
  const waypoints = edge.semantic.path ?? [];
  const segments = edge.points.flatMap((point, index) => {
    if (!index) return [];
    const previous = edge.points[index - 1];
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (length < 28) return [];
    const horizontal = Math.abs(point.y - previous.y) <= Math.abs(point.x - previous.x);
    return [
      {
        index: index - 1,
        horizontal,
        x: (previous.x + point.x) / 2,
        y: (previous.y + point.y) / 2,
      },
    ];
  });
  return (
    <g
      className={selected ? 'selected-connector' : ''}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <path
        d={edge.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
        onDoubleClick={(event) => {
          if (!onPath) return;
          event.stopPropagation();
          event.preventDefault();
          const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const anchors = edge.semantic.path?.length
            ? [edge.points[0], ...edge.semantic.path, edge.points.at(-1)!]
            : edge.points;
          onPath(edge.id, insertWaypoint(anchors, point));
        }}
      />
      <g
        dangerouslySetInnerHTML={{ __html: edgeMarkup(edge, theme) + edgeLabelMarkup(edge, theme) }}
      />
      {(hover || selected) &&
        segments.map((segment) => (
          <rect
            key={`segment-${segment.index}`}
            className="segment-grip"
            x={segment.x - (segment.horizontal ? 8 : 4)}
            y={segment.y - (segment.horizontal ? 4 : 8)}
            width={segment.horizontal ? 16 : 8}
            height={segment.horizontal ? 8 : 16}
            rx={2}
            style={{ cursor: segment.horizontal ? 'ns-resize' : 'ew-resize' }}
            onPointerDown={(event) => {
              if (!onPath || !onDraftPoints) return;
              event.stopPropagation();
              event.preventDefault();
              const origin = edge.points.map((item) => ({ ...item }));
              let latest = origin;
              const move = (ev: PointerEvent) => {
                const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
                const value = Math.round(segment.horizontal ? flow.y : flow.x);
                latest = slideOrthogonalSegment(origin, segment.index, value);
                onDraftPoints(edge.id, latest);
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                onDraftPoints(edge.id, null);
                const corners = latest.slice(1, -1);
                onPath(edge.id, corners.length ? corners : null);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        ))}
      {selected &&
        waypoints.map((point, index) => (
          <circle
            key={`${point.x}:${point.y}:${index}`}
            className="waypoint"
            cx={point.x}
            cy={point.y}
            r={6}
            onPointerDown={(event) => {
              if (!onPath) return;
              event.stopPropagation();
              event.preventDefault();
              const origin = waypoints.map((item) => ({ ...item }));
              const move = (ev: PointerEvent) => {
                const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
                origin[index] = { x: Math.round(flow.x), y: Math.round(flow.y) };
                onPreview?.(
                  edge.id,
                  origin.map((item) => ({ ...item })),
                );
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                onPath(
                  edge.id,
                  origin.map((item) => ({ ...item })),
                );
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        ))}
    </g>
  );
});
const nodeTypes = { diagram: DiagramCard, decoration: Decoration };
const edgeTypes = { diagram: DiagramConnector };
export function Canvas({
  scene,
  selected,
  onSelect,
  onMove,
  onAlign,
  onDistribute,
  onConnect,
  onReconnect,
  onDelete,
  onPath,
  onEditEdge,
  fitKey,
  grid,
  onAdd,
}: {
  scene: Scene;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onMove: (positions: { id: string; x: number; y: number }[]) => void;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onConnect: (c: Connection) => void;
  onReconnect: (id: string, connection: Connection) => void;
  onDelete: (ids: string[]) => void;
  onEditEdge: (id: string) => void;
  onPath: (id: string, path: Point[] | null) => void;
  fitKey: number;
  grid: boolean;
  onAdd: () => void;
}) {
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({}),
    [zoom, setZoom] = useState(100),
    [pan, setPan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [pathPreview, setPathPreview] = useState<{ id: string; path: Point[] } | null>(null);
  const [draftPoints, setDraftPoints] = useState<{ id: string; points: Point[] } | null>(null);
  const holdSelection = useRef(false);
  const selectedKey = selected.join('\0');
  const seenSelection = useRef(selectedKey);
  if (seenSelection.current !== selectedKey) {
    seenSelection.current = selectedKey;
    holdSelection.current = true;
  }
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const nodes = useMemo(() => {
    const theme = scene.document.presentation.theme,
      b = scene.bounds;
    const decorations: Node[] = [
      {
        id: '__frame',
        type: 'decoration',
        position: { x: b.x, y: b.y },
        data: {
          width: b.width,
          height: b.height,
          viewBox: `${b.x} ${b.y} ${b.width} ${b.height}`,
          markup: `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="0" fill="${scene.document.presentation.designSystem?.canvas?.background ?? (theme === 'paper' ? '#fff' : '#171e2b')}"/>${frameMarkup(scene)}`,
        },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -20,
        style: { pointerEvents: 'none' },
      },
      ...scene.groups.map((g) => ({
        id: `__group-${g.id}`,
        type: 'decoration',
        position: { x: g.x, y: g.y },
        data: {
          width: g.width,
          height: g.height,
          viewBox: `${g.x} ${g.y} ${g.width} ${g.height}`,
          markup: groupMarkup(g, theme),
        },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -10,
        style: { pointerEvents: 'none' as const },
      })),
    ];
    return [
      ...decorations,
      ...scene.nodes.map((n) => ({
        id: n.id,
        type: 'diagram',
        position: dragPositions[n.id] ?? { x: n.x, y: n.y },
        data: { node: n, theme, down: scene.document.layout.direction === 'DOWN' },
        selected: selected.includes(n.id),
        ariaLabel: n.semantic.label,
      })),
    ];
  }, [scene, selected, dragPositions]);
  useEffect(() => {
    setDragPositions({});
  }, [scene]);
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.09, duration: 240, includeHiddenNodes: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitKey, fitView]);
  const down = scene.document.layout.direction === 'DOWN';
  const liveBox = (id: string, fallback: SceneNode | undefined) => {
    if (!fallback) return undefined;
    const node = nodes.find((n) => n.id === id);
    return node ? { ...fallback, x: node.position.x, y: node.position.y } : fallback;
  };
  const handleFor = (
    box: SceneNode,
    explicitSide: PortSide | undefined,
    explicitIndex: number | undefined,
    point: Point,
  ) => {
    if (explicitSide) {
      const count = box.semantic.ports?.[explicitSide] ?? 1;
      const index = Math.min(explicitIndex ?? Math.floor((count - 1) / 2), count - 1);
      return `${explicitSide}:${index}`;
    }
    const nearest = nearestPort(box, box.semantic.ports, point);
    return nearest.distance < 8 ? `${nearest.side}:${nearest.index}` : undefined;
  };
  const edges: Edge[] = useMemo(
    () =>
      scene.edges.flatMap((e) => {
        const source = liveBox(
          e.semantic.source,
          scene.nodes.find((n) => n.id === e.semantic.source),
        );
        const target = liveBox(
          e.semantic.target,
          scene.nodes.find((n) => n.id === e.semantic.target),
        );
        if (!source || !target) return [];
        const from = attachmentPoint(
          source,
          source.semantic.ports,
          e.style?.sourcePort,
          e.style?.sourceIndex,
          down ? 'bottom' : 'right',
        );
        const to = attachmentPoint(
          target,
          target.semantic.ports,
          e.style?.targetPort,
          e.style?.targetIndex,
          down ? 'top' : 'left',
        );
        const preview = pathPreview?.id === e.id ? pathPreview.path : null;
        const custom = preview ?? e.semantic.path;
        let edge = e;
        if (draftPoints?.id === e.id) {
          edge = { ...e, label: undefined, points: draftPoints.points };
        } else if (preview || (dragging && source.id !== target.id)) {
          const points = custom?.length
            ? routeThrough(from.point, custom, to.point, from.side, to.side)
            : (retargetRoute(e.points, from.point, to.point, from.side, to.side) ??
              routeThrough(from.point, e.points.slice(1, -1), to.point, from.side, to.side));
          edge = {
            ...e,
            semantic: preview ? { ...e.semantic, path: preview } : e.semantic,
            label: undefined,
            points,
          };
        }
        return [
          {
            id: e.id,
            source: e.semantic.source,
            target: e.semantic.target,
            sourceHandle: handleFor(
              source,
              e.style?.sourcePort,
              e.style?.sourceIndex,
              edge.points[0],
            ),
            targetHandle: handleFor(
              target,
              e.style?.targetPort,
              e.style?.targetIndex,
              edge.points.at(-1) ?? to.point,
            ),
            type: 'diagram',
            reconnectable: true,
            selected: selected.includes(e.id),
            data: {
              edge,
              theme: scene.document.presentation.theme,
              onPath: (id: string, path: Point[] | null) => {
                setPathPreview(null);
                setDraftPoints(null);
                onPath(id, path);
              },
              onPreview: (id: string, path: Point[]) => setPathPreview({ id, path }),
              onDraftPoints: (id: string, points: Point[] | null) =>
                setDraftPoints(points ? { id, points } : null),
            },
          },
        ];
      }),
    [scene, nodes, selected, down, dragging, pathPreview, draftPoints, onPath],
  );
  return (
    <div className={`canvas ${grid ? '' : 'no-grid'} ${reconnecting ? 'reconnecting' : ''}`}>
      <div className="canvas-tag">
        <span className="sheet-dot" />{' '}
        {scene.document.type === 'architecture'
          ? 'Architecture'
          : scene.document.type === 'flow'
            ? 'Process flow'
            : 'Diagram'}{' '}
        <span className="canvas-tag-divider" />{' '}
        {scene.document.presentation.designSystem?.name ??
          (scene.document.presentation.theme === 'paper' ? 'Paper' : 'Midnight')}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.08}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.09 }}
        onNodesChange={(changes: NodeChange[]) => {
          const moved = changes.flatMap((change) =>
            change.type === 'position' && change.position
              ? [{ id: change.id, ...change.position, dragging: change.dragging }]
              : [],
          );
          if (moved.length) {
            setDragPositions((current) => {
              const next = { ...current };
              for (const move of moved) next[move.id] = { x: move.x, y: move.y };
              return next;
            });
          }
          const completed = moved.filter((move) => move.dragging === false);
          if (completed.length) onMove(completed);
        }}
        onSelectionChange={({ nodes: picked, edges: pickedEdges }) => {
          const ids = [
            ...picked.filter((n) => n.type === 'diagram').map((n) => n.id),
            ...pickedEdges.map((e) => e.id),
          ];
          if (holdSelection.current) {
            if (ids.length === selected.length && ids.every((id) => selected.includes(id)))
              holdSelection.current = false;
            return;
          }
          if (!ids.length) return;
          if (ids.length === selected.length && ids.every((id) => selected.includes(id))) return;
          onSelect(ids);
        }}
        onSelectionStart={() => {
          holdSelection.current = false;
        }}
        onNodeClick={() => {
          holdSelection.current = false;
        }}
        onPaneClick={() => {
          holdSelection.current = false;
          onSelect([]);
        }}
        onNodeDragStart={() => setDragging(true)}
        onNodeDragStop={() => setDragging(false)}
        onConnect={onConnect}
        onReconnect={(edge, connection) => onReconnect(edge.id, connection)}
        onReconnectStart={() => setReconnecting(true)}
        onReconnectEnd={() => setReconnecting(false)}
        onEdgeClick={(_, edge) => {
          holdSelection.current = false;
          onEditEdge(edge.id);
        }}
        connectionMode={ConnectionMode.Loose}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        onNodesDelete={(ns) => onDelete(ns.filter((n) => n.type === 'diagram').map((n) => n.id))}
        onEdgesDelete={(es) => onDelete(es.map((e) => e.id))}
        deleteKeyCode={null}
        onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))}
        snapToGrid={grid}
        snapGrid={[8, 8]}
        panOnDrag={pan ? true : [1, 2]}
        selectionOnDrag={!pan}
        nodesDraggable={!pan}
        selectionKeyCode="Shift"
        proOptions={{ hideAttribution: false }}
      >
        {grid && <Background variant={BackgroundVariant.Dots} gap={8} size={1} color="#cbd1dc" />}
      </ReactFlow>
      {selected.filter((id) => scene.nodes.some((n) => n.id === id)).length > 1 && (
        <div className="align-bar" role="toolbar" aria-label="Align selected components">
          {(
            [
              ['left', AlignStartVertical, 'Align left'],
              ['center', AlignCenterVertical, 'Align centers'],
              ['right', AlignEndVertical, 'Align right'],
              ['top', AlignStartHorizontal, 'Align top'],
              ['middle', AlignCenterHorizontal, 'Align middles'],
              ['bottom', AlignEndHorizontal, 'Align bottom'],
            ] as const
          ).map(([edge, Icon, label]) => (
            <button key={edge} aria-label={label} title={label} onClick={() => onAlign(edge)}>
              <Icon size={16} />
            </button>
          ))}
          <span />
          <button
            aria-label="Distribute horizontally"
            title="Distribute horizontally"
            disabled={selected.filter((id) => scene.nodes.some((n) => n.id === id)).length < 3}
            onClick={() => onDistribute('horizontal')}
          >
            <AlignHorizontalSpaceAround size={16} />
          </button>
          <button
            aria-label="Distribute vertically"
            title="Distribute vertically"
            disabled={selected.filter((id) => scene.nodes.some((n) => n.id === id)).length < 3}
            onClick={() => onDistribute('vertical')}
          >
            <AlignVerticalSpaceAround size={16} />
          </button>
        </div>
      )}
      <div className="canvas-tools">
        <button
          className={!pan ? 'active' : ''}
          aria-label="Selection tool"
          title="Select and move components"
          onClick={() => setPan(false)}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          className={pan ? 'active' : ''}
          aria-label="Pan tool"
          title="Pan canvas"
          onClick={() => setPan(true)}
        >
          <Hand size={17} />
        </button>
        <span />
        <button aria-label="Add component" title="Add component" onClick={onAdd}>
          <Plus size={18} />
        </button>
      </div>
      <div className="zoom-tools">
        <button aria-label="Zoom out" onClick={() => zoomOut({ duration: 150 })}>
          <Minus size={14} />
        </button>
        <span>{zoom}%</span>
        <button aria-label="Zoom in" onClick={() => zoomIn({ duration: 150 })}>
          <Plus size={14} />
        </button>
        <i />
        <button
          aria-label="Fit diagram"
          title="Fit diagram"
          onClick={() => fitView({ padding: 0.09, duration: 200 })}
        >
          <Scan size={17} />
        </button>
      </div>
      <button
        className="canvas-fit-corner"
        aria-label="Fit all"
        onClick={() => fitView({ padding: 0.09, duration: 200 })}
      >
        <Maximize size={15} />
      </button>
    </div>
  );
}
