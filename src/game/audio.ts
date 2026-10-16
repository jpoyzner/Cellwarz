export type SoundName =
  | 'run'
  | 'land'
  | 'manaPickup'
  | 'manaDrop'
  | 'missileImpact'
  | 'portalWarp'
  | 'death';

interface SoundPreset {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  sweepTo?: number;
  /** Quantizes the waveform to a few levels for a gritty, bitcrushed 8-bit edge. */
  crush?: boolean;
  /** Lowpass cutoff sweep over the sound's duration (a filter "swoosh"). */
  filterFrom?: number;
  filterTo?: number;
  /** Gain of a white-noise burst layered under the tone (impacts, glitches). */
  noise?: number;
}

// No audio assets exist in public/images (art-only) — these are tiny synthesized WebAudio sounds instead of
// sample playback, so there's nothing to fetch/load and no binary assets to add to the repo.
const PRESETS: Record<SoundName, SoundPreset> = {
  run: { frequency: 140, duration: 0.05, type: 'square', gain: 0.04, crush: true },
  land: { frequency: 120, duration: 0.1, type: 'square', gain: 0.08, sweepTo: 50, crush: true },
  manaPickup: { frequency: 880, duration: 0.12, type: 'square', gain: 0.06, sweepTo: 1320, crush: true },
  manaDrop: { frequency: 330, duration: 0.1, type: 'square', gain: 0.05, sweepTo: 165, crush: true },
  missileImpact: { frequency: 150, duration: 0.3, type: 'sawtooth', gain: 0.11, sweepTo: 35, crush: true, noise: 0.08 },
  portalWarp: { frequency: 200, duration: 0.4, type: 'sawtooth', gain: 0.07, sweepTo: 1600, filterFrom: 300, filterTo: 6000 },
  death: { frequency: 400, duration: 0.5, type: 'sawtooth', gain: 0.09, sweepTo: 40, crush: true, noise: 0.1 },
};

// Repeated sounds (footsteps in particular) are throttled per-name so they can't turn into a buzzing tone.
const MIN_GAP_SECONDS: Partial<Record<SoundName, number>> = {
  run: 0.14,
};
const DEFAULT_MIN_GAP_SECONDS = 0.03;

// Quiet synthwave bed: a slowly breathing detuned drone plus a sparse minor-pentatonic arpeggio.
const DRONE_FREQUENCY = 55;
const DRONE_GAIN = 0.035;
const ARPEGGIO_NOTES = [110, 130.81, 164.81, 196, 220, 196, 164.81, 130.81];
const ARPEGGIO_STEP_MS = 240;
const ARPEGGIO_GAIN = 0.012;
const NOISE_SECONDS = 0.5;

interface LegacyWindow {
  webkitAudioContext?: typeof AudioContext;
}

// One audio context for the whole page, created and resumed by the first tap or key press anywhere (see unlockAudioSession), so
// the game's music can start by itself later: a context made outside a tap stays silent on phones.
let sharedContext: AudioContext | undefined;

// A tenth of a second of silence (8-bit mono WAV), played in a loop to move iOS into its "playback" audio mode.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let silentPlayer: HTMLAudioElement | undefined;

interface AudioSessionNavigator {
  audioSession?: { type: string };
  platform?: string;
  maxTouchPoints?: number;
  userAgent?: string;
}

function isIos(nav: AudioSessionNavigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as LegacyWindow).webkitAudioContext;
}

/**
 * Makes sound possible from here on; call it from a tap, click or key press (browsers refuse otherwise). It creates and
 * resumes the shared audio context, and on iPhones it also switches the page to the "playback" audio mode: by default iOS
 * silences Web Audio whenever the ringer switch is on silent, which is why the game's music can be inaudible there.
 * Resolves true once the context is running (so the caller can stop listening for taps).
 */
export async function unlockAudioSession(): Promise<boolean> {
  try {
    const nav = (typeof navigator === 'undefined' ? {} : navigator) as AudioSessionNavigator;
    if (nav.audioSession) {
      nav.audioSession.type = 'playback';
    } else if (isIos(nav) && typeof Audio !== 'undefined' && !silentPlayer) {
      silentPlayer = new Audio(SILENT_WAV);
      silentPlayer.loop = true;
      silentPlayer.setAttribute('playsinline', '');
      await silentPlayer.play().catch(() => {
        silentPlayer = undefined; // not allowed here; the next tap tries again.
      });
    }

    const Ctor = getAudioContextConstructor();
    if (!Ctor) return false;

    sharedContext ??= new Ctor();
    // iOS also reports "interrupted" (after a call or switching apps); that needs a resume just like "suspended".
    if (sharedContext.state !== 'running') await sharedContext.resume();
    return sharedContext.state === 'running';
  } catch {
    return false; // sound is polish; never let it break the page.
  }
}

/** Lightweight synthesized sound effects and ambience — purely additive game feel, no gameplay effect. */
export class AudioManager {
  private ctx: AudioContext | undefined;
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;
  private crushCurve: Float32Array<ArrayBuffer> | undefined;
  private noiseBuffer: AudioBuffer | undefined;
  private ambientNodes: AudioScheduledSourceNode[] = [];
  private arpeggioTimer: number | undefined;
  private arpeggioStep = 0;
  /** Set while the level is frozen (inactivity): the ambient music stays off even if sound effects are triggered. */
  private ambientPaused = false;

  /** Whether the ambient music is currently playing. */
  get isAmbientPlaying(): boolean {
    return this.ambientNodes.length > 0;
  }

  /** Stops the ambient music (e.g. the level froze from inactivity); un-pausing brings it back if sound had started. */
  setAmbientPaused(paused: boolean): void {
    this.ambientPaused = paused;
    if (paused) this.stopAmbient();
    else if (this.ctx && !this.muted) this.startAmbient(this.ctx);
  }

  /** Creates/resumes the audio context; must run inside a tap, or mobile browsers keep it silent. */
  unlock(): void {
    this.ensureContext();
  }

  /**
   * Starts the music bed now rather than with the first sound effect (which, on a phone, only comes once you move). If the
   * browser has not allowed sound yet it begins the moment the first tap does (see unlockAudioSession).
   */
  startMusic(): void {
    if (this.muted || this.ambientPaused) return;

    const ctx = this.ensureContext();
    if (ctx) this.startAmbient(ctx);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopAmbient();
  }

  /** Stops the ambience and releases the audio context (called when leaving the game screen). */
  dispose(): void {
    this.stopAmbient();
    // The page-wide context outlives the game screen (it can't be re-created without another tap).
    if (this.ctx !== sharedContext) void this.ctx?.close();
    this.ctx = undefined;
  }

  play(name: SoundName): void {
    if (this.muted) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.ambientPaused) this.startAmbient(ctx);

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

    let tail: AudioNode = oscillator;
    if (preset.crush) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getCrushCurve();
      tail.connect(shaper);
      tail = shaper;
    }
    if (preset.filterFrom && preset.filterTo) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(preset.filterFrom, now);
      filter.frequency.exponentialRampToValueAtTime(preset.filterTo, now + preset.duration);
      tail.connect(filter);
      tail = filter;
    }

    tail.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration);

    if (preset.noise) this.playNoise(ctx, now, preset.duration, preset.noise);
  }

  private playNoise(ctx: AudioContext, now: number, duration: number, gain: number): void {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration);
  }

  private getCrushCurve(): Float32Array<ArrayBuffer> {
    if (!this.crushCurve) {
      const curve = new Float32Array(256);
      for (let i = 0; i < curve.length; i++) {
        curve[i] = Math.round((i / (curve.length - 1)) * 8 - 4) / 4;
      }
      this.crushCurve = curve;
    }
    return this.crushCurve;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private startAmbient(ctx: AudioContext): void {
    if (this.ambientNodes.length > 0) return;

    const bed = ctx.createGain();
    bed.gain.value = DRONE_GAIN;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    filter.connect(bed);
    bed.connect(ctx.destination);

    const droneA = ctx.createOscillator();
    const droneB = ctx.createOscillator();
    droneA.type = 'sawtooth';
    droneB.type = 'sawtooth';
    droneA.frequency.value = DRONE_FREQUENCY;
    droneB.frequency.value = DRONE_FREQUENCY * 1.007;
    droneA.connect(filter);
    droneB.connect(filter);

    // Slow filter "breathing".
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoDepth.gain.value = 150;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);

    for (const node of [droneA, droneB, lfo]) node.start();
    this.ambientNodes = [droneA, droneB, lfo];

    this.arpeggioTimer = window.setInterval(() => this.playArpeggioNote(ctx), ARPEGGIO_STEP_MS);
  }

  private playArpeggioNote(ctx: AudioContext): void {
    // Leave gaps so it reads as ambience rather than a melody.
    const step = this.arpeggioStep++;
    if (step % 4 === 3) return;

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    oscillator.type = 'square';
    oscillator.frequency.value = ARPEGGIO_NOTES[step % ARPEGGIO_NOTES.length];
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    gainNode.gain.setValueAtTime(ARPEGGIO_GAIN, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  private stopAmbient(): void {
    if (this.arpeggioTimer !== undefined) window.clearInterval(this.arpeggioTimer);
    this.arpeggioTimer = undefined;

    for (const node of this.ambientNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped (e.g. the context was closed).
      }
    }
    this.ambientNodes = [];
  }

  private ensureContext(): AudioContext | undefined {
    this.ctx ??= sharedContext;
    if (this.ctx) {
      if (this.ctx.state !== 'running') {
        void this.ctx.resume().catch(() => undefined);
      }
      return this.ctx;
    }

    const Ctor = getAudioContextConstructor();
    if (!Ctor) return undefined;

    this.ctx = new Ctor();
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined); // works when this runs inside a tap.
    return this.ctx;
  }
}
