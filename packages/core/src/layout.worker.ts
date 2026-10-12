import { layoutDiagram } from './layout';
import { inspectScene } from './inspect';
import type { InspectionResult } from './inspect';
import type { Diagram } from './document';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

type Request = { id: number; document: Diagram };
type Reply =
  | {
      id: number;
      scene: Awaited<ReturnType<typeof layoutDiagram>>;
      inspection: InspectionResult;
    }
  | { id: number; error: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply): void;
};
let elk: InstanceType<typeof ELK> | undefined;

worker.onmessage = async ({ data }) => {
  try {
    const scene = await layoutDiagram(data.document, async () => {
      // Keep ELK's nested routing worker alive with this reusable layout
      // worker. Disposing the outer worker on cancel/timeout also disposes
      // this child, so cancellation remains a hard stop.
      return (elk ??= new ELK({
        workerUrl: elkWorkerUrl,
        workerFactory: (url) => new Worker(url!),
      }));
    });
    worker.postMessage({
      id: data.id,
      scene,
      inspection: inspectScene(scene),
    });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
