import { get as httpGet } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalServer } from '../packages/cli/src/server';
const diagram = { version: 2, title: 'A shared document', nodes: [], edges: [] };
test('local library: folders, saves, reloads, conflicts, containment, and origin checks', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forma-library-'));
  const directory = join(temp, 'diagrams'),
    assets = join(temp, 'assets');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<html><head></head><body>Forma</body></html>');
  const server = await createLocalServer({ directory, assets, port: 0 });
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const get = async (path: string) => fetch(base + path);
  const post = async (path: string, data: unknown, extra: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forma-Request': '1', ...extra },
      body: JSON.stringify(data),
    });
  try {
    assert.match(await (await get('/')).text(), /forma-local/);
    const initial = await (await get('/api/library')).json();
    assert.equal(initial.items.length, 0);
    let response = await post('/api/document', {
      workspace: initial.workspace,
      path: 'team/system.forma.json',
      revision: null,
      document: diagram,
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(
      JSON.parse(await readFile(join(directory, 'team/system.forma.json'), 'utf8')).title,
      diagram.title,
    );
    const library = await (await get('/api/library')).json();
    assert.deepEqual(library.folders, ['team']);
    assert.equal(library.items[0].path, 'team/system.forma.json');
    const query = `/api/document?path=team/system.forma.json&workspace=${initial.workspace}`;
    const loaded = await (await get(query)).json();
    assert.equal(loaded.revision, saved.revision);
    const updated = { ...diagram, title: 'Human edit' };
    response = await post('/api/document', {
      workspace: initial.workspace,
      path: 'team/system.forma.json',
      revision: saved.revision,
      document: updated,
    });
    assert.equal(response.status, 200);
    response = await post('/api/document', {
      workspace: initial.workspace,
      path: 'team/system.forma.json',
      revision: saved.revision,
      document: diagram,
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed on disk/);
    await writeFile(
      join(directory, 'team/system.forma.json'),
      JSON.stringify({ ...diagram, title: 'Agent edit' }),
    );
    assert.equal((await (await get(query)).json()).document.title, 'Agent edit');
    for (const path of [
      '../escape.forma.json',
      '/tmp/escape.forma.json',
      '.hidden/escape.forma.json',
      'bad.txt',
    ])
      assert.equal(
        (
          await post('/api/document', {
            workspace: initial.workspace,
            path,
            revision: null,
            document: diagram,
          })
        ).status,
        400,
      );
    await symlink(assets, join(directory, 'linked'));
    assert.equal(
      (
        await post('/api/document', {
          workspace: initial.workspace,
          path: 'linked/escape.forma.json',
          revision: null,
          document: diagram,
        })
      ).status,
      400,
    );
    assert.equal((await post('/api/document', {}, { Origin: 'https://example.com' })).status, 403);
    assert.equal(
      await new Promise<number | undefined>((resolve, reject) => {
        httpGet(
          base + '/api/library',
          { headers: { Host: `attacker.example:${port}` } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).on('error', reject);
      }),
      403,
    );
    assert.equal((await fetch(base + '/api/document', { method: 'POST', body: '{}' })).status, 405);
    const switched = await (
      await post('/api/library', { directory: join(temp, 'another') })
    ).json();
    assert.notEqual(switched.workspace, initial.workspace);
    assert.equal(
      (
        await post('/api/document', {
          workspace: initial.workspace,
          path: 'team/system.forma.json',
          revision: null,
          document: diagram,
        })
      ).status,
      409,
    );
    assert.equal((await get('/api/document?path=anything.forma.json&workspace=old')).status, 409);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
});
