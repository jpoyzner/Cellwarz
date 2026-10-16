import { defaultConfig } from './config';
import type { ServerConfig } from './config';
import type { Persistence } from './persistence';
import { Physics } from './physics';
import { Zion } from './zion';

export interface WorldOptions {
  /** Saves and restores accounts and the room; without it (dev, tests) nothing outlives the process. */
  persistence?: Persistence;
  config?: ServerConfig;
}

export class World {
  private readonly physics: Physics;
  private readonly zion: Zion;

  constructor({ persistence, config = defaultConfig() }: WorldOptions = {}) {
    this.physics = new Physics();
    this.zion = new Zion(this, persistence, config);
  }

  getPhysics(): Physics {
    return this.physics;
  }

  getZion(): Zion {
    return this.zion;
  }
}
