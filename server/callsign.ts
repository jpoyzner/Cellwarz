export const MAX_CALLSIGN_LENGTH = 32;

// Letters and numbers (any language), with single spaces, dots, dashes, underscores and apostrophes between them.
const CALLSIGN_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.'-]*[\p{L}\p{N}])?$/u;

/** Case and punctuation don't make a callsign different from a reserved one ("DJ_Recognize" is "djrecognize"). */
export function normalizeCallsign(login: string): string {
  return login.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export type CallsignCheck = { ok: true; login: string } | { ok: false; reason: 'invalid' | 'reserved' };

/**
 * Whether a client-supplied callsign is acceptable. It must be exactly what the client typed (the server never trims it:
 * the client keys its sprites by the same string), so stray spaces are refused rather than silently changed.
 * `existing` callsigns already on the books skip the reserved-name rule (their owner claimed them before it applied).
 */
export function checkCallsign(value: unknown, reserved: readonly string[], existing = false): CallsignCheck {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CALLSIGN_LENGTH) return { ok: false, reason: 'invalid' };
  if (!CALLSIGN_PATTERN.test(value) || /  /.test(value)) return { ok: false, reason: 'invalid' };
  if (!existing && reserved.includes(normalizeCallsign(value))) return { ok: false, reason: 'reserved' };
  return { ok: true, login: value };
}
