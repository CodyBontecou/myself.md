import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';

const paper = '#e9e8e2';
const ink = '#080808';
const names = ['Health', 'Screen time', 'Location'];

/** @param {{kind: number, size?: number}} props */
function SourceIcon({ kind, size = 44 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 0 ? (
        <path d="M27 7c-3-3-7-2-11 2C12 5 8 4 5 7c-6 7 4 14 11 20C23 21 33 14 27 7Z" />
      ) : kind === 1 ? (
        <>
          <path d="M8 3h16M8 29h16M10 3c0 6 0 8 6 13-6 5-6 7-6 13M22 3c0 6 0 8-6 13 6 5 6 7 6 13" />
          <path d="m12 25 4-4 4 4" />
        </>
      ) : (
        <>
          <path d="M26 13c0 8-10 17-10 17S6 21 6 13a10 10 0 1 1 20 0Z" />
          <circle cx="16" cy="13" r="3.5" />
        </>
      )}
    </svg>
  );
}

/** A decorative rhythm, with no measurements or personal records. */
function HealthRhythm() {
  return (
    <svg viewBox="0 0 1060 800" width="100%" height="100%" fill="none">
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d="M530 690C250 500 115 355 185 218C260 75 415 100 530 235C645 100 800 75 875 218C945 355 810 500 530 690Z"
          transform={`translate(${530 * (1 - (1 - i * 0.035))} ${400 * (1 - (1 - i * 0.035))}) scale(${1 - i * 0.035})`}
          stroke={i ? '#b8b7b0' : ink}
          strokeWidth={i ? 1 : 3}
        />
      ))}
      <path
        d="M0 402H280L330 350L390 470L470 220L550 570L620 355L680 402H1060"
        stroke={paper}
        strokeWidth="34"
      />
      <path
        d="M0 402H280L330 350L390 470L470 220L550 570L620 355L680 402H1060"
        stroke={ink}
        strokeWidth="5"
      />
      <circle cx="280" cy="402" r="9" fill={ink} />
      <circle cx="680" cy="402" r="9" fill={ink} />
    </svg>
  );
}

/** An abstract dial, not a chart of a user's app usage. */
function TimeDial() {
  return (
    <svg viewBox="0 0 1060 1060" width="100%" height="100%" fill="none">
      <circle cx="530" cy="530" r="430" stroke="#343434" />
      {Array.from({ length: 72 }, (_, i) => {
        const a = ((i * 5 - 90) * Math.PI) / 180;
        const outer = 430;
        const inner = i % 6 === 0 ? 386 : 410;
        return (
          <line
            key={i}
            x1={530 + Math.cos(a) * inner}
            y1={530 + Math.sin(a) * inner}
            x2={530 + Math.cos(a) * outer}
            y2={530 + Math.sin(a) * outer}
            stroke={i % 6 === 0 ? paper : '#777'}
            strokeWidth={i % 6 === 0 ? 3 : 1}
          />
        );
      })}
      <circle cx="530" cy="530" r="335" fill={paper} />
      {Array.from({ length: 18 }, (_, i) => (
        <path
          key={i}
          d={`M${230 + i * 14} 760Q${530 + i * 8} ${290 + i * 7} ${790 + i * 4} 310`}
          stroke="#bcbcb4"
        />
      ))}
      <path
        d="M470 405H590M470 655H590M485 405C485 475 490 485 530 530C570 575 575 585 575 655M575 405C575 475 570 485 530 530C490 575 485 585 485 655"
        stroke={ink}
        strokeWidth="8"
      />
      <path d="M312 846A390 390 0 0 1 151 437" stroke={paper} strokeWidth="11" />
      <circle cx="312" cy="846" r="13" fill={paper} />
      <circle cx="151" cy="437" r="13" fill={paper} />
    </svg>
  );
}

/** A schematic trail; no real geography or location history. */
function LocationTrail() {
  return (
    <svg viewBox="0 0 1060 1050" width="100%" height="100%" fill="none">
      {Array.from({ length: 13 }, (_, i) => (
        <path
          key={i}
          d={`M-80 ${180 + i * 48}C200 ${-40 + i * 45} 430 ${560 + i * 24} 710 ${250 + i * 47}S1150 ${260 + i * 43} 1200 ${70 + i * 53}`}
          stroke="#292929"
          strokeWidth="2"
        />
      ))}
      <path d="M110 850C540 880 120 570 540 570S630 230 900 190" stroke="#555" strokeWidth="28" />
      <path
        d="M110 850C540 880 120 570 540 570S630 230 900 190"
        stroke={paper}
        strokeWidth="4"
        strokeDasharray="7 10"
      />
      <circle cx="110" cy="850" r="24" fill={ink} stroke={paper} strokeWidth="4" />
      <circle cx="540" cy="570" r="18" fill={paper} />
      <circle cx="540" cy="570" r="44" stroke="#8a8a85" />
      <path
        d="M960 125C960 173 900 225 900 225S840 173 840 125A60 60 0 1 1 960 125Z"
        fill={paper}
      />
      <circle cx="900" cy="125" r="20" fill={ink} />
      <path d="M128 850H330M558 570H805" stroke="#777" />
      <text x="160" y="900" fill="#aaa" fontFamily="Store Geist" fontSize="27">
        Only when you record.
      </text>
      <text x="610" y="615" fill="#aaa" fontFamily="Store Geist" fontSize="27">
        Only what you share.
      </text>
    </svg>
  );
}

/** Focused, unmodified crop of an actual source-selection row. @param {{android: boolean, kind: number, top: number}} props */
function AppDetail({ android, kind, top }) {
  const sourceY = android ? ([858, 974, 1090][kind] ?? 858) : ([1010, 1145, 1280][kind] ?? 1010);
  const sourceWidth = android ? 1080 : 1206;
  return (
    <div style={{ position: 'absolute', left: 76, right: 76, top }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 22,
          letterSpacing: 1,
          color: '#92928b',
          marginBottom: 20,
        }}
      >
        <span>CHOOSE WHAT TO SHARE</span>
        <span>IN MYSELF.MD ↗</span>
      </div>
      <div
        style={{
          height: android ? 112 : 122,
          overflow: 'hidden',
          borderRadius: 24,
          background: '#fff',
          border: '1px solid #777',
        }}
      >
        <Img
          src={staticFile(android ? 'android-profile.png' : 'iphone-profile.png')}
          style={{
            display: 'block',
            width: 1054,
            maxWidth: 'none',
            transform: `translateY(-${(sourceY * 1054) / sourceWidth}px)`,
          }}
        />
      </div>
    </div>
  );
}

/** Distinct editorial compositions for each real data source. @param {{platform?: string, slide?: number, tablet?: boolean, feature?: boolean}} props */
export function StoreArtwork({ platform = 'iphone', slide = 1, tablet = false, feature = false }) {
  const { width, height } = useVideoConfig();
  const scale = width / (feature ? 1024 : 1206);
  const h = height / scale;
  const android = platform === 'android';
  const light = slide === 2 && !feature;
  const fg = light ? ink : paper;
  const bg = light ? paper : ink;
  const headings = [
    ['Your life.', 'Better context.'],
    ['A pulse.', 'A pattern.', 'A fuller picture.'],
    ['Where did', 'the day go?'],
    ['Life has', 'coordinates.'],
  ];
  const heading = headings[slide - 1] ?? headings[0] ?? [];
  const descriptions = [
    'Health, screen time and location data for your AI.',
    'Sleep, activity and heart-rate data. On your terms.',
    'App usage and time spent, ready for your agent.',
    'Export the location history you choose to record.',
  ];
  return (
    <AbsoluteFill
      style={{ background: bg, color: fg, fontFamily: 'Store Geist', overflow: 'hidden' }}
    >
      <style>{`@font-face{font-family:'Store Geist';src:url('${staticFile('geist.ttf')}') format('truetype');font-weight:100 900;}`}</style>
      <div
        style={{
          position: 'absolute',
          width: feature ? 1024 : 1206,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div style={{ position: 'absolute', left: 76, top: 58, fontSize: 34, letterSpacing: -1.5 }}>
          myself<span style={{ opacity: 0.5 }}>.md</span>
        </div>
        {!feature && (
          <div
            style={{
              position: 'absolute',
              right: 76,
              top: 73,
              font: '19px monospace',
              opacity: 0.6,
            }}
          >
            0{slide} / {tablet ? '01' : '04'}
          </div>
        )}
        {feature ? (
          <>
            <Img
              src={staticFile('portrait.png')}
              style={{
                position: 'absolute',
                width: 540,
                right: -50,
                top: -20,
                opacity: 0.85,
                maskImage: 'linear-gradient(to right,transparent,black 20%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 70,
                top: 140,
                fontSize: 68,
                lineHeight: 1.02,
                letterSpacing: -3,
              }}
            >
              A little more you.
              <br />
              For your AI.
            </div>
            <div
              style={{
                position: 'absolute',
                left: 76,
                bottom: 58,
                display: 'flex',
                gap: 30,
                fontSize: 22,
              }}
            >
              {names.map((name, i) => (
                <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SourceIcon kind={i} size={27} />
                  {name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                left: 76,
                top: 205,
                font: '21px monospace',
                letterSpacing: 3,
                opacity: 0.65,
              }}
            >
              {slide === 1
                ? 'PERSONAL DATA. REAL CONTEXT.'
                : `0${slide - 1} / ${names[slide - 2]?.toUpperCase()}`}
            </div>
            <h1
              style={{
                position: 'absolute',
                left: 68,
                top: 260,
                margin: 0,
                fontSize: slide === 2 ? 133 : 154,
                lineHeight: 0.99,
                fontWeight: 400,
                letterSpacing: -8,
              }}
            >
              {heading.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </h1>
            {slide === 1 ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: 76,
                    top: 636,
                    display: 'flex',
                    gap: 30,
                    fontSize: 42,
                    zIndex: 2,
                    background: ink,
                    padding: '16px 0',
                  }}
                >
                  {names.map((name, i) => (
                    <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <SourceIcon kind={i} size={46} />
                      {name}
                    </span>
                  ))}
                </div>
                <Img
                  src={staticFile('portrait.png')}
                  style={{
                    position: 'absolute',
                    width: 990,
                    left: -230,
                    top: tablet ? 720 : h * 0.36 - 50,
                    opacity: 0.85,
                    maskImage: 'radial-gradient(ellipse at 50% 45%,black 30%,transparent 70%)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 620,
                    top: tablet ? 760 : h * 0.36,
                    width: 490,
                    padding: 9,
                    background: '#242424',
                    border: '2px solid #686868',
                    borderRadius: tablet ? 28 : 48,
                    transform: 'rotate(-4deg)',
                  }}
                >
                  <Img
                    src={staticFile(
                      tablet
                        ? 'ipad-welcome.png'
                        : android
                          ? 'android-profile.png'
                          : 'iphone-profile.png',
                    )}
                    style={{ width: '100%', display: 'block', borderRadius: tablet ? 18 : 37 }}
                  />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 76,
                    top: h - 360,
                    width: 490,
                    fontSize: 40,
                    lineHeight: 1.22,
                    letterSpacing: -1,
                    background: tablet ? '#080808d9' : 'transparent',
                    borderRadius: 16,
                    padding: tablet ? '16px 0' : 0,
                  }}
                >
                  Your health, habits,
                  <br />
                  and places.
                  <br />
                  <span style={{ color: '#92928b' }}>Context for your AI.</span>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: 76,
                    top: slide === 2 ? 710 : 625,
                    fontSize: 28,
                    color: light ? '#62625b' : '#aaa',
                  }}
                >
                  {descriptions[slide - 1]}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 35,
                    right: 35,
                    top: slide === 2 ? 845 : 740,
                    height: slide === 2 ? Math.min(820, h - 1665) : Math.min(1050, h - 1450),
                  }}
                >
                  {slide === 2 ? <HealthRhythm /> : slide === 3 ? <TimeDial /> : <LocationTrail />}
                </div>
                {slide === 2 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 76,
                      right: 76,
                      top: h - 750,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 30,
                      borderTop: '1px solid #b0b0a8',
                      paddingTop: 24,
                    }}
                  >
                    <span>Sleep.</span>
                    <span>Activity.</span>
                    <span>Heart rate.</span>
                  </div>
                )}
                <AppDetail android={android} kind={slide - 2} top={h - 580} />
                <div
                  style={{
                    position: 'absolute',
                    left: 76,
                    right: 76,
                    top: h - 225,
                    fontSize: 35,
                    lineHeight: 1.2,
                    letterSpacing: -1,
                  }}
                >
                  {slide === 2
                    ? 'Your body brings the context.'
                    : slide === 3
                      ? 'Your attention has a story.'
                      : 'Your places add perspective.'}
                </div>
              </>
            )}
            <div
              style={{
                position: 'absolute',
                left: 76,
                right: 76,
                bottom: 48,
                borderTop: `1px solid ${light ? '#b0b0a8' : '#333'}`,
                paddingTop: 22,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 20,
                opacity: 0.65,
              }}
            >
              <span>You choose what to export and share.</span>
              <span>myself.md</span>
            </div>
          </>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function StoreIcon() {
  return <Img src={staticFile('portrait.png')} style={{ width: '100%', height: '100%' }} />;
}

/** @param {{kind?: number}} props */
export function StoreMotif({ kind = 0 }) {
  return kind === 0 ? <HealthRhythm /> : kind === 1 ? <TimeDial /> : <LocationTrail />;
}
