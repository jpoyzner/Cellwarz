import { expect, test } from '@playwright/test';
import { login, waitForAvatar } from './gameHelpers';

test('minimap shows the level and can be collapsed to an icon and reopened', async ({ page }) => {
  await login(page, 'minimapper');
  await waitForAvatar(page, 'minimapper');

  const minimap = page.locator('#minimap');
  const minimapCanvas = page.locator('#minimap-canvas');
  const toggle = page.locator('#minimap-toggle');

  await expect(minimapCanvas).toBeVisible();
  await expect
    .poll(() => minimap.evaluate((el) => getComputedStyle(el, '::before').content))
    .toBe('"MAIN ROOM"');

  await expect
    .poll(() =>
      minimapCanvas.evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        return data.some((value) => value !== 0);
      }),
    )
    .toBe(true);

  const openBox = await minimap.boundingBox();

  await toggle.click();
  await expect(minimapCanvas).toBeHidden();
  const closedBox = await minimap.boundingBox();
  expect(closedBox!.width).toBeLessThan(openBox!.width / 2);

  await toggle.click();
  await expect(minimapCanvas).toBeVisible();
});
