import type { Analyzer } from './analyzer';
import type { BlackBox, BlackBoxRecording } from './blackBox';
import type { Renderer } from './renderer';
import type { Look } from './look';
import type { ConnectPayload, LooksMap, PlanetState } from './types';

/** Mirrors js/syncer.js: owns the WebSocket connection and feeds frames into the Renderer. */
export class Syncer {
  private connection: WebSocket | undefined;
  /** The server stopped streaming this player's level because they were idle for too long. */
  onInactive: (() => void) | undefined;
  /** The callsign is protected by a hash that wasn't given right; the server hangs up. */
  onDenied: (() => void) | undefined;
  /** A newer login for this callsign took the session over; the server hangs up. */
  onDisplaced: (() => void) | undefined;
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

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(`${protocol}//${window.location.host}/socketrefresh`);
    this.connection = connection;

    connection.onopen = () => {
      connection.send(
        JSON.stringify({
          connect: true,
          login: this.loginName,
          hash: this.hash,
          jump: this.jump,
          headband: this.look?.headband,
          belt: this.look?.belt,
        }),
      );
    };

    connection.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(JSON.parse(event.data));
    };

    connection.onerror = (error) => {
      console.error(error);
      connection.close();
    };
  }

  /** Public so e2e can feed the client a server message directly (e.g. the inactivity one, which takes a minute to arrive). */
  handleMessage(data: Record<string, unknown>): void {
    this.blackBox?.logMessage(data);

    if (this.analyzer) {
      this.analyzer.connectionTime = Date.now();
    }

    if (data.connect) {
      if (data.connect === 'inactive') {
        this.onInactive?.();
      } else if (data.connect === 'denied') {
        this.onDenied?.();
      } else if (data.connect === 'displaced') {
        this.onDisplaced?.();
      } else {
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

  sendKey(key: number, down: boolean): void {
    this.blackBox?.logKey(key, down);
    this.connection?.send(JSON.stringify({ key, down }));
  }

  sendBlocksCollected(blocks: number): void {
    this.connection?.send(JSON.stringify({ scored: blocks }));
  }

  /** Tells the server the Black Box just started, so it captures its own sprite dump for the same moment. */
  sendBlackBoxStarted(): void {
    this.connection?.send(JSON.stringify({ blackBoxStarted: true }));
  }

  /** The Black Box goes to the server, which adds its sprite dumps and keeps only the latest one on disk. */
  sendBlackBox(blackBox: BlackBoxRecording): void {
    this.connection?.send(JSON.stringify({ blackBox }));
  }

  close(): void {
    this.connection?.close();
  }
}

