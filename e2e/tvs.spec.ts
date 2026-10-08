import { expect, test } from '@playwright/test';
import { login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

// Wide enough that, from the spawn point at the room's center, both ground-floor TVs are on screen.
const WIDE_VIEWPORT = { width: 2400, height: 900 };

test('MainRoom has background TVs, and the ground-floor ones play the muted video', async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await login(page, 'tvwatcher');
  await waitForAvatar(page, 'tvwatcher');

  const tvCount = await page.evaluate(() => window.__cellwarz!.renderer.tvs.length);
  expect(tvCount).toBe(4);

  await waitUntilGrounded(page, 'tvwatcher');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isPlaying)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.hasSignal), { timeout: 15000 }).toBe(true);

  const video = page.locator('video');
  await expect(video).toHaveCount(1);
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
});

test('the video starts from a random point instead of the beginning', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.setViewportSize(WIDE_VIEWPORT);
  await login(page, 'randomstart');
  await waitForAvatar(page, 'randomstart');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.hasSignal), { timeout: 15000 }).toBe(true);

  const { currentTime, duration } = await page.locator('video').evaluate((el: HTMLVideoElement) => ({
    currentTime: el.currentTime,
    duration: el.duration,
  }));
  // With Math.random fixed at 0.5 the start is half way through the playable range (minus the 10s end margin).
  expect(currentTime).toBeGreaterThan(((duration - 10) * 0.5) - 1);
  expect(currentTime).toBeLessThan(duration - 10);
});

test('when the video ends the TVs show "YOUR AD HERE" for about 5 seconds, then the video restarts from the beginning', async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await login(page, 'adwatcher');
  await waitForAvatar(page, 'adwatcher');
  await waitUntilGrounded(page, 'adwatcher');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.hasSignal), { timeout: 15000 }).toBe(true);

  // Jump to just before the end rather than waiting out the whole video.
  await page.locator('video').evaluate((el: HTMLVideoElement) => {
    el.currentTime = el.duration - 1;
  });

  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd), { timeout: 10000 }).toBe(true);
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.loop)).toBe(false);

  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd)).toBe(true);

  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd), { timeout: 6000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isPlaying)).toBe(true);
  // Restarted from the top (a few seconds of playback at most), not from another random point or the end.
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(10);
});
