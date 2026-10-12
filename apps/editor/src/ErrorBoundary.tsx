import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { serializeDocument, type Diagram } from '../../../packages/core/src';
import './accessibility.css';

let lastValidDocument = '';

/** Record only documents that have already passed the core validator. */
export function recordLastValidDocument(doc: Diagram) {
  try {
    lastValidDocument = serializeDocument(doc);
  } catch {
    // Keep the last known-valid snapshot if serialization unexpectedly fails.
  }
}

export function clearLastValidDocument() {
  lastValidDocument = '';
}

function downloadLastValidDocument() {
  if (!lastValidDocument) return;
  const url = URL.createObjectURL(
    new Blob([lastValidDocument], { type: 'application/json;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'forma-last-valid.forma.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function RecoveryScreen({ error, retry }: { error: Error; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="recovery-screen" role="alert">
      <section className="recovery-card" aria-labelledby="recovery-title">
        <p className="recovery-kicker">EDITOR RECOVERY</p>
        <h1 id="recovery-title" ref={heading} tabIndex={-1}>
          The editor stopped unexpectedly.
        </h1>
        <p>
          Your saved and autosaved drafts have not been reset. You can retry the editor, reload the
          page, or download the last valid diagram snapshot kept in memory.
        </p>
        <details>
          <summary>Error details</summary>
          <pre>{error.message || 'An unexpected rendering error occurred.'}</pre>
        </details>
        <div className="recovery-actions">
          <button className="primary" onClick={retry}>
            Retry editor
          </button>
          <button className="secondary" onClick={() => location.reload()}>
            Reload page
          </button>
          <button
            className="secondary"
            disabled={!lastValidDocument}
            onClick={downloadLastValidDocument}
          >
            Download last valid diagram
          </button>
        </div>
        {!lastValidDocument && (
          <p className="recovery-note">A valid document snapshot is not available yet.</p>
        )}
      </section>
    </main>
  );
}

type BoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      error: error instanceof Error ? error : new Error('An unexpected rendering error occurred.'),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Forma editor render failed.', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) return <RecoveryScreen error={this.state.error} retry={this.retry} />;
    return this.props.children;
  }
}
