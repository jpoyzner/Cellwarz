import { expect, test } from '@playwright/test';
import { login, waitForAvatar } from './gameHelpers';

// What the client sends to the server when the Black Box finishes (the server's file write is unit-tested).
function captureBlackBoxes(page: import('@playwright/test').Page): Array<Record<string, any>> {
  const blackBoxes: Array<Record<string, any>> = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.includes('"blackBox"')) return;
      blackBoxes.push(JSON.parse(payload).blackBox);
    });
  });
  return blackBoxes;
}

test('backtick starts and stops the Black Box, which captures positions and key presses', async ({ page }) => {
  const blackBoxes = captureBlackBoxes(page);
  await login(page, 'recorder1');
  await waitForAvatar(page, 'recorder1');

  const hud = page.locator('#black-box');
  await expect(hud).toBeHidden();

  await page.keyboard.press('`');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('BLACK BOX REC');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.press('`');
  await expect(hud).toBeHidden();
  await expect.poll(() => blackBoxes.length).toBe(1);

  const [blackBox] = blackBoxes;
  expect(blackBox.login).toBe('recorder1');
  expect(blackBox.stoppedBy).toBe('manual');
  expect(Object.keys(blackBox.initial.sprites).length).toBeGreaterThan(0);
  // Per-sprite extras and the planet start out in the snapshot too, not just positions.
  for (const field of ['sleeping', 'health', 'emojis', 'shrinks', 'looks', 'planet']) expect(blackBox.initial).toHaveProperty(field);
  const keys = blackBox.events.filter((event: any) => event.type === 'key');
  expect(keys.map((event: any) => [event.key, event.down])).toEqual([
    [39, true],
    [39, false],
  ]);
  expect(blackBox.events.some((event: any) => event.type === 'message')).toBe(true);
});

test('the Black Box stops by itself after 10 seconds', async ({ page }) => {
  const blackBoxes = captureBlackBoxes(page);
  await login(page, 'recorder2');
  await waitForAvatar(page, 'recorder2');

  await page.keyboard.press('`');
  await expect(page.locator('#black-box')).toBeVisible();

  await expect(page.locator('#black-box')).toBeHidden({ timeout: 12_000 });
  await expect.poll(() => blackBoxes.length).toBe(1);
  expect(blackBoxes[0].stoppedBy).toBe('timeout');
  expect(blackBoxes[0].durationMs).toBeLessThanOrEqual(10_000);
  expect(blackBoxes[0].durationMs).toBeGreaterThanOrEqual(9_000);
});
