import { useEffect, useState } from 'react';
import {
  ArrowRight,
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
  tab,
  setTab,
  onDesignSystems,
}: {
  onDesignSystems: () => void;
  doc: Diagram;
  scene: Scene | null;
  selected: string | null;
  patch: (p: Patch) => boolean;
  onDelete: (ids: string[]) => void;
  onSelect: (id: string | null) => void;
  tab: string;
  setTab: (tab: string) => void;
}) {
  const node = doc.nodes.find((n) => n.id === selected),
    edge = doc.edges.find((e) => e.id === selected),
    group = doc.groups.find((g) => g.id === selected);
  const inspection = scene ? inspectScene(scene) : null;
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
                  onSelect(issue.ids[0]);
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
                density, and near alignment.
              </p>
              <p className="help-text">
                Geometric checks are a helpful second pair of eyes. Your judgment is still part of
                the process.
              </p>
            </section>
          </>
        ) : (
          <>
            {node ? (
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
                  <label className="field" key={side}>
                    {side === 'source' ? 'From' : 'To'}
                    <select
                      value={edge[side]}
                      onChange={(e) => patch({ edges: [{ id: edge.id, [side]: e.target.value }] })}
                    >
                      {doc.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </label>
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
                        Object.keys(doc.presentation.nodes).map((id) => [id, { position: null }]),
                      ),
                    })
                  }
                >
                  Release all pinned positions
                </button>
              )}
            </section>
            {!selected && (
              <section className="inspector-tip">
                <MouseTip />
                <p>
                  Select a component to edit its details, or drag it to make the layout your own.
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
    <details className="style-fields" open>
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
