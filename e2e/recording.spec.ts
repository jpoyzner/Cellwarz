import { expect, test } from '@playwright/test';
import { login, waitForAvatar } from './gameHelpers';

// What the client sends to the server when a recording finishes (the server's file write is unit-tested).
function captureRecordings(page: import('@playwright/test').Page): Array<Record<string, any>> {
  const recordings: Array<Record<string, any>> = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.includes('"recording"')) return;
      recordings.push(JSON.parse(payload).recording);
    });
  });
  return recordings;
}

test('backtick starts and stops a debug recording that captures positions and key presses', async ({ page }) => {
  const recordings = captureRecordings(page);
  await login(page, 'recorder1');
  await waitForAvatar(page, 'recorder1');

  const hud = page.locator('#recording');
  await expect(hud).toBeHidden();

  await page.keyboard.press('`');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('REC');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.press('`');
  await expect(hud).toBeHidden();
  await expect.poll(() => recordings.length).toBe(1);

  const [recording] = recordings;
  expect(recording.login).toBe('recorder1');
  expect(recording.stoppedBy).toBe('manual');
  expect(Object.keys(recording.initial.sprites).length).toBeGreaterThan(0);
  const keys = recording.events.filter((event: any) => event.type === 'key');
  expect(keys.map((event: any) => [event.key, event.down])).toEqual([
    [39, true],
    [39, false],
  ]);
  expect(recording.events.some((event: any) => event.type === 'message')).toBe(true);
});

test('a recording stops by itself after 10 seconds', async ({ page }) => {
  const recordings = captureRecordings(page);
  await login(page, 'recorder2');
  await waitForAvatar(page, 'recorder2');

  await page.keyboard.press('`');
  await expect(page.locator('#recording')).toBeVisible();

  await expect(page.locator('#recording')).toBeHidden({ timeout: 12_000 });
  await expect.poll(() => recordings.length).toBe(1);
  expect(recordings[0].stoppedBy).toBe('timeout');
  expect(recordings[0].durationMs).toBeLessThanOrEqual(10_000);
  expect(recordings[0].durationMs).toBeGreaterThanOrEqual(9_000);
});
