import { Engine } from './engine';
import { randomInt } from './random';
import type { Session } from './session';
import type { World } from './world';
import type { Cell } from './cell/cell';
import { MainRoom } from './cell/mainRoom';

export class Zion {
  private readonly hardlines = new Map<string, Session>();
  private readonly matrix: Engine[] = [];
  private readonly staleLogins = new Set<string>();

  constructor(world: World) {
    // Single shared room for now so all multiplayer logins land together (see TODOS.md).
    this.addCell(new MainRoom(world));
  }

  private addCell(cell: Cell): void {
    const engine = new Engine(cell);
    this.matrix.push(engine);
    engine.getCell().init();
    engine.start();
  }

  getHardlines(): Map<string, Session> {
    return this.hardlines;
  }

  getRandomEngine(): Engine {
    return this.matrix[randomInt(this.matrix.length)];
  }

  loginNeedsRefresh(login: string): void {
    this.staleLogins.add(login);
  }

  loginNotStale(login: string): void {
    if (this.stale(login)) {
      this.staleLogins.delete(login);
    }
  }

  stale(login: string): boolean {
    return this.staleLogins.has(login);
  }
}
