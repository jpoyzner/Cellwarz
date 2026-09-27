import type { Avatar } from './avatar';
import type { Mana } from './mana';

export class Structure {
  private readonly manas: Mana[] = [];
  private avatar: Avatar | undefined;

  addMana(mana: Mana): this {
    this.manas.push(mana);
    mana.setStructure(this);
    return this;
  }

  removeMana(mana: Mana): this {
    const index = this.manas.indexOf(mana);
    if (index !== -1) this.manas.splice(index, 1);
    mana.setStructure(undefined);
    return this;
  }

  getManas(): Mana[] {
    return this.manas;
  }

  deactivateAllManaActions(): void {
    for (const mana of this.manas) {
      mana.deactivateAllActions();
    }
  }

  activateManaAction(manaIndex: number, actionIndex: number): void {
    this.manas[manaIndex].activateAction(actionIndex);
  }

  deactivateManaAction(manaIndex: number, actionIndex: number): void {
    this.manas[manaIndex].deactivateAction(actionIndex);
  }

  getAvatar(): Avatar | undefined {
    return this.avatar;
  }

  setAvatar(avatar: Avatar | undefined): void {
    this.avatar = avatar;
  }
}
