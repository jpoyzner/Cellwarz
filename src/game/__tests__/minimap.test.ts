import { describe, expect, it } from 'vitest';
import { classifyImagePaths } from '../minimap';

describe('classifyImagePaths', () => {
  it('classifies wall blocks, avatar/robot art, and everything else', () => {
    const kinds = classifyImagePaths([
      'images/blocks/blockC.png',
      'images/me/stand1.png',
      'images/me/run3.png',
      'images/mana/engine/engine.png',
      'images/doors/stargate/idle1.png',
      'images/projectiles/missile.png',
    ]);

    expect(kinds).toEqual(['wall', 'actor', 'actor', 'other', 'other', 'other']);
  });
});
