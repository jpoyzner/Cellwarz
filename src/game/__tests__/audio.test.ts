import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../audio';

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class FakeNode {
  connect(): void {}
  start(): void {}
  stop(): void {}
  frequency = new FakeParam();
  gain = new FakeParam();
}

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  sampleRate = 8000;
  createOscillator = () => new FakeNode();
  createGain = () => new FakeNode();
  createBiquadFilter = () => new FakeNode();
  createWaveShaper = () => new FakeNode();
  createBufferSource = () => new FakeNode();
  createBuffer = () => ({ getChannelData: () => new Float32Array(10) });
  resume = async () => undefined;
  close = async () => undefined;
}

describe('AudioManager ambient music', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { AudioContext: FakeAudioContext, setInterval, clearInterval });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts with the first sound', () => {
    const audio = new AudioManager();
    expect(audio.isAmbientPlaying).toBe(false);

    audio.play('manaPickup');

    expect(audio.isAmbientPlaying).toBe(true);
  });

  it('can be started without waiting for a sound effect, and stays off while paused or muted', () => {
    const audio = new AudioManager();
    audio.startMusic();
    expect(audio.isAmbientPlaying).toBe(true);

    const paused = new AudioManager();
    paused.setAmbientPaused(true);
    paused.startMusic();
    expect(paused.isAmbientPlaying).toBe(false);

    const muted = new AudioManager();
    muted.setMuted(true);
    muted.startMusic();
    expect(muted.isAmbientPlaying).toBe(false);
  });

  it('stops while paused, and sound effects do not bring it back', () => {
    const audio = new AudioManager();
    audio.play('manaPickup');

    audio.setAmbientPaused(true);
    expect(audio.isAmbientPlaying).toBe(false);

    audio.play('land');
    audio.play('manaPickup');
    expect(audio.isAmbientPlaying).toBe(false);
  });

  it('comes back when un-paused, but only once sound had already started', () => {
    const audio = new AudioManager();
    audio.setAmbientPaused(true);
    audio.setAmbientPaused(false);
    expect(audio.isAmbientPlaying).toBe(false); // nothing played yet, so no audio context to resume

    audio.play('manaPickup');
    audio.setAmbientPaused(true);
    audio.setAmbientPaused(false);
    expect(audio.isAmbientPlaying).toBe(true);
  });

  it('stays off when un-pausing while muted', () => {
    const audio = new AudioManager();
    audio.play('manaPickup');
    audio.setMuted(true);

    audio.setAmbientPaused(false);

    expect(audio.isAmbientPlaying).toBe(false);
  });
});

describe('unlockAudioSession (phones keep sound off until a tap)', () => {
  class SuspendedContext extends FakeAudioContext {
    state = 'suspended';
    resumed = 0;
    resume = async (): Promise<undefined> => {
      this.resumed++;
      this.state = 'running';
      return undefined;
    };
  }

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function freshAudio() {
    vi.resetModules();
    return import('../audio');
  }

  it('creates the page-wide context and resumes it, so the game can start music later without another tap', async () => {
    vi.stubGlobal('window', { AudioContext: SuspendedContext, setInterval, clearInterval });
    vi.stubGlobal('navigator', {});
    const { AudioManager: Manager, unlockAudioSession } = await freshAudio();

    expect(await unlockAudioSession()).toBe(true);
    expect(await unlockAudioSession()).toBe(true);

    const audio = new Manager();
    audio.play('manaPickup');
    expect(audio.isAmbientPlaying).toBe(true);
    audio.dispose(); // must not close the shared context
    const again = new Manager();
    again.play('manaPickup');
    expect(again.isAmbientPlaying).toBe(true);
  });

  it('puts the page in the "playback" audio mode where the browser supports it, so the iPhone silent switch does not mute it', async () => {
    const audioSession = { type: 'auto' };
    vi.stubGlobal('window', { AudioContext: SuspendedContext });
    vi.stubGlobal('navigator', { audioSession });
    const { unlockAudioSession } = await freshAudio();

    await unlockAudioSession();
    expect(audioSession.type).toBe('playback');
  });

  it('on an iPhone without that API it plays a silent loop instead, once', async () => {
    const plays: string[] = [];
    class FakeAudio {
      loop = false;
      constructor(readonly src: string) {}
      setAttribute(): void {}
      play = async () => {
        plays.push(this.src.slice(0, 15));
      };
    }
    vi.stubGlobal('window', { AudioContext: SuspendedContext });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    vi.stubGlobal('Audio', FakeAudio);
    const { unlockAudioSession } = await freshAudio();

    await unlockAudioSession();
    await unlockAudioSession();
    expect(plays).toEqual(['data:audio/wav;']);
  });

  it('does not play the silent loop on other devices, and never throws when there is no audio support at all', async () => {
    const plays: string[] = [];
    vi.stubGlobal('Audio', class { play = async () => plays.push('x'); });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    vi.stubGlobal('window', {});
    const { unlockAudioSession } = await freshAudio();

    expect(await unlockAudioSession()).toBe(false);
    expect(plays).toEqual([]);
  });

  it('resumes an "interrupted" context (iOS after a call or switching apps) as well as a suspended one', async () => {
    class Interrupted extends SuspendedContext {
      state = 'interrupted';
    }
    vi.stubGlobal('window', { AudioContext: Interrupted, setInterval, clearInterval });
    vi.stubGlobal('navigator', {});
    const { AudioManager: Manager } = await freshAudio();

    const audio = new Manager();
    audio.unlock();
    const ctx = audio['ctx'] as unknown as SuspendedContext;
    expect(ctx.resumed).toBe(1);
  });
});
