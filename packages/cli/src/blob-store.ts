import { createHash } from 'node:crypto';
import { parseDocument, serializeDocument } from '../../core/src/index';
import { HttpError, type createFileLibrary } from './file-library';
import { relativePath } from './agent-access';
import type { Identity } from './google';

export type BlobObject = { pathname: string; size: number; uploadedAt: Date; text?: string };
export type BlobStore = {
  get(pathname: string): Promise<{ text: string; size: number; uploadedAt: Date } | null>;
  put(pathname: string, text: string): Promise<void>;
  list(prefix: string): Promise<BlobObject[]>;
};

const revision = (text: string) => createHash('sha256').update(text).digest('hex');
export const ownerKey = (identity: Identity) =>
  createHash('sha256').update(`google:${identity.sub}`).digest('hex');

async function vercelBlobStore(): Promise<BlobStore> {
  const { get, put, list, BlobNotFoundError } = await import('@vercel/blob');
  const streamText = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  };
  return {
    async get(pathname) {
      try {
        const result = await get(pathname, { access: 'private', useCache: false });
        if (!result || result.statusCode !== 200) return null;
        const text = await streamText(result.stream);
        return { text, size: result.blob.size, uploadedAt: result.blob.uploadedAt };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async put(pathname, text) {
      await put(pathname, text, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        contentType: 'application/json',
      });
    },
    async list(prefix) {
      const items: BlobObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        items.push(
          ...page.blobs.map((b) => ({
            pathname: b.pathname,
            size: b.size,
            uploadedAt: b.uploadedAt,
          })),
        );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return items;
    },
  };
}

export async function createBlobLibrary(
  store: BlobStore,
  prefix: string,
  limits?: { bytes: number; files: number },
) {
  const workspace = `blob:${prefix}`;
  let mutations = Promise.resolve();
  const key = (path: string) => `${prefix}${path}`;
  const list = async () => {
    const blobs = await store.list(prefix);
    const items: { path: string; title: string; modified: string; error?: string }[] = [],
      folders = new Set<string>();
    let bytes = 0;
    for (const blob of blobs) {
      if (!blob.pathname.startsWith(prefix) || !blob.pathname.endsWith('.forma.json')) continue;
      const path = blob.pathname.slice(prefix.length);
      if (!path || path.split('/').some((p) => !p || p.startsWith('.'))) continue;
      bytes += blob.size;
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
      let title = parts.at(-1)!,
        error: string | undefined;
      try {
        const file = await store.get(blob.pathname);
        if (!file) throw new Error('Missing diagram.');
        if (file.size > 5_000_000) throw new Error('File exceeds 5 MB.');
        title = parseDocument(JSON.parse(file.text)).title;
      } catch (e) {
        error = (e as Error).message;
      }
      items.push({
        path,
        title,
        modified: blob.uploadedAt.toISOString(),
        ...(error ? { error } : {}),
      });
    }
    return {
      mode: 'hosted',
      bytes,
      directory: 'Your private library',
      workspace,
      items: items.sort((a, b) => a.path.localeCompare(b.path)),
      folders: [...folders].sort(),
    };
  };
  const read = async (path: string, expectedWorkspace: string) => {
    if (expectedWorkspace !== workspace)
      throw new HttpError(409, 'Library changed. Refresh the library before opening a file.');
    relativePath(path);
    const file = await store.get(key(path));
    if (!file) {
      const err = new Error('Not found.') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    if (file.size > 5_000_000) throw new HttpError(413, 'File exceeds 5 MB.');
    return { document: parseDocument(JSON.parse(file.text)), revision: revision(file.text) };
  };
  const save = (data: {
    path: string;
    document: unknown;
    revision: string | null;
    workspace: string;
  }) => {
    const operation = async () => {
      if (data.workspace !== workspace)
        throw new HttpError(409, 'Library changed. Reopen the diagram from the current library.');
      relativePath(data.path);
      let content: string;
      try {
        content = serializeDocument(parseDocument(data.document));
      } catch {
        throw new HttpError(400, 'Invalid diagram document.');
      }
      if (Buffer.byteLength(content) > 5_000_000)
        throw new HttpError(413, 'Document exceeds 5 MB.');
      const existing = await store.get(key(data.path));
      if ((existing === null ? null : revision(existing.text)) !== data.revision)
        throw new HttpError(
          409,
          'This file changed on disk. Your edits are still here. Open the disk version from Library or save your edits under a new path.',
        );
      if (limits) {
        const inventory = await list();
        if (
          (existing === null && inventory.items.length >= limits.files) ||
          inventory.bytes - Buffer.byteLength(existing?.text ?? '') + Buffer.byteLength(content) >
            limits.bytes
        )
          throw new HttpError(
            413,
            'Your library storage quota is full. Contact your administrator.',
          );
      }
      await store.put(key(data.path), content);
      return { path: data.path, revision: revision(content), workspace };
    };
    const result = mutations.then(operation);
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  return { list, read, save, workspace, root: prefix };
}

export async function blobLibraryFor(
  store: BlobStore,
  identity: Identity,
  limits: { bytes: number; files: number },
  maxUsers: number,
) {
  const id = ownerKey(identity);
  const prefix = `users/${id}/diagrams/`;
  const identities = (await store.list('users/')).filter((b) =>
    b.pathname.endsWith('/identity.json'),
  );
  if (
    !identities.some((b) => b.pathname === `users/${id}/identity.json`) &&
    identities.length >= maxUsers
  )
    throw new HttpError(
      503,
      'This workspace has reached its user limit. Contact your administrator.',
    );
  await store.put(
    `users/${id}/identity.json`,
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
  );
  return createBlobLibrary(store, prefix, limits);
}

export async function defaultVercelBlobStore() {
  return vercelBlobStore();
}

export function memoryBlobStore(seed: Map<string, string> = new Map()): BlobStore {
  const files = new Map(seed);
  return {
    async get(pathname) {
      const text = files.get(pathname);
      if (text === undefined) return null;
      return { text, size: Buffer.byteLength(text), uploadedAt: new Date(0) };
    },
    async put(pathname, text) {
      files.set(pathname, text);
    },
    async list(prefix) {
      return [...files]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, text]) => ({
          pathname,
          size: Buffer.byteLength(text),
          uploadedAt: new Date(0),
          text,
        }));
    },
  };
}

export type DiagramLibrary = Awaited<ReturnType<typeof createFileLibrary>>;
