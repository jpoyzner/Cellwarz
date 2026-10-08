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

    audio.play('jump');

    expect(audio.isAmbientPlaying).toBe(true);
  });

  it('stops while paused, and sound effects do not bring it back', () => {
    const audio = new AudioManager();
    audio.play('jump');

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

    audio.play('jump');
    audio.setAmbientPaused(true);
    audio.setAmbientPaused(false);
    expect(audio.isAmbientPlaying).toBe(true);
  });

  it('stays off when un-pausing while muted', () => {
    const audio = new AudioManager();
    audio.play('jump');
    audio.setMuted(true);

    audio.setAmbientPaused(false);

    expect(audio.isAmbientPlaying).toBe(false);
  });
});
