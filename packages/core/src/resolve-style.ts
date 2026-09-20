import type { Diagram, DiagramNode, DiagramEdge, DiagramGroup } from './document';
import type { ElementStyle } from './styles';

/** Shared by layout and editing controls; renderer consumes the resolved scene style. */
export function resolveNodeStyle(doc: Diagram, node: DiagramNode): ElementStyle {
  const system = doc.presentation.designSystem;
  const role =
    node.role ??
    (node.emphasis === 'primary' ? 'emphasis' : node.emphasis === 'muted' ? 'quiet' : '');
  return {
    ...system?.node,
    ...system?.roles?.[role],
    ...node.style,
    ...doc.presentation.nodes[node.id]?.style,
  };
}
export function resolveEdgeStyle(doc: Diagram, edge: DiagramEdge): ElementStyle {
  const system = doc.presentation.designSystem;
  return {
    ...(system?.canvas ? { fill: system.canvas.background, text: system.canvas.secondary } : {}),
    ...system?.edge,
    ...system?.roles?.[edge.role ?? ''],
    ...edge.appearance,
  };
}
export function resolveGroupStyle(doc: Diagram, group: DiagramGroup): ElementStyle {
  const system = doc.presentation.designSystem;
  return { ...system?.group, ...system?.roles?.[group.role ?? ''], ...group.style };
}
