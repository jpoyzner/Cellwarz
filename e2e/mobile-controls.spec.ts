import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { getAvatarPosition, waitForAvatar, waitUntilGrounded } from './gameHelpers';

// A real phone: touch input, coarse pointer, landscape viewport.
const LANDSCAPE = { width: 740, height: 360 };

/** Real multitouch (CDP touch events become pointer events, unlike a synthetic tap), so fingers can be held. */
class Fingers {
  private readonly points = new Map<number, { x: number; y: number }>();

  constructor(private readonly cdp: CDPSession) {}

  private static async centerOf(page: Page, selector: string, xFraction = 0.5): Promise<{ x: number; y: number }> {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`${selector} is not on screen`);
    return { x: box.x + box.width * xFraction, y: box.y + box.height / 2 };
  }

  private async send(type: 'touchStart' | 'touchEnd' | 'touchMove'): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...this.points].map(([id, point]) => ({ id, ...point })),
    });
  }

  async down(page: Page, id: number, selector: string, xFraction = 0.5): Promise<void> {
    this.points.set(id, await Fingers.centerOf(page, selector, xFraction));
    await this.send('touchStart');
  }

  async slideTo(page: Page, id: number, selector: string, xFraction = 0.5): Promise<void> {
    this.points.set(id, await Fingers.centerOf(page, selector, xFraction));
    await this.send('touchMove');
  }

  /** CDP's touchEnd lifts every finger at once (single-finger release is covered by touchKeys.test.ts). */
  async up(): Promise<void> {
    this.points.clear();
    await this.send('touchEnd');
  }
}

async function startGame(page: Page, loginName: string): Promise<Fingers> {
  await page.goto('/');
  await page.locator('#loginName').fill(loginName);
  await page.locator('#teleport').tap();
  await expect(page.locator('#touch-controls')).toBeVisible();
  await waitForAvatar(page, loginName);
  await waitUntilGrounded(page, loginName);
  return new Fingers(await page.context().newCDPSession(page));
}

test.describe('desktop browser', () => {
  test('has no touch layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/touch-device/);
    await expect(page.locator('#rotate-prompt')).toHaveCount(0);
    await expect(page.locator('#control-keys .keys').first()).toContainText('SPACE');

    await page.locator('#loginName').fill(`desk-${Date.now()}`);
    await page.locator('#teleport').click();
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(page.locator('#touch-controls')).toHaveCount(0);
  });

  test('?touch=1 forces the touch layout, ?touch=0 forces it off', async ({ page }) => {
    await page.goto('/?touch=1');
    await expect(page.locator('html')).toHaveClass(/touch-device/);
    await page.goto('/?touch=0');
    await expect(page.locator('html')).not.toHaveClass(/touch-device/);
  });
});

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE });

  test('the login screen explains the on-screen buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/touch-device/);
    await expect(page.locator('#login-notice')).toContainText('TAP A TRANSPORTER');
    await expect(page.locator('#control-keys li')).toHaveCount(7);
    await expect(page.locator('#control-keys .keys').first()).toContainText('GRAB');
    await expect(page.locator('#control-keys')).not.toContainText('SPACE');
    await expect(page.locator('#rotate-prompt')).toBeHidden();
  });

  test('held upright, a rotate prompt covers the game', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rotate-prompt')).toBeHidden();
    await page.setViewportSize({ width: LANDSCAPE.height, height: LANDSCAPE.width });
    await expect(page.locator('#rotate-prompt')).toBeVisible();
    await expect(page.locator('#rotate-prompt')).toContainText('ROTATE YOUR PHONE');
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('#rotate-prompt')).toBeHidden();
  });

  test('holding the run pad runs, sliding across it turns around, lifting stops', async ({ page }) => {
    const loginName = `touch-run-${Date.now()}`;
    const fingers = await startGame(page, loginName);
    const x = async () => (await getAvatarPosition(page, loginName))!.x;

    const start = await x();
    await fingers.down(page, 1, '#touch-run', 0.85);
    await expect(page.locator('#touch-right')).toHaveClass(/touch-held/);
    await page.waitForTimeout(600);
    const afterRight = await x();
    expect(afterRight).toBeGreaterThan(start);

    await fingers.slideTo(page, 1, '#touch-run', 0.15);
    await expect(page.locator('#touch-left')).toHaveClass(/touch-held/);
    await expect(page.locator('#touch-right')).not.toHaveClass(/touch-held/);
    await page.waitForTimeout(600);
    expect(await x()).toBeLessThan(afterRight);

    await fingers.up();
    await expect(page.locator('#touch-left')).not.toHaveClass(/touch-held/);
    await page.waitForTimeout(300);
    const stopped = await x();
    await page.waitForTimeout(300);
    expect(await x()).toBe(stopped);
  });

  test('two thumbs at once: run while jumping', async ({ page }) => {
    const loginName = `touch-jump-${Date.now()}`;
    const fingers = await startGame(page, loginName);
    const grounded = await getAvatarPosition(page, loginName);

    await fingers.down(page, 1, '#touch-run', 0.85);
    await fingers.down(page, 2, '#touch-jump');
    await expect(page.locator('#touch-jump')).toHaveClass(/touch-held/);
    await expect(page.locator('#touch-right')).toHaveClass(/touch-held/);

    let highest = grounded!.y;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(60);
      highest = Math.min(highest, (await getAvatarPosition(page, loginName))!.y);
    }
    expect(highest).toBeLessThan(grounded!.y);
    expect((await getAvatarPosition(page, loginName))!.x).toBeGreaterThan(grounded!.x);

    await fingers.up();
    await expect(page.locator('#touch-jump')).not.toHaveClass(/touch-held/);
    await expect(page.locator('#touch-right')).not.toHaveClass(/touch-held/);
  });

  test('emoji button opens a picker and the choice shows over the avatar', async ({ page }) => {
    const loginName = `touch-emoji-${Date.now()}`;
    await startGame(page, loginName);

    await page.locator('#touch-emoji').tap();
    await expect(page.locator('.touch-emoji-choice')).toHaveCount(10);
    await page.locator('.touch-emoji-choice[data-digit="2"]').tap();
    await expect(page.locator('#touch-emoji-picker')).toHaveCount(0);

    await page.waitForFunction((name) => {
      const { renderer } = window.__cellwarz!;
      return renderer.emojis.get(renderer.avatars[name]) === '\u{1F44D}';
    }, loginName);
  });

  test('menu button sleeps the avatar, then leaves', async ({ page }) => {
    const loginName = `touch-menu-${Date.now()}`;
    await startGame(page, loginName);

    await page.locator('#touch-menu').tap();
    await expect(page.locator('#spectator-title')).toHaveText('YOUR AVATAR IS ASLEEP');
    await expect(page.locator('#spectator-hint')).toContainText('WAKE');
    await expect(page.locator('#touch-action')).toHaveText('WAKE');
    await expect(page.locator('#touch-jump')).toHaveCount(0);

    await page.locator('#touch-action').tap();
    await expect(page.locator('#spectator')).toHaveCount(0);
    await expect(page.locator('#touch-jump')).toBeVisible();

    await page.locator('#touch-menu').tap();
    await page.locator('#touch-menu').tap();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#touch-controls')).toHaveCount(0);
  });

  test('a held button is released when the page goes to the background', async ({ page }) => {
    const loginName = `touch-blur-${Date.now()}`;
    const fingers = await startGame(page, loginName);

    await fingers.down(page, 1, '#touch-run', 0.85);
    await expect(page.locator('#touch-right')).toHaveClass(/touch-held/);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#touch-right')).not.toHaveClass(/touch-held/);
    await fingers.up();
  });
});
