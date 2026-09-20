import type { ElementStyle } from './styles';
import type { Diagram, DiagramNode, DiagramEdge, DiagramGroup, Point, Accent } from './document';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SceneNode extends Box {
  style?: ElementStyle;
  id: string;
  semantic: DiagramNode;
  titleLines: string[];
  descriptionLines: string[];
  accent: Accent;
  pinned: boolean;
}
export interface SceneGroup extends Box {
  style?: ElementStyle;
  id: string;
  semantic: DiagramGroup;
  depth: number;
}
export interface SceneEdge {
  style?: ElementStyle;
  id: string;
  semantic: DiagramEdge;
  points: Point[];
  label?: Box & { lines: string[] };
}
export interface Scene {
  document: Diagram;
  fingerprint: string;
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  bounds: Box;
  titleLines: string[];
  descriptionLines: string[];
}
