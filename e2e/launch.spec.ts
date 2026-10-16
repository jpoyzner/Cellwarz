import { expect, test } from '@playwright/test';
import WebSocket from 'ws';
import { login, waitForAvatar } from './gameHelpers';

const API_PORT = process.env.CELLWARZ_API_PORT ?? '8080';
const SERVER = `http://localhost:${API_PORT}`;

test.describe('what the real site depends on', () => {
  test('/healthz and /api/status report the station without leaking anything private', async ({ request }) => {
    const health = await request.get(`${SERVER}/healthz`);
    expect(health.ok()).toBe(true);
    expect(health.headers()['cache-control']).toBe('no-store');
    expect(await health.json()).toMatchObject({ status: 'ok', capacity: expect.any(Number), players: expect.any(Number), stepBudgetMs: expect.any(Number) });

    const status = await request.get(`${SERVER}/api/status`);
    const body = await status.json();
    expect(body).toMatchObject({ name: 'Cyberstation', full: false });
    expect(Object.keys(body).sort()).toEqual(['capacity', 'full', 'name', 'players']);
    expect(status.headers()['x-content-type-options']).toBe('nosniff');
    expect(status.headers()['x-powered-by']).toBeUndefined();
  });

  test('a socket opened by another website is refused, but the site\'s own pages connect', async () => {
    const attempt = (origin: string | undefined) =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(`ws://localhost:${API_PORT}/socketrefresh`, { headers: origin ? { Origin: origin } : {} });
        socket.on('open', () => {
          socket.close();
          resolve('open');
        });
        socket.on('unexpected-response', (_request, response) => resolve(`refused ${response.statusCode}`));
        socket.on('error', () => undefined);
      });

    expect(await attempt('https://evil.example')).toBe('refused 403');
    expect(await attempt(SERVER)).toBe('open');
  });
});

test.describe('being turned away at the door', () => {
  test('a reserved or malformed callsign is refused with a reason and sent back to the login screen', async ({ page }) => {
    await login(page, 'DJ Recognize');
    await expect(page.locator('#login-notice')).toContainText('RESERVED');
    await expect(page.locator('#login')).toBeVisible();

    await page.locator('#loginName').fill('<b>sneaky</b>');
    await page.locator('#teleport').click();
    await expect(page.locator('#login-notice')).toContainText('INVALID CALLSIGN');
    await expect(page.locator('#canvas')).toHaveCount(0);
  });

  test('the callsign field holds at most 32 characters', async ({ page }) => {
    await page.goto('/');
    await page.locator('#loginName').fill('x'.repeat(40));
    await expect(page.locator('#loginName')).toHaveValue('x'.repeat(32));
  });

  // The real limits (60 players, a few wrong hashes) are exercised by server/__tests__/hardening.test.ts; here a stand-in
  // server gives the answers the real one would (the messages go through the real WebSocket path), so no avatars are left
  // standing in the shared room.
  for (const [reason, notice] of [
    ['full', 'STATION IS AT CAPACITY'],
    ['throttled', 'TOO MANY WRONG HASHES'],
    ['invalid', 'INVALID CALLSIGN'],
    ['reserved', 'RESERVED'],
  ] as const) {
    test(`"${reason}" from the server brings the player back to the login screen saying why`, async ({ page }) => {
      await page.routeWebSocket(/socketrefresh/, (ws) => {
        ws.onMessage((message) => {
          if (String(message).includes('"login"')) {
            ws.send(JSON.stringify({ connect: reason }));
            ws.close();
          }
        });
      });
      await login(page, `away-${reason}`);

      await expect(page.locator('#login')).toBeVisible();
      await expect(page.locator('#login-notice')).toContainText(notice);
      await expect(page.locator('#canvas')).toHaveCount(0);
    });
  }
});

test.describe('when the link drops', () => {
  test('the client reconnects by itself and re-attaches to the same avatar', async ({ page }) => {
    const name = `lostlink-${Date.now()}`;
    await login(page, name);
    await waitForAvatar(page, name);
    const before = await page.evaluate((n) => window.__cellwarz!.renderer.avatars[n], name);
    await page.evaluate(() => {
      const syncer = window.__cellwarz!.syncer as unknown as { connection: WebSocket };
      (window as unknown as { __firstConnection: WebSocket }).__firstConnection = syncer.connection;
      syncer.connection.close();
    });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const syncer = window.__cellwarz!.syncer as unknown as { connection?: WebSocket };
            const first = (window as unknown as { __firstConnection: WebSocket }).__firstConnection;
            return syncer.connection !== undefined && syncer.connection !== first && syncer.connection.readyState === WebSocket.OPEN;
          }),
        { timeout: 10000 },
      )
      .toBe(true);

    await expect(page.locator('#reconnecting')).toHaveCount(0);
    await expect.poll(() => page.evaluate((n) => window.__cellwarz!.renderer.avatars[n], name)).toBe(before);
    expect(await page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('off');
  });

  test('while the station is unreachable the player sees RECONNECTING, and play resumes when it is back', async ({ page }) => {
    let down = false;
    const sockets: Array<{ close: () => void }> = [];
    await page.routeWebSocket(/socketrefresh/, (ws) => {
      if (down) {
        ws.close();
        return;
      }
      ws.connectToServer();
      sockets.push(ws);
    });

    const name = `outage-${Date.now()}`;
    await login(page, name);
    await waitForAvatar(page, name);

    down = true;
    sockets.forEach((socket) => socket.close());
    await expect(page.locator('#reconnecting')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#reconnecting')).toContainText('RECONNECTING');

    down = false;
    await expect(page.locator('#reconnecting')).toHaveCount(0, { timeout: 20000 });
    await waitForAvatar(page, name);
    expect(await page.evaluate(() => window.__cellwarz!.renderer.spectatorMode)).toBe('off');
  });
});

test.describe('transporting in the room', () => {
  // Reaching a corner stargate means climbing the whole room, so the engine side (Up starts a beam, ~0.65s later the avatar
  // warps; walking into the stargate does nothing) is covered by server/__tests__/portal.test.ts; this feeds the client the
  // beam progress the server sends (extra key "6") to check it is tracked and cleared.
  test('an avatar being beamed up is tracked by the renderer and released when the beam ends', async ({ page }) => {
    const name = `beamer-${Date.now()}`;
    await login(page, name);
    await waitForAvatar(page, name);

    const result = await page.evaluate((n) => {
      const { renderer, syncer } = window.__cellwarz!;
      const id = renderer.avatars[n];
      const [image, x, y] = renderer.sprites[id];
      const beams = () => (renderer.snapshot().beams ?? {}) as Record<string, number>;
      syncer.handleMessage({ [id]: [image, x, y, { '6': 0.5 }] });
      const during = beams()[id];
      syncer.handleMessage({ [id]: [image, x, y] });
      return { during, after: beams()[id] };
    }, name);

    expect(result).toEqual({ during: 0.5, after: undefined });
  });
});
