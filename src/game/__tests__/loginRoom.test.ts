import { describe, expect, it } from 'vitest';
import { FLOOR_Y, PADS, padAt, ROOM_WIDTH, RoomAvatar } from '../loginRoom';

const STILL = { left: false, right: false, jump: false };

describe('RoomAvatar', () => {
  it('starts standing mid-room and runs left and right, facing the way it runs', () => {
    const avatar = new RoomAvatar();
    expect(avatar.x).toBe(ROOM_WIDTH / 2);
    expect(avatar.onGround).toBe(true);

    avatar.step(0.1, { ...STILL, right: true });
    expect(avatar.x).toBeGreaterThan(ROOM_WIDTH / 2);
    expect(avatar.facingRight).toBe(true);
    expect(avatar.moving).toBe(true);

    const afterRight = avatar.x;
    avatar.step(0.1, { ...STILL, left: true });
    expect(avatar.x).toBeLessThan(afterRight);
    expect(avatar.facingRight).toBe(false);

    avatar.step(0.1, STILL);
    expect(avatar.moving).toBe(false);
  });

  it('cannot leave the room through either wall', () => {
    const avatar = new RoomAvatar();
    for (let i = 0; i < 200; i++) avatar.step(0.05, { ...STILL, left: true });
    const left = avatar.x;
    expect(left).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) avatar.step(0.05, { ...STILL, right: true });
    expect(avatar.x).toBeLessThan(ROOM_WIDTH);
    expect(avatar.x).toBeGreaterThan(left);
  });

  it('jumps up, comes back down and lands on the floor', () => {
    const avatar = new RoomAvatar();
    avatar.step(0.016, { ...STILL, jump: true });
    expect(avatar.onGround).toBe(false);
    expect(avatar.vy).toBeLessThan(0);

    let highest = avatar.y;
    for (let i = 0; i < 120 && !avatar.onGround; i++) {
      avatar.step(0.016, STILL);
      highest = Math.min(highest, avatar.y);
    }

    expect(highest).toBeLessThan(FLOOR_Y - 60);
    expect(avatar.onGround).toBe(true);
    expect(avatar.y).toBe(FLOOR_Y);
  });

  it('cannot jump again in mid-air', () => {
    const avatar = new RoomAvatar();
    avatar.step(0.016, { ...STILL, jump: true });
    for (let i = 0; i < 10; i++) avatar.step(0.016, STILL);
    const vy = avatar.vy;
    avatar.step(0.016, { ...STILL, jump: true });
    expect(avatar.vy).toBeGreaterThan(vy); // still decelerating upward, not re-launched
  });
});

describe('padAt', () => {
  it('finds the transporter under the avatar, only while it stands on the floor', () => {
    expect(padAt(PADS.teleport.centerX, true, true)).toBe('teleport');
    expect(padAt(PADS.wakeup.centerX, true, true)).toBe('wakeup');
    expect(padAt(PADS.teleport.centerX, false, true)).toBeUndefined();
    expect(padAt(ROOM_WIDTH / 2, true, true)).toBeUndefined();
  });

  it('has no wake-up pad until the player has a living avatar', () => {
    expect(padAt(PADS.wakeup.centerX, true, false)).toBeUndefined();
    expect(padAt(PADS.teleport.centerX, true, false)).toBe('teleport');
  });
});
