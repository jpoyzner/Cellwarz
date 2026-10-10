import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_MS, Recorder } from '../recorder';
import type { Recording } from '../recorder';

describe('Recorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600 });
    vi.stubGlobal('navigator', { userAgent: 'vitest' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const state = { sprites: { '1': [0, 10, 20] } as Record<string, number[]> };
    const finished: Recording[] = [];
    const changes: Array<number | null> = [];
    const recorder = new Recorder({
      login: 'tester',
      snapshot: () => state,
      onFinished: (recording) => finished.push(recording),
      onChange: (remaining) => changes.push(remaining),
    });
    return { recorder, state, finished, changes };
  }

  it('logs nothing until started', () => {
    const { recorder, finished } = setup();
    recorder.logKey(37, true);
    recorder.logMessage({ '1': [0, 1, 2] });
    recorder.start();
    recorder.stop('manual');

    expect(finished[0].events).toEqual([]);
  });

  it('captures the starting state, then messages and key presses in order with timestamps', () => {
    const { recorder, state, finished } = setup();
    recorder.start();
    state.sprites['1'] = [0, 99, 99]; // later changes must not leak into the starting state

    vi.advanceTimersByTime(500);
    recorder.logKey(39, true);
    vi.advanceTimersByTime(500);
    recorder.logMessage({ '1': [0, 12, 20] });
    recorder.toggle();

    expect(finished).toHaveLength(1);
    const [recording] = finished;
    expect(recording.login).toBe('tester');
    expect(recording.stoppedBy).toBe('manual');
    expect(recording.viewport).toEqual({ width: 800, height: 600 });
    expect(recording.initial).toEqual({ sprites: { '1': [0, 10, 20] } });
    expect(recording.events.map((event) => event.type)).toEqual(['key', 'message']);
    expect(recording.events[0]).toMatchObject({ key: 39, down: true });
    expect(recording.events[0].t).toBeGreaterThanOrEqual(500);
    expect(recording.events[1].t).toBeGreaterThanOrEqual(1000);
  });

  it('copies messages so later mutation of the original does not change the recording', () => {
    const { recorder, finished } = setup();
    const message = { sprites: { '1': [0, 1, 2] } };
    recorder.start();
    recorder.logMessage(message);
    message.sprites['1'][1] = 500;
    recorder.stop('manual');

    expect(finished[0].events[0]).toMatchObject({ data: { sprites: { '1': [0, 1, 2] } } });
  });

  it('stops by itself after 10 seconds', () => {
    const { recorder, finished, changes } = setup();
    recorder.start();
    vi.advanceTimersByTime(MAX_RECORDING_MS - 200);
    expect(recorder.isRecording).toBe(true);

    vi.advanceTimersByTime(500);
    expect(recorder.isRecording).toBe(false);
    expect(finished).toHaveLength(1);
    expect(finished[0].stoppedBy).toBe('timeout');
    expect(finished[0].durationMs).toBeLessThanOrEqual(MAX_RECORDING_MS);
    expect(changes[0]).toBe(MAX_RECORDING_MS);
    expect(changes.at(-1)).toBeNull();

    recorder.logKey(37, true);
    vi.advanceTimersByTime(1000);
    expect(finished).toHaveLength(1);
  });

  it('starts a fresh recording each time (nothing carried over from the previous one)', () => {
    const { recorder, finished } = setup();
    recorder.start();
    recorder.logKey(37, true);
    recorder.stop('manual');

    recorder.start();
    recorder.stop('manual');
    expect(finished[1].events).toEqual([]);
  });
});
