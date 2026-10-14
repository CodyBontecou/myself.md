import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
  useVideoConfig,
} from 'remotion';
import { palette, bounce, Pop, CandyWipe, Confetti } from './components/playful-motion.js';
import { TextReveal } from './components/text-reveal.js';
import { Captions } from './components/captions.js';
import { AgentScene } from './components/agent-scene.js';
import { PhoneFrame } from './components/phone-frame.js';

export const durationInFrames = 780;
const ink = palette.ink;
const paper = palette.paper;
const face = 'Arial, Helvetica, sans-serif';
/** @type {string[]} */
const emptyBadges = [];

/** @param {{children: import('react').ReactNode, dark?: boolean, color?: string}} props */
function Canvas({ children, dark = false, color = palette.yellow }) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? ink : color,
        color: dark ? paper : ink,
        fontFamily: face,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 34, left: 48, fontSize: 20, fontWeight: 600 }}>
        myself.md
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${dark ? '#ffffff18' : '#191b2220'} 1px, transparent 1px)`,
          backgroundSize: '25px 25px',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

/** @param {{src: string, start?: number, length: number, rate?: number, style?: import('react').CSSProperties}} props */
function Clip({ src, start = 0, length, rate = 1, style }) {
  const frame = useCurrentFrame();
  return (
    <Freeze frame={Math.min(frame, Math.floor((length - 1) / rate))}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={start}
        playbackRate={rate}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
      />
    </Freeze>
  );
}

/** @param {{src: string, start?: number, length: number, rate?: number, title: string, caption: string, step: string, detailTop?: number, detailShift?: number, dark?: boolean, color?: string, badges?: string[]}} props */
function ActionShot({
  src,
  start = 0,
  length,
  rate = 1,
  title,
  caption,
  step,
  detailTop,
  detailShift = 0,
  dark = false,
  color = palette.mint,
  badges = emptyBadges,
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const arrival = bounce(frame, fps);
  const push = 0.94 + 0.04 * arrival + Math.sin(frame / 24) * 0.012;
  return (
    <Canvas dark={dark} color={color}>
      <div
        style={{
          position: 'absolute',
          left: 805,
          top: 180,
          width: 390,
          height: 390,
          borderRadius: '50%',
          background: color === palette.mint ? palette.coral : palette.mint,
          transform: `scale(${0.92 + arrival * 0.08})`,
        }}
      />
      <div style={{ position: 'absolute', left: 70, top: 158, width: 650 }}>
        <Pop
          tilt={-2}
          style={{
            display: 'inline-block',
            fontSize: 18,
            fontWeight: 700,
            background: ink,
            color: paper,
            padding: '12px 18px',
            borderRadius: 24,
            marginBottom: 20,
          }}
        >
          {step}
        </Pop>
        <div style={{ position: 'relative', height: 88 }}>
          <TextReveal
            text={title}
            align="left"
            fontSize={62}
            color={dark ? paper : ink}
            initialScale={1.12}
            holdDuration={4}
            recedeDuration={10}
            assembleDuration={20}
            wordDelay={3}
            wordDuration={10}
            wordStagger={3}
          />
        </div>
        <p
          style={{
            fontSize: 26,
            lineHeight: 1.4,
            maxWidth: 570,
            margin: '22px 0',
            color: dark ? '#bbb' : ink,
          }}
        >
          {caption}
        </p>
        {detailTop !== undefined && (
          <div
            style={{
              position: 'relative',
              height: 185,
              width: 550,
              marginTop: 35,
              overflow: 'hidden',
              borderRadius: 18,
              border: `3px solid ${ink}`,
              background: '#fafafa',
              boxShadow: `8px 9px 0 ${ink}`,
              transform: `translateY(${(1 - bounce(frame, fps, 6)) * 35}px) rotate(${(1 - bounce(frame, fps, 6)) * -3}deg)`,
            }}
          >
            <Clip
              src={src}
              start={start}
              length={length}
              rate={rate}
              style={{
                position: 'absolute',
                width: 550,
                height: 1196,
                left: 0,
                top: detailTop,
                transform: `translateY(${interpolate(frame, [70, 135], [0, detailShift], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })}px)`,
                objectFit: 'fill',
              }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: '0 45px 0 820px',
          transform: `translateY(${(1 - arrival) * 40}px) rotate(${(1 - arrival) * 8 + Math.sin(frame / 27) * 1.2}deg) scale(${push})`,
        }}
      >
        <PhoneFrame scale={0.94} floatAmplitude={7}>
          <Clip src={src} start={start} length={length} rate={rate} />
        </PhoneFrame>
      </div>
      <div style={{ position: 'absolute', left: 70, bottom: 98, display: 'flex', gap: 15 }}>
        {badges.map((badge, index) => (
          <Pop
            key={badge}
            distance={15}
            delay={10 + index * 6}
            tilt={index % 2 ? 3 : -3}
            style={{
              background: index % 2 ? palette.coral : palette.yellow,
              color: ink,
              border: `2px solid ${ink}`,
              borderRadius: 24,
              padding: '13px 20px',
              fontSize: 21,
              fontWeight: 700,
              boxShadow: `4px 5px 0 ${ink}`,
            }}
          >
            {badge}
          </Pop>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 88,
          left: 70,
          fontSize: 16,
          color: dark ? '#999' : ink,
        }}
      >
        App demonstration · fictional data
      </div>
    </Canvas>
  );
}

function ProfileSave() {
  return (
    <Series>
      <Series.Sequence durationInFrames={39}>
        <ActionShot
          src="files.mp4"
          length={45}
          rate={1.15}
          color={palette.yellow}
          badges={['JSON', 'JSONL', '7 days']}
          title="Choose your files."
          caption="JSON + JSONL. Seven days. Your choices."
          step="02 / Save your export profile"
          detailTop={-365}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={24}>
        <ActionShot
          src="save.mp4"
          length={44}
          rate={1.9}
          color={palette.coral}
          badges={['Ready? Save.']}
          title="Review and save."
          caption="Review. Save. Ready to use."
          step="02 / Save your export profile"
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={27}>
        <ActionShot
          src="saved.mp4"
          length={93}
          rate={1.6}
          color={palette.mint}
          badges={['✓ Saved!']}
          title="Profile saved."
          caption="Your selected data, ready for next time."
          step="02 / Save your export profile"
          detailTop={-700}
        />
      </Series.Sequence>
    </Series>
  );
}

export function LaunchVideo() {
  return (
    <AbsoluteFill>
      <Audio src={staticFile('score.wav')} volume={1} />
      <Series>
        <Series.Sequence durationInFrames={45}>
          <Canvas dark>
            <Confetti dark />
            <Pop
              delay={8}
              tilt={-4}
              style={{
                position: 'absolute',
                left: 180,
                top: 160,
                padding: '12px 22px',
                background: palette.coral,
                color: ink,
                fontSize: 24,
                fontWeight: 700,
                borderRadius: 25,
              }}
            >
              Hello, personal data.
            </Pop>
            <TextReveal
              text="Your data. Your agent."
              fontSize={80}
              color={palette.yellow}
              initialScale={1.3}
              holdDuration={3}
              recedeDuration={8}
              assembleDuration={16}
              wordDelay={2}
              wordDuration={8}
              wordStagger={2}
            />
          </Canvas>
        </Series.Sequence>
        <Series.Sequence durationInFrames={45}>
          <ActionShot
            src="name.mp4"
            length={96}
            rate={2}
            color={palette.coral}
            badges={['Your own profile']}
            title="Make it yours."
            caption="Start with an export profile."
            step="01 / Choose your data"
            detailTop={-350}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <ActionShot
            src="select.mp4"
            length={228}
            rate={1.9}
            color={palette.mint}
            badges={['Step count', 'App usage']}
            title="Select what matters."
            caption="Step count. App usage. You choose."
            step="01 / Choose your data"
            detailTop={-540}
            detailShift={-185}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <ProfileSave />
        </Series.Sequence>
        <Series.Sequence durationInFrames={75}>
          <ActionShot
            src="approve.mp4"
            length={136}
            rate={1.8}
            color={palette.yellow}
            badges={['You’re in control']}
            title="Approve access."
            caption="Your profile. Your permissions."
            step="03 / Approve your agent"
            detailTop={-470}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={348}>
          <AgentScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={57}>
          <Canvas color={palette.mint}>
            <Confetti />
            <Pop>
              <Img
                src={staticFile('icon.png')}
                style={{
                  position: 'absolute',
                  top: 118,
                  left: 600,
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  boxShadow: `7px 8px 0 ${ink}`,
                }}
              />
            </Pop>
            <div style={{ position: 'absolute', top: 220, height: 145, width: '100%' }}>
              <TextReveal
                text="myself.md"
                fontSize={110}
                color={ink}
                initialScale={1.1}
                holdDuration={3}
              />
            </div>
            <Sequence from={18} layout="none">
              <Pop distance={25}>
                <div
                  style={{
                    position: 'absolute',
                    top: 408,
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 30,
                    color: ink,
                  }}
                >
                  Personal data for AI agents.
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 495,
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 28,
                  }}
                >
                  <span
                    style={{
                      background: palette.yellow,
                      padding: '18px 26px',
                      borderRadius: 32,
                      border: `2px solid ${ink}`,
                      boxShadow: `5px 6px 0 ${ink}`,
                      display: 'inline-block',
                    }}
                  >
                    Explore the cloud dashboard → myself.md/demo
                  </span>
                </div>
              </Pop>
            </Sequence>
          </Canvas>
        </Series.Sequence>
      </Series>
      <Captions />
      {[45, 90, 210, 300, 375, 723].map((cut) => (
        <Sequence key={cut} from={cut - 7} durationInFrames={17}>
          <CandyWipe />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
