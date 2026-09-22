#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, extname, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { createLocalServer } from './server';
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
  alignEdges,
  alignNodes,
  distributeAxes,
  distributeNodes,
  mergeAlignmentPins,
  type AlignEdge,
  type DistributeAxis,
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
  if (command === 'remote') {
    const { remoteCommand } = await import('./remote');
    output(await remoteCommand(args));
    return;
  }
  if (command === 'mcp') {
    if (args.length)
      throw new Error('forma mcp uses FORMA_REMOTE_URL and agent token environment variables.');
    const { serveMcpStdio } = await import('./remote');
    await serveMcpStdio();
    return;
  }
  if (command === 'host') {
    if (args.length)
      throw new Error(
        'forma host reads configuration from FORMA_* environment variables. See docs/self-hosting.md.',
      );
    const { createHostedServer } = await import('./hosted');
    const required = (key: string) => {
      const value = process.env[key];
      if (!value) throw new Error(`Set ${key}. See docs/self-hosting.md.`);
      return value;
    };
    const port = Number(process.env.FORMA_PORT ?? 4242);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FORMA_PORT');
    const split = (key: string) =>
      (process.env[key] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const url = required('FORMA_PUBLIC_URL');
    const server = await createHostedServer({
      directory: required('FORMA_DATA_DIR'),
      assets: join(root, 'dist'),
      publicUrl: url,
      clientId: required('FORMA_GOOGLE_CLIENT_ID'),
      clientSecret: required('FORMA_GOOGLE_CLIENT_SECRET'),
      allowedEmails: split('FORMA_ALLOWED_EMAILS'),
      allowedDomains: split('FORMA_ALLOWED_DOMAINS'),
      host: process.env.FORMA_BIND_HOST ?? '127.0.0.1',
      port,
      maxBytes: Number(process.env.FORMA_USER_BYTES ?? 100_000_000),
      maxFiles: Number(process.env.FORMA_USER_FILES ?? 1000),
      maxUsers: Number(process.env.FORMA_MAX_USERS ?? 500),
      enableMcp: process.env.FORMA_ENABLE_MCP === 'true',
    });
    output({ ok: true, command, url });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
    return;
  }
  if (command === 'serve') {
    const options: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--directory', '--port'].includes(args[i]) || !args[i + 1])
        throw new Error('Usage: forma serve [--directory PATH] [--port 4242]');
      options[args[i]] = args[i + 1];
    }
    const port = Number(options['--port'] ?? 4242);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    const directory = resolve(options['--directory'] ?? join(homedir(), 'Forma'));
    const server = await createLocalServer({ directory, assets: join(root, 'dist'), port });
    output({ ok: true, command, url: `http://127.0.0.1:${port}`, directory });
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => server.close(() => process.exit(0)));
    return;
  }
  if (command === 'align') {
    const file = args.shift();
    if (!file) {
      throw new Error(
        'Usage: forma align FILE --left|--center|--right|--top|--middle|--bottom --ids a,b | --distribute horizontal|vertical --ids a,b,c | --fix',
      );
    }
    let edge: AlignEdge | undefined,
      axis: DistributeAxis | undefined,
      ids: string[] | undefined,
      fix = false,
      outputPath: string | undefined;
    while (args.length) {
      const arg = args.shift()!;
      if (arg === '--fix') {
        fix = true;
        continue;
      }
      if ((alignEdges as readonly string[]).includes(arg.slice(2)) && arg.startsWith('--')) {
        edge = arg.slice(2) as AlignEdge;
        continue;
      }
      if (arg === '--distribute' && args[0]) {
        const value = args.shift()!;
        if (!(distributeAxes as readonly string[]).includes(value))
          throw new Error('Distribute along horizontal or vertical.');
        axis = value as DistributeAxis;
        continue;
      }
      if (arg === '--ids' && args[0]) {
        ids = args
          .shift()!
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        continue;
      }
      if (arg === '--output' && args[0]) {
        outputPath = args.shift();
        continue;
      }
      throw new Error(`Unknown option: ${arg}`);
    }
    const chosen = [fix, !!edge, !!axis].filter(Boolean).length;
    if (chosen !== 1)
      throw new Error('Choose one of --fix, an alignment edge, or --distribute AXIS.');
    const original = parseDocument(await json(file));
    const scene = await layoutDiagram(original);
    const moves = fix
      ? mergeAlignmentPins(
          scene.nodes,
          inspectScene(scene)
            .issues.filter((issue) => issue.code === 'near-alignment' && issue.fix)
            .map((issue) => ({ ids: issue.ids, edge: issue.fix!.edge })),
        )
      : axis
        ? distributeNodes(scene.nodes, ids ?? [], axis)
        : alignNodes(scene.nodes, ids ?? [], edge!);
    const merged = new Map(moves.map((move) => [move.id, move.position]));
    const updated = patchDocument(original, {
      overrides: Object.fromEntries([...merged].map(([id, position]) => [id, { position }])),
    });
    await atomic(outputPath ?? file, serializeDocument(updated));
    output({
      ok: true,
      command,
      output: resolve(outputPath ?? file),
      pinned: [...merged.keys()],
      remaining: inspectScene(await layoutDiagram(updated)).issues.filter(
        (issue) => issue.code === 'near-alignment',
      ).length,
    });
    return;
  }
  if (!command || command === '--help' || command === 'help') {
    output({
      name: 'forma',
      version: '0.5.1',
      usage: [
        'forma serve [--directory ~/Forma] [--port 4242]',
        'forma host (configured with FORMA_* environment variables)',
        'forma remote whoami|list|pull PATH --output FILE|push FILE [--create --path PATH]',
        'forma mcp (stdio bridge to the authenticated remote API)',
        'forma create [--template architecture|flow|blank] --output diagram.forma.json',
        'forma migrate diagram.forma.json [--output upgraded.forma.json]',
        'forma style diagram.forma.json --system brand.json [--output styled.forma.json]',
        'forma validate diagram.forma.json',
        'forma patch diagram.forma.json --patch changes.json [--output diagram.forma.json]',
        'forma layout diagram.forma.json --output scene.json',
        'forma render diagram.forma.json --output diagram.svg|diagram.png',
        'forma export diagram.forma.json --output diagram.svg|diagram.png',
        'forma inspect diagram.forma.json [--strict]',
        'forma align diagram.forma.json --left|--center|--right|--top|--middle|--bottom --ids a,b',
        'forma align diagram.forma.json --distribute horizontal|vertical --ids a,b,c',
        'forma align diagram.forma.json --fix',
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
