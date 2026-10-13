import { afterEach, describe, expect, it, vi } from 'vitest';
import { digitOfKey, EMOJI_BUBBLE_FRAMES, NUMBER_EMOJIS, ROBOT_SPOTTED_EMOJI } from '../emoji';
import { getSprites } from '../jsonGenerator';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Diamond } from '../sprite/diamond';
import { Robot } from '../sprite/robot';
import { UI } from '../ui';
import { createTestCell, layFloor, layWall } from './testHelpers';

function createTestScene() {
  const { cell } = createTestCell(120, 50);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  Diamond.init(cellData);
  layFloor(cell, 30, 0, 120);
  return { cell };
}

const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

describe('number-key emoji bubbles', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has a distinct, flag-free emoji for each of the ten digits', () => {
    const emojis = Object.values(NUMBER_EMOJIS);

    expect(Object.keys(NUMBER_EMOJIS).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(new Set(emojis).size).toBe(10);
    expect(emojis).not.toContain(ROBOT_SPOTTED_EMOJI);
    for (const emoji of emojis) expect(emoji).not.toMatch(REGIONAL_INDICATOR);
  });

  it('maps number-row and numpad keys to digits and ignores other keys', () => {
    expect(digitOfKey(48)).toBe(0);
    expect(digitOfKey(57)).toBe(9);
    expect(digitOfKey(96)).toBe(0);
    expect(digitOfKey(105)).toBe(9);
    expect(digitOfKey(32)).toBeUndefined();
    expect(digitOfKey(65)).toBeUndefined();
  });

  it('shows the digit\'s emoji when a number key goes down, and ignores the key release', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('talker', 10, 22, false, cell);
    const ui = new UI(avatar);

    ui.reactTo(49, false);
    expect(avatar.getEmoji()).toBeUndefined();

    ui.reactTo(49, true);
    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[1]);

    ui.reactTo(100, true); // numpad 4 replaces it.
    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[4]);
  });

  it('pressing the same number again takes the bubble down at once', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('talker', 10, 22, false, cell);
    const ui = new UI(avatar);

    ui.reactTo(51, true);
    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[3]);

    avatar['needsRedraw'](false);
    ui.reactTo(51, true);

    expect(avatar.getEmoji()).toBeUndefined();
    expect(avatar.needsRedraw()).toBe(true); // clients are told the bubble is gone.
    expect(getSprites([avatar], true)[String(avatar.getCellIndex())][3]?.['5']).toBeUndefined();

    ui.reactTo(51, true); // a third press shows it again.
    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[3]);
  });

  it('shows nothing for a sleeping avatar', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('sleeper', 10, 22, false, cell);
    avatar.fallAsleep();

    new UI(avatar).reactTo(49, true);

    expect(avatar.getEmoji()).toBeUndefined();
  });

  it('keeps the bubble for 5 seconds, then announces its end with one more redraw', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('talker', 10, 22, false, cell);
    avatar.showEmoji(NUMBER_EMOJIS[5]);
    expect(EMOJI_BUBBLE_FRAMES).toBe(240);

    for (let i = 0; i < EMOJI_BUBBLE_FRAMES - 1; i++) avatar.process();
    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[5]);

    avatar.process();
    expect(avatar.getEmoji()).toBeUndefined();
    expect(avatar.needsRedraw()).toBe(true);
  });

  it('pressing another number restarts the 5 seconds', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('talker', 10, 22, false, cell);
    avatar.showEmoji(NUMBER_EMOJIS[1]);
    for (let i = 0; i < EMOJI_BUBBLE_FRAMES - 10; i++) avatar.process();

    avatar.showEmoji(NUMBER_EMOJIS[2]);
    for (let i = 0; i < 100; i++) avatar.process();

    expect(avatar.getEmoji()).toBe(NUMBER_EMOJIS[2]);
  });

  it('rides in the sprite entry\'s extra info (key 5) only while it is up', () => {
    const { cell } = createTestScene();
    const avatar = new Avatar('talker', 10, 22, false, cell);

    const entry = () => getSprites([avatar], true)[String(avatar.getCellIndex())] as [number, number, number, Record<string, unknown>?];
    expect(entry()[3]?.['5']).toBeUndefined();

    avatar.showEmoji(NUMBER_EMOJIS[3]);
    expect(entry()[3]?.['5']).toBe(NUMBER_EMOJIS[3]);
    expect(getSprites([avatar], false)[String(avatar.getCellIndex())][3]).toMatchObject({ '5': NUMBER_EMOJIS[3] });
  });
});

describe('robot skull on first sighting', () => {
  function createRobotScene() {
    const { cell } = createTestScene();
    const robot = new Robot(10, 22, false, cell);
    robot.stopRunning(); // stand still so the scene stays put.
    return { cell, robot };
  }

  it('shows a skull the first time it sees a player, and not again for the same player', () => {
    const { cell, robot } = createRobotScene();
    new Avatar('victim', 28, 22, false, cell); // inside the rocket's minimum range, so only sight is exercised.

    robot.process();
    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);

    for (let i = 0; i < EMOJI_BUBBLE_FRAMES + 5; i++) robot.process();
    expect(robot.getEmoji()).toBeUndefined();
    for (let i = 0; i < 20; i++) robot.process();
    expect(robot.getEmoji()).toBeUndefined();
  });

  it('shows the skull again for a different player', () => {
    const { cell, robot } = createRobotScene();
    new Avatar('first', 28, 22, false, cell);
    robot.process();
    for (let i = 0; i < EMOJI_BUBBLE_FRAMES + 5; i++) robot.process();
    expect(robot.getEmoji()).toBeUndefined();

    new Avatar('second', 32, 22, false, cell);
    robot.process();

    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);
  });

  it('does not notice a player who is too far away or behind a wall', () => {
    const { cell, robot } = createRobotScene();
    new Avatar('far', 105, 22, false, cell);
    robot.process();
    expect(robot.getEmoji()).toBeUndefined();

    layWall(cell, 20, 8, 30);
    new Avatar('hidden', 28, 22, false, cell);
    robot.process();
    expect(robot.getEmoji()).toBeUndefined();
  });

  it('does not react to other robots', () => {
    const { cell, robot } = createRobotScene();
    new Robot(28, 22, false, cell);

    robot.process();

    expect(robot.getEmoji()).toBeUndefined();
  });
});

describe('robots reacting to deaths', () => {
  function createDeathScene() {
    const { cell } = createTestScene();
    const robot = new Robot(10, 22, false, cell);
    robot.stopRunning();
    return { cell, robot };
  }

  const diamondsIn = (cell: ReturnType<typeof createTestScene>['cell']) =>
    [...cell.getCellData().getSprites()].filter((sprite): sprite is Diamond => sprite instanceof Diamond);

  it('shows a skull when a player dies close by, even through a wall', () => {
    const { cell, robot } = createDeathScene();
    layWall(cell, 20, 8, 30);
    const victim = new Avatar('victim', 28, 22, false, cell);

    victim.die();

    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);
  });

  it('shows a skull when it can see a player die from farther off, but not through a wall or out of sight range', () => {
    const { cell, robot } = createDeathScene();
    new Avatar('visible', 60, 22, false, cell).die();
    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);

    robot.clearEmoji();
    new Avatar('far', 105, 22, false, cell).die();
    expect(robot.getEmoji()).toBeUndefined();

    layWall(cell, 20, 8, 30);
    new Avatar('hidden', 50, 22, false, cell).die();
    expect(robot.getEmoji()).toBeUndefined();
  });

  it('makes every robot that is close or sees it show a skull, and no others', () => {
    const { cell, robot } = createDeathScene();
    const other = new Robot(36, 22, false, cell);
    const distant = new Robot(115, 22, false, cell);
    const victim = new Avatar('victim', 28, 22, false, cell);

    victim.die();

    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);
    expect(other.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);
    expect(distant.getEmoji()).toBeUndefined();
  });

  it('shows a skull when it assimilates a player', () => {
    const { cell, robot } = createDeathScene();
    const victim = new Avatar('borged', 15, 22, false, cell); // touching the robot.

    robot.process();

    expect(victim.removed()).toBe(true);
    expect(robot.getEmoji()).toBe(ROBOT_SPOTTED_EMOJI);
  });

  it('does not react to another robot being destroyed', () => {
    const { cell, robot } = createDeathScene();
    new Robot(28, 22, false, cell).die();

    expect(robot.getEmoji()).toBeUndefined();
  });

  it('leaves 50 diamonds behind, fanned out both ways, when a robot is killed', () => {
    const { cell, robot } = createDeathScene();

    robot.die();

    const diamonds = diamondsIn(cell);
    expect(robot.removed()).toBe(true);
    expect(diamonds).toHaveLength(50);
    const speeds = diamonds.map((diamond) => diamond['vx'] as number);
    expect(Math.min(...speeds)).toBeLessThan(-1);
    expect(Math.max(...speeds)).toBeGreaterThan(1);
    expect(new Set(diamonds.map((diamond) => diamond['vy'])).size).toBeGreaterThan(10);
  });

  it('leaves no diamonds when a planet swallows a robot, or when a player dies', () => {
    const { cell, robot } = createDeathScene();

    robot.onConsumed();
    new Avatar('player', 60, 22, false, cell).die();

    expect(robot.removed()).toBe(true);
    expect(diamondsIn(cell)).toHaveLength(0);
  });
});
