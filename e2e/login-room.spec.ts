import { expect, test } from '@playwright/test';
import { login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

test('the login screen is a ship interior with your avatar, a TELEPORT transporter and a live radar — and no WAKE UP yet', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#ship-canvas')).toBeVisible();
  await expect(page.locator('#teleport')).toHaveText('TELEPORT');
  await expect(page.locator('#wakeup')).toHaveCount(0);
  await expect(page.locator('#radar-canvas')).toBeVisible();
  await expect(page.locator('#loginName')).toBeVisible();
  expect(await page.locator('#enter, #random').count()).toBe(0); // the old buttons are gone

  // The radar is live before logging in: it receives the main room's walls.
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__cellwarzLogin!.radar.sprites).length), { timeout: 5000 })
    .toBeGreaterThan(100);

  // The avatar walks around the room and jumps (the arrow keys work even while the name field has focus).
  const startX = await page.evaluate(() => window.__cellwarzLogin!.room.avatar.x);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.avatar.x)).toBeLessThan(startX - 30);

  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.onGround)).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.onGround)).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test('a transporter will not fire without a callsign', async ({ page }) => {
  await page.goto('/');
  await page.locator('#teleport').click();

  await expect(page.locator('#login-notice')).toContainText('CALLSIGN');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCount(0);
});

test('walking the avatar onto the TELEPORT pad beams you into the main room', async ({ page }) => {
  const name = `walker-${Date.now()}`;
  await page.goto('/');
  await page.locator('#loginName').fill(name);

  await page.keyboard.down('ArrowRight');
  try {
    await expect(page.locator('#canvas')).toBeVisible({ timeout: 10000 });
  } finally {
    await page.keyboard.up('ArrowRight');
  }

  await expect(page.locator('#login')).toHaveCount(0);
  await waitForAvatar(page, name);
});

test('WAKE UP appears only for a callsign with a living avatar, and wakes that avatar where it sleeps', async ({ page }) => {
  const name = `sleepy-${Date.now()}`;
  await login(page, name);
  await waitForAvatar(page, name);
  const grounded = await waitUntilGrounded(page, name);

  // Escape twice: the avatar falls asleep where it stands, then you are back in the login room.
  await page.locator('#canvas').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('asleep');
  await page.keyboard.press('Escape');
  await expect(page.locator('#login')).toBeVisible();

  // The callsign is remembered, and the radar shows its avatar is still in the room, so the transporter is there.
  await expect(page.locator('#loginName')).toHaveValue(name);
  await expect(page.locator('#wakeup')).toHaveText('WAKE UP');
  await expect(page.locator('#teleport')).toBeVisible();

  await page.locator('#loginName').fill(`nobody-${Date.now()}`);
  await expect(page.locator('#wakeup')).toHaveCount(0);

  await page.locator('#loginName').fill(name);
  await page.locator('#wakeup').click();
  await waitForAvatar(page, name);
  const woken = await waitUntilGrounded(page, name);
  expect(woken).toEqual(grounded);
  expect(await page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('off');
});

test('the radar shows other players in the main room before you enter it', async ({ page, browser }) => {
  const otherName = `lurker-${Date.now()}`;
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();

  try {
    await login(otherPage, otherName);
    await waitForAvatar(otherPage, otherName);

    await page.goto('/');
    await expect
      .poll(() => page.evaluate((n) => window.__cellwarzLogin!.radar.hasLivingAvatar(n), otherName), { timeout: 5000 })
      .toBe(true);
    await expect(page.locator('#radar-readout')).toContainText(/[1-9]\d* PILOT/);

    // Typing that player's callsign offers WAKE UP (it is "their" avatar), a made-up one does not.
    await page.locator('#loginName').fill(otherName);
    await expect(page.locator('#wakeup')).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

test('headband and belt colours are chosen in the login room and worn in the game, where other players see them too', async ({ page, browser }) => {
  const name = `dandy-${Date.now()}`;
  const watcherName = `watcher-${Date.now()}`;
  await page.goto('/');
  await page.locator('#loginName').fill(name);
  await page.locator('#headband-colors [data-color="#3cff7a"]').click();
  await page.locator('#belt-colors [data-color="#ff2ea6"]').click();

  // The avatar in the room wears them straight away.
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.look)).toEqual({ headband: '#3cff7a', belt: '#ff2ea6' });
  await page.locator('#teleport').click();
  await waitForAvatar(page, name);
  await expect
    .poll(() => page.evaluate((n) => window.__cellwarz!.renderer.looks[n], name))
    .toEqual(['#3cff7a', '#ff2ea6']);

  const watcherContext = await browser.newContext();
  const watcherPage = await watcherContext.newPage();
  try {
    await login(watcherPage, watcherName);
    await waitForAvatar(watcherPage, name);
    await expect
      .poll(() => watcherPage.evaluate((n) => window.__cellwarz!.renderer.looks[n], name))
      .toEqual(['#3cff7a', '#ff2ea6']);
    // The watcher picked nothing, so they wear the defaults.
    expect(await watcherPage.evaluate((n) => window.__cellwarz!.renderer.looks[n], watcherName)).toBeUndefined();
  } finally {
    await watcherContext.close();
  }
});

test('robot red cannot be picked for the headband or belt', async ({ page }) => {
  await page.goto('/');

  await page.locator('#headband-colors input[type="color"]').fill('#ff0000');
  await expect(page.locator('#login-notice')).toContainText('RED IS RESERVED FOR ROBOTS');
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.look)).toBeNull();

  await page.locator('#belt-colors input[type="color"]').fill('#ff2040');
  await expect(page.locator('#login-notice')).toContainText('RED IS RESERVED FOR ROBOTS');
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.look)).toBeNull();

  await page.locator('#headband-colors input[type="color"]').fill('#00aaff');
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.look)).toEqual({ headband: '#00aaff', belt: '#00f6ff' });
});
