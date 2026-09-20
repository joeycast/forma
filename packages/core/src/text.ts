import type { ElementStyle } from './styles';
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

/** Measure the same geometry and typography used by the general shape renderer. */
export function styledNodeText(
  label: string,
  description: string | undefined,
  style: ElementStyle,
) {
  const size = style.fontSize ?? 16,
    weight = style.fontWeight ?? 600,
    padding = style.padding ?? 20;
  const shape = style.shape ?? 'rect';
  const width =
    style.width ??
    Math.max(180, Math.min(320, Math.ceil((textWidth(label, size, weight) + padding * 2) / 8) * 8));
  const inset = shape === 'diamond' ? width * 0.23 : shape === 'ellipse' ? width * 0.16 : padding;
  const titleLines = wrapText(label, width - inset * 2, size, weight);
  const descriptionLines = wrapText(description ?? '', width - inset * 2, 12);
  const textHeight =
    titleLines.length * (size * 1.4) +
    (descriptionLines.length ? 8 + descriptionLines.length * 17 : 0);
  const natural = textHeight + padding * 2 + (shape === 'cylinder' ? 20 : 0);
  const height = Math.max(
    style.height ?? 0,
    textHeight * (shape === 'diamond' ? 2.3 : shape === 'ellipse' ? 1.45 : 1),
    natural * (shape === 'diamond' ? 1.6 : shape === 'ellipse' ? 1.2 : 1),
  );
  return { width, height: Math.ceil(height / 8) * 8, titleLines, descriptionLines };
}
