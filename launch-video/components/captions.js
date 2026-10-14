import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import narration from '../public/word-cues.json';
import { bounce, palette } from './playful-motion.js';

/** @typedef {{text:string,start:number,end:number}} WordCue */
/** @param {{word:WordCue,time:number,emphasis?:boolean,color:string,highlight:string,children?:import('react').ReactNode,fontSize?:number,compact?:boolean}} props */
function SpokenWord({
  word,
  time,
  emphasis = false,
  color,
  highlight,
  children,
  fontSize,
  compact = false,
}) {
  const { fps } = useVideoConfig();
  const active = time >= word.start && time < word.end;
  const progress = bounce((time - word.start) * fps, fps);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: compact ? '3px 0' : '3px 5px',
        marginRight: compact ? 0 : 2,
        marginLeft: fontSize ? 12 : 0,
        borderRadius: 9,
        background: active ? highlight : 'transparent',
        color: active ? palette.ink : color,
        opacity: active || time >= word.end ? 1 : 0.55,
        fontSize,
        transform: active
          ? `translateY(${(1 - progress) * (emphasis ? 14 : 5)}px) scale(${(emphasis ? 0.76 : 0.94) + progress * (emphasis ? 0.24 : 0.06)})`
          : 'scale(1)',
      }}
    >
      {children ?? word.text}
    </span>
  );
}

/** @param {{text:string,start:number,end:number,words:WordCue[]}} props */
function Caption({ text, start, end, words }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = start + frame / fps;
  const connection = text.startsWith("We're connected!");
  const steps = text.startsWith('Sixty-four thousand');
  const apps = text.startsWith('Five hours');
  const wow = text === 'Wow!';
  const numeric = steps || apps;
  const demo = start >= 1.5 && start < 12.5;
  const value = bounce(frame, fps);
  const spokenFrames = Math.round((end - start) * fps);
  const exit = interpolate(frame, [spokenFrames + 1, spokenFrames + 5], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const background = connection
    ? palette.mint
    : steps
      ? palette.yellow
      : apps || wow
        ? palette.coral
        : palette.ink;
  const color = connection || numeric || wow ? palette.ink : palette.paper;
  const highlight = connection || steps ? palette.coral : palette.yellow;
  const activeIndex = words.findIndex((word) => time >= word.start && time < word.end);
  // Numeric groups follow their spoken equivalents, including thousand/hundred units.
  const groups = steps
    ? [
        { text: '64,', indices: [0, 1] },
        { text: '9', indices: [2, 3] },
        { text: '80', indices: [4] },
      ]
    : [
        { text: '5h', indices: [0, 1] },
        { text: '52m', indices: [2, 3] },
      ];
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        fontFamily: 'Arial, Helvetica, sans-serif',
        alignItems: demo ? 'flex-start' : 'center',
        justifyContent: 'flex-end',
        padding: demo ? '0 0 20px 70px' : '0 40px 15px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: demo ? 660 : 1100,
          background,
          color,
          padding: numeric ? '6px 18px' : '8px 15px',
          borderRadius: numeric ? 26 : 22,
          border: `2px solid ${palette.ink}`,
          boxShadow: `5px 6px 0 ${connection || numeric || wow ? '#00000055' : '#faf9f580'}`,
          opacity: exit * Math.min(1, value * 3),
          transform: `translateY(${(1 - value) * 22}px) scale(${0.94 + value * 0.06}) rotate(${(1 - value) * -3}deg)`,
          textAlign: 'center',
        }}
      >
        {numeric && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: steps ? 0 : 8,
              fontSize: 59,
              lineHeight: 1.05,
              letterSpacing: -2,
              fontWeight: 800,
            }}
          >
            {groups.map((group) => {
              const cue =
                words[group.indices.includes(activeIndex) ? activeIndex : (group.indices[0] ?? 0)];
              if (!cue) return null;
              return (
                <SpokenWord
                  key={group.text}
                  compact
                  word={cue}
                  time={time}
                  emphasis
                  color={palette.ink}
                  highlight={highlight}
                >
                  {group.text}
                </SpokenWord>
              );
            })}
            {words
              .filter((_, position) => (steps ? position === 5 : position >= 4))
              .map((word) => (
                <SpokenWord
                  key={word.start}
                  word={word}
                  time={time}
                  emphasis
                  fontSize={27}
                  color={color}
                  highlight={highlight}
                />
              ))}
          </div>
        )}
        <div
          style={{
            fontSize: numeric ? 20 : connection || wow ? 39 : 27,
            lineHeight: 1.18,
            fontWeight: 700,
            letterSpacing: numeric ? 0 : -0.2,
          }}
        >
          {words.map((word) => (
            <SpokenWord
              key={word.start}
              word={word}
              time={time}
              emphasis={connection || numeric || wow}
              color={color}
              highlight={highlight}
            />
          ))}
        </div>
        {(numeric || connection || wow) &&
          ['left', 'right'].map((side) => (
            <span
              key={side}
              style={{
                position: 'absolute',
                left: side === 'left' ? -39 : undefined,
                right: side === 'right' ? -39 : undefined,
                top: 4,
                fontSize: 35,
                color: side === 'left' ? palette.yellow : palette.mint,
                WebkitTextStroke: `1px ${palette.ink}`,
                transform: `rotate(${(side === 'right' ? 1 : -1) * frame * 2}deg) scale(${value})`,
              }}
            >
              ✦
            </span>
          ))}
      </div>
    </AbsoluteFill>
  );
}

/** Speech alignment drives every highlight and bounce; no proportional word pacing. */
export function Captions() {
  const { fps } = useVideoConfig();
  return (
    <>
      {narration.segments.map((segment) => (
        <Sequence
          key={segment.start}
          from={Math.round(segment.start * fps)}
          durationInFrames={Math.ceil((segment.end - segment.start) * fps) + 6}
        >
          <Caption {...segment} />
        </Sequence>
      ))}
    </>
  );
}
