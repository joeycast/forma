import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHostedServer } from '../packages/cli/src/hosted';
import { memoryBlobStore, createBlobLibrary } from '../packages/cli/src/blob-store';
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
    const library = await (await request('/api/library', cookie)).json();
    const saved = await request('/api/document', cookie, {
      path: 'notes.forma.json',
      revision: null,
      workspace: library.workspace,
      document: { version: 2, title: 'Notes', nodes: [], edges: [] },
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const listed = await (await request('/api/library', cookie)).json();
    assert.equal(listed.items[0]?.title, 'Notes');
    const logout = await request('/api/logout', cookie, {});
    assert.equal((await request('/api/library', cookieFrom(logout))).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});
