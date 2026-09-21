import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostedHandler } from '../packages/cli/src/hosted';

let runtime: HostedHandler | undefined;

const split = (key: string) =>
  (process.env[key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function configured() {
  return !!(
    process.env.FORMA_PUBLIC_URL &&
    (process.env.FORMA_SESSION_SECRET || process.env.FORMA_GOOGLE_CLIENT_SECRET) &&
    process.env.FORMA_GOOGLE_CLIENT_ID &&
    process.env.FORMA_GOOGLE_CLIENT_SECRET &&
    (split('FORMA_ALLOWED_EMAILS').length || split('FORMA_ALLOWED_DOMAINS').length)
  );
}

function pathnameOf(req: IncomingMessage) {
  const raw =
    (typeof req.headers['x-forwarded-uri'] === 'string' && req.headers['x-forwarded-uri']) ||
    (typeof req.headers['x-invoke-path'] === 'string' && req.headers['x-invoke-path']) ||
    req.url ||
    '/';
  try {
    return new URL(raw, 'https://forma.local').pathname;
  } catch {
    return raw.split('?')[0] || '/';
  }
}

function send(res: ServerResponse, status: number, value: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

async function app() {
  if (runtime) return runtime;
  const { createHostedServer } = await import('../packages/cli/src/hosted');
  const { defaultVercelBlobStore } = await import('../packages/cli/src/blob-store');
  runtime = await createHostedServer({
    listen: false,
    serveAssets: false,
    blobStore: await defaultVercelBlobStore(),
    sessionSecret: process.env.FORMA_SESSION_SECRET ?? process.env.FORMA_GOOGLE_CLIENT_SECRET ?? '',
    publicUrl: process.env.FORMA_PUBLIC_URL!,
    clientId: process.env.FORMA_GOOGLE_CLIENT_ID,
    clientSecret: process.env.FORMA_GOOGLE_CLIENT_SECRET,
    allowedEmails: split('FORMA_ALLOWED_EMAILS'),
    allowedDomains: split('FORMA_ALLOWED_DOMAINS'),
    enableMcp: process.env.FORMA_ENABLE_MCP === 'true',
  });
  return runtime;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const pathname = pathnameOf(req);
    if (!configured()) {
      if (pathname === '/healthz' || pathname === '/api/healthz') {
        send(res, 200, { ok: true, configured: false });
        return;
      }
      if (pathname === '/api/session') {
        send(res, 200, { mode: 'hosted', user: null, configured: false });
        return;
      }
      send(res, 503, {
        error:
          'Set FORMA_GOOGLE_CLIENT_ID, FORMA_GOOGLE_CLIENT_SECRET, and FORMA_ALLOWED_EMAILS on this Vercel project.',
      });
      return;
    }
    const url = new URL(req.url ?? '/', 'https://forma.local');
    if (pathname === '/api/healthz') url.pathname = '/healthz';
    else if (pathname === '/api/mcp') url.pathname = '/mcp';
    else if (pathname.startsWith('/api/auth/')) url.pathname = pathname.slice(4);
    else url.pathname = pathname;
    req.url = url.pathname + url.search;
    await (await app()).handle(req, res);
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : 'Hosted request failed.' });
  }
}
