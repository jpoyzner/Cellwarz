import { expect, test } from '@playwright/test';
import { getAvatarPosition, login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

test('respawn renders the game canvas and starts receiving frames', async ({ page }) => {
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

test('pressing Escape in the game returns to the login screen, and Reattach! picks the avatar back up', async ({ page }) => {
  await login(page, 'escaper');
  await waitForAvatar(page, 'escaper');
  await waitUntilGrounded(page, 'escaper');

  // Escape while running must also release the run key, or the abandoned avatar would keep walking.
  await page.locator('#canvas').click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.keyboard.up('ArrowRight');

  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCount(0);

  await page.locator('#loginName').fill('escaper');
  await page.locator('#enter').click();
  await waitForAvatar(page, 'escaper');
  const first = await waitUntilGrounded(page, 'escaper');
  await page.waitForTimeout(700);
  const second = await getAvatarPosition(page, 'escaper');
  expect(second).toEqual(first);
});
