import { expect, type Page, test } from '@playwright/test';

async function waitForAvatar(page: Page, loginName: string): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const state = window.__cellwarz;
      return !!state && state.renderer.avatars[name] !== undefined;
    },
    loginName,
    { timeout: 5000 },
  );
}

async function getAvatarPosition(page: Page, loginName: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((name) => {
    const state = window.__cellwarz;
    if (!state) return null;
    const spriteId = state.renderer.avatars[name];
    const sprite = spriteId !== undefined ? state.renderer.sprites[spriteId] : undefined;
    return sprite ? { x: sprite[1], y: sprite[2] } : null;
  }, loginName);
}

/** The avatar keeps falling under gravity (server-side physics runs independent of the client) until it lands. */
async function waitUntilGrounded(page: Page, loginName: string): Promise<{ x: number; y: number }> {
  let previous = await getAvatarPosition(page, loginName);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const current = await getAvatarPosition(page, loginName);
    if (current && previous && current.y === previous.y) {
      return current;
    }
    previous = current;
  }
  throw new Error('Avatar never settled');
}

test('reattaching reconnects to the same avatar at the same position', async ({ page }) => {
  const loginName = `reattach-${Date.now()}`;

  await page.goto('/');
  await page.locator('#loginName').fill(loginName);
  await page.locator('#random').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);

  const before = await waitUntilGrounded(page, loginName);

  await page.reload();
  await page.locator('#loginName').fill(loginName);
  await page.locator('#enter').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);

  const after = await getAvatarPosition(page, loginName);
  expect(after).toEqual(before);
});
