import { copyFile, cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { storeAssets, storeVideos } from '../launch-video/store-assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.local/store-redesign/final');
const publicDir = path.join(root, '.local/store-redesign/package-public');
const run = promisify(execFile);
const reuse = process.argv.includes('--reuse');
/** @param {string} file */
async function canReuse(file) {
  return reuse && (await stat(file).catch(() => null))?.isFile();
}
await mkdir(publicDir, { recursive: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'launch-video/public/app-stores'), publicDir, { recursive: true });
await Promise.all([
  copyFile(path.join(root, 'dashboard/geist-regular.ttf'), path.join(publicDir, 'geist.ttf')),
  copyFile(path.join(root, 'assets/myself-icon.png'), path.join(publicDir, 'portrait.png')),
]);
const serveUrl = await bundle({ entryPoint: path.join(root, 'launch-video/index.js'), publicDir });
/** @type {Array<{file:string,width:number,height:number,bytes:number,sha256:string,role:string,format:string}>} */
const assets = [];
/** @param {string} file @param {string} role @param {number} width @param {number} height @param {boolean} [alpha] */
async function verifyPng(file, role, width, height, alpha = false) {
  const destination = path.join(output, file);
  const b = await readFile(destination);
  assert.equal(b.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16), width, file);
  assert.equal(b.readUInt32BE(20), height, file);
  assert.equal(b[24], 8, file);
  assert.equal(b[25], alpha ? 6 : 2, `${file}: wrong alpha/channel format`);
  if (file.startsWith('google/screenshots/')) assert.ok(b.length < 8_000_000, file);
  if (file === 'google/icon.png') assert.ok(b.length <= 1_048_576, file);
  assets.push({
    file,
    width,
    height,
    bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
    role,
    format: alpha ? 'RGBA PNG' : 'RGB PNG',
  });
}
await storeAssets.reduce(
  (prior, asset) =>
    prior.then(async () => {
      const destination = path.join(output, asset.file);
      await mkdir(path.dirname(destination), { recursive: true });
      if (!(await canReuse(destination))) {
        const composition = await selectComposition({ serveUrl, id: asset.id });
        await renderStill({ serveUrl, composition, frame: 0, output: destination });
      }
      await verifyPng(asset.file, asset.kind, asset.width, asset.height);
      console.log(`Rendered ${asset.file}`);
      return undefined;
    }),
  Promise.resolve(),
);
/** @type {Array<[string,string,number,number]>} */
const retained = [
  ['assets/myself-icon.png', 'apple/icon.png', 1024, 1024],
  ['launch-video/public/app-stores/watch-home.png', 'apple/screenshots/watch/01.png', 416, 496],
  ...['tablet7', 'tablet10'].flatMap((device) =>
    ['profile', 'health', 'time', 'location'].map(
      (source, i) =>
        /** @type {[string,string,number,number]} */ ([
          `launch-video/public/app-stores/${device}-${source}.png`,
          `google/screenshots/${device === 'tablet7' ? 'tablet-7' : 'tablet-10'}/0${i + 1}.png`,
          1080,
          1920,
        ]),
    ),
  ),
];
await retained.reduce(
  (prior, [source, file, width, height]) =>
    prior.then(async () => {
      await mkdir(path.dirname(path.join(output, file)), { recursive: true });
      const original = await readFile(path.join(root, source));
      if (original[25] === 2) await copyFile(path.join(root, source), path.join(output, file));
      else
        await run('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          path.join(root, source),
          '-pix_fmt',
          'rgb24',
          path.join(output, file),
        ]);
      await verifyPng(file, 'native or master', width, height);
      return undefined;
    }),
  Promise.resolve(),
);
await mkdir(path.join(output, 'google'), { recursive: true });
await run('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-i',
  path.join(root, 'assets/myself-icon.png'),
  '-vf',
  'scale=512:512:flags=lanczos',
  '-pix_fmt',
  'rgba',
  path.join(output, 'google/icon.png'),
]);
await verifyPng('google/icon.png', 'same portrait master as Apple', 512, 512, true);
await mkdir(path.join(output, 'apple/previews'), { recursive: true });
await copyFile(
  path.join(root, 'launch-video/public/app-stores/iphone-preview.mp4'),
  path.join(output, 'apple/previews/iphone.mp4'),
);
/** @param {string} file @param {number} width @param {number} height @param {number} seconds */
async function verifyVideo(file, width, height, seconds) {
  const destination = path.join(output, file);
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    destination,
  ]);
  const info = JSON.parse(stdout);
  const v = info.streams.find(
    /** @param {{codec_type:string}} stream */ (stream) => stream.codec_type === 'video',
  );
  assert.equal(v.width, width, file);
  assert.equal(v.height, height, file);
  assert.equal(v.codec_name, 'h264', file);
  assert.equal(v.pix_fmt, 'yuv420p', file);
  assert.ok(Math.abs(Number(info.format.duration) - seconds) < 0.2, file);
  const b = await readFile(destination);
  assert.ok(b.length < 500_000_000, file);
  assets.push({
    file,
    width,
    height,
    bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
    role: `${seconds}-second silent-first video`,
    format: 'H.264 MP4',
  });
}
await verifyVideo('apple/previews/iphone.mp4', 886, 1920, 16);
await run('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-ss',
  '5',
  '-i',
  path.join(output, 'apple/previews/iphone.mp4'),
  '-frames:v',
  '1',
  '-pix_fmt',
  'rgb24',
  path.join(output, 'apple/previews/poster.png'),
]);
await verifyPng('apple/previews/poster.png', 'actual app-preview poster', 886, 1920);
if (!process.argv.includes('--stills'))
  await storeVideos.reduce(
    (prior, asset) =>
      prior.then(async () => {
        const destination = path.join(output, asset.file);
        await mkdir(path.dirname(destination), { recursive: true });
        const composition = await selectComposition({ serveUrl, id: asset.id });
        if (!(await canReuse(destination)))
          await renderMedia({
            serveUrl,
            composition,
            codec: 'h264',
            crf: 18,
            concurrency: 2,
            outputLocation: destination,
          });
        await verifyVideo(asset.file, asset.width, asset.height, asset.frames / 30);
        const poster = asset.file.replace(/\.mp4$/, '-poster.png');
        await renderStill({ serveUrl, composition, frame: 0, output: path.join(output, poster) });
        await verifyPng(poster, 'video poster', asset.width, asset.height);
        console.log(`Rendered ${asset.file}`);
        return undefined;
      }),
    Promise.resolve(),
  );
const metadata = {
  apple: {
    name: 'myself.md',
    subtitle: 'Health, habits & places for AI',
    promotionalText:
      'Bring health, screen time and recorded location data to your AI agent. Choose what to export, where to save it and what your agent can access.',
  },
  google: {
    title: 'myself.md',
    shortDescription:
      'Health, screen time and recorded location data for AI, with sharing you control',
  },
};
assert.ok(metadata.apple.subtitle.length <= 30);
assert.ok(metadata.apple.promotionalText.length <= 170);
assert.ok(metadata.google.shortDescription.length <= 80);
await writeFile(path.join(output, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
/** @param {string} file */
function assetAltText(file) {
  if (file.includes('/screenshots/')) {
    const number = Number(path.basename(file, '.png'));
    const tablet = file.includes('tablet') || file.includes('ipad');
    const watch = file.includes('watch');
    if (watch) return 'The myself.md interface on Apple Watch.';
    const subjects = [
      'Health, screen time and location',
      'Health data selection',
      'Screen time data selection',
      'Recorded location data selection',
    ];
    const index = file.includes('ipad') ? (number === 1 ? 0 : number - 2) : (number - 1) % 4;
    return `${subjects[index] ?? subjects[0]} in myself.md${tablet ? ' on a tablet' : ''}. Choose what to share with your AI agent.`;
  }
  if (file.includes('icon'))
    return 'myself.md app icon: a monochrome stippled sculptural portrait.';
  if (file.includes('lifetime')) return 'myself.md Lifetime Unlock promotional artwork.';
  if (file.includes('monthly')) return 'myself.md Cloud 100 GB Monthly promotional artwork.';
  if (file.includes('yearly')) return 'myself.md Cloud 100 GB Yearly promotional artwork.';
  if (file.includes('previews'))
    return 'A real myself.md walkthrough of health and screen time source controls.';
  return 'myself.md: health, screen time and recorded location data for AI, illustrated with a pulse, time dial and location trail.';
}
const altText = Object.fromEntries(assets.map(({ file }) => [file, assetAltText(file)]));
assert.ok(Object.values(altText).every((value) => value.length <= 140));
await writeFile(path.join(output, 'alt-text.json'), JSON.stringify(altText, null, 2) + '\n');
await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify(
    {
      status: process.argv.includes('--stills') ? 'stills-only draft' : 'local review package',
      locale: 'en-US',
      assets,
      notes: [
        'No upload or submission was performed by this build.',
        'Event files are reusable templates, not a claim of a qualifying live event.',
        'Google declarations are completed during submission; consult distribution/app-stores/SUBMISSION.md for current receipts.',
        'Android tablet sources are actual 720-dp and 960-dp emulator layouts; only system letterboxing was cropped.',
        'Only phone App Preview includes captured interactions; header/search loops and Google video use real screenshots plus editorial art.',
      ],
    },
    null,
    2,
  ) + '\n',
);
await copyFile(
  path.join(root, 'distribution/app-stores/UPLOAD.md'),
  path.join(output, 'README.md'),
);
await copyFile(
  path.join(root, 'distribution/app-stores/SUBMISSION.md'),
  path.join(output, 'SUBMISSION.md'),
);
const escapeHtml = /** @param {string} value */ (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
await writeFile(
  path.join(output, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>myself.md store assets</title><style>body{background:#101010;color:#e9e8e2;font:16px system-ui;margin:40px}h1{font-weight:400;font-size:40px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}figure{margin:0;background:#202020;padding:16px;border-radius:12px}img,video{width:100%;height:420px;object-fit:contain}figcaption{margin-top:12px;overflow-wrap:anywhere;color:#bbb;font-size:13px}a{color:inherit}</style><h1>myself.md / store assets</h1><p>Local en-US package. See README.md for upload order and platform notes.</p><div class="grid">${assets.map((a) => `<figure>${a.file.endsWith('.mp4') ? `<video controls muted loop preload="metadata" src="${escapeHtml(a.file)}"></video>` : `<a href="${escapeHtml(a.file)}"><img loading="lazy" src="${escapeHtml(a.file)}" alt="${escapeHtml(altText[a.file] ?? a.role)}"></a>`}<figcaption>${escapeHtml(a.file)}<br>${a.width} × ${a.height}</figcaption></figure>`).join('')}</div></html>`,
);
if (!process.argv.includes('--stills')) {
  const archive = path.join(root, '.local/store-redesign/myself-md-store-assets.zip');
  await run(
    'zip',
    [
      '-q',
      '-r',
      '-X',
      '-FS',
      archive,
      'apple',
      'google',
      'templates',
      'metadata.json',
      'alt-text.json',
      'manifest.json',
      'README.md',
      'SUBMISSION.md',
      'index.html',
    ],
    { cwd: output },
  );
  console.log(`Package: ${archive} (${(await stat(archive)).size} bytes)`);
}
console.log(`Verified ${assets.length} files.`);
