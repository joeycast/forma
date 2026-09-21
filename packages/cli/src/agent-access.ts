import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { HttpError, type createFileLibrary } from './file-library';
import type { Identity } from './google';

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

export async function createTokenStore(directory: string, now: () => number = Date.now) {
  const path = join(directory, 'agent-tokens.json');
  let records: Grant[] = [];
  try {
    records = fileSchema.parse(JSON.parse(await readFile(path, 'utf8'))).tokens;
    for (const r of records) relativePath(r.folder, true);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error(
        'Cannot read agent token registry. Restore or repair it before starting hosted mode.',
      );
  }
  let mutations = Promise.resolve();
  const publicRecord = ({ digest: _digest, identity: _identity, ...value }: Grant) => value;
  const update = <T>(operation: () => Promise<T>) => {
    const result = mutations.then(operation);
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const persist = async (next: Grant[]) => {
    const tmp = join(directory, `.tokens-${randomBytes(8).toString('hex')}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify({ version: 1, tokens: next }) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(tmp, path);
      records = next;
    } finally {
      await unlink(tmp).catch(() => {});
    }
  };
  return {
    list: (identity: Identity) =>
      records.filter((r) => r.identity.sub === identity.sub).map(publicRecord),
    create: (identity: Identity, input: unknown) =>
      update(async () => {
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
        await persist([...current, record]);
        return { token: secret, ...publicRecord(record) };
      }),
    revoke: (identity: Identity, id: string) =>
      update(async () => {
        if (!records.some((r) => r.id === id && r.identity.sub === identity.sub))
          throw new HttpError(404, 'Token not found.');
        await persist(records.filter((r) => r.id !== id || r.identity.sub !== identity.sub));
        return { ok: true };
      }),
    authenticate: (authorization: string | undefined) => {
      const match = /^Bearer (forma_([a-f0-9]{24})_[a-f0-9]{64})$/.exec(authorization ?? '');
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
  getGrant: () => Grant,
  libraryFor: (identity: Identity) => Promise<Awaited<ReturnType<typeof createFileLibrary>>>,
) {
  const check = (path: string, write = false) => {
    relativePath(path);
    const grant = getGrant();
    if (grant.folder && !path.startsWith(grant.folder + '/'))
      throw new HttpError(403, 'This path is outside the token’s folder scope.');
    if (write && grant.permission !== 'write') throw new HttpError(403, 'This token is read-only.');
    return grant;
  };
  return {
    me: () => {
      const grant = getGrant();
      return {
        owner: ownerId(grant.identity),
        email: grant.identity.email,
        permission: grant.permission,
        folder: grant.folder,
        expires: grant.expires,
      };
    },
    list: async () => {
      const grant = getGrant(),
        library = await libraryFor(grant.identity),
        value = await library.list();
      const inside = (path: string) => !grant.folder || path.startsWith(grant.folder + '/');
      return {
        items: value.items.filter((i) => inside(i.path)),
        folders: value.folders.filter(inside),
      };
    },
    read: async (path: string) => {
      const grant = check(path),
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
      const grant = check(input.path, true),
        library = await libraryFor(grant.identity);
      const result = await library.save({ ...input, workspace: library.workspace });
      return { path: result.path, revision: result.revision, owner: ownerId(grant.identity) };
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
