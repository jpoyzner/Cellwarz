import { describe, expect, it } from 'vitest';
import { MainRoom } from '../cell/mainRoom';
import { SimpleSmallCell } from '../cell/simpleSmallCell';
import type { World } from '../world';

describe('Cell background', () => {
  it('uses the space backdrop for MainRoom', () => {
    expect(new MainRoom({} as World).getBackground()).toBe('space');
  });

  it('keeps the temple backdrop as the default for other (e.g. randomly generated) rooms', () => {
    expect(new SimpleSmallCell({} as World).getBackground()).toBe('temple');
  });
});
