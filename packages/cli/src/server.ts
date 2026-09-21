import { createServer } from 'node:http';
import {
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir,
  realpath,
  lstat,
  readdir,
} from 'node:fs/promises';
import { resolve, join, dirname, extname, sep, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, serializeDocument } from '../../core/src/index';

const revision = (text: string) => createHash('sha256').update(text).digest('hex');
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Optional loopback file adapter. The core and static editor remain server-independent. */
export async function createLocalServer(options: {
  directory: string;
  assets: string;
  port?: number;
}) {
  await mkdir(resolve(options.directory), { recursive: true });
  let root = await realpath(resolve(options.directory)),
    workspace = randomUUID();
  let mutations = Promise.resolve();
  const safePath = async (path: string, createParents = false) => {
    if (
      !path ||
      isAbsolute(path) ||
      path.includes('\\') ||
      path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
      !path.endsWith('.forma.json')
    )
      throw new HttpError(
        400,
        'Use a relative .forma.json path, such as architecture/checkout.forma.json.',
      );
    const parts = path.split('/');
    let current = root;
    for (const [i, part] of parts.entries()) {
      current = join(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink())
          throw new HttpError(400, 'Symbolic links are not supported in the library.');
        if (i < parts.length - 1 && !stat.isDirectory())
          throw new HttpError(400, 'Parent is not a folder.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (i < parts.length - 1 && createParents) await mkdir(current);
        else if (i < parts.length - 1) throw new HttpError(404, 'Folder not found.');
      }
    }
    return current;
  };
  const list = async () => {
    const items: { path: string; title: string; modified: string; error?: string }[] = [],
      folders: string[] = [];
    const walk = async (relative = '', depth = 0) => {
      if (depth > 12 || items.length >= 1000) return;
      for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink())
          continue;
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          folders.push(path);
          await walk(path, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.forma.json') && items.length < 1000) {
          const stat = await lstat(join(root, path));
          let title = entry.name,
            error: string | undefined;
          try {
            if (stat.size > 5_000_000) throw new Error('File exceeds 5 MB.');
            title = parseDocument(JSON.parse(await readFile(join(root, path), 'utf8'))).title;
          } catch (e) {
            error = (e as Error).message;
          }
          items.push({
            path,
            title,
            modified: stat.mtime.toISOString(),
            ...(error ? { error } : {}),
          });
        }
      }
    };
    await walk();
    return {
      mode: 'local',
      directory: root,
      workspace,
      items: items.sort((a, b) => a.path.localeCompare(b.path)),
      folders: folders.sort(),
    };
  };
  const server = createServer(async (req, res) => {
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const port = (server.address() as { port: number }).port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host ?? ''))
        throw new HttpError(403, 'Unrecognized local host.');
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin)
        throw new HttpError(403, 'Cross-origin access is not allowed.');
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/api/library') {
          json(200, await list());
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/document') {
          if (url.searchParams.get('workspace') !== workspace)
            throw new HttpError(409, 'Library changed. Refresh the library before opening a file.');
          const path = await safePath(url.searchParams.get('path') ?? '');
          const stat = await lstat(path);
          if (stat.size > 5_000_000) throw new HttpError(413, 'File exceeds 5 MB.');
          const text = await readFile(path, 'utf8');
          json(200, { document: parseDocument(JSON.parse(text)), revision: revision(text) });
          return;
        }
        if (
          req.method !== 'POST' ||
          req.headers['x-forma-request'] !== '1' ||
          !req.headers['content-type']?.startsWith('application/json')
        )
          throw new HttpError(405, 'Unsupported library request.');
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 5_000_000)
            throw new HttpError(413, 'Document exceeds 5 MB.');
        }
        const data = JSON.parse(body);
        const operation = async () => {
          if (url.pathname === '/api/library') {
            if (typeof data.directory !== 'string' || !isAbsolute(data.directory))
              throw new HttpError(400, 'Enter an absolute folder path.');
            await mkdir(data.directory, { recursive: true });
            root = await realpath(data.directory);
            workspace = randomUUID();
            return list();
          }
          if (url.pathname === '/api/document') {
            if (data.workspace !== workspace)
              throw new HttpError(
                409,
                'Library changed. Reopen the diagram from the current library.',
              );
            if (typeof data.path !== 'string') throw new HttpError(400, 'A file path is required.');
            const content = serializeDocument(parseDocument(data.document)),
              path = await safePath(data.path, true);
            let existing: string | null = null;
            try {
              existing = await readFile(path, 'utf8');
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
            }
            if ((existing === null ? null : revision(existing)) !== data.revision)
              throw new HttpError(
                409,
                'This file changed on disk. Your edits are still here. Open the disk version from Library or save your edits under a new path.',
              );
            const temp = join(dirname(path), `.forma-${randomUUID()}.tmp`);
            try {
              await writeFile(temp, content, { flag: 'wx' });
              await rename(temp, path);
            } finally {
              await unlink(temp).catch(() => {});
            }
            return { path: data.path, revision: revision(content), workspace };
          }
          throw new HttpError(404, 'Unknown library operation.');
        };
        const result = mutations.then(operation);
        mutations = result.then(
          () => {},
          () => {},
        );
        json(200, await result);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new HttpError(405, 'Read-only asset route.');
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const assets = await realpath(resolve(options.assets)),
        file = resolve(assets, relative);
      if (!file.startsWith(assets + sep)) throw new HttpError(403, 'Invalid asset path.');
      const real = await realpath(file);
      if (!real.startsWith(assets + sep)) throw new HttpError(403, 'Invalid asset target.');
      let bytes = await readFile(real);
      if (extname(file) === '.html')
        bytes = Buffer.from(
          bytes.toString().replace('<head>', '<head><meta name="forma-local" content="1">'),
        );
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ttf': 'font/ttf',
        '.json': 'application/json',
        '.txt': 'text/plain',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { status?: number };
      json(e.status ?? (e.code === 'ENOENT' ? 404 : 400), { error: e.message });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4242, '127.0.0.1', resolve);
  });
  return server;
}
