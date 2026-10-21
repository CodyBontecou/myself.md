import { mkdir, readFile, writeFile, stat, copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.local/product-hunt/v2');
await mkdir(output, { recursive: true });
const listing = JSON.parse(
  await readFile(path.join(root, 'distribution/product-hunt/listing.json'), 'utf8'),
);
await writeFile(path.join(output, 'listing.json'), `${JSON.stringify(listing, null, 2)}\n`);
assert.ok(listing.tagline.length <= 60, 'Product Hunt tagline exceeds 60 characters.');
assert.ok(listing.description.length <= 500, 'Product Hunt description exceeds 500 characters.');
await writeFile(
  path.join(output, 'copy.md'),
  `# Product Hunt submission copy\n\nLocal draft only. Nothing is submitted or scheduled. Edit distribution/product-hunt/listing.json and rerender to update this file.\n\n## Name\n\n${listing.name}\n\n## Tagline\n\n${listing.tagline}\n\n${listing.tagline.length} / 60 characters.\n\n## Description\n\n${listing.description}\n\n${listing.description.length} / 500 characters.\n\n## Maker comment\n\n${listing.firstComment}\n`,
);
await mkdir(path.join(output, 'gallery'), { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.join(root, 'launch-video/index.js'),
  publicDir: path.join(root, 'launch-video/public'),
});
/** @type {Array<[string, string, number, number]>} */
const jobs = [
  ['ProductHunt1', 'gallery/01-cover.png', 1270, 760],
  ['ProductHunt2', 'gallery/02-data-selection.png', 1270, 760],
  ['ProductHunt3', 'gallery/03-permissions.png', 1270, 760],
  ['ProductHunt4', 'gallery/04-owner-approval.png', 1270, 760],
  ['ProductHunt5', 'gallery/05-health-only.png', 1270, 760],
  ['ProductHuntThumbnail', 'thumbnail.png', 240, 240],
  ['ProductHuntOverview', 'preview.png', 1270, 1187],
];
/** @type {Array<{file: string, width: number, height: number, bytes: number}>} */
const assets = [];
await jobs.reduce(
  (previous, [id, relativePath, width, height]) =>
    previous.then(async () => {
      const name = String(relativePath);
      const composition = await selectComposition({ serveUrl, id: String(id) });
      const destination = path.join(output, name);
      await renderStill({ serveUrl, composition, frame: 0, output: destination });
      const png = await readFile(destination);
      assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), width);
      assert.equal(png.readUInt32BE(20), height);
      const { size } = await stat(destination);
      if (name === 'thumbnail.png') assert.ok(size < 3_000_000, 'Thumbnail exceeds 3 MB.');
      assets.push({ file: name, width, height, bytes: size });
      console.log(`Rendered ${name} (${width}×${height}, ${size} bytes)`);
      return undefined;
    }),
  Promise.resolve(),
);
await writeFile(
  path.join(output, 'assets.json'),
  `${JSON.stringify({ status: 'local-draft', assets }, null, 2)}\n`,
);
await copyFile(
  path.join(root, 'distribution/product-hunt/v2/README.md'),
  path.join(output, 'README.md'),
);
const archive = path.join(output, 'myself-md-product-hunt-v2.zip');
await rm(archive, { force: true });
await promisify(execFile)(
  'zip',
  [
    '-X',
    '-r',
    archive,
    'README.md',
    'assets.json',
    'copy.md',
    'listing.json',
    'gallery',
    'preview.png',
    'thumbnail.png',
  ],
  { cwd: output },
);
console.log(
  `Copy limits: tagline ${listing.tagline.length}/60; description ${listing.description.length}/500.`,
);
