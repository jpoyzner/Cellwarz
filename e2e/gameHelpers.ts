import type { Page } from '@playwright/test';

/** Fills the login form and clicks "Enter randomly!" (shared by the newer, more scenario-heavy specs). */
export async function login(page: Page, loginName: string): Promise<void> {
  await page.goto('/');
  await page.locator('#loginName').fill(loginName);
  await page.locator('#random').click();
}

export async function waitForAvatar(page: Page, loginName: string, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const state = window.__cellwarz;
      return !!state && state.renderer.avatars[name] !== undefined;
    },
    loginName,
    { timeout },
  );
}

export async function getAvatarPosition(page: Page, loginName: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((name) => {
    const state = window.__cellwarz;
    if (!state) return null;
    const spriteId = state.renderer.avatars[name];
    const sprite = spriteId !== undefined ? state.renderer.sprites[spriteId] : undefined;
    return sprite ? { x: sprite[1], y: sprite[2] } : null;
  }, loginName);
}

/** Finds the spriteId of whatever's currently rendered near (x, y) — used to track a known mana fixture.
 * Keep the tolerance tight; the room also has random mana instances that could otherwise false-match. */
export async function findSpriteNear(page: Page, x: number, y: number, tolerance = 6): Promise<string | undefined> {
  return page.evaluate(
    ({ x, y, tolerance }) => {
      const state = window.__cellwarz;
      if (!state) return undefined;
      for (const [id, sprite] of Object.entries(state.renderer.sprites)) {
        if (Math.abs(sprite[1] - x) <= tolerance && Math.abs(sprite[2] - y) <= tolerance) return id;
      }
      return undefined;
    },
    { x, y, tolerance },
  );
}

/**
 * Holds `key` down until the avatar's x position crosses `targetX`, tapping a jump only when the avatar's
 * x stops advancing (i.e. it's actually blocked by something, like a low mana/block obstacle) rather than
 * jumping blindly — MainRoom's floor is otherwise a clear walkway, and blind jumping risks climbing onto
 * the stepping-stone columns that pass just overhead near the center hole.
 */
export async function walkTo(
  page: Page,
  loginName: string,
  key: 'ArrowLeft' | 'ArrowRight',
  targetX: number,
  opts: { tolerance?: number; timeoutMs?: number } = {},
): Promise<void> {
  const tolerance = opts.tolerance ?? 40;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const leftward = key === 'ArrowLeft';
  const deadline = Date.now() + timeoutMs;

  await page.keyboard.down(key);
  try {
    let lastX: number | undefined;

    while (Date.now() < deadline) {
      const pos = await getAvatarPosition(page, loginName);

      if (pos) {
        if (leftward ? pos.x <= targetX + tolerance : pos.x >= targetX - tolerance) return;

        if (lastX !== undefined && Math.abs(pos.x - lastX) < 4) {
          await page.keyboard.press('ArrowUp');
        }

        lastX = pos.x;
      }

      await page.waitForTimeout(250);
    }

    throw new Error(`walkTo timed out before reaching x=${targetX} (loginName=${loginName})`);
  } finally {
    await page.keyboard.up(key);
  }
}
