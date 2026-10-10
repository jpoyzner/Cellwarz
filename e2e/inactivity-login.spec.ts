import { expect, test } from '@playwright/test';
import { login, waitForAvatar } from './gameHelpers';

// The server's real inactivity timeout takes about a minute, so this feeds the client the message the server sends
// then (`{ connect: 'inactive' }`, see server/socketHub.ts) through the same handler the WebSocket uses.
test('an idle player is taken back to the login screen instead of a frozen gray screen', async ({ page }) => {
  await login(page, 'sleeper');
  await waitForAvatar(page, 'sleeper');

  await page.evaluate(() => window.__cellwarz!.syncer.handleMessage({ connect: 'inactive' }));

  await expect(page.locator('#loginName')).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCount(0);
});
