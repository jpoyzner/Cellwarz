import { CellData } from './cellData';
import { Engine } from './engine';
import { Physics } from './physics';
import type { Sprite } from './sprite/sprite';

/** What clients need to draw a planet: position/velocity in world pixels (velocity per second), plus a look seed. */
export interface PlanetState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  seed: number;
}

interface PullAccumulator {
  x: number;
  y: number;
}

/** A sprite sliding into the planet's core: its fractional top-left grid position and frames spent so far. */
interface Consumption {
  x: number;
  y: number;
  frame: number;
}

const MIN_RADIUS_PX = 140;
const RADIUS_RANGE_PX = 120;
const MIN_SPEED_PX_PER_SECOND = 40;
const SPEED_RANGE_PX_PER_SECOND = 40;
// Rings reach about twice the radius on the client; spawning/despawning this many radii out keeps them fully off-screen.
const OFFSCREEN_RADII = 3;
const MIN_Y_FRACTION = 0.15;
const MAX_Y_FRACTION = 0.8;
const GRAVITY_RANGE_AVATAR_HEIGHTS = 6;
// Grid units per frame at the planet's surface; falls off quadratically to nothing at the edge of the range. Kept
// below 1 (ordinary gravity) so outside the planet the pull only gently drags sprites around and never lifts them.
const MAX_PULL_PER_FRAME = 0.55;
// Inside the planet's disc the pull is a flat, much stronger value: past 1 it beats gravity, so it can lift a sprite.
const INSIDE_PULL_PER_FRAME = 1.2;
const LIFT_THRESHOLD_PER_FRAME = 1;
// A sprite whose centre gets this close to the planet's centre (a fraction of its radius) is swallowed. Mirrored by
// src/game/planet.ts for the background tetrominoes.
const CORE_RADIUS_FRACTION = 0.15;
// Swallowing takes this long: the sprite slides into the exact centre while shrinking away, then is destroyed.
const CONSUME_FRAMES = Engine.ENGINE_FRAMES_PER_SECOND;

/**
 * One gas giant at a time flies across a room; sprites within ~6 avatar heights of its surface are pulled toward it.
 * The planet is pure background (it never collides) — only the pull touches the grid, through ordinary `Physics.move`s,
 * so walls and heavier sprites still block it. Anything whose centre reaches the planet's core is swallowed: it
 * slides to the exact centre while shrinking away (reported to clients as its consume scale), then is destroyed
 * (an avatar dies).
 */
export class PlanetField {
  private planet: Planet;
  private nextId = 1;
  private readonly accumulators = new WeakMap<Sprite, PullAccumulator>();
  private readonly consuming = new Map<Sprite, Consumption>();

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly avatarHeightPx: number,
    private readonly pullEnabled = process.env.CELLWARZ_PLANET_PULL !== 'off',
    private readonly random: () => number = Math.random,
  ) {
    this.planet = this.spawn();
  }

  getState(): PlanetState {
    return this.planet.toState();
  }

  getGravityRange(): number {
    return this.avatarHeightPx * GRAVITY_RANGE_AVATAR_HEIGHTS;
  }

  /** Advances the planet one simulation step and replaces it with a fresh random one once it has flown past. */
  step(): void {
    this.planet.advance(1 / Engine.ENGINE_FRAMES_PER_SECOND);

    const margin = this.planet.radius * OFFSCREEN_RADII;
    const gone =
      this.planet.vx > 0 ? this.planet.x > this.worldWidth + margin : this.planet.x < -margin;
    if (gone) this.planet = this.spawn();
  }

  /** Pulls one sprite toward the planet, if it is within range, by this frame's whole number of grid units. */
  applyPull(sprite: Sprite, physics: Physics): void {
    if (!this.pullEnabled || sprite.getMass() === 0 || sprite.removed() || this.consuming.has(sprite)) return;

    const step = CellData.ANIMATION_STEP;
    const dx = this.planet.x - (sprite.getXPixels() + (sprite.getWidth() * step) / 2);
    const dy = this.planet.y - (sprite.getYPixels() + (sprite.getHeight() * step) / 2);
    const distance = Math.hypot(dx, dy);

    if (distance <= this.planet.radius * CORE_RADIUS_FRACTION) {
      this.consuming.set(sprite, { x: sprite.getX(), y: sprite.getY(), frame: 0 });
      sprite.setConsumeScale(1);
      return;
    }

    const fromSurface = Math.max(0, distance - this.planet.radius);
    const range = this.getGravityRange();

    if (fromSurface >= range) return;

    const strength = fromSurface === 0 ? INSIDE_PULL_PER_FRAME : MAX_PULL_PER_FRAME * (1 - fromSurface / range) ** 2;
    const pullX = (dx / distance) * strength;
    const pullY = (dy / distance) * strength;

    const accumulator = this.accumulatorFor(sprite);
    accumulator.x = this.pullAlong(sprite, physics, true, accumulator.x + pullX);

    // An upward pull weaker than gravity would only make a grounded sprite jitter, so it is ignored entirely.
    if (pullY < 0 && -pullY < LIFT_THRESHOLD_PER_FRAME) {
      accumulator.y = 0;
      return;
    }

    accumulator.y = this.pullAlong(sprite, physics, false, accumulator.y + pullY);
    if (pullY < 0) sprite.resetGravitateCount();
  }

  /** Moves every sprite being swallowed one step closer to the core, destroying those that have fully shrunk away. */
  advanceConsumed(physics: Physics): void {
    const step = CellData.ANIMATION_STEP;

    for (const [sprite, consumption] of this.consuming) {
      if (sprite.removed()) {
        this.consuming.delete(sprite);
        continue;
      }

      consumption.frame++;
      if (consumption.frame >= CONSUME_FRAMES) {
        this.consuming.delete(sprite);
        sprite.setConsumeScale(0);
        sprite.onConsumed();
        continue;
      }

      // Close the remaining gap evenly so the sprite arrives at the (moving) centre just as it vanishes; the target is
      // clamped inside the grid so a planet leaving the room can't drag it out of bounds (or wrap it around).
      const remaining = CONSUME_FRAMES - consumption.frame + 1;
      const targetX = this.clamp(this.planet.x / step - sprite.getWidth() / 2, this.worldWidth / step - sprite.getWidth());
      const targetY = this.clamp(this.planet.y / step - sprite.getHeight() / 2, this.worldHeight / step - sprite.getHeight());
      consumption.x += (targetX - consumption.x) / remaining;
      consumption.y += (targetY - consumption.y) / remaining;

      sprite.setConsumeScale(1 - consumption.frame / CONSUME_FRAMES);
      const x = Math.round(consumption.x);
      const y = Math.round(consumption.y);
      if (x !== sprite.getX() || y !== sprite.getY()) physics.moveTo(sprite, x, y);
    }
  }

  private clamp(value: number, max: number): number {
    return Math.min(Math.max(value, 0), Math.max(0, max));
  }

  /** Moves along one axis by the whole units in `total` (sign = direction); returns the leftover fraction. */
  private pullAlong(sprite: Sprite, physics: Physics, horizontal: boolean, total: number): number {
    const units = Math.trunc(total);
    if (units === 0) return total;

    const direction = Math.sign(units);
    const moved = physics.move(sprite, horizontal ? direction : Physics.NONE, horizontal ? Physics.NONE : direction, Math.abs(units));
    // A blocked pull (wall, heavier sprite) shouldn't bank up and fling the sprite the moment it frees up.
    return moved ? total - units : 0;
  }

  private accumulatorFor(sprite: Sprite): PullAccumulator {
    let accumulator = this.accumulators.get(sprite);
    if (!accumulator) {
      accumulator = { x: 0, y: 0 };
      this.accumulators.set(sprite, accumulator);
    }
    return accumulator;
  }

  private spawn(): Planet {
    const radius = MIN_RADIUS_PX + this.random() * RADIUS_RANGE_PX;
    const speed = MIN_SPEED_PX_PER_SECOND + this.random() * SPEED_RANGE_PX_PER_SECOND;
    const rightward = this.random() < 0.5;
    const margin = radius * OFFSCREEN_RADII;
    const startY = this.randomY();
    const endY = this.randomY();
    const travelSeconds = (this.worldWidth + margin * 2) / speed;

    return new Planet(
      this.nextId++,
      rightward ? -margin : this.worldWidth + margin,
      startY,
      rightward ? speed : -speed,
      (endY - startY) / travelSeconds,
      radius,
      Math.floor(this.random() * 0x7fffffff),
    );
  }

  private randomY(): number {
    return this.worldHeight * (MIN_Y_FRACTION + this.random() * (MAX_Y_FRACTION - MIN_Y_FRACTION));
  }
}

class Planet {
  constructor(
    readonly id: number,
    public x: number,
    public y: number,
    readonly vx: number,
    readonly vy: number,
    readonly radius: number,
    readonly seed: number,
  ) {}

  advance(seconds: number): void {
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
  }

  toState(): PlanetState {
    return { id: this.id, x: this.x, y: this.y, vx: this.vx, vy: this.vy, radius: this.radius, seed: this.seed };
  }
}
