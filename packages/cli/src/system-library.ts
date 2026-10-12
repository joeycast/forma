import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, writeFile, rename, unlink, mkdir, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { designSystemSchema, type DesignSystem } from '../../core/src/index';
import { HttpError } from './file-library';
import type { BlobStore } from './blob-store';

export const SYSTEM_SNAPSHOT_LIMIT = 100;
export const SYSTEM_BYTES_LIMIT = 10 * 1024 * 1024;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
type State = { version: 1; systems: DesignSystem[] };
type Snapshot = { state: State; revision: string | null; version: string | null };
type IO = {
  read(): Promise<{ text: string; version: string } | null>;
  compareAndSwap(expected: string | null, text: string): Promise<string | null>;
};

function parse(text: string): State {
  try {
    const value = JSON.parse(text);
    if (value?.version !== 1 || !Array.isArray(value.systems)) throw new Error();
    const systems = value.systems.map((system: unknown) => designSystemSchema.parse(system));
    const seen = new Set<string>();
    for (const system of systems) {
      const key = `${system.id}\0${system.revision}`;
      if (seen.has(key)) throw new Error();
      seen.add(key);
    }
    return { version: 1, systems };
  } catch {
    throw new HttpError(
      503,
      'Design system storage is corrupt. Restore a valid system registry before continuing.',
    );
  }
}
function view(systems: DesignSystem[]) {
  const sorted = [...systems].sort(
    (a, b) => a.id.localeCompare(b.id) || a.revision.localeCompare(b.revision),
  );
  const text = canonical(sorted);
  return {
    systems: sorted,
    storageRevision: sorted.length ? digest(text) : null,
    bytes: Buffer.byteLength(text),
  };
}

export function createSystemLibrary(
  io: IO,
  limits = { snapshots: SYSTEM_SNAPSHOT_LIMIT, bytes: SYSTEM_BYTES_LIMIT },
) {
  const snapshot = async (): Promise<Snapshot> => {
    const stored = await io.read();
    if (!stored) return { state: { version: 1, systems: [] }, revision: null, version: null };
    const state = parse(stored.text),
      current = view(state.systems);
    if (current.systems.length > limits.snapshots || current.bytes > limits.bytes)
      throw new HttpError(503, 'Design system storage exceeds its configured limits.');
    return { state, revision: current.storageRevision, version: stored.version };
  };
  const list = async () => {
    const current = await snapshot();
    return { systems: view(current.state.systems).systems, storageRevision: current.revision };
  };
  const get = async (id: string, revision: string) => {
    const current = await snapshot();
    const system = current.state.systems.find(
      (item) => item.id === id && item.revision === revision,
    );
    if (!system) throw new HttpError(404, 'Design system snapshot not found.');
    return { system };
  };
  const save = async (input: unknown, expectedStorageRevision: string | null) => {
    let system: DesignSystem;
    try {
      system = JSON.parse(JSON.stringify(designSystemSchema.parse(input))) as DesignSystem;
    } catch {
      throw new HttpError(400, 'Invalid design system snapshot.');
    }
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = await snapshot();
      const index = current.state.systems.findIndex(
        (item) => item.id === system.id && item.revision === system.revision,
      );
      const state = { version: 1 as const, systems: [...current.state.systems] };
      if (index >= 0) {
        if (canonical(state.systems[index]) !== canonical(system))
          throw new HttpError(
            409,
            'This design system ID and revision already contain different content.',
          );
        return { system: state.systems[index], storageRevision: current.revision };
      }
      if (current.revision !== expectedStorageRevision)
        throw new HttpError(409, 'Design system library changed. Refresh it and retry.');
      state.systems.push(system);
      const next = view(state.systems);
      if (state.systems.length > limits.snapshots || next.bytes > limits.bytes)
        throw new HttpError(413, 'Design system storage quota is full.');
      const written = await io.compareAndSwap(current.version, JSON.stringify(state) + '\n');
      if (written) return { system, storageRevision: next.storageRevision };
    }
    throw new HttpError(409, 'Design system library changed repeatedly. Retry the request.');
  };
  const remove = async (id: string, revision: string, expectedStorageRevision: string | null) => {
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = await snapshot();
      if (current.revision !== expectedStorageRevision)
        throw new HttpError(409, 'Design system library changed. Refresh it and retry.');
      const systems = current.state.systems.filter(
        (item) => item.id !== id || item.revision !== revision,
      );
      if (systems.length === current.state.systems.length)
        throw new HttpError(404, 'Design system snapshot not found.');
      const next = view(systems),
        text = JSON.stringify({ version: 1, systems }) + '\n';
      const written = await io.compareAndSwap(current.version, text);
      if (written) return { ok: true, storageRevision: next.storageRevision };
    }
    throw new HttpError(409, 'Design system library changed repeatedly. Retry the request.');
  };
  return { list, get, save, remove };
}

export function blobSystemLibrary(
  store: BlobStore,
  owner: string,
  limits?: { snapshots: number; bytes: number },
) {
  if (!store.putIfMatch)
    throw new HttpError(503, 'Storage does not support atomic conditional writes.');
  const path = `users/${owner}/systems/.forma-systems.json`;
  return createSystemLibrary(
    {
      async read() {
        const value = await store.get(path);
        return value ? { text: value.text, version: value.etag } : null;
      },
      compareAndSwap: (expected, text) => store.putIfMatch(path, text, expected),
    },
    limits,
  );
}

export async function fileSystemLibrary(
  directory: string,
  limits?: { snapshots: number; bytes: number },
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, '.forma-systems.json'),
    lockPath = join(directory, '.forma-systems.lock');
  const locked = async <T>(operation: () => Promise<T>): Promise<T> => {
    let lock;
    for (let i = 0; i < 100; i++) {
      try {
        lock = await open(lockPath, 'wx', 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    if (!lock)
      throw new HttpError(
        503,
        'Design system storage lock is held. Verify all Forma writers are stopped before removing .forma-systems.lock; never remove a live writer lock.',
      );
    try {
      return await operation();
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => {});
    }
  };
  const io: IO = {
    async read() {
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink())
          throw new HttpError(503, 'Design system registry must be a regular file.');
        const text = await readFile(path, 'utf8');
        return { text, version: digest(text) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    compareAndSwap: (expected, text) =>
      locked(async () => {
        const current = await io.read();
        if ((current?.version ?? null) !== expected) return null;
        const temp = join(dirname(path), `.forma-systems-${randomUUID()}.tmp`);
        try {
          await writeFile(temp, text, { flag: 'wx', mode: 0o600 });
          await rename(temp, path);
        } finally {
          await unlink(temp).catch(() => {});
        }
        return digest(text);
      }),
  };
  return createSystemLibrary(io, limits);
}
