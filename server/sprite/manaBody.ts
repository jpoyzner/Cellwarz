import type { Mana } from './mana';

/**
 * The motion state of one block, or of a rigid group of blocks stuck together (they share one body, so a
 * push, a throw or an explosion moves the whole group as a single piece). Velocities are in grid cells per
 * frame; `subX`/`subY` carry the fractional cells until they add up to a whole one.
 */
export class ManaBody {
  readonly members: Mana[];
  vx = 0;
  vy = 0;
  subX = 0;
  subY = 0;

  constructor(first: Mana) {
    this.members = [first];
  }

  /** The member that actually runs the group's physics each frame. */
  getLeader(): Mana | undefined {
    return this.members[0];
  }

  /** Drops blocks that have left the game (exploded, swallowed by a planet) so they stop holding the group together. */
  prune(): void {
    for (let i = this.members.length - 1; i >= 0; i--) {
      if (this.members[i].removed()) this.members.splice(i, 1);
    }
  }

  private netGravityPull(): number {
    return this.members.reduce((sum, member) => sum + member.getGravityPull(), 0);
  }

  /** Which way the group falls: the net of its members' gravity (0 when they cancel out or none is affected). */
  gravityDirection(): number {
    return Math.sign(this.netGravityPull());
  }

  /** How hard the group falls, as a fraction of normal gravity: a faint-gravity (yellow, lifted) member lightens it. */
  gravityStrength(): number {
    return this.members.length === 0 ? 0 : Math.abs(this.netGravityPull()) / this.members.length;
  }

  /** The group's constant self-propelled sliding speed (blue blocks), 0 for none. */
  slideDrive(): number {
    return this.members.reduce((sum, member) => sum + member.getSlideDrive(), 0);
  }

  /** Splits every member off into a body of its own (the glue is gone). */
  dissolve(): void {
    const members = [...this.members];
    this.members.length = 0;
    for (const member of members) member.joinBody(new ManaBody(member));
  }

  /** Takes one block out of the group, leaving the rest stuck together. */
  release(member: Mana): void {
    const index = this.members.indexOf(member);
    if (index !== -1) this.members.splice(index, 1);
    member.joinBody(new ManaBody(member));
  }

  /** Joins `other`'s blocks into this body, keeping the combined momentum. */
  merge(other: ManaBody): void {
    if (other === this) return;

    const here = this.members.length;
    const there = other.members.length;
    this.vx = (this.vx * here + other.vx * there) / (here + there);
    this.vy = (this.vy * here + other.vy * there) / (here + there);
    this.subX = 0;
    this.subY = 0;

    for (const member of other.members) {
      this.members.push(member);
      member.joinBody(this);
    }
    other.members.length = 0;
  }

  stop(): void {
    this.vx = 0;
    this.vy = 0;
    this.subX = 0;
    this.subY = 0;
  }
}
