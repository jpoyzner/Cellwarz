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

test('one gas giant at a time flies through the background and shows on the minimap in its own colour', async ({ page }) => {
  await login(page, 'stargazer');
  await waitForAvatar(page, 'stargazer');

  await expect.poll(() => page.evaluate(() => window.__cellwarz?.renderer.planet?.radius)).toBeGreaterThanOrEqual(140);

  // It really flies: its velocity is non-zero and its position advances.
  const before = await page.evaluate(() => ({ x: window.__cellwarz!.renderer.planet!.x, vx: window.__cellwarz!.renderer.planet!.vx }));
  expect(Math.abs(before.vx)).toBeGreaterThanOrEqual(40);
  await expect
    .poll(() => page.evaluate(() => window.__cellwarz!.renderer.planet!.x), { timeout: 3000 })
    .not.toBe(before.x);

  // Park it mid-map (it may still be off-screen on its way in) and look for the minimap's planet colour.
  const planetPixels = await page.evaluate(async () => {
    const renderer = window.__cellwarz!.renderer;
    renderer.planet!.x = 2000;
    renderer.planet!.y = 1000;
    renderer.planet!.vx = 0;
    renderer.planet!.vy = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let amber = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i + 1] > 160 && data[i + 1] < 190 && data[i + 2] < 50 && data[i + 3] > 0) amber++;
    }
    return amber;
  });
  expect(planetPixels).toBeGreaterThan(20);
});

test('background tetrominoes within ~6 avatar heights of the planet fall toward it, and shrink away into its centre instead of breaking', async ({ page }) => {
  await login(page, 'tidalpull');
  await waitForAvatar(page, 'tidalpull');
  await expect.poll(() => page.evaluate(() => window.__cellwarz?.renderer.planet?.radius)).toBeGreaterThan(0);

  // Measured relative to wherever the planet is right now, so a server resync mid-test can't move the goalposts.
  const pull = await page.evaluate(async () => {
    const renderer = window.__cellwarz!.renderer;
    const planet = renderer.planet!;
    const inRange = renderer.spaceBackground!.pieces[0];
    const outOfRange = renderer.spaceBackground!.pieces[1];

    Object.assign(inRange, { x: planet.x + planet.radius + 100, y: planet.y, dx: 0, dy: 0 });
    Object.assign(outOfRange, { x: planet.x + planet.radius + 500, y: planet.y, dx: 0, dy: 0 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    return { inRangeDx: inRange.dx, outOfRangeDx: outOfRange.dx };
  });
  expect(pull.inRangeDx).toBeLessThan(0);
  expect(pull.outOfRangeDx).toBe(0);

  // Reaching the centre doesn't shatter a piece: it shrinks away, and only then is it gone.
  await page.evaluate(() => {
    const renderer = window.__cellwarz!.renderer;
    const planet = renderer.planet!;
    const piece = renderer.spaceBackground!.pieces[2];
    Object.assign(piece, { x: planet.x, y: planet.y, dx: 0, dy: 0 });
    window.__target = piece;
  });
  await expect
    .poll(() => page.evaluate(() => (window.__target as { consumedMs?: number }).consumedMs ?? 0), { timeout: 2000 })
    .toBeGreaterThan(0);
  await page.waitForFunction(() => !window.__cellwarz!.renderer.spaceBackground!.pieces.includes(window.__target!), undefined, {
    timeout: 3000,
  });
});
