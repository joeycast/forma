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
import {
  accents,
  resolveNodeStyle,
  resolveEdgeStyle,
  atelier,
  signal,
  type ElementStyle,
  inspectScene,
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
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => boolean;
  multiline?: boolean;
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
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
        />
      ) : (
        <input
          value={draft}
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
export function Inspector({
  doc,
  scene,
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
  onDesignSystems: () => void;
  doc: Diagram;
  scene: Scene | null;
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
  const inspection = scene ? inspectScene(scene) : null;
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
                    ? 'Composing…'
                    : inspection.issues.length
                      ? 'Room to refine'
                      : 'Looking good'}
                </h3>
                <p>
                  {inspection?.issues.length
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
                  onChange={(style) => patch({ overrides: { [node.id]: { style } } })}
                />
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
                <label className="field">
                  Line style
                  <select
                    value={edge.style}
                    onChange={(e) => patch({ edges: [{ id: edge.id, style: e.target.value }] })}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </label>
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
                  onChange={(appearance) => patch({ edges: [{ id: edge.id, appearance }] })}
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
}: {
  style: ElementStyle;
  onChange: (style: ElementStyle) => boolean;
  edge?: boolean;
}) {
  return (
    <details className="style-fields">
      <summary>Appearance</summary>
      {!edge && (
        <label className="field">
          Shape
          <select
            value={style.shape ?? 'rect'}
            onChange={(e) => onChange({ shape: e.target.value as ElementStyle['shape'] })}
          >
            {['rect', 'pill', 'diamond', 'ellipse', 'cylinder', 'text'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {(edge ? ['stroke'] : ['fill', 'stroke', 'text']).map((key) => (
        <TextField
          key={key}
          label={key[0].toUpperCase() + key.slice(1)}
          value={String(style[key as keyof ElementStyle] ?? '')}
          onChange={(value) => onChange({ [key]: value })}
        />
      ))}
      <label className="field">
        Outline
        <select
          value={style.dash ?? 'solid'}
          onChange={(e) => onChange({ dash: e.target.value as ElementStyle['dash'] })}
        >
          {['solid', 'dashed', 'dotted'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {!edge && (
        <>
          <span className="field">
            Horizontal
            <span className="segmented thirds">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  className={
                    (style.align ??
                      (['diamond', 'ellipse', 'pill'].includes(style.shape ?? '')
                        ? 'center'
                        : 'left')) === align
                      ? 'active'
                      : ''
                  }
                  onClick={() => onChange({ align })}
                >
                  {align}
                </button>
              ))}
            </span>
          </span>
          <span className="field">
            Vertical
            <span className="segmented thirds">
              {(['top', 'middle', 'bottom'] as const).map((verticalAlign) => (
                <button
                  key={verticalAlign}
                  className={(style.verticalAlign ?? 'middle') === verticalAlign ? 'active' : ''}
                  onClick={() => onChange({ verticalAlign })}
                >
                  {verticalAlign}
                </button>
              ))}
            </span>
          </span>
          <TextField
            label="Font family"
            value={style.fontFamily ?? 'IBM Plex Sans'}
            onChange={(fontFamily) => onChange({ fontFamily })}
          />
          <TextField
            label="Font size"
            value={String(style.fontSize ?? 16)}
            onChange={(value) => onChange({ fontSize: Number(value) })}
          />
          <TextField
            label="Corner radius"
            value={String(style.radius ?? 10)}
            onChange={(value) => onChange({ radius: Number(value) })}
          />
        </>
      )}
      {edge && (
        <label className="field">
          End marker
          <select
            value={style.arrowEnd ?? 'open'}
            onChange={(e) => onChange({ arrowEnd: e.target.value as ElementStyle['arrowEnd'] })}
          >
            {['none', 'open', 'filled', 'diamond', 'circle'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
    </details>
  );
}
