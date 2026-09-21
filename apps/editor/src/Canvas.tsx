import { memo, useEffect, useState } from 'react';
import {
  ReactFlow,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  applyNodeChanges,
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
  routeBetween,
  type Scene,
  type SceneNode,
  type SceneEdge,
} from '../../../packages/core/src';
type CardData = { node: SceneNode; theme: 'paper' | 'midnight'; down: boolean };
const DiagramCard = memo(({ data, selected }: NodeProps<Node<CardData>>) => (
  <div className={`diagram-card ${selected ? 'is-selected' : ''}`} data-node-id={data.node.id}>
    <Handle type="target" position={data.down ? Position.Top : Position.Left} />
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
    <Handle type="source" position={data.down ? Position.Bottom : Position.Right} />
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
  const { edge, theme } = data as { edge: SceneEdge; theme: 'paper' | 'midnight' };
  return (
    <g className={selected ? 'selected-connector' : ''}>
      <path
        d={edge.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
      />
      <g
        dangerouslySetInnerHTML={{ __html: edgeMarkup(edge, theme) + edgeLabelMarkup(edge, theme) }}
      />
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
  onDelete,
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
  onDelete: (ids: string[]) => void;
  fitKey: number;
  grid: boolean;
  onAdd: () => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]),
    [zoom, setZoom] = useState(100),
    [pan, setPan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  useEffect(() => {
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
    setNodes([
      ...decorations,
      ...scene.nodes.map((n) => ({
        id: n.id,
        type: 'diagram',
        position: { x: n.x, y: n.y },
        data: { node: n, theme, down: scene.document.layout.direction === 'DOWN' },
        selected: selected.includes(n.id),
        ariaLabel: n.semantic.label,
      })),
    ]);
  }, [scene, selected]);
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.09, duration: 240, includeHiddenNodes: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitKey, fitView]);
  const edges: Edge[] = scene.edges.map((e) => {
    let edge = e;
    if (dragging) {
      const source = nodes.find((n) => n.id === e.semantic.source),
        target = nodes.find((n) => n.id === e.semantic.target);
      if (source && target) {
        const a = { ...(source.data as CardData).node, ...source.position },
          b = { ...(target.data as CardData).node, ...target.position };
        edge = {
          ...e,
          label: undefined,
          points: routeBetween(a, b, [], scene.document.layout.direction === 'DOWN', a.id === b.id),
        };
      }
    }
    return {
      id: e.id,
      source: e.semantic.source,
      target: e.semantic.target,
      type: 'diagram',
      selected: selected.includes(e.id),
      data: { edge, theme: scene.document.presentation.theme },
    };
  });
  return (
    <div className={`canvas ${grid ? '' : 'no-grid'}`}>
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
          setNodes((ns) => applyNodeChanges(changes, ns));
          const completed = changes.flatMap((c) =>
            c.type === 'position' && c.dragging === false && c.position
              ? [{ id: c.id, ...c.position }]
              : [],
          );
          if (completed.length) onMove(completed);
        }}
        onSelectionChange={({ nodes, edges }) => {
          const ids = [
            ...nodes.filter((n) => n.type === 'diagram').map((n) => n.id),
            ...edges.map((e) => e.id),
          ];
          if (!ids.length) return;
          if (ids.length === selected.length && ids.every((id) => selected.includes(id))) return;
          onSelect(ids);
        }}
        onPaneClick={() => onSelect([])}
        onNodeDragStart={() => setDragging(true)}
        onNodeDragStop={() => setDragging(false)}
        onConnect={onConnect}
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
