import {
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir,
  realpath,
  lstat,
  readdir,
  copyFile,
  rm,
  link,
  open,
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
  const root = await realpath(resolve(directory));
  const workspacePath = join(root, '.forma-workspace-id');
  let workspace = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const workspaceStat = await lstat(workspacePath);
      if (!workspaceStat.isFile() || workspaceStat.isSymbolicLink())
        throw new Error('Library workspace metadata must be a regular file.');
      const value = (await readFile(workspacePath, 'utf8')).trim();
      if (/^[a-f0-9-]{36}$/.test(value)) {
        workspace = value;
        break;
      }
      if (value)
        throw new Error(
          'Library workspace metadata is corrupt. Restore a valid workspace ID before continuing.',
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const value = randomUUID();
      const tempPath = `${workspacePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(tempPath, value + '\n', { flag: 'wx', mode: 0o600 });
        try {
          await link(tempPath, workspacePath);
          workspace = value;
          break;
        } catch (createError) {
          if ((createError as NodeJS.ErrnoException).code !== 'EEXIST') throw createError;
        } finally {
          await unlink(tempPath).catch(() => {});
        }
      } catch (createError) {
        throw createError;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!workspace)
    throw new Error('Library workspace initialization is busy. Retry after other writers finish.');
  const trashRoot = join(root, '.trash');
  await mkdir(trashRoot, { recursive: true, mode: 0o700 });
  if (!(await lstat(trashRoot)).isDirectory() || (await lstat(trashRoot)).isSymbolicLink())
    throw new Error('Library trash storage must be a real directory.');
  let mutations = Promise.resolve();
  const withMutationLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const lockPath = join(root, '.forma-library-mutation.lock');
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
      throw new HttpError(
        503,
        'Library mutation lock is held. Verify all Forma writers using this directory are stopped before removing .forma-library-mutation.lock; never remove a live writer lock.',
      );
    try {
      await lock.writeFile(`${process.pid}\n`);
      return await operation();
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => {});
    }
  };
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
    const items: {
        path: string;
        title: string;
        revision: string;
        modified: string;
        error?: string;
      }[] = [],
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
            error: string | undefined,
            itemRevision = revision('');
          try {
            if (stat.size > 5_000_000) throw new Error('File exceeds 5 MB.');
            const text = await readFile(join(root, path), 'utf8');
            itemRevision = revision(text);
            title = parseDocument(JSON.parse(text)).title;
          } catch (e) {
            error = (e as Error).message;
          }
          items.push({
            path,
            title,
            revision: itemRevision,
            modified: stat.mtime.toISOString(),
            ...(error ? { error } : {}),
          });
        }
      }
    };
    await walk();
    const trash: {
      trashId: string;
      path: string;
      title: string;
      revision: string;
      deletedAt: string;
    }[] = [];
    for (const trashId of await readdir(trashRoot)) {
      if (!/^[a-f0-9-]{36}$/.test(trashId)) continue;
      const folder = join(trashRoot, trashId);
      try {
        const folderStat = await lstat(folder);
        if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) continue;
        const documentPath = join(folder, 'document.forma.json');
        const metadataPath = join(folder, 'metadata.json');
        const [documentStat, metadataStat] = await Promise.all([
          lstat(documentPath),
          lstat(metadataPath),
        ]);
        if (
          !documentStat.isFile() ||
          documentStat.isSymbolicLink() ||
          !metadataStat.isFile() ||
          metadataStat.isSymbolicLink()
        )
          continue;
        const text = await readFile(documentPath, 'utf8');
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
          path?: string;
          deletedAt?: string;
        };
        if (typeof metadata.path !== 'string' || typeof metadata.deletedAt !== 'string') continue;
        await safePath(metadata.path, false, true);
        let title = metadata.path.split('/').at(-1)!;
        try {
          title = parseDocument(JSON.parse(text)).title;
        } catch {}
        bytes += Buffer.byteLength(text);
        trash.push({
          trashId,
          path: metadata.path,
          title,
          revision: revision(text),
          deletedAt: metadata.deletedAt,
        });
      } catch {
        /* incomplete trash moves remain recoverable from their source or folder */
      }
    }
    return {
      mode: 'local',
      bytes,
      directory: root,
      workspace,
      items: items.sort((a, b) => a.path.localeCompare(b.path)),
      folders: folders.sort(),
      trash: trash.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
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
          (existing === null && inventory.items.length + inventory.trash.length >= limits.files) ||
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
    const result = mutations.then(() => withMutationLock(operation));
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const checkWorkspace = (value: string) => {
    if (value !== workspace)
      throw new HttpError(409, 'Library changed. Refresh the library before continuing.');
  };
  const current = async (path: string) => {
    const target = await safePath(path);
    const text = await readFile(target, 'utf8');
    return { target, text, revision: revision(text) };
  };
  const moveNoReplace = async (source: string, destination: string) => {
    await link(source, destination);
    try {
      await unlink(source);
    } catch (error) {
      await unlink(destination).catch(() => {});
      throw error;
    }
  };
  const renameFile = (data: { from: string; to: string; revision: string; workspace: string }) => {
    const operation = async () => {
      checkWorkspace(data.workspace);
      if (data.from === data.to) throw new HttpError(400, 'Choose a different destination path.');
      const source = await current(data.from);
      if (source.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      const destination = await safePath(data.to, true, true);
      try {
        await moveNoReplace(source.target, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new HttpError(409, 'The destination path already exists.');
        throw error;
      }
      return { path: data.to, revision: source.revision, workspace };
    };
    const result = mutations.then(() => withMutationLock(operation));
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const duplicate = (data: { from: string; to: string; revision: string; workspace: string }) => {
    const operation = async () => {
      checkWorkspace(data.workspace);
      const source = await current(data.from);
      if (source.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      let destination = await safePath(data.to, false, true);
      const inventory = await list();
      if (inventory.items.some((item) => item.path === data.to))
        throw new HttpError(409, 'The destination path already exists.');
      if (
        limits &&
        (inventory.items.length + inventory.trash.length >= limits.files ||
          inventory.bytes + Buffer.byteLength(source.text) > limits.bytes)
      )
        throw new HttpError(413, 'Your library storage quota is full. Contact your administrator.');
      destination = await safePath(data.to, true, true);
      const temp = join(dirname(destination), `.forma-${randomUUID()}.tmp`);
      try {
        await copyFile(source.target, temp, 1);
        await link(temp, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new HttpError(409, 'The destination path already exists.');
        throw error;
      } finally {
        await unlink(temp).catch(() => {});
      }
      return { path: data.to, revision: source.revision, workspace };
    };
    const result = mutations.then(() => withMutationLock(operation));
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const trashFile = (data: { path: string; revision: string; workspace: string }) => {
    const operation = async () => {
      checkWorkspace(data.workspace);
      const source = await current(data.path);
      if (source.revision !== data.revision)
        throw new HttpError(409, 'This file changed on disk. Refresh the library and retry.');
      const trashId = randomUUID(),
        folder = join(trashRoot, trashId);
      await mkdir(folder, { mode: 0o700 });
      await writeFile(
        join(folder, 'metadata.json'),
        JSON.stringify({ path: data.path, deletedAt: new Date().toISOString() }) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      try {
        await rename(source.target, join(folder, 'document.forma.json'));
      } catch (error) {
        await rm(folder, { recursive: true, force: true });
        throw error;
      }
      return { trashId, path: data.path, revision: source.revision, workspace };
    };
    const result = mutations.then(() => withMutationLock(operation));
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const restore = (data: { trashId: string; revision: string; to?: string; workspace: string }) => {
    const operation = async () => {
      checkWorkspace(data.workspace);
      if (!/^[a-f0-9-]{36}$/.test(data.trashId)) throw new HttpError(400, 'Invalid trash item.');
      const folder = join(trashRoot, data.trashId),
        source = join(folder, 'document.forma.json');
      const folderStat = await lstat(folder);
      if (!folderStat.isDirectory() || folderStat.isSymbolicLink())
        throw new HttpError(404, 'Trash item not found.');
      const metadataPath = join(folder, 'metadata.json');
      const [documentStat, metadataStat] = await Promise.all([lstat(source), lstat(metadataPath)]);
      if (
        !documentStat.isFile() ||
        documentStat.isSymbolicLink() ||
        !metadataStat.isFile() ||
        metadataStat.isSymbolicLink()
      )
        throw new HttpError(400, 'Trash item storage is invalid.');
      const text = await readFile(source, 'utf8'),
        rev = revision(text);
      if (rev !== data.revision)
        throw new HttpError(409, 'This trash item changed. Refresh the library and retry.');
      const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
        path: string;
      };
      const path = data.to ?? metadata.path;
      const destination = await safePath(path, true, true);
      try {
        await moveNoReplace(source, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new HttpError(409, 'The destination path already exists.');
        throw error;
      }
      await rm(folder, { recursive: true, force: true });
      return { path, revision: rev, workspace };
    };
    const result = mutations.then(() => withMutationLock(operation));
    mutations = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  return {
    list,
    read,
    save,
    rename: renameFile,
    duplicate,
    trash: trashFile,
    restore,
    workspace,
    root,
  };
}
