import type { Diagram, DiagramNode, DiagramEdge, DiagramGroup } from './document';
import type {
  ElementStyle,
  NodeStyleProperty,
  EdgeStyleProperty,
  GroupStyleProperty,
  StyleProperty,
} from './styles';
import { accents, themes } from './theme';
import { classicNodeText, styledNodeText } from './text';
import { SHAPE_REGISTRY } from './shapes';

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
  const role = system?.roles?.[edge.role ?? ''];
  return {
    ...(system?.canvas ? { fill: system.canvas.background, text: system.canvas.secondary } : {}),
    ...system?.edge,
    ...role,
    dash:
      edge.appearance?.dash ??
      role?.dash ??
      system?.edge?.dash ??
      (edge.style === 'dashed' ? 'dashed' : 'solid'),
    ...edge.appearance,
  };
}
export function resolveGroupStyle(doc: Diagram, group: DiagramGroup): ElementStyle {
  const system = doc.presentation.designSystem;
  return { ...system?.group, ...system?.roles?.[group.role ?? ''], ...group.style };
}

export type StyleSource = 'builtIn' | 'designSystem' | 'role' | 'element' | 'override';
export interface EffectiveStyleProperty<K extends StyleProperty = StyleProperty> {
  key: K;
  value: ElementStyle[K] | undefined;
  source: StyleSource | undefined;
  overridden: boolean;
  canReset: boolean;
}
function property<K extends StyleProperty>(
  key: K,
  layers: { source: StyleSource; style?: ElementStyle }[],
  builtIn?: ElementStyle,
): EffectiveStyleProperty<K> {
  let value: ElementStyle[K] | undefined, source: StyleSource | undefined;
  for (const layer of layers) {
    const candidate = layer.style?.[key];
    if (candidate !== undefined) {
      value = candidate;
      source = layer.source;
    }
  }
  if (value === undefined && builtIn?.[key] !== undefined) {
    value = builtIn[key];
    source = 'builtIn';
  }
  return {
    key,
    value,
    source,
    overridden: source === 'element' || source === 'override',
    canReset: source === 'element' || source === 'override',
  };
}
export function resolveNodeStyleProperty<K extends NodeStyleProperty>(
  doc: Diagram,
  node: DiagramNode,
  key: K,
): EffectiveStyleProperty<K> {
  const sys = doc.presentation.designSystem;
  const role =
    node.role ??
    (node.emphasis === 'primary' ? 'emphasis' : node.emphasis === 'muted' ? 'quiet' : '');
  const theme = themes[doc.presentation.theme],
    accent = accents[doc.presentation.nodes[node.id]?.color ?? nodeColor(doc, node)];
  const resolved = resolveNodeStyle(doc, node);
  const measured =
    key === 'width' || key === 'height'
      ? resolveNodeVariant(doc, node) === 'classic'
        ? classicNodeText(node.label, node.description, resolved)
        : styledNodeText(node.label, node.description, resolved)
      : undefined;
  const builtIn: ElementStyle =
    resolveNodeVariant(doc, node) === 'classic'
      ? {
          fill:
            node.emphasis === 'primary'
              ? doc.presentation.theme === 'midnight'
                ? '#2b394e'
                : accent.fill
              : theme.card,
          stroke:
            node.emphasis === 'primary'
              ? doc.presentation.theme === 'midnight'
                ? accent.dark
                : accent.border
              : theme.border,
          text: theme.text,
          secondary: theme.secondary,
          radius: 10,
          shape: 'rect',
          strokeWidth: 1,
          opacity: node.emphasis === 'muted' ? 0.62 : 1,
          fontFamily: 'IBM Plex Sans',
          fontSize: 16,
          fontWeight: 600,
          padding: 20,
          align: 'left',
          verticalAlign: 'top',
          dash: 'solid',
          width: measured?.width,
          height: measured?.height,
        }
      : {
          fill: theme.card,
          stroke: theme.border,
          text: theme.text,
          secondary: theme.secondary,
          radius: 10,
          shape: 'rect',
          strokeWidth: 1,
          opacity: node.emphasis === 'muted' ? 0.62 : 1,
          fontFamily: 'IBM Plex Sans',
          fontSize: 16,
          fontWeight: 600,
          padding: 20,
          align: SHAPE_REGISTRY[resolved.shape ?? 'rect'].defaultAlign,
          verticalAlign: 'middle',
          dash: 'solid',
          width: measured?.width,
          height: measured?.height,
        };
  const resolvedProperty = property(
    key,
    [
      { source: 'designSystem', style: sys?.node },
      { source: 'role', style: sys?.roles?.[role] },
      { source: 'element', style: node.style },
      { source: 'override', style: doc.presentation.nodes[node.id]?.style },
    ],
    builtIn,
  );
  if (measured && (key === 'width' || key === 'height')) {
    const value = key === 'width' ? measured.width : measured.height;
    return { ...resolvedProperty, value } as EffectiveStyleProperty<K>;
  }
  return resolvedProperty;
}
export function resolveEdgeStyleProperty<K extends EdgeStyleProperty>(
  doc: Diagram,
  edge: DiagramEdge,
  key: K,
): EffectiveStyleProperty<K> {
  const sys = doc.presentation.designSystem;
  return property(
    key,
    [
      { source: 'element', style: { dash: edge.style === 'dashed' ? 'dashed' : 'solid' } },
      {
        source: 'designSystem',
        style: { fill: sys?.canvas?.background, text: sys?.canvas?.secondary },
      },
      { source: 'designSystem', style: sys?.edge },
      { source: 'role', style: sys?.roles?.[edge.role ?? ''] },
      { source: 'element', style: edge.appearance },
    ],
    {
      stroke: themes[doc.presentation.theme].line,
      text: themes[doc.presentation.theme].secondary,
      fill: themes[doc.presentation.theme].background,
      strokeWidth: 1.5,
      dash: edge.style === 'dashed' ? 'dashed' : 'solid',
      opacity: 1,
      arrowStart: 'none',
      arrowEnd: 'open',
      routing: 'orthogonal',
    },
  );
}
export function resolveGroupStyleProperty<K extends GroupStyleProperty>(
  doc: Diagram,
  group: DiagramGroup,
  key: K,
): EffectiveStyleProperty<K> {
  const sys = doc.presentation.designSystem;
  const theme = themes[doc.presentation.theme],
    accent = accents[group.color];
  return property(
    key,
    [
      { source: 'designSystem', style: sys?.group },
      { source: 'role', style: sys?.roles?.[group.role ?? ''] },
      { source: 'element', style: group.style },
    ],
    {
      fill: theme.group,
      stroke: theme.border,
      text: doc.presentation.theme === 'midnight' ? accent.dark : accent.ink,
      strokeWidth: 1,
      dash: 'dashed',
      radius: 14,
      opacity: 1,
      fontFamily: 'IBM Plex Sans',
    },
  );
}

function nodeColor(doc: Diagram, node: DiagramNode): keyof typeof accents {
  if (node.emphasis === 'primary') return 'blue';
  if (node.group)
    return (doc.groups.find((group) => group.id === node.group)?.color ??
      'slate') as keyof typeof accents;
  return doc.type === 'flow' ? 'blue' : 'slate';
}

/** Preserve legacy behavior for files without a stored presentation choice. */
export function resolveNodeVariant(doc: Diagram, node: DiagramNode): 'classic' | 'shape' {
  return (
    doc.presentation.nodes[node.id]?.variant ??
    (Object.keys(resolveNodeStyle(doc, node)).length ? 'shape' : 'classic')
  );
}
