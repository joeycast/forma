#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, extname, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import {
  parseDocument,
  migrateDocument,
  designSystemSchema,
  serializeDocument,
  patchDocument,
  layoutDiagram,
  inspectScene,
  renderSvg,
} from '../../core/src/index';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const commands = [
  'create',
  'validate',
  'patch',
  'layout',
  'render',
  'export',
  'inspect',
  'migrate',
  'style',
];
function output(value: unknown) {
  process.stdout.write(JSON.stringify(value) + '\n');
}
async function json(path: string) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}
async function atomic(path: string, data: string | Uint8Array) {
  const target = resolve(path);
  const temp = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, data, { flag: 'wx' });
    await rename(temp, target);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === '--help' || command === 'help') {
    output({
      name: 'forma',
      version: '0.2.0',
      usage: [
        'forma create [--template architecture|flow|blank] --output diagram.forma.json',
        'forma migrate diagram.forma.json [--output upgraded.forma.json]',
        'forma style diagram.forma.json --system brand.json [--output styled.forma.json]',
        'forma validate diagram.forma.json',
        'forma patch diagram.forma.json --patch changes.json [--output diagram.forma.json]',
        'forma layout diagram.forma.json --output scene.json',
        'forma render diagram.forma.json --output diagram.svg|diagram.png',
        'forma export diagram.forma.json --output diagram.svg|diagram.png',
        'forma inspect diagram.forma.json [--strict]',
      ],
      exitCodes: {
        '0': 'success',
        '1': 'input or execution failure',
        '2': 'inspection errors, or warnings with --strict',
      },
    });
    return;
  }
  if (!commands.includes(command)) throw new Error(`Unknown command: ${command}`);
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (!['--output', '--template', '--patch', '--system'].includes(arg))
      throw new Error(`Unknown option: ${arg}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[arg.slice(2)] = args[++i];
  }
  const allowed =
    command === 'style'
      ? ['system', 'output']
      : command === 'migrate'
        ? ['output']
        : command === 'create'
          ? ['template', 'output']
          : command === 'patch'
            ? ['patch', 'output']
            : command === 'inspect'
              ? ['strict']
              : command === 'validate'
                ? []
                : ['output'];
  for (const option of Object.keys(options))
    if (!allowed.includes(option))
      throw new Error(`Option --${option} is not supported by ${command}`);
  if (positional.length !== (command === 'create' ? 0 : 1))
    throw new Error(
      command === 'create'
        ? 'create does not accept an input file'
        : `${command} requires exactly one input file`,
    );
  const target = typeof options.output === 'string' ? options.output : undefined;
  if (['create', 'layout', 'render', 'export'].includes(command) && !target)
    throw new Error('--output is required');
  if (command === 'create') {
    const template = options.template ?? 'blank';
    if (template === 'blank') {
      const doc = parseDocument({ version: 2, title: 'Untitled diagram', nodes: [], edges: [] });
      await atomic(target!, serializeDocument(doc));
      output({ ok: true, command, output: resolve(target!), template });
      return;
    }
    if (template !== 'architecture' && template !== 'flow')
      throw new Error('Template must be architecture or flow');
    const doc = parseDocument(
      await json(
        join(
          root,
          'examples',
          template === 'architecture' ? 'platform.forma.json' : 'release.forma.json',
        ),
      ),
    );
    await atomic(target!, serializeDocument(doc));
    output({ ok: true, command, output: resolve(target!), template });
    return;
  }
  const doc = parseDocument(await json(positional[0]));
  if (command === 'migrate' || command === 'style') {
    let updated = migrateDocument(doc);
    if (command === 'style') {
      if (typeof options.system !== 'string') throw new Error('--system is required');
      updated = patchDocument(updated, {
        designSystem: designSystemSchema.parse(await json(options.system)),
      });
    }
    await atomic(target ?? positional[0], serializeDocument(updated));
    output({
      ok: true,
      command,
      version: updated.version,
      output: resolve(target ?? positional[0]),
    });
    return;
  }
  if (command === 'validate') {
    output({
      ok: true,
      command,
      version: doc.version,
      nodes: doc.nodes.length,
      edges: doc.edges.length,
      groups: doc.groups.length,
    });
    return;
  }
  if (command === 'patch') {
    if (typeof options.patch !== 'string') throw new Error('--patch is required');
    const updated = patchDocument(doc, await json(options.patch));
    await atomic(target ?? positional[0], serializeDocument(updated));
    output({ ok: true, command, output: resolve(target ?? positional[0]) });
    return;
  }
  if (command === 'layout' && resolve(target!) === resolve(positional[0]))
    throw new Error('Resolved scene output must not overwrite the native document');
  const scene = await layoutDiagram(doc);
  if (command === 'inspect') {
    const report = inspectScene(scene);
    output(report);
    if (report.summary.errors > 0 || (options.strict && report.summary.warnings > 0))
      process.exitCode = 2;
    return;
  }
  if (command === 'layout') {
    await atomic(target!, JSON.stringify(scene, null, 2) + '\n');
    output({ ok: true, command, output: resolve(target!), fingerprint: scene.fingerprint });
    return;
  }
  const extension = extname(target!).toLowerCase();
  if (!['.svg', '.png'].includes(extension))
    throw new Error('Export output must end in .svg or .png');
  if (resolve(target!) === resolve(positional[0]))
    throw new Error('Export must not overwrite the native document');
  const pixelWidth = Math.ceil(scene.bounds.width) * 2;
  const pixelHeight = Math.ceil(scene.bounds.height) * 2;
  if (extension === '.png' && pixelWidth * pixelHeight > 32_000_000) {
    throw new Error(
      `PNG export exceeds the 32 million pixel limit (${pixelWidth} × ${pixelHeight} at 2×). Use SVG or reduce diagram spread and pinned positions.`,
    );
  }
  const fontFiles = ['IBMPlexSans-Regular.ttf', 'IBMPlexSans-SemiBold.ttf'].map((name) =>
    join(root, 'public/fonts', name),
  );
  const [regular, bold] = await Promise.all(fontFiles.map((path) => readFile(path)));
  const svg = renderSvg(scene, {
    fontDataUri: `data:font/ttf;base64,${regular.toString('base64')}`,
    boldFontDataUri: `data:font/ttf;base64,${bold.toString('base64')}`,
  });
  const data =
    extension === '.svg'
      ? svg
      : new Resvg(svg, {
          font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans' },
          fitTo: { mode: 'zoom', value: 2 },
        })
          .render()
          .asPng();
  await atomic(target!, data);
  output({
    ok: true,
    command,
    output: resolve(target!),
    format: extension.slice(1),
    inspection: inspectScene(scene).summary,
  });
}
main().catch((error: unknown) => {
  const e = error as { name?: string; message?: string; issues?: unknown };
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: e.name ?? 'Error',
        message: e.message ?? String(error),
        ...(e.issues ? { issues: e.issues } : {}),
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
