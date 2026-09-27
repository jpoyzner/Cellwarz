import type { CellData } from '../cellData';
import { Frame } from '../frame';

/** A json list of sprites keyed by frame index; extra info attaches per-sprite to keep frequent redraws lightweight. */
export function addClippedAction(
  cellData: CellData,
  action: string,
  path: string,
  numFrames: number,
  topClip: number,
  rightClip: number,
  bottomClip: number,
  leftClip: number,
  mirror: boolean,
  actionFrames: Map<string, Frame[]>,
): void {
  const frames: Frame[] = [];
  for (let i = 0; i < numFrames; i++) {
    const suffix = (numFrames === 1 ? '' : String(i + 1)) + (mirror ? 'L' : '');
    frames.push(new Frame(cellData.addImage(path + suffix), topClip, rightClip, bottomClip, leftClip));
  }
  actionFrames.set(action, frames);
}

export function addAction(
  cellData: CellData,
  action: string,
  path: string,
  numFrames: number,
  mirror: boolean,
  actionFrames: Map<string, Frame[]>,
): void {
  addClippedAction(cellData, action, path, numFrames, 0, 0, 0, 0, mirror, actionFrames);
}

export function addActions(cellData: CellData, action: string, path: string, numFrames: number, actionFrames: Map<string, Frame[]>): void {
  addAction(cellData, action, path, numFrames, false, actionFrames);
}

export function addImage(cellData: CellData, path: string): number {
  return cellData.addImage(path);
}
