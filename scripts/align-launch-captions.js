import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const run = promisify(execFile);
const model = process.argv[2];
if (!model)
  throw new Error('Pass the local Whisper base.en model path. See launch-video/README.md.');
const directory = path.resolve('.local/launch-video/word-alignment');
await mkdir(directory, { recursive: true });
const narration = z
  .object({
    segments: z.array(
      z.object({ start: z.number(), end: z.number(), text: z.string(), speed: z.number() }),
    ),
  })
  .parse(JSON.parse(await readFile('launch-video/public/narration-cues.json', 'utf8')));
const tokenSchema = z.object({ text: z.string(), t_dtw: z.number() });
const resultSchema = z.object({
  transcription: z.array(z.object({ text: z.string(), tokens: z.array(tokenSchema) })),
});
/** @type {{start:number,end:number,text:string,words:{text:string,start:number,end:number}[]}[]} */
const segments = [];
await narration.segments.reduce(
  (previous, segment, index) =>
    previous.then(async () => {
      const stem = path.join(directory, `line-${index + 1}`);
      // Align the final tempo-adjusted voice, without music; tail padding aids short utterances.
      await run('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-ss',
        String(segment.start),
        '-t',
        String(segment.end - segment.start),
        '-i',
        'launch-video/public/narration.wav',
        '-af',
        'apad=pad_dur=1',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        `${stem}.wav`,
      ]);
      await writeFile(`${stem}.gbnf`, `root ::= " "? ${JSON.stringify(segment.text)}\n`);
      await run(
        'whisper-cli',
        [
          '-m',
          model,
          '-f',
          `${stem}.wav`,
          '-dtw',
          'base.en',
          '-nfa',
          '-nt',
          '-ojf',
          '-of',
          stem,
          '--grammar',
          `${stem}.gbnf`,
          '--grammar-rule',
          'root',
          '-bs',
          '1',
          '-bo',
          '1',
          '-nf',
          '-np',
        ],
        { maxBuffer: 2 * 1024 * 1024 },
      );
      const result = resultSchema.parse(JSON.parse(await readFile(`${stem}.json`, 'utf8')));
      /** @type {{text:string,start:number,end:number}[]} */
      const words = [];
      for (const token of result.transcription.flatMap((entry) => entry.tokens)) {
        if (token.t_dtw < 0 || token.text.startsWith('[_')) continue;
        const start = Math.min(segment.end, segment.start + token.t_dtw / 100);
        if (/^\s/.test(token.text) || !words.length)
          words.push({ text: token.text.trim(), start, end: start });
        else {
          const current = words.at(-1);
          assert.ok(current);
          current.text += token.text;
          current.end = start;
        }
      }
      const expected = segment.text.split(' ');
      assert.equal(words.length, expected.length, 'Alignment must include every spoken word');
      words.forEach((word, wordIndex) => {
        const text = expected[wordIndex];
        assert.ok(text);
        assert.equal(
          word.text.replace(/[.!?,]/g, ''),
          text.replace(/[.!?,]/g, ''),
          'Spoken words must match the script',
        );
        word.text = text;
      });
      // The source takes are silence-trimmed: the first word begins at their start.
      if (words[0]) words[0].start = segment.start;
      words.forEach((word, wordIndex) => {
        word.end = words[wordIndex + 1]?.start ?? segment.end;
        assert.ok(
          word.start >= segment.start && word.end > word.start && word.end <= segment.end,
          'Invalid word timing',
        );
      });
      segments.push({ ...segment, words });
      console.log(`Aligned ${index + 1}/${narration.segments.length}: ${words.length} words`);
      return undefined;
    }),
  Promise.resolve(),
);
await writeFile(
  'launch-video/public/word-cues.json',
  JSON.stringify(
    {
      method: 'Whisper base.en constrained-transcript DTW',
      audio: 'narration.wav',
      audioSha256: createHash('sha256')
        .update(await readFile('launch-video/public/narration.wav'))
        .digest('hex'),
      segments,
    },
    null,
    2,
  ) + '\n',
);
