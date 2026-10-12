import regularFont from '../../../public/fonts/IBMPlexSans-Regular.ttf?inline';
import boldFont from '../../../public/fonts/IBMPlexSans-SemiBold.ttf?inline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';
import {
  activeDraftId,
  dismissRecoverableDraft,
  draftTabId,
  findRecoverableDraft,
  historyWithRecoveredDocument,
  linkDraftIdentity,
  persistDraft,
  readDrafts,
  readLegacyDraft,
  rotateDraftId,
  type DraftRecord,
} from './drafts';
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
export function useDocument(scope = 'local') {
  const [draftIdentity, setDraftIdentity] = useState(() => `draft:${activeDraftId(scope)}`);
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  const [initial] = useState(() => templates.architecture);
  const [recovery, setRecovery] = useState<{
    doc: Diagram;
    identity: string;
    revision: string | null;
    stale: boolean;
    record?: DraftRecord;
    legacy?: boolean;
  } | null>(() => {
    const identity = `draft:${activeDraftId(scope)}`;
    for (const candidate of readDrafts(scope, identity)) {
      try {
        const recovered = parseDocument(JSON.parse(candidate.document));
        if (serializeDocument(recovered) !== serializeDocument(initial))
          return {
            doc: recovered,
            identity,
            revision: candidate.baseRevision,
            stale: false,
            record: candidate,
          };
      } catch {
        /* Skip malformed records and try the next saved tab snapshot. */
      }
    }
    const legacy = scope === 'local' ? readLegacyDraft() : null;
    if (legacy) return { doc: legacy, identity, revision: null, stale: false, legacy: true };
    return null;
  });
  const [history, setHistory] = useState({
    revision: 0,
    past: [] as Diagram[],
    current: initial,
    future: [] as Diagram[],
  });
  const [saved, setSaved] = useState(true);
  const [otherTabUpdate, setOtherTabUpdate] = useState(false);
  const draftsSuspended = useRef(false);
  useEffect(() => {
    if (recovery || draftsSuspended.current) return;
    const timer = setTimeout(() => {
      if (draftsSuspended.current) return;
      const result = persistDraft(scope, draftIdentity, history.current, baseRevision);
      setSaved(result.saved);
    }, 250);
    return () => clearTimeout(timer);
  }, [scope, draftIdentity, baseRevision, history.current, history.revision, recovery]);
  useEffect(() => {
    const flush = () => {
      if (!recovery && !draftsSuspended.current)
        persistDraft(scope, draftIdentity, history.current, baseRevision);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [scope, draftIdentity, baseRevision, history.current, recovery]);
  useEffect(() => {
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(`forma-drafts:${encodeURIComponent(scope)}`);
      channel.onmessage = (event) => {
        if (event.data?.action === 'clear-account') {
          draftsSuspended.current = true;
          return;
        }
        if (
          event.data?.identity === draftIdentity &&
          event.data?.tabId &&
          event.data.tabId !== draftTabId(scope)
        )
          setOtherTabUpdate(true);
      };
    } catch {
      /* The app continues with isolated per-tab storage if channels are unavailable. */
    }
    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith(`forma.draft.v2.${encodeURIComponent(scope)}.`) || !event.newValue)
        return;
      try {
        const record = JSON.parse(event.newValue) as DraftRecord;
        if (record.identity === draftIdentity) setOtherTabUpdate(true);
      } catch {
        /* Ignore malformed cross-tab records. */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [scope, draftIdentity]);
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
  const activate = useCallback(
    (doc: Diagram, identity: string, revision: string | null) => {
      persistDraft(scope, draftIdentity, history.current, baseRevision);
      const candidate = findRecoverableDraft(scope, identity, doc, revision);
      setHistory({ revision: 0, past: [], current: parseDocument(doc), future: [] });
      setDraftIdentity(identity);
      setBaseRevision(revision);
      setRecovery(
        candidate
          ? {
              doc: candidate.doc,
              identity,
              revision: candidate.record.baseRevision,
              stale: candidate.stale,
              record: candidate.record,
            }
          : null,
      );
    },
    [scope, history.current, draftIdentity, baseRevision],
  );
  const setDraftLocation = useCallback(
    (identity: string, revision: string | null) => {
      if (draftIdentity.startsWith('library:') && identity.startsWith('library:'))
        linkDraftIdentity(scope, draftIdentity, identity);
      setDraftIdentity(identity);
      setBaseRevision(revision);
    },
    [scope, draftIdentity],
  );
  const recover = useCallback(() => {
    if (!recovery) return;
    if (recovery.legacy) {
      try {
        localStorage.setItem('forma.document.v1.migrated', 'recovered');
      } catch {
        /* Original remains available. */
      }
    }
    setHistory((h) => historyWithRecoveredDocument(h.current, recovery.doc, h.revision));
    setRecovery(null);
  }, [recovery]);
  const keepOriginal = useCallback(() => {
    if (recovery?.record) dismissRecoverableDraft(scope, recovery.record);
    if (recovery?.legacy) {
      try {
        localStorage.setItem('forma.document.v1.migrated', 'kept');
      } catch {
        /* Keep legacy bytes. */
      }
    }
    setRecovery(null);
  }, [recovery, scope]);
  const newDraft = useCallback(
    (doc: Diagram) => {
      persistDraft(scope, draftIdentity, history.current, baseRevision);
      setDraftIdentity(`draft:${rotateDraftId(scope)}`);
      setBaseRevision(null);
      setRecovery(null);
      setHistory({ revision: 1, past: [], current: parseDocument(doc), future: [] });
    },
    [scope, history.current, draftIdentity, baseRevision],
  );
  const openDraftCopy = useCallback(
    (doc: Diagram) => {
      persistDraft(scope, draftIdentity, history.current, baseRevision);
      setDraftIdentity(`draft:${rotateDraftId(scope)}`);
      setBaseRevision(null);
      setRecovery(null);
      setHistory((h) => historyWithRecoveredDocument(h.current, doc, h.revision));
    },
    [scope, history.current, draftIdentity, baseRevision],
  );
  return {
    doc: history.current,
    draftIdentity,
    commit,
    replace: (doc: Diagram) =>
      setHistory((h) => ({
        revision: h.revision + 1,
        past: [],
        future: [],
        current: parseDocument(doc),
      })),
    activate,
    setDraftLocation,
    recover,
    keepOriginal,
    newDraft,
    openDraftCopy,
    recovery,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    saved,
    otherTabUpdate,
    clearOtherTabUpdate: () => setOtherTabUpdate(false),
    suspendDrafts: () => {
      draftsSuspended.current = true;
    },
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
