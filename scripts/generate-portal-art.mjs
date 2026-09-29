// Procedurally generates the animated stargate (warp portal) and small floating spawn portal art.
// Run with: node scripts/generate-portal-art.mjs
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_ROOT = join(__dirname, '..', 'public', 'images', 'doors');

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function setPixel(png, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function writePng(png, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

const CHEVRON_COUNT = 8;

/** The animated stargate warp door: a metallic ring with static gold chevrons around a swirling event horizon. */
function generateStargateFrame(size, frameIndex, totalFrames) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 1;
  const ringInner = outerRadius - size * 0.16;
  const rotation = (frameIndex / totalFrames) * Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > outerRadius) {
        setPixel(png, x, y, 0, 0, 0, 0);
        continue;
      }

      const angle = Math.atan2(dy, dx);

      if (dist > ringInner) {
        // Metallic ring, darker at the very rim for a beveled look.
        const rimShade = clamp(1 - (dist - ringInner) / (outerRadius - ringInner), 0, 1);
        let r = mix(60, 130, rimShade);
        let g = mix(64, 138, rimShade);
        let b = mix(72, 150, rimShade);

        const chevronWidth = (Math.PI * 2) / CHEVRON_COUNT / 3;
        const nearestChevron = Math.round(angle / ((Math.PI * 2) / CHEVRON_COUNT)) * ((Math.PI * 2) / CHEVRON_COUNT);
        if (Math.abs(angle - nearestChevron) < chevronWidth) {
          r = mix(r, 235, 0.85);
          g = mix(g, 185, 0.85);
          b = mix(b, 60, 0.85);
        }

        setPixel(png, x, y, r, g, b, 255);
        continue;
      }

      // Event horizon: a rotating spiral swirl fading toward a bright core.
      const normDist = dist / ringInner;
      const spiral = Math.sin(angle * 3 + rotation * 2 - normDist * 6);
      const core = clamp(1 - normDist, 0, 1);
      const swirl = clamp((spiral + 1) / 2, 0, 1) * (1 - core * 0.4) + core * 0.6;

      const r = mix(18, 200, swirl * 0.5 + core * 0.5);
      const g = mix(30, 225, swirl * 0.6 + core * 0.4);
      const b = mix(80, 255, swirl * 0.7 + core * 0.3);

      setPixel(png, x, y, r, g, b, 255);
    }
  }

  return png;
}

/** The small floating spawn portal: a pulsing circular glow avatars are deposited at/from. */
function generateSpawnPortalFrame(size, frameIndex, totalFrames) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const pulse = 0.5 + 0.5 * Math.sin((frameIndex / totalFrames) * Math.PI * 2);
  const coreRadius = size * (0.22 + 0.06 * pulse);
  const glowRadius = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > glowRadius) {
        setPixel(png, x, y, 0, 0, 0, 0);
        continue;
      }

      if (dist <= coreRadius) {
        const t = clamp(1 - dist / coreRadius, 0, 1);
        const r = mix(120, 235, t);
        const g = mix(220, 245, t);
        const b = mix(255, 255, t);
        setPixel(png, x, y, r, g, b, 255);
        continue;
      }

      const glowT = clamp(1 - (dist - coreRadius) / (glowRadius - coreRadius), 0, 1);
      const alpha = Math.round(255 * glowT * (0.55 + 0.35 * pulse));
      setPixel(png, x, y, 70, 200, 235, alpha);
    }
  }

  return png;
}

const STARGATE_SIZE = 64;
const STARGATE_FRAMES = 8;
for (let i = 0; i < STARGATE_FRAMES; i++) {
  const png = generateStargateFrame(STARGATE_SIZE, i, STARGATE_FRAMES);
  writePng(png, join(IMAGES_ROOT, 'stargate', `idle${i + 1}.png`));
}

const SPAWN_PORTAL_SIZE = 32;
const SPAWN_PORTAL_FRAMES = 6;
for (let i = 0; i < SPAWN_PORTAL_FRAMES; i++) {
  const png = generateSpawnPortalFrame(SPAWN_PORTAL_SIZE, i, SPAWN_PORTAL_FRAMES);
  writePng(png, join(IMAGES_ROOT, 'entrance', `idle${i + 1}.png`));
}

console.log(`Wrote ${STARGATE_FRAMES} stargate frames and ${SPAWN_PORTAL_FRAMES} spawn portal frames.`);
