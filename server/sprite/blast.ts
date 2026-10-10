import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import { EdgeOfCellDataException } from '../errors';
import { Physics } from '../physics';
import { Avatar } from './avatar';
import { Explosion } from './explosion';
import { Mana } from './mana';
import { ShieldBubble } from './shieldBubble';
import type { Sprite } from './sprite';

const SHOVE_MIN_SPEED = 0.8;
const SHOVE_EXTRA_SPEED = 1.6;
const SHOVE_LIFT = 0.8;

export interface BlastOptions {
  /** Grid-cell distance from the centre inside which avatars die. */
  killRadius: number;
  /** Grid-cell distance from the centre inside which blocks are shoved. */
  shoveRadius: number;
  /** The sprite that is exploding; it is skipped and the caller removes it. */
  source: Sprite;
}

/** The shared explosion: kills unshielded avatars with a line of sight, shoves nearby blocks and shows the fireball. */
export function detonate(cell: Cell, cellData: CellData, centerX: number, centerY: number, options: BlastOptions): void {
  for (const sprite of cellData.getSprites()) {
    if (sprite === options.source || sprite.removed()) continue;

    const dx = sprite.getX() + sprite.getWidth() / 2 - centerX;
    const dy = sprite.getY() + sprite.getHeight() / 2 - centerY;
    const distance = Math.hypot(dx, dy);

    if (sprite instanceof Avatar) {
      const shielded = ShieldBubble.isCovered(
        cellData,
        sprite.getX() + sprite.getWidth() / 2,
        sprite.getY() + sprite.getHeight() / 2,
      );
      if (distance <= options.killRadius && !shielded && canReach(cellData, centerX, centerY, sprite)) {
        sprite.die(Math.sign(dx), Physics.UP);
      }
    } else if (sprite instanceof Mana && distance <= options.shoveRadius) {
      const speed = SHOVE_MIN_SPEED + SHOVE_EXTRA_SPEED * (1 - distance / options.shoveRadius);
      const awayX = distance === 0 ? 0 : dx / distance;
      const awayY = distance === 0 ? -1 : dy / distance;
      sprite.applyImpulse(awayX * speed, awayY * speed - SHOVE_LIFT);
    }
  }

  showExplosion(cell, cellData, centerX, centerY);
}

/** The blast reaches an avatar if it has a clear line to any of its head, middle or feet (a ledge can't shield all three). */
function canReach(cellData: CellData, fromX: number, fromY: number, avatar: Avatar): boolean {
  const x = avatar.getX() + avatar.getWidth() / 2;
  const top = avatar.getY();
  const height = avatar.getHeight();
  return [top + 1, top + height / 2, top + height - 1].some((y) => hasClearLine(cellData, fromX, fromY, x, y));
}

/** The blast doesn't reach through level walls: false if one lies on the straight line between the two points. */
function hasClearLine(cellData: CellData, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY));

  for (let i = 1; i < steps; i++) {
    const x = Math.floor(fromX + ((toX - fromX) * i) / steps);
    const y = Math.floor(fromY + ((toY - fromY) * i) / steps);

    try {
      for (const sprite of cellData.getMapPosition(x, y) ?? []) {
        if (sprite.getLayer() === Physics.LEVEL_LAYER) return false;
      }
    } catch (e) {
      if (!(e instanceof EdgeOfCellDataException)) throw e;
    }
  }

  return true;
}

function showExplosion(cell: Cell, cellData: CellData, centerX: number, centerY: number): void {
  const half = Explosion.SIZE / 2;
  const x = Math.max(0, Math.min(cellData.getWidth() - Explosion.SIZE, Math.round(centerX - half)));
  const y = Math.max(0, Math.min(cellData.getHeight() - Explosion.SIZE, Math.round(centerY - half)));
  new Explosion(x, y, cell);
}
