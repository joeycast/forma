import { AgentAccess } from './AgentAccess';
import { hosted } from './hosting';
import type { Account } from './AuthGate';
import { useLibrary, LibraryDialog } from './library';
import { listUnnamedDraftSnapshots } from './drafts';
import { DesignSystems } from './DesignSystems';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Shapes,
} from 'lucide-react';
import { type Connection } from '@xyflow/react';
import {
  parseDocument,
  fingerprint,
  patchDocument,
  renderSvg,
  serializeDocument,
  alignNodes,
  distributeNodes,
  nudgeNodes,
  type AlignEdge,
  type DistributeAxis,
  type Patch,
  type Scene,
  type Diagram,
  type DiagramNode,
} from '../../../packages/core/src';
import { LayoutClient } from '../../../packages/core/src/layout-client';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { Dialogs } from './Dialogs';
import { ShapePalette, type PaletteShape } from './ShapePalette';
import {
  copySelection,
  groupSelection,
  pasteSelection,
  ungroupSelection,
  type ClipboardSelection,
} from './authoring-commands';
import { download, localFont, pngFromSvg, slug, useDocument } from './storage';
import { clearDraftScope, libraryDraftIdentity } from './drafts';
const kindIcons = {
  service: Server,
  database: Database,
  queue: ListOrdered,
  client: Monitor,
  person: UserRound,
  process: Zap,
  decision: GitBranch,
};
const idFactoryFor = (doc: Diagram) => {
  const used = new Set([...doc.nodes, ...doc.edges, ...doc.groups].map((item) => item.id));
  return (prefix: string) => {
    let id = `${prefix}-1`,
      index = 1;
    while (used.has(id)) id = `${prefix}-${++index}`;
    used.add(id);
    return id;
  };
};
export function App(props: { account?: Account; onValidDocument?: (doc: Diagram) => void }) {
  return <Editor key={hosted ? (props.account?.ownerHash ?? 'signed-out') : 'local'} {...props} />;
}

function Editor({
  account,
  onValidDocument,
}: {
  account?: Account;
  onValidDocument?: (doc: Diagram) => void;
}) {
  const library = useLibrary();
  const initialLibraryPath = useRef(library.active?.path ?? null);
  const restoredInitialFile = useRef(false);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const draftScope = hosted ? `account:${account?.ownerHash ?? 'signed-out'}` : 'local';
  const {
    doc,
    draftIdentity,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    saved,
    activate,
    newDraft,
    openDraftCopy,
    recovery,
    recover,
    keepOriginal,
    setDraftLocation,
    otherTabUpdate,
    clearOtherTabUpdate,
    suspendDrafts,
  } = useDocument(draftScope);
  useEffect(() => {
    onValidDocument?.(doc);
  }, [doc, onValidDocument]);
  useEffect(() => {
    if (library.active)
      setDraftLocation(
        libraryDraftIdentity(library.active.workspace, library.active.path),
        library.active.revision,
      );
  }, [library.active?.path, library.active?.revision, library.active?.workspace, setDraftLocation]);
  useEffect(() => {
    if (
      !initialLibraryPath.current ||
      restoredInitialFile.current ||
      library.active?.path !== initialLibraryPath.current ||
      !library.info
    )
      return;
    restoredInitialFile.current = true;
    void library
      .readDocument(initialLibraryPath.current)
      .then(({ doc: savedDoc, file }) => {
        activate(savedDoc, libraryDraftIdentity(file.workspace, file.path), file.revision);
      })
      .catch(() => library.detach());
  }, [
    library.active?.path,
    library.active?.revision,
    library.info,
    library.readDocument,
    library.detach,
    activate,
  ]);
  const [scene, setScene] = useState<Scene | null>(null),
    [busy, setBusy] = useState(true),
    [layoutError, setLayoutError] = useState('');
  const currentFingerprint = useMemo(() => fingerprint(doc), [doc]);
  const [selected, setSelected] = useState<string[]>([]),
    [inspectorTab, setInspectorTab] = useState('design');
  const [modal, setModal] = useState(hosted ? 'library' : ''),
    [menu, setMenu] = useState(''),
    [toast, setToast] = useState(''),
    [search, setSearch] = useState('');
  useEffect(() => {
    if (recovery) setModal('recovery');
    else if (modal === 'recovery') setModal('');
  }, [recovery]);
  const [fitKey, setFitKey] = useState(0),
    [grid, setGrid] = useState(true),
    [outline, setOutline] = useState(true),
    [showEdges, setShowEdges] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [viewportCenter, setViewportCenter] = useState<{ x: number; y: number } | null>(null);
  const clipboard = useRef<ClipboardSelection | null>(null);
  const layoutClient = useRef<LayoutClient | null>(null);
  layoutClient.current ??= new LayoutClient();
  useEffect(() => () => layoutClient.current?.dispose(), []);
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
    exportBusy = useRef(false),
    layoutRequest = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!otherTabUpdate) return;
    notify('Another tab updated this draft. Both tab snapshots are kept separately.');
    clearOtherTabUpdate();
  }, [otherTabUpdate, clearOtherTabUpdate, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let stale = false;
    const request = ++layoutRequest.current;
    setBusy(true);
    setLayoutError('');
    layoutClient
      .current!.layout(doc)
      .then((result) => {
        if (stale || request !== layoutRequest.current) return;
        setScene(result);
        setBusy(false);
        if (firstLayout.current) {
          setFitKey((k) => k + 1);
          firstLayout.current = false;
        }
      })
      .catch((error) => {
        if (stale || request !== layoutRequest.current) return;
        setLayoutError(error.message);
        setBusy(false);
      });
    return () => {
      stale = true;
      if (layoutRequest.current === request) layoutClient.current?.cancel();
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
  const choose = useCallback(
    (id: string, extend: boolean) => {
      setInspectorTab('design');
      if (doc.edges.some((edge) => edge.id === id)) setMobileInspector(true);
      setSelected((current) => {
        if (!extend) return [id];
        return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      });
    },
    [doc.edges],
  );
  const resizeNode = useCallback(
    (id: string, size: { width: number; height: number; x: number; y: number }) => {
      const clamp = (value: number, min: number, max: number) =>
        Math.round(Math.min(max, Math.max(min, value)));
      patch({
        overrides: {
          [id]: {
            style: { width: clamp(size.width, 80, 1200), height: clamp(size.height, 40, 1600) },
            position: { x: Math.round(size.x), y: Math.round(size.y) },
          },
        },
      });
    },
    [patch],
  );
  const editEdge = useCallback((id: string) => {
    setInspectorTab('design');
    setMobileInspector(true);
    setSelected([id]);
  }, []);
  const retargetEdge = useCallback(
    (id: string, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const read = (handle?: string | null) => {
        const [side, raw] = handle?.split(':') ?? [];
        if (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left') return null;
        return { side: side as 'top' | 'right' | 'bottom' | 'left', index: Number(raw) };
      };
      const source = read(connection.sourceHandle),
        target = read(connection.targetHandle);
      const count = (nodeId: string, side: 'top' | 'right' | 'bottom' | 'left') =>
        doc.nodes.find((node) => node.id === nodeId)?.ports?.[side] ?? 1;
      const appearance: Record<string, string | number | null> = {};
      if (source) {
        appearance.sourcePort = source.side;
        appearance.sourceIndex = count(connection.source, source.side) > 1 ? source.index : null;
      }
      if (target) {
        appearance.targetPort = target.side;
        appearance.targetIndex = count(connection.target, target.side) > 1 ? target.index : null;
      }
      patch({
        edges: [{ id, source: connection.source, target: connection.target, appearance }],
      });
      editEdge(id);
    },
    [doc.nodes, editEdge, patch],
  );
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
  const insertShape = (option: PaletteShape) => {
    const { shape } = option;
    const id = uniqueId('shape');
    const group = doc.groups.some((item) => item.id === selected[0]) ? selected[0] : undefined;
    const center = viewportCenter
      ? { x: Math.round(viewportCenter.x - 72), y: Math.round(viewportCenter.y - 40) }
      : { x: 0, y: 0 };
    const label = `New ${option.label.toLowerCase()}`;
    patch({
      nodes: [{ id, kind: 'shape', label, ...(group ? { group } : {}) }],
      overrides: {
        [id]: {
          position: center,
          variant: 'shape',
          style: { shape, ...(option.aspectRatio ? { aspectRatio: option.aspectRatio } : {}) },
        },
      },
    });
    select(id);
    setMenu('');
  };
  const pastePayload = (payload: ClipboardSelection) => {
    try {
      const result = pasteSelection(doc, payload, idFactoryFor(doc), { x: 32, y: 32 });
      if (!result.ids.length) {
        notify('Copy a node or group to paste it with its connections.');
        return;
      }
      commit(result.doc);
      setSelected(result.ids.filter((id) => result.doc.nodes.some((node) => node.id === id)));
    } catch (error) {
      notify(
        error instanceof Error
          ? `Could not paste: ${error.message}`
          : 'Could not paste this selection.',
      );
    }
  };
  const duplicate = (ids: string[]) => {
    if (!ids.length) return;
    const positions = Object.fromEntries(
      (scene?.nodes ?? []).map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    const payload = copySelection(doc, ids, positions);
    pastePayload(payload);
  };
  const groupSelected = () => {
    const result = groupSelection(doc, selected, idFactoryFor(doc));
    if (result.groupId) {
      commit(result.doc);
      setSelected([result.groupId]);
      setMenu('');
    }
  };
  const ungroupSelected = () => {
    const next = ungroupSelection(doc, selected);
    if (next !== doc) {
      commit(next);
      setSelected([]);
    }
  };
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
      if (
        !editing &&
        !modal &&
        selected.length &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'd'
      ) {
        event.preventDefault();
        duplicate(selected);
      }
      if (
        !editing &&
        !modal &&
        selected.length &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'c'
      ) {
        event.preventDefault();
        if (
          !selected.some(
            (id) =>
              doc.nodes.some((node) => node.id === id) ||
              doc.groups.some((group) => group.id === id),
          )
        ) {
          clipboard.current = null;
          notify('Copy a node or group to include its connected relationships.');
          return;
        }
        const positions = Object.fromEntries(
          (scene?.nodes ?? []).map((node) => [node.id, { x: node.x, y: node.y }]),
        );
        clipboard.current = copySelection(doc, selected, positions);
      }
      if (
        !editing &&
        !modal &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'v' &&
        clipboard.current
      ) {
        event.preventDefault();
        pastePayload(clipboard.current);
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
  }, [
    save,
    undo,
    redo,
    selected,
    remove,
    modal,
    scene,
    pinPositions,
    doc,
    commit,
    duplicate,
    pastePayload,
    notify,
  ]);
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
    if (exportBusy.current) return;
    if (busy) {
      notify('Wait for layout to finish before exporting an image.');
      return;
    }
    if (!scene) {
      notify('There is no completed layout to export yet.');
      return;
    }
    if (scene.fingerprint !== currentFingerprint) {
      setMenu('');
      notify('This is the last successful preview. Refreshing layout before image export.');
      void recompose();
      return;
    }
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
    const request = ++layoutRequest.current;
    setBusy(true);
    setLayoutError('');
    try {
      const result = await layoutClient.current!.layout(doc);
      if (request !== layoutRequest.current) return;
      setScene(result);
      setLayoutError('');
      setFitKey((k) => k + 1);
      notify(
        Object.values(doc.presentation.nodes).some((n) => n.position)
          ? 'Layout refreshed. Human positions preserved.'
          : 'Layout composed with balanced spacing and routing.',
      );
    } catch (error) {
      if (request !== layoutRequest.current) return;
      setLayoutError(error instanceof Error ? error.message : String(error));
      notify(String(error));
    } finally {
      if (request === layoutRequest.current) setBusy(false);
    }
  };
  const quality =
    scene && layoutClient.current?.lastGoodInspectionFingerprint === scene.fingerprint
      ? (layoutClient.current.lastGoodInspection ?? null)
      : null;
  const staleScene = !!scene && scene.fingerprint !== currentFingerprint;
  const inspectionState = layoutError
    ? 'failed'
    : staleScene && quality
      ? 'stale'
      : busy
        ? 'pending'
        : staleScene
          ? 'stale'
          : quality
            ? 'ready'
            : 'unavailable';
  const qualityStatus = busy
    ? 'Checking layout'
    : layoutError
      ? 'Latest layout failed'
      : staleScene
        ? 'Previous preview checks'
        : !quality
          ? 'Checks unavailable'
          : quality.issues.length
            ? `${quality.issues.length} layout suggestions`
            : 'All checks passed';
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
                  <div className="dropdown add-menu authoring-menu">
                    <ShapePalette
                      onInsert={insertShape}
                      onGroup={() =>
                        selected.some((id) => doc.nodes.some((node) => node.id === id)) ||
                        selected.some((id) => doc.groups.some((group) => group.id === id))
                          ? groupSelected()
                          : addGroup()
                      }
                    />
                    <div className="dropdown-divider" />
                    <div className="dropdown-title">Semantic components</div>
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
              {selected.filter((id) => doc.nodes.some((node) => node.id === id)).length > 1 && (
                <button className="secondary authoring-action" onClick={groupSelected}>
                  <FolderPlus size={14} /> Group selection
                </button>
              )}
              {selected.some((id) => doc.groups.some((group) => group.id === id)) && (
                <button className="secondary authoring-action" onClick={ungroupSelected}>
                  Ungroup
                </button>
              )}
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
                {busy ? 'Composing…' : 'Refresh layout'}
              </button>
              {selected.some((id) => doc.presentation.nodes[id]?.position) && (
                <button
                  className="secondary authoring-action"
                  onClick={() =>
                    patch({
                      overrides: Object.fromEntries(
                        selected
                          .filter((id) => doc.presentation.nodes[id]?.position)
                          .map((id) => [id, { position: null }]),
                      ),
                    })
                  }
                >
                  Release selected pins
                </button>
              )}
              {selected.some((id) => doc.edges.some((edge) => edge.id === id && edge.path)) && (
                <button
                  className="secondary authoring-action"
                  onClick={() =>
                    patch({
                      edges: selected.flatMap((id) =>
                        doc.edges.some((edge) => edge.id === id && edge.path)
                          ? [{ id, path: null }]
                          : [],
                      ),
                    })
                  }
                >
                  Reset selected routes
                </button>
              )}
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
              onReconnect={retargetEdge}
              onDelete={remove}
              onPath={setPath}
              onResize={resizeNode}
              onEditEdge={editEdge}
              onViewportCenter={setViewportCenter}
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
          {scene && !doc.nodes.length && (
            <div className="canvas-onboarding">
              <span className="canvas-onboarding-mark">
                <Shapes size={23} />
              </span>
              <h2>A blank canvas, ready for your ideas.</h2>
              <p>Add a shape, then connect and label your diagram as it takes form.</p>
              <button className="primary" onClick={() => setMenu('add')}>
                <Plus size={15} /> Choose a shape
              </button>
              <button className="secondary" onClick={() => setModal('templates')}>
                Browse templates
              </button>
            </div>
          )}
          {layoutError && (
            <div className="layout-error" role="alert">
              <AlertCircle size={17} />
              {staleScene && <strong>Showing the last successful preview. </strong>}
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
              {qualityStatus === 'All checks passed' ? (
                <CheckCircle2 size={13} />
              ) : (
                <AlertCircle size={13} />
              )}{' '}
              {qualityStatus}
            </button>
          </footer>
        </main>
        <Inspector
          doc={doc}
          scene={scene}
          inspection={quality}
          inspectionState={inspectionState}
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
          onDesignSystems={(event) => {
            dialogReturnFocus.current = event.currentTarget;
            setModal('systems');
          }}
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
            newDraft(parseDocument(JSON.parse(await file.text())));
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
            if (modal === 'templates') {
              library.detach();
              newDraft(newDoc);
            } else commit(newDoc);
            select(null);
            firstLayout.current = true;
          }}
          notify={notify}
          returnFocus={modal === 'systems' ? dialogReturnFocus.current : null}
        >
          {modal === 'library' ? (
            <LibraryDialog
              library={library}
              doc={doc}
              recoveryList={listUnnamedDraftSnapshots(draftScope, draftIdentity)}
              onClose={() => setModal('')}
              onOpenDraftCopy={(snapshot) => {
                library.detach();
                openDraftCopy(snapshot.doc);
                select(null);
                firstLayout.current = true;
                setModal('');
                notify(`Opened a copy of “${snapshot.title}”. The saved draft is preserved.`);
              }}
              onOpen={(newDoc, file) => {
                activate(newDoc, libraryDraftIdentity(file.workspace, file.path), file.revision);
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
                      suspendDrafts();
                      clearDraftScope(draftScope);
                      clipboard.current = null;
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
          ) : modal === 'recovery' && recovery ? (
            <>
              <h2 id="modal-title">Recover this draft?</h2>
              <p>
                {recovery.stale
                  ? 'This unsaved draft is based on an older library revision. Recover it to compare and save it as a copy; the current library version remains available.'
                  : 'A saved draft is available. The current library version remains available.'}
              </p>
              <div className="modal-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    keepOriginal();
                    setModal('');
                  }}
                >
                  Keep library version
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (recovery.stale) library.detach();
                    recover();
                    setModal('');
                  }}
                >
                  Recover draft
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
