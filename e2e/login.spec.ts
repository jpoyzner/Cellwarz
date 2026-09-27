import { expect, test } from '@playwright/test';

test('enter randomly renders the game canvas and starts receiving frames', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#login')).toBeVisible();

  await page.locator('#loginName').fill('smoketest');
  await page.locator('#random').click();

  await expect(page.locator('#login')).toHaveCount(0);
  const canvas = page.locator('#canvas');
  await expect(canvas).toBeVisible();

  // Give the WebSocket a moment to connect and the server to stream the first frames.
  await page.waitForTimeout(500);

  const canvasHasContent = await canvas.evaluate((el) => {
    const ctx = (el as HTMLCanvasElement).getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, (el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height);
    return data.some((value) => value !== 0);
  });

  expect(canvasHasContent).toBe(true);
  expect(consoleErrors).toEqual([]);
});
