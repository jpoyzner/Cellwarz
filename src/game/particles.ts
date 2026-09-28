interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  color: string;
}

const MAX_PARTICLES = 200;

/** Small canvas-drawn particle burst system — purely cosmetic, no gameplay effect. */
export class ParticleSystem {
  private particles: Particle[] = [];

  spawnDust(x: number, y: number, count = 5): void {
    this.spawn(x, y, count, {
      speed: 25,
      lifeMs: 350,
      size: 2,
      color: '210, 190, 150',
    });
  }

  spawnImpact(x: number, y: number, count = 12): void {
    this.spawn(x, y, count, {
      speed: 90,
      lifeMs: 400,
      size: 3,
      color: '255, 120, 40',
    });
  }

  spawnWarp(x: number, y: number, count = 16): void {
    this.spawn(x, y, count, {
      speed: 60,
      lifeMs: 450,
      size: 2.5,
      color: '140, 180, 255',
    });
  }

  private spawn(x: number, y: number, count: number, opts: { speed: number; lifeMs: number; size: number; color: string }): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = opts.speed * (0.3 + Math.random() * 0.7);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - opts.speed * 0.3,
        lifeMs: opts.lifeMs,
        maxLifeMs: opts.lifeMs,
        size: opts.size * (0.6 + Math.random() * 0.8),
        color: opts.color,
      });
    }
  }

  update(dtMs: number): void {
    if (this.particles.length === 0) return;

    const dtSec = dtMs / 1000;
    this.particles = this.particles.filter((particle) => {
      particle.lifeMs -= dtMs;
      if (particle.lifeMs <= 0) return false;

      particle.x += particle.vx * dtSec;
      particle.y += particle.vy * dtSec;
      particle.vy += 90 * dtSec; // gentle drift downward as the particle fades.

      return true;
    });
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.lifeMs / particle.maxLifeMs);
      ctx.fillStyle = `rgba(${particle.color}, ${alpha.toFixed(2)})`;
      ctx.fillRect(particle.x - offsetX, particle.y - offsetY, particle.size, particle.size);
    }
  }
}
