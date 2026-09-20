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
export function groupMarkup(g: SceneGroup, themeName: 'paper' | 'midnight'): string {
  const theme = themes[themeName],
    accent = accents[g.semantic.color],
    ink = themeName === 'midnight' ? accent.dark : accent.ink;
  return `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="14" fill="${theme.group}" stroke="${theme.border}" stroke-dasharray="4 4"/><rect x="${g.x + 24}" y="${g.y + 26}" width="6" height="6" rx="2" fill="${ink}"/>${t(g.x + 39, g.y + 33, g.semantic.label.toUpperCase(), 11, ink, 600, 'letter-spacing="1.2"')}`;
}
export function edgeMarkup(e: SceneEdge, themeName: 'paper' | 'midnight'): string {
  const theme = themes[themeName];
  const a = e.points.at(-2),
    b = e.points.at(-1);
  let arrow = '';
  if (a && b) {
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    arrow = `<path d="M -7 -3.5 L 0 0 L -7 3.5" transform="translate(${b.x} ${b.y}) rotate(${angle})" fill="none" stroke="${theme.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<path d="${polylinePath(e.points)}" fill="none" stroke="${theme.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${e.semantic.style === 'dashed' ? 'stroke-dasharray="5 5"' : ''}/>${arrow}`;
}
export function edgeLabelMarkup(e: SceneEdge, themeName: 'paper' | 'midnight'): string {
  if (!e.label) return '';
  const theme = themes[themeName],
    b = e.label;
  return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" fill="${theme.background}" fill-opacity=".96"/>${b.lines.map((l, i) => t(b.x + b.width / 2, b.y + 15 + i * 15, l, 11, theme.secondary, 400, 'text-anchor="middle"')).join('')}`;
}
export function frameMarkup(scene: Scene): string {
  const { bounds: b, document: doc } = scene,
    theme = themes[doc.presentation.theme];
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" role="img" aria-labelledby="diagram-title diagram-description"><title id="diagram-title">${escapeXml(scene.document.title)}</title><desc id="diagram-description">${escapeXml(scene.document.description ?? '')}</desc>${font}<g font-family="IBM Plex Sans, Arial, sans-serif"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${themes[theme].background}"/>${frameMarkup(scene)}${scene.groups.map((g) => groupMarkup(g, theme)).join('')}${scene.edges.map((e) => edgeMarkup(e, theme)).join('')}${scene.nodes.map((n) => `<g transform="translate(${n.x} ${n.y})">${nodeMarkup(n, theme)}</g>`).join('')}${scene.edges.map((e) => edgeLabelMarkup(e, theme)).join('')}</g></svg>`;
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
