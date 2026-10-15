import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A 10-second Black Box is a few MB at most (it holds two full dumps of the room's sprites); anything bigger isn't genuine. */
export const MAX_BLACK_BOX_BYTES = 25 * 1024 * 1024;
export const LATEST_BLACK_BOX_FILE = 'latest.json';

export function blackBoxDir(): string {
  return process.env.CELLWARZ_BLACK_BOX_DIR ?? path.join(process.cwd(), 'black-box');
}

/** The Black Box (backtick key in-game): a single fixed file, overwritten each time, so only the latest is ever kept. */
export async function saveLatestBlackBox(blackBox: unknown): Promise<string | undefined> {
  const json = JSON.stringify(blackBox);
  if (json === undefined || Buffer.byteLength(json) > MAX_BLACK_BOX_BYTES) return undefined;

  const dir = blackBoxDir();
  const target = path.join(dir, LATEST_BLACK_BOX_FILE);
  const temp = `${target}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  // Written aside and renamed so a reader never sees a half-written file.
  await writeFile(temp, json);
  await rename(temp, target);
  return target;
}
