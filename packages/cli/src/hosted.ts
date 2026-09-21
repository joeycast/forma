import { ZodError } from 'zod';
import { createServer, type IncomingMessage } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, lstat, readdir, writeFile, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFileLibrary, HttpError } from './file-library';
import { json, readBody, serveAsset } from './http';
import { googleProvider, type IdentityProvider, type Identity, type LoginAttempt } from './google';
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookies = (req: IncomingMessage) =>
  Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1)];
    }),
  );
export type HostedOptions = {
  directory: string;
  assets: string;
  publicUrl: string;
  clientId?: string;
  clientSecret?: string;
  allowedEmails?: string[];
  allowedDomains?: string[];
  host?: string;
  port?: number;
  maxBytes?: number;
  maxFiles?: number;
  maxUsers?: number;
  /** In-process test injection only. No environment variable enables a fake login. */
  provider?: IdentityProvider;
  now?: () => number;
  sessionMs?: number;
};
export async function createHostedServer(options: HostedOptions) {
  let publicUrl = new URL(options.publicUrl);
  if (
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.pathname !== '/' ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new Error(
      'FORMA_PUBLIC_URL must be an origin without credentials, path, query or fragment.',
    );
  const development =
    publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname);
  if (publicUrl.protocol !== 'https:' && !development)
    throw new Error(
      'Hosted mode requires HTTPS (HTTP is permitted only on loopback for development).',
    );
  const emails = new Set(
    (options.allowedEmails ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const domains = new Set(
    (options.allowedDomains ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  if (!emails.size && !domains.size)
    throw new Error('Configure at least one allowed Google email or Workspace domain.');
  const maxBytes = options.maxBytes ?? 100_000_000,
    maxFiles = options.maxFiles ?? 1000,
    maxUsers = options.maxUsers ?? 500;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(maxFiles) ||
    maxFiles < 1 ||
    maxFiles > 1000 ||
    !Number.isSafeInteger(maxUsers) ||
    maxUsers < 1
  )
    throw new Error('Invalid storage limits. Max files must be 1–1000.');
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, '.forma-host.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(String(process.pid));
  } catch {
    throw new Error(
      'Hosted data directory is already locked. Stop the other process; after a crash, verify it is stopped before removing .forma-host.lock.',
    );
  }
  const release = async () => {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  };
  try {
    const now = options.now ?? Date.now,
      sessionMs = options.sessionMs ?? 12 * 60 * 60 * 1000;
    const pending = new Map<string, LoginAttempt & { expires: number }>();
    const sessions = new Map<string, { identity: Identity; expires: number }>();
    const libraries = new Map<string, Awaited<ReturnType<typeof createFileLibrary>>>();
    let registrations = Promise.resolve();
    const sessionName = development ? 'forma-session' : '__Host-forma-session';
    const stateName = development ? 'forma-state' : '__Host-forma-state';
    const cookie = (name: string, value: string, age: number) =>
      `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${development ? '' : '; Secure'}`;
    const allowed = (identity: Identity) =>
      !!identity.sub &&
      !!identity.email &&
      identity.email_verified === true &&
      (emails.has(identity.email.toLowerCase()) ||
        (!!identity.hd && domains.has(identity.hd.toLowerCase())));
    const prune = () => {
      for (const [key, v] of pending) if (v.expires <= now()) pending.delete(key);
      for (const [key, v] of sessions) if (v.expires <= now()) sessions.delete(key);
    };
    const usersRoot = join(directory, 'users');
    await mkdir(usersRoot, { recursive: true, mode: 0o700 });
    if ((await lstat(usersRoot)).isSymbolicLink())
      throw new Error('Hosted users directory cannot be a symlink.');
    const libraryFor = async (identity: Identity) => {
      const id = hash(`google:${identity.sub}`);
      const operation = async () => {
        if (libraries.has(id)) return libraries.get(id)!;
        const userRoot = join(usersRoot, id);
        const entries = await readdir(usersRoot);
        if (!entries.includes(id) && entries.length >= maxUsers)
          throw new HttpError(
            503,
            'This workspace has reached its user limit. Contact your administrator.',
          );
        await mkdir(userRoot, { recursive: true, mode: 0o700 });
        if ((await lstat(userRoot)).isSymbolicLink())
          throw new HttpError(400, 'Invalid user storage.');
        const diagramRoot = join(userRoot, 'diagrams');
        await mkdir(diagramRoot, { recursive: true, mode: 0o700 });
        if ((await lstat(diagramRoot)).isSymbolicLink())
          throw new HttpError(400, 'Invalid diagram storage.');
        await writeFile(
          join(userRoot, 'identity.json'),
          JSON.stringify(
            {
              provider: 'google',
              subject: identity.sub,
              email: identity.email,
              name: identity.name ?? '',
            },
            null,
            2,
          ) + '\n',
          { mode: 0o600 },
        );
        const library = await createFileLibrary(diagramRoot, { bytes: maxBytes, files: maxFiles });
        libraries.set(id, library);
        return library;
      };
      const result = registrations.then(operation);
      registrations = result.then(
        () => {},
        () => {},
      );
      return result;
    };
    let provider: IdentityProvider;
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      if (!development) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const redirect = (path: string) => {
        res.writeHead(303, { Location: path });
        res.end();
      };
      try {
        if (req.headers.host !== publicUrl.host) throw new HttpError(403, 'Unrecognized host.');
        if (req.headers.origin && req.headers.origin !== publicUrl.origin)
          throw new HttpError(403, 'Cross-origin access is not allowed.');
        const url = new URL(req.url ?? '/', publicUrl.origin);
        prune();
        const jar = cookies(req),
          session = sessions.get(hash(jar[sessionName] ?? ''));
        if (req.method === 'GET' && url.pathname === '/healthz') {
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === 'GET' && url.pathname === '/api/session') {
          json(res, 200, {
            mode: 'hosted',
            user:
              session && allowed(session.identity)
                ? {
                    name: session.identity.name ?? session.identity.email,
                    email: session.identity.email,
                  }
                : null,
          });
          return;
        }
        if (req.method === 'GET' && url.pathname === '/auth/login') {
          if (pending.size >= 1000) throw new HttpError(429, 'Sign-in is busy. Try again shortly.');
          const state = token(),
            verifier = token(),
            attempt = {
              state,
              verifier,
              nonce: token(),
              challenge: createHash('sha256').update(verifier).digest('base64url'),
              expires: now() + 600_000,
            };
          pending.set(state, attempt);
          res.setHeader('Set-Cookie', cookie(stateName, state, 600));
          redirect(provider.authorize(attempt));
          return;
        }
        if (req.method === 'GET' && url.pathname === '/auth/callback') {
          const state = url.searchParams.get('state') ?? '',
            attempt = pending.get(state);
          res.setHeader('Set-Cookie', cookie(stateName, '', 0));
          if (!attempt || jar[stateName] !== state) {
            redirect('/?authError=expired');
            return;
          }
          pending.delete(state);
          if (url.searchParams.has('error') || !url.searchParams.get('code')) {
            redirect('/?authError=cancelled');
            return;
          }
          let identity: Identity;
          try {
            identity = await provider.exchange(url.searchParams.get('code')!, attempt);
            if (identity.nonce !== attempt.nonce) throw new Error('Nonce mismatch');
          } catch {
            redirect('/?authError=failed');
            return;
          }
          if (!allowed(identity)) {
            redirect('/?authError=denied');
            return;
          }
          await libraryFor(identity);
          if (sessions.size >= 10_000)
            throw new HttpError(503, 'Session capacity reached. Try again later.');
          sessions.delete(hash(jar[sessionName] ?? ''));
          const value = token();
          sessions.set(hash(value), { identity, expires: now() + sessionMs });
          res.setHeader('Set-Cookie', [
            cookie(stateName, '', 0),
            cookie(sessionName, value, Math.ceil(sessionMs / 1000)),
          ]);
          redirect('/');
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          if (!session || !allowed(session.identity))
            throw new HttpError(
              401,
              'Your session expired. Export unsaved changes, then sign in again.',
            );
          if (req.method === 'POST') {
            if (req.headers.origin !== publicUrl.origin)
              throw new HttpError(403, 'A same-origin request is required.');
            const data = await readBody(req);
            if (url.pathname === '/api/logout') {
              sessions.delete(hash(jar[sessionName] ?? ''));
              res.setHeader('Set-Cookie', cookie(sessionName, '', 0));
              json(res, 200, { ok: true });
              return;
            }
            if (url.pathname === '/api/document') {
              json(res, 200, await (await libraryFor(session.identity)).save(data));
              return;
            }
            throw new HttpError(405, 'This operation is not available in hosted mode.');
          }
          const library = await libraryFor(session.identity);
          if (req.method === 'GET' && url.pathname === '/api/library') {
            const value = await library.list();
            json(res, 200, {
              ...value,
              mode: 'hosted',
              directory: 'Your private library',
              owner: session.identity.email,
              quota: { bytes: maxBytes, files: maxFiles },
            });
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
          throw new HttpError(404, 'Unknown library operation.');
        }
        await serveAsset(req, res, url, options.assets, 'hosted');
      } catch (error) {
        const e = error as NodeJS.ErrnoException & { status?: number };
        const bad = e instanceof SyntaxError || e instanceof ZodError;
        json(res, e.status ?? (e.code === 'ENOENT' ? 404 : bad ? 400 : 500), {
          error: e.status
            ? e.message
            : e.code === 'ENOENT'
              ? 'Not found.'
              : bad
                ? 'Invalid document or request.'
                : 'The server could not complete the request.',
        });
      }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(
        options.port ?? 4242,
        development ? '127.0.0.1' : (options.host ?? '127.0.0.1'),
        resolve,
      );
    });
    if (publicUrl.port === '0') {
      publicUrl = new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    }
    try {
      provider =
        options.provider ??
        googleProvider(
          options.clientId ?? '',
          options.clientSecret ?? '',
          `${publicUrl.origin}/auth/callback`,
        );
    } catch (e) {
      server.close();
      throw e;
    }
    server.once('close', () => {
      sessions.clear();
      pending.clear();
      void release();
    });
    return server;
  } catch (e) {
    await release();
    throw e;
  }
}
