// Explicit test harness, never used by `forma host` or included in release packages.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHostedServer } from '../../packages/cli/src/hosted';
const output = resolve('output/hosted-preview'),
  assets = join(output, 'assets');
await mkdir(output, { recursive: true });
await cp(resolve('dist'), assets, { recursive: true });
const html = await readFile(join(assets, 'index.html'), 'utf8');
await writeFile(
  join(assets, 'index.html'),
  html.replace(
    '</body>',
    '<div style="position:fixed;bottom:0;left:0;z-index:10000;background:#fff2b3;color:#333;padding:4px 12px;font:12px sans-serif">TEST PREVIEW · simulated identity provider</div></body>',
  ),
);
let next = 0;
const server = await createHostedServer({
  directory: join(output, 'data'),
  assets,
  publicUrl: 'http://127.0.0.1:4250',
  port: 4250,
  allowedEmails: ['alice@example.test', 'bob@example.test'],
  provider: {
    authorize(attempt) {
      return `/auth/callback?state=${attempt.state}&code=${++next % 2 ? 'alice' : 'bob'}`;
    },
    async exchange(code, attempt) {
      return {
        sub: code,
        email: `${code}@example.test`,
        name: code === 'alice' ? 'Alice Example' : 'Bob Example',
        email_verified: true,
        nonce: attempt.nonce,
      };
    },
  },
});
console.log('Test preview: http://127.0.0.1:4250 (alternates Alice and Bob at each sign-in)');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
