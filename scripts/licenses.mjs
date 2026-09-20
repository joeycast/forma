// Carry installed third-party license texts with the redistributable static build.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = join(root, 'node_modules');
const packageDirs = [];
for (const entry of await readdir(modules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  if (entry.name.startsWith('@')) {
    for (const child of await readdir(join(modules, entry.name), { withFileTypes: true })) {
      if (child.isDirectory()) packageDirs.push(join(modules, entry.name, child.name));
    }
  } else packageDirs.push(join(modules, entry.name));
}
const sections = [];
for (const dir of packageDirs.sort()) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const files = (await readdir(dir)).filter((name) =>
      /^(license|licence|copying|notice)(\.|$)/i.test(name),
    );
    const texts = await Promise.all(files.map((name) => readFile(join(dir, name), 'utf8')));
    sections.push(
      `${pkg.name} ${pkg.version} — ${pkg.license ?? 'see upstream'}\n${texts.join('\n\n') || 'See the installed package and upstream repository for license terms.'}`,
    );
  } catch {
    /* Ignore directories that are not packages. */
  }
}
await mkdir(join(root, 'public/licenses'), { recursive: true });
await writeFile(
  join(root, 'public/licenses/THIRD_PARTY_LICENSES.txt'),
  'Installed dependency notices (including development tools).\n\n' +
    sections.join('\n\n' + '='.repeat(80) + '\n\n'),
);
await writeFile(
  join(root, 'public/licenses/FORMA_LICENSE.txt'),
  await readFile(join(root, 'LICENSE'), 'utf8'),
);
