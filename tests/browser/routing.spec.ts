import { expect, test, type Page } from '@playwright/test';

async function openDiagram(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.react-flow__node')).not.toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.react-flow__edge')).not.toHaveCount(0, { timeout: 30_000 });
}

async function selectHttpRoute(page: Page) {
  await page.getByText('HTTPS', { exact: true }).first().click({ force: true });
  const grip = page.locator('.segment-grip').first();
  await expect(grip).toBeVisible();
  const bounds = await grip.boundingBox();
  expect(bounds).not.toBeNull();
  return { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
}

test('default diagram starts with the real layout and ELK workers', async ({ page }) => {
  const workerUrls: string[] = [];
  const workerResponses: { url: string; status: number }[] = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));
  page.on('response', (response) => {
    if (/layout\.worker|elk-worker|elk-api/.test(response.url()))
      workerResponses.push({ url: response.url(), status: response.status() });
  });

  await openDiagram(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect.poll(() => workerUrls.some((url) => url.includes('layout.worker'))).toBe(true);
  await expect.poll(() => workerUrls.some((url) => url.includes('elk-worker'))).toBe(true);
  expect(
    workerResponses.filter((item) => /layout\.worker|elk-worker|elk-api/.test(item.url)),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: 200, url: expect.stringContaining('layout.worker') }),
      expect.objectContaining({ status: 200, url: expect.stringContaining('elk-worker') }),
    ]),
  );
});

test('no-op segment click does not persist generated bends', async ({ page }) => {
  await openDiagram(page);
  const point = await selectHttpRoute(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.locator('.waypoint')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('returning a segment drag to its pointer origin clears the preview without committing', async ({
  page,
}) => {
  await openDiagram(page);
  const point = await selectHttpRoute(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 35, point.y + 15, { steps: 3 });
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.up();

  await expect(page.locator('.waypoint')).toHaveCount(0);
  await expect(page.locator('.segment-grip')).toHaveCount(1);
});

test('Escape cancels a segment drag and clears its preview', async ({ page }) => {
  await openDiagram(page);
  const point = await selectHttpRoute(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 25, point.y + 12, { steps: 2 });
  await page.keyboard.press('Escape');

  await expect(page.locator('.waypoint')).toHaveCount(0);
});

test('pointer cancellation clears a segment preview without committing', async ({ page }) => {
  await openDiagram(page);
  const point = await selectHttpRoute(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 10, { steps: 2 });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
  });

  await expect(page.locator('.waypoint')).toHaveCount(0);
});
