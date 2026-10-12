import type { ElementStyle } from './styles';
import { constrainShapeSize, SHAPE_REGISTRY, shapeTextRegion, type ShapeName } from './shapes';
import metrics from './font-metrics.json';
/** Exact advance widths from bundled IBM Plex Sans; conservative fallback for missing glyphs. */
export function textWidth(text: string, size = 14, weight: 400 | 600 = 400): number {
  const widths = (weight === 600 ? metrics.semibold : metrics.regular) as Record<string, number>;
  return [...text].reduce((w, c) => w + (widths[String(c.codePointAt(0))] ?? 1), 0) * size;
}
export function wrapText(
  text: string,
  width: number,
  size: number,
  weight: 400 | 600 = 400,
): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (textWidth(word, size, weight) > width) {
        if (line) {
          lines.push(line);
          line = '';
        }
        for (const char of word) {
          if (textWidth(line + char, size, weight) > width) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
      } else if (line && textWidth(`${line} ${word}`, size, weight) > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
export function nodeText(label: string, description = '') {
  const width = Math.max(224, Math.min(304, Math.ceil((textWidth(label, 16, 600) + 40) / 8) * 8));
  const titleLines = wrapText(label, width - 40, 16, 600);
  const descriptionLines = wrapText(description, width - 40, 12);
  const height =
    Math.ceil(
      (62 +
        titleLines.length * 22 +
        (descriptionLines.length ? 8 + descriptionLines.length * 17 : 0) +
        18) /
        8,
    ) * 8;
  return { width, height, titleLines, descriptionLines };
}

/** Classic-card measurement that keeps the original geometry for cosmetic style edits. */
export function classicNodeText(
  label: string,
  description: string | undefined,
  style: ElementStyle,
) {
  if (
    style.fontSize === undefined &&
    style.fontWeight === undefined &&
    style.padding === undefined &&
    style.width === undefined &&
    style.height === undefined &&
    style.aspectRatio === undefined
  )
    return nodeText(label, description);
  const size = style.fontSize ?? 16,
    weight = style.fontWeight ?? 600,
    padding = style.padding ?? 20,
    width =
      style.width ??
      Math.max(
        224,
        Math.min(304, Math.ceil((textWidth(label, size, weight) + padding * 2) / 8) * 8),
      ),
    titleLines = wrapText(label, width - padding * 2, size, weight),
    descriptionLines = wrapText(description ?? '', width - padding * 2, 12);
  const contentHeight =
      titleLines.length * size * 1.375 +
      (descriptionLines.length ? 8 + descriptionLines.length * 17 : 0),
    height =
      Math.ceil(
        Math.max(style.height ?? 0, 56 + padding + contentHeight + Math.max(4, padding - 16)) / 8,
      ) * 8;
  return {
    ...constrainShapeSize({ width, height }, style.aspectRatio, { width: 80, height: 40 }),
    titleLines,
    descriptionLines,
  };
}

/** Measure the same geometry and typography used by the general shape renderer. */
export function styledNodeText(
  label: string,
  description: string | undefined,
  style: ElementStyle,
) {
  const size = style.fontSize ?? 16,
    weight = style.fontWeight ?? 600,
    padding = style.padding ?? 20;
  const shape = (style.shape ?? 'rect') as ShapeName,
    definition = SHAPE_REGISTRY[shape],
    legacyShape = ['rect', 'pill', 'diamond', 'ellipse', 'cylinder', 'text'].includes(shape);
  const safeWidthRatio = Math.max(0.1, shapeTextRegion(shape, 1000, 1000, padding).width / 1000),
    longestWord = Math.max(
      ...[label, description ?? ''].flatMap((text) =>
        text.split(/\s+/).map((word) => textWidth(word, size, weight)),
      ),
    ),
    textDrivenWidth =
      Math.ceil(
        Math.max(
          textWidth(label, size, weight) + padding * 2,
          (longestWord + padding * 2) / safeWidthRatio,
        ) / 8,
      ) * 8;
  const width =
    style.width !== undefined
      ? style.width
      : Math.max(
          definition.minWidth,
          legacyShape
            ? Math.max(
                180,
                Math.min(320, Math.ceil((textWidth(label, size, weight) + padding * 2) / 8) * 8),
              )
            : Math.max(180, Math.min(640, textDrivenWidth)),
        );
  const region = shapeTextRegion(shape, width, style.height ?? 100, padding);
  const titleLines = wrapText(label, region.width, size, weight);
  const descriptionLines = wrapText(description ?? '', region.width, 12);
  const textHeight =
    titleLines.length * (size * 1.4) +
    (descriptionLines.length ? 8 + descriptionLines.length * 17 : 0);
  const natural = textHeight + padding * 2 + (shape === 'cylinder' ? 20 : 0),
    oldHeight = Math.max(
      style.height ?? 0,
      textHeight * (shape === 'diamond' ? 2.3 : shape === 'ellipse' ? 1.45 : 1),
      natural * (shape === 'diamond' ? 1.6 : shape === 'ellipse' ? 1.2 : 1),
    ),
    insets = definition.textInsets(width, 100, padding),
    availableHeight = Math.max(0.25, 1 - (insets.top + insets.bottom) / 100),
    height = Math.max(
      definition.minHeight,
      ['triangle', 'hexagon', 'parallelogram', 'trapezoid', 'document', 'cloud'].includes(shape)
        ? textHeight / availableHeight + insets.top + insets.bottom + 12
        : oldHeight,
    ),
    measuredSize =
      legacyShape && style.aspectRatio === undefined
        ? { width, height: Math.ceil(oldHeight / 8) * 8 }
        : constrainShapeSize({ width, height: Math.ceil(height / 8) * 8 }, style.aspectRatio, {
            width: style.width === undefined ? definition.minWidth : 0,
            height: style.height === undefined ? definition.minHeight : 0,
          });
  return { ...measuredSize, titleLines, descriptionLines };
}
