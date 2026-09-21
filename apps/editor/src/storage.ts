import regularFont from '../../../public/fonts/IBMPlexSans-Regular.ttf?inline';
import boldFont from '../../../public/fonts/IBMPlexSans-SemiBold.ttf?inline';
import { useCallback, useEffect, useState } from 'react';
import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';
import platform from '../../../examples/platform.forma.json';
import release from '../../../examples/release.forma.json';
import architecture from '../../../examples/gallery/architecture.forma.json';
import decision from '../../../examples/gallery/decision.forma.json';
import organization from '../../../examples/gallery/organization.forma.json';
import entities from '../../../examples/gallery/entities.forma.json';
import timeline from '../../../examples/gallery/timeline.forma.json';
import mindmap from '../../../examples/gallery/mindmap.forma.json';
import development from '../../../examples/gallery/development.forma.json';
export const templates = { architecture: parseDocument(platform), flow: parseDocument(release) };
export const gallery = {
  architecture: parseDocument(architecture),
  decision: parseDocument(decision),
  organization: parseDocument(organization),
  entities: parseDocument(entities),
  timeline: parseDocument(timeline),
  mindmap: parseDocument(mindmap),
  development: parseDocument(development),
};
const KEY = 'forma.document.v1';
export function useDocument() {
  const [initial] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return parseDocument(JSON.parse(saved));
    } catch {
      /* Preserve unusable storage until next deliberate edit. */
    }
    return templates.architecture;
  });
  const [history, setHistory] = useState({
    revision: 0,
    past: [] as Diagram[],
    current: initial,
    future: [] as Diagram[],
  });
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    if (history.revision === 0) return;
    try {
      localStorage.setItem(KEY, serializeDocument(history.current));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [history.current, history.revision]);
  const commit = useCallback((doc: Diagram) => {
    const valid = parseDocument(doc);
    setHistory((h) =>
      serializeDocument(h.current) === serializeDocument(valid)
        ? h
        : {
            past: [...h.past, h.current].slice(-60),
            current: valid,
            future: [],
            revision: h.revision + 1,
          },
    );
  }, []);
  const undo = useCallback(
    () =>
      setHistory((h) => {
        if (!h.past.length) return h;
        const current = h.past.at(-1)!;
        return {
          past: h.past.slice(0, -1),
          current,
          future: [h.current, ...h.future],
          revision: h.revision + 1,
        };
      }),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) => {
        if (!h.future.length) return h;
        const current = h.future[0];
        return {
          past: [...h.past, h.current],
          current,
          future: h.future.slice(1),
          revision: h.revision + 1,
        };
      }),
    [],
  );
  return {
    doc: history.current,
    commit,
    replace: (doc: Diagram) =>
      setHistory((h) => ({
        revision: h.revision + 1,
        past: [],
        future: [],
        current: parseDocument(doc),
      })),
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    saved,
  };
}
export function download(name: string, content: string | Blob, type = 'application/json') {
  const url = URL.createObjectURL(
    typeof content === 'string' ? new Blob([content], { type }) : content,
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function slug(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'diagram'
  );
}
export async function localFont(bold = false) {
  return bold ? boldFont : regularFont;
}
export async function pngFromSvg(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to rasterize the diagram. Try SVG export.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(
      2,
      8192 / width,
      8192 / height,
      Math.sqrt(32_000_000 / (width * height)),
    );
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
