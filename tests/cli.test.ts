import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const bin = new URL('../packages/cli/bin.mjs', import.meta.url);
function cli(...args: string[]) {
  return spawnSync(process.execPath, [bin.pathname, ...args], { encoding: 'utf8', timeout: 30000 });
}
test('CLI artifact → human pin → agent patch → SVG and PNG export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forma-cli-'));
  try {
    const doc = join(dir, 'diagram.forma.json');
    const patch = join(dir, 'patch.json');
    assert.equal(cli('create', '--template', 'architecture', '--output', doc).status, 0);
    assert.equal(cli('validate', doc).status, 0);
    await writeFile(
      patch,
      JSON.stringify({ overrides: { web: { position: { x: 100, y: 200 }, color: 'violet' } } }),
    );
    assert.equal(cli('patch', doc, '--patch', patch).status, 0);
    await writeFile(patch, JSON.stringify({ nodes: [{ id: 'web', label: 'Customer portal' }] }));
    assert.equal(cli('patch', doc, '--patch', patch).status, 0);
    const artifact = JSON.parse(await readFile(doc, 'utf8'));
    assert.deepEqual(artifact.presentation.nodes.web.position, { x: 100, y: 200 });
    assert.equal(
      artifact.nodes.find((n: { id: string }) => n.id === 'web').label,
      'Customer portal',
    );
    for (const format of ['svg', 'png']) {
      const destination = join(dir, `diagram.${format}`);
      const result = cli(format === 'svg' ? 'render' : 'export', doc, '--output', destination);
      assert.equal(result.status, 0, result.stderr);
      const buffer = await readFile(destination);
      if (format === 'svg') assert.match(buffer.toString(), /<svg/);
      else assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    const scene = join(dir, 'scene.json');
    assert.equal(cli('layout', doc, '--output', scene).status, 0);
    assert.ok(JSON.parse(await readFile(scene, 'utf8')).bounds.width > 0);
    const inspection = cli('inspect', doc);
    assert.ok([0, 2].includes(inspection.status!));
    assert.ok(Array.isArray(JSON.parse(inspection.stdout).issues));
    assert.equal(cli('layout', doc, '--output', doc).status, 1);
    const before = await readFile(doc, 'utf8');
    await writeFile(
      patch,
      JSON.stringify({ edges: [{ id: 'bad', source: 'missing', target: 'web' }] }),
    );
    const invalid = cli('patch', doc, '--patch', patch);
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stderr).ok, false);
    assert.equal(
      await readFile(doc, 'utf8'),
      before,
      'invalid patch must leave original untouched',
    );
    const spread = structuredClone(artifact);
    spread.presentation.nodes.web.position = { x: -10000, y: -10000 };
    spread.presentation.nodes.worker = { position: { x: 10000, y: 10000 } };
    const spreadPath = join(dir, 'spread.forma.json');
    await writeFile(spreadPath, JSON.stringify(spread));
    const oversized = cli('export', spreadPath, '--output', join(dir, 'oversized.png'));
    assert.equal(oversized.status, 1);
    assert.match(JSON.parse(oversized.stderr).error.message, /32 million pixel limit/);
    await writeFile(join(dir, 'invalid.json'), '{ nope');
    assert.equal(cli('validate', join(dir, 'invalid.json')).status, 1);
    assert.equal(cli('create', '--template', 'unknown', '--output', doc).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('CLI align pins a shared edge', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forma-align-'));
  try {
    const file = join(dir, 'diagram.forma.json');
    await writeFile(
      file,
      JSON.stringify({
        version: 2,
        title: 'Align',
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [],
        presentation: {
          nodes: {
            a: { position: { x: 40, y: 10 } },
            b: { position: { x: 48, y: 120 } },
          },
        },
      }),
    );
    const result = cli('align', file, '--left', '--ids', 'a,b');
    assert.equal(result.status, 0, result.stderr);
    const artifact = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(
      artifact.presentation.nodes.a.position.x,
      artifact.presentation.nodes.b.position.x,
    );
    assert.equal(cli('align', file, '--fix').status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
