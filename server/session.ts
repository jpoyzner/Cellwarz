import type { Look } from './look';
import type { Avatar } from './sprite/avatar';
import type { Robot } from './sprite/robot';
import { UI } from './ui';

export const POINTS_PER_BLOCK = 20;

export class Session {
  /** Bumped whenever any player's colours change, so connections know when to resend everyone's looks. */
  static looksRevision = 0;

  private avatar: Avatar | undefined;
  private readonly ui: UI;
  private score = 0;
  private diamonds = 0;
  /** The robot this player's body was turned into by a robot's touch; their client keeps watching it. */
  private robotBody: Robot | undefined;
  /** The connection currently driving this session; only it can put the avatar to sleep by leaving. */
  private owner: object | undefined;
  private look: Look | undefined;

  constructor(avatar: Avatar) {
    this.avatar = avatar;
    avatar.setSession(this);
    this.ui = new UI(avatar);
  }

  getUI(): UI {
    return this.ui;
  }

  getLook(): Look | undefined {
    return this.look;
  }

  setLook(look: Look | undefined): void {
    if (look?.headband === this.look?.headband && look?.belt === this.look?.belt) return;
    this.look = look;
    Session.looksRevision++;
  }

  getScore(): number {
    return this.score;
  }

  addBlocks(blocks: number): void {
    this.score += blocks * POINTS_PER_BLOCK;
  }

  getDiamonds(): number {
    return this.diamonds;
  }

  addDiamonds(diamonds: number): void {
    this.diamonds += diamonds;
  }

  getAvatar(): Avatar | undefined {
    return this.avatar;
  }

  /** The live robot this player became (undefined once it is destroyed, or after they take a new avatar). */
  getRobotBody(): Robot | undefined {
    return this.robotBody?.removed() ? undefined : this.robotBody;
  }

  setRobotBody(robot: Robot): void {
    this.robotBody = robot;
  }

  /** A connection (re)took this session: whoever was asleep wakes up. */
  attach(owner: object): void {
    this.owner = owner;
    this.avatar?.wakeUp();
  }

  /** The connection went away (Escape or a lost link): a still-living avatar falls asleep where it stands. */
  detach(owner: object): void {
    if (this.owner !== owner) return; // a newer connection already took over (e.g. a quick reattach).
    this.owner = undefined;
    this.avatar?.fallAsleep();
  }

  plugin(avatar: Avatar): void {
    this.robotBody = undefined;
    if (this.avatar) {
      this.avatar.setManaDown();
      this.avatar.removePermanently();
    }

    this.avatar = avatar;
    avatar.setSession(this); // warps/reattaches/respawns make a fresh avatar; without this it can't collect diamonds
    this.ui.plugin(avatar);
  }

  unplugged(): boolean {
    return this.avatar === undefined;
  }

  unplug(): void {
    this.avatar?.setManaDown(); // TODO: will crash if someone kills you while you hold something (kept from original Java implementation).
    this.avatar = undefined;
    this.ui.unplug();
  }
}
