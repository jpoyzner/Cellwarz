import { expect, test } from '@playwright/test';
import { FLOWER_PIXELS } from '../server/cell/mainRoom';
import { login, waitForAvatar } from './gameHelpers';

// The Playwright server runs with CELLWARZ_RANDOM_BLOCKS=off, so the flower stays quiet here: its 30-second spitting
// (random kind, angle and speed) is covered by server/__tests__/flower.test.ts instead.
test('a flower hangs from the ceiling beside the middle lamp', async ({ page }) => {
  await login(page, 'flowerfan');
  await waitForAvatar(page, 'flowerfan');

  const flowerSprite = () =>
    page.evaluate(({ x, y }) => {
      const { sprites, imagePaths } = window.__cellwarz!.renderer;
      return Object.values(sprites).find(([image, spriteX, spriteY]) => imagePaths[image]?.includes('/flower/') && spriteX === x && spriteY === y);
    }, FLOWER_PIXELS);

  await expect.poll(flowerSprite).toBeDefined();
});

test('green wall hue and vines from the flower stay over the central opening of the ceiling', async ({ page }) => {
  await login(page, 'vinefan');
  await waitForAvatar(page, 'vinefan');

  await expect.poll(() => page.evaluate(() => window.__cellwarz!.renderer.vines?.config.rootX)).toBe(FLOWER_PIXELS.x + FLOWER_PIXELS.width / 2);

  const { tinted, hanging, minX, maxX } = await page.evaluate(() => {
    const vines = window.__cellwarz!.renderer.vines!;
    return { tinted: vines.tinted.length, hanging: vines.hanging.length, minX: vines.config.minX, maxX: vines.config.maxX };
  });
  expect(tinted).toBeGreaterThan(0);
  expect(hanging).toBeGreaterThan(10);
  expect(minX).toBeLessThan(FLOWER_PIXELS.x);
  expect(maxX).toBeGreaterThan(FLOWER_PIXELS.x + FLOWER_PIXELS.width);
  // About one screen wide, not the whole 4000px ceiling.
  expect(maxX - minX).toBeLessThanOrEqual(1100);
});
