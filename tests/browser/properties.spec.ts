import { expect, test, type Page } from '@playwright/test';

const fixture = {
  version: 2,
  title: 'Property provenance check',
  type: 'diagram',
  nodes: [
    {
      id: 'apiCard',
      label: 'API service',
      kind: 'service',
      role: 'warning',
      emphasis: 'primary',
      style: { radius: 16 },
    },
    { id: 'dbCard', label: 'Database', kind: 'database', emphasis: 'normal' },
  ],
  edges: [],
  groups: [],
  presentation: {
    theme: 'paper',
    nodes: {
      apiCard: {
        variant: 'classic',
        position: { x: 70, y: 90 },
        style: { radius: 20, fill: '#f4f4f4' },
      },
      dbCard: { position: { x: 350, y: 90 } },
    },
  },
};

const legacySystem = {
  version: 1,
  id: 'legacy-browser-system',
  name: 'Legacy browser system',
  revision: '2.0.0',
  node: { fill: '#123456', radius: 10 },
};

async function readSystemSnapshot(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('forma-workspace-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('snapshots', 'readonly');
          const get = transaction.objectStore('snapshots').get('forma.design-systems.v1');
          let value: string | undefined;
          get.onsuccess = () => {
            value = get.result as string | undefined;
          };
          get.onerror = () => reject(get.error);
          transaction.oncomplete = () => {
            db.close();
            resolve(value);
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

async function openSource(page: Page) {
  await page.getByRole('button', { name: /View document source/ }).click();
  return page.getByRole('textbox', { name: 'Diagram JSON' });
}

async function readNativeDocument(page: Page) {
  const source = await openSource(page);
  const document = JSON.parse((await source.inputValue()) || '{}');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  return document;
}

async function waitForDraftRadius(page: Page, radius: number) {
  await expect
    .poll(() =>
      page.evaluate(
        (expected) =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith('forma.draft.v2.'))
            .some((key) => {
              try {
                const record = JSON.parse(localStorage.getItem(key) ?? '');
                const document = JSON.parse(record.document);
                return document.presentation.nodes.apiCard.style.radius === expected;
              } catch {
                return false;
              }
            }),
        radius,
      ),
    )
    .toBe(true);
}

async function loadFixture(page: Page, nativeDocument: unknown = fixture) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const source = await openSource(page);
  await source.fill(JSON.stringify(nativeDocument));
  await page.getByRole('button', { name: 'Validate & apply' }).click();
  await expect(page.getByText('API service', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'API service', exact: true }).click();
}

test('radius edits and reset preserve a classic card, its geometry, and unrelated pins', async ({
  page,
}) => {
  await loadFixture(page);
  await expect(page.getByRole('combobox', { name: 'Role', exact: true })).toHaveValue('warning');
  const card = page.locator('.react-flow__node-diagram[data-id="apiCard"]');
  await expect(card).toBeVisible();
  const originalSize = await card.evaluate((element: HTMLElement) => ({
    width: element.style.width,
    height: element.style.height,
  }));
  await page.getByText('Appearance', { exact: true }).click();
  const appearance = page.locator('.style-fields').filter({ hasText: 'Radius' });
  const radius = appearance.getByLabel('Radius', { exact: true });
  await radius.fill('28');
  await radius.press('Enter');
  await expect(appearance).toContainText('Effective: 28 · presentation override');
  await waitForDraftRadius(page, 28);

  // The source editor is the native document: verify the winning override changed while
  // the component presentation, element fallback, fill override, and human pin survived.
  let document = await readNativeDocument(page);
  expect(document.presentation.nodes.apiCard.variant).toBe('classic');
  expect(document.presentation.nodes.apiCard.position).toEqual({ x: 70, y: 90 });
  expect(document.presentation.nodes.apiCard.style).toMatchObject({ radius: 28, fill: '#f4f4f4' });
  expect(document.nodes.find((node: { id: string }) => node.id === 'apiCard').style.radius).toBe(
    16,
  );

  const radiusControl = page
    .locator('.property-control')
    .filter({ has: page.getByLabel('Radius', { exact: true }) });
  await radiusControl.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(radiusControl).toContainText('Effective: 16 · element style');
  document = await readNativeDocument(page);
  expect(document.presentation.nodes.apiCard.variant).toBe('classic');
  expect(document.presentation.nodes.apiCard.position).toEqual({ x: 70, y: 90 });
  expect(document.presentation.nodes.apiCard.style).toMatchObject({ fill: '#f4f4f4' });
  expect(document.presentation.nodes.apiCard.style).not.toHaveProperty('radius');
  expect(document.nodes.find((node: { id: string }) => node.id === 'apiCard').style.radius).toBe(
    16,
  );
  await expect(page.locator('.react-flow__node-diagram')).toHaveCount(2);
  await expect
    .poll(() =>
      card.evaluate((element: HTMLElement) => ({
        width: element.style.width,
        height: element.style.height,
      })),
    )
    .toEqual(originalSize);
});

test('bulk role selection keeps a real role named mixed distinct from the placeholder', async ({
  page,
}) => {
  await loadFixture(page, {
    ...fixture,
    presentation: {
      ...fixture.presentation,
      designSystem: {
        version: 1,
        id: 'bulk-role-check',
        name: 'Bulk role check',
        revision: '1.0.0',
        roles: { warning: {}, mixed: {} },
      },
    },
  });
  await page.locator('.outline-node').filter({ hasText: 'API service' }).click();
  await page
    .locator('.outline-node')
    .filter({ hasText: 'Database' })
    .click({ modifiers: ['Shift'] });

  const role = page.getByRole('combobox', { name: 'Role', exact: true });
  await expect(role).toHaveValue('__forma_mixed__');
  await expect(role.locator('option[value="__forma_mixed__"]')).toHaveJSProperty('disabled', true);
  await role.selectOption('mixed');
  await expect(role).toHaveValue('mixed');
  await expect(role.locator('option:checked')).toHaveText('mixed');

  const document = await readNativeDocument(page);
  expect(document.nodes.find((node: { id: string }) => node.id === 'apiCard').role).toBe('mixed');
  expect(document.nodes.find((node: { id: string }) => node.id === 'dbCard').role).toBe('mixed');
});

test('design system preview saves immutable portable revisions separately from applying them', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loadFixture(page);
  const before = await readNativeDocument(page);
  await page.locator('.current-document').click();
  await page.getByRole('button', { name: 'Create or edit design system' }).click();
  await expect(page.getByRole('heading', { name: 'Your design systems' })).toBeVisible();
  await expect(page.locator('.system-preview-svg svg')).toBeVisible({ timeout: 5000 });

  await page.getByLabel('Name', { exact: true }).fill('Browser test system');
  await page.getByLabel('Identity ID', { exact: true }).fill('browser-test-system');
  await page.getByLabel('Revision', { exact: true }).fill('1.0.0');
  const nodeDefaults = page.locator('.design-fields details').filter({ hasText: 'Node defaults' });
  await nodeDefaults.getByLabel('Fill', { exact: true }).fill('#123456');
  await nodeDefaults.getByLabel('Fill', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('alert')).toContainText(/Saved Browser test system revision 1\.0\.0/);

  // Editing the content at the same identity and revision must conflict. A new revision is
  // allowed and remains a separate, embedded snapshot when applied.
  await nodeDefaults.getByLabel('Fill', { exact: true }).fill('#654321');
  await nodeDefaults.getByLabel('Fill', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('alert')).toContainText(/revision.*already exists|immutable/i);
  await page.getByLabel('Revision', { exact: true }).fill('1.0.1');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('alert')).toContainText(/Saved Browser test system revision 1\.0\.1/);

  await page.getByRole('button', { name: 'Close dialog' }).click();
  const afterSave = await readNativeDocument(page);
  expect(afterSave.presentation.designSystem).toEqual(before.presentation.designSystem);

  await page.getByRole('button', { name: 'Create or edit design system' }).click();
  await page
    .getByRole('combobox', { name: 'Saved designs', exact: true })
    .selectOption('browser-test-system:1.0.1');
  await page.getByRole('button', { name: 'Apply to diagram' }).click();
  const applied = await readNativeDocument(page);
  expect(applied.presentation.designSystem).toMatchObject({
    id: 'browser-test-system',
    revision: '1.0.1',
    node: { fill: '#654321' },
  });

  await page.locator('.current-document').click();
  await page.getByRole('button', { name: 'Create or edit design system' }).click();
  await page
    .getByRole('combobox', { name: 'Saved designs', exact: true })
    .selectOption('browser-test-system:1.0.1');
  await page.getByRole('button', { name: 'Delete saved revision' }).click();
  await expect(page.getByRole('alert')).toContainText('Saved revision deleted');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const portable = await readNativeDocument(page);
  expect(portable.presentation.designSystem).toEqual(applied.presentation.designSystem);
});

test('legacy design systems migrate to IndexedDB and preserve immutable revisions', async ({
  page,
}) => {
  const legacyBytes = JSON.stringify([legacySystem]);
  await page.addInitScript((value) => {
    localStorage.setItem('forma.design-systems.v1', value);
  }, legacyBytes);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.current-document').click();
  await page.getByRole('button', { name: 'Create or edit design system' }).click();
  const savedDesigns = page.getByRole('combobox', { name: 'Saved designs', exact: true });
  await expect(savedDesigns.locator('option[value="legacy-browser-system:2.0.0"]')).toHaveText(
    'Legacy browser system · 2.0.0',
  );
  await savedDesigns.selectOption('legacy-browser-system:2.0.0');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Legacy browser system');
  await page.getByLabel('Revision', { exact: true }).fill('2.0.1');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('alert')).toContainText('Saved Legacy browser system revision 2.0.1');

  expect(await page.evaluate(() => localStorage.getItem('forma.design-systems.v1'))).toBe(
    legacyBytes,
  );
  const snapshot = JSON.parse((await readSystemSnapshot(page)) ?? 'null');
  expect(snapshot).toEqual([
    expect.objectContaining({ id: 'legacy-browser-system', revision: '2.0.0' }),
    expect.objectContaining({ id: 'legacy-browser-system', revision: '2.0.1' }),
  ]);
});

test('malformed legacy design-system storage fails closed with a visible error', async ({
  page,
}) => {
  const malformedBytes = JSON.stringify([{}]);
  await page.addInitScript((value) => {
    localStorage.setItem('forma.design-systems.v1', value);
  }, malformedBytes);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.current-document').click();
  await page.getByRole('button', { name: 'Create or edit design system' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be read from browser storage');
  await expect(page.getByRole('button', { name: 'Save revision' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('forma.design-systems.v1'))).toBe(
    malformedBytes,
  );
});

test('design systems dialog closes on Escape and restores focus to its opener', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const opener = page.getByRole('button', { name: 'Create or edit design system' });
  await opener.click();
  await expect(page.getByRole('heading', { name: 'Your design systems' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Your design systems' })).toHaveCount(0);
  await expect(opener).toBeFocused();
});
