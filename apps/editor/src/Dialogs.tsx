import { setupPrompt } from './setup-prompt';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ArrowRight, Workflow, Blocks, FileJson, Terminal, Copy, Check } from 'lucide-react';
import { parseDocument, serializeDocument, type Diagram } from '../../../packages/core/src';
import { templates, gallery } from './storage';
export function Dialogs({
  modal,
  close,
  doc,
  commit,
  notify,
  children,
}: {
  children?: ReactNode;
  modal: string;
  close: () => void;
  doc: Diagram;
  commit: (doc: Diagram) => void;
  notify: (s: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  const [source, setSource] = useState(serializeDocument(doc)),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className={`modal ${modal === 'source' ? 'source-modal' : ''}`}
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = [
            ...(dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), textarea, input, select, a[href]',
            ) ?? []),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close dialog" onClick={close}>
          <X size={19} />
        </button>
        {children ? (
          children
        ) : modal === 'templates' ? (
          <>
            <div className="modal-symbol">
              <Blocks size={24} />
            </div>
            <h2 id="modal-title">A good place to start.</h2>
            <p>Thoughtful foundations for your next big idea.</p>
            <div className="template-grid">
              <button
                onClick={() => {
                  commit(structuredClone(templates.architecture));
                  close();
                  notify('Architecture template opened. Previous diagram is available with Undo.');
                }}
              >
                <div className="template-preview architecture-preview">
                  <i />
                  <span />
                  <i />
                  <span />
                  <div>
                    <i />
                    <i />
                  </div>
                </div>
                <h3>
                  Cloud architecture <ArrowRight size={16} />
                </h3>
                <p>Components, services, and the connections between them.</p>
                <small>6 components · 3 groups</small>
              </button>
              <button
                onClick={() => {
                  commit(structuredClone(templates.flow));
                  close();
                  notify('Process flow opened. Previous diagram is available with Undo.');
                }}
              >
                <div className="template-preview flow-preview">
                  <i />
                  <span />
                  <i />
                  <span />
                  <i className="diamond" />
                  <span />
                  <i />
                </div>
                <h3>
                  Release workflow <ArrowRight size={16} />
                </h3>
                <p>A clear path from a first idea to a confident release.</p>
                <small>5 steps · decision & feedback</small>
              </button>
            </div>
            <div className="gallery-starters">
              <h3>Explore the general engine</h3>
              <div className="gallery-starter-list">
                {Object.entries(gallery).map(([name, example]) => (
                  <button
                    className="secondary"
                    key={name}
                    onClick={() => {
                      commit(structuredClone(example));
                      close();
                      notify('Example opened. Previous diagram is available with Undo.');
                    }}
                  >
                    {name === 'development'
                      ? 'Custom comparison'
                      : name[0].toUpperCase() + name.slice(1)}
                  </button>
                ))}
              </div>
              <p>
                Starting points, not diagram categories. Every example uses the same primitives.
              </p>
            </div>
            <button
              className="secondary full"
              onClick={() => {
                commit(
                  parseDocument({ version: 2, title: 'Untitled diagram', nodes: [], edges: [] }),
                );
                close();
                notify('A blank canvas, ready for your ideas.');
              }}
            >
              <Workflow size={16} />
              Start with a blank diagram
            </button>
          </>
        ) : modal === 'source' ? (
          <>
            <div className="modal-symbol">
              <FileJson size={23} />
            </div>
            <h2 id="modal-title">The document is the source.</h2>
            <p>One open format for you and your agents. Edit it here, or in your repository.</p>
            <textarea
              className="source-editor"
              aria-label="Diagram JSON"
              spellCheck={false}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <span>Forma document · version {doc.version}</span>
              <button
                className="primary"
                onClick={() => {
                  try {
                    commit(parseDocument(JSON.parse(source)));
                    close();
                    notify('Document validated and applied.');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Invalid document');
                  }
                }}
              >
                Validate & apply <ArrowRight size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-symbol">
              <Terminal size={24} />
            </div>
            <h2 id="modal-title">Made for your agents, too.</h2>
            <p>
              Describe the system. Let Forma handle the composition. Keep editing the same file.
            </p>
            <div className="agent-steps">
              <div>
                <span>01</span>
                <div>
                  <h3>Create the document</h3>
                  <p>Express components, relationships, and groups in versioned JSON.</p>
                </div>
              </div>
              <div>
                <span>02</span>
                <div>
                  <h3>Compose & inspect</h3>
                  <p>Render locally. Check machine-readable diagnostics. Refine.</p>
                </div>
              </div>
              <div>
                <span>03</span>
                <div>
                  <h3>Make it yours</h3>
                  <p>Open the file here. Human positions and styling survive agent patches.</p>
                </div>
              </div>
            </div>
            <label className="field">
              Give this prompt to your agent
              <textarea className="setup-prompt" readOnly value={setupPrompt} rows={12} />
            </label>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(setupPrompt);
                  setCopied(true);
                } catch {
                  notify('Clipboard unavailable. Select and copy the prompt above.');
                }
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
              {copied ? 'Copied setup prompt' : 'Copy setup prompt'}
            </button>
            <p className="modal-footnote">
              Agent guide: <code>skills/forma/SKILL.md</code>
              <br />
              No account. No API key. No service to depend on.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
