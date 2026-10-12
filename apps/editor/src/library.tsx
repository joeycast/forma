import { hosted } from './hosting';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';
import { slug } from './storage';
import { readStoredSnapshot, updateStoredSnapshot } from './indexeddb-storage';
import type { UnnamedDraftList, UnnamedDraftSnapshot } from './drafts';
import './library.css';
type Item = { path: string; title: string; modified: string; revision: string; error?: string };
export type TrashItem = {
  trashId: string;
  path: string;
  title: string;
  revision: string;
  deletedAt: string;
};
type Library = {
  mode: 'local' | 'browser' | 'hosted';
  directory: string;
  workspace: string;
  items: Item[];
  folders: string[];
  owner?: string;
  bytes?: number;
  quota?: { bytes: number; files: number };
  trash: TrashItem[];
};
export type OpenFile = { path: string; revision: string; workspace: string };
type Entry = { document: Diagram; revision: string; modified: string };
type StoredTrash = Omit<TrashItem, 'title'> & { entry: Entry };
const KEY = 'forma.library.v1';
const ACTIVE = 'forma.library.active.v1';
const TRASH = 'forma.library.trash.v1';
const STATE = 'forma.library.state.v2';
type BrowserState = {
  version: 2;
  entries: Record<string, Entry>;
  trash: StoredTrash[];
};
function validateBrowserState(value: unknown): asserts value is BrowserState {
  const state = value as Partial<BrowserState> | null;
  if (
    !state ||
    state.version !== 2 ||
    !state.entries ||
    typeof state.entries !== 'object' ||
    Array.isArray(state.entries) ||
    !Array.isArray(state.trash)
  )
    throw new Error('The saved browser library is damaged or unsupported. Its data was preserved.');
  const validEntry = (entry: unknown): entry is Entry => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<Entry>;
    return (
      !!candidate.document &&
      typeof candidate.document === 'object' &&
      typeof candidate.revision === 'string' &&
      typeof candidate.modified === 'string'
    );
  };
  if (!Object.values(state.entries).every(validEntry))
    throw new Error('A saved browser diagram is damaged. Its data was preserved.');
  if (
    !state.trash.every(
      (item) =>
        !!item &&
        typeof item.trashId === 'string' &&
        typeof item.path === 'string' &&
        typeof item.revision === 'string' &&
        typeof item.deletedAt === 'string' &&
        validEntry(item.entry),
    )
  )
    throw new Error('A saved browser trash item is damaged. Its data was preserved.');
}
export class LibraryError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}
function previousSession(): { active: OpenFile | null; savedDocument: string } {
  if (hosted) return { active: null, savedDocument: '' };
  try {
    return JSON.parse(sessionStorage.getItem(ACTIVE) ?? '{"active":null,"savedDocument":""}');
  } catch {
    return { active: null, savedDocument: '' };
  }
}
const readBrowser = (): Record<string, Entry> => JSON.parse(localStorage.getItem(KEY) ?? '{}');
const readTrash = (): StoredTrash[] => JSON.parse(localStorage.getItem(TRASH) ?? '[]');
const readLegacyBrowserState = (): BrowserState => {
  const current = localStorage.getItem(STATE);
  if (current !== null) {
    const parsed: unknown = JSON.parse(current);
    validateBrowserState(parsed);
    return parsed;
  }
  const legacy = { version: 2 as const, entries: readBrowser(), trash: readTrash() };
  validateBrowserState(legacy);
  return legacy;
};
const readBrowserState = async (): Promise<BrowserState> => {
  const state = await readStoredSnapshot(STATE, readLegacyBrowserState);
  validateBrowserState(state);
  return state;
};
async function mutateBrowserState<T>(update: (state: BrowserState) => T): Promise<T> {
  return updateStoredSnapshot(STATE, readLegacyBrowserState, (state) => {
    validateBrowserState(state);
    return update(state);
  });
}
const validatePath = (target: string) => {
  if (
    !target.endsWith('.forma.json') ||
    target.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
    target.includes('\\')
  )
    throw new LibraryError('Use a relative path ending in .forma.json.');
};
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new LibraryError(data.error ?? 'The library request failed.', response.status);
  return data;
}
export function useLibrary() {
  const local = hosted || !!document.querySelector('meta[name="forma-local"]');
  const [info, setInfo] = useState<Library | null>(null),
    [error, setError] = useState(''),
    [active, setActive] = useState<OpenFile | null>(() => previousSession().active),
    [savedDocument, setSavedDocument] = useState(() => previousSession().savedDocument);
  const refreshSequence = useRef(0);
  useEffect(() => {
    if (hosted) return;
    try {
      sessionStorage.setItem(ACTIVE, JSON.stringify({ active, savedDocument }));
    } catch {
      /* Library files remain the durable copy. */
    }
  }, [active, savedDocument]);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      let value: Library;
      if (local) value = await request('library');
      else {
        const state = await readBrowserState();
        const entries = state.entries;
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
            revision: e.revision,
          })),
          trash: state.trash.map(({ entry, ...item }) => ({
            ...item,
            title: entry.document.title,
          })),
        };
      }
      if (sequence === refreshSequence.current) {
        setInfo({ ...value, trash: value.trash ?? [] });
        setError('');
      }
      return value;
    } catch (e) {
      if (sequence === refreshSequence.current)
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
      : (await readBrowserState()).entries[path];
    if (!result) throw new Error('This diagram no longer exists. Refresh the library.');
    const doc = parseDocument(result.document);
    const file = { path, revision: result.revision, workspace: info.workspace };
    setActive(file);
    setSavedDocument(serializeDocument(doc));
    return { doc, file };
  };
  const save = useCallback(
    async (doc: Diagram, path?: string) => {
      if (!info) throw new Error('Open Library and reconnect before saving.');
      const target = path ?? active?.path;
      if (!target) throw new Error('Choose a path in Library first.');
      validatePath(target);
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
        result = await mutateBrowserState((state) => {
          if ((state.entries[target]?.revision ?? null) !== expected)
            throw new LibraryError(
              'A diagram already exists or changed at this path. Open it first or choose a new path.',
              409,
            );
          const revision = crypto.randomUUID();
          state.entries[target] = { document, revision, modified: new Date().toISOString() };
          return { path: target, revision, workspace: 'browser' };
        });
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
  const lifecycle = useCallback(
    async (
      action: 'rename' | 'duplicate' | 'trash' | 'restore',
      args: { path?: string; to?: string; revision?: string; trashId?: string },
    ) => {
      if (!info) throw new LibraryError('Open Library and reconnect before continuing.');
      let result: OpenFile | { trashId: string; path: string; revision: string; workspace: string };
      if (local) {
        const workspace = info.workspace;
        if (action === 'rename' || action === 'duplicate') {
          const from = args.path!,
            to = args.to!;
          validatePath(to);
          result = await request(`library/${action}`, {
            from,
            to,
            revision: args.revision,
            workspace,
          });
        } else if (action === 'trash') {
          result = await request('library/trash', {
            path: args.path,
            revision: args.revision,
            workspace,
          });
        } else {
          result = await request('library/restore', {
            trashId: args.trashId,
            revision: args.revision,
            ...(args.to ? { to: args.to } : {}),
            workspace,
          });
        }
      } else {
        result = await mutateBrowserState((state) => {
          const { entries, trash } = state;
          let browserResult:
            OpenFile | { trashId: string; path: string; revision: string; workspace: string };
          if (action === 'rename' || action === 'duplicate') {
            const from = args.path!,
              to = args.to!;
            validatePath(to);
            const source = entries[from];
            if (!source || source.revision !== args.revision)
              throw new LibraryError('This diagram changed. Refresh the library and retry.', 409);
            if (entries[to]) throw new LibraryError('The destination path already exists.', 409);
            const copy = action === 'duplicate';
            const entry = {
              ...structuredClone(source),
              ...(copy
                ? { revision: crypto.randomUUID(), modified: new Date().toISOString() }
                : {}),
            };
            entries[to] = entry;
            if (!copy) delete entries[from];
            browserResult = { path: to, revision: entry.revision, workspace: info.workspace };
          } else if (action === 'trash') {
            const item = entries[args.path!];
            if (!item || item.revision !== args.revision)
              throw new LibraryError('This diagram changed. Refresh the library and retry.', 409);
            const trashed = {
              trashId: crypto.randomUUID(),
              path: args.path!,
              revision: item.revision,
              deletedAt: new Date().toISOString(),
              entry: item,
            };
            state.trash = [...trash, trashed];
            delete entries[args.path!];
            browserResult = {
              trashId: trashed.trashId,
              path: trashed.path,
              revision: trashed.revision,
              workspace: info.workspace,
            };
          } else {
            const item = trash.find((entry) => entry.trashId === args.trashId);
            if (!item || item.revision !== args.revision)
              throw new LibraryError(
                'This trash item changed. Refresh the library and retry.',
                409,
              );
            const to = args.to ?? item.path;
            validatePath(to);
            if (entries[to]) throw new LibraryError('The destination path already exists.', 409);
            entries[to] = item.entry;
            state.trash = trash.filter((entry) => entry.trashId !== item.trashId);
            browserResult = { path: to, revision: item.revision, workspace: info.workspace };
          }
          return browserResult;
        });
      }
      if (action === 'rename' && active && active.path === args.path) setActive(result as OpenFile);
      if (action === 'trash' && active && active.path === args.path) {
        setActive(null);
        setSavedDocument('');
      }
      await refresh().catch(() => {});
      return result;
    },
    [info, local, active, refresh],
  );
  return {
    info,
    error,
    active,
    refresh,
    open,
    lifecycle,
    readDocument: async (path: string) => {
      if (!info) throw new LibraryError('Library is not ready.');
      const result = local
        ? await request(
            `document?path=${encodeURIComponent(path)}&workspace=${encodeURIComponent(info.workspace)}`,
          )
        : (await readBrowserState()).entries[path];
      if (!result)
        throw new LibraryError('This diagram no longer exists. Refresh the library.', 404);
      return {
        doc: parseDocument(result.document),
        file: { path, revision: result.revision, workspace: info.workspace } as OpenFile,
      };
    },
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
  recoveryList,
  onOpenDraftCopy,
  onClose,
}: {
  library: LibraryController;
  doc: Diagram;
  onOpen: (doc: Diagram, file: OpenFile) => void;
  recoveryList: UnnamedDraftList;
  onOpenDraftCopy: (snapshot: UnnamedDraftSnapshot) => void;
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
  const [renameItem, setRenameItem] = useState<Item | null>(null),
    [renameTo, setRenameTo] = useState(''),
    [duplicateItem, setDuplicateItem] = useState<Item | null>(null),
    [duplicateTo, setDuplicateTo] = useState(''),
    [trashItem, setTrashItem] = useState<Item | null>(null),
    [restoreItem, setRestoreItem] = useState<TrashItem | null>(null),
    [restoreTo, setRestoreTo] = useState(''),
    [saveConflict, setSaveConflict] = useState(''),
    [serverVersion, setServerVersion] = useState<{ doc: Diagram; file: OpenFile } | null>(null),
    [copyPath, setCopyPath] = useState(`${slug(doc.title)}-copy.forma.json`);
  useEffect(() => {
    if (library.active?.path) setPath(library.active.path);
  }, [library.active?.path]);
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
    library.info?.items
      .filter(
        (i) =>
          (!folder || i.path.startsWith(folder + '/')) &&
          `${i.title} ${i.path}`.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => b.modified.localeCompare(a.modified)) ?? [];
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
      {recoveryList.items.length > 0 && (
        <section className="library-recovery" aria-labelledby="recovery-list-title">
          <h3 id="recovery-list-title">Unsaved drafts</h3>
          <p>Open a separate copy of a draft from another tab or browser session.</p>
          <div className="library-recovery-list">
            {recoveryList.items.map((item) => (
              <div className="library-recovery-entry" key={item.identity}>
                <span>
                  <strong>{item.title || 'Untitled diagram'}</strong>
                  <small>Updated {new Date(item.updatedAt).toLocaleString()}</small>
                </span>
                <button className="secondary" onClick={() => onOpenDraftCopy(item)}>
                  Open as copy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {!recoveryList.storageAvailable && (
        <p className="help-text" role="status">
          Draft recovery could not read this browser’s storage. Existing files and drafts were left
          unchanged.
        </p>
      )}
      {recoveryList.skippedInvalid > 0 && (
        <p className="help-text" role="status">
          Some saved draft entries could not be read. Their original data was left unchanged.
        </p>
      )}
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
            <div className="library-entry" key={item.path}>
              <button
                className="library-entry-open"
                disabled={pending || !!item.error}
                onClick={() => {
                  if (library.dirty(doc)) setNextPath(item.path);
                  else
                    void run(async () => {
                      const opened = await library.open(item.path);
                      onOpen(opened.doc, opened.file);
                      onClose();
                    });
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.path}</span>
                {item.error && <small>{item.error}</small>}
              </button>
              <div className="library-entry-actions">
                <button
                  title={`Rename ${item.title}`}
                  onClick={() => {
                    setRenameItem(item);
                    setRenameTo(item.path);
                  }}
                >
                  Rename
                </button>
                <button
                  title={`Duplicate ${item.title}`}
                  onClick={() => {
                    setDuplicateItem(item);
                    setDuplicateTo(`${item.path.replace(/\.forma\.json$/, '')}-copy.forma.json`);
                  }}
                >
                  Duplicate
                </button>
                <button title={`Move ${item.title} to trash`} onClick={() => setTrashItem(item)}>
                  Trash
                </button>
              </div>
              {renameItem?.path === item.path && (
                <div className="library-inline-action">
                  <label className="field">
                    New path
                    <input value={renameTo} onChange={(event) => setRenameTo(event.target.value)} />
                  </label>
                  <button
                    className="primary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await library.lifecycle('rename', {
                          path: item.path,
                          to: renameTo,
                          revision: item.revision,
                        });
                        setRenameItem(null);
                        setMessage('Diagram renamed.');
                      })
                    }
                  >
                    Save name
                  </button>
                  <button className="text-button" onClick={() => setRenameItem(null)}>
                    Cancel
                  </button>
                </div>
              )}
              {duplicateItem?.path === item.path && (
                <div className="library-inline-action">
                  <label className="field">
                    Copy path
                    <input
                      value={duplicateTo}
                      onChange={(event) => setDuplicateTo(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await library.lifecycle('duplicate', {
                          path: item.path,
                          to: duplicateTo,
                          revision: item.revision,
                        });
                        setDuplicateItem(null);
                        setMessage('Diagram duplicated.');
                      })
                    }
                  >
                    Create copy
                  </button>
                  <button className="text-button" onClick={() => setDuplicateItem(null)}>
                    Cancel
                  </button>
                </div>
              )}
              {trashItem?.path === item.path && (
                <div
                  className="library-inline-action"
                  role="group"
                  aria-label={`Confirm trash ${item.title}`}
                >
                  <span>Move “{item.title}” to Trash? It can be restored later.</span>
                  <button
                    className="primary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await library.lifecycle('trash', {
                          path: item.path,
                          revision: item.revision,
                        });
                        setTrashItem(null);
                        setMessage('Diagram moved to Trash.');
                      })
                    }
                  >
                    Move to Trash
                  </button>
                  <button className="text-button" onClick={() => setTrashItem(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="library-empty">
            {hosted
              ? 'No diagrams here yet. Save the current diagram, or import a native file from your agent using Open.'
              : 'No diagrams here yet. Save the current diagram below, or ask your agent to create a .forma.json file in this folder.'}
          </div>
        )}
      </div>
      <section className="library-trash" aria-labelledby="trash-title">
        <h3 id="trash-title">Trash</h3>
        {library.info?.trash.length ? (
          library.info.trash.map((item) => (
            <div className="library-trash-entry" key={item.trashId}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.path} · deleted {new Date(item.deletedAt).toLocaleDateString()}
                </small>
              </span>
              <button
                className="secondary"
                onClick={() => {
                  setRestoreItem(item);
                  setRestoreTo(item.path);
                }}
              >
                Restore
              </button>
              {restoreItem?.trashId === item.trashId && (
                <div className="library-inline-action">
                  <label className="field">
                    Restore path
                    <input
                      value={restoreTo}
                      onChange={(event) => setRestoreTo(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await library.lifecycle('restore', {
                          trashId: item.trashId,
                          revision: item.revision,
                          to: restoreTo,
                        });
                        setRestoreItem(null);
                        setMessage('Diagram restored.');
                      })
                    }
                  >
                    Restore diagram
                  </button>
                  <button className="text-button" onClick={() => setRestoreItem(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="help-text">Trash is empty.</p>
        )}
      </section>
      {nextPath && (
        <div className="library-confirm">
          <p>Save your current diagram before opening {nextPath}?</p>
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await library.save(doc, path);
                const opened = await library.open(nextPath);
                onOpen(opened.doc, opened.file);
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
                const opened = await library.open(nextPath);
                onOpen(opened.doc, opened.file);
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
              try {
                await library.save(doc, path);
                setSaveConflict('');
                setServerVersion(null);
              } catch (error) {
                if (error instanceof LibraryError && error.status === 409) {
                  setSaveConflict(path);
                  setCopyPath(`${slug(doc.title)}-copy.forma.json`);
                }
                throw error;
              }
              setMessage('Saved to library.');
            })
          }
        >
          Save diagram
        </button>
      </div>
      {saveConflict && (
        <div className="library-conflict" role="alert">
          <strong>This file changed in the library.</strong>
          <p>
            Your local edits are still here. Compare the current version, or save your work as a
            copy.
          </p>
          <button
            className="secondary"
            disabled={pending}
            onClick={() =>
              run(async () => setServerVersion(await library.readDocument(saveConflict)))
            }
          >
            Compare server version
          </button>
          <label className="field">
            Save as copy
            <input value={copyPath} onChange={(event) => setCopyPath(event.target.value)} />
          </label>
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await library.save(doc, copyPath);
                setSaveConflict('');
                setServerVersion(null);
                setMessage('Your edits were saved as a copy.');
              })
            }
          >
            Save copy
          </button>
          {serverVersion && (
            <div className="library-compare">
              <strong>Library version comparison</strong>
              <p>
                Title: {doc.title} / {serverVersion.doc.title}
              </p>
              <p>
                Components: {doc.nodes.length} / {serverVersion.doc.nodes.length} · Connections:{' '}
                {doc.edges.length} / {serverVersion.doc.edges.length}
              </p>
              <details>
                <summary>Compare document contents</summary>
                <h4>Your local version</h4>
                <pre>{serializeDocument(doc)}</pre>
                <h4>Current library version</h4>
                <pre>{serializeDocument(serverVersion.doc)}</pre>
              </details>
            </div>
          )}
        </div>
      )}
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
