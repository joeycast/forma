import { createServer } from 'node:http';
import { isAbsolute } from 'node:path';
import { createFileLibrary, HttpError } from './file-library';
import { json, readBody, serveAsset } from './http';
/** Optional loopback adapter. Hosted mode uses a separate authenticated server. */
export async function createLocalServer(options: {
  directory: string;
  assets: string;
  port?: number;
}) {
  let library = await createFileLibrary(options.directory),
    mutations = Promise.resolve();
  const server = createServer(async (req, res) => {
    try {
      const port = (server.address() as { port: number }).port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? ''))
        throw new HttpError(403, 'Unrecognized local host.');
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin)
        throw new HttpError(403, 'Cross-origin access is not allowed.');
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/api/library') {
          json(res, 200, await library.list());
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/document') {
          json(
            res,
            200,
            await library.read(
              url.searchParams.get('path') ?? '',
              url.searchParams.get('workspace') ?? '',
            ),
          );
          return;
        }
        if (req.method !== 'POST') throw new HttpError(405, 'Unsupported library request.');
        const data = await readBody(req);
        const operation = async () => {
          if (url.pathname === '/api/library') {
            if (typeof data.directory !== 'string' || !isAbsolute(data.directory))
              throw new HttpError(400, 'Enter an absolute folder path.');
            library = await createFileLibrary(data.directory);
            return library.list();
          }
          if (url.pathname === '/api/document') return library.save(data);
          throw new HttpError(404, 'Unknown library operation.');
        };
        const result = mutations.then(operation);
        mutations = result.then(
          () => {},
          () => {},
        );
        json(res, 200, await result);
        return;
      }
      await serveAsset(req, res, url, options.assets, 'local');
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { status?: number };
      json(res, e.status ?? (e.code === 'ENOENT' ? 404 : 400), { error: e.message });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4242, '127.0.0.1', resolve);
  });
  return server;
}
