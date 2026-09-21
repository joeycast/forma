import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHostedServer } from '../packages/cli/src/hosted';
import {
  googleProvider,
  type IdentityProvider,
  type LoginAttempt,
} from '../packages/cli/src/google';
const diagram = { version: 2, title: 'Private architecture', nodes: [], edges: [] };
test('Google authorization uses identity scopes, PKCE, state and nonce', () => {
  const provider = googleProvider(
    'test-client',
    'test-secret',
    'https://diagrams.example/auth/callback',
  );
  const url = new URL(
    provider.authorize({
      state: 'state',
      nonce: 'nonce',
      challenge: 'challenge',
      verifier: 'verifier',
    }),
  );
  assert.equal(url.origin, 'https://accounts.google.com');
  for (const [key, value] of Object.entries({
    state: 'state',
    nonce: 'nonce',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    redirect_uri: 'https://diagrams.example/auth/callback',
    response_type: 'code',
    access_type: 'online',
  }))
    assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.has('client_secret'), false);
});
test('hosted libraries: authentication, state binding, isolation, quotas, conflicts, logout and expiry', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-hosted-')),
    assets = join(temp, 'assets'),
    directory = join(temp, 'data');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<html><head></head><body>Forma</body></html>');
  let clock = Date.now(),
    exchangeCount = 0;
  const attempts = new Map<string, LoginAttempt>();
  const provider: IdentityProvider = {
    authorize(attempt) {
      attempts.set(attempt.state, attempt);
      return `https://accounts.example/authorize?state=${attempt.state}`;
    },
    async exchange(code, attempt) {
      exchangeCount++;
      if (code === 'invalid') throw new Error('Bad signature');
      return {
        sub: code,
        email: code === 'other' ? 'someone@unapproved.test' : `${code}@example.com`,
        email_verified: code !== 'unverified',
        hd: code === 'domain' ? 'company.test' : undefined,
        name: code,
        nonce: code === 'replay' ? 'wrong' : attempt.nonce,
      };
    },
  };
  const server = await createHostedServer({
    directory,
    assets,
    port: 0,
    publicUrl: 'http://127.0.0.1:0',
    allowedEmails: [
      'alice@example.com',
      'bob@example.com',
      'unverified@example.com',
      'replay@example.com',
    ],
    allowedDomains: ['company.test'],
    provider,
    now: () => clock,
    sessionMs: 60_000,
    maxFiles: 1,
    maxBytes: 10_000,
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookieFrom = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const request = (path: string, cookie = '', data?: unknown, extra: Record<string, string> = {}) =>
    fetch(base + path, {
      redirect: 'manual',
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        ...(data === undefined
          ? {}
          : { Origin: base, 'X-Forma-Request': '1', 'Content-Type': 'application/json' }),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const start = async () => {
    const res = await request('/auth/login');
    return {
      cookie: cookieFrom(res),
      state: new URL(res.headers.get('location')!).searchParams.get('state')!,
    };
  };
  const login = async (code: string) => {
    const flow = await start();
    const res = await request(`/auth/callback?state=${flow.state}&code=${code}`, flow.cookie);
    return { res, cookie: cookieFrom(res), flow };
  };
  try {
    const page = await request('/');
    assert.match(await page.text(), /forma-hosted/);
    assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal((await request('/api/library')).status, 401);
    assert.equal(
      (await request('/api/document', '', { path: 'x.forma.json', document: diagram })).status,
      401,
    );
    assert.equal((await (await request('/api/session')).json()).user, null);
    const unbound = await start();
    assert.match(
      (await request(`/auth/callback?state=${unbound.state}&code=alice`)).headers.get('location')!,
      /expired/,
    );
    assert.equal(exchangeCount, 0);
    for (const code of ['other', 'unverified', 'replay', 'invalid']) {
      const { res } = await login(code);
      assert.match(res.headers.get('location')!, /authError=/);
      assert.doesNotMatch(cookieFrom(res), /forma-session=/);
    }
    const domain = await login('domain');
    assert.equal(domain.res.headers.get('location'), '/');
    const alice = await login('alice'),
      bob = await login('bob');
    assert.equal(alice.res.headers.get('location'), '/');
    assert.match(alice.res.headers.getSetCookie().join(' '), /HttpOnly; SameSite=Lax/);
    assert.match(
      (
        await request(`/auth/callback?state=${alice.flow.state}&code=alice`, alice.flow.cookie)
      ).headers.get('location')!,
      /expired/,
    );
    const al = await (await request('/api/library', alice.cookie)).json(),
      bl = await (await request('/api/library', bob.cookie)).json();
    assert.equal(al.mode, 'hosted');
    assert.equal(al.directory, 'Your private library');
    assert.notEqual(al.workspace, bl.workspace);
    assert.equal(JSON.stringify(al).includes(temp), false);
    const payload = {
      path: 'team/system.forma.json',
      revision: null,
      workspace: al.workspace,
      document: diagram,
    };
    const saved = await request('/api/document', alice.cookie, payload);
    assert.equal(saved.status, 200);
    const revision = (await saved.json()).revision;
    assert.equal((await (await request('/api/library', bob.cookie)).json()).items.length, 0);
    assert.equal(
      (
        await request(
          `/api/document?path=team/system.forma.json&workspace=${al.workspace}`,
          bob.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          `/api/document?path=team/system.forma.json&workspace=${bl.workspace}`,
          bob.cookie,
        )
      ).status,
      404,
    );
    assert.equal((await request('/api/document', bob.cookie, payload)).status, 409);
    assert.equal(
      (
        await request('/api/document', alice.cookie, {
          ...payload,
          document: { ...diagram, title: 'Stale' },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/api/document', alice.cookie, {
          ...payload,
          revision,
          document: { ...diagram, title: 'Human update' },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/document', alice.cookie, { ...payload, path: 'another.forma.json' }))
        .status,
      413,
    );
    assert.equal(
      (
        await request('/api/document', bob.cookie, {
          ...payload,
          workspace: bl.workspace,
          path: '../escape.forma.json',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/document', bob.cookie, {
          ...payload,
          workspace: bl.workspace,
          document: { nonsense: true },
        })
      ).status,
      400,
    );
    assert.equal((await request('/api/library', alice.cookie, { directory: '/tmp' })).status, 405);
    assert.equal(
      (await request('/api/document', alice.cookie, payload, { Origin: 'https://attacker.test' }))
        .status,
      403,
    );
    assert.equal(
      (await request('/api/document', alice.cookie, payload, { 'X-Forma-Request': '' })).status,
      405,
    );
    const roots = await readdir(join(directory, 'users'));
    assert.equal(roots.length, 3);
    assert.ok(roots.every((r) => /^[a-f0-9]{64}$/.test(r)));
    const owner = await Promise.all(
      roots.map(async (id) => ({
        id,
        identity: JSON.parse(await readFile(join(directory, 'users', id, 'identity.json'), 'utf8')),
      })),
    );
    const aliceRoot = owner.find((x) => x.identity.subject === 'alice')!.id;
    assert.equal(
      JSON.parse(
        await readFile(
          join(directory, 'users', aliceRoot, 'diagrams/team/system.forma.json'),
          'utf8',
        ),
      ).title,
      'Human update',
    );
    // Files remain portable and server-side agent edits participate in revision checks.
    await writeFile(
      join(directory, 'users', aliceRoot, 'diagrams/team/system.forma.json'),
      JSON.stringify({ ...diagram, title: 'Agent continuation' }),
    );
    assert.equal(
      (
        await (
          await request(
            `/api/document?path=team/system.forma.json&workspace=${al.workspace}`,
            alice.cookie,
          )
        ).json()
      ).document.title,
      'Agent continuation',
    );
    assert.equal((await request('/api/logout', alice.cookie, {})).status, 200);
    assert.equal((await request('/api/library', alice.cookie)).status, 401);
    assert.equal((await request('/api/library', bob.cookie)).status, 200);
    clock += 61_000;
    assert.equal((await request('/api/library', bob.cookie)).status, 401);
    const old = await start();
    clock += 601_000;
    assert.match(
      (await request(`/auth/callback?state=${old.state}&code=alice`, old.cookie)).headers.get(
        'location',
      )!,
      /expired/,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});
test('hosted configuration fails closed', async () => {
  const common = {
    directory: '/tmp/unused-forma',
    assets: '/tmp',
    clientId: 'x',
    clientSecret: 'y',
  };
  await assert.rejects(
    createHostedServer({
      ...common,
      publicUrl: 'http://public.example',
      allowedEmails: ['a@example.com'],
    }),
    /HTTPS/,
  );
  await assert.rejects(
    createHostedServer({ ...common, publicUrl: 'https://public.example' }),
    /at least one/,
  );
  await assert.rejects(
    createHostedServer({
      ...common,
      publicUrl: 'https://public.example/path',
      allowedEmails: ['a@example.com'],
    }),
    /origin/,
  );
});

test('production cookies are secure and only canonical same-origin requests can mutate', async () => {
  const { request: httpRequest } = await import('node:http');
  const temp = await mkdtemp(join(tmpdir(), 'forma-secure-')),
    assets = join(temp, 'assets');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<head></head>');
  const options = {
    directory: join(temp, 'data'),
    assets,
    port: 0,
    publicUrl: 'https://forma.example',
    allowedEmails: ['alice@example.com'],
    provider: {
      authorize: (a: LoginAttempt) => `https://accounts.example/?state=${a.state}`,
      exchange: async (_code: string, a: LoginAttempt) => ({
        sub: 'alice',
        email: 'alice@example.com',
        email_verified: true,
        nonce: a.nonce,
      }),
    },
  };
  const server = await createHostedServer(options),
    port = (server.address() as { port: number }).port;
  const req = (path: string, headers: Record<string, string> = {}, body?: string) =>
    new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>(
      (resolve, reject) => {
        const r = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path,
            method: body === undefined ? 'GET' : 'POST',
            headers: { Host: 'forma.example', ...headers },
          },
          (res) => {
            let text = '';
            res.on('data', (c) => (text += c));
            res.on('end', () =>
              resolve({ status: res.statusCode!, headers: res.headers, body: text }),
            );
          },
        );
        r.on('error', reject);
        r.end(body);
      },
    );
  try {
    await assert.rejects(createHostedServer(options), /already locked/);
    assert.equal((await req('/api/session', { Host: 'attacker.example' })).status, 403);
    const login = await req('/auth/login'),
      state = new URL(login.headers.location!).searchParams.get('state')!;
    assert.match(
      login.headers['set-cookie']![0],
      /__Host-forma-state=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure/,
    );
    const callback = await req(`/auth/callback?state=${state}&code=alice`, {
      Cookie: login.headers['set-cookie']![0].split(';')[0],
    });
    const session = callback.headers['set-cookie']!.find((c) =>
      c.startsWith('__Host-forma-session='),
    )!;
    assert.match(session, /; Secure/);
    assert.doesNotMatch(session, /Domain=/);
    const cookie = session.split(';')[0];
    assert.equal(
      (
        await req(
          '/api/logout',
          { Cookie: cookie, 'X-Forma-Request': '1', 'Content-Type': 'application/json' },
          '{}',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          '/api/logout',
          {
            Cookie: cookie,
            Origin: 'https://forma.example',
            'X-Forma-Request': '1',
            'Content-Type': 'application/json',
          },
          '{}',
        )
      ).status,
      200,
    );
    assert.equal((await req('/api/library', { Cookie: cookie })).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});

test('file adapter checks byte quotas before creating directories and serializes conflicting writes', async () => {
  const { createFileLibrary } = await import('../packages/cli/src/file-library');
  const directory = await mkdtemp(join(tmpdir(), 'forma-quota-'));
  try {
    const tiny = await createFileLibrary(directory, { bytes: 1, files: 10 });
    await assert.rejects(
      tiny.save({
        path: 'new/folder/diagram.forma.json',
        workspace: tiny.workspace,
        document: diagram,
        revision: null,
      }),
      /quota/,
    );
    assert.deepEqual(await readdir(directory), []);
    const library = await createFileLibrary(directory, { bytes: 10000, files: 10 });
    const saved = await library.save({
      path: 'one.forma.json',
      workspace: library.workspace,
      document: diagram,
      revision: null,
    });
    const results = await Promise.allSettled(
      ['First edit', 'Second edit'].map((title) =>
        library.save({
          path: saved.path,
          workspace: library.workspace,
          revision: saved.revision,
          document: { ...diagram, title },
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
