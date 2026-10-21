import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { prepareLaunchVideo } from './prepare.js';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const { root, output, publicDirectory } = await prepareLaunchVideo();
const alignment = JSON.parse(await readFile(path.join(root, 'public/word-cues.json'), 'utf8'));
assert.equal(
  alignment.audioSha256,
  createHash('sha256')
    .update(await readFile(path.join(publicDirectory, 'narration.wav')))
    .digest('hex'),
  'Narration changed: regenerate word cues with scripts/align-launch-captions.js.',
);
const serveUrl = await bundle({
  entryPoint: path.join(root, 'index.js'),
  publicDir: publicDirectory,
});
const composition = await selectComposition({ serveUrl, id: 'MyselfLaunch' });
const frames = [
  10, 18, 102, 112, 415, 425, 443, 555, 577, 591, 605, 620, 640, 662, 677, 692, 710, 750,
];
await frames.reduce(
  (previous, frame) =>
    previous.then(async () => {
      await renderStill({
        serveUrl,
        composition,
        frame,
        output: path.join(output, `frame-${frame}.png`),
        scale: 1.5,
      });
      return undefined;
    }),
  Promise.resolve(),
);
let lastProgress = -1;
if (!process.argv.includes('--stills')) {
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    crf: 18,
    scale: 1.5,
    concurrency: 4,
    outputLocation: path.join(output, 'myself-md-launch-word-highlight.mp4'),
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent !== lastProgress) {
        lastProgress = percent;
        process.stdout.write(`\rRendering ${percent}%`);
      }
    },
  });
  console.log(`\nVideo: ${path.join(output, 'myself-md-launch-word-highlight.mp4')}`);
}
