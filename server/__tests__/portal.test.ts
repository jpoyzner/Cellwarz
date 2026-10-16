import { describe, expect, it, vi } from 'vitest';
import { Avatar, BEAM_FRAMES } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Portal } from '../sprite/portal';
import { getSprites } from '../jsonGenerator';
import { createTestCell } from './testHelpers';

describe('Portal', () => {
  it('relocates the avatar to a new room and marks the login as needing a refresh', () => {
    const { cell } = createTestCell(50, 50);
    Portal.init(cell.getCellData());
    Avatar.init(cell.getCellData());
    const avatar = new Avatar('traveler', 10, 10, false, cell);

    const newAvatar = new Avatar('traveler', 5, 5, false, cell);
    const session = { plugin: vi.fn() };
    const zion = {
      getHardlines: () => new Map([['traveler', session]]),
      getRandomEngine: () => ({ getCell: () => ({ addAvatarAtEntrance: () => newAvatar }) }),
      loginNeedsRefresh: vi.fn(),
    };

    // Portal's own cell.getWorld().getZion() drives warpRandomly's orchestration.
    (cell.getWorld() as unknown as { getZion: () => typeof zion }).getZion = () => zion;

    const portal = new Portal(20, 20, false, cell);
    portal.warpRandomly(avatar);

    expect(session.plugin).toHaveBeenCalledWith(newAvatar);
    expect(zion.loginNeedsRefresh).toHaveBeenCalledWith('traveler');
  });

  it('does not crash when the destination room has no free entrance spot', () => {
    const { cell } = createTestCell(50, 50);
    Portal.init(cell.getCellData());
    Avatar.init(cell.getCellData());
    const avatar = new Avatar('unlucky', 10, 10, false, cell);

    const session = { plugin: vi.fn() };
    const zion = {
      getHardlines: () => new Map([['unlucky', session]]),
      getRandomEngine: () => ({ getCell: () => ({ addAvatarAtEntrance: () => undefined }) }),
      loginNeedsRefresh: vi.fn(),
    };

    (cell.getWorld() as unknown as { getZion: () => typeof zion }).getZion = () => zion;

    const portal = new Portal(20, 20, false, cell);
    expect(() => portal.warpRandomly(avatar)).not.toThrow();
    expect(session.plugin).not.toHaveBeenCalled();
  });

  describe('transporting with Up', () => {
    function sceneWithPortal() {
      const { cell } = createTestCell(50, 50);
      CellBlock.init(cell.getCellData());
      Portal.init(cell.getCellData());
      Avatar.init(cell.getCellData());
      new CellBlock(10, 20, false, cell);
      const portal = new Portal(8, 12, false, cell); // an 8x8 portal resting on the block's row.
      const avatar = new Avatar('traveler', 10, 12, false, cell);
      const warp = vi.spyOn(portal, 'warpRandomly').mockImplementation(() => {});
      return { cell, portal, avatar, warp };
    }

    it('does not warp just by walking into the portal', () => {
      const { avatar, warp } = sceneWithPortal();
      avatar.runRight();
      for (let i = 0; i < 20; i++) avatar['doAction']();
      expect(warp).not.toHaveBeenCalled();
    });

    it('beams the avatar up on an Up press while it stands in the portal, then warps it', () => {
      const { avatar, warp } = sceneWithPortal();
      avatar.attemptJump();
      expect(avatar.isBeaming()).toBe(true);
      expect(avatar.getBeamProgress()).toBe(0);
      const y = avatar.getY();

      for (let i = 1; i < BEAM_FRAMES; i++) {
        avatar['doAction']();
        expect(warp).not.toHaveBeenCalled();
      }
      expect(avatar.getY()).toBe(y); // held in place rather than jumping.
      expect(avatar.getBeamProgress()).toBeGreaterThan(0.9);

      avatar['doAction']();
      expect(warp).toHaveBeenCalledWith(avatar);
      expect(avatar.isBeaming()).toBe(false);
    });

    it('reports the beam progress on the wire, and falling asleep cancels the beam', () => {
      const { avatar } = sceneWithPortal();
      avatar.attemptJump();
      for (let i = 0; i < 10; i++) avatar['doAction']();
      const [, , , extra] = getSprites([avatar], true)[String(avatar.getCellIndex())] as [number, number, number, Record<string, number>];
      expect(extra['6']).toBeGreaterThan(0);

      avatar.fallAsleep();
      expect(avatar.isBeaming()).toBe(false);
    });

    it('jumps as usual when it is not standing in a portal', () => {
      const { cell } = createTestCell(50, 50);
      CellBlock.init(cell.getCellData());
      Avatar.init(cell.getCellData());
      new CellBlock(10, 20, false, cell);
      const avatar = new Avatar('jumper', 10, 12, false, cell);
      avatar.attemptJump();
      expect(avatar.isBeaming()).toBe(false);
      const y = avatar.getY();
      avatar['doAction']();
      expect(avatar.getY()).toBeLessThan(y);
    });
  });
});
