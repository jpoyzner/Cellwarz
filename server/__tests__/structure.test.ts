import { describe, expect, it, vi } from 'vitest';
import { Avatar } from '../sprite/avatar';
import { Launcher } from '../sprite/launcher';
import { Missile } from '../sprite/missile';
import { createTestCell } from './testHelpers';

function createTestScene(width: number, height: number) {
  const { cell, physics } = createTestCell(width, height);
  const cellData = cell.getCellData();
  Avatar.init(cellData);
  Launcher.init(cellData);
  return { cell, physics };
}

describe('Structure', () => {
  it('connects an avatar standing on a mana block, and activating fires its action', () => {
    const { cell } = createTestScene(50, 50);
    const launcher = new Launcher(10, 20, false, cell);
    const avatar = new Avatar('connector', 10, 12, false, cell);

    expect(avatar.getStructure()).toBeUndefined();

    avatar.toggleConnectToStructure();

    expect(avatar.getStructure()).toBe(launcher.getStructure());

    const spritesBefore = cell.getCellData().getSprites().filter((s) => s instanceof Missile).length;
    avatar.activateManaAction(0, 1); // LaunchMissleRight
    const spritesAfter = cell.getCellData().getSprites().filter((s) => s instanceof Missile).length;

    expect(spritesAfter).toBe(spritesBefore + 1);
  });

  it('disconnects and deactivates all mana actions', () => {
    const { cell } = createTestScene(50, 50);
    const launcher = new Launcher(10, 20, false, cell);
    const deactivateSpy = vi.spyOn(launcher.getStructure()!, 'deactivateAllManaActions');
    const avatar = new Avatar('disconnector', 10, 12, false, cell);

    avatar.toggleConnectToStructure();
    avatar.toggleConnectToStructure();

    expect(avatar.getStructure()).toBeUndefined();
    expect(deactivateSpy).toHaveBeenCalledTimes(1);
  });
});
