import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createHostedServer } from '../packages/cli/src/hosted';
import {
  memoryBlobStore,
  createBlobLibrary,
  createVercelBlobStore,
  blobLibraryFor,
} from '../packages/cli/src/blob-store';
import type { IdentityProvider, LoginAttempt } from '../packages/cli/src/google';

test('blob library stores diagrams with revision conflicts', async () => {
  const store = memoryBlobStore();
  const library = await createBlobLibrary(store, 'users/alice/diagrams/', {
    bytes: 10_000,
    files: 10,
  });
  const saved = await library.save({
    path: 'team/one.forma.json',
    workspace: library.workspace,
    revision: null,
    document: { version: 2, title: 'One', nodes: [], edges: [] },
  });
  const listed = await library.list();
  assert.deepEqual(listed.folders, ['team']);
  assert.equal(listed.items[0]?.title, 'One');
  assert.equal(listed.items[0]?.revision, saved.revision);
  const read = await library.read(saved.path, library.workspace);
  assert.equal(read.revision, saved.revision);
  await assert.rejects(
    library.save({
      path: saved.path,
      workspace: library.workspace,
      revision: null,
      document: { version: 2, title: 'Two', nodes: [], edges: [] },
    }),
    /changed on disk/,
  );
});

test('independent blob libraries atomically resolve concurrent updates and creates', async () => {
  const store = memoryBlobStore();
  const left = await createBlobLibrary(store, 'users/alice/diagrams/');
  const right = await createBlobLibrary(store, 'users/alice/diagrams/');
  const initial = await left.save({
    path: 'shared.forma.json',
    workspace: left.workspace,
    revision: null,
    document: { version: 2, title: 'Initial', nodes: [], edges: [] },
  });
  const writes = await Promise.allSettled([
    left.save({
      path: initial.path,
      workspace: left.workspace,
      revision: initial.revision,
      document: { version: 2, title: 'Left', nodes: [], edges: [] },
    }),
    right.save({
      path: initial.path,
      workspace: right.workspace,
      revision: initial.revision,
      document: { version: 2, title: 'Right', nodes: [], edges: [] },
    }),
  ]);
  assert.equal(writes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(writes.filter((x) => x.status === 'rejected').length, 1);

  const created = await Promise.allSettled([
    left.save({
      path: 'new.forma.json',
      workspace: left.workspace,
      revision: null,
      document: { version: 2, title: 'A', nodes: [], edges: [] },
    }),
    right.save({
      path: 'new.forma.json',
      workspace: right.workspace,
      revision: null,
      document: { version: 2, title: 'B', nodes: [], edges: [] },
    }),
  ]);
  assert.equal(created.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(created.filter((x) => x.status === 'rejected').length, 1);
});

test('Vercel Blob adapter turns SDK precondition failures and old create collisions into CAS conflicts', async () => {
  class PreconditionFailed extends Error {}
  class NotFound extends Error {}
  let current: { text: string; etag: string } | null = null;
  let collisionThrowsGeneric = false;
  const sdk = {
    BlobNotFoundError: NotFound,
    BlobPreconditionFailedError: PreconditionFailed,
    async get() {
      if (!current) throw new NotFound();
      return {
        statusCode: 200,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(current!.text));
            controller.close();
          },
        }),
        blob: {
          size: Buffer.byteLength(current.text),
          uploadedAt: new Date(0),
          etag: current.etag,
        },
      };
    },
    async put(
      _path: string,
      text: string,
      options: { allowOverwrite?: boolean; ifMatch?: string },
    ) {
      if (options.ifMatch && current?.etag !== options.ifMatch) throw new PreconditionFailed();
      if (options.allowOverwrite === false && current) {
        if (collisionThrowsGeneric) throw new Error('BlobUnknownError: already exists');
        throw new PreconditionFailed();
      }
      current = { text, etag: `etag-${text}` };
      return { etag: current.etag };
    },
    async list() {
      return { blobs: [], hasMore: false };
    },
  } as unknown as Parameters<typeof createVercelBlobStore>[0];
  const store = await createVercelBlobStore(sdk);
  const created = await store.putIfMatch('state.json', 'one', null);
  assert.equal(created, 'etag-one');
  assert.equal(await store.putIfMatch('state.json', 'two', 'stale-etag'), null);
  collisionThrowsGeneric = true;
  assert.equal(await store.putIfMatch('state.json', 'two', null), null);
  assert.equal((await store.get('state.json'))?.text, 'one');
});

test('Blob namespace manifest atomically enforces cross-path quota and supports lifecycle revisions', async () => {
  const store = memoryBlobStore();
  const a = await createBlobLibrary(store, 'users/alice/diagrams/', { bytes: 100_000, files: 1 });
  const b = await createBlobLibrary(store, 'users/alice/diagrams/', { bytes: 100_000, files: 1 });
  const writes = await Promise.allSettled([
    a.save({
      path: 'a.forma.json',
      document: { version: 2, title: 'A', nodes: [], edges: [] },
      revision: null,
      workspace: a.workspace,
    }),
    b.save({
      path: 'b.forma.json',
      document: { version: 2, title: 'B', nodes: [], edges: [] },
      revision: null,
      workspace: b.workspace,
    }),
  ]);
  assert.equal(writes.filter((value) => value.status === 'fulfilled').length, 1);
  const failure = writes.find(
    (value): value is PromiseRejectedResult => value.status === 'rejected',
  );
  assert.equal((failure?.reason as { status?: number }).status, 413);
  const library = await createBlobLibrary(store, 'users/alice/diagrams/', {
    bytes: 100_000,
    files: 5,
  });
  const source = (await library.list()).items[0]!;
  const sourceRevision = (await library.read(source.path, library.workspace)).revision;
  const duplicate = await library.duplicate({
    from: source.path,
    to: 'copy.forma.json',
    revision: sourceRevision,
    workspace: library.workspace,
  });
  const deleted = await library.trash({
    path: source.path,
    revision: sourceRevision,
    workspace: library.workspace,
  });
  assert.equal((await library.list()).trash[0]?.trashId, deleted.trashId);
  await assert.rejects(
    library.restore({
      trashId: deleted.trashId,
      revision: deleted.revision,
      to: duplicate.path,
      workspace: library.workspace,
    }),
    /already exists/,
  );
  const restored = await library.restore({
    trashId: deleted.trashId,
    revision: deleted.revision,
    workspace: library.workspace,
  });
  const renamed = await library.rename({
    from: restored.path,
    to: 'renamed.forma.json',
    revision: restored.revision,
    workspace: library.workspace,
  });
  assert.equal((await library.read(renamed.path, library.workspace)).revision, renamed.revision);
  assert.equal((await library.list()).items.length, 2);
});

test('Blob manifest migrates legacy files immutably and fails closed on corrupt metadata', async () => {
  const document = JSON.stringify({ version: 2, title: 'Legacy', nodes: [], edges: [] }) + '\n';
  const store = memoryBlobStore(new Map([['users/alice/diagrams/legacy.forma.json', document]]));
  const library = await createBlobLibrary(store, 'users/alice/diagrams/');
  const before = await library.read('legacy.forma.json', library.workspace);
  await store.put(
    'users/alice/diagrams/legacy.forma.json',
    JSON.stringify({ version: 2, title: 'Overwritten', nodes: [], edges: [] }),
  );
  assert.equal(
    (await library.read('legacy.forma.json', library.workspace)).revision,
    before.revision,
  );
  await store.put('users/broken/diagrams/.forma-library.json', '{');
  const broken = await createBlobLibrary(store, 'users/broken/diagrams/');
  await assert.rejects(broken.list(), /metadata is corrupt/);
  await assert.rejects(library.read('.forma-library.json', library.workspace), /relative path/);
  const brokenUsers = memoryBlobStore(new Map([['users/.forma-users.json', '{}']]));
  await assert.rejects(
    blobLibraryFor(
      brokenUsers,
      { sub: 'alice', email: 'alice@example.test', email_verified: true },
      { bytes: 1000, files: 2 },
      5,
    ),
    /user metadata is corrupt/,
  );
});

test('Blob manifest rejects duplicate trash IDs and missing immutable versions fail closed', async () => {
  const store = memoryBlobStore();
  const prefix = 'users/unsafe/diagrams/';
  const entry = {
    blob: `${prefix}.versions/missing.json`,
    revision: 'a'.repeat(64),
    bytes: 1,
    title: 'Gone',
    modified: new Date(0).toISOString(),
  };
  await store.put(
    `${prefix}.forma-library.json`,
    JSON.stringify({
      version: 1,
      generation: 1,
      entries: {},
      trash: [
        {
          ...entry,
          trashId: '00000000-0000-0000-0000-000000000001',
          path: 'gone.forma.json',
          deletedAt: new Date(0).toISOString(),
        },
        {
          ...entry,
          trashId: '00000000-0000-0000-0000-000000000001',
          path: 'gone-again.forma.json',
          deletedAt: new Date(0).toISOString(),
        },
      ],
    }),
  );
  const duplicateTrash = await createBlobLibrary(store, prefix);
  await assert.rejects(duplicateTrash.list(), /metadata is corrupt/);
  await store.put(
    `${prefix}.forma-library.json`,
    JSON.stringify({ version: 1, generation: 1, entries: { 'gone.forma.json': entry }, trash: [] }),
  );
  await assert.rejects(
    duplicateTrash.read('gone.forma.json', duplicateTrash.workspace),
    /missing or corrupt/,
  );
});

test('concurrent Blob user registration respects maxUsers across separate library instances', async () => {
  const store = memoryBlobStore();
  const identities = ['alice', 'bob'].map((sub) => ({
    sub,
    email: `${sub}@example.test`,
    email_verified: true as const,
  }));
  const result = await Promise.allSettled(
    identities.map((identity) => blobLibraryFor(store, identity, { bytes: 1000, files: 2 }, 1)),
  );
  assert.equal(result.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(result.filter((value) => value.status === 'rejected').length, 1);
});

test('signed cookies and blob storage authenticate a hosted library', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-blob-host-')),
    assets = join(temp, 'assets');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<html><head></head><body>Forma</body></html>');
  const attempts = new Map<string, LoginAttempt>();
  const provider: IdentityProvider = {
    authorize(attempt) {
      attempts.set(attempt.state, attempt);
      return `https://accounts.example/authorize?state=${attempt.state}`;
    },
    async exchange(code, attempt) {
      return {
        sub: code,
        email: `${code}@example.com`,
        email_verified: true,
        name: code,
        nonce: attempt.nonce,
      };
    },
  };
  const server = await createHostedServer({
    assets,
    port: 0,
    publicUrl: 'http://127.0.0.1:0',
    allowedEmails: ['alice@example.com'],
    provider,
    sessionSecret: 'test-session-secret-test-session-secret',
    blobStore: memoryBlobStore(),
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookieFrom = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const request = (path: string, cookie = '', data?: unknown) =>
    fetch(base + path, {
      redirect: 'manual',
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        ...(data === undefined
          ? {}
          : { Origin: base, 'X-Forma-Request': '1', 'Content-Type': 'application/json' }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  try {
    const start = await request('/auth/login');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const logged = await request(`/auth/callback?state=${state}&code=alice`, cookieFrom(start));
    const cookie = cookieFrom(logged);
    assert.equal(logged.headers.get('location'), '/');
    const session = await (await request('/api/session', cookie)).json();
    assert.equal(session.user.email, 'alice@example.com');
    assert.equal(session.user.ownerHash, createHash('sha256').update('google:alice').digest('hex'));
    const library = await (await request('/api/library', cookie)).json();
    const saved = await request('/api/document', cookie, {
      path: 'notes.forma.json',
      revision: null,
      workspace: library.workspace,
      document: { version: 2, title: 'Notes', nodes: [], edges: [] },
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const savedData = await saved.json();
    const duplicate = await request('/api/library/duplicate', cookie, {
      from: savedData.path,
      to: 'copy.forma.json',
      revision: savedData.revision,
      workspace: library.workspace,
    });
    assert.equal(duplicate.status, 200, await duplicate.clone().text());
    const duplicateData = await duplicate.json();
    const trashed = await request('/api/library/trash', cookie, {
      path: savedData.path,
      revision: savedData.revision,
      workspace: library.workspace,
    });
    assert.equal(trashed.status, 200, await trashed.clone().text());
    const trashData = await trashed.json();
    const restored = await request('/api/library/restore', cookie, {
      trashId: trashData.trashId,
      revision: trashData.revision,
      workspace: library.workspace,
    });
    assert.equal(restored.status, 200, await restored.clone().text());
    const restoredData = await restored.json();
    const renamed = await request('/api/library/rename', cookie, {
      from: restoredData.path,
      to: 'renamed.forma.json',
      revision: restoredData.revision,
      workspace: library.workspace,
    });
    assert.equal(renamed.status, 200, await renamed.clone().text());
    const listed = await (await request('/api/library', cookie)).json();
    assert.equal(listed.items[0]?.title, 'Notes');
    assert.ok(listed.items.some((item: { path: string }) => item.path === 'renamed.forma.json'));
    assert.equal(listed.trash.length, 0);
    const logout = await request('/api/logout', cookie, {});
    assert.equal((await request('/api/library', cookieFrom(logout))).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});
