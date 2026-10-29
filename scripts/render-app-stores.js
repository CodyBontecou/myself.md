import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.local/store-redesign/editorial');
const publicDir = path.join(root, '.local/store-redesign/public');
await mkdir(publicDir, { recursive: true });
/** @type {Array<[string, string]>} */
const inputs = [
  ['dashboard/geist-regular.ttf', 'geist.ttf'],
  ['assets/myself-icon.png', 'portrait.png'],
  ...['iphone-profile', 'ipad-welcome', 'android-profile'].map(
    (name) =>
      /** @type {[string, string]} */ ([
        `launch-video/public/app-stores/${name}.png`,
        `${name}.png`,
      ]),
  ),
  ...['iphone', 'android'].flatMap(
    (platform) =>
      /** @type {Array<[string, string]>} */ ([
        [
          `dashboard/guide-images/${platform}-health-data-selection.png`,
          `${platform}-selection.png`,
        ],
        [`dashboard/guide-images/${platform}-agent-permissions.png`, `${platform}-permissions.png`],
      ]),
  ),
  ['dashboard/guide-images/android-agent-pairing.png', 'android-pairing.png'],
];
await Promise.all(
  inputs.map(([source, name]) => copyFile(path.join(root, source), path.join(publicDir, name))),
);
const serveUrl = await bundle({ entryPoint: path.join(root, 'launch-video/index.js'), publicDir });
const jobs = [
  ...['iphone', 'android'].flatMap((platform) =>
    [1, 2, 3, 4].map((slide) => ({
      id: `Store-${platform}-${slide}`,
      file: `${platform}/0${slide}.png`,
      width: platform === 'android' ? 1080 : 1206,
      height: platform === 'android' ? 1920 : 2622,
    })),
  ),
  { id: 'Store-ipad', file: 'ipad/01.png', width: 2064, height: 2752 },
  { id: 'Store-feature', file: 'feature-graphic.png', width: 1024, height: 500 },
  { id: 'Store-icon', file: 'google-play-icon.png', width: 512, height: 512 },
];
/** @type {Array<{id: string, file: string, width: number, height: number, bytes: number}>} */
const assets = [];
await jobs.reduce(
  (previous, job) =>
    previous.then(async () => {
      const destination = path.join(output, job.file);
      await mkdir(path.dirname(destination), { recursive: true });
      const composition = await selectComposition({ serveUrl, id: job.id });
      await renderStill({ serveUrl, composition, frame: 0, output: destination });
      const bytes = await readFile(destination);
      assert.equal(bytes.readUInt32BE(16), job.width);
      assert.equal(bytes.readUInt32BE(20), job.height);
      assets.push({ ...job, bytes: bytes.length });
      console.log(`Rendered ${job.file} (${job.width}×${job.height})`);
      return undefined;
    }),
  Promise.resolve(),
);
await writeFile(
  path.join(output, 'assets.json'),
  `${JSON.stringify({ assets, iconSource: 'assets/myself-icon.png' }, null, 2)}\n`,
);
