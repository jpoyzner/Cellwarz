import { describe, expect, it } from 'vitest';
import { LocalPredictor } from '../prediction';

const RIGHT = 39;
const FRAME_MS = 16;

describe('LocalPredictor', () => {
  it('moves the instant a key is pressed, before the server has reported any movement', () => {
    const predictor = new LocalPredictor();
    predictor.reset(100);
    predictor.setKey(RIGHT, true);

    let x = 100;
    for (let t = 0; t < 48; t += FRAME_MS) x = predictor.getBlendedX(100, FRAME_MS);

    expect(x).toBeGreaterThan(102);
  });

  it('keeps tracking a server position that is moving steadily', () => {
    const predictor = new LocalPredictor();
    predictor.reset(100);
    predictor.setKey(RIGHT, true);

    let x = 100;
    let serverX = 100;
    for (let t = FRAME_MS; t <= 2000; t += FRAME_MS) {
      serverX = 100 + 8 * Math.floor(t / 42);
      x = predictor.getBlendedX(serverX, FRAME_MS);
    }

    expect(Math.abs(x - serverX)).toBeLessThan(16);
  });

  it('stops predicting into a wall: overshoot stays small and settles back on the server position while still held', () => {
    const predictor = new LocalPredictor();
    predictor.reset(100);
    predictor.setKey(RIGHT, true);

    let maxOvershoot = 0;
    let x = 100;
    for (let t = 0; t < 1500; t += FRAME_MS) {
      predictor.setKey(RIGHT, true); // keydown auto-repeat must not buy extra prediction time
      x = predictor.getBlendedX(100, FRAME_MS);
      maxOvershoot = Math.max(maxOvershoot, x - 100);
    }

    expect(maxOvershoot).toBeLessThan(16);
    expect(Math.abs(x - 100)).toBeLessThan(0.5);
  });

  it('resumes predicting once the server starts moving again', () => {
    const predictor = new LocalPredictor();
    predictor.reset(100);
    predictor.setKey(RIGHT, true);
    for (let t = 0; t < 500; t += FRAME_MS) predictor.getBlendedX(100, FRAME_MS);

    predictor.getBlendedX(108, FRAME_MS);
    const before = predictor.getBlendedX(108, FRAME_MS);
    const after = predictor.getBlendedX(108, FRAME_MS);

    expect(after).toBeGreaterThan(before);
  });
});
