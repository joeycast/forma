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

async function app() {
  if (runtime) return runtime;
  const publicUrl = process.env.FORMA_PUBLIC_URL;
  const sessionSecret =
    process.env.FORMA_SESSION_SECRET ?? process.env.FORMA_GOOGLE_CLIENT_SECRET ?? '';
  if (!publicUrl || !sessionSecret)
    throw new Error('Set FORMA_PUBLIC_URL and FORMA_SESSION_SECRET (or Google client secret).');
  const split = (key: string) =>
    (process.env[key] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  runtime = await createHostedServer({
    listen: false,
    serveAssets: false,
    blobStore: await defaultVercelBlobStore(),
    sessionSecret,
    publicUrl,
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
  await (await app()).handle(req, res);
}
