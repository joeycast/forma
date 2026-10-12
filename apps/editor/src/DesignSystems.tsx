import { useEffect, useState } from 'react';
import {
  atelier,
  designSystemSchema,
  parseDocument,
  patchDocument,
  renderSvg,
  STYLE_CAPABILITIES,
  layoutDiagram,
  type DesignSystem,
  type ElementStyle,
  type Diagram,
} from '../../../packages/core/src';
import { download, slug } from './storage';
import { hosted } from './hosting';
import {
  deleteSystemRevision,
  duplicateSystem,
  normalizeRoleId,
  saveSystemRevision,
} from './design-system-library';
import './DesignSystems.css';
import { SHAPE_NAMES } from '../../../packages/core/src/shapes';
import { readStoredSnapshot, updateStoredSnapshot } from './indexeddb-storage';

function PaintInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft || undefined);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      placeholder="Unset"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function RoleNameField({
  name,
  onRename,
  onError,
}: {
  name: string;
  onRename: (next: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const next = normalizeRoleId(draft);
    if (next !== name) {
      if (!next) {
        setDraft(name);
        onError('Role names need at least one letter or number.');
      } else onRename(next);
    }
  };
  return (
    <label className="field">
      Role name
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

const KEY = 'forma.design-systems.v1';
function parseSavedSystems(value: unknown): DesignSystem[] {
  if (!Array.isArray(value))
    throw new Error(
      'Saved design-system library is not a list. Export or repair its JSON before saving.',
    );
  return value.map((item) => designSystemSchema.parse(item));
}

function loadLegacySystems(): DesignSystem[] {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  return parseSavedSystems(value);
}

async function updateLocalSystems(
  update: (systems: DesignSystem[]) => DesignSystem[],
): Promise<DesignSystem[]> {
  return updateStoredSnapshot<DesignSystem[], DesignSystem[]>(KEY, loadLegacySystems, (systems) => {
    const next = update(parseSavedSystems(systems));
    systems.splice(0, systems.length, ...next);
    return next;
  });
}

class SystemLibraryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function systemsApi(method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  const response = await fetch('/api/systems', {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1' },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new SystemLibraryError(
      value.error ?? 'The design-system library request failed.',
      response.status,
    );
  return value as {
    systems?: unknown[];
    system?: unknown;
    storageRevision?: string | null;
    ok?: boolean;
  };
}

async function fetchHostedSystems() {
  const value = await systemsApi('GET');
  return {
    systems: (value.systems ?? []).map((system) => designSystemSchema.parse(system)),
    storageRevision: value.storageRevision ?? null,
  };
}

const styleFields: {
  key: keyof ElementStyle;
  label: string;
  kind: 'color' | 'number' | 'text' | 'select';
  options?: string[];
}[] = [
  { key: 'fill', label: 'Fill', kind: 'color' },
  { key: 'stroke', label: 'Stroke', kind: 'color' },
  { key: 'text', label: 'Text', kind: 'color' },
  { key: 'secondary', label: 'Secondary text', kind: 'color' },
  { key: 'strokeWidth', label: 'Stroke width', kind: 'number' },
  { key: 'dash', label: 'Outline style', kind: 'select', options: ['solid', 'dashed', 'dotted'] },
  { key: 'radius', label: 'Corner radius', kind: 'number' },
  { key: 'opacity', label: 'Opacity', kind: 'number' },
  { key: 'fontFamily', label: 'Font family', kind: 'text' },
  { key: 'fontSize', label: 'Font size', kind: 'number' },
  { key: 'fontWeight', label: 'Font weight', kind: 'select', options: ['400', '600'] },
  { key: 'padding', label: 'Padding', kind: 'number' },
  { key: 'width', label: 'Width', kind: 'number' },
  { key: 'height', label: 'Height', kind: 'number' },
  { key: 'aspectRatio', label: 'Aspect ratio', kind: 'number' },
  {
    key: 'shape',
    label: 'Shape',
    kind: 'select',
    options: [...SHAPE_NAMES],
  },
  { key: 'align', label: 'Text alignment', kind: 'select', options: ['left', 'center', 'right'] },
  {
    key: 'verticalAlign',
    label: 'Vertical alignment',
    kind: 'select',
    options: ['top', 'middle', 'bottom'],
  },
  {
    key: 'arrowStart',
    label: 'Start marker',
    kind: 'select',
    options: ['none', 'open', 'filled', 'diamond', 'circle'],
  },
  {
    key: 'arrowEnd',
    label: 'End marker',
    kind: 'select',
    options: ['none', 'open', 'filled', 'diamond', 'circle'],
  },
  { key: 'routing', label: 'Routing', kind: 'select', options: ['orthogonal', 'straight'] },
  {
    key: 'sourcePort',
    label: 'Source port',
    kind: 'select',
    options: ['top', 'right', 'bottom', 'left'],
  },
  {
    key: 'targetPort',
    label: 'Target port',
    kind: 'select',
    options: ['top', 'right', 'bottom', 'left'],
  },
  { key: 'sourceIndex', label: 'Source port index', kind: 'number' },
  { key: 'targetIndex', label: 'Target port index', kind: 'number' },
];

const fieldsFor = (target: 'node' | 'edge' | 'group') =>
  styleFields.filter(({ key }) =>
    (STYLE_CAPABILITIES[key].appliesTo as readonly string[]).includes(target),
  );

function StyleEditor({
  title,
  value,
  onChange,
  fields = styleFields,
}: {
  title: string;
  value: ElementStyle;
  onChange: (style: ElementStyle) => void;
  fields?: typeof styleFields;
}) {
  return (
    <details className="style-fields" open>
      <summary>{title}</summary>
      <div className="design-style-grid">
        {fields.map(({ key, label, kind, options }) => {
          const current = value[key];
          if (kind === 'color')
            return (
              <label className="field" key={key}>
                {label}
                <span className="color-control">
                  <input
                    type="color"
                    aria-label={`${label} picker`}
                    value={
                      typeof current === 'string' && /^#[0-9a-f]{6}$/i.test(current)
                        ? current
                        : '#ffffff'
                    }
                    onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                  />
                  <PaintInput
                    label={label}
                    value={String(current ?? '')}
                    onCommit={(next) => onChange({ ...value, [key]: next })}
                  />
                </span>
              </label>
            );
          if (kind === 'select')
            return (
              <label className="field" key={key}>
                {label}
                <select
                  value={String(current ?? '')}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [key]:
                        e.target.value === ''
                          ? undefined
                          : key === 'fontWeight'
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                >
                  <option value="">Unset</option>
                  {options?.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            );
          return (
            <label className="field" key={key}>
              {label}
              <input
                type={kind === 'number' ? 'number' : 'text'}
                value={current == null ? '' : String(current)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [key]:
                      e.target.value === ''
                        ? undefined
                        : kind === 'number'
                          ? Number(e.target.value)
                          : e.target.value,
                  })
                }
              />
            </label>
          );
        })}
      </div>
    </details>
  );
}

export function DesignSystems({ doc, apply }: { doc: Diagram; apply: (doc: Diagram) => void }) {
  const [system, setSystem] = useState<DesignSystem>(() =>
    structuredClone(
      doc.presentation.designSystem ?? {
        ...atelier,
        id: 'my-design-system',
        name: 'My design system',
      },
    ),
  );
  const [json, setJson] = useState(() => JSON.stringify(system, null, 2));
  const [saved, setSaved] = useState<DesignSystem[]>([]),
    [advanced, setAdvanced] = useState(false),
    [message, setMessage] = useState('');
  const [storageProblem, setStorageProblem] = useState('');
  const [storageRevision, setStorageRevision] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [roleName, setRoleName] = useState('');
  useEffect(() => {
    let active = true;
    setLibraryLoading(true);
    const load = hosted
      ? fetchHostedSystems().then(({ systems, storageRevision: revision }) => {
          if (active) {
            setSaved(systems);
            setStorageRevision(revision);
          }
        })
      : readStoredSnapshot<DesignSystem[]>(KEY, loadLegacySystems).then((systems) => {
          if (active) setSaved(parseSavedSystems(systems));
        });
    load
      .catch((error) => {
        if (!active) return;
        const detail = (error as Error).message;
        if (!hosted)
          setStorageProblem(
            `Saved design systems could not be read from browser storage. Export or repair the legacy library before continuing. ${detail}`,
          );
        else setMessage(detail);
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (next: DesignSystem) => {
    setSystem(next);
    setJson(JSON.stringify(next, null, 2));
    setMessage('');
  };
  const validate = () => designSystemSchema.parse(advanced ? JSON.parse(json) : system);
  const roles = system.roles ?? {};
  const [previewSvg, setPreviewSvg] = useState('');
  const [previewPending, setPreviewPending] = useState(true);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    let current = true;
    let finished = false;
    setPreviewPending(true);
    setPreviewError('');
    let sample: Diagram;
    try {
      const role = Object.keys(system.roles ?? {}).find((name) =>
        /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(name),
      );
      sample = parseDocument({
        version: 2,
        title: system.name || 'Design system preview',
        description: 'A representative diagram using these defaults and roles.',
        type: 'diagram',
        nodes: [
          {
            id: 'preview_api',
            label: 'API service',
            description: 'Classic component',
            kind: 'service',
            emphasis: 'normal',
            placement: { column: 0, row: 0 },
            ...(role ? { role } : {}),
          },
          {
            id: 'preview_store',
            label: 'Data store',
            description: 'Shape and group appearance',
            kind: 'database',
            emphasis: 'normal',
            group: 'preview_group',
            placement: { column: 1, row: 1 },
            style: { shape: 'cylinder' },
          },
        ],
        edges: [
          {
            id: 'preview_connection',
            source: 'preview_api',
            target: 'preview_store',
            label: 'connects to',
            style: 'solid',
            ...(role ? { role } : {}),
          },
        ],
        groups: [
          {
            id: 'preview_group',
            label: 'Storage layer',
            description: 'Container preview',
            color: 'teal',
            ...(role ? { role } : {}),
          },
        ],
        layout: { mode: 'grid', direction: 'RIGHT', spacing: 'comfortable' },
        presentation: {
          theme: 'paper',
          designSystem: system,
          nodes: { preview_api: { variant: 'classic' }, preview_store: { variant: 'shape' } },
        },
      });
    } catch (error) {
      setPreviewPending(false);
      setPreviewError((error as Error).message);
      return () => {
        current = false;
      };
    }
    const timeout = setTimeout(() => {
      finished = true;
      if (current) {
        setPreviewPending(false);
        setPreviewError('Preview layout exceeded 5 seconds.');
      }
    }, 5000);
    layoutDiagram(sample)
      .then((scene) => {
        if (!current || finished) return;
        const svg = renderSvg(scene);
        finished = true;
        clearTimeout(timeout);
        setPreviewSvg(svg);
        setPreviewPending(false);
      })
      .catch((error) => {
        if (!current || finished) return;
        finished = true;
        clearTimeout(timeout);
        setPreviewPending(false);
        setPreviewError((error as Error).message);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [system]);
  const addRole = () => {
    const name = normalizeRoleId(roleName);
    if (!name || roles[name]) {
      setMessage('Enter a new role name. Use letters, numbers, underscores, or hyphens.');
      return;
    }
    update({ ...system, roles: { ...roles, [name]: {} } });
    setRoleName('');
  };
  const refreshAfterConflict = async () => {
    if (!hosted) return;
    const latest = await fetchHostedSystems();
    setSaved(latest.systems);
    setStorageRevision(latest.storageRevision);
  };
  const save = async () => {
    setLibraryBusy(true);
    try {
      const value = validate();
      let next: DesignSystem[];
      if (hosted) {
        const response = await systemsApi('POST', {
          system: value,
          expectedStorageRevision: storageRevision,
        });
        const savedSystem = designSystemSchema.parse(response.system ?? value);
        next = saveSystemRevision(saved, savedSystem);
        setStorageRevision(response.storageRevision ?? null);
      } else {
        next = await updateLocalSystems((systems) => saveSystemRevision(systems, value));
      }
      setSaved(next);
      setMessage(`Saved ${value.name} revision ${value.revision}.`);
    } catch (error) {
      if (error instanceof SystemLibraryError && error.status === 409) {
        await refreshAfterConflict().catch(() => undefined);
        setMessage(
          'The hosted design-system library changed elsewhere. Its latest revisions are loaded; review your edit and save it as a new revision.',
        );
      } else setMessage((error as Error).message);
    } finally {
      setLibraryBusy(false);
    }
  };
  const deleteSavedRevision = async () => {
    setLibraryBusy(true);
    try {
      if (hosted) {
        const response = await systemsApi('DELETE', {
          id: system.id,
          revision: system.revision,
          expectedStorageRevision: storageRevision,
        });
        setStorageRevision(response.storageRevision ?? null);
      }
      const next = hosted
        ? deleteSystemRevision(saved, system.id, system.revision)
        : await updateLocalSystems((systems) =>
            deleteSystemRevision(systems, system.id, system.revision),
          );
      setSaved(next);
      setMessage('Saved revision deleted. Existing diagrams that embed it are unchanged.');
    } catch (error) {
      if (error instanceof SystemLibraryError && error.status === 409) {
        await refreshAfterConflict().catch(() => undefined);
        setMessage(
          'The hosted design-system library changed elsewhere. Its latest revisions are loaded; retry the delete after reviewing them.',
        );
      } else setMessage((error as Error).message);
    } finally {
      setLibraryBusy(false);
    }
  };
  const applyToDiagram = () => {
    try {
      apply(patchDocument(doc, { designSystem: validate() }));
      setMessage(`Applied ${system.name} revision ${system.revision} to this diagram.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  return (
    <>
      <h2 id="modal-title">Your design systems</h2>
      <p>
        Author reusable defaults and role styles. Applying a system stores a portable snapshot in
        the diagram.
      </p>
      <label className="field">
        Saved designs
        <select
          disabled={libraryLoading || libraryBusy}
          value=""
          onChange={(e) => {
            const chosen = saved.find((item) => `${item.id}:${item.revision}` === e.target.value);
            if (chosen) update(structuredClone(chosen));
          }}
        >
          <option value="">
            {libraryLoading ? 'Loading saved revisions…' : 'Choose a saved revision…'}
          </option>
          {saved.map((item) => (
            <option key={`${item.id}:${item.revision}`} value={`${item.id}:${item.revision}`}>
              {item.name} · {item.revision}
            </option>
          ))}
        </select>
      </label>
      <div className="design-fields design-system-fields">
        <label className="field">
          Name
          <input
            value={system.name}
            onChange={(e) => update({ ...system, name: e.target.value })}
          />
        </label>
        <label className="field">
          Identity ID
          <input
            value={system.id}
            onChange={(e) => update({ ...system, id: slug(e.target.value) || 'design-system' })}
          />
        </label>
        <label className="field">
          Revision
          <input
            value={system.revision}
            onChange={(e) => update({ ...system, revision: e.target.value })}
          />
        </label>
        <p className="help-text">
          Revisions are immutable. Increment the revision number before saving changed content;
          earlier snapshots remain available.
        </p>
        <StyleEditor
          title="Node defaults"
          value={system.node ?? {}}
          fields={fieldsFor('node')}
          onChange={(node) => update({ ...system, node })}
        />
        <StyleEditor
          title="Connection defaults"
          value={system.edge ?? {}}
          fields={fieldsFor('edge')}
          onChange={(edge) => update({ ...system, edge })}
        />
        <StyleEditor
          title="Container defaults"
          value={system.group ?? {}}
          fields={fieldsFor('group')}
          onChange={(group) => update({ ...system, group })}
        />
        <fieldset className="design-spacing">
          <legend>Layout spacing</legend>
          <label className="field">
            Component spacing
            <input
              type="number"
              min="20"
              max="240"
              value={system.spacing?.node ?? ''}
              onChange={(e) =>
                update({
                  ...system,
                  spacing: {
                    ...system.spacing,
                    node: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </label>
          <label className="field">
            Layer spacing
            <input
              type="number"
              min="32"
              max="320"
              value={system.spacing?.layer ?? ''}
              onChange={(e) =>
                update({
                  ...system,
                  spacing: {
                    ...system.spacing,
                    layer: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </label>
        </fieldset>
        <fieldset className="design-spacing">
          <legend>Canvas defaults</legend>
          {(['background', 'text', 'secondary', 'border'] as const).map((key) => (
            <label className="field" key={key}>
              {key[0].toUpperCase() + key.slice(1)}
              <span className="color-control">
                <input
                  type="color"
                  aria-label={`${key} picker`}
                  value={
                    typeof system.canvas?.[key] === 'string' &&
                    /^#[\da-f]{6}$/i.test(system.canvas[key]!)
                      ? system.canvas[key]!
                      : '#ffffff'
                  }
                  onChange={(e) =>
                    update({ ...system, canvas: { ...system.canvas, [key]: e.target.value } })
                  }
                />
                <PaintInput
                  label={key}
                  value={system.canvas?.[key] ?? ''}
                  onCommit={(value) =>
                    update({ ...system, canvas: { ...system.canvas, [key]: value } })
                  }
                />
              </span>
            </label>
          ))}
          <label className="field">
            Canvas font family
            <input
              value={system.canvas?.fontFamily ?? ''}
              onChange={(e) =>
                update({
                  ...system,
                  canvas: { ...system.canvas, fontFamily: e.target.value || undefined },
                })
              }
            />
          </label>
        </fieldset>
        <details className="style-fields" open>
          <summary>Roles</summary>
          <div className="design-role-add">
            <input
              aria-label="New role name"
              placeholder="e.g. warning"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
            />
            <button className="secondary" onClick={addRole}>
              Add role
            </button>
          </div>
          {Object.entries(roles).map(([name, style]) => (
            <div className="design-role" key={name}>
              <RoleNameField
                name={name}
                onError={setMessage}
                onRename={(nextName) => {
                  if (nextName !== name && roles[nextName]) {
                    setMessage(`Role ${nextName} already exists.`);
                    return;
                  }
                  const next = { ...roles };
                  delete next[name];
                  next[nextName] = style;
                  update({ ...system, roles: next });
                }}
              />
              <button
                aria-label={`Delete ${name} role`}
                className="text-button"
                onClick={() => {
                  const next = { ...roles };
                  delete next[name];
                  update({ ...system, roles: next });
                }}
              >
                Delete
              </button>
              <StyleEditor
                title={`${name} style`}
                value={style}
                fields={styleFields.filter((item) =>
                  [
                    'fill',
                    'stroke',
                    'text',
                    'secondary',
                    'strokeWidth',
                    'dash',
                    'radius',
                    'opacity',
                    'aspectRatio',
                    'fontWeight',
                  ].includes(item.key),
                )}
                onChange={(nextStyle) =>
                  update({ ...system, roles: { ...roles, [name]: nextStyle } })
                }
              />
            </div>
          ))}
        </details>
        <div className="system-preview">
          <span>Rendered diagram preview</span>
          {previewSvg ? (
            <>
              {(previewPending || previewError) && (
                <p className="help-text" role="status">
                  {previewPending
                    ? 'Showing the previous preview while the current revision is composed.'
                    : 'Showing the previous preview; the current revision preview is unavailable.'}
                </p>
              )}
              <div
                className="system-preview-svg"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            </>
          ) : previewPending ? (
            <p className="help-text" role="status">
              Composing preview…
            </p>
          ) : null}
          {previewError && (
            <p className="form-error" role="alert">
              Preview unavailable: {previewError}
            </p>
          )}
          <p className="help-text">
            Preview includes a classic component, a shaped node, a connection, a role, and a
            container.
          </p>
        </div>
      </div>
      <label className="advanced-toggle">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            if (e.target.checked) setAdvanced(true);
            else {
              try {
                update(designSystemSchema.parse(JSON.parse(json)));
                setAdvanced(false);
              } catch (error) {
                setMessage((error as Error).message);
              }
            }
          }}
        />{' '}
        Edit full design JSON
      </label>
      {advanced && (
        <textarea
          className="source-editor design-json"
          aria-label="Design system JSON"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      )}
      <div className="modal-actions">
        <label className="secondary import-design">
          Import JSON
          <input
            type="file"
            accept=".json"
            aria-label="Import design system"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 1_000_000)
                  throw new Error('Choose a design system smaller than 1 MB.');
                update(designSystemSchema.parse(JSON.parse(await file.text())));
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            try {
              const value = validate();
              download(`${slug(value.name)}.design.json`, JSON.stringify(value, null, 2) + '\n');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          Export design
        </button>
        <button
          className="secondary"
          disabled={libraryBusy || libraryLoading}
          onClick={() => {
            update(duplicateSystem(system));
          }}
        >
          Duplicate
        </button>
        <button
          className="secondary"
          disabled={
            libraryBusy ||
            libraryLoading ||
            !!storageProblem ||
            !saved.some((item) => item.id === system.id && item.revision === system.revision)
          }
          onClick={deleteSavedRevision}
        >
          Delete saved revision
        </button>
        <button
          className="secondary"
          disabled={libraryBusy || libraryLoading || !!storageProblem}
          onClick={save}
        >
          Save revision
        </button>
        <button className="primary" onClick={applyToDiagram}>
          Apply to diagram
        </button>
      </div>
      <p className="help-text">
        {hosted
          ? 'Saved revisions stay in your private hosted design-system library. Diagrams keep their own embedded snapshots.'
          : 'Saved systems stay in this browser. Export JSON to share or retain them elsewhere.'}{' '}
        Applying writes the selected revision into the diagram file.
      </p>
      {storageProblem && (
        <p className="form-error" role="alert">
          {storageProblem}
        </p>
      )}
      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
