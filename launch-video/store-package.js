import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { StoreMotif } from './app-stores.js';

const ink = '#080808';
const paper = '#e9e8e2';
const sources = ['profile', 'health', 'time', 'location'];
const titles = [
  ['Your data.', 'Your terms.'],
  ['Health.', 'Choose the detail.'],
  ['Screen time.', 'See your options.'],
  ['Location.', 'Record by choice.'],
];
const descriptions = [
  'Health, screen time and location. One export profile.',
  'Choose sleep, activity, heart and other health data.',
  'Select the app-usage data your agent can access.',
  'Location history starts when you choose to record.',
];
/** @typedef {{platform?:string,slide?:number,format?:string,product?:string,motion?:boolean,editorial?:boolean}} PackageProps */

/** Portrait stories paired with genuine app controls. @param {PackageProps} props */
export function StoreSourcePortrait({ platform = 'iphone', slide = 2, editorial = false }) {
  const { width, height } = useVideoConfig();
  const s = width / 1206;
  const h = height / s;
  const tablet = platform === 'ipad';
  const android = platform === 'android';
  const healthCrop = tablet
    ? { x: 474, y: 804, width: 1116, height: 380 }
    : android
      ? { x: 42, y: 1116, width: 996, height: 468 }
      : { x: 48, y: 1300, width: 1110, height: 540 };
  const timeCrop = tablet
    ? { x: 474, y: 995, width: 1116, height: 180 }
    : android
      ? { x: 42, y: 1340, width: 996, height: 260 }
      : { x: 48, y: 1570, width: 1110, height: 260 };
  const locationCrop = tablet
    ? { x: 474, y: 870, width: 1116, height: 440 }
    : android
      ? { x: 42, y: 1180, width: 996, height: 580 }
      : { x: 48, y: 1395, width: 1110, height: 650 };
  const crop = editorial
    ? {
        x: android ? 42 : 48,
        y: android ? (slide === 3 ? 974 : 1090) : slide === 3 ? 1145 : 1280,
        width: android ? 996 : 1110,
        height: android ? 112 : 122,
      }
    : slide === 3
      ? timeCrop
      : slide === 4
        ? locationCrop
        : healthCrop;
  const story =
    slide === 3
      ? {
          name: 'SCREEN TIME',
          headline: ['Where did', 'the day go?'],
          detail: android ? 'Apps. Sessions. Time.' : 'Apps. Websites. Time.',
          context: 'Your attention. More context.',
          caption: 'Choose the app-usage data your agent can access.',
        }
      : slide === 4
        ? {
            name: 'LOCATION',
            headline: ['Life has', 'coordinates.'],
            detail: 'Places. Paths. Perspective.',
            context: 'Your places. More context.',
            caption: 'Export the locations you choose to record.',
          }
        : {
            name: 'HEALTH',
            headline: ['A body of', 'knowledge.'],
            detail: 'Sleep. Activity. Heart.',
            context: 'Your health. More context.',
            caption: 'Choose the health data your agent can access.',
          };
  const imageWidth = tablet ? 2064 : android ? 1080 : 1206;
  const cropScale = 930 / crop.width;
  const faceTop = tablet ? 300 : android ? 420 : 540;
  const faceSize = tablet ? 850 : android ? 1100 : 1300;
  const controlTop = tablet ? 1090 : android ? 1510 : 1970;
  return (
    <AbsoluteFill style={{ background: ink, color: paper, fontFamily: 'Store Geist' }}>
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');}`}</style>
      <div
        style={{
          position: 'absolute',
          width: 1206,
          height: h,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <div style={{ position: 'absolute', left: 76, top: 60, fontSize: 34 }}>
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 76,
            top: 72,
            font: '20px monospace',
            color: '#aaa',
          }}
        >
          {story.name} / YOUR CHOICE
        </div>
        <h1
          style={{
            position: 'absolute',
            left: 70,
            top: tablet ? 165 : 210,
            margin: 0,
            fontSize: tablet ? 112 : 145,
            fontWeight: 400,
            lineHeight: 0.98,
            letterSpacing: -6,
          }}
        >
          {story.headline[0]}
          <br />
          {story.headline[1]}
        </h1>
        <div
          style={{
            position: 'absolute',
            left: tablet ? 255 : 80,
            top: faceTop,
            width: faceSize,
            height: faceSize,
          }}
        >
          <svg
            viewBox="0 0 1200 1200"
            width="100%"
            height="100%"
            fill="none"
            style={{ position: 'absolute', inset: 0 }}
          >
            <ellipse
              cx="590"
              cy="590"
              rx="510"
              ry="460"
              transform="rotate(-27 590 590)"
              stroke="#55554f"
              strokeWidth="1"
            />
            <ellipse
              cx="590"
              cy="590"
              rx="565"
              ry="485"
              transform="rotate(-27 590 590)"
              stroke="#30302c"
              strokeDasharray="2 12"
              strokeWidth="2"
            />
          </svg>
          <Img
            src={staticFile('portrait.png')}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              maskImage: 'radial-gradient(ellipse 50% 55% at 50% 48%,black 28%,transparent 85%)',
            }}
          />
          <svg
            viewBox="0 0 1200 1200"
            width="100%"
            height="100%"
            fill="none"
            style={{ position: 'absolute', inset: 0 }}
          >
            {slide === 2 ? (
              <>
                <path
                  d="M-100 810H125L155 770L195 850L245 700L305 905L355 785L390 810H570"
                  stroke={paper}
                  strokeWidth="2"
                />
                <circle cx="570" cy="810" r="5" fill={paper} />
              </>
            ) : slide === 3 ? (
              <>
                {Array.from({ length: 60 }, (_, i) => {
                  const a = ((i * 6 - 90) * Math.PI) / 180;
                  const radius = i % 5 === 0 ? 480 : 498;
                  return (
                    <line
                      key={i}
                      x1={590 + Math.cos(a) * radius}
                      y1={590 + Math.sin(a) * radius}
                      x2={590 + Math.cos(a) * 515}
                      y2={590 + Math.sin(a) * 515}
                      stroke={i % 5 === 0 ? paper : '#66665e'}
                      strokeWidth={i % 5 === 0 ? 2 : 1}
                    />
                  );
                })}
                <path d="M155 835A500 500 0 0 1 112 440" stroke={paper} strokeWidth="5" />
                <circle cx="155" cy="835" r="8" fill={paper} />
                <path d="M590 590L845 395M590 590L475 770" stroke={paper} strokeWidth="2" />
                <circle cx="590" cy="590" r="8" fill={paper} />
              </>
            ) : (
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <path
                    key={i}
                    d={`M-90 ${800 + i * 33}C170 ${540 + i * 33} 250 ${1050 + i * 33} 480 ${830 + i * 33}S750 ${650 + i * 33} 1160 ${890 + i * 33}`}
                    stroke="#54544c"
                    strokeWidth="1"
                  />
                ))}
                <path
                  d="M-65 870C150 880 90 700 300 750S420 910 580 770S850 850 965 620"
                  stroke={paper}
                  strokeWidth="3"
                  strokeDasharray="5 9"
                />
                <circle cx="300" cy="750" r="8" fill={paper} />
                <circle cx="580" cy="770" r="10" fill={ink} stroke={paper} strokeWidth="2" />
                <path
                  d="M999 587C999 612 965 642 965 642S931 612 931 587A34 34 0 1 1 999 587Z"
                  fill={paper}
                />
                <circle cx="965" cy="587" r="10" fill={ink} />
              </>
            )}
            <circle cx="160" cy="335" r="7" fill={paper} />
            <circle cx="1005" cy="660" r="7" fill={paper} />
            <path d="M160 335H-20M1005 660H1100" stroke="#77776f" />
          </svg>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            top: faceTop + faceSize * 0.3 - 80,
            color: '#bbb',
            font: '22px monospace',
            lineHeight: 1.5,
          }}
        >
          {story.name}
          <br />
          <span style={{ color: paper, fontFamily: 'Store Geist', fontSize: 34 }}>
            {story.detail}
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            top: controlTop - 175,
            fontSize: tablet ? 32 : 42,
            lineHeight: 1.25,
            letterSpacing: -1,
          }}
        >
          {story.context}
          <br />
          <span style={{ color: '#999' }}>On your terms.</span>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            top: controlTop - 52,
            font: '21px monospace',
            color: '#aaa',
            letterSpacing: 1,
          }}
        >
          CHOOSE WHAT TO SHARE
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            top: controlTop,
            width: 930,
            height: crop.height * cropScale,
            overflow: 'hidden',
            borderRadius: 24,
            background: '#fff',
          }}
        >
          <Img
            src={staticFile(`${platform}-${editorial ? 'profile' : sources[slide - 1]}.png`)}
            style={{
              position: 'absolute',
              left: -crop.x * cropScale,
              top: -crop.y * cropScale,
              width: imageWidth * cropScale,
              maxWidth: 'none',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            top: controlTop + crop.height * cropScale + 28,
            fontSize: 26,
            color: '#aaa',
          }}
        >
          {story.caption}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** @param {PackageProps} props */
export function StoreShowcase({ platform = 'iphone', slide = 1 }) {
  const { width, height } = useVideoConfig();
  const s = width / 1206;
  const h = height / s;
  const tablet = platform === 'ipad';
  const android = platform === 'android';
  const light = slide === 2;
  const shotWidth = tablet ? 750 : android ? 640 : 760;
  const shotTop = tablet ? 470 : android ? 570 : 710;
  if (slide >= 2) return <StoreSourcePortrait platform={platform} slide={slide} />;
  return (
    <AbsoluteFill
      style={{
        background: light ? paper : ink,
        color: light ? ink : paper,
        fontFamily: 'Store Geist',
        overflow: 'hidden',
      }}
    >
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');}`}</style>
      <div
        style={{
          position: 'absolute',
          width: 1206,
          height: h,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <div style={{ position: 'absolute', left: 76, top: 58, fontSize: 34, letterSpacing: -1.5 }}>
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        <div
          style={{ position: 'absolute', right: 76, top: 72, font: '19px monospace', opacity: 0.6 }}
        >
          APP IN USE / 0{slide}
        </div>
        <h1
          style={{
            position: 'absolute',
            left: 70,
            top: tablet ? 165 : android ? 175 : 235,
            margin: 0,
            fontWeight: 400,
            fontSize: tablet ? 90 : 110,
            letterSpacing: -5,
            lineHeight: 1.04,
          }}
        >
          {(titles[slide - 1] ?? titles[0])?.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </h1>
        <div
          style={{
            position: 'absolute',
            left: 76,
            right: 76,
            top: tablet ? 385 : android ? 440 : 510,
            fontSize: 28,
            opacity: 0.7,
          }}
        >
          {descriptions[slide - 1]}
        </div>
        <div
          style={{
            position: 'absolute',
            left: (1206 - shotWidth) / 2,
            top: shotTop,
            width: shotWidth,
            padding: 8,
            border: `1px solid ${light ? '#aaa' : '#777'}`,
            borderRadius: tablet ? 24 : 42,
            background: '#282828',
          }}
        >
          <Img
            src={staticFile(`${platform}-${sources[slide - 1] ?? 'profile'}.png`)}
            style={{ display: 'block', width: '100%', borderRadius: tablet ? 16 : 34 }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 76,
            right: 76,
            bottom: 44,
            paddingTop: 18,
            borderTop: `1px solid ${light ? '#b0b0a8' : '#333'}`,
            fontSize: 20,
            opacity: 0.65,
          }}
        >
          You choose what to export and share.
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** @param {PackageProps} props */
export function StoreCreative({ format = 'header', motion = false }) {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const s = width / 1600;
  const h = height / s;
  const feature = format === 'feature';
  const detail = format === 'event-detail';
  const phase = motion ? Math.sin((frame / durationInFrames) * Math.PI * 2) : 0;
  const bg = feature ? paper : ink;
  const fg = feature ? ink : paper;
  return (
    <AbsoluteFill
      style={{ background: bg, color: fg, fontFamily: 'Store Geist', overflow: 'hidden' }}
    >
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');}`}</style>
      <div
        style={{
          position: 'absolute',
          width: 1600,
          height: h,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 160,
            top: detail ? 180 : 90,
            fontSize: 38,
            letterSpacing: -1.5,
          }}
        >
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        {feature ? (
          <>
            <h1
              style={{
                position: 'absolute',
                left: 160,
                top: 165,
                margin: 0,
                fontSize: 76,
                fontWeight: 400,
                letterSpacing: -3,
                lineHeight: 1.03,
              }}
            >
              Health. Screen time. Location.
              <br />
              <span style={{ color: '#6b6b64' }}>Context for your AI.</span>
            </h1>
            {[0, 1, 2].map((kind) => (
              <div
                key={kind}
                style={{
                  position: 'absolute',
                  left: 160 + kind * 440,
                  top: 365,
                  width: 390,
                  height: 280,
                  background: kind === 0 ? paper : ink,
                  borderRadius: 22,
                  transform: `translateY(${phase * (kind - 1) * 7}px)`,
                }}
              >
                <StoreMotif kind={kind} />
              </div>
            ))}
          </>
        ) : (
          <>
            <h1
              style={{
                position: 'absolute',
                left: 155,
                top: detail ? 340 : h * 0.28,
                margin: 0,
                fontSize: detail ? 145 : 112,
                fontWeight: 400,
                lineHeight: 1.01,
                letterSpacing: -6,
              }}
            >
              Your life.
              <br />
              Better context.
            </h1>
            <div
              style={{
                position: 'absolute',
                left: 160,
                top: detail ? 750 : h * 0.68,
                fontSize: detail ? 40 : 33,
                color: '#aaa',
                lineHeight: 1.5,
              }}
            >
              Health. Screen time. Location.
              <br />
              Personal data for your AI agent.
            </div>
            <div
              style={{
                position: 'absolute',
                left: detail ? 230 : 925,
                top: detail ? 1030 : h * 0.12,
                width: detail ? 1140 : 560,
                height: detail ? 1140 : 560,
                transform: `translateY(${phase * 8}px)`,
              }}
            >
              <Img
                src={staticFile('portrait.png')}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  maskImage: 'radial-gradient(black 35%,transparent 72%)',
                }}
              />
            </div>
            {[0, 1, 2].map((kind) => (
              <div
                key={kind}
                style={{
                  position: 'absolute',
                  left: detail ? 220 + kind * 410 : 905 + kind * 195,
                  top: detail ? h - 620 : h * 0.72,
                  width: detail ? 350 : 170,
                  height: detail ? 350 : 170,
                  background: kind === 0 ? paper : ink,
                  borderRadius: detail ? 30 : 18,
                  transform: `translateY(${phase * (kind - 1) * 9}px)`,
                }}
              >
                <StoreMotif kind={kind} />
              </div>
            ))}
          </>
        )}
      </div>
    </AbsoluteFill>
  );
}

/** @param {PackageProps} props */
export function StoreProduct({ product = 'lifetime' }) {
  const { width } = useVideoConfig();
  const light = product === 'lifetime';
  const yearly = product === 'yearly';
  return (
    <AbsoluteFill
      style={{
        background: light ? paper : ink,
        color: light ? ink : paper,
        fontFamily: 'Store Geist',
      }}
    >
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');}`}</style>
      <div
        style={{
          position: 'absolute',
          inset: width * 0.09,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: width * 0.035 }}>
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        <svg
          viewBox="0 0 400 250"
          width="100%"
          height="40%"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M90 180C20 180 25 85 100 90C100 0 245 5 260 88C350 50 400 180 310 180Z" />
          {light ? (
            <path d="M165 118c35-55 90-15 30 25-60-40-5-80 30-25" />
          ) : (
            <>
              <path d="M200 155V70m-26 26 26-26 26 26" />
              <path d="M135 215h130" />
            </>
          )}
        </svg>
        <div>
          <div style={{ fontSize: width * 0.098, lineHeight: 1.02, letterSpacing: -width * 0.004 }}>
            {light ? 'Lifetime' : 'Cloud'}
            <br />
            {light ? 'Unlock' : '100 GB'}
          </div>
          <div style={{ fontSize: width * 0.03, marginTop: width * 0.03, opacity: 0.6 }}>
            {light
              ? 'App access + 100 MB Cloud'
              : yearly
                ? 'Yearly subscription'
                : 'Monthly subscription'}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** A silent Google Play / YouTube product video using real screenshots. @param {PackageProps} props */
export function StoreTrailer({ platform = 'android' }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stage = Math.min(3, Math.floor(frame / 225));
  const light = stage === 1;
  const s = width / 1920;
  return (
    <AbsoluteFill
      style={{
        background: light ? paper : ink,
        color: light ? ink : paper,
        fontFamily: 'Store Geist',
        overflow: 'hidden',
      }}
    >
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');}`}</style>
      <div
        style={{
          position: 'absolute',
          width: 1920,
          height: height / s,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <div style={{ position: 'absolute', left: 110, top: 70, fontSize: 34 }}>
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        <h1
          style={{
            position: 'absolute',
            left: 100,
            top: 170,
            fontSize: 100,
            fontWeight: 400,
            letterSpacing: -4,
            lineHeight: 1.04,
            margin: 0,
          }}
        >
          {stage === 0 ? (
            <>
              Health. Screen time.
              <br />
              Location. Your context.
            </>
          ) : stage === 1 ? (
            <>
              A pulse. A pattern.
              <br />A fuller picture.
            </>
          ) : stage === 2 ? (
            <>
              Where did
              <br />
              the day go?
            </>
          ) : (
            <>
              Life has
              <br />
              coordinates.
            </>
          )}
        </h1>
        <div style={{ position: 'absolute', left: 110, top: 445, width: 920, height: 440 }}>
          {stage === 0 ? (
            <Img
              src={staticFile('portrait.png')}
              style={{ width: 440, height: 440, objectFit: 'contain' }}
            />
          ) : (
            <StoreMotif kind={stage - 1} />
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1325,
            top: 75,
            width: 400,
            padding: 7,
            border: '1px solid #888',
            borderRadius: 38,
            background: '#222',
          }}
        >
          <Img
            src={staticFile(`${platform}-${sources[stage]}.png`)}
            style={{ display: 'block', width: '100%', borderRadius: 30 }}
          />
        </div>
        <div style={{ position: 'absolute', left: 110, bottom: 65, fontSize: 31, opacity: 0.7 }}>
          {descriptions[stage]}
        </div>
      </div>
    </AbsoluteFill>
  );
}
