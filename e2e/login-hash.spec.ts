import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { waitForAvatar } from './gameHelpers';

async function fillLogin(page: Page, loginName: string, hash: string): Promise<void> {
  await page.goto('/');
  await page.locator('#loginName').fill(loginName);
  if (hash) await page.locator('#loginHash').fill(hash);
}

test('the hash field sits under the callsign, shows what you type, and says (unprotected) while blank', async ({ page }) => {
  await page.goto('/');

  const name = page.locator('#loginName');
  const hash = page.locator('#loginHash');
  await expect(hash).toHaveAttribute('type', 'text');
  await expect(hash).toHaveAttribute('placeholder', '(unprotected)');
  const nameBox = (await name.boundingBox())!;
  const hashBox = (await hash.boundingBox())!;
  expect(hashBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
});

test('a callsign created with a hash needs it to get back in, and a wrong one is sent back to the login screen', async ({ page }) => {
  const loginName = `vault-${Date.now()}`;

  await fillLogin(page, loginName, 'sesame');
  await page.locator('#teleport').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);

  await page.reload();
  await page.locator('#loginName').fill(loginName);
  await page.locator('#loginHash').fill('wrong');
  await page.locator('#teleport').click();

  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#login-notice')).toContainText('WRONG HASH');
  await expect(page.locator('#loginHash')).toHaveClass(/input-error/);

  await page.locator('#loginHash').fill('sesame');
  await expect(page.locator('#login-notice')).not.toContainText('WRONG HASH');
  await page.locator('#wakeup').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);
});

test('a callsign used blank is claimed by the first hash it is later used with, which is then permanent', async ({ page }) => {
  const loginName = `open-${Date.now()}`;

  await fillLogin(page, loginName, '');
  await page.locator('#teleport').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);

  await page.reload();
  await page.locator('#loginName').fill(loginName);
  await page.locator('#loginHash').fill('first');
  await page.locator('#teleport').click();
  await expect(page.locator('#canvas')).toBeVisible();
  await waitForAvatar(page, loginName);

  await page.reload();
  await page.locator('#loginName').fill(loginName);
  await page.locator('#loginHash').fill('second');
  await page.locator('#teleport').click();
  await expect(page.locator('#login-notice')).toContainText('WRONG HASH');
});

test('logging in as the same avatar elsewhere drops the earlier connection back to the login screen', async ({ browser }) => {
  const loginName = `twin-${Date.now()}`;
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();

  await fillLogin(first, loginName, 'sesame');
  await first.locator('#teleport').click();
  await waitForAvatar(first, loginName);

  await fillLogin(second, loginName, 'sesame');
  await second.locator('#wakeup').click();
  await waitForAvatar(second, loginName);

  await expect(first.locator('#login')).toBeVisible();
  await expect(first.locator('#login-notice')).toContainText('LOGGED IN FROM ELSEWHERE');
  await expect(second.locator('#canvas')).toBeVisible();

  await first.context().close();
  await second.context().close();
});

test('the callsign and hash are remembered on this device: a returning player just taps TELEPORT, and clearing the hash forgets it', async ({ page }) => {
  const loginName = `rememberer-${Date.now()}`;
  await fillLogin(page, loginName, 'my secret');
  await page.locator('#teleport').click();
  await waitForAvatar(page, loginName);

  // A fresh page load (same browser): both fields come back prefilled, and TELEPORT gets straight back in.
  await page.goto('/');
  await expect(page.locator('#loginName')).toHaveValue(loginName);
  await expect(page.locator('#loginHash')).toHaveValue('my secret');
  await page.locator('#teleport').click();
  await waitForAvatar(page, loginName);

  // Clearing the hash field forgets it.
  await page.goto('/');
  await page.locator('#loginHash').fill('');
  await page.goto('/');
  await expect(page.locator('#loginName')).toHaveValue(loginName);
  await expect(page.locator('#loginHash')).toHaveValue('');
});
