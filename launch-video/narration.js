import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const run = promisify(execFile);
const rate = 44100;
/** Mix retained local neural voice takes into their scene windows.
 * @param {string} publicDirectory @param {string} outputDirectory */
export async function createNarration(publicDirectory, outputDirectory) {
  const script = z
    .object({
      voice: z.string(),
      lines: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
    })
    .parse(
      JSON.parse(await readFile(path.join(publicDirectory, 'voice-neural/script.json'), 'utf8')),
    );
  const { voice, lines } = script;
  const directory = path.join(outputDirectory, 'voice-takes');
  await mkdir(directory, { recursive: true });
  const samples = new Float32Array(rate * 26);
  /** @type {{start:number,end:number,text:string,speed:number}[]} */
  const segments = [];
  // Normalize and fit one retained take at a time; no voice-model dependency during rendering.
  await lines.reduce(
    (previous, line, index) =>
      previous.then(async () => {
        const stem = path.join(directory, `take-${index + 1}`);
        await writeFile(`${stem}.txt`, line.text + '\n');
        const source = path.join(publicDirectory, 'voice-neural', `take-${index + 1}.wav`);
        const trim = 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-50dB';
        await run('ffmpeg', [
          '-y',
          '-v',
          'error',
          '-i',
          source,
          '-af',
          `${trim},areverse,${trim},areverse`,
          `${stem}-trim.wav`,
        ]);
        const probe = await run('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          `${stem}-trim.wav`,
        ]);
        const duration = Number(probe.stdout.trim());
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('Empty narration take');
        const speed = Math.max(1, duration / (line.end - line.start));
        if (speed > 1.15) throw new Error(`Narration needs a shorter line: ${line.text}`);
        await run('ffmpeg', [
          '-y',
          '-v',
          'error',
          '-i',
          `${stem}-trim.wav`,
          '-af',
          `atempo=${speed},loudnorm=I=-16:TP=-3:LRA=7`,
          '-ar',
          String(rate),
          '-ac',
          '1',
          '-f',
          'f32le',
          `${stem}.pcm`,
        ]);
        const pcm = await readFile(`${stem}.pcm`);
        const count = pcm.length / 4;
        const start = Math.round(line.start * rate);
        if ((start + count) / rate > line.end + 0.04)
          throw new Error('Narration exceeds scene window');
        for (let sample = 0; sample < count; sample++)
          samples[start + sample] = pcm.readFloatLE(sample * 4);
        segments.push({ start: line.start, end: (start + count) / rate, text: line.text, speed });
        return undefined;
      }),
    Promise.resolve(),
  );
  await writeFile(
    path.join(publicDirectory, 'narration-cues.json'),
    JSON.stringify({ voice, rate, segments }, null, 2) + '\n',
  );
  console.log(`Narration: ${segments.length} scene-synced ${voice} voice takes.`);
  return { samples, segments };
}
