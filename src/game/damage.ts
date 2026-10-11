/** Wire key of an avatar's remaining health percent (sent only while it is below 100); mirrors server/jsonGenerator.ts. */
export const HEALTH_KEY = '4';

// Each rocket or ninja star takes this much off, so an avatar looks one of five ways: unhurt, or 1-4 hits taken (a fifth hit is a death).
const HIT_PERCENT = 20;
export const MAX_DAMAGE_STAGE = 4;

/** How hurt an avatar looks, from 0 (100% health) to 4 (20% health). */
export function damageStage(health: number): number {
  return Math.max(0, Math.min(MAX_DAMAGE_STAGE, Math.round((100 - health) / HIT_PERCENT)));
}
