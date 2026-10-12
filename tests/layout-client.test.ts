import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LayoutCancelledError,
  LayoutClient,
  LayoutTimeoutError,
} from '../packages/core/src/layout-client';
import type { Diagram } from '../packages/core/src/document';
import { parseDocument } from '../packages/core/src/document';
import type { Scene } from '../packages/core/src/scene';
import type { InspectionResult } from '../packages/core/src/inspect';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  postedId = 0;
  postMessage(message: { id: number }) {
    this.postedId = message.id;
  }
  terminate() {
    this.terminated = true;
  }
  fail() {
    this.onerror?.({} as ErrorEvent);
  }
  reply(scene: Scene, inspection?: InspectionResult) {
    this.onmessage?.({ data: { id: this.postedId, scene, inspection } } as MessageEvent);
  }
}

const document: Diagram = parseDocument({ version: 2, title: 'empty', nodes: [], edges: [] });
const scene = { fingerprint: 'last-good' } as Scene;
const inspection = (fingerprint: string): InspectionResult => ({
  fingerprint,
  issues: [],
  summary: { errors: 0, warnings: 0, nodes: 0, edges: 0, crossings: 0, pinned: 0, density: 0 },
});

test('layout worker jobs cancel on replacement and only successful jobs replace last-good scene', async () => {
  const workers: FakeWorker[] = [];
  const client = new LayoutClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const first = client.layout(document);
  const rejected = assert.rejects(first, LayoutCancelledError);
  const second = client.layout(document);
  workers[1].reply(scene, inspection(scene.fingerprint));
  assert.equal(await second, scene);
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(client.lastGoodScene, scene);
  assert.equal(client.lastGoodInspection?.fingerprint, scene.fingerprint);
  assert.equal(client.lastGoodInspectionFingerprint, scene.fingerprint);
  assert.equal(workers[1].terminated, false);
  const third = client.layout(document);
  assert.equal(workers.length, 2);
  workers[1].reply(scene, inspection(scene.fingerprint));
  await third;
  client.cancel();
  assert.equal(workers[1].terminated, false);
  client.dispose();
  assert.equal(workers[1].terminated, true);
  assert.equal(client.lastGoodScene, scene);
});

test('layout client publishes only matching scene inspection and preserves it through cancellation', async () => {
  const workers: FakeWorker[] = [];
  const client = new LayoutClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const goodScene = { fingerprint: 'good' } as Scene;
  const goodInspection = inspection('good');
  const first = client.layout(document);
  workers[0].reply(goodScene, goodInspection);
  assert.equal(await first, goodScene);
  assert.equal(client.lastGoodInspection, goodInspection);
  assert.equal(client.lastGoodInspectionFingerprint, goodScene.fingerprint);

  const pending = client.layout(document);
  const cancelled = assert.rejects(pending, LayoutCancelledError);
  client.cancel();
  await cancelled;
  assert.equal(client.lastGoodScene, goodScene);
  assert.equal(client.lastGoodInspection, goodInspection);
  assert.equal(client.lastGoodInspectionFingerprint, goodScene.fingerprint);

  const mismatched = client.layout(document);
  const newScene = { fingerprint: 'new' } as Scene;
  workers[1].reply(newScene, goodInspection);
  assert.equal(await mismatched, newScene);
  assert.equal(client.lastGoodInspection, undefined);
  assert.equal(client.lastGoodInspectionFingerprint, undefined);
});

test('layout client abort and timeout terminate their worker and preserve last-good', async () => {
  const workers: FakeWorker[] = [];
  const client = new LayoutClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  client.lastGoodScene = scene;
  client.lastGoodInspection = inspection(scene.fingerprint);
  client.lastGoodInspectionFingerprint = scene.fingerprint;
  const aborter = new AbortController();
  const aborted = client.layout(document, { signal: aborter.signal });
  aborter.abort();
  await assert.rejects(aborted, LayoutCancelledError);
  assert.equal(workers[0].terminated, true);
  await assert.rejects(client.layout(document, { timeoutMs: 5 }), LayoutTimeoutError);
  assert.equal(workers[1].terminated, true);
  assert.equal(client.lastGoodScene, scene);
  assert.equal(client.lastGoodInspection?.fingerprint, scene.fingerprint);
  assert.equal(client.lastGoodInspectionFingerprint, scene.fingerprint);
  const failed = client.layout(document);
  const rejected = assert.rejects(failed, /Layout worker failed/);
  workers[2].fail();
  await rejected;
  assert.equal(workers[2].terminated, true);
  assert.equal(client.lastGoodScene, scene);
  assert.equal(client.lastGoodInspection?.fingerprint, scene.fingerprint);
  assert.equal(client.lastGoodInspectionFingerprint, scene.fingerprint);
});
