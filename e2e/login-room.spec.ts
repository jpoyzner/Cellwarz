import { expect, test } from '@playwright/test';
import { login, waitForAvatar, waitUntilGrounded } from './gameHelpers';

test('the login screen is a ship interior with your avatar, TELEPORT and HOME transporters and a live radar — and no WAKE UP yet', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#ship-canvas')).toBeVisible();
  await expect(page.locator('#teleport')).toHaveText('TELEPORT');
  await expect(page.locator('#home')).toHaveText('HOME');
  await expect(page.locator('#wakeup')).toHaveCount(0);
  await expect(page.locator('#login-notice')).toContainText('PRESS');
  await expect(page.locator('#radar-canvas')).toBeVisible();
  await expect(page.locator('#leaderboard')).toContainText('DISCO SHARDS');
  await expect(page.locator('#desc')).toContainText('disco shards');
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

test('the login screen teaches the controls (a looping demo and key caps) and what each block does', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#controls-demo')).toBeVisible();
  const keys = page.locator('#control-keys li');
  await expect(keys).toHaveCount(7);
  await expect(keys.first()).toContainText('SPACE');
  await expect(keys.first()).toContainText('GRAB / THROW');
  await expect(page.locator('#control-keys')).toContainText('NINJA STAR');
  await expect(page.locator('#control-keys')).toContainText('SAY AN EMOJI');

  // The clip is drawn from the game's own art: once it has loaded the canvas is no longer blank.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#controls-demo')!;
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        return data.some((value, index) => index % 4 === 3 && value > 0);
      }),
    )
    .toBe(true);

  // One entry per block the main room scatters, each with its art loaded.
  const entries = page.locator('#legend [data-block]');
  await expect(entries).toHaveCount(6);
  await expect(page.locator('#legend')).toContainText('5s FUSE');
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#legend img')].every((img) => img.naturalWidth > 0)))
    .toBe(true);
});

test('the login screen is branded Cyberstation', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cyberstation');
  await expect(page.locator('#game-title')).toHaveCount(0);
  await expect(page.locator('#desc')).toContainText('Welcome to the Cyberstation');
  await expect(page.locator('#desc')).toContainText('assimilate');
  await expect(page.locator('#desc')).not.toContainText('rocket/star');
});

test('a transporter will not fire without a callsign', async ({ page }) => {
  await page.goto('/');
  await page.locator('#teleport').click();

  await expect(page.locator('#login-notice')).toContainText('NO TELEPORT');
  await expect(page.locator('#loginName')).toHaveClass(/input-error/);
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCount(0);
});

test('a transporter fires only on an Up press while standing on it: walking onto or across a pad does nothing', async ({ page }) => {
  const name = `walker-${Date.now()}`;
  await page.goto('/');
  await page.waitForFunction(() => !!window.__cellwarzLogin);
  await page.locator('#loginName').fill(name);

  // Run right across the HOME and TELEPORT pads to the wall and let the avatar rest on the TELEPORT pad.
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.x)).toBeGreaterThan(850);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.x)).toBeLessThan(760);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(1000);
  await expect(page.locator('#login')).toBeVisible();
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.isBeaming)).toBe(false);

  // Standing still on it for a good while changes nothing either...
  await page.evaluate(() => {
    window.__cellwarzLogin!.room.avatar.x = 745;
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('#login')).toBeVisible();

  // ...until Up is pressed: the avatar is beamed into the main room (and does not jump on the way).
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#login')).toHaveCount(0);
  await waitForAvatar(page, name);
});

test('Up away from a pad jumps; Up on a pad uses it instead of jumping', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__cellwarzLogin);

  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.onGround)).toBe(false);
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__cellwarzLogin!.room.avatar.onGround)).toBe(true);

  // No callsign yet, so the pad refuses — and the press is not wasted on a jump.
  await page.evaluate(() => {
    window.__cellwarzLogin!.room.avatar.x = 745;
  });
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#login-notice')).toContainText('NO TELEPORT');
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.avatar.onGround)).toBe(true);
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.isBeaming)).toBe(false);
});

test('the HOME pad takes you back to the DJ Recognize website, with no callsign needed', async ({ page }) => {
  await page.route('https://djrecognize.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>DJ Recognize</title>' }));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__cellwarzLogin);

  // Standing on the HOME pad and pressing Up beams you out...
  await page.evaluate(() => {
    window.__cellwarzLogin!.room.avatar.x = 480;
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForURL('https://djrecognize.com/**');
  await expect(page).toHaveTitle('DJ Recognize');

  // ...and so does clicking its label (the touch way).
  await page.goto('/');
  await page.locator('#home').click();
  await page.waitForURL('https://djrecognize.com/**');
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
    await expect(page.locator('#radar-readout')).toContainText(/[1-9]\d* AVATAR/);

    // Typing that player's callsign offers WAKE UP (it is "their" avatar), a made-up one does not.
    await page.locator('#loginName').fill(otherName);
    await expect(page.locator('#wakeup')).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

test('the leaderboard under the callsign panel ranks the players with the most Disco shards', async ({ page }) => {
  const name = `shiny-${Date.now()}`;
  await page.goto('/');
  await expect(page.locator('#leaderboard')).toBeVisible();

  // Collect more shards than whoever leads now (the server may have been up a while), the way the game client reports
  // shattered blocks: in reports of at most 100 blocks (20 shards each).
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__cellwarzLogin!.radar.sprites).length), { timeout: 5000 })
    .toBeGreaterThan(100);
  const leading = await page.evaluate(() => window.__cellwarzLogin!.radar.leaderboard[0]?.[1] ?? 0);
  const blocks = Math.floor(leading / 20) + 1;
  await page.evaluate(
    ({ login, total }) => {
      const socket = new WebSocket(`ws://${window.location.host}/socketrefresh`);
      socket.onopen = () => {
        socket.send(JSON.stringify({ connect: true, login, jump: true }));
        for (let left = total; left > 0; left -= 100) socket.send(JSON.stringify({ scored: Math.min(left, 100) }));
      };
    },
    { login: name, total: blocks },
  );

  const firstRow = page.locator('#leaderboard li').first();
  await expect(firstRow.locator('.leader-name')).toHaveText(name, { timeout: 5000 });
  await expect(firstRow.locator('.leader-shards')).toHaveText(String(blocks * 20));
  expect(await page.locator('#leaderboard li').count()).toBeLessThanOrEqual(3);
});

test('headband and belt colours are chosen in the login room and worn in the game, where other players see them too', async ({ page, browser }) => {
  const name = `dandy-${Date.now()}`;
  const watcherName = `watcher-${Date.now()}`;
  await page.goto('/');
  await page.locator('#loginName').fill(name);
  await page.locator('#headband-colors [data-color="#b45cff"]').click();
  await page.locator('#belt-colors [data-color="#ff2ea6"]').click();

  // The avatar in the room wears them straight away.
  expect(await page.evaluate(() => window.__cellwarzLogin!.room.look)).toEqual({ headband: '#b45cff', belt: '#ff2ea6' });
  await page.locator('#teleport').click();
  await waitForAvatar(page, name);
  await expect
    .poll(() => page.evaluate((n) => window.__cellwarz!.renderer.looks[n], name))
    .toEqual(['#b45cff', '#ff2ea6']);

  const watcherContext = await browser.newContext();
  const watcherPage = await watcherContext.newPage();
  try {
    await login(watcherPage, watcherName);
    await waitForAvatar(watcherPage, name);
    await expect
      .poll(() => watcherPage.evaluate((n) => window.__cellwarz!.renderer.looks[n], name))
      .toEqual(['#b45cff', '#ff2ea6']);
    // The watcher picked nothing, so they wear the defaults.
    expect(await watcherPage.evaluate((n) => window.__cellwarz!.renderer.looks[n], watcherName)).toBeUndefined();
  } finally {
    await watcherContext.close();
  }
});
