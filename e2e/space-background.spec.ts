import { expect, test } from '@playwright/test';
import { login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

test('MainRoom uses the orbital-station backdrop, and running into a background tetromino shatters it', async ({ page }) => {
  await login(page, 'spacewalker');
  await waitForAvatar(page, 'spacewalker');

  await expect.poll(() => page.evaluate(() => window.__cellwarz?.renderer.backgroundKind)).toBe('station');
  await expect(page.locator('#canvas-bg')).toBeHidden();

  const start = await waitUntilGrounded(page, 'spacewalker');

  // Park a motionless piece in the world, ahead of the avatar on its walking path.
  await page.evaluate(({ x, y }) => {
    const target = window.__cellwarz!.renderer.spaceBackground!.pieces[0];
    target.dx = 0;
    target.dy = 0;
    target.x = x + 24 + 250;
    target.y = y + 32;
    window.__target = target;
  }, start);

  await page.locator('#canvas').click();
  await page.keyboard.down('ArrowRight');

  try {
    await page.waitForFunction(() => !window.__cellwarz!.renderer.spaceBackground!.pieces.includes(window.__target!), undefined, {
      timeout: 4000,
    });
  } finally {
    await page.keyboard.up('ArrowRight');
  }
});

test('blocks broken by the local avatar fly to the top-right score and add 20 points each', async ({ page }) => {
  await login(page, 'scorekeeper');
  await waitForAvatar(page, 'scorekeeper');
  const start = await waitUntilGrounded(page, 'scorekeeper');

  await expect(page.locator('#score')).toHaveText(/^\d+$/);

  // Redraw frames key sprites by string id, so the local avatar's id must be a string too or its blocks won't collect.
  const idTypes = await page.evaluate(() => Object.values(window.__cellwarz!.renderer.avatars).map((id) => typeof id));
  expect(idTypes.every((type) => type === 'string')).toBe(true);

  // The drop from the spawn portal can itself brush a drifting piece, so measure from the current score.
  const baseline = await page.evaluate(() => window.__cellwarz!.renderer.score);

  await page.evaluate(({ x, y }) => {
    const target = window.__cellwarz!.renderer.spaceBackground!.pieces[0];
    target.dx = 0;
    target.dy = 0;
    target.x = x + 24;
    target.y = y + 32;
  }, start);

  // A tetromino has four blocks; other drifting pieces may also happen to touch, so only assert a minimum.
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.score), { timeout: 5000 }).toBeGreaterThanOrEqual(baseline + 80);
  await expect
    .poll(() => page.evaluate(() => window.__cellwarz!.renderer.score).then((score) => score % 20), { timeout: 5000 })
    .toBe(0);
  const score = await page.evaluate(() => window.__cellwarz!.renderer.score);
  await expect(page.locator('#score')).toHaveText(String(score));
});
