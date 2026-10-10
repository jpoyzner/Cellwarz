import { expect, test } from '@playwright/test';
import { SPAWN_ENTRANCE_PIXELS, TEST_FIXTURE_PIXELS, WRAP_OPENING_PIXELS } from '../server/cell/mainRoom';
import { findSpriteNear, getAvatarPosition, hopTo, login, standOnBlock, waitForAvatar, waitUntilGrounded, walkTo } from './gameHelpers';

// The fixed yellow, green and red blocks sit on the floor at known pixel positions (see server/cell/mainRoom.ts)
// purely so these tests have deterministic targets — the room's other block positions stay randomized.
const THRUSTER_X = TEST_FIXTURE_PIXELS.thrusterX;
const SHIELD_X = TEST_FIXTURE_PIXELS.shieldX;
const LAUNCHER_X = TEST_FIXTURE_PIXELS.launcherX;
const THRUSTER_Y = 1896;

// All of these scenarios rely on avatars sitting at deterministic positions in the single shared MainRoom
// (see server/zion.ts) — avatars can push each other around, so run them one at a time rather than letting
// Playwright's default parallelism spawn multiple of these tests' avatars into the room at once.
test.describe.configure({ mode: 'serial' });

test.describe('MainRoom deterministic workflows', () => {
  test('the outer walls have wrap openings on both sides of the floor/ceiling and at two heights on each end', async ({ page }) => {
    const loginName = `openings-${Date.now()}`;
    await login(page, loginName);
    await waitForAvatar(page, loginName);

    const probes = await page.evaluate((openings) => {
      const renderer = window.__cellwarz!.renderer;
      const wallImageIndex = renderer.imagePaths.findIndex((path) => path.includes('/blocks/'));
      const walls = new Set(
        Object.values(renderer.sprites)
          .filter(([imageIndex]) => imageIndex === wallImageIndex)
          .map(([, x, y]) => `${x},${y}`),
      );
      const isWall = (x: number, y: number) => walls.has(`${x},${y}`);
      const rightX = 4000 - 16;
      const { verticalLeftX, verticalRightX } = openings;

      return {
        hasWalls: wallImageIndex >= 0,
        // Open: through the floor+bottom wall and top wall at both x spans; solid just beside them.
        verticalOpen: [verticalLeftX, verticalRightX].every(
          (x) => !isWall(x, 0) && !isWall(x, 1920) && !isWall(x, 1936) && !isWall(x, 1984),
        ),
        verticalSolidBeside: [verticalLeftX - 16, verticalLeftX + openings.verticalWidth].every(
          (x) => isWall(x, 0) && isWall(x, 1920),
        ),
        sideOpen: openings.sideOpenings.map(({ top, bottom }) => ({
          open: [0, rightX].every((x) => !isWall(x, top) && !isWall(x, bottom - 16)),
          sillBelow: [0, rightX].every((x) => isWall(x, bottom)),
          lintelAbove: [0, rightX].every((x) => isWall(x, top - 16)),
        })),
      };
    }, WRAP_OPENING_PIXELS);

    expect(probes.hasWalls).toBe(true);
    expect(probes.verticalOpen).toBe(true);
    expect(probes.verticalSolidBeside).toBe(true);
    expect(probes.sideOpen).toHaveLength(2);
    for (const side of probes.sideOpen) {
      expect(side).toEqual({ open: true, sillBelow: true, lintelAbove: true });
    }
  });

  test('falling through a floor opening wraps back onto the top edge', async ({ page }) => {
    test.setTimeout(40000);
    const loginName = `wrap-${Date.now()}`;

    await login(page, loginName);
    await waitForAvatar(page, loginName);
    await page.locator('#canvas').click();
    await waitUntilGrounded(page, loginName);

    await walkTo(page, loginName, 'ArrowLeft', WRAP_OPENING_PIXELS.verticalLeftX + 24, { tolerance: 0, timeoutMs: 30000 });
    await page.waitForFunction(
      (name) => {
        const state = window.__cellwarz;
        const spriteId = state?.renderer.avatars[name];
        const sprite = spriteId ? state?.renderer.sprites[spriteId] : undefined;
        return sprite !== undefined && sprite[2] < 400;
      },
      loginName,
      { timeout: 5000 },
    );

    const wrapped = await getAvatarPosition(page, loginName);
    expect(wrapped).not.toBeNull();
    expect(wrapped!.x).toBeGreaterThanOrEqual(WRAP_OPENING_PIXELS.verticalLeftX);
    expect(wrapped!.x).toBeLessThan(WRAP_OPENING_PIXELS.verticalLeftX + WRAP_OPENING_PIXELS.verticalWidth);
    expect(wrapped!.y).toBeLessThan(400);
  });

  // The two stargates sit in the top corners, only reachable by climbing MainRoom's center stepping-stone
  // shaft — deliberately organic, skill-based platforming (jump while drifting between offset columns),
  // not scriptable deterministically. The warp mechanic itself is covered at the engine level
  // (server/__tests__/portal.test.ts); this only exercises the reachable half: a fresh avatar is deposited
  // at the (fixed) spawn portal, floating above the floor, and drops onto it under gravity.
  test('a fresh avatar drops onto the floor from the fixed spawn portal', async ({ page }) => {
    test.setTimeout(30000);
    const loginName = `portal-${Date.now()}`;

    await login(page, loginName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, loginName);
    await page.locator('#canvas').click();

    const spawn = await waitUntilGrounded(page, loginName);
    expect(Math.abs(spawn.x - SPAWN_ENTRANCE_PIXELS.x)).toBeLessThan(40);
    // It free-falls from the floating portal before landing, rather than appearing already grounded.
    expect(spawn.y).toBeGreaterThan(SPAWN_ENTRANCE_PIXELS.y);
  });

  test('the HUD shows the credits and diamonds counters, and no tool dashboard icons any more', async ({ page }) => {
    const loginName = `hud-${Date.now()}`;
    await login(page, loginName);
    await waitForAvatar(page, loginName);

    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#diamonds')).toHaveText('0');
    await expect(page.locator('.dash-icon')).toHaveCount(0);
  });

  // Replays what the server sends when this player collects a diamond (the diamond sprite vanishing at their avatar,
  // plus the new total) — nothing in this room makes diamonds on demand — and checks it flies into the HUD.
  test('a collected diamond flies to the diamonds counter, which only then counts it', async ({ page }) => {
    const loginName = `gem-${Date.now()}`;
    await login(page, loginName);
    await waitForAvatar(page, loginName);
    await waitUntilGrounded(page, loginName);
    await expect(page.locator('#diamonds')).toHaveText('0');

    await page.evaluate((name) => {
      const { renderer } = window.__cellwarz!;
      const avatar = renderer.sprites[renderer.avatars[name]];
      const diamondImage = renderer.imagePaths.findIndex((path) => path.includes('/effects/diamond'));
      const id = '987654';
      renderer.render({ [id]: [diamondImage, avatar[1] + 16, avatar[2] + 24] });
      renderer.render({ [id]: [-1] });
      renderer.setDiamonds(1);
    }, loginName);

    // The server's total is in at once, but the counter waits for the diamond to arrive…
    expect(await page.evaluate(() => window.__cellwarz!.renderer.diamonds)).toBe(1);
    expect(await page.evaluate(() => window.__cellwarz!.renderer.shownDiamonds)).toBe(0);
    // …and then shows it.
    await expect(page.locator('#diamonds')).toHaveText('1', { timeout: 5000 });
  });

  // The yellow Thruster is an ordinary block until touched. This runs before the other fixture tests: walking
  // right from the spawn portal touches it first, and once touched it keeps falling upwards for good.
  test('touching the yellow block makes it fall upwards', async ({ page }) => {
    test.setTimeout(40000);
    const loginName = `yellow-${Date.now()}`;

    await login(page, loginName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, loginName);
    await page.locator('#canvas').click();

    const thrusterId = await findSpriteNear(page, THRUSTER_X, THRUSTER_Y);
    expect(thrusterId).toBeDefined();
    await waitUntilGrounded(page, loginName);

    // Untouched, it sits on the floor.
    await page.waitForTimeout(500);
    expect((await page.evaluate((id) => window.__cellwarz?.renderer.sprites[id], thrusterId))![2]).toBe(THRUSTER_Y);

    await walkTo(page, loginName, 'ArrowRight', THRUSTER_X, { timeoutMs: 20000 });

    // An avatar standing right beside the block still overlaps the cells above it, so step away to let it rise.
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');

    await page.waitForFunction(
      ({ id, y }) => {
        const sprite = window.__cellwarz?.renderer.sprites[id];
        return !!sprite && sprite[2] < y - 48;
      },
      { id: thrusterId, y: THRUSTER_Y },
      { timeout: 10000 },
    );
  });

  test('picking up, putting down, and throwing a block works end to end', async ({ page }) => {
    test.setTimeout(60000);
    const loginName = `mana-${Date.now()}`;

    await login(page, loginName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, loginName);
    await page.locator('#canvas').click();

    // The green fixture: nothing happens when it's touched, so it's the safe block to practice on.
    const shieldId = await findSpriteNear(page, SHIELD_X, THRUSTER_Y);
    expect(shieldId).toBeDefined();

    await walkTo(page, loginName, 'ArrowRight', SHIELD_X - 100, { tolerance: 8, timeoutMs: 25000 });
    await standOnBlock(page, loginName, shieldId!);

    const isCarried = ({ id, name }: { id: string; name: string }) => {
      const state = window.__cellwarz;
      if (!state) return false;
      const block = state.renderer.sprites[id];
      const avatarId = state.renderer.avatars[name];
      const avatar = avatarId !== undefined ? state.renderer.sprites[avatarId] : undefined;
      return !!block && !!avatar && Math.abs(block[1] - avatar[1]) < 20 && block[2] < avatar[2];
    };

    // Space picks it up — it should now track just above the avatar's position every frame.
    await page.keyboard.press('Space');
    await page.waitForFunction(isCarried, { id: shieldId, name: loginName }, { timeout: 3000 });

    // It should keep following as the avatar moves while carried.
    const beforeMove = await getAvatarPosition(page, loginName);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    const afterMove = await getAvatarPosition(page, loginName);
    expect(afterMove!.x).toBeLessThan(beforeMove!.x);
    const carriedAfterMove = await page.evaluate((id) => window.__cellwarz?.renderer.sprites[id], shieldId);
    expect(Math.abs(carriedAfterMove![1] - afterMove!.x)).toBeLessThan(20);

    // Down puts it back down: no longer carried above the avatar, which now stands on it instead.
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      ({ id, name }) => {
        const state = window.__cellwarz;
        const block = state?.renderer.sprites[id];
        const avatarId = state?.renderer.avatars[name];
        const avatar = avatarId !== undefined ? state?.renderer.sprites[avatarId] : undefined;
        return !!block && !!avatar && block[2] > avatar[2];
      },
      { id: shieldId, name: loginName },
      { timeout: 3000 },
    );

    // Pick it up again, face left, and press Space again to throw it: it arcs away (up first, then down).
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.waitForFunction(isCarried, { id: shieldId, name: loginName }, { timeout: 3000 });
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowLeft');
    const beforeThrow = await page.evaluate((id) => window.__cellwarz!.renderer.sprites[id], shieldId);

    await page.keyboard.press('Space');
    const trail: Array<[number, number]> = [];
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(80);
      const sprite = await page.evaluate((id) => window.__cellwarz?.renderer.sprites[id], shieldId);
      if (sprite) trail.push([sprite[1], sprite[2]]);
    }

    const highest = Math.min(...trail.map(([, y]) => y));
    const lowest = Math.max(...trail.map(([, y]) => y));
    expect(highest).toBeLessThan(beforeThrow![2] - 16); // rose in an arc…
    expect(lowest).toBeGreaterThan(highest + 16); // …and came back down…
    expect(Math.min(...trail.map(([x]) => x))).toBeLessThan(beforeThrow![1] - 40); // …toward the side the avatar was facing.
  });

  // Hops right along the floor over the other blocks (which would otherwise be shoved ahead of the avatar, keeping
  // it from the red block) up to the red one, whose five second fuse starts the moment the avatar touches it. A second browser context far from the blast watches, since the
  // victim's own connection goes silent the instant it dies.
  test('a red block explodes five seconds after it is touched, killing the avatar beside it, who then respawns', async ({ page, browser }) => {
    test.setTimeout(80000);
    const bomberName = `bomber-${Date.now()}`;
    const observerName = `observer-${Date.now()}`;

    await login(page, bomberName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, bomberName);
    await page.locator('#canvas').click();

    const launcherId = await findSpriteNear(page, LAUNCHER_X, THRUSTER_Y);
    expect(launcherId).toBeDefined();
    const spawnPortalPosition = await waitUntilGrounded(page, bomberName);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await login(pageB, observerName);
      await expect(pageB.locator('#canvas')).toBeVisible();
      await waitForAvatar(pageB, observerName);
      await waitForAvatar(pageB, bomberName);
      await waitUntilGrounded(pageB, observerName);

      await hopTo(page, bomberName, LAUNCHER_X);

      // The fuse burns for ~5s while the avatar stays put beside the block, then it blows up and kills it.
      await pageB.waitForFunction(
        (name) => window.__cellwarz?.renderer.avatars[name] === undefined,
        bomberName,
        { timeout: 15000 },
      );
      expect(await pageB.evaluate((id) => window.__cellwarz?.renderer.sprites[id], launcherId)).toBeUndefined();
      // The observer, standing far from the blast, is unharmed.
      expect(await getAvatarPosition(pageB, observerName)).not.toBeNull();

      // The victim spectates instead of freezing: a message shows, the world keeps moving (the exploded block is gone
      // from their view too) and the arrow keys pan a free camera.
      await expect(page.locator('#spectator')).toContainText('YOU DIED');
      await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('free');
      await expect.poll(() => page.evaluate((id) => window.__cellwarz!.renderer.sprites[id], launcherId)).toBeUndefined();
      const cameraBefore = await page.evaluate(() => window.__cellwarz!.renderer.getPlayerOffset().offsetX);
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(400);
      await page.keyboard.up('ArrowLeft');
      const cameraAfter = await page.evaluate(() => window.__cellwarz!.renderer.getPlayerOffset().offsetX);
      expect(cameraAfter).toBeLessThan(cameraBefore - 100);

      // The dead have nothing to wake up: teleporting in places a fresh avatar back at the (fixed, deterministic) spawn portal.
      await page.reload();
      await page.locator('#loginName').fill(bomberName);
      await expect(page.locator('#wakeup')).toHaveCount(0);
      await page.locator('#teleport').click();
      await expect(page.locator('#canvas')).toBeVisible();
      await waitForAvatar(page, bomberName);

      const respawned = await waitUntilGrounded(page, bomberName);
      expect(respawned.x).toBe(spawnPortalPosition.x);
    } finally {
      await contextB.close();
    }
  });

  test('two logins in the shared room see each other rendered and named', async ({ page, browser }) => {
    const nameA = `mp-a-${Date.now()}`;
    const nameB = `mp-b-${Date.now()}`;

    await login(page, nameA);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, nameA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await login(pageB, nameB);
      await expect(pageB.locator('#canvas')).toBeVisible();
      await waitForAvatar(pageB, nameB);

      // B logs in after A, so B's initial full-state payload already includes A's name and sprite.
      await waitForAvatar(pageB, nameA);

      // A's ongoing redraw stream should pick up B's name/sprite shortly after B spawns.
      await waitForAvatar(page, nameB);

      const aSeenByA = await getAvatarPosition(page, nameA);
      const bSeenByA = await getAvatarPosition(page, nameB);
      const aSeenByB = await getAvatarPosition(pageB, nameA);
      const bSeenByB = await getAvatarPosition(pageB, nameB);

      expect(aSeenByA).not.toBeNull();
      expect(bSeenByA).not.toBeNull();
      expect(aSeenByB).not.toBeNull();
      expect(bSeenByB).not.toBeNull();
    } finally {
      await contextB.close();
    }
  });
});
