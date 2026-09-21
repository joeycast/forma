import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHostedServer, type HostedHandler } from '../packages/cli/src/hosted';
import { defaultVercelBlobStore } from '../packages/cli/src/blob-store';

let runtime: HostedHandler | undefined;

function hostedPath(req: IncomingMessage) {
  const url = new URL(req.url ?? '/', 'https://forma.local');
  if (url.pathname === '/api/healthz') url.pathname = '/healthz';
  else if (url.pathname === '/api/mcp') url.pathname = '/mcp';
  else if (url.pathname.startsWith('/api/auth/')) url.pathname = url.pathname.slice(4);
  req.url = url.pathname + url.search;
}

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

function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

async function app() {
  if (runtime) return runtime;
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
  hostedPath(req);
  const pathname = new URL(req.url ?? '/', 'https://forma.local').pathname;
  if (!configured()) {
    if (pathname === '/healthz') {
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
  await (await app()).handle(req, res);
}
