import { expect, test } from '@playwright/test';
import { login, waitForAvatar } from './gameHelpers';

// The server's real inactivity freeze takes about a minute, so this triggers the client's reaction to it directly
// (the frozen-level message calls Renderer.drawStaleScreen(), see src/game/syncer.ts).
test('the music stops when the level freezes for inactivity, and returns when the level wakes up', async ({ page }) => {
  await login(page, 'sleeper');
  await waitForAvatar(page, 'sleeper');

  // The first sound starts the music (browsers only allow audio after a user gesture).
  await page.locator('#canvas').click();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.isMusicPlaying)).toBe(true);

  // The live server keeps sending frames, which would un-freeze the client at once; hold them back while frozen.
  await page.evaluate(() => {
    const renderer = window.__cellwarz!.renderer as any;
    renderer.render = () => undefined;
    renderer.applyFullState = () => undefined;
    renderer.drawStaleScreen();
  });
  expect(await page.evaluate(() => window.__cellwarz!.renderer.isMusicPlaying)).toBe(false);

  // Sound effects while frozen must not restart it.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.isMusicPlaying)).toBe(false);

  // Frames arriving again (the level waking up) bring the music back.
  await page.evaluate(() => {
    const renderer = window.__cellwarz!.renderer as any;
    delete renderer.render;
    delete renderer.applyFullState;
  });
  await page.keyboard.down('ArrowRight');
  try {
    await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.isMusicPlaying)).toBe(true);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
});
