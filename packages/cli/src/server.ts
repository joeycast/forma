import { createServer } from 'node:http';
import { isAbsolute } from 'node:path';
import { createFileLibrary, HttpError } from './file-library';
import { json, readBody, serveAsset } from './http';
import { z } from 'zod';
import { fileSystemLibrary } from './system-library';
/** Optional loopback adapter. Hosted mode uses a separate authenticated server. */
export async function createLocalServer(options: {
  directory: string;
  assets: string;
  port?: number;
}) {
  let library = await createFileLibrary(options.directory),
    systems = await fileSystemLibrary(options.directory),
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
        if (req.method === 'GET' && url.pathname === '/api/systems') {
          json(res, 200, await systems.list());
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/systems/item') {
          const input = z
            .object({ id: z.string().min(1).max(80), revision: z.string().min(1).max(40) })
            .parse(Object.fromEntries(url.searchParams));
          json(res, 200, await systems.get(input.id, input.revision));
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
        if (req.method === 'DELETE' && url.pathname === '/api/systems') {
          if (req.headers['x-forma-request'] !== '1')
            throw new HttpError(403, 'A Forma application request is required.');
          const input = z
            .object({
              id: z.string().min(1).max(80),
              revision: z.string().min(1).max(40),
              expectedStorageRevision: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .nullable(),
            })
            .strict()
            .parse(await readBody(req));
          json(
            res,
            200,
            await systems.remove(input.id, input.revision, input.expectedStorageRevision),
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
            systems = await fileSystemLibrary(data.directory);
            return library.list();
          }
          if (url.pathname === '/api/systems') {
            if (req.headers['x-forma-request'] !== '1')
              throw new HttpError(403, 'A Forma application request is required.');
            const input = z
              .object({
                system: z.unknown(),
                expectedStorageRevision: z
                  .string()
                  .regex(/^[a-f0-9]{64}$/)
                  .nullable(),
              })
              .strict()
              .parse(data);
            return systems.save(input.system, input.expectedStorageRevision);
          }
          if (url.pathname === '/api/document') return library.save(data);
          if (url.pathname === '/api/library/rename')
            return library.rename(
              z
                .object({
                  from: z.string(),
                  to: z.string(),
                  revision: z.string().regex(/^[a-f0-9]{64}$/),
                  workspace: z.string(),
                })
                .strict()
                .parse(data),
            );
          if (url.pathname === '/api/library/duplicate')
            return library.duplicate(
              z
                .object({
                  from: z.string(),
                  to: z.string(),
                  revision: z.string().regex(/^[a-f0-9]{64}$/),
                  workspace: z.string(),
                })
                .strict()
                .parse(data),
            );
          if (url.pathname === '/api/library/trash')
            return library.trash(
              z
                .object({
                  path: z.string(),
                  revision: z.string().regex(/^[a-f0-9]{64}$/),
                  workspace: z.string(),
                })
                .strict()
                .parse(data),
            );
          if (url.pathname === '/api/library/restore')
            return library.restore(
              z
                .object({
                  trashId: z.string(),
                  revision: z.string().regex(/^[a-f0-9]{64}$/),
                  to: z.string().optional(),
                  workspace: z.string(),
                })
                .strict()
                .parse(data),
            );
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
