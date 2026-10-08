import { expect, test } from '@playwright/test';
import { SPAWN_ENTRANCE_PIXELS, TEST_FIXTURE_PIXELS, WRAP_OPENING_PIXELS } from '../server/cell/mainRoom';
import { findSpriteNear, getAvatarPosition, login, waitForAvatar, waitUntilGrounded, walkTo } from './gameHelpers';

// The fixed Thruster/Launcher sit on the floor at known pixel positions (see server/cell/mainRoom.ts)
// purely so these tests have deterministic targets — the room's other mana positions stay randomized.
const THRUSTER_X = TEST_FIXTURE_PIXELS.thrusterX;
const THRUSTER_Y = 1896;
const LAUNCHER_X = TEST_FIXTURE_PIXELS.launcherX;
// Kept close to the launcher (not further down the shared floor) so a stray randomly-placed mana/robot
// elsewhere in the room can't land in the missile's path and block it before it reaches the victim.
const VICTIM_STAND_X = LAUNCHER_X + 64;

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

  // Runs before the mana-pickup test below (which leaves its own avatar sitting near the Thruster) so the
  // killer/victim have a clear floor to walk across on their way to the Launcher/stand-off point.
  test('a missile from a Launcher kills another avatar, who then respawns at the spawn portal', async ({ page, browser }) => {
    test.setTimeout(60000);
    const killerName = `killer-${Date.now()}`;
    const victimName = `victim-${Date.now()}`;

    await login(page, killerName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, killerName);
    await page.locator('#canvas').click();

    // Get the killer fully off the shared spawn portal tile *before* the victim even logs in — two avatars
    // spawning on top of each other at the exact same coordinates is a much messier collision to resolve
    // than either of them individually hopping over a single obstacle later on.
    await walkTo(page, killerName, 'ArrowRight', LAUNCHER_X, { timeoutMs: 20000 });
    // Let the killer finish landing on the launcher before trying to connect to it.
    await page.waitForTimeout(600);
    await page.keyboard.press('ArrowDown');

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await login(pageB, victimName);
      await expect(pageB.locator('#canvas')).toBeVisible();
      await waitForAvatar(pageB, victimName);
      await pageB.locator('#canvas').click();

      const spawnPortalPosition = await waitUntilGrounded(pageB, victimName);

      // Victim stands just to the right of the launcher, in the path of a rightward-fired missile.
      await walkTo(pageB, victimName, 'ArrowRight', VICTIM_STAND_X, { timeoutMs: 20000 });
      // Let the victim finish landing/settling before it needs to be exactly in the missile's flight row.
      await page.waitForTimeout(600);

      // Fire a missile to the right (key "2"). Retry the shot a few times rather than treating one
      // mistimed/unlucky shot (e.g. the victim still mid-air) as a hard failure.
      let killed = false;
      for (let attempt = 0; attempt < 5 && !killed; attempt++) {
        await page.keyboard.press('2');
        try {
          await page.waitForFunction(
            (name) => {
              const state = window.__cellwarz;
              return !!state && state.renderer.avatars[name] === undefined;
            },
            victimName,
            { timeout: 3000 },
          );
          killed = true;
        } catch {
          const stillThere = await getAvatarPosition(pageB, victimName);
          if (!stillThere) killed = true;
        }
      }
      expect(killed).toBe(true);

      // Reattaching places a fresh avatar back at the (fixed, deterministic) spawn portal.
      await pageB.reload();
      await pageB.locator('#loginName').fill(victimName);
      await pageB.locator('#enter').click();
      await expect(pageB.locator('#canvas')).toBeVisible();
      await waitForAvatar(pageB, victimName);

      const respawned = await waitUntilGrounded(pageB, victimName);
      expect(respawned).toEqual(spawnPortalPosition);
    } finally {
      await contextB.close();
    }
  });

  test('connecting, picking up, and setting down a mana block works end to end', async ({ page }) => {
    test.setTimeout(30000);
    const loginName = `mana-${Date.now()}`;

    await login(page, loginName);
    await expect(page.locator('#canvas')).toBeVisible();
    await waitForAvatar(page, loginName);
    await page.locator('#canvas').click();

    const thrusterId = await findSpriteNear(page, THRUSTER_X, THRUSTER_Y);
    expect(thrusterId).toBeDefined();

    await walkTo(page, loginName, 'ArrowRight', THRUSTER_X, { timeoutMs: 15000 });

    // Let the avatar finish landing on the mana before trying to connect to it.
    await page.waitForTimeout(600);

    // Down connects the avatar to the mana's structure — a dashboard tool icon should appear top-right.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#mana1')).not.toHaveCSS('background-image', 'none', { timeout: 3000 });

    // Space picks it up — it should now track just above the avatar's position every frame.
    await page.keyboard.press('Space');
    await page.waitForFunction(
      ({ id, name }) => {
        const state = window.__cellwarz;
        if (!state) return false;
        const mana = state.renderer.sprites[id];
        const avatarId = state.renderer.avatars[name];
        const avatar = avatarId !== undefined ? state.renderer.sprites[avatarId] : undefined;
        return !!mana && !!avatar && Math.abs(mana[1] - avatar[1]) < 20 && mana[2] < avatar[2];
      },
      { id: thrusterId, name: loginName },
      { timeout: 3000 },
    );

    // It should keep following as the avatar moves while handled.
    const beforeMove = await getAvatarPosition(page, loginName);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    const afterMove = await getAvatarPosition(page, loginName);
    expect(afterMove!.x).toBeGreaterThan(beforeMove!.x);

    const manaAfterMove = await page.evaluate((id) => window.__cellwarz?.renderer.sprites[id], thrusterId);
    expect(Math.abs(manaAfterMove![1] - afterMove!.x)).toBeLessThan(20);

    // Space again sets it back down.
    await page.keyboard.press('Space');
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
