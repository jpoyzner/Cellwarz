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
  await page.locator('#teleport').click();

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

test('Escape puts the avatar to sleep and spectates it; a second Escape returns to the login screen, and WAKE UP picks the avatar back up', async ({ page }) => {
  await login(page, 'escaper');
  await waitForAvatar(page, 'escaper');
  await waitUntilGrounded(page, 'escaper');

  // Escape while running must also release the run key, or the abandoned avatar would keep walking.
  await page.locator('#canvas').click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.keyboard.up('ArrowRight');

  // First Escape: the player spectates their sleeping avatar (a free camera) instead of leaving.
  await expect(page.locator('#spectator')).toContainText('ASLEEP');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('asleep');
  await expect(page.locator('#login')).toHaveCount(0);
  const asleepAt = await getAvatarPosition(page, 'escaper');

  // The sleeper ignores arrow keys; they only pan the camera.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  expect(await getAvatarPosition(page, 'escaper')).toEqual(asleepAt);

  await page.keyboard.press('Escape');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCount(0);

  await page.locator('#loginName').fill('escaper');
  await page.locator('#wakeup').click();
  await waitForAvatar(page, 'escaper');
  const first = await waitUntilGrounded(page, 'escaper');
  await page.waitForTimeout(700);
  const second = await getAvatarPosition(page, 'escaper');
  expect(second).toEqual(first);
  expect(first).toEqual(asleepAt);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('off'); // awake again
});

test('an avatar put to sleep by Escape (Zs over its head, eyes shut) wakes when its player reattaches', async ({ page, browser }) => {
  const sleeperName = `sleeper-${Date.now()}`;
  const observerName = `watcher-${Date.now()}`;
  const isAsleep = (name: string) => {
    const { renderer } = window.__cellwarz!;
    const spriteId = renderer.avatars[name];
    return spriteId !== undefined && renderer.sleeping.has(spriteId);
  };

  await login(page, sleeperName);
  await waitForAvatar(page, sleeperName);
  await waitUntilGrounded(page, sleeperName);

  const observerContext = await browser.newContext();
  const observerPage = await observerContext.newPage();

  try {
    await login(observerPage, observerName);
    await waitForAvatar(observerPage, observerName);
    await waitForAvatar(observerPage, sleeperName);
    expect(await observerPage.evaluate(isAsleep, sleeperName)).toBe(false);

    await page.locator('#canvas').click();
    await page.keyboard.press('Escape');

    await expect.poll(() => observerPage.evaluate(isAsleep, sleeperName)).toBe(true);
    // Standing, not running off: the sleeper stays put while the Zs float up.
    const asleepAt = await getAvatarPosition(observerPage, sleeperName);
    await observerPage.waitForTimeout(700);
    expect(await getAvatarPosition(observerPage, sleeperName)).toEqual(asleepAt);

    // Leaving for the login screen (a second Escape) keeps it asleep until the player reattaches.
    await page.keyboard.press('Escape');
    await expect(page.locator('#login')).toBeVisible();
    await observerPage.waitForTimeout(300);
    expect(await observerPage.evaluate(isAsleep, sleeperName)).toBe(true);

    await page.locator('#loginName').fill(sleeperName);
    await page.locator('#wakeup').click();
    await waitForAvatar(page, sleeperName);
    await expect.poll(() => observerPage.evaluate(isAsleep, sleeperName)).toBe(false);
  } finally {
    await observerContext.close();
  }
});

test('Space while spectating your sleeping avatar wakes it up, and you can play on', async ({ page }) => {
  const name = `waker-${Date.now()}`;
  await login(page, name);
  await waitForAvatar(page, name);
  const grounded = await waitUntilGrounded(page, name);

  await page.locator('#canvas').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('asleep');

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('off');
  await expect(page.locator('#spectator')).toHaveCount(0);
  expect(await page.evaluate((n) => {
    const { renderer } = window.__cellwarz!;
    return renderer.sleeping.has(renderer.avatars[n]);
  }, name)).toBe(false);

  // Awake: it obeys the keys again.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const moved = await getAvatarPosition(page, name);
  expect(moved!.x).toBeGreaterThan(grounded.x);
});
