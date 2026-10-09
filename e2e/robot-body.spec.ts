import { expect, test } from '@playwright/test';
import { login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

// A robot's touch can't be arranged deterministically (robot positions are random), so this feeds the client the
// full-state refresh the server sends right after a player is turned into a robot (see server/socketHub.ts) and
// checks the client keeps its camera on that body instead of freezing/jumping to the origin.
test('after being turned into a robot, the camera keeps following the robot body', async ({ page }) => {
  await login(page, 'borg-victim');
  await waitForAvatar(page, 'borg-victim');
  await waitUntilGrounded(page, 'borg-victim');

  const bodyId = await page.evaluate(() => {
    const renderer = window.__cellwarz!.renderer as any;
    const id = renderer.avatars['borg-victim'] as string;
    renderer.applyFullState({
      connect: '0',
      sprites: renderer.sprites,
      avatars: {},
      imagePaths: renderer.imagePaths,
      background: renderer.backgroundKind,
      worldWidth: 4000,
      worldHeight: 2000,
      lamps: [],
      planet: null,
      score: 0,
      following: Number(id),
    });
    return id;
  });

  await expect.poll(() => page.evaluate(() => (window.__cellwarz!.renderer as any).getPlayerOffset().me !== undefined)).toBe(true);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.avatars['borg-victim'])).toBeUndefined();

  // The camera stays centered on the robot body rather than resetting to the world origin.
  const { offsetX, me, viewWidth } = await page.evaluate(() => ({
    ...(window.__cellwarz!.renderer as any).getPlayerOffset(),
    viewWidth: window.innerWidth,
  }));
  expect(me).toBeDefined();
  expect(Math.abs(offsetX - (me[1] + 24 - viewWidth / 2))).toBeLessThan(60);
  expect(bodyId).toBeDefined();
});
