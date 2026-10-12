import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileLibrary } from '../packages/cli/src/file-library';
import { createLocalServer } from '../packages/cli/src/server';

const document = (title: string) => ({ version: 2, title, nodes: [], edges: [] });

test('local library lifecycle preserves revisions, trash retention, and occupied-path conflicts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-library-life-'));
  try {
    const library = await createFileLibrary(directory, { bytes: 10_000, files: 10 });
    const saved = await library.save({
      path: 'team/a.forma.json',
      document: document('A'),
      revision: null,
      workspace: library.workspace,
    });
    const duplicate = await library.duplicate({
      from: saved.path,
      to: 'team/b.forma.json',
      revision: saved.revision,
      workspace: library.workspace,
    });
    assert.equal(duplicate.revision, saved.revision);
    assert.equal(
      (await library.list()).items.find((item) => item.path === saved.path)?.revision,
      saved.revision,
    );
    const trashed = await library.trash({
      path: saved.path,
      revision: saved.revision,
      workspace: library.workspace,
    });
    assert.equal((await library.list()).trash[0]?.trashId, trashed.trashId);
    await assert.rejects(
      library.restore({
        trashId: trashed.trashId,
        revision: trashed.revision,
        to: duplicate.path,
        workspace: library.workspace,
      }),
      /already exists/,
    );
    const restored = await library.restore({
      trashId: trashed.trashId,
      revision: trashed.revision,
      workspace: library.workspace,
    });
    const renamed = await library.rename({
      from: restored.path,
      to: 'renamed.forma.json',
      revision: restored.revision,
      workspace: library.workspace,
    });
    assert.equal((await library.read(renamed.path, library.workspace)).revision, saved.revision);
    await assert.rejects(
      library.rename({
        from: renamed.path,
        to: duplicate.path,
        revision: renamed.revision,
        workspace: library.workspace,
      }),
      /already exists/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('local quota counts retained trash and restore keeps trash IDs distinct', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-library-trash-'));
  try {
    const library = await createFileLibrary(directory, { bytes: 10_000, files: 1 });
    const saved = await library.save({
      path: 'a.forma.json',
      document: document('A'),
      revision: null,
      workspace: library.workspace,
    });
    const trashed = await library.trash({
      path: saved.path,
      revision: saved.revision,
      workspace: library.workspace,
    });
    await assert.rejects(
      library.save({
        path: 'b.forma.json',
        document: document('B'),
        revision: null,
        workspace: library.workspace,
      }),
      /quota is full/,
    );
    const restored = await library.restore({
      trashId: trashed.trashId,
      revision: trashed.revision,
      workspace: library.workspace,
    });
    assert.equal(restored.path, saved.path);
    assert.equal((await library.list()).trash.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('independent filesystem library handles share a workspace lock for revisions and aggregate quotas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-library-cas-'));
  try {
    const left = await createFileLibrary(directory, { bytes: 100_000, files: 2 });
    const right = await createFileLibrary(directory, { bytes: 100_000, files: 2 });
    assert.equal(left.workspace, right.workspace);
    const initial = await left.save({
      path: 'shared.forma.json',
      document: document('Initial'),
      revision: null,
      workspace: left.workspace,
    });
    const updates = await Promise.allSettled([
      left.save({
        path: initial.path,
        document: document('Left'),
        revision: initial.revision,
        workspace: left.workspace,
      }),
      right.save({
        path: initial.path,
        document: document('Right'),
        revision: initial.revision,
        workspace: right.workspace,
      }),
    ]);
    assert.equal(updates.filter((value) => value.status === 'fulfilled').length, 1);
    assert.equal(updates.filter((value) => value.status === 'rejected').length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const quotaDirectory = await mkdtemp(join(tmpdir(), 'forma-library-quota-cas-'));
  try {
    const left = await createFileLibrary(quotaDirectory, { bytes: 100_000, files: 1 });
    const right = await createFileLibrary(quotaDirectory, { bytes: 100_000, files: 1 });
    const results = await Promise.allSettled([
      left.save({
        path: 'one.forma.json',
        document: document('One'),
        revision: null,
        workspace: left.workspace,
      }),
      right.save({
        path: 'two.forma.json',
        document: document('Two'),
        revision: null,
        workspace: right.workspace,
      }),
    ]);
    assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
    const rejected = results.find(
      (value): value is PromiseRejectedResult => value.status === 'rejected',
    );
    assert.equal((rejected?.reason as { status?: number }).status, 413);
  } finally {
    await rm(quotaDirectory, { recursive: true, force: true });
  }
});

test('local loopback lifecycle routes require the custom request header and expose revisioned trash', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-local-api-'));
  const directory = join(temp, 'data'),
    assets = join(temp, 'assets');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<head></head>');
  const server = await createLocalServer({ directory, assets, port: 0 });
  const address = server.address() as { port: number },
    base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, data?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        ...(data === undefined
          ? {}
          : { 'Content-Type': 'application/json', 'X-Forma-Request': '1', Origin: base }),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  try {
    const library = await (await request('/api/library')).json();
    const savedResponse = await request('/api/document', {
      path: 'a.forma.json',
      document: document('A'),
      revision: null,
      workspace: library.workspace,
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal((await (await request('/api/library')).json()).items[0].revision, saved.revision);
    const noHeader = await request(
      '/api/library/trash',
      { path: saved.path, revision: saved.revision, workspace: library.workspace },
      { 'X-Forma-Request': '' },
    );
    assert.equal(noHeader.status, 405);
    const trashedResponse = await request('/api/library/trash', {
      path: saved.path,
      revision: saved.revision,
      workspace: library.workspace,
    });
    assert.equal(trashedResponse.status, 200);
    const trashed = await trashedResponse.json();
    const listed = await (await request('/api/library')).json();
    assert.equal(listed.trash[0].trashId, trashed.trashId);
    const restored = await request('/api/library/restore', {
      trashId: trashed.trashId,
      revision: trashed.revision,
      workspace: library.workspace,
    });
    assert.equal(restored.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
});

test('filesystem mutation lock is never removed automatically after timeout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forma-library-lock-'));
  const lockPath = join(directory, '.forma-library-mutation.lock');
  try {
    const library = await createFileLibrary(directory);
    await writeFile(lockPath, 'other writer');
    await assert.rejects(
      library.save({
        path: 'a.forma.json',
        document: document('A'),
        revision: null,
        workspace: library.workspace,
      }),
      /Verify all Forma writers using this directory are stopped/,
    );
    assert.equal(await readFile(lockPath, 'utf8'), 'other writer');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
