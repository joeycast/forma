import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, serializeDocument } from '../../core/src/index';
import { HttpError, type createFileLibrary } from './file-library';
import { relativePath } from './agent-access';
import type { Identity } from './google';

export type BlobObject = { pathname: string; size: number; uploadedAt: Date; text?: string };
export type BlobStore = {
  get(
    pathname: string,
  ): Promise<{ text: string; size: number; uploadedAt: Date; etag: string } | null>;
  put(pathname: string, text: string): Promise<void>;
  /** Atomic compare-and-swap. A null etag means create only; a null result means conflict. */
  putIfMatch(pathname: string, text: string, etag: string | null): Promise<string | null>;
  list(prefix: string): Promise<BlobObject[]>;
};

const revision = (text: string) => createHash('sha256').update(text).digest('hex');
export const ownerKey = (identity: Identity) =>
  createHash('sha256').update(`google:${identity.sub}`).digest('hex');

type VercelBlobClient = Pick<
  typeof import('@vercel/blob'),
  'get' | 'put' | 'list' | 'BlobNotFoundError' | 'BlobPreconditionFailedError'
>;

export async function createVercelBlobStore(client?: VercelBlobClient): Promise<BlobStore> {
  const { get, put, list, BlobNotFoundError, BlobPreconditionFailedError } =
    client ?? (await import('@vercel/blob'));
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
  const read = async (pathname: string) => {
    try {
      const result = await get(pathname, { access: 'private', useCache: false });
      if (!result || result.statusCode !== 200) return null;
      const text = await streamText(result.stream);
      return {
        text,
        size: result.blob.size,
        uploadedAt: result.blob.uploadedAt,
        etag: result.blob.etag,
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  };
  return {
    get: read,
    async put(pathname, text) {
      await put(pathname, text, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        contentType: 'application/json',
      });
    },
    async putIfMatch(pathname, text, etag) {
      try {
        const result = await put(pathname, text, {
          access: 'private',
          addRandomSuffix: false,
          ...(etag === null ? { allowOverwrite: false } : { ifMatch: etag }),
          cacheControlMaxAge: 0,
          contentType: 'application/json',
        });
        return result.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) return null;
        // The SDK maps `precondition_failed` to BlobPreconditionFailedError, but
        // older API responses for create-only collisions may map to BlobUnknownError.
        // Re-read the exact key before translating that failure to a CAS conflict.
        if (etag === null) {
          try {
            if (await read(pathname)) return null;
          } catch {
            // Preserve the original write failure when the verification read fails.
          }
        }
        if (
          (error as { status?: number })?.status === 409 ||
          (error as { status?: number })?.status === 412
        )
          return null;
        throw error;
      }
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
  if (typeof store.putIfMatch !== 'function')
    throw new HttpError(503, 'Storage does not support atomic conditional writes.');
  const workspace = `blob:${prefix}`;
  const key = (path: string) => `${prefix}${path}`;
  const libraryPath = (path: string) => {
    relativePath(path);
    if (
      path !==
      path
        .split('/')
        .map((segment) => segment.normalize('NFC'))
        .join('/')
    )
      throw new HttpError(400, 'Use a normalized relative file path.');
    return path;
  };
  const manifestKey = key('.forma-library.json');
  type Entry = { blob: string; revision: string; bytes: number; title: string; modified: string };
  type TrashEntry = Entry & { trashId: string; path: string; deletedAt: string };
  type Manifest = {
    version: 1;
    generation: number;
    entries: Record<string, Entry>;
    trash: TrashEntry[];
  };
  const validManifest = (text: string): Manifest => {
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(
        503,
        'Library metadata is corrupt. Restore a valid library manifest before continuing.',
      );
    }
    if (
      !data ||
      data.version !== 1 ||
      !Number.isSafeInteger(data.generation) ||
      data.generation < 0 ||
      !data.entries ||
      typeof data.entries !== 'object' ||
      Array.isArray(data.entries) ||
      !Array.isArray(data.trash)
    )
      throw new HttpError(
        503,
        'Library metadata is corrupt. Restore a valid library manifest before continuing.',
      );
    const checkEntry = (entry: any) => {
      if (
        !entry ||
        typeof entry.blob !== 'string' ||
        !entry.blob.startsWith(`${prefix}.versions/`) ||
        !/^[a-f0-9]{64}$/.test(entry.revision) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0 ||
        typeof entry.title !== 'string' ||
        typeof entry.modified !== 'string'
      )
        throw new HttpError(
          503,
          'Library metadata is corrupt. Restore a valid library manifest before continuing.',
        );
    };
    const trashIds = new Set<string>();
    for (const [path, entry] of Object.entries(data.entries)) {
      try {
        libraryPath(path);
      } catch {
        throw new HttpError(
          503,
          'Library metadata is corrupt. Restore a valid library manifest before continuing.',
        );
      }
      checkEntry(entry);
    }
    for (const item of data.trash) {
      try {
        libraryPath(item.path);
      } catch {
        throw new HttpError(
          503,
          'Library metadata is corrupt. Restore a valid library manifest before continuing.',
        );
      }
      checkEntry(item);
      if (typeof item.trashId !== 'string' || typeof item.deletedAt !== 'string')
        throw new HttpError(
          503,
          'Library metadata is corrupt. Restore a valid library manifest before continuing.',
        );
      if (!/^[a-f0-9-]{36}$/.test(item.trashId) || trashIds.has(item.trashId))
        throw new HttpError(
          503,
          'Library metadata is corrupt. Restore a valid library manifest before continuing.',
        );
      trashIds.add(item.trashId);
    }
    return data as Manifest;
  };
  const emptyManifest = (): Manifest => ({ version: 1, generation: 0, entries: {}, trash: [] });
  const putVersion = async (text: string) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const blob = `${prefix}.versions/${randomUUID()}.json`;
      const written = await store.putIfMatch(blob, text, null);
      if (written) return blob;
    }
    throw new HttpError(503, 'Could not allocate an immutable library version. Retry the request.');
  };
  const manifest = async () => {
    const current = await store.get(manifestKey);
    if (current) return { value: validManifest(current.text), etag: current.etag };
    // One-time safe migration: copy valid legacy filenames and bytes to immutable
    // version keys, then race to publish a create-only manifest. Losers use the winner.
    const migrated = emptyManifest();
    const legacy = await store.list(prefix);
    for (const item of legacy) {
      if (!item.pathname.startsWith(prefix) || !item.pathname.endsWith('.forma.json')) continue;
      const path = item.pathname.slice(prefix.length);
      try {
        libraryPath(path);
      } catch {
        continue;
      }
      const file = await store.get(item.pathname);
      if (!file) continue;
      let title = path.split('/').at(-1)!;
      try {
        title = parseDocument(JSON.parse(file.text)).title;
      } catch {
        /* keep legacy filename for corrupt historical files */
      }
      const rev = revision(file.text),
        blob = await putVersion(file.text);
      migrated.entries[path] = {
        blob,
        revision: rev,
        bytes: Buffer.byteLength(file.text),
        title,
        modified: item.uploadedAt.toISOString(),
      };
    }
    const created = await store.putIfMatch(manifestKey, JSON.stringify(migrated) + '\n', null);
    if (created) return { value: migrated, etag: created };
    const winner = await store.get(manifestKey);
    if (!winner)
      throw new HttpError(503, 'Library metadata could not be initialized. Retry the request.');
    return { value: validManifest(winner.text), etag: winner.etag };
  };
  const fileAt = async (entry: Entry) => {
    const file = await store.get(entry.blob);
    if (!file || revision(file.text) !== entry.revision)
      throw new HttpError(
        503,
        'A library document version is missing or corrupt. Restore the library backup before continuing.',
      );
    return file.text;
  };
  const checkWorkspace = (value: string) => {
    if (value !== workspace)
      throw new HttpError(409, 'Library changed. Refresh the library before continuing.');
  };
  const transact = async <T>(
    mutate: (state: Manifest) => Promise<{ state: Manifest; result: T }>,
  ): Promise<T> => {
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = await manifest();
      const changed = await mutate(current.value);
      changed.state.generation = current.value.generation + 1;
      const committed = await store.putIfMatch(
        manifestKey,
        JSON.stringify(changed.state) + '\n',
        current.etag,
      );
      if (committed) return changed.result;
    }
    throw new HttpError(409, 'Library changed repeatedly. Retry the operation.');
  };
  const usage = (state: Manifest) => {
    const entries = Object.values(state.entries);
    const retained = state.trash;
    return {
      files: entries.length + retained.length,
      bytes: [...entries, ...retained].reduce((sum, entry) => sum + entry.bytes, 0),
    };
  };
  const quota = (state: Manifest, files: number, bytes: number) => {
    if (limits && (files > limits.files || bytes > limits.bytes))
      throw new HttpError(413, 'Your library storage quota is full. Contact your administrator.');
  };
  const list = async () => {
    const { value } = await manifest();
    const folders = new Set<string>();
    const items = Object.entries(value.entries).map(([path, entry]) => {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
      return { path, title: entry.title, revision: entry.revision, modified: entry.modified };
    });
    return {
      mode: 'hosted',
      bytes: usage(value).bytes,
      directory: 'Your private library',
      workspace,
      items: items.sort((a, b) => a.path.localeCompare(b.path)),
      folders: [...folders].sort(),
      trash: value.trash.map(({ trashId, path, title, revision: rev, deletedAt }) => ({
        trashId,
        path,
        title,
        revision: rev,
        deletedAt,
      })),
    };
  };
  const read = async (path: string, expectedWorkspace: string) => {
    checkWorkspace(expectedWorkspace);
    libraryPath(path);
    const { value } = await manifest();
    const entry = value.entries[path];
    if (!entry) {
      const err = new Error('Not found.') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    if (entry.bytes > 5_000_000) throw new HttpError(413, 'File exceeds 5 MB.');
    return { document: parseDocument(JSON.parse(await fileAt(entry))), revision: entry.revision };
  };
  const save = async (data: {
    path: string;
    document: unknown;
    revision: string | null;
    workspace: string;
  }) => {
    checkWorkspace(data.workspace);
    libraryPath(data.path);
    let content: string;
    try {
      content = serializeDocument(parseDocument(data.document));
    } catch {
      throw new HttpError(400, 'Invalid diagram document.');
    }
    const bytes = Buffer.byteLength(content);
    if (bytes > 5_000_000) throw new HttpError(413, 'Document exceeds 5 MB.');
    const before = await manifest();
    const preexisting = before.value.entries[data.path];
    if ((preexisting?.revision ?? null) !== data.revision)
      throw new HttpError(
        409,
        'This file changed on disk. Your edits are still here. Open the disk version from Library or save your edits under a new path.',
      );
    const preflight = usage(before.value);
    quota(
      before.value,
      preflight.files + (preexisting ? 0 : 1),
      preflight.bytes - (preexisting?.bytes ?? 0) + bytes,
    );
    const blob = await putVersion(content),
      rev = revision(content);
    return transact(async (state) => {
      const existing = state.entries[data.path];
      if ((existing?.revision ?? null) !== data.revision)
        throw new HttpError(
          409,
          'This file changed on disk. Your edits are still here. Open the disk version from Library or save your edits under a new path.',
        );
      const use = usage(state),
        nextFiles = use.files + (existing ? 0 : 1),
        nextBytes = use.bytes - (existing?.bytes ?? 0) + bytes;
      quota(state, nextFiles, nextBytes);
      let title = data.path.split('/').at(-1)!;
      try {
        title = parseDocument(JSON.parse(content)).title;
      } catch {}
      state.entries[data.path] = {
        blob,
        revision: rev,
        bytes,
        title,
        modified: new Date().toISOString(),
      };
      return { state, result: { path: data.path, revision: rev, workspace } };
    });
  };
  const rename = async (data: {
    from: string;
    to: string;
    revision: string;
    workspace: string;
  }) => {
    checkWorkspace(data.workspace);
    libraryPath(data.from);
    libraryPath(data.to);
    if (data.from === data.to) throw new HttpError(400, 'Choose a different destination path.');
    return transact(async (state) => {
      const entry = state.entries[data.from];
      if (!entry || entry.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      if (state.entries[data.to]) throw new HttpError(409, 'The destination path already exists.');
      delete state.entries[data.from];
      state.entries[data.to] = { ...entry, modified: new Date().toISOString() };
      return { state, result: { path: data.to, revision: entry.revision, workspace } };
    });
  };
  const duplicate = async (data: {
    from: string;
    to: string;
    revision: string;
    workspace: string;
  }) => {
    checkWorkspace(data.workspace);
    libraryPath(data.from);
    libraryPath(data.to);
    return transact(async (state) => {
      const entry = state.entries[data.from];
      if (!entry || entry.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      if (state.entries[data.to]) throw new HttpError(409, 'The destination path already exists.');
      const use = usage(state);
      quota(state, use.files + 1, use.bytes + entry.bytes);
      state.entries[data.to] = { ...entry, modified: new Date().toISOString() };
      return { state, result: { path: data.to, revision: entry.revision, workspace } };
    });
  };
  const trash = async (data: { path: string; revision: string; workspace: string }) => {
    checkWorkspace(data.workspace);
    libraryPath(data.path);
    return transact(async (state) => {
      const entry = state.entries[data.path];
      if (!entry || entry.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      const trashId = randomUUID();
      delete state.entries[data.path];
      state.trash.push({ ...entry, trashId, path: data.path, deletedAt: new Date().toISOString() });
      return { state, result: { trashId, path: data.path, revision: entry.revision, workspace } };
    });
  };
  const restore = async (data: {
    trashId: string;
    revision: string;
    to?: string;
    workspace: string;
  }) => {
    checkWorkspace(data.workspace);
    if (data.to) libraryPath(data.to);
    return transact(async (state) => {
      const index = state.trash.findIndex((entry) => entry.trashId === data.trashId);
      const removed = state.trash[index];
      if (!removed || removed.revision !== data.revision)
        throw new HttpError(409, 'This trash item changed. Refresh the library and retry.');
      const path = data.to || removed.path;
      if (state.entries[path]) throw new HttpError(409, 'The destination path already exists.');
      state.trash.splice(index, 1);
      state.entries[path] = {
        blob: removed.blob,
        revision: removed.revision,
        bytes: removed.bytes,
        title: removed.title,
        modified: new Date().toISOString(),
      };
      return { state, result: { path, revision: removed.revision, workspace } };
    });
  };
  return { list, read, save, rename, duplicate, trash, restore, workspace, root: prefix };
}

export async function blobLibraryFor(
  store: BlobStore,
  identity: Identity,
  limits: { bytes: number; files: number },
  maxUsers: number,
) {
  const id = ownerKey(identity);
  const prefix = `users/${id}/diagrams/`;
  const usersKey = 'users/.forma-users.json';
  let registered = false;
  for (let attempt = 0; attempt < 32; attempt++) {
    const current = await store.get(usersKey);
    let owners: string[];
    if (current) {
      let parsed: any;
      try {
        parsed = JSON.parse(current.text);
      } catch {
        throw new HttpError(
          503,
          'Workspace user metadata is corrupt. Restore a valid registry before continuing.',
        );
      }
      if (
        parsed?.version !== 1 ||
        !Array.isArray(parsed.owners) ||
        parsed.owners.some(
          (owner: unknown) => typeof owner !== 'string' || !/^[a-f0-9]{64}$/.test(owner),
        )
      )
        throw new HttpError(
          503,
          'Workspace user metadata is corrupt. Restore a valid registry before continuing.',
        );
      owners = [...new Set<string>(parsed.owners as string[])];
    } else {
      const identities = (await store.list('users/')).filter((blob) =>
        blob.pathname.endsWith('/identity.json'),
      );
      owners = identities
        .map((blob) => /^users\/([a-f0-9]{64})\/identity\.json$/.exec(blob.pathname)?.[1])
        .filter((value): value is string => !!value);
    }
    if (current && owners.includes(id)) {
      registered = true;
      break;
    }
    if (!owners.includes(id) && owners.length >= maxUsers)
      throw new HttpError(
        503,
        'This workspace has reached its user limit. Contact your administrator.',
      );
    if (!owners.includes(id)) owners.push(id);
    const written = await store.putIfMatch(
      usersKey,
      JSON.stringify({ version: 1, owners }) + '\n',
      current?.etag ?? null,
    );
    if (written) {
      registered = true;
      break;
    }
  }
  if (!registered)
    throw new HttpError(409, 'Workspace user registration changed repeatedly. Retry the request.');
  const identityPath = `users/${id}/identity.json`;
  const identityText =
    JSON.stringify(
      {
        provider: 'google',
        subject: identity.sub,
        email: identity.email,
        name: identity.name ?? '',
      },
      null,
      2,
    ) + '\n';
  const identityBlob = await store.get(identityPath);
  if (!identityBlob) {
    if (!store.putIfMatch || !(await store.putIfMatch(identityPath, identityText, null)))
      throw new HttpError(409, 'User registration changed. Retry the request.');
  }
  return createBlobLibrary(store, prefix, limits);
}

export async function defaultVercelBlobStore() {
  return createVercelBlobStore();
}

export function memoryBlobStore(seed: Map<string, string> = new Map()): BlobStore {
  const files = new Map(seed);
  return {
    async get(pathname) {
      const text = files.get(pathname);
      if (text === undefined) return null;
      return { text, size: Buffer.byteLength(text), uploadedAt: new Date(0), etag: revision(text) };
    },
    async put(pathname, text) {
      files.set(pathname, text);
    },
    async putIfMatch(pathname, text, etag) {
      const current = files.get(pathname);
      if (
        etag === null ? current !== undefined : current === undefined || revision(current) !== etag
      )
        return null;
      files.set(pathname, text);
      return revision(text);
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
