import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { HttpError } from './file-library';
export function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
export async function readBody(req: IncomingMessage) {
  if (
    req.headers['x-forma-request'] !== '1' ||
    !req.headers['content-type']?.startsWith('application/json')
  )
    throw new HttpError(405, 'Unsupported library request.');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5_000_000) throw new HttpError(413, 'Document exceeds 5 MB.');
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new HttpError(400, 'Expected a JSON object.');
  return data;
}
export async function serveAsset(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  assetsPath: string,
  mode: 'local' | 'hosted',
) {
  if (req.method !== 'GET' && req.method !== 'HEAD')
    throw new HttpError(405, 'Read-only asset route.');
  const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
  const assets = await realpath(resolve(assetsPath)),
    file = resolve(assets, relative);
  if (!file.startsWith(assets + sep)) throw new HttpError(403, 'Invalid asset path.');
  const real = await realpath(file);
  if (!real.startsWith(assets + sep)) throw new HttpError(403, 'Invalid asset target.');
  let bytes = await readFile(real);
  if (extname(file) === '.html')
    bytes = Buffer.from(
      bytes.toString().replace('<head>', `<head><meta name="forma-${mode}" content="1">`),
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
    'Cache-Control': mode === 'hosted' ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}
