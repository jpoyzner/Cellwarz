// The login "room": a small ship interior (client-only, nothing here touches the server) where the player walks their
// avatar between two transporters. Walking onto the TELEPORT pad drops a fresh avatar at a random floor spot in the
// main room; the WAKE UP pad (only present while the typed callsign has a living avatar there) re-attaches to it.

import { NeonSprites } from './neonSprites';
import type { Look } from './look';

export const ROOM_WIDTH = 960;
export const ROOM_HEIGHT = 540;
export const FLOOR_Y = 470;

export type PadId = 'wakeup' | 'teleport';

export const PADS: Record<PadId, { centerX: number; halfWidth: number; color: string; label: string }> = {
  wakeup: { centerX: 215, halfWidth: 75, color: '#ffae1a', label: 'WAKE UP' },
  teleport: { centerX: 745, halfWidth: 75, color: '#00f6ff', label: 'TELEPORT' },
};

const AVATAR_SCALE = 2;
const SPRITE_WIDTH = 48;
const SPRITE_HEIGHT = 64;
const RUN_SPEED = 230;
const JUMP_SPEED = 560;
const GRAVITY = 1700;
const WALL_MARGIN = 48;
// Standing on a pad this long (seconds) fires it, so just crossing a pad doesn't.
const PAD_DWELL_S = 0.45;
export const BEAM_MS = 650;
const MAX_FRAME_S = 0.05;

export interface RoomInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/** The walking avatar's physics: running, jumping and gravity on a flat floor between two walls. */
export class RoomAvatar {
  /** Horizontal centre and feet height, in room pixels. */
  x = ROOM_WIDTH / 2;
  y = FLOOR_Y;
  vy = 0;
  facingRight = true;
  moving = false;

  get onGround(): boolean {
    return this.y >= FLOOR_Y;
  }

  step(dt: number, input: RoomInput): void {
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.moving = direction !== 0;
    if (direction !== 0) this.facingRight = direction > 0;
    this.x = Math.min(Math.max(this.x + direction * RUN_SPEED * dt, WALL_MARGIN), ROOM_WIDTH - WALL_MARGIN);

    if (input.jump && this.onGround) this.vy = -JUMP_SPEED;

    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y >= FLOOR_Y) {
      this.y = FLOOR_Y;
      this.vy = 0;
    }
  }
}

/** Which pad (if any) the avatar's feet are over. */
export function padAt(x: number, onGround: boolean, wakeAvailable: boolean): PadId | undefined {
  if (!onGround) return undefined;
  for (const id of Object.keys(PADS) as PadId[]) {
    if (id === 'wakeup' && !wakeAvailable) continue;
    if (Math.abs(x - PADS[id].centerX) <= PADS[id].halfWidth - 20) return id;
  }
  return undefined;
}

export interface LoginRoomCallbacks {
  /** Whether a transporter may fire right now (a callsign has been typed). */
  canTransport: () => boolean;
  /** A transporter was used but couldn't fire (no callsign yet). */
  onBlocked: (pad: PadId) => void;
  /** The beam-up finished: take the player into the game through this transporter. */
  onTransport: (pad: PadId) => void;
}

interface Particle {
  x: number;
  y: number;
  vy: number;
  life: number;
  color: string;
}

const AVATAR_FRAMES = [
  ...Array.from({ length: 6 }, (_, i) => `stand${i + 1}`),
  ...Array.from({ length: 12 }, (_, i) => `run${i + 1}`),
  'jump',
  'float',
];

export class LoginRoom {
  readonly avatar = new RoomAvatar();
  name = '';
  look: Look | null = null;
  wakeAvailable = false;

  private readonly images = new Map<string, HTMLImageElement>();
  private readonly neon = new NeonSprites();
  private readonly input: RoomInput = { left: false, right: false, jump: false };
  private readonly stars = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.02 + Math.random() * 0.12,
  }));
  private particles: Particle[] = [];
  private frame = 0;
  private lastTime = 0;
  private clock = 0;
  private scale = 1;
  private padTime = 0;
  private blockedNotified = false;
  private beaming: { pad: PadId; startedAt: number } | undefined;
  private beamTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: LoginRoomCallbacks,
  ) {
    for (const frame of AVATAR_FRAMES) {
      for (const suffix of ['', 'L']) {
        const image = new Image();
        image.src = `/images/me/${frame}${suffix}.png`;
        this.images.set(frame + suffix, image);
      }
    }
  }

  setLook(look: Look | null): void {
    this.look = look;
    this.neon.clear();
  }

  setKey(key: keyof RoomInput, down: boolean): void {
    this.input[key] = down;
  }

  /** Canvas pixels per room pixel (the stage is scaled to fit the window). */
  setScale(scale: number): void {
    this.scale = scale;
    this.canvas.width = Math.round(ROOM_WIDTH * scale);
    this.canvas.height = Math.round(ROOM_HEIGHT * scale);
  }

  get isBeaming(): boolean {
    return this.beaming !== undefined;
  }

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.update(Math.min((now - this.lastTime) / 1000, MAX_FRAME_S), now);
      this.lastTime = now;
      this.draw(now);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    if (this.beamTimer) clearTimeout(this.beamTimer);
  }

  /** Uses a transporter (walked onto, or clicked): beams the avatar up, then hands over to the game. */
  useTransporter(pad: PadId): void {
    if (this.beaming) return;
    if (pad === 'wakeup' && !this.wakeAvailable) return;
    if (!this.callbacks.canTransport()) {
      this.callbacks.onBlocked(pad);
      return;
    }

    this.beaming = { pad, startedAt: performance.now() };
    this.beamTimer = setTimeout(() => this.callbacks.onTransport(pad), BEAM_MS);
  }

  private update(dt: number, now: number): void {
    this.clock = now / 1000;
    if (!this.beaming) this.avatar.step(dt, this.input);

    for (const star of this.stars) star.x = (star.x - star.speed * dt + 1) % 1;
    this.particles = this.particles
      .map((p) => ({ ...p, y: p.y + p.vy * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);

    if (this.beaming) return;

    const pad = padAt(this.avatar.x, this.avatar.onGround, this.wakeAvailable);
    if (!pad) {
      this.padTime = 0;
      this.blockedNotified = false;
      return;
    }

    this.padTime += dt;
    if (this.padTime < PAD_DWELL_S) return;
    if (this.callbacks.canTransport()) {
      this.useTransporter(pad);
    } else if (!this.blockedNotified) {
      this.blockedNotified = true;
      this.callbacks.onBlocked(pad);
    }
  }

  private currentFrameName(): string {
    const { avatar } = this;
    let name: string;
    if (!avatar.onGround) name = avatar.vy < 0 ? 'jump' : 'float';
    else if (avatar.moving) name = `run${Math.floor(this.clock * 24) % 12 + 1}`;
    else name = `stand${Math.floor(this.clock * 4) % 6 + 1}`;
    return avatar.facingRight ? name : `${name}L`;
  }

  private draw(now: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // Faint engine rumble shakes the whole room a pixel or so.
    const shakeX = Math.sin(now / 37) * 0.6;
    const shakeY = Math.cos(now / 43) * 0.6;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawHull(ctx);
    this.drawViewport(ctx);
    this.drawFloor(ctx);
    for (const id of Object.keys(PADS) as PadId[]) this.drawPad(ctx, id);
    this.drawAvatar(ctx, now);
    this.drawParticles(ctx);

    ctx.restore();
    this.drawVignette(ctx);
  }

  private drawHull(ctx: CanvasRenderingContext2D): void {
    const wall = ctx.createLinearGradient(0, 0, 0, ROOM_HEIGHT);
    wall.addColorStop(0, '#080c1c');
    wall.addColorStop(1, '#101830');
    ctx.fillStyle = wall;
    ctx.fillRect(-4, -4, ROOM_WIDTH + 8, ROOM_HEIGHT + 8);

    // Wall panels.
    ctx.strokeStyle = 'rgba(70, 110, 170, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ROOM_WIDTH; x += 80) {
      for (let y = 40; y < FLOOR_Y; y += 60) ctx.strokeRect(x + 0.5, y + 0.5, 80, 60);
    }

    // Ceiling pipes and a row of blinking status lights.
    ctx.fillStyle = '#0a0f20';
    ctx.fillRect(0, 0, ROOM_WIDTH, 22);
    ctx.fillStyle = '#16203c';
    ctx.fillRect(0, 22, ROOM_WIDTH, 5);
    ctx.fillStyle = 'rgba(0, 246, 255, 0.55)';
    ctx.fillRect(0, 27, ROOM_WIDTH, 1);
    for (let i = 0; i < 24; i++) {
      const on = Math.sin(this.clock * 2 + i * 1.7) > 0.2;
      ctx.fillStyle = on ? (i % 3 === 0 ? '#ff2ea6' : '#00f6ff') : '#1a2440';
      ctx.fillRect(14 + i * 40, 9, 6, 4);
    }

    // Vertical girders every 240px, with rivets and a glowing conduit.
    for (let x = 0; x <= ROOM_WIDTH; x += 240) {
      ctx.fillStyle = '#0c1226';
      ctx.fillRect(x - 14, 27, 28, FLOOR_Y - 27);
      ctx.fillStyle = 'rgba(0, 246, 255, 0.35)';
      ctx.fillRect(x - 14, 27, 1, FLOOR_Y - 27);
      ctx.fillRect(x + 13, 27, 1, FLOOR_Y - 27);
      ctx.fillStyle = '#26345a';
      for (let y = 44; y < FLOOR_Y; y += 40) {
        ctx.fillRect(x - 9, y, 3, 3);
        ctx.fillRect(x + 6, y, 3, 3);
      }
      const pulse = (this.clock * 90 + x) % (FLOOR_Y - 27);
      ctx.fillStyle = 'rgba(255, 46, 166, 0.7)';
      ctx.fillRect(x - 1, 27 + pulse, 2, 18);
    }
  }

  // A wide viewport in the middle of the back wall: stars streaking past and a gas giant far off.
  private drawViewport(ctx: CanvasRenderingContext2D): void {
    const x = 330;
    const y = 254;
    const width = 300;
    const height = 96;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.fillStyle = '#02030a';
    ctx.fillRect(x, y, width, height);

    const planetX = x + width * 0.72;
    const planetY = y + height * 1.05;
    const planet = ctx.createRadialGradient(planetX - 25, planetY - 40, 8, planetX, planetY, 110);
    planet.addColorStop(0, '#ffcf7a');
    planet.addColorStop(0.45, '#c96a3a');
    planet.addColorStop(1, '#2a1030');
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(planetX, planetY, 110, 0, Math.PI * 2);
    ctx.fill();

    for (const star of this.stars) {
      const length = 1 + star.speed * 90;
      ctx.fillStyle = `rgba(190, 230, 255, ${0.35 + star.speed * 4})`;
      ctx.fillRect(x + star.x * width, y + star.y * height, length, 1);
    }

    const glass = ctx.createLinearGradient(x, y, x + width, y + height);
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
    glass.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glass;
    ctx.fillRect(x, y, width, height);
    ctx.restore();

    ctx.strokeStyle = '#26345a';
    ctx.lineWidth = 6;
    ctx.strokeRect(x - 3, y - 3, width + 6, height + 6);
    ctx.strokeStyle = 'rgba(0, 246, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 6.5, y - 6.5, width + 13, height + 13);
    ctx.fillStyle = '#3a4a78';
    for (const [bx, by] of [[x - 6, y - 6], [x + width + 3, y - 6], [x - 6, y + height + 3], [x + width + 3, y + height + 3]]) {
      ctx.fillRect(bx, by, 4, 4);
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0a1024';
    ctx.fillRect(-4, FLOOR_Y, ROOM_WIDTH + 8, ROOM_HEIGHT - FLOOR_Y + 4);

    // Hazard stripes along the floor's lip.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, FLOOR_Y, ROOM_WIDTH, 8);
    ctx.clip();
    ctx.fillStyle = '#e6b800';
    ctx.fillRect(0, FLOOR_Y, ROOM_WIDTH, 8);
    ctx.fillStyle = '#0a0a0a';
    for (let x = -16; x < ROOM_WIDTH + 16; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y + 8);
      ctx.lineTo(x + 8, FLOOR_Y + 8);
      ctx.lineTo(x + 20, FLOOR_Y);
      ctx.lineTo(x + 12, FLOOR_Y);
      ctx.fill();
    }
    ctx.restore();

    // Floor grating.
    ctx.strokeStyle = 'rgba(60, 100, 170, 0.35)';
    ctx.lineWidth = 1;
    for (let y = FLOOR_Y + 16; y < ROOM_HEIGHT; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(ROOM_WIDTH, y + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x < ROOM_WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, FLOOR_Y + 8);
      ctx.lineTo(x - 15.5, ROOM_HEIGHT);
      ctx.stroke();
    }
  }

  private drawPad(ctx: CanvasRenderingContext2D, id: PadId): void {
    const { centerX, halfWidth, color } = PADS[id];
    const active = id === 'teleport' || this.wakeAvailable;

    ctx.fillStyle = '#141c36';
    ctx.fillRect(centerX - halfWidth, FLOOR_Y - 6, halfWidth * 2, 8);
    ctx.fillStyle = active ? color : '#2a3350';
    ctx.fillRect(centerX - halfWidth, FLOOR_Y - 6, halfWidth * 2, 2);

    if (!active) return;

    // A soft cone of light rising from the pad, with motes drifting up it.
    const cone = ctx.createLinearGradient(0, FLOOR_Y, 0, FLOOR_Y - 190);
    cone.addColorStop(0, hexAlpha(color, 0.38));
    cone.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(centerX - halfWidth + 6, FLOOR_Y - 6);
    ctx.lineTo(centerX + halfWidth - 6, FLOOR_Y - 6);
    ctx.lineTo(centerX + halfWidth - 26, FLOOR_Y - 190);
    ctx.lineTo(centerX - halfWidth + 26, FLOOR_Y - 190);
    ctx.fill();

    for (let i = 0; i < 7; i++) {
      const phase = (this.clock * 0.5 + i / 7) % 1;
      const moteX = centerX + Math.sin(i * 12.9 + this.clock) * (halfWidth - 24);
      ctx.fillStyle = hexAlpha(color, 0.8 * (1 - phase));
      ctx.fillRect(moteX, FLOOR_Y - 10 - phase * 150, 2, 2);
    }

    const ring = 0.5 + 0.5 * Math.sin(this.clock * 3);
    ctx.strokeStyle = hexAlpha(color, 0.35 + 0.4 * ring);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(centerX, FLOOR_Y - 6, halfWidth - 8, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawAvatar(ctx: CanvasRenderingContext2D, now: number): void {
    const name = this.currentFrameName();
    const image = this.images.get(name);
    if (!image) return;

    const index = AVATAR_FRAMES.indexOf(name.replace(/L$/, '')) * 2 + (name.endsWith('L') ? 1 : 0);
    const baked = this.neon.actor(index, image, 'local', this.look ?? undefined);
    const source: CanvasImageSource | undefined = baked?.source ?? (image.complete && image.naturalWidth > 0 ? image : undefined);
    if (!source) return;

    const pad = baked?.pad ?? 0;
    const { avatar } = this;
    const beam = this.beaming ? Math.min((now - this.beaming.startedAt) / BEAM_MS, 1) : 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(avatar.x, avatar.y);
    ctx.scale(AVATAR_SCALE * (1 - 0.85 * beam), AVATAR_SCALE * (1 + 1.6 * beam));
    ctx.globalAlpha = 1 - beam;
    ctx.drawImage(source, -SPRITE_WIDTH / 2 - pad, -SPRITE_HEIGHT - pad);
    ctx.restore();

    if (this.beaming) {
      this.drawBeam(ctx, avatar.x, PADS[this.beaming.pad].color, beam);
    } else {
      this.drawNameTag(ctx, avatar.x, avatar.y - SPRITE_HEIGHT * AVATAR_SCALE - 10);
    }
  }

  private drawBeam(ctx: CanvasRenderingContext2D, x: number, color: string, progress: number): void {
    const strength = Math.sin(Math.min(progress * 1.3, 1) * Math.PI);
    const halfWidth = 38 * (1 - progress * 0.4);
    const beam = ctx.createLinearGradient(x - halfWidth, 0, x + halfWidth, 0);
    beam.addColorStop(0, hexAlpha(color, 0));
    beam.addColorStop(0.5, hexAlpha('#ffffff', 0.9 * strength));
    beam.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = beam;
    ctx.fillRect(x - halfWidth, 28, halfWidth * 2, FLOOR_Y - 28);

    if (Math.random() < 0.8) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 70, y: FLOOR_Y - 10, vy: -(120 + Math.random() * 260), life: 0.5, color });
    }
  }

  private drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.name) return;

    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillStyle = '#00f6ff';
    ctx.strokeText(this.name, x, y);
    ctx.fillText(this.name, x, y);
    ctx.textAlign = 'start';
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.fillStyle = hexAlpha(p.color, Math.min(p.life * 2, 1));
      ctx.fillRect(p.x, p.y, 3, 3);
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const vignette = ctx.createRadialGradient(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, ROOM_HEIGHT * 0.45, ROOM_WIDTH / 2, ROOM_HEIGHT / 2, ROOM_WIDTH * 0.62);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 8, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
  }
}

export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
