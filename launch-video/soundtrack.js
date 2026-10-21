import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** @typedef {{frame:number,kind:'pop'|'tap'|'whoosh'|'connect'|'result'|'rise'|'tick',gain:number,pan:number}} Cue */
const fps = 30;
const rate = 44100;
const seconds = 26;
const connection = (375 + 28) / fps;
const results = (375 + 165) / fps;
/** Frame cues match the current spring delays and accelerated source clips. */
const cues = /** @type {Cue[]} */ ([
  { frame: 16, kind: 'pop', gain: 0.17, pan: -0.35 },
  ...[45, 90, 210, 300, 375, 723].map((frame) => ({
    frame: frame - 7,
    kind: /** @type {const} */ ('whoosh'),
    gain: 0.16,
    pan: 0,
  })),
  ...[45, 90, 210, 249, 273, 300].flatMap((frame) => [
    { frame: frame + 8, kind: /** @type {const} */ ('pop'), gain: 0.12, pan: 0.35 },
    { frame: frame + 17, kind: /** @type {const} */ ('pop'), gain: 0.085, pan: -0.35 },
  ]),
  // Grey touch indicators and checkbox transitions in the native footage.
  ...[91, 125, 140, 162, 180, 198, 243, 247, 270, 306, 333].map((frame) => ({
    frame,
    kind: /** @type {const} */ ('tap'),
    gain: 0.11,
    pan: 0.35,
  })),
  { frame: 403, kind: 'connect', gain: 0.32, pan: 0 },
  { frame: 420, kind: 'pop', gain: 0.12, pan: -0.3 },
  { frame: 457, kind: 'pop', gain: 0.09, pan: -0.25 },
  { frame: 482, kind: 'tick', gain: 0.085, pan: -0.15 },
  { frame: 504, kind: 'tick', gain: 0.085, pan: 0.15 },
  { frame: 530, kind: 'rise', gain: 0.13, pan: 0 },
  { frame: 540, kind: 'result', gain: 0.38, pan: 0 },
  ...[563, 566, 569, 572, 575, 578, 581].map((frame, index) => ({
    frame,
    kind: /** @type {const} */ ('tick'),
    gain: 0.035 + index * 0.004,
    pan: -0.5 + index / 7,
  })),
  { frame: 734, kind: 'pop', gain: 0.14, pan: 0 },
  { frame: 748, kind: 'pop', gain: 0.14, pan: 0 },
]);
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/** Short attack prevents digital clicks. @param {number} time @param {number} decay */
const envelope = (time, decay) => Math.min(1, time / 0.004) * Math.exp(-time * decay);
/** @param {number} frequency @param {number} time */
const sine = (frequency, time) => Math.sin(2 * Math.PI * frequency * time);
/** @param {Float32Array} left @param {Float32Array} right */
function wave(left, right) {
  const pcm = Buffer.alloc(left.length * 4);
  let peak = 0;
  let energy = 0;
  for (let index = 0; index < left.length; index++) {
    const l = left[index] ?? 0,
      r = right[index] ?? 0;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    energy += (l * l + r * r) / 2;
    pcm.writeInt16LE(Math.round(clamp(l, -1, 1) * 32767), index * 4);
    pcm.writeInt16LE(Math.round(clamp(r, -1, 1) * 32767), index * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return {
    data: Buffer.concat([header, pcm]),
    peakDb: 20 * Math.log10(peak),
    rmsDb: 10 * Math.log10(energy / left.length),
  };
}

/** Original stereo synthesis, no licensed samples. @param {string} publicDirectory @param {Awaited<ReturnType<typeof import('./narration.js').createNarration>>} narration */
export async function createSoundtrack(publicDirectory, narration) {
  const size = rate * seconds;
  const musicLeft = new Float32Array(size),
    musicRight = new Float32Array(size);
  const fxLeft = new Float32Array(size),
    fxRight = new Float32Array(size);
  const chords = [
    [146.83, 220, 293.66],
    [130.81, 196, 261.63],
    [164.81, 220, 329.63],
    [146.83, 220, 293.66],
  ];
  for (let index = 0; index < size; index++) {
    const time = index / rate;
    const chord =
      time >= connection ? chords[0] : (chords[Math.min(3, Math.floor(time / 6.5))] ?? chords[0]);
    if (!chord) throw new Error('Missing chord');
    // Restart the groove exactly at each hero moment; gain ramps keep continuity.
    const section = time >= results ? results : time >= connection ? connection : 0;
    const beat = (time - section) % 0.5;
    const eighth = (time - section) % 0.25;
    const fade = clamp(time / 0.3, 0, 1) * clamp((seconds - time) / 0.6, 0, 1);
    const preResult =
      time > results - 0.32 && time < results ? 0.15 + (0.85 * (results - time)) / 0.32 : 1;
    const cueDuck = cues.reduce((gain, cue) => {
      const age = time - cue.frame / fps;
      return age >= 0 && age < 0.23 && cue.kind !== 'tick'
        ? Math.min(gain, 0.72 + age * 1.2)
        : gain;
    }, 1);
    let pad = 0;
    for (const frequency of chord) pad += sine(frequency, time) * 0.045;
    const pulse = sine(73.415, time) * Math.exp(-beat * 18) * 0.075;
    const kick =
      Math.sin(2 * Math.PI * (48 * beat + 2 * (1 - Math.exp(-beat * 22)))) *
      Math.exp(-beat * 17) *
      0.14;
    const pitch = chord[Math.floor((time - section) * 4) % chord.length] ?? 220;
    const pluck = sine(pitch * 2, time) * Math.exp(-eighth * 20) * 0.075;
    const hat = Math.sin(index * 12.9898) * Math.exp(-eighth * 100) * 0.018;
    const lift = time >= results ? 1.22 : time >= connection ? 1.08 : 0.9;
    const gain = fade * preResult * cueDuck * lift;
    musicLeft[index] = (pad + pulse + kick + pluck + hat) * gain;
    musicRight[index] = (pad + pulse + kick + pluck * 0.85 + hat * 0.7) * gain;
  }
  for (const cue of cues) {
    const duration =
      cue.kind === 'result'
        ? 1.6
        : cue.kind === 'connect'
          ? 0.9
          : cue.kind === 'whoosh'
            ? 0.57
            : cue.kind === 'rise'
              ? 1 / 3
              : cue.kind === 'tap'
                ? 0.07
                : 0.25;
    const start = Math.round((cue.frame / fps) * rate);
    const count = Math.ceil(duration * rate);
    let filtered = 0;
    for (let offset = 0; offset < count; offset++) {
      const index = start + offset;
      if (index >= size) break;
      const time = offset / rate;
      const progress = time / duration;
      const noise = Math.sin((offset + cue.frame * 91) * 12.9898) * 43758.5453;
      filtered = filtered * 0.8 + ((noise - Math.floor(noise)) * 2 - 1) * 0.2;
      let value = 0;
      let pan = cue.pan;
      if (cue.kind === 'whoosh' || cue.kind === 'rise') {
        const swell = Math.sin(Math.PI * progress) ** 2;
        value = (filtered * 1.8 + sine(140 + progress * 600, time) * 0.08) * swell;
        pan = cue.kind === 'whoosh' ? -0.8 + progress * 1.6 : 0;
      } else if (cue.kind === 'pop') {
        value =
          Math.sin(2 * Math.PI * (180 * time + 5 * (1 - Math.exp(-time * 55)))) *
          envelope(time, 22);
      } else if (cue.kind === 'tap') {
        value = (sine(1100, time) * 0.65 + filtered * 0.7) * envelope(time, 80);
      } else if (cue.kind === 'tick') {
        value = sine(880 + (cue.frame % 7) * 55, time) * envelope(time, 27);
      } else {
        const notes = cue.kind === 'result' ? [293.66, 369.99, 440, 587.33] : [440, 587.33, 880];
        notes.forEach((frequency, note) => {
          const age = time - note * 0.075;
          if (age >= 0)
            value +=
              ((sine(frequency, age) + sine(frequency * 2, age) * 0.2) * envelope(age, 5.5)) /
              notes.length;
          const echo = age - 0.18;
          if (echo >= 0) value += (sine(frequency, echo) * envelope(echo, 7) * 0.13) / notes.length;
        });
        value += sine(cue.kind === 'result' ? 73.415 : 146.83, time) * envelope(time, 9) * 0.65;
      }
      const endFade = Math.min(1, (duration - time) / 0.02);
      const gain = cue.gain * endFade;
      fxLeft[index] = (fxLeft[index] ?? 0) + value * gain * Math.sqrt((1 - pan) / 2);
      fxRight[index] = (fxRight[index] ?? 0) + value * gain * Math.sqrt((1 + pan) / 2);
    }
  }
  const masterLeft = new Float32Array(size),
    masterRight = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    const time = index / rate;
    const speech = narration.segments.reduce((amount, segment) => {
      const attack = clamp((time - segment.start + 0.08) / 0.08, 0, 1);
      const release = clamp((segment.end + 0.22 - time) / 0.22, 0, 1);
      return Math.max(amount, Math.min(attack, release));
    }, 0);
    const musicGain = 1 - speech * 0.78;
    const effectGain = 1 - speech * 0.35;
    const spoken = (narration.samples[index] ?? 0) * 1.35;
    // Voice stays centered; stereo music ducks by 13 dB with smooth attack/release.
    masterLeft[index] =
      Math.tanh(
        ((musicLeft[index] ?? 0) * musicGain + (fxLeft[index] ?? 0) * effectGain) * 1.8 + spoken,
      ) * 0.88;
    masterRight[index] =
      Math.tanh(
        ((musicRight[index] ?? 0) * musicGain + (fxRight[index] ?? 0) * effectGain) * 1.8 + spoken,
      ) * 0.88;
  }
  const master = wave(masterLeft, masterRight);
  await Promise.all([
    writeFile(path.join(publicDirectory, 'score.wav'), master.data),
    writeFile(
      path.join(publicDirectory, 'narration.wav'),
      wave(narration.samples, narration.samples).data,
    ),
    writeFile(path.join(publicDirectory, 'music.wav'), wave(musicLeft, musicRight).data),
    writeFile(path.join(publicDirectory, 'effects.wav'), wave(fxLeft, fxRight).data),
    writeFile(
      path.join(publicDirectory, 'sound-cues.json'),
      JSON.stringify(
        {
          fps,
          connectionFrame: 403,
          resultFrame: 540,
          peakDb: master.peakDb,
          rmsDb: master.rmsDb,
          cues,
        },
        null,
        2,
      ) + '\n',
    ),
  ]);
  console.log(
    `Stereo soundtrack: ${cues.length} cues; peak ${master.peakDb.toFixed(1)} dBFS; RMS ${master.rmsDb.toFixed(1)} dBFS.`,
  );
}
