import { readFile, writeFile, rename, unlink, lstat } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseDocument, serializeDocument } from '../../core/src/index';
import { HttpError } from './file-library';

export function remoteOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  )
    throw new Error(
      'FORMA_REMOTE_URL must be an HTTPS origin (loopback HTTP is allowed for development).',
    );
  return url.origin;
}

export async function remoteClient(env: NodeJS.ProcessEnv = process.env) {
  if (!env.FORMA_REMOTE_URL) throw new Error('Set FORMA_REMOTE_URL to your hosted Forma origin.');
  const origin = remoteOrigin(env.FORMA_REMOTE_URL);
  if (env.FORMA_AGENT_TOKEN && env.FORMA_AGENT_TOKEN_FILE)
    throw new Error('Use either FORMA_AGENT_TOKEN or FORMA_AGENT_TOKEN_FILE, not both.');
  let token = env.FORMA_AGENT_TOKEN?.trim();
  if (env.FORMA_AGENT_TOKEN_FILE) {
    const stat = await lstat(env.FORMA_AGENT_TOKEN_FILE);
    if (
      !stat.isFile() ||
      stat.size > 4096 ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    )
      throw new Error('Use a regular private token file (chmod 600), no larger than 4 KB.');
    token = (await readFile(env.FORMA_AGENT_TOKEN_FILE, 'utf8')).trim();
  }
  if (!/^forma_[a-f0-9]{24}_[a-f0-9]{64}$/.test(token ?? ''))
    throw new Error(
      'Set a Forma agent token using FORMA_AGENT_TOKEN or a private FORMA_AGENT_TOKEN_FILE.',
    );
  const request = async (path: string, body?: unknown) => {
    let response: Response;
    try {
      response = await fetch(origin + '/api/agent/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error(
        'Could not reach the configured Forma server. Redirects are not followed; check its exact origin.',
      );
    }
    const reader = response.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 8_000_000) {
          await reader.cancel();
          throw new Error('Server response exceeds 8 MB.');
        }
        chunks.push(chunk.value);
      }
    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new Error('The server returned an invalid response.');
    }
    if (!response.ok)
      throw new HttpError(
        response.status,
        `Forma HTTP ${response.status}: ${data.error ?? 'Request rejected.'}`,
      );
    return data;
  };
  const service = {
    me: () => request('me'),
    list: () => request('diagrams'),
    read: (path: string) => request('document?path=' + encodeURIComponent(path)),
    write: (data: unknown) => request('document', data),
  };
  return { origin, service };
}

const bindingSchema = z
  .object({
    version: z.literal(1),
    server: z.string(),
    owner: z.string(),
    path: z.string(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

async function atomic(path: string, text: string) {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, text, { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

export async function remoteCommand(args: string[]) {
  const { origin, service } = await remoteClient();
  const operation = args.shift();
  if (operation === 'whoami' && !args.length) return service.me();
  if (operation === 'list' && !args.length) return service.list();
  if (operation === 'pull') {
    const path = args.shift(),
      options: Record<string, string | boolean> = {};
    while (args.length) {
      const key = args.shift();
      if (key === '--overwrite') options[key] = true;
      else if (key === '--output' && args.length) options[key] = args.shift()!;
      else throw new Error('Usage: forma remote pull PATH --output FILE [--overwrite]');
    }
    if (!path || typeof options['--output'] !== 'string')
      throw new Error('Usage: forma remote pull PATH --output FILE [--overwrite]');
    const file = resolve(options['--output']),
      sidecar = file + '.forma-remote.json';
    if (!options['--overwrite'])
      for (const target of [file, sidecar]) {
        try {
          await lstat(target);
          throw new Error(
            'Local file or remote binding exists. Use a new output path, or --overwrite after preserving local edits.',
          );
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      }
    const value = await service.read(path),
      doc = parseDocument(value.document);
    const binding = bindingSchema.parse({
      version: 1,
      server: origin,
      owner: value.owner,
      path,
      revision: value.revision,
    });
    if (options['--overwrite']) await atomic(file, serializeDocument(doc));
    else await writeFile(file, serializeDocument(doc), { flag: 'wx', mode: 0o600 });
    await atomic(sidecar, JSON.stringify(binding, null, 2) + '\n');
    return { ok: true, command: 'remote pull', output: file, path, revision: binding.revision };
  }
  if (operation === 'push') {
    const source = args.shift();
    let create = false,
      path: string | undefined;
    while (args.length) {
      const key = args.shift();
      if (key === '--create') create = true;
      else if (key === '--path' && args.length) path = args.shift();
      else throw new Error('Usage: forma remote push FILE [--create --path PATH]');
    }
    if (!source) throw new Error('Usage: forma remote push FILE [--create --path PATH]');
    const file = resolve(source),
      sidecar = file + '.forma-remote.json',
      doc = parseDocument(JSON.parse(await readFile(file, 'utf8'))),
      identity = await service.me();
    let revision: string | null = null;
    if (!create) {
      const binding = bindingSchema.parse(JSON.parse(await readFile(sidecar, 'utf8')));
      if (
        binding.server !== origin ||
        binding.owner !== identity.owner ||
        (path && path !== binding.path)
      )
        throw new Error(
          'This file is bound to another server, user or path. Pull the correct document first.',
        );
      path = binding.path;
      revision = binding.revision;
    }
    if (!path) throw new Error('A new file requires --create --path FOLDER/NAME.forma.json.');
    const saved = await service.write({ path, revision, document: doc });
    try {
      await atomic(
        sidecar,
        JSON.stringify(
          bindingSchema.parse({
            version: 1,
            server: origin,
            owner: identity.owner,
            path,
            revision: saved.revision,
          }),
          null,
          2,
        ) + '\n',
      );
    } catch {
      throw new Error(
        'The server saved the diagram, but the local revision binding could not be updated. Pull into a new file before another push.',
      );
    }
    return { ok: true, command: 'remote push', path, revision: saved.revision };
  }
  throw new Error(
    'Usage: forma remote whoami|list|pull PATH --output FILE|push FILE [--create --path PATH]',
  );
}

export async function serveMcpStdio() {
  const { service } = await remoteClient();
  const { createMcpAdapter } = await import('./mcp'),
    { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  // The remote HTTP API still authenticates every operation; no privileges live in the bridge.
  await createMcpAdapter(service).connect(new StdioServerTransport());
}
