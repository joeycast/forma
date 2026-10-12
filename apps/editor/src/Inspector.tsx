import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  Check,
  CheckCircle2,
  AlertTriangle,
  Pin,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
  Crosshair,
} from 'lucide-react';
import './Inspector.css';
import {
  accents,
  resolveNodeStyle,
  resolveEdgeStyle,
  resolveGroupStyle,
  resolveNodeStyleProperty,
  resolveEdgeStyleProperty,
  resolveGroupStyleProperty,
  atelier,
  signal,
  type ElementStyle,
  type InspectionResult,
  type Diagram,
  type Patch,
  type Scene,
  type Accent,
  type AlignEdge,
  type DistributeAxis,
  type PortSide,
  portSides,
  insertWaypoint,
} from '../../../packages/core/src';
import { SHAPE_NAMES, SHAPE_REGISTRY } from '../../../packages/core/src/shapes';

const mixedRolePlaceholder = '__forma_mixed__';

function roleOptions(doc: Diagram, currentRole?: string) {
  const roles = Object.keys(doc.presentation.designSystem?.roles ?? {}).filter((role) =>
    /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(role),
  );
  const currentIsUndefined = !!currentRole && !roles.includes(currentRole);
  if (currentIsUndefined) roles.push(currentRole);
  return roles.map((role) => ({
    role,
    label: currentIsUndefined && role === currentRole ? `${role} (undefined in system)` : role,
  }));
}

export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value && !onChange(draft)) setDraft(value);
  };
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
        />
      ) : (
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => boolean;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (
      !Number.isFinite(next) ||
      (min !== undefined && next < min) ||
      (max !== undefined && next > max) ||
      !onChange(next)
    )
      setDraft(String(value));
  };
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
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

function NumberControl({
  value,
  onCommit,
}: {
  value: number | undefined;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  const commit = () => {
    if (draft === '') onCommit(null);
    else if (Number.isFinite(Number(draft))) onCommit(Number(draft));
    else setDraft(value == null ? '' : String(value));
  };
  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function PaintValue({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
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
export function Inspector({
  doc,
  scene,
  inspection,
  inspectionState,
  selected,
  patch,
  onDelete,
  onSelect,
  onAlign,
  onDistribute,
  tab,
  setTab,
  onDesignSystems,
}: {
  onDesignSystems: (event: React.MouseEvent<HTMLButtonElement>) => void;
  doc: Diagram;
  scene: Scene | null;
  inspection: InspectionResult | null;
  inspectionState: 'pending' | 'unavailable' | 'stale' | 'failed' | 'ready';
  selected: string[];
  patch: (p: Patch) => boolean;
  onDelete: (ids: string[]) => void;
  onSelect: (ids: string[]) => void;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: DistributeAxis) => void;
  tab: string;
  setTab: (tab: string) => void;
}) {
  const selectedNodes = doc.nodes.filter((n) => selected.includes(n.id));
  const node = selectedNodes.length === 1 ? selectedNodes[0] : undefined,
    edge = selectedNodes.length ? undefined : doc.edges.find((e) => selected.includes(e.id)),
    group =
      selectedNodes.length || edge ? undefined : doc.groups.find((g) => selected.includes(g.id));
  useEffect(() => {
    document.querySelector('.inspector-scroll')?.scrollTo({ top: 0 });
  }, [selected]);
  const pins = Object.values(doc.presentation.nodes).filter((n) => n.position).length;
  return (
    <aside className="inspector">
      <div className="panel-tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}>
          Design
        </button>
        <button className={tab === 'inspect' ? 'active' : ''} onClick={() => setTab('inspect')}>
          Inspect{' '}
          {inspection && !!inspection.issues.length && <span>{inspection.issues.length}</span>}
        </button>
      </div>
      <div className="inspector-scroll">
        {tab === 'inspect' ? (
          <>
            <section>
              <div className={`quality-summary ${inspection?.summary.errors ? 'warning' : ''}`}>
                <CheckCircle2 size={22} />
                <h3>
                  {!inspection
                    ? inspectionState === 'pending'
                      ? 'Checking layout'
                      : inspectionState === 'failed'
                        ? 'Latest layout failed'
                        : 'Checks unavailable'
                    : inspectionState === 'failed'
                      ? 'Latest layout failed'
                      : inspectionState === 'stale'
                        ? 'Previous preview checks'
                        : inspection.issues.length
                          ? 'Room to refine'
                          : 'Looking good'}
                </h3>
                <p>
                  {!inspection
                    ? inspectionState === 'pending'
                      ? 'Quality checks will appear when layout finishes.'
                      : 'A matching inspection is not available for this layout.'
                    : inspectionState === 'failed' || inspectionState === 'stale'
                      ? 'These checks describe the last successful preview.'
                      : inspection.issues.length
                        ? 'Review these suggestions to improve your diagram.'
                        : 'No overlaps, collisions, or spacing issues detected.'}
                </p>
              </div>
              <div className="stat-grid">
                <div>
                  <strong>{inspection?.summary.nodes ?? '—'}</strong>
                  <span>Components</span>
                </div>
                <div>
                  <strong>{inspection?.summary.edges ?? '—'}</strong>
                  <span>Connections</span>
                </div>
                <div>
                  <strong>{inspection?.summary.crossings ?? '—'}</strong>
                  <span>Crossings</span>
                </div>
                <div>
                  <strong>{pins}</strong>
                  <span>Pinned</span>
                </div>
              </div>
            </section>
            {inspection?.issues.map((issue, i) => (
              <button
                key={i}
                className="issue"
                onClick={() => {
                  onSelect(issue.ids);
                }}
              >
                <AlertTriangle size={15} />
                <span>
                  <strong>{issue.code.replaceAll('-', ' ')}</strong>
                  {issue.message}
                </span>
              </button>
            ))}
            <section>
              <h3>What we check</h3>
              <p className="help-text">
                Overlaps, connector collisions and crossings, clipping, label placement, spacing,
                density, and near-miss row or column alignment. Use Align or{' '}
                <code>forma align --fix</code> to snap them.
              </p>
              <p className="help-text">
                Geometric checks are a helpful second pair of eyes. Your judgment is still part of
                the process.
              </p>
            </section>
          </>
        ) : (
          <>
            {selectedNodes.length > 1 ? (
              <section>
                <div className="section-heading">
                  <h3>Selection</h3>
                  <code>{selectedNodes.length}</code>
                </div>
                <p className="help-text">
                  Align edges to the selection bounds. Distribute keeps the outer components fixed
                  and evens the gaps. Alignment pins positions so later agent edits preserve them.
                </p>
                <div className="align-actions">
                  {(
                    [
                      ['left', 'Left'],
                      ['center', 'Centers'],
                      ['right', 'Right'],
                      ['top', 'Top'],
                      ['middle', 'Middles'],
                      ['bottom', 'Bottom'],
                    ] as const
                  ).map(([edge, label]) => (
                    <button key={edge} className="secondary" onClick={() => onAlign(edge)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="inspector-mixed">
                  <h3>Shared properties</h3>
                  <label className="field">
                    Role
                    <select
                      value={
                        selectedNodes.every((item) => item.role === selectedNodes[0].role)
                          ? (selectedNodes[0].role ?? '')
                          : mixedRolePlaceholder
                      }
                      onChange={(e) => {
                        if (e.target.value === mixedRolePlaceholder) return;
                        patch({
                          nodes: selectedNodes.map((item) => ({
                            id: item.id,
                            role: e.target.value || null,
                          })),
                        });
                      }}
                    >
                      <option value={mixedRolePlaceholder} disabled>
                        Mixed values
                      </option>
                      <option value="">No role</option>
                      {roleOptions(
                        doc,
                        selectedNodes.every((item) => item.role === selectedNodes[0].role)
                          ? selectedNodes[0].role
                          : undefined,
                      ).map(({ role, label }) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(['fill', 'stroke', 'opacity', 'strokeWidth', 'fontSize'] as const).map(
                    (key) => {
                      const values = selectedNodes.map((item) => resolveNodeStyle(doc, item)[key]);
                      const common = values.every((value) => value === values[0])
                        ? values[0]
                        : undefined;
                      const color = key === 'fill' || key === 'stroke';
                      return (
                        <div className="property-control" key={key}>
                          <label className="field">
                            {key === 'strokeWidth'
                              ? 'Stroke width'
                              : key === 'fontSize'
                                ? 'Font size'
                                : key[0].toUpperCase() + key.slice(1)}
                            <input
                              type={
                                color && common !== undefined ? 'color' : color ? 'text' : 'number'
                              }
                              placeholder={common === undefined ? 'Mixed values' : undefined}
                              value={common == null ? '' : String(common)}
                              onChange={(e) => {
                                const value = color ? e.target.value : Number(e.target.value);
                                patch({
                                  overrides: Object.fromEntries(
                                    selectedNodes.map((item) => [
                                      item.id,
                                      { style: { [key]: value } },
                                    ]),
                                  ),
                                });
                              }}
                            />
                          </label>
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              patch({
                                overrides: Object.fromEntries(
                                  selectedNodes.map((item) => [
                                    item.id,
                                    { style: { [key]: null } },
                                  ]),
                                ),
                              })
                            }
                          >
                            Reset overrides
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="align-actions">
                  <button
                    className="secondary"
                    disabled={selectedNodes.length < 3}
                    onClick={() => onDistribute('horizontal')}
                  >
                    Distribute horizontally
                  </button>
                  <button
                    className="secondary"
                    disabled={selectedNodes.length < 3}
                    onClick={() => onDistribute('vertical')}
                  >
                    Distribute vertically
                  </button>
                </div>
                <button
                  className="danger-button"
                  onClick={() => onDelete(selectedNodes.map((n) => n.id))}
                >
                  <Trash2 size={14} />
                  Delete components
                </button>
              </section>
            ) : node ? (
              <section>
                <div className="section-heading">
                  <h3>Component</h3>
                  <code>{node.id}</code>
                </div>
                <TextField
                  label="Label"
                  value={node.label}
                  onChange={(label) => patch({ nodes: [{ id: node.id, label }] })}
                />
                <TextField
                  label="Description"
                  value={node.description ?? ''}
                  multiline
                  onChange={(description) => patch({ nodes: [{ id: node.id, description }] })}
                />
                <ConnectedLines doc={doc} nodeId={node.id} onSelect={onSelect} />
                <TextField
                  label="Semantic kind"
                  value={node.kind}
                  onChange={(kind) => patch({ nodes: [{ id: node.id, kind }] })}
                />
                <label className="field role-label">
                  Role
                  <select
                    value={node.role ?? ''}
                    onChange={(e) =>
                      patch({ nodes: [{ id: node.id, role: e.target.value || null }] })
                    }
                  >
                    <option value="">No role</option>
                    {roleOptions(doc, node.role).map(({ role, label }) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Group
                  <select
                    value={node.group ?? ''}
                    onChange={(e) =>
                      patch({ nodes: [{ id: node.id, group: e.target.value || undefined }] })
                    }
                  >
                    <option value="">Ungrouped</option>
                    {doc.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Emphasis
                  <select
                    value={node.emphasis}
                    onChange={(e) => patch({ nodes: [{ id: node.id, emphasis: e.target.value }] })}
                  >
                    <option value="normal">Normal</option>
                    <option value="primary">Primary</option>
                    <option value="muted">Muted</option>
                  </select>
                </label>
                {!doc.presentation.designSystem &&
                  !node.style &&
                  !doc.presentation.nodes[node.id]?.style && (
                    <>
                      <label className="field">Accent</label>
                      <div className="accent-options">
                        {Object.entries(accents).map(([key, color]) => (
                          <button
                            key={key}
                            aria-label={`${key} accent`}
                            title={key}
                            className={
                              doc.presentation.nodes[node.id]?.color === key ? 'chosen' : ''
                            }
                            style={{ background: color.ink }}
                            onClick={() =>
                              patch({ overrides: { [node.id]: { color: key as Accent } } })
                            }
                          />
                        ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={() => patch({ overrides: { [node.id]: { color: null } } })}
                      >
                        Use group accent
                      </button>
                    </>
                  )}
                <div className="field">
                  Connection points
                  <div className="port-list">
                    {portSides.map((side) => {
                      const count = node.ports?.[side] ?? 1;
                      const setCount = (next: number) => {
                        const edges = doc.edges.flatMap((edge) => {
                          const appearance: Record<string, null> = {};
                          for (const end of ['source', 'target'] as const) {
                            if (edge[end] !== node.id) continue;
                            const portSide =
                              edge.appearance?.[end === 'source' ? 'sourcePort' : 'targetPort'];
                            const index =
                              edge.appearance?.[end === 'source' ? 'sourceIndex' : 'targetIndex'];
                            const fallback =
                              doc.layout.direction === 'DOWN'
                                ? end === 'source'
                                  ? 'bottom'
                                  : 'top'
                                : end === 'source'
                                  ? 'right'
                                  : 'left';
                            if (
                              (portSide ?? fallback) === side &&
                              index !== undefined &&
                              index >= next
                            )
                              appearance[end === 'source' ? 'sourceIndex' : 'targetIndex'] = null;
                          }
                          return Object.keys(appearance).length
                            ? [{ id: edge.id, appearance }]
                            : [];
                        });
                        patch({
                          nodes: [{ id: node.id, ports: { [side]: next > 1 ? next : null } }],
                          ...(edges.length ? { edges } : {}),
                        });
                      };
                      return (
                        <div className="port-row" key={side}>
                          <span>{side}</span>
                          <span className="port-stepper">
                            <button
                              aria-label={`Fewer ${side} points`}
                              disabled={count <= 1}
                              onClick={() => setCount(count - 1)}
                            >
                              −
                            </button>
                            <span>{count}</span>
                            <button
                              aria-label={`More ${side} points`}
                              disabled={count >= 12}
                              onClick={() => setCount(count + 1)}
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <StyleFields
                  style={resolveNodeStyle(doc, node)}
                  property={(key) => resolveNodeStyleProperty(doc, node, key)}
                  onChange={(style) =>
                    patch({
                      overrides: {
                        [node.id]: { style, ...(style.shape ? { variant: 'shape' } : {}) },
                      },
                    })
                  }
                  onReset={(key, source) =>
                    source === 'element'
                      ? patch({ nodes: [{ id: node.id, style: { [key]: null } }] })
                      : patch({ overrides: { [node.id]: { style: { [key]: null } } } })
                  }
                  onVariant={(variant) => patch({ overrides: { [node.id]: { variant } } })}
                />
                <details className="style-fields" open>
                  <summary>Precise geometry</summary>
                  <p className="help-text">
                    X/Y show the effective canvas position: pinned when a position is saved,
                    otherwise composed from the current layout.
                  </p>
                  <div className="geometry-grid">
                    {(['x', 'y'] as const).map((axis) => (
                      <NumberField
                        key={axis}
                        label={`${axis.toUpperCase()} position`}
                        value={
                          doc.presentation.nodes[node.id]?.position?.[axis] ??
                          scene?.nodes.find((item) => item.id === node.id)?.[axis] ??
                          0
                        }
                        onChange={(value) => {
                          const current = doc.presentation.nodes[node.id]?.position ?? {
                            x: scene?.nodes.find((item) => item.id === node.id)?.x ?? 0,
                            y: scene?.nodes.find((item) => item.id === node.id)?.y ?? 0,
                          };
                          return patch({
                            overrides: { [node.id]: { position: { ...current, [axis]: value } } },
                          });
                        }}
                      />
                    ))}
                    {(['width', 'height'] as const).map((key) => (
                      <NumberField
                        key={key}
                        label={key === 'width' ? 'Width' : 'Height'}
                        min={key === 'width' ? 80 : 40}
                        value={
                          resolveNodeStyle(doc, node)[key] ??
                          scene?.nodes.find((item) => item.id === node.id)?.[key] ??
                          (key === 'width' ? 180 : 64)
                        }
                        onChange={(value) =>
                          patch({ overrides: { [node.id]: { style: { [key]: value } } } })
                        }
                      />
                    ))}
                  </div>
                  {doc.layout.mode === 'grid' && (
                    <div className="geometry-grid">
                      {(['column', 'row'] as const).map((axis) => (
                        <label className="field" key={axis}>
                          {axis === 'column' ? 'Grid column' : 'Grid row'}
                          <input
                            type="number"
                            min="0"
                            value={node.placement?.[axis] ?? ''}
                            onChange={(e) =>
                              patch({
                                nodes: [
                                  {
                                    id: node.id,
                                    placement: {
                                      ...(node.placement ?? { column: 0, row: 0 }),
                                      [axis]: Number(e.target.value),
                                    },
                                  },
                                ],
                              })
                            }
                          />
                        </label>
                      ))}
                      <button
                        className="text-button"
                        onClick={() => patch({ nodes: [{ id: node.id, placement: null }] })}
                      >
                        Clear grid cell
                      </button>
                    </div>
                  )}
                </details>
                <div className="position-note">
                  <Pin size={14} />
                  <span>
                    {doc.presentation.nodes[node.id]?.position
                      ? 'Position pinned. Agent edits will preserve it.'
                      : 'Automatically positioned. Drag to pin.'}
                  </span>
                </div>
                {doc.presentation.nodes[node.id]?.position && (
                  <button
                    className="secondary full"
                    onClick={() => patch({ overrides: { [node.id]: { position: null } } })}
                  >
                    <RotateCcw size={14} />
                    Release position
                  </button>
                )}
                <button className="danger-button" onClick={() => onDelete([node.id])}>
                  <Trash2 size={14} />
                  Delete component
                </button>
              </section>
            ) : edge ? (
              <section>
                <div className="section-heading">
                  <h3>Connection</h3>
                  <code>{edge.id}</code>
                </div>
                <TextField
                  label="Label"
                  value={edge.label ?? ''}
                  onChange={(label) => patch({ edges: [{ id: edge.id, label }] })}
                />
                <label className="field role-label">
                  Role
                  <select
                    value={edge.role ?? ''}
                    onChange={(e) =>
                      patch({ edges: [{ id: edge.id, role: e.target.value || null }] })
                    }
                  >
                    <option value="">No role</option>
                    {roleOptions(doc, edge.role).map(({ role, label }) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {(['source', 'target'] as const).map((side) => (
                  <div className="endpoint-field" key={side}>
                    <label className="field">
                      {side === 'source' ? 'From' : 'To'}
                      <select
                        value={edge[side]}
                        onChange={(e) =>
                          patch({ edges: [{ id: edge.id, [side]: e.target.value }] })
                        }
                      >
                        {doc.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="text-button" onClick={() => onSelect([edge[side]])}>
                      Open component
                    </button>
                  </div>
                ))}
                {(['source', 'target'] as const).map((end) => {
                  const nodeId = edge[end];
                  const endpoint = doc.nodes.find((n) => n.id === nodeId);
                  const portKey = end === 'source' ? 'sourcePort' : 'targetPort';
                  const indexKey = end === 'source' ? 'sourceIndex' : 'targetIndex';
                  const side = edge.appearance?.[portKey] ?? '';
                  const count = side ? (endpoint?.ports?.[side as PortSide] ?? 1) : 1;
                  return (
                    <div key={end}>
                      <label className="field">
                        {end === 'source' ? 'Leaves from' : 'Arrives on'}
                        <select
                          value={side}
                          onChange={(event) =>
                            patch({
                              edges: [
                                {
                                  id: edge.id,
                                  appearance: {
                                    [portKey]: event.target.value || null,
                                    [indexKey]: null,
                                  },
                                },
                              ],
                            })
                          }
                        >
                          <option value="">Automatic</option>
                          {portSides.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      {side && count > 1 && (
                        <label className="field">
                          Point
                          <select
                            value={String(
                              edge.appearance?.[indexKey] ?? Math.floor((count - 1) / 2),
                            )}
                            onChange={(event) =>
                              patch({
                                edges: [
                                  {
                                    id: edge.id,
                                    appearance: { [indexKey]: Number(event.target.value) },
                                  },
                                ],
                              })
                            }
                          >
                            {Array.from({ length: count }, (_, index) => (
                              <option key={index} value={index}>
                                {index + 1} of {count}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
                <div className="field">
                  Path
                  {!!edge.path?.length && (
                    <details className="style-fields">
                      <summary>Corner positions</summary>
                      {edge.path.map((point, index) => (
                        <CornerField
                          key={`${index}:${point.x}:${point.y}`}
                          index={index}
                          point={point}
                          onCommit={(next) =>
                            patch({
                              edges: [
                                {
                                  id: edge.id,
                                  path: edge.path!.map((item, i) => (i === index ? next : item)),
                                },
                              ],
                            })
                          }
                          onRemove={() => {
                            const path = edge.path!.filter((_, i) => i !== index);
                            patch({ edges: [{ id: edge.id, path: path.length ? path : null }] });
                          }}
                        />
                      ))}
                    </details>
                  )}
                  <div className="path-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        const laid = scene?.edges.find((item) => item.id === edge.id);
                        if (!laid?.points.length) return;
                        let best = 0,
                          length = -1;
                        for (let i = 1; i < laid.points.length; i++) {
                          const span = Math.hypot(
                            laid.points[i].x - laid.points[i - 1].x,
                            laid.points[i].y - laid.points[i - 1].y,
                          );
                          if (span > length) {
                            length = span;
                            best = i;
                          }
                        }
                        const a = laid.points[best - 1],
                          b = laid.points[best];
                        const anchors = edge.path?.length
                          ? [laid.points[0], ...edge.path, laid.points.at(-1)!]
                          : laid.points;
                        patch({
                          edges: [
                            {
                              id: edge.id,
                              path: insertWaypoint(anchors, {
                                x: Math.round((a.x + b.x) / 2),
                                y: Math.round((a.y + b.y) / 2),
                              }),
                            },
                          ],
                        });
                      }}
                    >
                      Add corner
                    </button>
                    {edge.path && (
                      <button
                        className="text-button"
                        onClick={() => patch({ edges: [{ id: edge.id, path: null }] })}
                      >
                        Use automatic path
                      </button>
                    )}
                  </div>
                  <p className="help-text">
                    Drag either end onto a point, or hover the line and drag a segment handle.
                  </p>
                </div>
                <StyleFields
                  edge
                  style={resolveEdgeStyle(doc, edge)}
                  property={(key) => resolveEdgeStyleProperty(doc, edge, key)}
                  onChange={(appearance) => patch({ edges: [{ id: edge.id, appearance }] })}
                  onReset={(key) =>
                    patch({ edges: [{ id: edge.id, appearance: { [key]: null } }] })
                  }
                />
                <button className="danger-button" onClick={() => onDelete([edge.id])}>
                  <Trash2 size={14} />
                  Delete connection
                </button>
              </section>
            ) : group ? (
              <section>
                <div className="section-heading">
                  <h3>Group</h3>
                  <code>{group.id}</code>
                </div>
                <TextField
                  label="Label"
                  value={group.label}
                  onChange={(label) => patch({ groups: [{ id: group.id, label }] })}
                />
                <TextField
                  label="Description"
                  value={group.description ?? ''}
                  multiline
                  onChange={(description) => patch({ groups: [{ id: group.id, description }] })}
                />
                <label className="field role-label">
                  Role
                  <select
                    value={group.role ?? ''}
                    onChange={(e) =>
                      patch({ groups: [{ id: group.id, role: e.target.value || null }] })
                    }
                  >
                    <option value="">No role</option>
                    {roleOptions(doc, group.role).map(({ role, label }) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Parent group
                  <select
                    value={group.parent ?? ''}
                    onChange={(e) =>
                      patch({ groups: [{ id: group.id, parent: e.target.value || undefined }] })
                    }
                  >
                    <option value="">Top level</option>
                    {doc.groups
                      .filter((g) => g.id !== group.id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                  </select>
                </label>
                <StyleFields
                  group
                  style={resolveGroupStyle(doc, group)}
                  property={(key) => resolveGroupStyleProperty(doc, group, key)}
                  onChange={(style) => patch({ groups: [{ id: group.id, style }] })}
                  onReset={(key) => patch({ groups: [{ id: group.id, style: { [key]: null } }] })}
                />
                <label className="field">
                  Accent
                  <select
                    value={group.color}
                    onChange={(e) => patch({ groups: [{ id: group.id, color: e.target.value }] })}
                  >
                    {Object.keys(accents).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <MemberList doc={doc} groupId={group.id} onSelect={onSelect} />
                <p className="help-text">Group bounds follow their components automatically.</p>
                <button className="danger-button" onClick={() => onDelete([group.id])}>
                  <Trash2 size={14} />
                  Ungroup components
                </button>
              </section>
            ) : (
              <section>
                <div className="section-heading">
                  <h3>Document</h3>
                  <SlidersHorizontal size={14} />
                </div>
                <TextField label="Title" value={doc.title} onChange={(title) => patch({ title })} />
                <TextField
                  label="Description"
                  value={doc.description ?? ''}
                  multiline
                  onChange={(description) => patch({ description })}
                />
                <FooterFields doc={doc} patch={patch} />
              </section>
            )}
            {!selected.length && (
              <>
                <section>
                  <h3>Design system</h3>
                  <button className="secondary full" onClick={onDesignSystems}>
                    Create or edit design system
                  </button>
                  <label className="field">
                    Visual identity
                    <select
                      aria-label="Visual identity"
                      value={doc.presentation.designSystem?.id ?? ''}
                      onChange={(e) =>
                        patch({
                          designSystem:
                            e.target.value === 'atelier'
                              ? atelier
                              : e.target.value === 'signal'
                                ? signal
                                : null,
                        })
                      }
                    >
                      <option value="">Classic themes</option>
                      <option value="atelier">Atelier · editorial</option>
                      <option value="signal">Signal · technical</option>
                      {doc.presentation.designSystem &&
                        !['atelier', 'signal'].includes(doc.presentation.designSystem.id) && (
                          <option value={doc.presentation.designSystem.id}>
                            {doc.presentation.designSystem.name}
                          </option>
                        )}
                    </select>
                  </label>
                  <p className="help-text">
                    Identity is stored in this file. Element overrides take precedence.
                  </p>
                  <h3>Base theme</h3>
                  <div className="theme-options">
                    {(['paper', 'midnight'] as const).map((theme) => (
                      <button
                        className={`theme-option ${theme} ${doc.presentation.theme === theme ? 'chosen' : ''}`}
                        key={theme}
                        onClick={() => patch({ theme })}
                      >
                        <span className="theme-preview">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span>
                          {theme === 'paper' ? 'Paper' : 'Midnight'}
                          {doc.presentation.theme === theme && <Check size={12} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>Composition</h3>
                  <label className="field">
                    Arrangement
                    <select
                      value={doc.layout.mode ?? 'layered'}
                      onChange={(e) =>
                        patch({ layout: { mode: e.target.value as 'layered' | 'grid' } })
                      }
                    >
                      <option value="layered">Automatic graph</option>
                      <option value="grid">Composition grid</option>
                    </select>
                  </label>
                  <label className="field">Direction</label>
                  <div className="segmented">
                    <button
                      className={doc.layout.direction === 'RIGHT' ? 'active' : ''}
                      onClick={() => patch({ layout: { direction: 'RIGHT' } })}
                    >
                      <ArrowRight size={14} />
                      Horizontal
                    </button>
                    <button
                      className={doc.layout.direction === 'DOWN' ? 'active' : ''}
                      onClick={() => patch({ layout: { direction: 'DOWN' } })}
                    >
                      <ArrowDown size={14} />
                      Vertical
                    </button>
                  </div>
                  <label className="field">
                    Spacing
                    <select
                      value={doc.layout.spacing}
                      onChange={(e) =>
                        patch({ layout: { spacing: e.target.value as 'compact' | 'comfortable' } })
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                  <div className="position-note">
                    <Crosshair size={14} />
                    <span>
                      {pins
                        ? `${pins} human position${pins === 1 ? '' : 's'} preserved`
                        : 'Let the engine do the arranging.'}
                    </span>
                  </div>
                  {pins > 0 && (
                    <button
                      className="text-button"
                      onClick={() =>
                        patch({
                          overrides: Object.fromEntries(
                            Object.keys(doc.presentation.nodes).map((id) => [
                              id,
                              { position: null },
                            ]),
                          ),
                        })
                      }
                    >
                      Release all pinned positions
                    </button>
                  )}
                </section>
              </>
            )}
            {!selected.length && (
              <section className="inspector-tip">
                <MouseTip />
                <p>
                  Select a component to edit its details. Shift-click or drag a marquee to edit
                  several at once.
                </p>
              </section>
            )}
          </>
        )}
      </div>
      <div className="inspector-footer">
        <span className="tiny-dot" />
        Layout and rendering happen on your device
      </div>
    </aside>
  );
}
function MouseTip() {
  return <Crosshair size={19} />;
}
function FooterFields({ doc, patch }: { doc: Diagram; patch: (p: Patch) => boolean }) {
  const footer = doc.presentation.footer;
  const hidden = !!footer?.hidden;
  const kind = doc.type.replaceAll('-', ' ');
  return (
    <div className="field">
      Footer
      <span className="segmented">
        <button
          className={hidden ? '' : 'active'}
          onClick={() => patch({ footer: { hidden: null } })}
        >
          Show
        </button>
        <button
          className={hidden ? 'active' : ''}
          onClick={() => patch({ footer: { hidden: true } })}
        >
          Hide
        </button>
      </span>
      {!hidden && (
        <>
          <TextField
            label="Left label"
            value={footer?.label ?? ''}
            placeholder={`FORMA / ${kind.toUpperCase()}`}
            onChange={(label) => patch({ footer: { label: label.trim() || null } })}
          />
          <TextField
            label="Right detail"
            value={footer?.detail ?? ''}
            placeholder="Component and relationship counts"
            onChange={(detail) => patch({ footer: { detail: detail.trim() || null } })}
          />
        </>
      )}
    </div>
  );
}
function labelOf(doc: Diagram, id: string) {
  return doc.nodes.find((node) => node.id === id)?.label ?? id;
}
function ConnectedLines({
  doc,
  nodeId,
  onSelect,
}: {
  doc: Diagram;
  nodeId: string;
  onSelect: (ids: string[]) => void;
}) {
  const lines = doc.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  return (
    <div className="field">
      Connections
      {lines.length ? (
        <div className="link-list">
          {lines.map((edge) => {
            const outbound = edge.source === nodeId;
            const otherId = outbound ? edge.target : edge.source;
            return (
              <div className="link-row" key={edge.id}>
                <button onClick={() => onSelect([otherId])}>
                  {outbound ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                  <span>
                    <strong>{labelOf(doc, otherId)}</strong>
                    <small>{edge.label || (outbound ? 'Line out' : 'Line in')}</small>
                  </span>
                </button>
                <button
                  aria-label={`Edit line ${edge.label || edge.id}`}
                  onClick={() => onSelect([edge.id])}
                >
                  Edit line
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="help-text">No lines touch this component.</p>
      )}
    </div>
  );
}
function MemberList({
  doc,
  groupId,
  onSelect,
}: {
  doc: Diagram;
  groupId: string;
  onSelect: (ids: string[]) => void;
}) {
  const members = doc.nodes.filter((node) => node.group === groupId);
  if (!members.length) return null;
  return (
    <div className="field">
      Components
      <div className="link-list">
        {members.map((node) => (
          <div className="link-row" key={node.id}>
            <button onClick={() => onSelect([node.id])}>
              <span>
                <strong>{node.label}</strong>
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function CornerField({
  point,
  index,
  onCommit,
  onRemove,
}: {
  point: { x: number; y: number };
  index: number;
  onCommit: (point: { x: number; y: number }) => boolean;
  onRemove: () => void;
}) {
  const [x, setX] = useState(String(point.x));
  const [y, setY] = useState(String(point.y));
  useEffect(() => {
    setX(String(point.x));
    setY(String(point.y));
  }, [point.x, point.y]);
  const commit = () => {
    const next = { x: Number(x), y: Number(y) };
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !onCommit(next)) {
      setX(String(point.x));
      setY(String(point.y));
    }
  };
  return (
    <div className="path-point">
      <input
        aria-label={`Corner ${index + 1} x`}
        value={x}
        onChange={(event) => setX(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <input
        aria-label={`Corner ${index + 1} y`}
        value={y}
        onChange={(event) => setY(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <button aria-label={`Remove corner ${index + 1}`} onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function StyleFields({
  style,
  onChange,
  edge = false,
  group = false,
  property,
  onReset,
  onVariant,
}: {
  style: ElementStyle;
  onChange: (style: Partial<ElementStyle>) => boolean;
  edge?: boolean;
  group?: boolean;
  property?: (key: any) => {
    value: ElementStyle[keyof ElementStyle] | undefined;
    source?: string;
    canReset: boolean;
  };
  onReset?: (key: keyof ElementStyle, source?: string) => boolean;
  onVariant?: (variant: 'classic' | 'shape') => boolean;
}) {
  const keys: (keyof ElementStyle)[] = edge
    ? [
        'stroke',
        'fill',
        'text',
        'strokeWidth',
        'dash',
        'opacity',
        'arrowStart',
        'arrowEnd',
        'routing',
      ]
    : group
      ? ['fill', 'stroke', 'text', 'strokeWidth', 'dash', 'radius', 'opacity', 'fontFamily']
      : [
          'fill',
          'stroke',
          'text',
          'secondary',
          'strokeWidth',
          'dash',
          'opacity',
          'radius',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'padding',
          'width',
          'height',
          'aspectRatio',
          'align',
          'verticalAlign',
        ];
  const sourceLabel = (key: keyof ElementStyle) => {
    const source = property?.(key).source;
    if (source === 'builtin') return 'built-in default';
    if (source === 'designSystem') return 'design system';
    if (source === 'role') return 'role';
    if (source === 'element') return 'element style';
    if (source === 'override') return 'presentation override';
    return 'renderer default';
  };
  const resetButton = (key: keyof ElementStyle) => {
    const info = property?.(key);
    return (
      info?.canReset && (
        <button className="text-button" type="button" onClick={() => onReset?.(key, info.source)}>
          Reset
        </button>
      )
    );
  };
  const field = (key: keyof ElementStyle, label: string, control: React.ReactNode) => (
    <div className="property-control" key={key}>
      <label className="field">
        {label}
        {control}
      </label>
      <div className="property-meta">
        <span>
          Effective: {String(property?.(key).value ?? style[key] ?? '—')} · {sourceLabel(key)}
        </span>
        {resetButton(key)}
      </div>
    </div>
  );
  return (
    <details className="style-fields">
      <summary>Appearance</summary>
      {!edge && (
        <>
          {field(
            'shape',
            'Shape',
            <select
              value={style.shape ?? 'rect'}
              onChange={(e) => {
                onChange({ shape: e.target.value as ElementStyle['shape'] });
              }}
            >
              {SHAPE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {SHAPE_REGISTRY[s].label}
                </option>
              ))}
            </select>,
          )}
          {onVariant && (
            <button className="text-button" onClick={() => onVariant('classic')}>
              Use classic component
            </button>
          )}
        </>
      )}
      {keys.map((key) => {
        const value = property?.(key).value ?? style[key];
        const label =
          key === 'arrowStart'
            ? 'Start marker'
            : key === 'arrowEnd'
              ? 'End marker'
              : key === 'routing'
                ? 'Routing'
                : key === 'strokeWidth'
                  ? 'Stroke width'
                  : key === 'secondary'
                    ? 'Secondary text'
                    : key === 'aspectRatio'
                      ? 'Aspect ratio'
                      : key[0].toUpperCase() + key.slice(1);
        let control: React.ReactNode;
        if (['fill', 'stroke', 'text', 'secondary'].includes(key))
          control = (
            <span className="color-control">
              <input
                type="color"
                aria-label={`${label} picker`}
                value={
                  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'
                }
                onChange={(e) => onChange({ [key]: e.target.value })}
              />
              <PaintValue
                label={`${label} value`}
                value={String(value ?? '')}
                onCommit={(next) => onChange({ [key]: next })}
              />
            </span>
          );
        else if (
          [
            'dash',
            'arrowStart',
            'arrowEnd',
            'routing',
            'align',
            'verticalAlign',
            'fontWeight',
          ].includes(key)
        ) {
          const options: Record<string, string[]> = {
            dash: ['solid', 'dashed', 'dotted'],
            arrowStart: ['none', 'open', 'filled', 'diamond', 'circle'],
            arrowEnd: ['none', 'open', 'filled', 'diamond', 'circle'],
            routing: ['orthogonal', 'straight'],
            align: ['left', 'center', 'right'],
            verticalAlign: ['top', 'middle', 'bottom'],
            fontWeight: ['400', '600'],
          };
          control = (
            <select
              value={String(value ?? '')}
              onChange={(e) =>
                onChange({ [key]: key === 'fontWeight' ? Number(e.target.value) : e.target.value })
              }
            >
              {options[key].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          );
        } else if (['fontFamily'].includes(key))
          control = (
            <input
              value={String(value ?? '')}
              onChange={(e) => onChange({ [key]: e.target.value })}
            />
          );
        else
          control = (
            <NumberControl
              value={value == null ? undefined : Number(value)}
              onCommit={(next) => onChange({ [key]: next })}
            />
          );
        return field(key, label, control);
      })}
    </details>
  );
}
