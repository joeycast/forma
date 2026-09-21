import { hosted } from './hosting';
import { useCallback, useEffect, useState } from 'react';
import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';
import { slug } from './storage';
type Item = { path: string; title: string; modified: string; error?: string };
type Library = {
  mode: 'local' | 'browser' | 'hosted';
  directory: string;
  workspace: string;
  items: Item[];
  folders: string[];
  owner?: string;
  bytes?: number;
  quota?: { bytes: number; files: number };
};
export type OpenFile = { path: string; revision: string; workspace: string };
type Entry = { document: Diagram; revision: string; modified: string };
const KEY = 'forma.library.v1';
const ACTIVE = 'forma.library.active.v1';
function previousSession(): { active: OpenFile | null; savedDocument: string } {
  if (hosted) return { active: null, savedDocument: '' };
  try {
    return JSON.parse(sessionStorage.getItem(ACTIVE) ?? '{"active":null,"savedDocument":""}');
  } catch {
    return { active: null, savedDocument: '' };
  }
}
const readBrowser = (): Record<string, Entry> => JSON.parse(localStorage.getItem(KEY) ?? '{}');
async function request(path: string, body?: unknown) {
  const response = await fetch(
    `/api/${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The library request failed.');
  return data;
}
export function useLibrary() {
  const local = hosted || !!document.querySelector('meta[name="forma-local"]');
  const [info, setInfo] = useState<Library | null>(null),
    [error, setError] = useState(''),
    [active, setActive] = useState<OpenFile | null>(() => previousSession().active),
    [savedDocument, setSavedDocument] = useState(() => previousSession().savedDocument);
  useEffect(() => {
    if (hosted) return;
    try {
      sessionStorage.setItem(ACTIVE, JSON.stringify({ active, savedDocument }));
    } catch {
      /* Library files remain the durable copy. */
    }
  }, [active, savedDocument]);
  const refresh = useCallback(async () => {
    try {
      let value: Library;
      if (local) value = await request('library');
      else {
        const entries = readBrowser();
        value = {
          mode: 'browser',
          directory: 'This browser',
          workspace: 'browser',
          folders: [
            ...new Set(
              Object.keys(entries)
                .filter((p) => p.includes('/'))
                .map((p) => p.slice(0, p.lastIndexOf('/'))),
            ),
          ],
          items: Object.entries(entries).map(([path, e]) => ({
            path,
            title: e.document.title,
            modified: e.modified,
          })),
        };
      }
      setInfo(value);
      setError('');
      return value;
    } catch (e) {
      setError(
        !hosted && local
          ? `Cannot reach the local library. Keep forma serve running. ${(e as Error).message}`
          : (e as Error).message,
      );
      throw e;
    }
  }, [local]);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  const open = async (path: string) => {
    if (!info) throw new Error('Library is not ready.');
    const result = local
      ? await request(
          `document?path=${encodeURIComponent(path)}&workspace=${encodeURIComponent(info.workspace)}`,
        )
      : readBrowser()[path];
    if (!result) throw new Error('This diagram no longer exists. Refresh the library.');
    const doc = parseDocument(result.document);
    setActive({ path, revision: result.revision, workspace: info.workspace });
    setSavedDocument(serializeDocument(doc));
    return doc;
  };
  const save = useCallback(
    async (doc: Diagram, path?: string) => {
      if (!info) throw new Error('Open Library and reconnect before saving.');
      const target = path ?? active?.path;
      if (!target) throw new Error('Choose a path in Library first.');
      if (
        !target.endsWith('.forma.json') ||
        target.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
        target.includes('\\')
      )
        throw new Error('Use a relative path ending in .forma.json.');
      const expected =
        active?.path === target && active.workspace === info.workspace ? active.revision : null;
      const document = parseDocument(doc);
      let result: OpenFile;
      if (local)
        result = await request('document', {
          path: target,
          document,
          revision: expected,
          workspace: info.workspace,
        });
      else {
        const entries = readBrowser();
        if ((entries[target]?.revision ?? null) !== expected)
          throw new Error(
            'A diagram already exists or changed at this path. Open it first or choose a new path.',
          );
        const revision = crypto.randomUUID();
        entries[target] = { document, revision, modified: new Date().toISOString() };
        localStorage.setItem(KEY, JSON.stringify(entries));
        result = { path: target, revision, workspace: 'browser' };
      }
      setActive(result);
      setSavedDocument(serializeDocument(document));
      await refresh().catch(() => {});
      return result;
    },
    [info, active, local, refresh],
  );
  const switchDirectory = async (directory: string) => {
    if (!local || hosted)
      throw new Error('Source folders are managed by the administrator in hosted mode.');
    const value = await request('library', { directory });
    setInfo(value);
    setActive(null);
    setSavedDocument('');
  };
  return {
    info,
    error,
    active,
    refresh,
    open,
    save,
    switchDirectory,
    detach: () => {
      setActive(null);
      setSavedDocument('');
    },
    dirty: (doc: Diagram) => serializeDocument(doc) !== savedDocument,
  };
}
export type LibraryController = ReturnType<typeof useLibrary>;
export function LibraryDialog({
  library,
  doc,
  onOpen,
  onClose,
}: {
  library: LibraryController;
  doc: Diagram;
  onOpen: (doc: Diagram) => void;
  onClose: () => void;
}) {
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [search, setSearch] = useState(''),
    [folder, setFolder] = useState(''),
    [path, setPath] = useState(library.active?.path ?? `${slug(doc.title)}.forma.json`),
    [directory, setDirectory] = useState(
      library.info?.mode === 'local' ? library.info.directory : '',
    ),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const entries =
    library.info?.items.filter(
      (i) =>
        (!folder || i.path.startsWith(folder + '/')) &&
        `${i.title} ${i.path}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <h2 id="modal-title">Your diagrams</h2>
      <p>
        {hosted
          ? 'Your diagrams are stored privately on this organization’s server. Save explicitly; export a copy for your agent.'
          : library.info?.mode === 'local'
            ? 'Files shared with your agents. Save explicitly; refresh to pick up changes made outside Forma.'
            : 'Saved in this browser. To work with agents on the same files, run forma serve with your diagram folder.'}
      </p>
      <div className="library-location">
        <strong>{library.info?.directory ?? 'Connecting…'}</strong>
        <button
          className="secondary"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await library.refresh();
            })
          }
        >
          Refresh
        </button>
      </div>
      {library.info?.owner && <p className="help-text">Signed in as {library.info.owner}</p>}
      {library.info?.quota && (
        <p className="help-text">
          {library.info.items.length} / {library.info.quota.files} diagrams ·{' '}
          {((library.info.bytes ?? 0) / 1_000_000).toFixed(1)} /{' '}
          {(library.info.quota.bytes / 1_000_000).toFixed(0)} MB used
        </p>
      )}
      {library.error && (
        <p role="alert" className="form-error">
          {library.error}
        </p>
      )}
      <div className="library-filters">
        <label className="field">
          Find a diagram
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or path"
          />
        </label>
        <label className="field">
          Folder
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">All folders</option>
            {library.info?.folders.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="library-list">
        {entries.length ? (
          entries.map((item) => (
            <button
              key={item.path}
              disabled={pending || !!item.error}
              onClick={() => {
                if (library.dirty(doc)) setNextPath(item.path);
                else
                  void run(async () => {
                    onOpen(await library.open(item.path));
                    onClose();
                  });
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.path}</span>
              {item.error && <small>{item.error}</small>}
            </button>
          ))
        ) : (
          <div className="library-empty">
            {hosted
              ? 'No diagrams here yet. Save the current diagram, or import a native file from your agent using Open.'
              : 'No diagrams here yet. Save the current diagram below, or ask your agent to create a .forma.json file in this folder.'}
          </div>
        )}
      </div>
      {nextPath && (
        <div className="library-confirm">
          <p>Save your current diagram before opening {nextPath}?</p>
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await library.save(doc, path);
                onOpen(await library.open(nextPath));
                onClose();
              })
            }
          >
            Save & open
          </button>
          <button
            className="secondary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                onOpen(await library.open(nextPath));
                onClose();
              })
            }
          >
            Open without saving
          </button>
          <button className="text-button" onClick={() => setNextPath(null)}>
            Cancel
          </button>
        </div>
      )}
      {library.active && library.dirty(doc) && (
        <p className="help-text">
          The current diagram has unsaved library changes. Save before opening another file; opening
          another library file starts a fresh editing history.
        </p>
      )}
      <div className="library-save">
        <label className="field">
          Save current diagram as
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="architecture/checkout.forma.json"
          />
        </label>
        <button
          className="primary"
          disabled={pending || !library.info}
          onClick={() =>
            run(async () => {
              await library.save(doc, path);
              setMessage('Saved to library.');
            })
          }
        >
          Save diagram
        </button>
      </div>
      {!hosted && (
        <details>
          <summary>Choose a source folder</summary>
          {library.info?.mode === 'local' ? (
            <>
              <label className="field">
                Absolute folder path
                <input
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="/Users/you/Diagrams"
                />
              </label>
              <button
                className="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await library.switchDirectory(directory);
                    setFolder('');
                  })
                }
              >
                Use this folder
              </button>
              <p className="help-text">
                Subfolders are included. A missing folder is created. Existing diagrams are never
                moved.
              </p>
            </>
          ) : (
            <code>forma serve --directory ~/Forma</code>
          )}
        </details>
      )}
      {message && (
        <p role="status" className="form-error">
          {message}
        </p>
      )}
    </>
  );
}
