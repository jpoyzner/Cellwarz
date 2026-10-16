import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEAM_MS, FLOOR_Y, LoginRoom, PADS, padAt, ROOM_WIDTH, RoomAvatar, START_X } from '../loginRoom';

const STILL = { left: false, right: false, jump: false };

describe('RoomAvatar', () => {
  it('starts standing between the pads and runs left and right, facing the way it runs', () => {
    const avatar = new RoomAvatar();
    expect(avatar.x).toBe(START_X);
    expect(avatar.onGround).toBe(true);

    avatar.step(0.1, { ...STILL, right: true });
    expect(avatar.x).toBeGreaterThan(START_X);
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
    expect(padAt(PADS.home.centerX, true, false)).toBe('home');
    expect(padAt(START_X, true, true)).toBeUndefined();
  });

  it('keeps the three pads clear of each other', () => {
    const centers = Object.values(PADS).map((pad) => pad.centerX).sort((a, b) => a - b);
    for (let i = 1; i < centers.length; i++) expect(centers[i] - centers[i - 1]).toBeGreaterThanOrEqual(2 * PADS.home.halfWidth);
  });

  it('has no wake-up pad until the player has a living avatar', () => {
    expect(padAt(PADS.wakeup.centerX, true, false)).toBeUndefined();
    expect(padAt(PADS.teleport.centerX, true, false)).toBe('teleport');
  });
});

describe('LoginRoom transporters', () => {
  function makeRoom(canTransport = true) {
    const used: string[] = [];
    const blocked: string[] = [];
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    vi.stubGlobal('Image', class {});
    vi.stubGlobal('performance', { now: () => 0 });
    const room = new LoginRoom(canvas, {
      canTransport: () => canTransport,
      onBlocked: (pad) => blocked.push(pad),
      onTransport: (pad) => used.push(pad),
    });
    return { room, used, blocked };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses a pad only on a fresh Up press while standing on it, never by walking onto it', () => {
    vi.useFakeTimers();
    const { room, used } = makeRoom();
    room.avatar.x = PADS.teleport.centerX;

    room.setKey('jump', true, true); // an auto-repeat of a held key (e.g. bunny-hopping across the pad) is not a press
    expect(room.isBeaming).toBe(false);
    room.setKey('jump', false);

    room.setKey('jump', true);
    expect(room.isBeaming).toBe(true);
    vi.advanceTimersByTime(BEAM_MS);
    expect(used).toEqual(['teleport']);
  });

  it('jumps normally when Up is pressed away from every pad, and the pad press is not also a jump', () => {
    vi.useFakeTimers();
    const { room } = makeRoom();
    room.avatar.x = START_X;
    room.setKey('jump', true);
    expect(room.isBeaming).toBe(false);
    room.avatar.step(0.016, { left: false, right: false, jump: true });
    expect(room.avatar.onGround).toBe(false);

    const onPad = makeRoom().room;
    onPad.avatar.x = PADS.home.centerX;
    onPad.setKey('jump', true);
    onPad.avatar.step(0.016, { left: false, right: false, jump: false });
    expect(onPad.avatar.onGround).toBe(true);
  });

  it('tells the player when a pad needs a callsign, but HOME needs none', () => {
    vi.useFakeTimers();
    const { room, blocked, used } = makeRoom(false);
    room.avatar.x = PADS.teleport.centerX;
    room.setKey('jump', true);
    expect(blocked).toEqual(['teleport']);
    expect(room.isBeaming).toBe(false);
    room.setKey('jump', false);

    room.avatar.x = PADS.home.centerX;
    room.setKey('jump', true);
    vi.advanceTimersByTime(BEAM_MS);
    expect(used).toEqual(['home']);
  });
});
