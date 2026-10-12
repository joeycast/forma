import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

async function startBlankDiagram(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Start with a blank diagram' }).click();
}

async function libraryRow(page: Page, path: string): Promise<Locator> {
  return page.locator('.library-entry').filter({ has: page.getByText(path, { exact: true }) });
}

async function readIndexedSnapshot(page: Page, key: string): Promise<string | undefined> {
  return page.evaluate(
    (snapshotKey) =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('forma-workspace-v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('snapshots', 'readonly');
          const get = tx.objectStore('snapshots').get(snapshotKey);
          let value: string | undefined;
          get.onsuccess = () => {
            value = get.result as string | undefined;
          };
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => {
            db.close();
            resolve(value);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    key,
  );
}

async function exposeIndexedStorage(page: Page) {
  const source = readFileSync(
    new URL('../../apps/editor/src/indexeddb-storage.ts', import.meta.url),
    'utf8',
  );
  const javascript = ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });
  await page.addScriptTag({
    type: 'module',
    content: `${javascript}\n(globalThis).__formaStorage = { readStoredSnapshot, updateStoredSnapshot };`,
  });
}

function legacyBrowserLibraryBytes() {
  const document = { version: 1, title: 'Legacy browser library', nodes: [], edges: [] };
  const entry = {
    document,
    revision: 'legacy-live-revision',
    modified: '2026-01-01T00:00:00.000Z',
  };
  const trash = [
    {
      trashId: 'legacy-trash-id',
      path: 'legacy-trashed.forma.json',
      revision: 'legacy-trash-revision',
      deletedAt: '2026-01-02T00:00:00.000Z',
      entry: { ...entry, revision: 'legacy-trash-revision' },
    },
  ];
  return {
    entries: JSON.stringify({ 'legacy-live.forma.json': entry }),
    trash: JSON.stringify(trash),
  };
}

test('a blank diagram recovers its local draft after reload', async ({ page }) => {
  test.setTimeout(90_000);
  await startBlankDiagram(page);
  await page.locator('.add-button').click();
  await page.getByRole('button', { name: 'Add Rectangle' }).click();
  await expect(page.getByRole('button', { name: 'New rectangle', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith('forma.draft.v2.')),
      ),
    )
    .toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Recover this draft?' })).toBeVisible();
  await page.getByRole('button', { name: 'Recover draft' }).click();
  await expect(page.getByRole('button', { name: 'New rectangle', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Forma document Editable JSON/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.forma\.json$/);
});

test('library opens an unnamed prior-session draft as a copy without deleting its source', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startBlankDiagram(page);
  await page.locator('.add-button').click();
  await page.getByRole('button', { name: 'Add Rectangle' }).click();
  await expect(page.getByRole('button', { name: 'New rectangle', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith('forma.draft.v2.')),
      ),
    )
    .toBe(true);
  const draftEntry = () =>
    page.evaluate(() =>
      Object.entries(localStorage).find(([key, value]) => {
        if (!key.startsWith('forma.draft.v2.')) return false;
        try {
          const record = JSON.parse(value) as { document: string };
          const doc = JSON.parse(record.document) as { nodes: { label: string }[] };
          return doc.nodes.some((node) => node.label === 'New rectangle');
        } catch {
          return false;
        }
      }),
    );
  await expect.poll(draftEntry).toBeTruthy();
  const before = await draftEntry();
  expect(before).not.toBeNull();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Recover this draft?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const sourceTitle = JSON.parse(JSON.parse(before![1]).document).title as string;
  const draft = page.locator('.library-recovery-entry').filter({ hasText: sourceTitle });
  await expect(draft).toBeVisible();
  await draft.getByRole('button', { name: 'Open as copy' }).click();
  await expect(page.getByRole('button', { name: 'New rectangle', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), before![0])).toBe(before![1]);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Forma document Editable JSON/ }).click();
  const stream = await (await downloadPromise).createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString()) as {
    nodes: { label: string }[];
  };
  expect(exported.nodes.some((node) => node.label === 'New rectangle')).toBe(true);
});

test('browser library supports save, duplicate, rename, trash, and restore', async ({ page }) => {
  await startBlankDiagram(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Save current diagram as').fill('authoring-check.forma.json');
  await page.getByRole('button', { name: 'Save diagram' }).click();
  await expect(page.getByText('Saved to library.', { exact: true })).toBeVisible();

  // The saved item is immediately available in the still-open library.
  let row = await libraryRow(page, 'authoring-check.forma.json');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await row.getByLabel('Copy path').fill('authoring-copy.forma.json');
  await row.getByRole('button', { name: 'Create copy' }).click();
  await expect(page.getByText('Diagram duplicated.', { exact: true })).toBeVisible();

  row = await libraryRow(page, 'authoring-copy.forma.json');
  await row.getByRole('button', { name: 'Rename', exact: true }).click();
  await row.getByLabel('New path').fill('authoring-renamed.forma.json');
  await row.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Diagram renamed.', { exact: true })).toBeVisible();

  row = await libraryRow(page, 'authoring-renamed.forma.json');
  await row.getByRole('button', { name: 'Trash', exact: true }).click();
  await row.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.getByText('Diagram moved to Trash.', { exact: true })).toBeVisible();

  const trashRow = page
    .locator('.library-trash-entry')
    .filter({ hasText: 'authoring-renamed.forma.json' });
  await trashRow.getByRole('button', { name: 'Restore' }).click();
  await trashRow.getByLabel('Restore path').fill('authoring-restored.forma.json');
  await trashRow.getByRole('button', { name: 'Restore diagram' }).click();
  await expect(page.getByText('Diagram restored.', { exact: true })).toBeVisible();
  await expect(await libraryRow(page, 'authoring-restored.forma.json')).toBeVisible();
  await expect
    .poll(() => readIndexedSnapshot(page, 'forma.library.state.v2').then((snapshot) => !!snapshot))
    .toBe(true);
});

test('legacy browser library and trash migrate once and remain byte-for-byte intact', async ({
  page,
}) => {
  const legacy = legacyBrowserLibraryBytes();
  await page.addInitScript((bytes) => {
    localStorage.setItem('forma.library.v1', bytes.entries);
    localStorage.setItem('forma.library.trash.v1', bytes.trash);
  }, legacy);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(await libraryRow(page, 'legacy-live.forma.json')).toBeVisible();
  const migratedTrash = page
    .locator('.library-trash-entry')
    .filter({ hasText: 'legacy-trashed.forma.json' });
  await expect(migratedTrash).toBeVisible();
  const liveRow = await libraryRow(page, 'legacy-live.forma.json');
  await liveRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await liveRow.getByLabel('Copy path').fill('legacy-copy.forma.json');
  await liveRow.getByRole('button', { name: 'Create copy' }).click();
  await expect(page.getByText('Diagram duplicated.', { exact: true })).toBeVisible();
  await expect(await libraryRow(page, 'legacy-copy.forma.json')).toBeVisible();

  const snapshot = JSON.parse(
    (await readIndexedSnapshot(page, 'forma.library.state.v2')) ?? 'null',
  ) as {
    entries: Record<string, unknown>;
    trash: { path: string }[];
  };
  expect(Object.keys(snapshot.entries).sort()).toEqual(
    ['legacy-copy.forma.json', 'legacy-live.forma.json'].sort(),
  );
  expect(snapshot.trash.map((item) => item.path)).toEqual(['legacy-trashed.forma.json']);
  expect(
    await page.evaluate(() => ({
      entries: localStorage.getItem('forma.library.v1'),
      trash: localStorage.getItem('forma.library.trash.v1'),
    })),
  ).toEqual(legacy);
});

test('unsupported legacy v2 library fails closed without falling back or changing bytes', async ({
  page,
}) => {
  const legacy = legacyBrowserLibraryBytes();
  const unsupported = JSON.stringify({ version: 99, entries: {}, trash: [] });
  await page.addInitScript(
    ({ bytes, current }) => {
      localStorage.setItem('forma.library.state.v2', current);
      localStorage.setItem('forma.library.v1', bytes.entries);
      localStorage.setItem('forma.library.trash.v1', bytes.trash);
    },
    { bytes: legacy, current: unsupported },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('damaged or unsupported');
  await expect(await libraryRow(page, 'legacy-live.forma.json')).toHaveCount(0);
  expect(await readIndexedSnapshot(page, 'forma.library.state.v2')).toBeUndefined();
  expect(
    await page.evaluate(() => ({
      current: localStorage.getItem('forma.library.state.v2'),
      entries: localStorage.getItem('forma.library.v1'),
      trash: localStorage.getItem('forma.library.trash.v1'),
    })),
  ).toEqual({ current: unsupported, ...legacy });
});

test('browser library serializes concurrent tabs and preserves state on a failed write', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await startBlankDiagram(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Save current diagram as').fill('authoring-shared.forma.json');
  await page.getByRole('button', { name: 'Save diagram' }).click();
  await expect(page.getByText('Saved to library.', { exact: true })).toBeVisible();

  const secondTab = await context.newPage();
  await secondTab.goto('/', { waitUntil: 'domcontentloaded' });
  await secondTab.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(await libraryRow(secondTab, 'authoring-shared.forma.json')).toBeVisible();

  const firstRow = await libraryRow(page, 'authoring-shared.forma.json');
  const secondRow = await libraryRow(secondTab, 'authoring-shared.forma.json');
  await firstRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await firstRow.getByLabel('Copy path').fill('authoring-tab-one.forma.json');
  await secondRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await secondRow.getByLabel('Copy path').fill('authoring-tab-two.forma.json');
  await Promise.all([
    firstRow.getByRole('button', { name: 'Create copy' }).click(),
    secondRow.getByRole('button', { name: 'Create copy' }).click(),
  ]);
  await expect(page.getByText('Diagram duplicated.', { exact: true })).toBeVisible();
  await expect(secondTab.getByText('Diagram duplicated.', { exact: true })).toBeVisible();
  await Promise.all([
    page.getByRole('button', { name: 'Refresh', exact: true }).click(),
    secondTab.getByRole('button', { name: 'Refresh', exact: true }).click(),
  ]);
  const browserStates = await Promise.all(
    [page, secondTab].map((tab) => readIndexedSnapshot(tab, 'forma.library.state.v2')),
  );
  for (const raw of browserStates) {
    const state = JSON.parse(raw ?? 'null') as { entries?: Record<string, unknown> } | null;
    expect(Object.keys(state?.entries ?? {}).sort(), JSON.stringify(browserStates)).toEqual(
      [
        'authoring-shared.forma.json',
        'authoring-tab-one.forma.json',
        'authoring-tab-two.forma.json',
      ].sort(),
    );
  }
  const persistenceProbe = await context.newPage();
  await persistenceProbe.route('**/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>probe</title>',
    }),
  );
  await persistenceProbe.goto('/', { waitUntil: 'domcontentloaded' });
  const freshRaw = await readIndexedSnapshot(persistenceProbe, 'forma.library.state.v2');
  const freshState = Object.keys(
    (JSON.parse(freshRaw ?? 'null') as { entries?: Record<string, unknown> }).entries ?? {},
  ).sort();
  expect(freshState).toEqual(
    [
      'authoring-shared.forma.json',
      'authoring-tab-one.forma.json',
      'authoring-tab-two.forma.json',
    ].sort(),
  );
  await persistenceProbe.close();
  await expect(await libraryRow(page, 'authoring-tab-one.forma.json')).toBeVisible();
  await expect(await libraryRow(page, 'authoring-tab-two.forma.json')).toBeVisible();

  const beforeFailure = await readIndexedSnapshot(page, 'forma.library.state.v2');
  await page.evaluate(() => {
    const write = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'forma.library.state.v2')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return write.call(this, value, key);
    };
  });
  const sourceRow = await libraryRow(page, 'authoring-shared.forma.json');
  await sourceRow.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await sourceRow.getByLabel('Copy path').fill('authoring-failed.forma.json');
  await sourceRow.getByRole('button', { name: 'Create copy' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Quota exceeded' })).toBeVisible();
  expect(await readIndexedSnapshot(page, 'forma.library.state.v2')).toBe(beforeFailure);
  await expect(await libraryRow(page, 'authoring-failed.forma.json')).toHaveCount(0);
  await secondTab.close();
});

test('IndexedDB transactions serialize concurrent library snapshots across tabs', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.route('**/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>storage probe</title>',
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const secondTab = await context.newPage();
  await secondTab.goto('/', { waitUntil: 'domcontentloaded' });
  await Promise.all([page, secondTab].map(exposeIndexedStorage));
  await page.evaluate(() => {
    const api = (
      globalThis as typeof globalThis & {
        __formaStorage: {
          updateStoredSnapshot: <T, R>(
            key: string,
            load: () => T,
            update: (state: T) => R,
          ) => Promise<R>;
        };
      }
    ).__formaStorage;
    return api.updateStoredSnapshot(
      'stress',
      () => ({ entries: {} as Record<string, unknown> }),
      (state) => {
        state.entries = {};
        return true;
      },
    );
  });
  const prefixes = ['probe-one', 'probe-two'];
  const runs = await Promise.all(
    [page, secondTab].map((tab, tabIndex) =>
      tab.evaluate(async (prefix) => {
        const api = (
          globalThis as typeof globalThis & {
            __formaStorage: {
              updateStoredSnapshot: <T, R>(
                key: string,
                load: () => T,
                update: (state: T) => R,
              ) => Promise<R>;
            };
          }
        ).__formaStorage;
        return Promise.all(
          Array.from({ length: 50 }, (_, index) =>
            api.updateStoredSnapshot(
              'stress',
              () => ({ entries: {} as Record<string, unknown> }),
              (state) => {
                const startCount = Object.keys(state.entries).length;
                const key = `${prefix}-${index}`;
                state.entries[key] = key;
                return { key, startCount, endCount: Object.keys(state.entries).length };
              },
            ),
          ),
        );
      }, prefixes[tabIndex]),
    ),
  );
  const allRuns = runs.flat();
  expect(allRuns.every((run) => run.endCount === run.startCount + 1)).toBe(true);
  expect(allRuns.map((run) => run.endCount).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 100 }, (_, index) => index + 1),
  );

  const expected = prefixes.flatMap((prefix) =>
    Array.from({ length: 50 }, (_, index) => `${prefix}-${index}`),
  );
  const thirdTab = await context.newPage();
  await thirdTab.goto('/', { waitUntil: 'domcontentloaded' });
  await exposeIndexedStorage(thirdTab);
  const views = await Promise.all(
    [page, secondTab, thirdTab].map((tab) =>
      tab.evaluate((keys) => {
        const api = (
          globalThis as typeof globalThis & {
            __formaStorage: {
              readStoredSnapshot: <T>(key: string, load: () => T) => Promise<T>;
            };
          }
        ).__formaStorage;
        return api
          .readStoredSnapshot('stress', () => ({ entries: {} as Record<string, unknown> }))
          .then((snapshot) => keys.filter((key) => key in snapshot.entries));
      }, expected),
    ),
  );
  for (const keys of views) expect(keys.sort()).toEqual(expected.sort());
  console.info(
    'IndexedDB transaction stress evidence:',
    JSON.stringify({
      transactionCount: allRuns.length,
      runs: allRuns,
      tabs: views.map((view) => view.length),
    }),
  );
  await Promise.all([page, secondTab].map((tab) => tab.close()));
  await thirdTab.close();
});
