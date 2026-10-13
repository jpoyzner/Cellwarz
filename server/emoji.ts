import { Engine } from './engine';

/** How long an emoji speech bubble stays over an avatar's head. */
export const EMOJI_BUBBLE_FRAMES = Engine.EVERY_SECOND * 5;

/** What a robot shows the first time it spots a given player. */
export const ROBOT_SPOTTED_EMOJI = '💀';

// Number-row emoji, keyed by the digit pressed. Deliberately no flags and nothing political; the skull is the robots' alone.
export const NUMBER_EMOJIS: Record<number, string> = {
  1: '👋', // hello / goodbye
  2: '👍', // yes / OK
  3: '😂', // laughing
  4: '😮', // whoa
  5: '🔥', // nice one
  6: '❤️', // love / thanks
  7: '😈', // taunt
  8: '🤔', // hmm? / confused
  9: '🆘', // help
  0: '😴', // brb / zzz
};

const DIGIT_0_KEY = 48;
const DIGIT_9_KEY = 57;
const NUMPAD_0_KEY = 96;
const NUMPAD_9_KEY = 105;

/** The digit a key code stands for (number row or numpad), or undefined for any other key. */
export function digitOfKey(key: number): number | undefined {
  if (key >= DIGIT_0_KEY && key <= DIGIT_9_KEY) return key - DIGIT_0_KEY;
  if (key >= NUMPAD_0_KEY && key <= NUMPAD_9_KEY) return key - NUMPAD_0_KEY;
  return undefined;
}
