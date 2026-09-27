import { Physics } from './physics';
import { Zion } from './zion';

export class World {
  private readonly physics: Physics;
  private readonly zion: Zion;

  constructor() {
    this.physics = new Physics();
    this.zion = new Zion(this);
  }

  getPhysics(): Physics {
    return this.physics;
  }

  getZion(): Zion {
    return this.zion;
  }
}
