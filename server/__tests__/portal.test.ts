import { describe, expect, it, vi } from 'vitest';
import { Avatar } from '../sprite/avatar';
import { Portal } from '../sprite/portal';
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
});
