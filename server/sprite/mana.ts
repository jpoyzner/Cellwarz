import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Sprite } from './sprite';
import { Structure } from './structure';
import type { ManaAction } from './manaAction';

export abstract class Mana extends Sprite {
  static readonly SIZE = 3;

  private readonly actions: ManaAction[];
  private structure: Structure | undefined;
  private handlingMelt = false;
  private handledFlag = false;

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.actions = this.addManaActions();
    this.structure = new Structure().addMana(this);
  }

  protected addManaActions(): ManaAction[] {
    return [];
  }

  getWidth(): number {
    return Mana.SIZE;
  }

  getHeight(): number {
    return Mana.SIZE;
  }

  getLayer(): number {
    return Physics.OBJECT_LAYER;
  }

  protected override doAction(): void {
    this.physics.gravitate(this);
  }

  override getMass(): number {
    return this.handledFlag ? 0 : 5;
  }

  getActions(): ManaAction[] {
    return this.actions;
  }

  activateAction(index: number): void {
    if (this.actions.length > index) {
      this.actions[index].activate();
    }
  }

  deactivateAction(index: number): void {
    if (this.actions.length > index) {
      this.actions[index].deactivate();
    }
  }

  deactivateAllActions(): void {
    for (const action of this.actions) {
      action.deactivate();
    }
  }

  getStructure(): Structure | undefined {
    return this.structure;
  }

  setStructure(structure: Structure | undefined): void {
    this.structure = structure;
  }

  override melts(): boolean {
    return this.handlingMelt;
  }

  handleMelt(): void {
    this.handlingMelt = true;
  }

  removeHandleMelt(): void {
    this.handlingMelt = false;
  }

  beingHandled(): void {
    this.handledFlag = true;
  }

  setDown(): void {
    this.handledFlag = false;
  }

  isBeingHandled(): boolean {
    return this.handledFlag;
  }

  abstract getDashboardImageIndex(): number;
  abstract getActionFrames(): Map<string, Frame[]>;
}
