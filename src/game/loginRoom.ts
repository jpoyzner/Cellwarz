// The login "room": a small ship interior (client-only, nothing here touches the server) where the player walks their
// avatar between three transporters. Standing on a pad and pressing Up uses it (so a pad can be walked past): TELEPORT
// drops a fresh avatar at a random floor spot in the main room; WAKE UP (only present while the typed callsign has a
// living avatar there) re-attaches to it; HOME leaves for the DJ Recognize website.

import { NeonSprites } from './neonSprites';
import type { Look } from './look';
import { drawBeamColumn, drawPadGlow, drawPadPlate, hexAlpha } from './transporterPad';

export { hexAlpha };

export const ROOM_WIDTH = 960;
export const ROOM_HEIGHT = 540;
export const FLOOR_Y = 470;

export type PadId = 'wakeup' | 'teleport' | 'home';

export const PADS: Record<PadId, { centerX: number; halfWidth: number; color: string; label: string }> = {
  home: { centerX: 95, halfWidth: 75, color: '#ff2ea6', label: 'HOME' },
  wakeup: { centerX: 265, halfWidth: 75, color: '#ffae1a', label: 'WAKE UP' },
  teleport: { centerX: 745, halfWidth: 75, color: '#00f6ff', label: 'TELEPORT' },
};

/** The avatar starts in the middle of the room, standing on none of the pads. */
export const START_X = 480;

const AVATAR_SCALE = 2;
const SPRITE_WIDTH = 48;
const SPRITE_HEIGHT = 64;
const RUN_SPEED = 230;
const JUMP_SPEED = 560;
const GRAVITY = 1700;
const WALL_MARGIN = 48;
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
  x = START_X;
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
  /** An Up press that used (or tried to use) a pad is not also a jump; it stays consumed until the key is released. */
  private jumpConsumed = false;
  private beaming: { pad: PadId; startedAt: number } | undefined;
  private beamTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: LoginRoomCallbacks,
    /** An optional transparent canvas stacked above the page's panels: the avatar is drawn there so it passes in front of them. */
    private readonly frontCanvas?: HTMLCanvasElement,
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

  /**
   * A key changed. Pressing Up while standing on a pad uses it instead of jumping; only a fresh press counts, so running
   * across a pad while holding Up (auto-repeat) doesn't fire it.
   */
  setKey(key: keyof RoomInput, down: boolean, repeat = false): void {
    if (key !== 'jump') {
      this.input[key] = down;
      return;
    }

    if (!down) {
      this.jumpConsumed = false;
      this.input.jump = false;
      return;
    }

    if (this.jumpConsumed) return;
    const pad = repeat || this.beaming ? undefined : padAt(this.avatar.x, this.avatar.onGround, this.wakeAvailable);
    if (pad) {
      this.jumpConsumed = true;
      this.input.jump = false;
      this.useTransporter(pad);
      return;
    }

    this.input.jump = true;
  }

  /** Canvas pixels per room pixel (the stage is scaled to fit the window). */
  setScale(scale: number): void {
    this.scale = scale;
    this.canvas.width = Math.round(ROOM_WIDTH * scale);
    this.canvas.height = Math.round(ROOM_HEIGHT * scale);
    if (this.frontCanvas) {
      this.frontCanvas.width = this.canvas.width;
      this.frontCanvas.height = this.canvas.height;
    }
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

  /** Uses a transporter (Up pressed on it, or clicked): beams the avatar up, then hands over to the game. */
  useTransporter(pad: PadId): void {
    if (this.beaming) return;
    if (pad === 'wakeup' && !this.wakeAvailable) return;
    // Leaving for the website needs no callsign.
    if (pad !== 'home' && !this.callbacks.canTransport()) {
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
    if (!this.frontCanvas) this.drawActor(ctx, now);

    ctx.restore();
    this.drawVignette(ctx);

    const frontCtx = this.frontCanvas?.getContext('2d');
    if (!frontCtx) return;

    frontCtx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    frontCtx.clearRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    frontCtx.translate(shakeX, shakeY);
    this.drawActor(frontCtx, now);
  }

  private drawActor(ctx: CanvasRenderingContext2D, now: number): void {
    this.drawAvatar(ctx, now);
    this.drawParticles(ctx);
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
    const active = id !== 'wakeup' || this.wakeAvailable;
    const shape = { centerX, floorY: FLOOR_Y, halfWidth, coneHeight: 190, color };

    drawPadPlate(ctx, shape, active);
    if (active) drawPadGlow(ctx, shape, this.clock);
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
    drawBeamColumn(ctx, x, FLOOR_Y, FLOOR_Y - 28, 38, color, progress);

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
