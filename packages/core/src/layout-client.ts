import type { Diagram } from './document';
import type { Scene } from './scene';
import type { InspectionResult } from './inspect';

export class LayoutCancelledError extends Error {
  constructor() {
    super('Layout was cancelled.');
    this.name = 'LayoutCancelledError';
  }
}

export class LayoutTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Layout did not finish within ${timeoutMs} ms.`);
    this.name = 'LayoutTimeoutError';
  }
}

export interface LayoutRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export const DEFAULT_LAYOUT_TIMEOUT_MS = 60_000;

type WorkerReply = {
  id: number;
  scene?: Scene;
  inspection?: InspectionResult;
  error?: string;
};
type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
type WorkerFactory = () => WorkerLike;

/** Browser layout runner. Terminating the worker cancels ELK and any active routing work. */
export class LayoutClient {
  lastGoodScene?: Scene;
  lastGoodInspection?: InspectionResult;
  lastGoodInspectionFingerprint?: string;
  private active?: { worker: WorkerLike; cancel: (error: Error) => void };
  private worker?: WorkerLike;
  private nextId = 1;

  constructor(
    private readonly makeWorker: WorkerFactory = () =>
      new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }),
  ) {}

  layout(document: Diagram, options: LayoutRequestOptions = {}): Promise<Scene> {
    this.cancel();
    if (options.signal?.aborted) return Promise.reject(new LayoutCancelledError());
    if (!this.worker) {
      try {
        this.worker = this.makeWorker();
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const worker = this.worker;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs = options.timeoutMs ?? DEFAULT_LAYOUT_TIMEOUT_MS;
      const timeout = setTimeout(() => finish(new LayoutTimeoutError(timeoutMs)), timeoutMs);
      const clean = (destroy: boolean) => {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
        if (destroy) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate();
          if (this.worker === worker) this.worker = undefined;
        }
        if (this.active?.worker === worker) this.active = undefined;
      };
      const finish = (
        error?: Error,
        scene?: Scene,
        inspection?: InspectionResult,
        preserveWorker = false,
      ) => {
        if (settled) return;
        settled = true;
        clean(!preserveWorker);
        if (error) reject(error);
        else if (scene) {
          this.lastGoodScene = scene;
          if (inspection?.fingerprint === scene.fingerprint) {
            this.lastGoodInspection = inspection;
            this.lastGoodInspectionFingerprint = scene.fingerprint;
          } else {
            this.lastGoodInspection = undefined;
            this.lastGoodInspectionFingerprint = undefined;
          }
          resolve(scene);
        } else reject(new Error('Layout worker returned no scene.'));
      };
      const abort = () => finish(new LayoutCancelledError());
      this.active = { worker, cancel: (error) => finish(error) };
      options.signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ((event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.id !== id) return;
        if (reply.error) finish(new Error(reply.error));
        else finish(undefined, reply.scene, reply.inspection, true);
      }) as Worker['onmessage'];
      worker.onerror = (() => finish(new Error('Layout worker failed.'))) as Worker['onerror'];
      try {
        worker.postMessage({ id, document });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel() {
    this.active?.cancel(new LayoutCancelledError());
  }

  dispose() {
    this.active?.cancel(new LayoutCancelledError());
    this.worker?.terminate();
    this.worker = undefined;
  }
}
