import type { Look } from './look';
import { parseLook } from './look';
import type { DeathCause } from './deathCause';
import type { Avatar } from './sprite/avatar';
import type { Robot } from './sprite/robot';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { StoredUser } from './userStore';
import { UI } from './ui';

export const POINTS_PER_BLOCK = 20;

/** A connection that can drive a session; it is told to go away when a newer login takes the session over. */
export interface SessionOwner {
  drop(): void;
}

/** The only credential format so far; stored with each user so a stronger one can be introduced later. */
export const CREDENTIAL_KDF = 'scrypt1';

/** Memory-hard, so a stolen database can't cheaply be ground back into hashes. */
function digestOf(salt: Buffer, password: string): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

/** A cheap fingerprint of a password already proven right, so a reconnect with the same one skips the slow scrypt. */
function quickDigestOf(salt: Buffer, password: string): Buffer {
  return createHash('sha256').update(salt).update(password).digest();
}

// Blocks a player may report shattering: a burst, then a sustained rate no human collecting shards can beat.
export const BLOCK_BURST = 60;
export const BLOCKS_PER_SECOND = 10;

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
  /** Set once the callsign's hash has been proven right in this process (not saved): see quickDigestOf. */
  private verifiedQuick: Buffer | undefined;
  private look: Look | undefined;
  private deathCause: DeathCause | undefined;
  private onChange: (() => void) | undefined;
  private blockAllowance = BLOCK_BURST;
  private blockAllowanceAt = Date.now();

  /** `avatar` is undefined for a player restored from the database who has no body in the room yet. */
  constructor(avatar?: Avatar) {
    this.avatar = avatar;
    avatar?.setSession(this);
    this.ui = new UI(avatar);
  }

  /** A saved player coming back after a restart: their account is whole, but they have no avatar until they log in. */
  static fromStored(user: StoredUser): Session {
    const session = new Session();
    session.score = user.score;
    session.diamonds = user.diamonds;
    if (user.salt && user.digest && user.kdf === CREDENTIAL_KDF) {
      session.credential = { salt: Buffer.from(user.salt), digest: Buffer.from(user.digest) };
    }
    session.look = parseLook(user.headband, user.belt);
    return session;
  }

  toStored(login: string): StoredUser {
    return {
      login,
      salt: this.credential?.salt ?? null,
      digest: this.credential?.digest ?? null,
      kdf: this.credential ? CREDENTIAL_KDF : null,
      score: this.score,
      diamonds: this.diamonds,
      headband: this.look?.headband ?? null,
      belt: this.look?.belt ?? null,
    };
  }

  /** Told whenever something worth saving changes (credential, score, diamonds, colours). */
  setChangeListener(listener: (() => void) | undefined): void {
    this.onChange = listener;
  }

  /** The first non-blank hash a callsign is seen with locks it for good; a blank one (or a later one) changes nothing. */
  protect(password: string): void {
    if (password === '' || this.credential) return;
    const salt = randomBytes(16);
    this.credential = { salt, digest: digestOf(salt, password) };
    this.verifiedQuick = quickDigestOf(salt, password);
    this.onChange?.();
  }

  /** Unprotected callsigns accept anything; protected ones need the exact hash they were created with. */
  acceptsPassword(password: string): boolean {
    if (!this.credential) return true;
    const quick = quickDigestOf(this.credential.salt, password);
    if (this.verifiedQuick && timingSafeEqual(this.verifiedQuick, quick)) return true;

    const accepted = timingSafeEqual(this.credential.digest, digestOf(this.credential.salt, password));
    if (accepted) this.verifiedQuick = quick;
    return accepted;
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
    this.onChange?.();
  }

  getScore(): number {
    return this.score;
  }

  addBlocks(blocks: number): void {
    this.score += blocks * POINTS_PER_BLOCK;
    this.onChange?.();
  }

  /**
   * A client's report of `blocks` shattered: only what the player's allowance covers counts (it refills over time), so a
   * modified client can't mint points faster than a person could earn them. Returns how many were counted.
   */
  claimBlocks(blocks: number, now = Date.now()): number {
    this.blockAllowance = Math.min(BLOCK_BURST, this.blockAllowance + ((now - this.blockAllowanceAt) / 1000) * BLOCKS_PER_SECOND);
    this.blockAllowanceAt = now;
    const counted = Math.min(Math.floor(blocks), Math.floor(this.blockAllowance));
    if (counted <= 0) return 0;

    this.blockAllowance -= counted;
    this.addBlocks(counted);
    return counted;
  }

  getDiamonds(): number {
    return this.diamonds;
  }

  addDiamonds(diamonds: number): void {
    this.diamonds += diamonds;
    this.onChange?.();
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

  /** Whether a connection is currently driving this player (counts toward the room's capacity). */
  isConnected(): boolean {
    return this.owner !== undefined;
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
