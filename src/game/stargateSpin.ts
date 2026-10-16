/** The stargate sprites are drawn as transporter pads (see transporterPad.ts), not as their server art. */
export function isStargatePath(path: string): boolean {
  return path.includes('/doors/stargate/');
}
