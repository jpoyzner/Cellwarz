import type { Analyzer } from './analyzer';
import type { BlackBox, BlackBoxRecording } from './blackBox';
import type { Renderer } from './renderer';
import type { Look } from './look';
import type { ConnectPayload, LooksMap, PlanetState } from './types';
import { reconnectDelayMs, RECONNECT_GIVE_UP_MS, SILENCE_LIMIT_MS } from './reconnect';

const WATCHDOG_INTERVAL_MS = 2000;

/**
 * Mirrors js/syncer.js: owns the WebSocket connection and feeds frames into the Renderer. A dropped connection (server
 * restart, lost signal) is retried with growing, jittered delays and re-attaches to the same avatar; the player is only
 * sent back to the login screen if that keeps failing, or the server turns them away.
 */
export class Syncer {
  private connection: WebSocket | undefined;
  /** The server stopped streaming this player's level because they were idle for too long. */
  onInactive: (() => void) | undefined;
  /** The callsign is protected by a hash that wasn't given right; the server hangs up. */
  onDenied: (() => void) | undefined;
  /** A newer login for this callsign took the session over; the server hangs up. */
  onDisplaced: (() => void) | undefined;
  /** The station has no room for another player; the server hangs up. */
  onFull: (() => void) | undefined;
  /** Too many wrong hashes were tried from here recently; the server hangs up. */
  onThrottled: (() => void) | undefined;
  /** The callsign isn't allowed (bad characters, too long, or reserved); the server hangs up. */
  onInvalid: ((reserved: boolean) => void) | undefined;
  /** The link dropped and is being retried (`false`), or came back (`true`). */
  onConnectionChange: ((connected: boolean) => void) | undefined;
  /** Retrying has gone on too long; the player should be sent back to the login screen. */
  onGaveUp: (() => void) | undefined;
  /** Whether the server accepts Black Box recordings (learned from its full-state payload). */
  blackBoxEnabled = false;
  /** The Black Box (backtick key); while it records, every incoming message and outgoing key press is logged. */
  blackBox: BlackBox | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly loginName: string,
    private readonly hash: string,
    private readonly jump: boolean,
    private readonly look: Look | null,
    private readonly analyzer?: Analyzer,
  ) {}

  /** Set once the server has accepted the login at least once; later connections re-attach instead of teleporting in again. */
  private loggedIn = false;
  /** The server told us to go away (or we closed on purpose): no reconnecting. */
  private finished = false;
  private attempt = 0;
  private lostAt = 0;
  private lastMessageAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private reconnecting = false;

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(`${protocol}//${window.location.host}/socketrefresh`);
    this.connection = connection;
    this.lastMessageAt = Date.now();

    connection.onopen = () => {
      connection.send(
        JSON.stringify({
          connect: true,
          login: this.loginName,
          hash: this.hash,
          jump: this.jump && !this.loggedIn,
          headband: this.look?.headband,
          belt: this.look?.belt,
        }),
      );
    };

    connection.onmessage = (event: MessageEvent<string>) => {
      this.lastMessageAt = Date.now();
      this.handleMessage(JSON.parse(event.data));
    };

    connection.onerror = () => connection.close();

    connection.onclose = () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      this.scheduleReconnect();
    };

    this.watchdog ??= setInterval(() => this.checkForSilence(), WATCHDOG_INTERVAL_MS);
  }

  // A link that died without closing (the TCP connection is half-open) just goes quiet; treat that as a drop.
  private checkForSilence(): void {
    if (this.finished || !this.connection || this.connection.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMessageAt > SILENCE_LIMIT_MS) this.connection.close();
  }

  private scheduleReconnect(): void {
    if (this.finished) return;

    if (!this.reconnecting) {
      this.reconnecting = true;
      this.lostAt = Date.now();
      this.onConnectionChange?.(false);
    }

    if (Date.now() - this.lostAt > RECONNECT_GIVE_UP_MS) {
      this.finish();
      this.onGaveUp?.();
      return;
    }

    this.reconnectTimer = setTimeout(() => this.connect(), reconnectDelayMs(this.attempt++));
  }

  /** The connection is over for good (the server refused or ended it, or we are leaving). */
  private finish(): void {
    this.finished = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.reconnectTimer = undefined;
    this.watchdog = undefined;
  }

  private onAccepted(): void {
    this.loggedIn = true;
    this.attempt = 0;
    if (this.reconnecting) {
      this.reconnecting = false;
      this.onConnectionChange?.(true);
    }
  }

  /** Public so e2e can feed the client a server message directly (e.g. the inactivity one, which takes a minute to arrive). */
  handleMessage(data: Record<string, unknown>): void {
    this.blackBox?.logMessage(data);

    if (this.analyzer) {
      this.analyzer.connectionTime = Date.now();
    }

    if (data.connect) {
      if (data.connect === 'inactive') {
        this.finish();
        this.onInactive?.();
      } else if (data.connect === 'denied') {
        this.finish();
        this.onDenied?.();
      } else if (data.connect === 'displaced') {
        this.finish();
        this.onDisplaced?.();
      } else if (data.connect === 'full') {
        this.finish();
        this.onFull?.();
      } else if (data.connect === 'throttled') {
        this.finish();
        this.onThrottled?.();
      } else if (data.connect === 'invalid' || data.connect === 'reserved') {
        this.finish();
        this.onInvalid?.(data.connect === 'reserved');
      } else {
        this.blackBoxEnabled = data.blackBox === true;
        this.onAccepted();
        this.renderer.applyFullState(data as unknown as ConnectPayload);
      }
    } else if ('planet' in data) {
      this.renderer.setPlanet(data.planet as PlanetState | null);
    } else if ('looks' in data) {
      this.renderer.setLooks(data.looks as LooksMap);
    } else if ('diamonds' in data) {
      this.renderer.setDiamonds(data.diamonds as number);
    } else if (data.died) {
      this.renderer.onLocalAvatarDeath(data.cause);
    } else {
      this.renderer.render(data);
    }

    if (this.analyzer) {
      this.analyzer.connections++;
    }
  }

  // Messages are dropped (not queued) while the link is down: a stale key press replayed later would be worse than none.
  private sendJson(payload: unknown): void {
    if (this.connection?.readyState === WebSocket.OPEN) this.connection.send(JSON.stringify(payload));
  }

  sendKey(key: number, down: boolean): void {
    this.blackBox?.logKey(key, down);
    this.sendJson({ key, down });
  }

  sendBlocksCollected(blocks: number): void {
    this.sendJson({ scored: blocks });
  }

  /** Tells the server the Black Box just started, so it captures its own sprite dump for the same moment. */
  sendBlackBoxStarted(): void {
    this.sendJson({ blackBoxStarted: true });
  }

  /** The Black Box goes to the server, which adds its sprite dumps and keeps only the latest one on disk. */
  sendBlackBox(blackBox: BlackBoxRecording): void {
    this.sendJson({ blackBox });
  }

  close(): void {
    this.finish();
    const connection = this.connection;
    this.connection = undefined;
    connection?.close();
  }
}

