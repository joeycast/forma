import {
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir,
  realpath,
  lstat,
  readdir,
} from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, serializeDocument } from '../../core/src/index';

const revision = (text: string) => createHash('sha256').update(text).digest('hex');
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function createFileLibrary(
  directory: string,
  limits?: { bytes: number; files: number },
) {
  await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
  const root = await realpath(resolve(directory)),
    workspace = randomUUID();
  let mutations = Promise.resolve();
  const safePath = async (path: string, createParents = false, allowMissing = false) => {
    if (
      !path ||
      path.length > 1024 ||
      path.split('/').length > 13 ||
      isAbsolute(path) ||
      path.includes('\\') ||
      path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
      !path.endsWith('.forma.json')
    )
      throw new HttpError(
        400,
        'Use a relative .forma.json path, such as architecture/checkout.forma.json.',
      );
    const parts = path.split('/');
    let current = root;
    for (const [i, part] of parts.entries()) {
      current = join(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink())
          throw new HttpError(400, 'Symbolic links are not supported in the library.');
        if (i < parts.length - 1 && !stat.isDirectory())
          throw new HttpError(400, 'Parent is not a folder.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (i < parts.length - 1 && createParents) await mkdir(current);
        else if (i < parts.length - 1 && !allowMissing)
          throw new HttpError(404, 'Folder not found.');
      }
    }
    return current;
  };
  const list = async () => {
    let bytes = 0;
    const items: { path: string; title: string; modified: string; error?: string }[] = [],
      folders: string[] = [];
    const walk = async (relative = '', depth = 0) => {
      if (depth > 12 || items.length >= 1000) return;
      for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink())
          continue;
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          folders.push(path);
          await walk(path, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.forma.json') && items.length < 1000) {
          const stat = await lstat(join(root, path));
          bytes += stat.size;
          let title = entry.name,
            error: string | undefined;
          try {
            if (stat.size > 5_000_000) throw new Error('File exceeds 5 MB.');
            title = parseDocument(JSON.parse(await readFile(join(root, path), 'utf8'))).title;
          } catch (e) {
            error = (e as Error).message;
          }
          items.push({
            path,
            title,
            modified: stat.mtime.toISOString(),
            ...(error ? { error } : {}),
          });
        }
      }
    };
    await walk();
    return {
      mode: 'local',
      bytes,
      directory: root,
      workspace,
      items: items.sort((a, b) => a.path.localeCompare(b.path)),
      folders: folders.sort(),
    };
  };

  const read = async (path: string, expectedWorkspace: string) => {
    if (expectedWorkspace !== workspace)
      throw new HttpError(409, 'Library changed. Refresh the library before opening a file.');
    const target = await safePath(path);
    const stat = await lstat(target);
    if (stat.size > 5_000_000) throw new HttpError(413, 'File exceeds 5 MB.');
    const text = await readFile(target, 'utf8');
    return { document: parseDocument(JSON.parse(text)), revision: revision(text) };
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
      if (typeof data.path !== 'string') throw new HttpError(400, 'A file path is required.');
      let content: string;
      try {
        content = serializeDocument(parseDocument(data.document));
      } catch {
        throw new HttpError(400, 'Invalid diagram document.');
      }
      if (Buffer.byteLength(content) > 5_000_000)
        throw new HttpError(413, 'Document exceeds 5 MB.');
      // Resolve without creating directories until validation and quota checks pass.
      const path = await safePath(data.path, false, true);
      let existing: string | null = null;
      try {
        existing = await readFile(path, 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if ((existing === null ? null : revision(existing)) !== data.revision)
        throw new HttpError(
          409,
          'This file changed on disk. Your edits are still here. Open the disk version from Library or save your edits under a new path.',
        );
      if (limits) {
        const inventory = await list();
        if (
          (existing === null && inventory.items.length >= limits.files) ||
          inventory.bytes - Buffer.byteLength(existing ?? '') + Buffer.byteLength(content) >
            limits.bytes
        )
          throw new HttpError(
            413,
            'Your library storage quota is full. Contact your administrator.',
          );
      }
      await safePath(data.path, true);
      const temp = join(dirname(path), `.forma-${randomUUID()}.tmp`);
      try {
        await writeFile(temp, content, { flag: 'wx', mode: 0o600 });
        await rename(temp, path);
      } finally {
        await unlink(temp).catch(() => {});
      }
      return { path: data.path, revision: revision(content), workspace };
    };
    const result = mutations.then(operation);
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  return { list, read, save, workspace, root };
}
