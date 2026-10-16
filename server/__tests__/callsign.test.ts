import { describe, expect, it } from 'vitest';
import { checkCallsign, MAX_CALLSIGN_LENGTH, normalizeCallsign } from '../callsign';
import { DEFAULT_RESERVED_NAMES } from '../config';

const reserved = DEFAULT_RESERVED_NAMES;

describe('checkCallsign', () => {
  it('accepts ordinary callsigns, including other languages and inner punctuation', () => {
    for (const name of ['Neo', 'DJ Fresh', "O'Brien", 'ninja_42', 'a-b.c', 'Дмитрий', '忍者', 'x']) {
      expect(checkCallsign(name, reserved)).toEqual({ ok: true, login: name });
    }
  });

  it('refuses non-strings, empty and over-long callsigns', () => {
    for (const value of [undefined, null, 5, {}, [], '', 'x'.repeat(MAX_CALLSIGN_LENGTH + 1)]) {
      expect(checkCallsign(value, reserved)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(checkCallsign('x'.repeat(MAX_CALLSIGN_LENGTH), reserved).ok).toBe(true);
  });

  it('refuses stray spaces, control characters, markup and other symbols', () => {
    for (const name of [' lead', 'trail ', 'two  spaces', 'tab\there', 'new\nline', '<b>hi</b>', 'a;b', '_start', 'end-', 'emoji\u{1F600}']) {
      expect(checkCallsign(name, reserved)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('reserves look-alikes of reserved names (case and punctuation ignored) unless the callsign already exists', () => {
    for (const name of ['DJ Recognize', 'dj_recognize', 'DJRecognize', 'Admin', 'a.d.m.i.n', 'CyberStation']) {
      expect(checkCallsign(name, reserved)).toEqual({ ok: false, reason: 'reserved' });
    }
    expect(checkCallsign('Admin', reserved, true)).toEqual({ ok: true, login: 'Admin' });
    expect(checkCallsign('Admin', [])).toEqual({ ok: true, login: 'Admin' });
  });

  it('normalizes by dropping case and punctuation', () => {
    expect(normalizeCallsign("DJ Re-cog_nize.'")).toBe('djrecognize');
  });
});
