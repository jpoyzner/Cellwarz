import type { Analyzer } from './analyzer';
import type { Renderer } from './renderer';
import type { ConnectPayload, PlanetState } from './types';

/** Mirrors js/syncer.js: owns the WebSocket connection and feeds frames into the Renderer. */
export class Syncer {
  private connection: WebSocket | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly loginName: string,
    private readonly jump: boolean,
    private readonly analyzer?: Analyzer,
  ) {}

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(`${protocol}//${window.location.host}/socketrefresh`);
    this.connection = connection;

    connection.onopen = () => {
      connection.send(JSON.stringify({ connect: true, login: this.loginName, jump: this.jump }));
    };

    connection.onmessage = (event: MessageEvent<string>) => {
      if (this.analyzer) {
        this.analyzer.connectionTime = Date.now();
      }

      const data = JSON.parse(event.data);

      if (data.connect) {
        if (data.connect === 'inactive') {
          this.renderer.drawStaleScreen();
        } else {
          this.renderer.applyFullState(data as ConnectPayload);
        }
      } else if ('planet' in data) {
        this.renderer.setPlanet(data.planet as PlanetState | null);
      } else if (data.died) {
        this.renderer.onLocalAvatarDeath();
      } else {
        this.renderer.render(data);
      }

      if (this.analyzer) {
        this.analyzer.connections++;
      }
    };

    connection.onerror = (error) => {
      console.error(error);
      connection.close();
    };
  }

  sendKey(key: number, down: boolean): void {
    this.connection?.send(JSON.stringify({ key, down }));
  }

  sendBlocksCollected(blocks: number): void {
    this.connection?.send(JSON.stringify({ scored: blocks }));
  }

  close(): void {
    this.connection?.close();
  }
}

