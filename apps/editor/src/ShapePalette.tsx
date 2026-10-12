import { Box, Circle, Diamond, FileJson, Hexagon, Shapes, Type } from 'lucide-react';
import { SHAPE_NAMES, SHAPE_REGISTRY, type ShapeName } from '../../../packages/core/src/shapes';
import './authoring.css';

const icons: Record<ShapeName, typeof Box> = {
  rect: Box,
  pill: Circle,
  diamond: Diamond,
  ellipse: Circle,
  cylinder: Shapes,
  text: Type,
  triangle: Shapes,
  hexagon: Hexagon,
  parallelogram: Shapes,
  trapezoid: Shapes,
  document: FileJson,
  cloud: Shapes,
};
const shapes = [
  ...SHAPE_NAMES.map((shape) => ({
    id: shape,
    shape,
    label: SHAPE_REGISTRY[shape].label,
    Icon: icons[shape],
  })),
  { id: 'square', shape: 'rect' as const, label: 'Square', Icon: Box, aspectRatio: 1 },
  { id: 'circle', shape: 'ellipse' as const, label: 'Circle', Icon: Circle, aspectRatio: 1 },
];

export type PaletteShape = { id: string; shape: ShapeName; label: string; aspectRatio?: number };

export function ShapePalette({
  onInsert,
  onGroup,
}: {
  onInsert: (shape: PaletteShape) => void;
  onGroup: () => void;
}) {
  return (
    <div className="shape-palette" role="group" aria-label="Insert a shape">
      <div className="shape-palette-title">Insert shape</div>
      <div className="shape-palette-grid">
        {shapes.map(({ id, shape, label, Icon, ...sizing }) => (
          <button
            key={id}
            type="button"
            title={`Add ${label}`}
            aria-label={`Add ${label}`}
            onClick={() => onInsert({ id, shape, label, ...sizing })}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button className="shape-palette-group" type="button" onClick={onGroup}>
        <Hexagon size={15} aria-hidden="true" /> Add container
      </button>
      <p>New shapes use the visible canvas center. Drag them to refine placement.</p>
    </div>
  );
}
