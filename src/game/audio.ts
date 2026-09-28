export type SoundName =
  | 'run'
  | 'jump'
  | 'land'
  | 'manaPickup'
  | 'manaDrop'
  | 'toolActivate'
  | 'missileImpact'
  | 'portalWarp'
  | 'death';

interface SoundPreset {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  sweepTo?: number;
}

// No audio assets exist in public/images (art-only) — these are tiny synthesized WebAudio blips instead of
// sample playback, so there's nothing to fetch/load and no binary assets to add to the repo.
const PRESETS: Record<SoundName, SoundPreset> = {
  run: { frequency: 180, duration: 0.05, type: 'square', gain: 0.05 },
  jump: { frequency: 260, duration: 0.15, type: 'square', gain: 0.08, sweepTo: 420 },
  land: { frequency: 160, duration: 0.1, type: 'square', gain: 0.08, sweepTo: 80 },
  manaPickup: { frequency: 660, duration: 0.12, type: 'triangle', gain: 0.08 },
  manaDrop: { frequency: 220, duration: 0.1, type: 'triangle', gain: 0.06 },
  toolActivate: { frequency: 500, duration: 0.08, type: 'sawtooth', gain: 0.07 },
  missileImpact: { frequency: 110, duration: 0.25, type: 'square', gain: 0.12, sweepTo: 40 },
  portalWarp: { frequency: 440, duration: 0.3, type: 'sine', gain: 0.08, sweepTo: 880 },
  death: { frequency: 320, duration: 0.4, type: 'sawtooth', gain: 0.1, sweepTo: 60 },
};

// Repeated sounds (footsteps in particular) are throttled per-name so they can't turn into a buzzing tone.
const MIN_GAP_SECONDS: Partial<Record<SoundName, number>> = {
  run: 0.14,
  toolActivate: 0.15,
};
const DEFAULT_MIN_GAP_SECONDS = 0.03;

interface LegacyWindow {
  webkitAudioContext?: typeof AudioContext;
}

/** Lightweight synthesized sound effects — purely additive game feel, no gameplay effect. */
export class AudioManager {
  private ctx: AudioContext | undefined;
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  play(name: SoundName): void {
    if (this.muted) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const minGap = MIN_GAP_SECONDS[name] ?? DEFAULT_MIN_GAP_SECONDS;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < minGap) return;
    this.lastPlayed.set(name, now);

    const preset = PRESETS[name];
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    if (preset.sweepTo) {
      oscillator.frequency.exponentialRampToValueAtTime(preset.sweepTo, now + preset.duration);
    }

    gainNode.gain.setValueAtTime(preset.gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration);
  }

  private ensureContext(): AudioContext | undefined {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    }

    const Ctor = window.AudioContext ?? (window as unknown as LegacyWindow).webkitAudioContext;
    if (!Ctor) return undefined;

    this.ctx = new Ctor();
    return this.ctx;
  }
}
