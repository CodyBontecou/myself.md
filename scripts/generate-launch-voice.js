import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

// Keep the optional neural runtime and model cache separate from phone dependencies.
const runtime = process.argv[2];
if (!runtime)
  throw new Error('Pass a directory with kokoro-js installed. See launch-video/README.md.');
const script = z
  .object({
    voice: z.string(),
    model: z.string(),
    lines: z.array(
      z.object({ start: z.number(), end: z.number(), text: z.string(), deliverySpeed: z.number() }),
    ),
  })
  .parse(JSON.parse(await readFile('launch-video/public/voice-neural/script.json', 'utf8')));
const transformers = await import(
  pathToFileURL(
    path.resolve(runtime, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs'),
  ).href
);
transformers.env.cacheDir = path.resolve(runtime, 'models');
/** @type {{KokoroTTS:{from_pretrained:(model:string,options:{dtype:string,device:string})=>Promise<{generate:(text:string,options:{voice:string,speed:number})=>Promise<{save:(file:string)=>Promise<void>}>}>}}} */
const library = await import(
  pathToFileURL(path.resolve(runtime, 'node_modules/kokoro-js/dist/kokoro.js')).href
);
const tts = await library.KokoroTTS.from_pretrained(script.model, { dtype: 'q8', device: 'cpu' });
await script.lines.reduce(
  (previous, line, index) =>
    previous.then(async () => {
      const audio = await tts.generate(line.text, {
        voice: script.voice,
        speed: line.deliverySpeed,
      });
      await audio.save(path.resolve('launch-video/public/voice-neural', `take-${index + 1}.wav`));
      console.log(`Neural voice ${index + 1}/${script.lines.length}: ${line.text}`);
      return undefined;
    }),
  Promise.resolve(),
);
await writeFile(
  'launch-video/public/voice-neural/provenance.json',
  JSON.stringify(
    {
      model: script.model,
      voice: script.voice,
      precision: 'q8',
      engine: 'kokoro-js',
      localInference: true,
    },
    null,
    2,
  ) + '\n',
);
