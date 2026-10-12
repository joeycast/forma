import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { HttpError } from './file-library';
import type { Identity } from './google';
import { previewDocumentPatch } from '../../core/src/document-changes';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const ownerId = (identity: Identity) => hash(`google:${identity.sub}`);

export function relativePath(path: string, folder = false) {
  if (
    typeof path !== 'string' ||
    path.length > 1024 ||
    path.includes('\\') ||
    /[\x00-\x1f]/.test(path) ||
    (path !== '' && path.split('/').some((p) => !p || p.startsWith('.'))) ||
    path.split('/').length > 13 ||
    (!folder && !path.endsWith('.forma.json')) ||
    (!folder && !path)
  )
    throw new HttpError(400, 'Use a relative path without empty, hidden or parent segments.');
  return path;
}

const recordSchema = z.object({
  id: z.string(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  identity: z.object({
    sub: z.string(),
    email: z.string(),
    email_verified: z.literal(true),
    hd: z.string().optional(),
    name: z.string().optional(),
  }),
  name: z.string(),
  permission: z.enum(['read', 'write']),
  folder: z.string(),
  created: z.number(),
  expires: z.number(),
});
export type Grant = z.infer<typeof recordSchema>;
const fileSchema = z.object({ version: z.literal(1), tokens: z.array(recordSchema).max(10000) });

export type TokenSnapshot = { text: string; version: string | null } | null;
export type TokenIO = {
  load(): Promise<TokenSnapshot>;
  save(text: string, expectedVersion: string | null): Promise<string | null>;
};
function fileTokenIO(directory: string): TokenIO {
  const path = join(directory, 'agent-tokens.json');
  const version = (text: string | null) => (text === null ? null : hash(text));
  return {
    async load() {
      try {
        const text = await readFile(path, 'utf8');
        return { text, version: version(text) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error(
          'Cannot read agent token registry. Restore or repair it before starting hosted mode.',
        );
      }
    },
    async save(text, expectedVersion) {
      const lockPath = join(directory, '.agent-tokens.lock');
      let lock;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          lock = await open(lockPath, 'wx', 0o600);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
      if (!lock)
        throw new Error(
          'Agent token registry is locked. Do not remove .agent-tokens.lock until you have verified that no hosted process is using this directory; after confirming all writers are stopped, remove the stale lock and restart.',
        );
      const tmp = join(directory, `.tokens-${randomBytes(8).toString('hex')}.tmp`);
      try {
        let current: string | null;
        try {
          current = await readFile(path, 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          current = null;
        }
        if (version(current) !== expectedVersion) return null;
        await writeFile(tmp, text, { flag: 'wx', mode: 0o600 });
        await rename(tmp, path);
        return version(text)!;
      } finally {
        await unlink(tmp).catch(() => {});
        await lock.close();
        await unlink(lockPath).catch(() => {});
      }
    },
  };
}
export async function createTokenStore(source: string | TokenIO, now: () => number = Date.now) {
  const io = typeof source === 'string' ? fileTokenIO(source) : source;
  const loaded = await io.load();
  if (loaded) validateRecords(loaded.text);
  function validateRecords(text: string): Grant[] {
    const records = fileSchema.parse(JSON.parse(text)).tokens;
    for (const r of records) relativePath(r.folder, true);
    return records;
  }
  const publicRecord = ({ digest: _digest, identity: _identity, ...value }: Grant) => value;
  const currentRecords = async () => {
    const current = await io.load();
    return current
      ? { records: validateRecords(current.text), version: current.version }
      : { records: [], version: null };
  };
  const update = async <T>(
    operation: (records: Grant[]) => Promise<{ records: Grant[]; result: T }>,
  ): Promise<T> => {
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = await currentRecords();
      const changed = await operation(current.records);
      const version = await io.save(
        JSON.stringify({ version: 1, tokens: changed.records }) + '\n',
        current.version,
      );
      if (version !== null) return changed.result;
    }
    throw new HttpError(409, 'Token registry changed repeatedly. Retry the request.');
  };
  return {
    list: async (identity: Identity) =>
      (await currentRecords()).records
        .filter((r) => r.identity.sub === identity.sub)
        .map(publicRecord),
    create: (identity: Identity, input: unknown) =>
      update(async (records) => {
        if (!identity.email || identity.email_verified !== true)
          throw new HttpError(403, 'This account cannot issue agent tokens.');
        const data = z
          .object({
            name: z.string().trim().min(1).max(80),
            permission: z.enum(['read', 'write']),
            folder: z.string().trim().default(''),
            days: z.number().int().min(1).max(90).default(30),
          })
          .strict()
          .parse(input);
        relativePath(data.folder, true);
        const current = records.filter((r) => r.expires > now());
        if (
          current.filter((r) => r.identity.sub === identity.sub).length >= 20 ||
          current.length >= 10000
        )
          throw new HttpError(409, 'Revoke an existing token before creating another.');
        const id = randomBytes(12).toString('hex'),
          secret = `forma_${id}_${randomBytes(32).toString('hex')}`;
        const record: Grant = {
          id,
          digest: hash(secret),
          identity: {
            sub: identity.sub,
            email: identity.email,
            email_verified: true,
            ...(identity.hd ? { hd: identity.hd } : {}),
            ...(identity.name ? { name: identity.name } : {}),
          },
          name: data.name,
          permission: data.permission,
          folder: data.folder,
          created: now(),
          expires: now() + data.days * 86400000,
        };
        return {
          records: [...current, record],
          result: { token: secret, ...publicRecord(record) },
        };
      }),
    revoke: (identity: Identity, id: string) =>
      update(async (records) => {
        if (!records.some((r) => r.id === id && r.identity.sub === identity.sub))
          throw new HttpError(404, 'Token not found.');
        return {
          records: records.filter((r) => r.id !== id || r.identity.sub !== identity.sub),
          result: { ok: true },
        };
      }),
    authenticate: async (authorization: string | undefined) => {
      const match = /^Bearer (forma_([a-f0-9]{24})_[a-f0-9]{64})$/.exec(authorization ?? '');
      const records = (await currentRecords()).records;
      const grant = match && records.find((r) => r.id === match[2]);
      const digest = grant?.digest ?? '0'.repeat(64);
      const presented = hash(match?.[1] ?? '');
      let equal = false;
      try {
        equal = timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(presented, 'hex'));
      } catch {
        equal = false;
      }
      if (!match || !grant || grant.expires <= now() || !equal)
        throw new HttpError(401, 'A valid, unexpired Forma agent token is required.');
      return grant;
    },
  };
}

export function createAgentService(
  getGrant: () => Promise<Grant>,
  libraryFor: (identity: Identity) => Promise<{
    workspace: string;
    list: () => Promise<{ items: { path: string }[]; folders: string[] }>;
    read: (path: string, workspace: string) => Promise<{ document: unknown; revision: string }>;
    save: (data: {
      path: string;
      document: unknown;
      revision: string | null;
      workspace: string;
    }) => Promise<{ path: string; revision: string; workspace: string }>;
  }>,
) {
  const check = async (path: string, write = false) => {
    relativePath(path);
    const grant = await getGrant();
    if (grant.folder && !path.startsWith(grant.folder + '/'))
      throw new HttpError(403, 'This path is outside the token’s folder scope.');
    if (write && grant.permission !== 'write') throw new HttpError(403, 'This token is read-only.');
    return grant;
  };
  return {
    me: async () => {
      const grant = await getGrant();
      return {
        owner: ownerId(grant.identity),
        email: grant.identity.email,
        permission: grant.permission,
        folder: grant.folder,
        expires: grant.expires,
      };
    },
    list: async () => {
      const grant = await getGrant(),
        library = await libraryFor(grant.identity),
        value = await library.list();
      const inside = (path: string) => !grant.folder || path.startsWith(grant.folder + '/');
      return {
        items: value.items.filter((i) => inside(i.path)),
        folders: value.folders.filter(inside),
      };
    },
    read: async (path: string) => {
      const grant = await check(path),
        library = await libraryFor(grant.identity);
      return {
        ...(await library.read(path, library.workspace)),
        path,
        owner: ownerId(grant.identity),
      };
    },
    write: async (data: unknown) => {
      const input = z
        .object({
          path: z.string(),
          revision: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .nullable(),
          document: z.unknown(),
        })
        .strict()
        .parse(data);
      const grant = await check(input.path, true),
        library = await libraryFor(grant.identity);
      const result = await library.save({ ...input, workspace: library.workspace });
      return { path: result.path, revision: result.revision, owner: ownerId(grant.identity) };
    },
    previewPatch: async (data: unknown) => {
      const input = z
        .object({
          path: z.string(),
          revision: z.string().regex(/^[a-f0-9]{64}$/),
          patch: z.unknown(),
        })
        .strict()
        .parse(data);
      const grant = await check(input.path),
        library = await libraryFor(grant.identity);
      const current = await library.read(input.path, library.workspace);
      if (current.revision !== input.revision)
        throw new HttpError(
          409,
          'The diagram changed since this revision. Read it again before previewing.',
        );
      const preview = previewDocumentPatch(
        current.document as import('../../core/src/document').Diagram,
        input.patch,
      );
      return {
        path: input.path,
        baseRevision: current.revision,
        candidateFingerprint: preview.candidateFingerprint,
        summary: preview.summary,
        changes: preview.changes,
        candidate: preview.candidate,
        diagnosticsStatus: 'notRun',
        owner: ownerId(grant.identity),
      };
    },
    applyPatch: async (data: unknown) => {
      const input = z
        .object({
          path: z.string(),
          revision: z.string().regex(/^[a-f0-9]{64}$/),
          patch: z.unknown(),
        })
        .strict()
        .parse(data);
      const grant = await check(input.path, true),
        library = await libraryFor(grant.identity);
      const current = await library.read(input.path, library.workspace);
      if (current.revision !== input.revision)
        throw new HttpError(
          409,
          'The diagram changed since this revision. Read it again and reconcile before applying.',
        );
      const preview = previewDocumentPatch(
        current.document as import('../../core/src/document').Diagram,
        input.patch,
      );
      if (preview.summary.noOp)
        return {
          path: input.path,
          baseRevision: current.revision,
          candidateFingerprint: preview.candidateFingerprint,
          revision: current.revision,
          applied: false,
          summary: preview.summary,
          changes: preview.changes,
          owner: ownerId(grant.identity),
        };
      const result = await library.save({
        path: input.path,
        document: preview.candidate,
        revision: input.revision,
        workspace: library.workspace,
      });
      return {
        path: input.path,
        baseRevision: current.revision,
        candidateFingerprint: preview.candidateFingerprint,
        revision: result.revision,
        applied: true,
        summary: preview.summary,
        changes: preview.changes,
        owner: ownerId(grant.identity),
      };
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
