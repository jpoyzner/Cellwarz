import type { Look } from './look';
import type { DeathCause } from './deathCause';
import type { Avatar } from './sprite/avatar';
import type { Robot } from './sprite/robot';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { UI } from './ui';

export const POINTS_PER_BLOCK = 20;

/** A connection that can drive a session; it is told to go away when a newer login takes the session over. */
export interface SessionOwner {
  drop(): void;
}

function digestOf(salt: Buffer, password: string): Buffer {
  return createHash('sha256').update(salt).update(password).digest();
}

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
  private owner: SessionOwner | undefined;
  /** The login hash (password), stored salted; set by the first non-blank hash the callsign logs in with, then permanent. */
  private credential: { salt: Buffer; digest: Buffer } | undefined;
  private look: Look | undefined;
  private deathCause: DeathCause | undefined;
  constructor(avatar: Avatar) {
    this.avatar = avatar;
    avatar.setSession(this);
    this.ui = new UI(avatar);
  }

  /** The first non-blank hash a callsign is seen with locks it for good; a blank one (or a later one) changes nothing. */
  protect(password: string): void {
    if (password === '' || this.credential) return;
    const salt = randomBytes(16);
    this.credential = { salt, digest: digestOf(salt, password) };
  }

  /** Unprotected callsigns accept anything; protected ones need the exact hash they were created with. */
  acceptsPassword(password: string): boolean {
    if (!this.credential) return true;
    return timingSafeEqual(this.credential.digest, digestOf(this.credential.salt, password));
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

  /** How this player's last avatar died, if it was one of the causes worth telling them about. */
  getDeathCause(): DeathCause | undefined {
    return this.deathCause;
  }

  setDeathCause(cause: DeathCause | undefined): void {
    this.deathCause = cause;
  }

  /** The live robot this player became (undefined once it is destroyed, or after they take a new avatar). */
  getRobotBody(): Robot | undefined {
    return this.robotBody?.removed() ? undefined : this.robotBody;
  }

  setRobotBody(robot: Robot): void {
    this.robotBody = robot;
  }

  /** A connection (re)took this session: the last login wins (any previous connection is dropped) and a sleeper wakes up. */
  attach(owner: SessionOwner): void {
    const previous = this.owner;
    this.owner = owner;
    if (previous && previous !== owner) previous.drop();
    this.avatar?.wakeUp();
  }

  /** The connection went away (Escape or a lost link): a still-living avatar falls asleep where it stands. */
  detach(owner: SessionOwner): void {
    if (this.owner !== owner) return; // a newer connection already took over (e.g. a quick reattach).
    this.owner = undefined;
    this.avatar?.fallAsleep();
  }

  plugin(avatar: Avatar): void {
    this.robotBody = undefined;
    this.deathCause = undefined;
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
