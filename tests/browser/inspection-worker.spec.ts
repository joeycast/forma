import { expect, test, type Page } from '@playwright/test';

async function openDiagram(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.react-flow__node')).not.toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.react-flow__edge')).toHaveCount(6, { timeout: 30_000 });
  const status = page.locator('.statusbar').getByRole('button');
  await expect(status).not.toHaveText('Checking layout', { timeout: 30_000 });
  await expect(status).not.toHaveText('Checks unavailable', { timeout: 30_000 });
  return status;
}

test('status check opens the worker inspection report with the same issue set', async ({
  page,
}) => {
  const status = await openDiagram(page);
  const statusText = (await status.innerText()).trim();
  const match = statusText.match(/^(\d+) layout suggestions$/);
  expect(statusText === 'All checks passed' || match).toBeTruthy();
  await status.click();

  const inspectTab = page.getByRole('button', { name: /^Inspect/ });
  await expect(inspectTab).toHaveClass(/active/);
  const issues = page.locator('.inspector .issue');
  if (match) {
    await expect(issues).toHaveCount(Number(match[1]));
    await expect(page.getByRole('heading', { name: 'Room to refine' })).toBeVisible();
  } else {
    await expect(issues).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Looking good' })).toBeVisible();
  }
});
