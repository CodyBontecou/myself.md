// SnapCN phone-frame, afce9f0 (MIT). Rise/float rig and device geometry ported
// to checkJs; unused showcase, theme provider and ride example omitted.
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

/** @param {{children: import('react').ReactNode, scale?: number, floatAmplitude?: number}} props */
export function PhoneFrame({ children, scale = 1, floatAmplitude = 6 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = /** @type {const} */ ({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 12], [0, 1], clamp);
  const rise = interpolate(frame, [0, 26], [70, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const local = Math.max(0, frame - 30);
  const bob = -Math.sin((local / (fps * 4.5)) * Math.PI * 2) * floatAmplitude;
  const buttons = [
    { side: 'left', top: 118, length: 26 },
    { side: 'left', top: 166, length: 46 },
    { side: 'left', top: 222, length: 46 },
    { side: 'right', top: 176, length: 68 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity, translate: `0px ${rise + bob}px`, scale: `${scale}` }}>
        <div
          style={{
            position: 'relative',
            width: 320,
            height: 656,
            borderRadius: 53,
            background: '#171717',
            padding: 12,
            boxSizing: 'border-box',
            boxShadow: '0 24px 60px #00000020',
          }}
        >
          {buttons.map((button) => (
            <div
              key={`${button.side}-${button.top}`}
              style={{
                position: 'absolute',
                top: button.top,
                [button.side]: -3,
                width: 3,
                height: button.length,
                borderRadius: 2,
                background: '#171717',
              }}
            />
          ))}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: 41,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
