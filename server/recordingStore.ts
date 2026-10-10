import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A 10-second recording is a few MB at most; anything bigger isn't a genuine one. */
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
export const LATEST_RECORDING_FILE = 'latest.json';

export function recordingsDir(): string {
  return process.env.CELLWARZ_RECORDINGS_DIR ?? path.join(process.cwd(), 'recordings');
}

/** Debug recordings (backtick key in-game): a single fixed file, overwritten each time, so only the latest is ever kept. */
export async function saveLatestRecording(recording: unknown): Promise<string | undefined> {
  const json = JSON.stringify(recording);
  if (json === undefined || Buffer.byteLength(json) > MAX_RECORDING_BYTES) return undefined;

  const dir = recordingsDir();
  const target = path.join(dir, LATEST_RECORDING_FILE);
  const temp = `${target}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  // Written aside and renamed so a reader never sees a half-written file.
  await writeFile(temp, json);
  await rename(temp, target);
  return target;
}
