import { z } from 'zod';
import { SHAPE_NAMES } from './shapes';
const paint = z
  .string()
  .regex(/^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|none|transparent)$/);
const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
/** Deliberately data-only: no CSS, URLs, SVG fragments, or executable expressions. */
export const elementStyleSchema = z
  .object({
    fill: paint.optional(),
    stroke: paint.optional(),
    text: paint.optional(),
    secondary: paint.optional(),
    strokeWidth: finite(0, 12).optional(),
    dash: z.enum(['solid', 'dashed', 'dotted']).optional(),
    radius: finite(0, 100).optional(),
    opacity: finite(0.1, 1).optional(),
    fontFamily: z
      .string()
      .regex(/^[a-zA-Z0-9 ,'-]{1,100}$/)
      .optional(),
    fontSize: finite(10, 40).optional(),
    fontWeight: z.union([z.literal(400), z.literal(600)]).optional(),
    padding: finite(12, 64).optional(),
    width: finite(80, 1200).optional(),
    height: finite(40, 1600).optional(),
    aspectRatio: finite(0.1, 10).optional(),
    shape: z.enum(SHAPE_NAMES).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    arrowStart: z.enum(['none', 'open', 'filled', 'diamond', 'circle']).optional(),
    arrowEnd: z.enum(['none', 'open', 'filled', 'diamond', 'circle']).optional(),
    sourcePort: z.enum(['top', 'right', 'bottom', 'left']).optional(),
    targetPort: z.enum(['top', 'right', 'bottom', 'left']).optional(),
    sourceIndex: z.number().int().min(0).max(11).optional(),
    targetIndex: z.number().int().min(0).max(11).optional(),
    routing: z.enum(['orthogonal', 'straight']).optional(),
  })
  .strict();
export const portSides = ['top', 'right', 'bottom', 'left'] as const;
export type PortSide = (typeof portSides)[number];
export type ElementStyle = z.infer<typeof elementStyleSchema>;
/** Style subsets accepted by each object kind. Kept structurally compatible with v1 systems. */
export type NodeStyle = Pick<
  ElementStyle,
  | 'fill'
  | 'stroke'
  | 'text'
  | 'secondary'
  | 'strokeWidth'
  | 'dash'
  | 'radius'
  | 'opacity'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'padding'
  | 'width'
  | 'height'
  | 'aspectRatio'
  | 'shape'
  | 'align'
  | 'verticalAlign'
>;
export type EdgeStyle = Pick<
  ElementStyle,
  | 'stroke'
  | 'text'
  | 'fill'
  | 'strokeWidth'
  | 'dash'
  | 'opacity'
  | 'arrowStart'
  | 'arrowEnd'
  | 'sourcePort'
  | 'targetPort'
  | 'sourceIndex'
  | 'targetIndex'
  | 'routing'
>;
export type GroupStyle = Pick<
  ElementStyle,
  'fill' | 'stroke' | 'text' | 'strokeWidth' | 'dash' | 'radius' | 'opacity' | 'fontFamily'
>;
export type NodeStyleProperty = keyof NodeStyle;
export type EdgeStyleProperty = keyof EdgeStyle;
export type GroupStyleProperty = keyof GroupStyle;

/** Shared metadata for controls, diagnostics, and effective-style inspection. */
export const STYLE_CAPABILITIES = {
  fill: { type: 'paint', group: 'color', appliesTo: ['node', 'edge', 'group'] },
  stroke: { type: 'paint', group: 'color', appliesTo: ['node', 'edge', 'group'] },
  text: { type: 'paint', group: 'color', appliesTo: ['node', 'edge', 'group'] },
  secondary: { type: 'paint', group: 'color', appliesTo: ['node'] },
  strokeWidth: {
    type: 'number',
    group: 'border',
    min: 0,
    max: 12,
    appliesTo: ['node', 'edge', 'group'],
  },
  dash: {
    type: 'enum',
    group: 'border',
    values: ['solid', 'dashed', 'dotted'],
    appliesTo: ['node', 'edge', 'group'],
  },
  radius: { type: 'number', group: 'border', min: 0, max: 100, appliesTo: ['node', 'group'] },
  opacity: {
    type: 'number',
    group: 'color',
    min: 0.1,
    max: 1,
    appliesTo: ['node', 'edge', 'group'],
  },
  fontFamily: { type: 'string', group: 'typography', appliesTo: ['node', 'group'] },
  fontSize: { type: 'number', group: 'typography', min: 10, max: 40, appliesTo: ['node'] },
  fontWeight: { type: 'enum', group: 'typography', values: [400, 600], appliesTo: ['node'] },
  padding: { type: 'number', group: 'geometry', min: 12, max: 64, appliesTo: ['node'] },
  width: { type: 'number', group: 'geometry', min: 80, max: 1200, appliesTo: ['node'] },
  height: { type: 'number', group: 'geometry', min: 40, max: 1600, appliesTo: ['node'] },
  aspectRatio: { type: 'number', group: 'geometry', min: 0.1, max: 10, appliesTo: ['node'] },
  shape: {
    type: 'enum',
    group: 'geometry',
    values: SHAPE_NAMES,
    appliesTo: ['node'],
  },
  align: {
    type: 'enum',
    group: 'typography',
    values: ['left', 'center', 'right'],
    appliesTo: ['node'],
  },
  verticalAlign: {
    type: 'enum',
    group: 'typography',
    values: ['top', 'middle', 'bottom'],
    appliesTo: ['node'],
  },
  arrowStart: {
    type: 'enum',
    group: 'connection',
    values: ['none', 'open', 'filled', 'diamond', 'circle'],
    appliesTo: ['edge'],
  },
  arrowEnd: {
    type: 'enum',
    group: 'connection',
    values: ['none', 'open', 'filled', 'diamond', 'circle'],
    appliesTo: ['edge'],
  },
  sourcePort: {
    type: 'enum',
    group: 'connection',
    values: ['top', 'right', 'bottom', 'left'],
    appliesTo: ['edge'],
  },
  targetPort: {
    type: 'enum',
    group: 'connection',
    values: ['top', 'right', 'bottom', 'left'],
    appliesTo: ['edge'],
  },
  sourceIndex: { type: 'number', group: 'connection', min: 0, max: 11, appliesTo: ['edge'] },
  targetIndex: { type: 'number', group: 'connection', min: 0, max: 11, appliesTo: ['edge'] },
  routing: {
    type: 'enum',
    group: 'connection',
    values: ['orthogonal', 'straight'],
    appliesTo: ['edge'],
  },
} as const;
export type StyleProperty = keyof typeof STYLE_CAPABILITIES;
export const designSystemSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    revision: z.string().min(1).max(40),
    canvas: z
      .object({
        background: paint.optional(),
        text: paint.optional(),
        secondary: paint.optional(),
        border: paint.optional(),
        fontFamily: elementStyleSchema.shape.fontFamily,
      })
      .strict()
      .optional(),
    spacing: z
      .object({ node: finite(20, 240).optional(), layer: finite(32, 320).optional() })
      .strict()
      .optional(),
    node: elementStyleSchema.optional(),
    edge: elementStyleSchema.optional(),
    group: elementStyleSchema.optional(),
    roles: z.record(z.string().min(1).max(80), elementStyleSchema).optional(),
  })
  .strict();
export type DesignSystem = z.infer<typeof designSystemSchema>;
export const dashArray = (dash?: string) =>
  dash === 'dotted' ? '1 5' : dash === 'dashed' ? '6 5' : '';

export const atelier: DesignSystem = {
  version: 1,
  id: 'atelier',
  name: 'Atelier / editorial',
  revision: '1.0.0',
  canvas: { background: '#f7f5ef', text: '#242c29', secondary: '#69736b', border: '#d8ded4' },
  spacing: { node: 44, layer: 80 },
  node: {
    shape: 'rect',
    fill: '#fffef9',
    stroke: '#c7d0c3',
    text: '#243b30',
    secondary: '#657367',
    radius: 2,
    fontFamily: 'IBM Plex Sans',
    fontSize: 16,
    padding: 22,
  },
  edge: { stroke: '#64776a', strokeWidth: 1.6, arrowEnd: 'filled' },
  group: { fill: '#eeeee5', stroke: '#cdd3c6', radius: 4, dash: 'solid', text: '#526849' },
  roles: {
    emphasis: { fill: '#dce9b9', stroke: '#a7be78' },
    caution: { fill: '#fae4b6', stroke: '#d8b977' },
    quiet: { fill: '#eeeee8', stroke: '#d0d3c9' },
  },
};
export const signal: DesignSystem = {
  version: 1,
  id: 'signal',
  name: 'Signal / technical',
  revision: '1.0.0',
  canvas: { background: '#101c2e', text: '#eff6ff', secondary: '#99b0cb', border: '#31455f' },
  spacing: { node: 48, layer: 96 },
  node: {
    shape: 'rect',
    fill: '#192b43',
    stroke: '#3d5877',
    text: '#f1f7ff',
    secondary: '#a3bad3',
    radius: 16,
    fontFamily: 'IBM Plex Sans',
    fontSize: 16,
    padding: 22,
  },
  edge: { stroke: '#77b9d2', strokeWidth: 2, arrowEnd: 'open' },
  group: { fill: '#142238', stroke: '#344960', radius: 20, dash: 'dashed', text: '#9dcfe0' },
  roles: {
    emphasis: { fill: '#164857', stroke: '#50b7bc' },
    caution: { fill: '#56402c', stroke: '#cf9d60' },
    quiet: { fill: '#1a2739', stroke: '#344960' },
  },
};
