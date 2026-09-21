import { useState } from 'react';
import {
  atelier,
  designSystemSchema,
  patchDocument,
  type DesignSystem,
  type Diagram,
} from '../../../packages/core/src';
import { download, slug } from './storage';
const KEY = 'forma.design-systems.v1';
function readSaved(): DesignSystem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]').map((v: unknown) =>
      designSystemSchema.parse(v),
    );
  } catch {
    return [];
  }
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
  const [saved, setSaved] = useState(readSaved),
    [json, setJson] = useState(JSON.stringify(system, null, 2)),
    [advanced, setAdvanced] = useState(false),
    [message, setMessage] = useState('');
  const change = (next: DesignSystem) => {
    setSystem(next);
    setJson(JSON.stringify(next, null, 2));
    setMessage('');
  };
  const validate = () => designSystemSchema.parse(advanced ? JSON.parse(json) : system);
  const action = (fn: (value: DesignSystem) => void) => {
    try {
      const value = validate();
      fn(value);
      change(value);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const color = (
    label: string,
    section: 'canvas' | 'node' | 'edge' | 'group',
    key: string,
    fallback: string,
  ) => (
    <label className="field" key={label}>
      {label}
      <div className="color-field">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={(system[section] as Record<string, string>)?.[key] ?? fallback}
          onChange={(e) =>
            change({ ...system, [section]: { ...system[section], [key]: e.target.value } })
          }
        />
        <input
          aria-label={label}
          value={(system[section] as Record<string, string>)?.[key] ?? fallback}
          onChange={(e) =>
            change({ ...system, [section]: { ...system[section], [key]: e.target.value } })
          }
        />
      </div>
    </label>
  );
  return (
    <>
      <h2 id="modal-title">Your design systems</h2>
      <p>
        Define your diagram identity once. Save it for other diagrams, or export a versioned file
        for your agents.
      </p>
      <label className="field">
        Saved designs
        <select
          value=""
          onChange={(e) => {
            const next = saved.find((s) => s.id === e.target.value);
            if (next) change(structuredClone(next));
          }}
        >
          <option value="">Choose a saved design…</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.revision}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="design-fields" disabled={advanced}>
        <label className="field">
          Name
          <input
            value={system.name}
            onChange={(e) => change({ ...system, name: e.target.value })}
          />
        </label>
        <label className="field">
          Identity ID
          <input value={system.id} onChange={(e) => change({ ...system, id: e.target.value })} />
        </label>
        <label className="field">
          Revision
          <input
            value={system.revision}
            onChange={(e) => change({ ...system, revision: e.target.value })}
          />
        </label>
        {color('Canvas', 'canvas', 'background', '#ffffff')}
        {color('Heading text', 'canvas', 'text', '#182333')}
        {color('Node fill', 'node', 'fill', '#ffffff')}
        {color('Node outline', 'node', 'stroke', '#cbd5e1')}
        {color('Node text', 'node', 'text', '#182333')}
        {color('Description text', 'node', 'secondary', '#64748b')}
        {color('Connectors', 'edge', 'stroke', '#64748b')}
        {color('Group fill', 'group', 'fill', '#f8fafc')}
        <label className="field">
          Corners
          <input
            type="number"
            min="0"
            max="100"
            value={system.node?.radius ?? 10}
            onChange={(e) =>
              change({ ...system, node: { ...system.node, radius: Number(e.target.value) } })
            }
          />
        </label>
        <label className="field">
          Font size
          <input
            type="number"
            min="10"
            max="40"
            value={system.node?.fontSize ?? 16}
            onChange={(e) =>
              change({ ...system, node: { ...system.node, fontSize: Number(e.target.value) } })
            }
          />
        </label>
        <label className="field">
          Layer spacing
          <input
            type="number"
            min="32"
            max="320"
            value={system.spacing?.layer ?? 88}
            onChange={(e) =>
              change({ ...system, spacing: { ...system.spacing, layer: Number(e.target.value) } })
            }
          />
        </label>
      </fieldset>
      <label className="advanced-toggle">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            if (e.target.checked) setAdvanced(true);
            else {
              try {
                change(designSystemSchema.parse(JSON.parse(json)));
                setAdvanced(false);
              } catch (err) {
                setMessage((err as Error).message);
              }
            }
          }}
        />{' '}
        Edit full design JSON, including roles and advanced properties
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
                change(designSystemSchema.parse(JSON.parse(await file.text())));
              } catch (err) {
                setMessage((err as Error).message);
              }
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() =>
            action((value) =>
              download(`${slug(value.name)}.design.json`, JSON.stringify(value, null, 2) + '\n'),
            )
          }
        >
          Export design
        </button>
        <button
          className="primary"
          onClick={() =>
            action((value) => {
              const next = [...readSaved().filter((s) => s.id !== value.id), value];
              localStorage.setItem(KEY, JSON.stringify(next));
              setSaved(next);
              apply(patchDocument(doc, { designSystem: value }));
            })
          }
        >
          Save & apply
        </button>
      </div>
      <p className="help-text">
        Saved designs stay in this browser. Export the JSON to share it or keep it in Git.
        Individual element overrides still win.
      </p>
      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
