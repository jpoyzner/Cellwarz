import type { Page } from '@playwright/test';

/** Fills the login form and clicks "Respawn" (shared by the newer, more scenario-heavy specs). */
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

/** A freshly (re)spawned avatar starts at a floating SpawnPortal and free-falls under gravity until it
 * lands — poll until its y position stops changing rather than assuming it's already grounded. */
export async function waitUntilGrounded(page: Page, loginName: string): Promise<{ x: number; y: number }> {
  let previous = await getAvatarPosition(page, loginName);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const current = await getAvatarPosition(page, loginName);
    if (current && previous && current.y === previous.y) {
      return current;
    }
    previous = current;
  }
  throw new Error(`Avatar never settled (loginName=${loginName})`);
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

/** Runs right while jumping every ~600ms until the avatar's x reaches `targetX - tolerance`, hopping over any blocks in the way. */
export async function hopTo(page: Page, loginName: string, targetX: number, opts: { tolerance?: number; timeoutMs?: number } = {}): Promise<void> {
  const tolerance = opts.tolerance ?? 40;
  const deadline = Date.now() + (opts.timeoutMs ?? 30000);

  await page.keyboard.down('ArrowRight');
  try {
    while (Date.now() < deadline) {
      const pos = await getAvatarPosition(page, loginName);
      if (pos && pos.x >= targetX - tolerance) return;

      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(600);
    }
    throw new Error(`hopTo timed out before reaching x=${targetX} (loginName=${loginName})`);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
}

interface BlockSnapshot {
  avatar: { x: number; y: number } | null;
  block: { x: number; y: number } | undefined;
}

async function snapshotAvatarAndBlock(page: Page, loginName: string, blockId: string): Promise<BlockSnapshot> {
  return page.evaluate(
    ({ name, id }) => {
      const state = window.__cellwarz;
      const spriteId = state?.renderer.avatars[name];
      const avatar = spriteId !== undefined ? state?.renderer.sprites[spriteId] : undefined;
      const block = state?.renderer.sprites[id];
      return { avatar: avatar ? { x: avatar[1], y: avatar[2] } : null, block: block ? { x: block[1], y: block[2] } : undefined };
    },
    { name: loginName, id: blockId },
  );
}

/** Whether the avatar's feet rest on the block's top edge, overlapping it horizontally (px; avatar is 64px tall). */
function isStandingOn({ avatar, block }: BlockSnapshot): boolean {
  return !!avatar && !!block && avatar.y + 64 === block.y && avatar.x + 8 < block.x + 24 && avatar.x + 40 > block.x;
}

/** Holds `key` until `done` is true for the avatar's x (polling quickly so it stops within a cell or so). */
async function holdUntil(page: Page, loginName: string, key: 'ArrowLeft' | 'ArrowRight', done: (x: number) => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await page.keyboard.down(key);
  try {
    while (Date.now() < deadline) {
      const pos = await getAvatarPosition(page, loginName);
      if (pos && done(pos.x)) return;
      await page.waitForTimeout(30);
    }
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * Gets the avatar standing on top of a block resting on the floor (a 3-cell block with nothing solid behind it, so
 * it would be shoved if walked into): backs off to the left of it, then jumps while running right and lets go of
 * the key once it's above the block, so it drops straight onto it without ever touching its side.
 */
export async function standOnBlock(page: Page, loginName: string, blockId: string, attempts = 4): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let snapshot = await snapshotAvatarAndBlock(page, loginName, blockId);
    if (isStandingOn(snapshot)) return;
    if (!snapshot.avatar || !snapshot.block) throw new Error(`Avatar or block missing (loginName=${loginName})`);

    const blockX = snapshot.block.x;
    if (snapshot.avatar.x > blockX - 90) {
      await holdUntil(page, loginName, 'ArrowLeft', (x) => x <= blockX - 100);
    } else if (snapshot.avatar.x < blockX - 140) {
      await walkTo(page, loginName, 'ArrowRight', blockX - 100, { tolerance: 8 });
    }
    await page.waitForTimeout(150);

    await page.keyboard.press('ArrowUp');
    // Releases as soon as the avatar's body (40px of its 48px sprite) overlaps the block's top.
    await holdUntil(page, loginName, 'ArrowRight', (x) => x + 40 >= blockX + 6, 1500);
    await waitUntilGrounded(page, loginName);

    snapshot = await snapshotAvatarAndBlock(page, loginName, blockId);
    if (isStandingOn(snapshot)) return;
  }

  throw new Error(`Could not climb onto the block (loginName=${loginName})`);
}
