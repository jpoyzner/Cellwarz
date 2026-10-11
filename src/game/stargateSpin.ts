/** The corner stargates turn continuously on the client, on top of the server's slow swirl frames. Purely cosmetic. */
export const STARGATE_SPIN_PERIOD_MS = 4000;

export function isStargatePath(path: string): boolean {
  return path.includes('/doors/stargate/');
}

/** Rotation (radians) of a stargate at `nowMs`; one full turn every STARGATE_SPIN_PERIOD_MS. */
export function stargateAngle(nowMs: number): number {
  return ((nowMs % STARGATE_SPIN_PERIOD_MS) / STARGATE_SPIN_PERIOD_MS) * Math.PI * 2;
}
