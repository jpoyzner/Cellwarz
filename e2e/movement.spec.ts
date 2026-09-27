import { expect, test } from '@playwright/test';

test('running right moves the avatar in the world', async ({ page }) => {
  const loginName = `move-${Date.now()}`;

  await page.goto('/');
  await page.locator('#loginName').fill(loginName);
  await page.locator('#random').click();
  await expect(page.locator('#canvas')).toBeVisible();

  await page.waitForFunction(
    (name) => {
      const state = window.__cellwarz;
      return !!state && state.renderer.avatars[name] !== undefined;
    },
    loginName,
    { timeout: 5000 },
  );

  const getX = () =>
    page.evaluate((name) => {
      const state = window.__cellwarz!;
      const spriteId = state.renderer.avatars[name];
      return state.renderer.sprites[spriteId][1];
    }, loginName);

  const startX = await getX();

  await page.locator('#canvas').click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);

  const endX = await getX();

  expect(endX).toBeGreaterThan(startX);
});
