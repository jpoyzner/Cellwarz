import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconnectDelayMs, RECONNECT_GIVE_UP_MS, SILENCE_LIMIT_MS } from '../reconnect';
import { Syncer } from '../syncer';
import type { Renderer } from '../renderer';

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** The server hangs up (or the link drops). */
  drop(): void {
    this.close();
  }
}

const FULL_STATE = { connect: '0', blackBox: false, sprites: {}, avatars: {}, imagePaths: [] };

describe('reconnectDelayMs', () => {
  it('doubles from half a second up to ten seconds, with jitter between half and all of it', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((attempt) => reconnectDelayMs(attempt, () => 1))).toEqual([500, 1000, 2000, 4000, 8000, 10000, 10000, 10000]);
    expect(reconnectDelayMs(3, () => 0)).toBe(2000);
  });
});

describe('Syncer', () => {
  let renderer: { applyFullState: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    renderer = { applyFullState: vi.fn(), render: vi.fn() };
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'cyberstation.djrecognize.com' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function start(jump = true) {
    const syncer = new Syncer(renderer as unknown as Renderer, 'neo', 'hash', jump, null);
    const events = { connection: [] as boolean[], gaveUp: 0, denied: 0, full: 0 };
    syncer.onConnectionChange = (connected) => events.connection.push(connected);
    syncer.onGaveUp = () => events.gaveUp++;
    syncer.onDenied = () => events.denied++;
    syncer.onFull = () => events.full++;
    syncer.connect();
    return { syncer, events, socket: () => FakeSocket.instances[FakeSocket.instances.length - 1] };
  }

  it('connects over wss to the page\'s own host and logs in', () => {
    const { socket } = start();
    expect(socket().url).toBe('wss://cyberstation.djrecognize.com/socketrefresh');
    socket().open();
    expect(socket().sent[0]).toMatchObject({ connect: true, login: 'neo', hash: 'hash', jump: true });
  });

  it('reconnects after a drop and re-attaches to the same avatar instead of teleporting in again', () => {
    const { events, socket } = start();
    socket().open();
    socket().receive(FULL_STATE);
    const first = socket();

    first.drop();
    expect(events.connection).toEqual([false]);
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(socket().sent[0]).toMatchObject({ connect: true, login: 'neo', jump: false });

    socket().receive(FULL_STATE);
    expect(events.connection).toEqual([false, true]);
    expect(renderer.applyFullState).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying with growing delays while the server is down, then gives up', () => {
    const { events, socket } = start();
    socket().open();
    socket().receive(FULL_STATE);
    socket().drop();

    for (let i = 0; i < 40 && events.gaveUp === 0; i++) {
      vi.advanceTimersByTime(10_000);
      socket()?.drop(); // each attempt fails to connect
    }

    expect(events.gaveUp).toBe(1);
    const attempts = FakeSocket.instances.length;
    vi.advanceTimersByTime(RECONNECT_GIVE_UP_MS);
    expect(FakeSocket.instances).toHaveLength(attempts); // and it stays given up
  });

  it('does not reconnect once the server has refused or ended the session', () => {
    const { events, socket } = start();
    socket().open();
    socket().receive({ connect: 'denied' });
    socket().drop();
    vi.advanceTimersByTime(60_000);
    expect(events.denied).toBe(1);
    expect(FakeSocket.instances).toHaveLength(1);

    const second = start();
    second.socket().open();
    second.socket().receive({ connect: 'full' });
    second.socket().drop();
    vi.advanceTimersByTime(60_000);
    expect(second.events.full).toBe(1);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after a deliberate close', () => {
    const { syncer, socket } = start();
    socket().open();
    socket().receive(FULL_STATE);
    syncer.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('treats a connection that has gone silent as dead and reconnects', () => {
    const { socket, events } = start();
    socket().open();
    socket().receive(FULL_STATE);

    vi.advanceTimersByTime(SILENCE_LIMIT_MS + 4000);
    expect(events.connection).toEqual([false]);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  it('drops key presses while the link is down instead of queueing them', () => {
    const { syncer, socket } = start();
    socket().open();
    socket().receive(FULL_STATE);
    const first = socket();
    first.drop();
    syncer.sendKey(37, true);
    expect(first.sent.filter((m) => 'key' in m)).toHaveLength(0);

    vi.advanceTimersByTime(1000);
    socket().open();
    syncer.sendKey(37, false);
    expect(socket().sent.filter((m) => 'key' in m)).toEqual([{ key: 37, down: false }]);
  });

  it('learns from the server whether Black Box recording is allowed', () => {
    const { syncer, socket } = start();
    socket().open();
    expect(syncer.blackBoxEnabled).toBe(false);
    socket().receive({ ...FULL_STATE, blackBox: true });
    expect(syncer.blackBoxEnabled).toBe(true);
  });
});
