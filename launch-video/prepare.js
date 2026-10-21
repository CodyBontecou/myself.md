import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNarration } from './narration.js';
import { createSoundtrack } from './soundtrack.js';

/** Stage retained rendering inputs and regenerate audio outside tracked source. */
export async function prepareLaunchVideo() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const output = path.resolve(root, '../.local/launch-video');
  const publicDirectory = path.join(output, 'public');
  await mkdir(publicDirectory, { recursive: true });
  await cp(path.join(root, 'public'), publicDirectory, { recursive: true });
  const narration = await createNarration(publicDirectory, output);
  await createSoundtrack(publicDirectory, narration);
  return { root, output, publicDirectory };
}
