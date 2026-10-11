import { expect, test } from '@playwright/test';
import { VIDEO_NAMES } from '../src/game/tvs';
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
  const before = await page.evaluate(() => window.__cellwarz!.renderer.tvScreens.currentVideoName);
  await page.locator('video').evaluate((el: HTMLVideoElement) => {
    el.currentTime = el.duration - 1;
  });

  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd), { timeout: 10000 }).toBe(true);
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.loop)).toBe(false);

  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd)).toBe(true);

  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isShowingAd), { timeout: 6000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.tvScreens.isPlaying), { timeout: 15000 }).toBe(true);
  // A different video follows the ad, played from the top (a few seconds of playback at most), not from another random point.
  const after = await page.evaluate(() => window.__cellwarz!.renderer.tvScreens.currentVideoName);
  expect(after).toBeDefined();
  expect(after).not.toBe(before);
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.currentSrc)).toContain(`/videos/${after}.`);
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(10);
});

test('every video in the rotation is served in both formats and plays', async ({ page, request }) => {
  const names = VIDEO_NAMES;
  expect(names).toHaveLength(3);
  for (const name of names) {
    for (const extension of ['mp4', 'webm']) {
      const response = await request.head(`/videos/${name}.${extension}`);
      expect(response.status(), `${name}.${extension}`).toBe(200);
    }
  }

  // The WebM copies decode in the test browser (Chromium has no H.264) as full-length portrait videos.
  await page.goto('/');
  for (const name of names) {
    const info = await page.evaluate(
      (src) =>
        new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
          video.onerror = () => reject(new Error(`could not load ${src}`));
          video.src = src;
        }),
      `/videos/${name}.webm`,
    );
    expect(info.duration, name).toBeGreaterThan(60);
    expect([info.width, info.height], name).toEqual([360, 640]);
  }
});
