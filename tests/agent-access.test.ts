import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHostedServer } from '../packages/cli/src/hosted';
import { createTokenStore } from '../packages/cli/src/agent-access';
import { remoteOrigin } from '../packages/cli/src/remote';
const run = promisify(execFile),
  cli = resolve('packages/cli/bin.mjs');
const doc = {
  version: 2,
  title: 'Agent architecture',
  nodes: [{ id: 'service', label: 'API', kind: 'service' }],
  edges: [],
  presentation: {
    nodes: {
      service: { position: { x: 160, y: 180 }, style: { fill: '#fff2b3', dash: 'dashed' } },
    },
  },
};
test('agent REST, CLI, and HTTP/stdio MCP share ownership, scopes, revocation and conflicts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-agent-')),
    assets = join(temp, 'assets'),
    directory = join(temp, 'data');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<head></head>');
  const server = await createHostedServer({
    directory,
    assets,
    publicUrl: 'http://127.0.0.1:0',
    port: 0,
    enableMcp: true,
    allowedEmails: ['alice@example.test', 'bob@example.test'],
    provider: {
      authorize: (a) => `https://example.test/?state=${a.state}`,
      exchange: async (code, a) => ({
        sub: code,
        email: `${code}@example.test`,
        email_verified: true,
        nonce: a.nonce,
      }),
    },
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, headers: Record<string, string> = {}, data?: unknown) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        ...(data === undefined
          ? {}
          : { Origin: base, 'Content-Type': 'application/json', 'X-Forma-Request': '1' }),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      redirect: 'manual',
    });
  const cookie = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
  const login = async (name: string) => {
    const start = await request('/auth/login');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    return cookie(
      await request(`/auth/callback?state=${state}&code=${name}`, { Cookie: cookie(start) }),
    );
  };
  const clients: Client[] = [];
  try {
    const alice = await login('alice'),
      bob = await login('bob');
    const mint = async (session: string, permission: string, folder = '') => {
      const res = await request(
        '/api/tokens',
        { Cookie: session },
        { name: 'Test agent', permission, folder, days: 7 },
      );
      assert.equal(res.status, 201);
      return res.json();
    };
    const writer = await mint(alice, 'write', 'team'),
      reader = await mint(alice, 'read', 'team'),
      other = await mint(bob, 'write');
    const auth = (secret: string) => ({ Authorization: `Bearer ${secret}` });
    assert.equal((await request('/api/agent/diagrams', { Cookie: alice })).status, 401);
    assert.equal((await request('/api/tokens', auth(writer.token))).status, 401);
    assert.equal(
      (await request('/api/tokens/revoke', { Cookie: bob }, { id: writer.id })).status,
      404,
    );
    const listing = await (await request('/api/tokens', { Cookie: alice })).json();
    assert.equal(listing.tokens.length, 2);
    assert.equal(JSON.stringify(listing).includes(writer.token), false);
    assert.equal(JSON.stringify(listing).includes('digest'), false);
    assert.equal(
      (await readFile(join(directory, 'agent-tokens.json'), 'utf8')).includes(writer.token),
      false,
    );
    const body = { path: 'team/platform.forma.json', document: doc, revision: null };
    const save = await request('/api/agent/document', auth(writer.token), body);
    const saved = await save.json();
    assert.equal(save.status, 200, saved.error);
    assert.equal(
      (
        await request('/api/agent/document', auth(reader.token), {
          ...body,
          revision: saved.revision,
        })
      ).status,
      403,
    );
    for (const path of [
      'team-other/no.forma.json',
      'private/no.forma.json',
      'team/../private/no.forma.json',
      '/team/no.forma.json',
    ])
      assert.ok(
        [400, 403].includes(
          (await request('/api/agent/document', auth(writer.token), { ...body, path })).status,
        ),
      );
    assert.equal(
      (await (await request('/api/agent/diagrams', auth(other.token))).json()).items.length,
      0,
    );
    assert.equal(
      (await request('/api/agent/document?path=team/platform.forma.json', auth(other.token)))
        .status,
      404,
    );
    const client = new Client({ name: 'forma-test', version: '1' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: auth(reader.token) },
      }),
    );
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 5);
    const read = await client.callTool({
      name: 'forma_read_diagram',
      arguments: { path: body.path },
    });
    assert.ok(!read.isError);
    const value = JSON.parse((read.content as { text: string }[])[0].text);
    assert.deepEqual(value.document.presentation.nodes.service, doc.presentation.nodes.service);
    assert.equal(
      (await client.callTool({ name: 'forma_write_diagram', arguments: body })).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: 'forma_read_diagram',
          arguments: { path: 'private/no.forma.json' },
        })
      ).isError,
      true,
    );
    const rendered = await client.callTool({
      name: 'forma_render_svg',
      arguments: { path: body.path },
    });
    assert.match((rendered.content as { text: string }[])[0].text, /<svg/);
    const file = join(temp, 'diagram.forma.json'),
      env = { ...process.env, FORMA_REMOTE_URL: base, FORMA_AGENT_TOKEN: writer.token };
    const command = (...args: string[]) =>
      run(process.execPath, [cli, ...args], { env, cwd: temp });
    await command('remote', 'pull', body.path, '--output', file);
    await assert.rejects(
      command('remote', 'pull', body.path, '--output', file),
      /Local file or remote binding exists/,
    );
    const downloaded = JSON.parse(await readFile(file, 'utf8'));
    downloaded.title = 'Agent continued';
    await writeFile(file, JSON.stringify(downloaded));
    await command('remote', 'push', file);
    const current = await (
      await request('/api/agent/document?path=' + body.path, auth(writer.token))
    ).json();
    assert.equal(current.document.title, 'Agent continued');
    assert.deepEqual(current.document.presentation.nodes.service, doc.presentation.nodes.service);
    await request('/api/agent/document', auth(writer.token), {
      path: body.path,
      revision: current.revision,
      document: { ...current.document, title: 'New human edit' },
    });
    await assert.rejects(command('remote', 'push', file), /changed on disk/);
    await assert.rejects(
      run(process.execPath, [cli, 'remote', 'push', file], {
        env: { ...env, FORMA_AGENT_TOKEN: other.token },
        cwd: temp,
      }),
      /another server, user or path/,
    );
    const stdio = new Client({ name: 'stdio-test', version: '1' });
    clients.push(stdio);
    await stdio.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, 'mcp'],
        env: Object.fromEntries(
          Object.entries(env).filter((v): v is [string, string] => typeof v[1] === 'string'),
        ),
        stderr: 'pipe',
      }),
    );
    const throughBridge = await stdio.callTool({ name: 'forma_list_diagrams', arguments: {} });
    assert.match((throughBridge.content as { text: string }[])[0].text, /New human edit/);
    await request('/api/tokens/revoke', { Cookie: alice }, { id: reader.id });
    assert.equal((await request('/api/agent/diagrams', auth(reader.token))).status, 401);
    await assert.rejects(client.callTool({ name: 'forma_list_diagrams', arguments: {} }));
    await request('/api/tokens/revoke', { Cookie: alice }, { id: writer.id });
    assert.equal(
      (await stdio.callTool({ name: 'forma_list_diagrams', arguments: {} })).isError,
      true,
    );
  } finally {
    for (const c of clients) await c.close();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});
test('token registry survives reload, expires tokens and validates scopes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-tokens-'));
  let now = 1000;
  try {
    const identity = { sub: 'alice', email: 'alice@example.test', email_verified: true };
    const store = await createTokenStore(temp, () => now);
    const created = await store.create(identity, {
      name: 'Agent',
      permission: 'read',
      folder: 'engineering',
      days: 1,
    });
    const loaded = await createTokenStore(temp, () => now);
    assert.equal(loaded.authenticate('Bearer ' + created.token).identity.sub, 'alice');
    for (const folder of ['../all', '/all', 'team/', 'team//private', '.hidden', 'team/../x'])
      await assert.rejects(
        store.create(identity, { name: 'Bad', permission: 'write', folder, days: 1 }),
      );
    now += 86400001;
    assert.throws(() => loaded.authenticate('Bearer ' + created.token), /unexpired/);
    assert.throws(() => remoteOrigin('https://user:secret@example.com'), /HTTPS origin/);
    assert.throws(() => remoteOrigin('http://public.example'), /HTTPS origin/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
