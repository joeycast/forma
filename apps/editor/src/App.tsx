import { AgentAccess } from './AgentAccess';
import { hosted } from './hosting';
import type { Account } from './AuthGate';
import { useLibrary, LibraryDialog } from './library';
import { DesignSystems } from './DesignSystems';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Plus,
  Search,
  Layers,
  Blocks,
  Network,
  PanelLeftClose,
  FileJson,
  Terminal,
  WandSparkles,
  CheckCircle2,
  AlertCircle,
  Grid2X2,
  X,
  Monitor,
  Server,
  Database,
  ListOrdered,
  Zap,
  GitBranch,
  UserRound,
  Pin,
  Check,
  FolderPlus,
  SlidersHorizontal,
} from 'lucide-react';
import { type Connection } from '@xyflow/react';
import {
  layoutDiagram,
  parseDocument,
  patchDocument,
  renderSvg,
  serializeDocument,
  inspectScene,
  alignNodes,
  distributeNodes,
  nudgeNodes,
  type AlignEdge,
  type DistributeAxis,
  type Patch,
  type Scene,
  type DiagramNode,
} from '../../../packages/core/src';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { Dialogs } from './Dialogs';
import { download, localFont, pngFromSvg, slug, useDocument } from './storage';
const kindIcons = {
  service: Server,
  database: Database,
  queue: ListOrdered,
  client: Monitor,
  person: UserRound,
  process: Zap,
  decision: GitBranch,
};
export function App({ account }: { account?: Account }) {
  const { doc, commit, replace, undo, redo, canUndo, canRedo, saved } = useDocument();
  const library = useLibrary();
  const [scene, setScene] = useState<Scene | null>(null),
    [busy, setBusy] = useState(true),
    [layoutError, setLayoutError] = useState('');
  const [selected, setSelected] = useState<string[]>([]),
    [inspectorTab, setInspectorTab] = useState('design');
  const [modal, setModal] = useState(hosted ? 'library' : ''),
    [menu, setMenu] = useState(''),
    [toast, setToast] = useState(''),
    [search, setSearch] = useState('');
  const [fitKey, setFitKey] = useState(0),
    [grid, setGrid] = useState(true),
    [outline, setOutline] = useState(true),
    [showEdges, setShowEdges] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const signingOut = useRef(false);
  const unsavedHosted = hosted && canUndo && library.dirty(doc);
  useEffect(() => {
    if (!unsavedHosted) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!signingOut.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedHosted]);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null),
    firstLayout = useRef(true),
    exportBusy = useRef(false);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let stale = false;
    setBusy(true);
    setLayoutError('');
    layoutDiagram(doc)
      .then((result) => {
        if (stale) return;
        setScene(result);
        setBusy(false);
        if (firstLayout.current) {
          setFitKey((k) => k + 1);
          firstLayout.current = false;
        }
      })
      .catch((error) => {
        if (stale) return;
        setLayoutError(error.message);
        setBusy(false);
      });
    return () => {
      stale = true;
    };
  }, [doc]);
  const patch = useCallback(
    (p: Patch) => {
      try {
        commit(patchDocument(doc, p));
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not apply change.');
        return false;
      }
    },
    [doc, commit, notify],
  );
  const select = useCallback((id: string | null) => {
    setSelected(id ? [id] : []);
    setInspectorTab('design');
  }, []);
  const selectIds = useCallback((ids: string[]) => setSelected(ids), []);
  const choose = useCallback((id: string, extend: boolean) => {
    setInspectorTab('design');
    setSelected((current) => {
      if (!extend) return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }, []);
  const pinPositions = useCallback(
    (moves: { id: string; position: { x: number; y: number } }[]) => {
      if (!moves.length) return;
      patch({
        overrides: Object.fromEntries(moves.map((move) => [move.id, { position: move.position }])),
      });
    },
    [patch],
  );
  const downloadNative = useCallback(() => {
    download(`${slug(docRef.current.title)}.forma.json`, serializeDocument(docRef.current));
    notify('Diagram saved as a native Forma document.');
    setMenu('');
  }, [doc, notify]);
  const save = useCallback(() => {
    if (!library.active) {
      setModal('library');
      return;
    }
    void library
      .save(docRef.current)
      .then(() => notify('Saved to library.'))
      .catch((error) => notify(error instanceof Error ? error.message : 'Could not save.'));
    setMenu('');
  }, [library.save, library.active, notify]);
  const remove = useCallback(
    (ids: string[]) => {
      patch({
        remove: {
          nodes: ids.filter((id) => doc.nodes.some((n) => n.id === id)),
          edges: ids.filter((id) => doc.edges.some((e) => e.id === id)),
          groups: ids.filter((id) => doc.groups.some((g) => g.id === id)),
        },
      });
      setSelected([]);
    },
    [doc, patch],
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (event.target instanceof HTMLElement) event.target.blur();
        requestAnimationFrame(save);
      }
      if (!editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (
        !editing &&
        !modal &&
        selected.length &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        event.preventDefault();
        remove(selected);
      }
      if (!editing && !modal && scene && selected.length) {
        const step = event.shiftKey ? 8 : 1;
        const delta =
          event.key === 'ArrowLeft'
            ? { x: -step, y: 0 }
            : event.key === 'ArrowRight'
              ? { x: step, y: 0 }
              : event.key === 'ArrowUp'
                ? { x: 0, y: -step }
                : event.key === 'ArrowDown'
                  ? { x: 0, y: step }
                  : null;
        if (delta) {
          event.preventDefault();
          pinPositions(nudgeNodes(scene.nodes, selected, delta));
        }
      }
      if (event.key === 'Escape') {
        setModal('');
        setMenu('');
        setSelected([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save, undo, redo, selected, remove, modal, scene, pinPositions]);
  const uniqueId = (prefix: string) => {
    const ids = new Set([...doc.nodes, ...doc.edges, ...doc.groups].map((n) => n.id));
    let count = 1;
    while (ids.has(`${prefix}-${count}`)) count++;
    return `${prefix}-${count}`;
  };
  const addNode = (kind: DiagramNode['kind']) => {
    const id = uniqueId(kind);
    patch({
      nodes: [
        {
          id,
          label: `New ${kind}`,
          kind,
          ...(doc.groups.some((g) => g.id === selected[0]) ? { group: selected[0] } : {}),
        },
      ],
    });
    select(id);
    setMenu('');
  };
  const addGroup = () => {
    const id = uniqueId('group');
    patch({ groups: [{ id, label: 'New group', color: 'slate' }] });
    select(id);
    setMenu('');
  };
  const connect = (connection: Connection) => {
    if (connection.source && connection.target) {
      const id = uniqueId('edge');
      const read = (handle?: string | null) => {
        const [side, index] = handle?.split(':') ?? [];
        if (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left') return {};
        return { side, index: Number(index) };
      };
      const source = read(connection.sourceHandle),
        target = read(connection.targetHandle);
      const appearance: Record<string, string | number> = {};
      if (source.side) appearance.sourcePort = source.side;
      if (target.side) appearance.targetPort = target.side;
      const count = (nodeId: string | null, side?: string) =>
        (side &&
          doc.nodes.find((n) => n.id === nodeId)?.ports?.[
            side as 'top' | 'right' | 'bottom' | 'left'
          ]) ||
        1;
      if (source.side && count(connection.source, source.side) > 1)
        appearance.sourceIndex = source.index ?? 0;
      if (target.side && count(connection.target, target.side) > 1)
        appearance.targetIndex = target.index ?? 0;
      patch({
        edges: [
          {
            id,
            source: connection.source,
            target: connection.target,
            ...(Object.keys(appearance).length ? { appearance } : {}),
          },
        ],
      });
      select(id);
    }
  };
  const setPath = useCallback(
    (id: string, path: { x: number; y: number }[] | null) => {
      patch({ edges: [{ id, path }] });
    },
    [patch],
  );
  const exportDiagram = async (format: 'svg' | 'png') => {
    if (exportBusy.current || busy || !scene) return;
    exportBusy.current = true;
    setMenu('');
    notify(`Preparing ${format.toUpperCase()}…`);
    try {
      const svg = renderSvg(scene, {
        fontDataUri: await localFont(),
        boldFontDataUri: await localFont(true),
      });
      download(
        `${slug(doc.title)}.${format}`,
        format === 'svg' ? svg : await pngFromSvg(svg, scene.bounds.width, scene.bounds.height),
        `image/${format === 'svg' ? 'svg+xml' : 'png'}`,
      );
      notify(`${format.toUpperCase()} exported. Ready to share.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export failed');
    } finally {
      exportBusy.current = false;
    }
  };
  const recompose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await layoutDiagram(doc);
      setScene(result);
      setFitKey((k) => k + 1);
      notify(
        Object.values(doc.presentation.nodes).some((n) => n.position)
          ? 'Layout refreshed. Human positions preserved.'
          : 'Layout composed with balanced spacing and routing.',
      );
    } catch (error) {
      notify(String(error));
    } finally {
      setBusy(false);
    }
  };
  const quality = scene ? inspectScene(scene) : null;
  const matches = (label: string) => label.toLowerCase().includes(search.toLowerCase());
  const renderNode = (n: DiagramNode, indented = false) => {
    const Icon = kindIcons[n.kind as keyof typeof kindIcons] ?? kindIcons.service;
    return (
      <button
        key={n.id}
        className={`outline-node ${selected.includes(n.id) ? 'selected' : ''} ${indented ? 'indented' : ''}`}
        onClick={(event) => choose(n.id, event.shiftKey)}
      >
        <Icon size={14} />
        <span>{n.label}</span>
        {doc.presentation.nodes[n.id]?.position && <Pin size={11} />}
      </button>
    );
  };
  const renderGroups = (parent?: string, depth = 0): React.ReactNode =>
    doc.groups
      .filter((g) => g.parent === parent)
      .map((g) => (
        <div className="outline-group" style={{ marginLeft: depth ? 10 : 0 }} key={g.id}>
          <div className={`group-row ${selected.includes(g.id) ? 'selected' : ''}`}>
            <button
              aria-label={`Toggle ${g.label}`}
              onClick={() =>
                setCollapsed((c) => {
                  const next = new Set(c);
                  next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                  return next;
                })
              }
            >
              {collapsed.has(g.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            <button onClick={(event) => choose(g.id, event.shiftKey)}>
              <span className={`group-dot ${g.color}`} />
              <span>{g.label}</span>
              <small>{doc.nodes.filter((n) => n.group === g.id).length}</small>
            </button>
          </div>
          {(!collapsed.has(g.id) || search) && (
            <>
              {doc.nodes
                .filter((n) => n.group === g.id && matches(n.label))
                .map((n) => renderNode(n, true))}
              {renderGroups(g.id, depth + 1)}
            </>
          )}
        </div>
      ));
  return (
    <div
      className={`app ${outline ? '' : 'outline-hidden'} ${mobileInspector ? 'inspector-visible' : ''}`}
    >
      <header className="topbar" inert={!!modal}>
        <button
          className="brand"
          onClick={() => {
            select(null);
            setFitKey((k) => k + 1);
          }}
          aria-label="Forma home"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          forma<span className="brand-beta">BETA</span>
        </button>
        <div className="document-breadcrumb">
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>{doc.title}</strong>
          <span className="local-badge">{hosted ? 'Hosted' : 'Local'}</span>
        </div>
        <div className="top-actions">
          {account && (
            <button className="secondary" onClick={() => setModal('access')}>
              Agent access
            </button>
          )}
          {account && (
            <button
              className="secondary account-button"
              title={account.email}
              onClick={() => setModal('signout')}
            >
              Sign out
            </button>
          )}

          <button className="secondary" onClick={() => setModal('library')}>
            Library
          </button>
          <button className="secondary" onClick={save}>
            Save
          </button>
          <span className={`saved-status ${!saved ? 'unsaved' : ''}`}>
            <span />
            {!saved
              ? 'Recovery unavailable'
              : library.active
                ? library.dirty(doc)
                  ? 'Unsaved changes'
                  : 'Saved to library'
                : hosted
                  ? 'Unsaved draft'
                  : 'Browser draft'}
          </span>
          <button
            className="secondary"
            onClick={() => {
              setModal('agent');
              setMenu('');
            }}
          >
            <Terminal size={14} />
            Agent guide
          </button>
          <div className="dropdown-anchor">
            <button className="primary" onClick={() => setMenu(menu === 'export' ? '' : 'export')}>
              <Download size={15} />
              Export
              <ChevronDown size={13} />
            </button>
            {menu === 'export' && (
              <div className="dropdown export-menu">
                <div className="dropdown-title">Take your diagram anywhere</div>
                <button onClick={downloadNative}>
                  <FileJson size={16} />
                  <span>
                    Forma document<small>Editable JSON · preserves your changes</small>
                  </span>
                </button>
                <button disabled={busy} onClick={() => exportDiagram('svg')}>
                  <Blocks size={16} />
                  <span>
                    SVG vector<small>Sharp at every size · embedded font</small>
                  </span>
                </button>
                <button disabled={busy} onClick={() => exportDiagram('png')}>
                  <Monitor size={16} />
                  <span>
                    PNG image<small>High resolution · ready to share</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace" inert={!!modal}>
        {outline && (
          <aside className="sidebar">
            <div className="sidebar-title">
              <span>DOCUMENT</span>
              <button aria-label="Hide outline" onClick={() => setOutline(false)}>
                <PanelLeftClose size={14} />
              </button>
            </div>
            <button className="current-document" onClick={() => select(null)}>
              <span className="document-icon">
                <Network size={20} />
              </span>
              <span>
                <strong>
                  {doc.type === 'architecture'
                    ? 'System architecture'
                    : doc.type === 'flow'
                      ? 'Process flow'
                      : 'Diagram'}
                </strong>
                <small>Forma document</small>
              </span>
            </button>
            <div className="sidebar-actions">
              <button onClick={() => fileInput.current?.click()}>
                <FolderOpen size={14} />
                Open
              </button>
              <button onClick={() => setModal('templates')}>
                <Plus size={14} />
                New
              </button>
            </div>
            <div className="sidebar-rule" />
            <div className="outline-heading">
              <span>
                <Layers size={14} />
                Outline
              </span>
              <span>{doc.nodes.length}</span>
            </div>
            <label className="search-field">
              <Search size={13} />
              <input
                aria-label="Search components"
                placeholder="Find a component…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch('')}>
                  <X size={12} />
                </button>
              )}
            </label>
            <div className="outline-list">
              {renderGroups()}
              {doc.nodes.filter((n) => !n.group && matches(n.label)).map((n) => renderNode(n))}
              {!doc.nodes.length && (
                <p className="empty-outline">Your next idea starts with a component.</p>
              )}
              <button className="connections-heading" onClick={() => setShowEdges(!showEdges)}>
                {showEdges ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Connections
                <span>{doc.edges.length}</span>
              </button>
              {showEdges &&
                doc.edges
                  .filter((e) => matches(e.label || e.id))
                  .map((e) => (
                    <button
                      className={`outline-node connection-row ${selected.includes(e.id) ? 'selected' : ''}`}
                      key={e.id}
                      onClick={(event) => choose(e.id, event.shiftKey)}
                    >
                      <GitBranch size={13} />
                      <span>
                        {e.label ||
                          `${doc.nodes.find((n) => n.id === e.source)?.label} → ${doc.nodes.find((n) => n.id === e.target)?.label}`}
                      </span>
                    </button>
                  ))}
            </div>
            <div className="sidebar-bottom">
              <button className="template-link" onClick={() => setModal('templates')}>
                <Blocks size={16} />
                <span>Start from a template</span>
                <ArrowUpRight size={14} />
              </button>
              <button onClick={() => setModal('source')}>
                <FileJson size={15} />
                View document source<span>⌘</span>
              </button>
              <div className="local-first">
                <span className="tiny-dot" />
                Local-first. Yours to keep.
              </div>
            </div>
          </aside>
        )}
        <main className="main">
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="dropdown-anchor compact-document-menu">
                <button
                  className="icon-button"
                  aria-label="Document actions"
                  onClick={() => setMenu(menu === 'document' ? '' : 'document')}
                >
                  <FolderOpen size={16} />
                </button>
                {menu === 'document' && (
                  <div className="dropdown add-menu">
                    <button
                      onClick={() => {
                        setMenu('');
                        fileInput.current?.click();
                      }}
                    >
                      <FolderOpen size={15} />
                      Open document
                    </button>
                    <button
                      onClick={() => {
                        setMenu('');
                        setModal('templates');
                      }}
                    >
                      <Plus size={15} />
                      New diagram
                    </button>
                    <button
                      onClick={() => {
                        setMenu('');
                        setModal('source');
                      }}
                    >
                      <FileJson size={15} />
                      View source
                    </button>
                  </div>
                )}
              </div>
              {!outline && (
                <button
                  className="icon-button"
                  aria-label="Show outline"
                  onClick={() => setOutline(true)}
                >
                  <Layers size={16} />
                </button>
              )}
              <div className="dropdown-anchor">
                <button className="add-button" onClick={() => setMenu(menu === 'add' ? '' : 'add')}>
                  <Plus size={15} />
                  Add component
                  <ChevronDown size={12} />
                </button>
                {menu === 'add' && (
                  <div className="dropdown add-menu">
                    {Object.entries(kindIcons).map(([kind, Icon]) => (
                      <button key={kind} onClick={() => addNode(kind as DiagramNode['kind'])}>
                        <Icon size={15} />
                        {kind[0].toUpperCase() + kind.slice(1)}
                      </button>
                    ))}
                    <div className="dropdown-divider" />
                    <button onClick={addGroup}>
                      <FolderPlus size={15} />
                      Group
                    </button>
                  </div>
                )}
              </div>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                title="Undo (⌘Z)"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="icon-button"
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 size={16} />
              </button>
            </div>
            <div className="toolbar-right">
              <button
                className="icon-button mobile-inspector-toggle"
                aria-label="Toggle properties"
                onClick={() => setMobileInspector((v) => !v)}
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                className={`icon-button ${grid ? 'active-subtle' : ''}`}
                aria-label="Toggle grid"
                title="Toggle grid"
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={15} />
              </button>
              <span className="toolbar-divider" />
              <button className="layout-button" onClick={recompose} disabled={busy}>
                <WandSparkles size={15} />
                {busy ? 'Composing…' : 'Auto layout'}
              </button>
            </div>
          </div>
          {scene ? (
            <Canvas
              scene={scene}
              selected={selected}
              onSelect={selectIds}
              onMove={(positions) =>
                pinPositions(positions.map(({ id, x, y }) => ({ id, position: { x, y } })))
              }
              onAlign={(edge: AlignEdge) =>
                pinPositions(
                  alignNodes(
                    scene.nodes,
                    selected.filter((id) => scene.nodes.some((n) => n.id === id)),
                    edge,
                  ),
                )
              }
              onDistribute={(axis: DistributeAxis) =>
                pinPositions(
                  distributeNodes(
                    scene.nodes,
                    selected.filter((id) => scene.nodes.some((n) => n.id === id)),
                    axis,
                  ),
                )
              }
              onConnect={connect}
              onDelete={remove}
              onPath={setPath}
              fitKey={fitKey}
              grid={grid}
              onAdd={() => setMenu('add')}
            />
          ) : (
            <div className="loading-canvas">
              <div className="loader" />
              <p>Composing your diagram…</p>
            </div>
          )}
          {layoutError && (
            <div className="layout-error" role="alert">
              <AlertCircle size={17} />
              {layoutError}
              <button onClick={() => setModal('source')}>Edit document</button>
            </div>
          )}
          <footer className="statusbar">
            <span>
              <span className="tiny-dot" />
              {doc.nodes.length} components<span className="status-separator">·</span>
              {doc.edges.length} connections<span className="status-separator">·</span>
              {doc.groups.length} groups
            </span>
            <button
              onClick={() => {
                setInspectorTab('inspect');
                setMobileInspector(true);
              }}
            >
              {quality?.issues.length ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}{' '}
              {busy
                ? 'Checking layout'
                : quality?.issues.length
                  ? `${quality.issues.length} layout suggestions`
                  : 'All checks passed'}
            </button>
          </footer>
        </main>
        <Inspector
          doc={doc}
          scene={scene}
          selected={selected}
          patch={patch}
          onDelete={remove}
          onSelect={selectIds}
          onAlign={(edge: AlignEdge) =>
            scene &&
            pinPositions(
              alignNodes(
                scene.nodes,
                selected.filter((id) => scene.nodes.some((n) => n.id === id)),
                edge,
              ),
            )
          }
          onDistribute={(axis: DistributeAxis) =>
            scene &&
            pinPositions(
              distributeNodes(
                scene.nodes,
                selected.filter((id) => scene.nodes.some((n) => n.id === id)),
                axis,
              ),
            )
          }
          tab={inspectorTab}
          setTab={setInspectorTab}
          onDesignSystems={() => setModal('systems')}
        />
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.forma.json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (file.size > 5_000_000) throw new Error('Choose a document smaller than 5 MB.');
            library.detach();
            commit(parseDocument(JSON.parse(await file.text())));
            select(null);
            firstLayout.current = true;
            notify(`Opened ${file.name}`);
          } catch (error) {
            notify(error instanceof Error ? error.message : 'Could not open document');
          }
        }}
      />
      {modal && (
        <Dialogs
          key={modal}
          modal={modal}
          close={() => setModal('')}
          doc={doc}
          commit={(newDoc) => {
            if (modal === 'templates') library.detach();
            commit(newDoc);
            select(null);
            firstLayout.current = true;
          }}
          notify={notify}
        >
          {modal === 'library' ? (
            <LibraryDialog
              library={library}
              doc={doc}
              onClose={() => setModal('')}
              onOpen={(newDoc) => {
                replace(newDoc);
                select(null);
                firstLayout.current = true;
              }}
            />
          ) : modal === 'systems' ? (
            <DesignSystems
              doc={doc}
              apply={(newDoc) => {
                commit(newDoc);
                notify('Design saved and applied. Element overrides preserved.');
                setModal('');
              }}
            />
          ) : modal === 'access' ? (
            <AgentAccess />
          ) : modal === 'signout' ? (
            <>
              <h2 id="modal-title">Sign out of Forma?</h2>
              <p>{account?.email}</p>
              <p>
                Save or export unsaved diagrams in all open tabs first. Hosted drafts are not kept
                in this browser after sign-out.
              </p>
              <div className="modal-actions">
                <button className="secondary" onClick={() => setModal('')}>
                  Keep editing
                </button>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1' },
                        body: '{}',
                      });
                      if (!response.ok && response.status !== 401)
                        throw new Error('Could not sign out. Try again.');
                      signingOut.current = true;
                      const channel = new BroadcastChannel('forma-auth');
                      channel.postMessage('signed-out');
                      channel.close();
                      location.reload();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Sign out now
                </button>
              </div>
            </>
          ) : undefined}
        </Dialogs>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={13} />
          </button>
        </div>
      )}
      {menu && (
        <button className="menu-dismiss" aria-label="Dismiss menu" onClick={() => setMenu('')} />
      )}
    </div>
  );
}
