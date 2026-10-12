import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atelier } from '../packages/core/src/index';
import { fileSystemLibrary, blobSystemLibrary } from '../packages/cli/src/system-library';
import { memoryBlobStore } from '../packages/cli/src/blob-store';

test('design system snapshots are immutable, canonical, revision checked, and independently readable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-systems-'));
  try {
    const left = await fileSystemLibrary(directory),
      right = await fileSystemLibrary(directory);
    assert.deepEqual(await left.list(), { systems: [], storageRevision: null });
    const [first, second] = await Promise.allSettled([
      left.save(atelier, null),
      right.save({ ...atelier, canvas: { ...atelier.canvas } }, null),
    ]);
    assert.equal([first, second].filter((item) => item.status === 'fulfilled').length, 2);
    const listing = await left.list();
    assert.equal(listing.systems.length, 1);
    assert.equal((await right.get(atelier.id, atelier.revision)).system.id, atelier.id);
    // Canonical key ordering makes semantically identical saves idempotent.
    const idempotent = await left.save(
      { ...atelier, node: { ...atelier.node, opacity: undefined } },
      'stale-but-immutable-create-retry',
    );
    assert.equal(idempotent.storageRevision, listing.storageRevision);
    assert.equal((await left.list()).storageRevision, listing.storageRevision);
    await assert.rejects(left.save({ ...atelier, name: 'Changed' }, listing.storageRevision), {
      status: 409,
    });
    await assert.rejects(left.save({ ...atelier, revision: '1.0.1' }, null), { status: 409 });
    const removed = await left.remove(atelier.id, atelier.revision, listing.storageRevision!);
    assert.equal(removed.storageRevision, null);
    assert.deepEqual((await right.list()).systems, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Blob design system manifests use CAS across independent handles and enforce snapshot limits', async () => {
  const store = memoryBlobStore(),
    left = blobSystemLibrary(store, 'a'.repeat(64)),
    right = blobSystemLibrary(store, 'a'.repeat(64));
  const other = blobSystemLibrary(store, 'b'.repeat(64));
  const [a, b] = await Promise.allSettled([left.save(atelier, null), right.save(atelier, null)]);
  assert.equal([a, b].filter((item) => item.status === 'fulfilled').length, 2);
  assert.equal((await right.list()).systems.length, 1);
  assert.deepEqual((await other.list()).systems, []);
  const current = await left.list();
  const saved = await left.save({ ...atelier, revision: '2.0.0' }, current.storageRevision);
  await assert.rejects(left.save({ ...atelier, revision: '3.0.0' }, current.storageRevision), {
    status: 409,
  });
  assert.equal((await left.list()).systems.length, 2);
  assert.notEqual(saved.storageRevision, current.storageRevision);
  const tiny = blobSystemLibrary(store, 'c'.repeat(64), { snapshots: 1, bytes: 10 * 1024 * 1024 });
  const first = await tiny.save(atelier, null);
  await assert.rejects(tiny.save({ ...atelier, revision: 'next' }, first.storageRevision), {
    status: 413,
  });
});
