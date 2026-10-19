import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import transcript from '../public/agent-transcript.json';

const yellow = '#f8df59';
const mint = '#b5f4ce';
const coral = '#ff927a';
/** Frame-driven spring: every export renders the same trajectory. @param {number} frame @param {number} fps @param {number} [delay] */
function bounce(frame, fps, delay = 0) {
  return spring({ frame: frame - delay, fps, config: { mass: 1, stiffness: 130, damping: 12 } });
}
/** @param {{children: import('react').ReactNode, delay?: number, style?: import('react').CSSProperties}} props */
function Pop({ children, delay = 0, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = bounce(frame, fps, delay);
  return (
    <div
      style={{
        opacity: Math.min(1, Math.max(0, progress * 2)),
        transform: `translateY(${(1 - progress) * 55}px) scale(${0.85 + 0.15 * progress})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function AgentScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const connected = frame >= 28;
  const querying = frame >= 75;
  const result = frame >= 165;
  const zoom = bounce(frame, fps, 165);
  const count = Math.round(
    transcript.summary.totalSteps *
      interpolate(frame, [173, 202], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }),
  );
  const peak = Math.max(...transcript.summary.counts);
  const appRows = transcript.queries.flatMap((query) =>
    query.records.flatMap((row) => ('app' in row.native ? [row.native] : [])),
  );
  return (
    <AbsoluteFill
      style={{
        background: '#191b22',
        color: '#faf9f5',
        fontFamily: 'Arial, Helvetica, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(#ffffff13 1px, transparent 1px)',
          backgroundSize: '25px 25px',
        }}
      />
      <div style={{ position: 'absolute', top: 34, left: 48, fontSize: 20, fontWeight: 600 }}>
        myself.md
      </div>
      <div style={{ position: 'absolute', right: 48, top: 34, fontSize: 16, color: mint }}>
        ● Actual MCP run / synthetic phone data
      </div>
      {!result && (
        <>
          <Pop
            style={{
              position: 'absolute',
              top: 108,
              left: 65,
              fontSize: 55,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            {querying ? 'Ask. Fetch. Answer.' : 'Let’s connect the dots.'}
          </Pop>
          <Pop
            delay={7}
            style={{
              position: 'absolute',
              left: 65,
              top: 213,
              width: 1150,
              padding: '20px 26px',
              borderRadius: 22,
              background: '#ffffff0c',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 26,
              }}
            >
              <span>Sample iPhone</span>
              <span style={{ color: yellow }}>········································</span>
              <span
                style={{
                  background: connected ? mint : yellow,
                  color: '#191b22',
                  padding: '12px 20px',
                  borderRadius: 30,
                  fontWeight: 700,
                }}
              >
                {connected ? '✓ Agent connected' : 'Connecting…'}
              </span>
            </div>
            <div style={{ marginTop: 18, fontSize: 18, color: '#bbb' }}>
              Authenticated MCP · phone paired · owner-approved profile
            </div>
          </Pop>
          <Pop
            delay={38}
            style={{
              position: 'absolute',
              left: 65,
              top: 361,
              background: coral,
              color: '#191b22',
              padding: '22px 28px',
              borderRadius: '24px 24px 24px 4px',
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            How much did I move—and which apps took my time?
          </Pop>
          {querying && (
            <Pop
              delay={75}
              style={{
                position: 'absolute',
                left: 90,
                top: 461,
                fontFamily: 'monospace',
                fontSize: 20,
                lineHeight: 1.9,
              }}
            >
              <div style={{ color: mint }}>
                ↳ query_phone_data / Step count / 7 days {frame >= 107 ? '✓ complete' : '…'}
              </div>
              <div style={{ color: yellow }}>
                ↳ query_phone_data / App usage / 7 days {frame >= 129 ? '✓ complete' : '…'}
              </div>
              {frame >= 138 && (
                <div style={{ color: '#faf9f5' }}>
                  get_phone_request →{' '}
                  {transcript.queries.reduce((sum, query) => sum + query.records.length, 0)} records
                  returned. Let’s make sense of them.
                </div>
              )}
            </Pop>
          )}
        </>
      )}
      {result && (
        <div
          style={{
            position: 'absolute',
            left: 65,
            top: 105,
            width: 1150,
            transform: `translateY(${(1 - zoom) * 90}px) scale(${0.9 + zoom * 0.1})`,
          }}
        >
          <div style={{ fontSize: 22, color: mint, marginBottom: 16 }}>
            ✓ Both queries completed · selected data only
          </div>
          <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: -1.8, marginBottom: 24 }}>
            Here’s your week.
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <div
              style={{
                width: 615,
                background: yellow,
                color: '#191b22',
                borderRadius: 27,
                padding: 23,
              }}
            >
              <div style={{ fontSize: 20 }}>STEP COUNT / OCT 6–12</div>
              <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -4, marginTop: 8 }}>
                {count.toLocaleString('en-US')}{' '}
                <span style={{ fontSize: 26, letterSpacing: 0 }}>steps</span>
              </div>
              <div style={{ fontSize: 23 }}>
                {transcript.summary.dailyAverage.toLocaleString('en-US')} a day. Sunday was your
                biggest day.
              </div>
              <div
                style={{ display: 'flex', gap: 14, alignItems: 'end', height: 100, marginTop: 20 }}
              >
                {transcript.summary.counts.map((value, index) => (
                  <div key={value} style={{ flex: 1, textAlign: 'center' }}>
                    <div
                      style={{
                        height:
                          ((93 * value) / peak) * Math.max(0, bounce(frame, fps, 185 + index * 3)),
                        background: index === 5 ? '#191b22' : '#191b2240',
                        borderRadius: '9px 9px 4px 4px',
                      }}
                    />
                    <div style={{ marginTop: 7, fontSize: 16 }}>
                      {['T', 'W', 'T', 'F', 'S', 'S', 'M'][index]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#faf9f5',
                color: '#191b22',
                borderRadius: 27,
                padding: 23,
              }}
            >
              <div style={{ fontSize: 20 }}>APP USAGE / SAME SEVEN DAYS</div>
              <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -2, marginTop: 14 }}>
                {Math.floor(transcript.summary.appMinutes / 60)}h{' '}
                {transcript.summary.appMinutes % 60}m
              </div>
              <div style={{ fontSize: 21, color: '#555', marginBottom: 24 }}>
                across the returned app records
              </div>
              {appRows.map((row, index) => (
                <div key={row.app} style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 22,
                      marginBottom: 8,
                    }}
                  >
                    <span>{row.app}</span>
                    <span>{row.minutes}m</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 9, background: '#ddd' }}>
                    <div
                      style={{
                        width: `${((row.minutes ?? 0) / 184) * 100}%`,
                        height: '100%',
                        background: index === 0 ? coral : '#191b22',
                        borderRadius: 9,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 65,
          right: 65,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          color: '#aaa',
        }}
      >
        <span>Real server responses · illustrative agent view · synthetic source records</span>
        <span>My first export for AI · Step count + App usage</span>
      </div>
    </AbsoluteFill>
  );
}
