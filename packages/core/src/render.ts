import { dashArray } from './styles';
import type { Scene, SceneNode, SceneGroup, SceneEdge } from './scene';
import { accents, themes } from './theme';
import { polylinePath } from './geometry';
export const escapeXml = (v: string | number) =>
  String(v)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
    );
const t = (
  x: number,
  y: number,
  value: string,
  size: number,
  fill: string,
  weight = 400,
  extra = '',
) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${escapeXml(value)}</text>`;
const icons: Record<string, string> = {
  service:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M12 6.5h5M12 17.5h5"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  queue:
    '<rect x="2" y="6" width="5" height="12" rx="1.5"/><rect x="9.5" y="6" width="5" height="12" rx="1.5"/><rect x="17" y="6" width="5" height="12" rx="1.5"/>',
  client:
    '<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8M12 18v4M2 8h20M6 5.5h.01M9 5.5h.01"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  process: '<path d="m13 2-9 12h7l-1 8 10-12h-8z"/>',
  decision: '<path d="m12 2 10 10-10 10L2 12zM12 7v6M12 17h.01"/>',
};
export function iconMarkup(kind: string, color: string, x = 0, y = 0, size = 20): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[kind] ?? icons.service}</g>`;
}
export function nodeMarkup(n: SceneNode, themeName: 'paper' | 'midnight'): string {
  if (n.style && Object.keys(n.style).length) return styledNodeMarkup(n, themeName);
  const theme = themes[themeName],
    accent = accents[n.accent],
    dark = themeName === 'midnight',
    primary = n.semantic.emphasis === 'primary';
  const ink = dark ? accent.dark : accent.ink,
    fill = dark ? '#2b394e' : accent.fill;
  const body = `<rect x="0.5" y="1.5" width="${n.width - 1}" height="${n.height - 1}" rx="10" fill="${theme.shadow}" opacity=".04"/>
    <rect x=".5" y=".5" width="${n.width - 1}" height="${n.height - 1}" rx="10" fill="${primary ? fill : theme.card}" stroke="${primary ? (dark ? ink : accent.border) : theme.border}"/>
    <rect x="20" y="18" width="32" height="32" rx="8" fill="${fill}"/>
    ${iconMarkup(n.semantic.kind, ink, 26, 24, 20)}
    ${t(n.width - 20, 38, n.semantic.kind.toUpperCase(), 9, theme.secondary, 500, 'text-anchor="end" letter-spacing="1.1"')}
    ${n.titleLines.map((line, i) => t(20, 76 + i * 22, line, 16, theme.text, 600)).join('')}
    ${n.descriptionLines.map((line, i) => t(20, 76 + n.titleLines.length * 22 + 4 + i * 17, line, 12, theme.secondary)).join('')}`;
  return `<g opacity="${n.semantic.emphasis === 'muted' ? 0.62 : 1}">${body}</g>`;
}
function styledNodeMarkup(n: SceneNode, themeName: 'paper' | 'midnight'): string {
  const s = n.style!,
    theme = themes[themeName],
    w = n.width,
    h = n.height;
  const shape = s.shape ?? 'rect',
    radius = shape === 'pill' ? h / 2 : (s.radius ?? 10);
  const attrs = `fill="${s.fill ?? theme.card}" stroke="${s.stroke ?? theme.border}" stroke-width="${s.strokeWidth ?? 1}" stroke-dasharray="${dashArray(s.dash)}"`;
  let body = `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${radius}" ${attrs}/>`;
  if (shape === 'diamond')
    body = `<path d="M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2}Z" ${attrs}/>`;
  if (shape === 'ellipse')
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 0.5}" ry="${h / 2 - 0.5}" ${attrs}/>`;
  if (shape === 'cylinder')
    body = `<path d="M0 14 C0 -4 ${w} -4 ${w} 14 V${h - 14} C${w} ${h + 4} 0 ${h + 4} 0 ${h - 14}Z M0 14 C0 32 ${w} 32 ${w} 14" ${attrs}/>`;
  if (shape === 'text') body = '';
  const size = s.fontSize ?? 16,
    weight = s.fontWeight ?? 600;
  const centered = s.align === 'center' || ['diamond', 'ellipse', 'pill'].includes(shape);
  const x = centered ? w / 2 : (s.padding ?? 20),
    anchor = centered ? 'text-anchor="middle"' : '';
  const blockHeight =
    n.titleLines.length * size * 1.4 +
    (n.descriptionLines.length ? 8 + n.descriptionLines.length * 17 : 0);
  const top = (h - blockHeight) / 2 + size;
  body += n.titleLines
    .map((line, i) => t(x, top + i * size * 1.4, line, size, s.text ?? theme.text, weight, anchor))
    .join('');
  body += n.descriptionLines
    .map((line, i) =>
      t(
        x,
        top + n.titleLines.length * size * 1.4 + 8 + i * 17,
        line,
        12,
        s.secondary ?? theme.secondary,
        400,
        anchor,
      ),
    )
    .join('');
  return `<g font-family="${escapeXml(s.fontFamily ?? 'IBM Plex Sans')}" opacity="${s.opacity ?? (n.semantic.emphasis === 'muted' ? 0.62 : 1)}">${body}</g>`;
}
export function groupMarkup(g: SceneGroup, themeName: 'paper' | 'midnight'): string {
  const theme = themes[themeName],
    accent = accents[g.semantic.color],
    s = g.style ?? {};
  const ink = s.text ?? (themeName === 'midnight' ? accent.dark : accent.ink);
  return `<g opacity="${s.opacity ?? 1}" font-family="${escapeXml(s.fontFamily ?? 'IBM Plex Sans')}"><rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="${s.radius ?? 14}" fill="${s.fill ?? theme.group}" stroke="${s.stroke ?? theme.border}" stroke-width="${s.strokeWidth ?? 1}" stroke-dasharray="${dashArray(s.dash ?? 'dashed')}"/><rect x="${g.x + 24}" y="${g.y + 26}" width="6" height="6" rx="2" fill="${ink}"/>${t(g.x + 39, g.y + 33, g.semantic.label.toUpperCase(), 11, ink, 600, 'letter-spacing="1.2"')}</g>`;
}
export function edgeMarkup(e: SceneEdge, themeName: 'paper' | 'midnight'): string {
  const s = e.style ?? {},
    ink = s.stroke ?? themes[themeName].line,
    width = s.strokeWidth ?? 1.5;
  const arrow = (start: boolean) => {
    const kind = start ? (s.arrowStart ?? 'none') : (s.arrowEnd ?? 'open');
    if (kind === 'none' || e.points.length < 2) return '';
    const b = start ? e.points[0] : e.points.at(-1)!,
      a = start ? e.points[1] : e.points.at(-2)!;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const path =
      kind === 'diamond'
        ? 'M0 0 L-6 -4 L-12 0 L-6 4Z'
        : kind === 'filled'
          ? 'M0 0 L-8 -4 L-8 4Z'
          : 'M-7 -3.5 L0 0 L-7 3.5';
    return `<g transform="translate(${b.x} ${b.y}) rotate(${angle})" stroke="${ink}" stroke-width="${width}" fill="${kind === 'open' ? 'none' : ink}">${kind === 'circle' ? '<circle cx="-4" cy="0" r="4"/>' : `<path d="${path}"/>`}</g>`;
  };
  return `<g opacity="${s.opacity ?? 1}"><path d="${polylinePath(e.points)}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dashArray(s.dash ?? e.semantic.style)}"/>${arrow(true)}${arrow(false)}</g>`;
}
export function edgeLabelMarkup(e: SceneEdge, themeName: 'paper' | 'midnight'): string {
  if (!e.label) return '';
  const theme = themes[themeName],
    b = e.label;
  return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" fill="${e.style?.fill ?? theme.background}" fill-opacity=".96"/>${b.lines.map((l, i) => t(b.x + b.width / 2, b.y + 15 + i * 15, l, 11, e.style?.text ?? theme.secondary, 400, 'text-anchor="middle"')).join('')}`;
}
export function frameMarkup(scene: Scene): string {
  const { bounds: b, document: doc } = scene,
    theme = { ...themes[doc.presentation.theme], ...doc.presentation.designSystem?.canvas };
  const x = b.x + 56,
    titleY = b.y + 54;
  return `${scene.titleLines.map((l, i) => t(x, titleY + i * 38, l, 30, theme.text, 600, 'letter-spacing="-.7"')).join('')}
  ${scene.descriptionLines.map((l, i) => t(x, titleY + scene.titleLines.length * 38 - 7 + i * 19, l, 13, theme.secondary)).join('')}
  <line x1="${x}" y1="${b.y + b.height - 44}" x2="${b.x + b.width - 56}" y2="${b.y + b.height - 44}" stroke="${theme.border}"/>
  ${t(x, b.y + b.height - 22, 'FORMA  /  ' + doc.type.toUpperCase(), 9, theme.secondary, 500, 'letter-spacing="1.6"')}
  ${t(b.x + b.width - 56, b.y + b.height - 22, `${scene.nodes.length} components  ·  ${scene.edges.length} relationships`, 10, theme.secondary, 400, 'text-anchor="end"')}`;
}
export interface SvgOptions {
  fontDataUri?: string;
  boldFontDataUri?: string;
}
export function renderSvg(scene: Scene, options: SvgOptions = {}): string {
  const b = scene.bounds,
    theme = scene.document.presentation.theme;
  const font = options.fontDataUri
    ? `<style>@font-face{font-family:'IBM Plex Sans';src:url('${options.fontDataUri}') format('truetype');font-weight:400;} ${options.boldFontDataUri ? `@font-face{font-family:'IBM Plex Sans';src:url('${options.boldFontDataUri}') format('truetype');font-weight:600;}` : ''}</style>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" role="img" aria-labelledby="diagram-title diagram-description"><title id="diagram-title">${escapeXml(scene.document.title)}</title><desc id="diagram-description">${escapeXml(scene.document.description ?? '')}</desc>${font}<g font-family="${escapeXml(scene.document.presentation.designSystem?.canvas?.fontFamily ?? 'IBM Plex Sans, Arial, sans-serif')}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${scene.document.presentation.designSystem?.canvas?.background ?? themes[theme].background}"/>${frameMarkup(scene)}${scene.groups.map((g) => groupMarkup(g, theme)).join('')}${scene.edges.map((e) => edgeMarkup(e, theme)).join('')}${scene.nodes.map((n) => `<g transform="translate(${n.x} ${n.y})">${nodeMarkup(n, theme)}</g>`).join('')}${scene.edges.map((e) => edgeLabelMarkup(e, theme)).join('')}</g></svg>`;
}
/** Adapters can emit native editable shapes from Scene, without parsing SVG. */
export interface Exporter<T> {
  id: string;
  mimeType: string;
  extension: string;
  export(scene: Scene): Promise<T> | T;
}
export const svgExporter: Exporter<string> = {
  id: 'svg',
  mimeType: 'image/svg+xml',
  extension: '.svg',
  export: renderSvg,
};
