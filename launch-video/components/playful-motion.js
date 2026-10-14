import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const palette = {
  ink: '#191b22',
  paper: '#faf9f5',
  yellow: '#f8df59',
  mint: '#b5f4ce',
  coral: '#ff927a',
};
/** @param {number} frame @param {number} fps @param {number} [delay] */
export function bounce(frame, fps, delay = 0) {
  return spring({ frame: frame - delay, fps, config: { mass: 1, stiffness: 100, damping: 10 } });
}
/** @param {{children: import('react').ReactNode, delay?: number, tilt?: number, distance?: number, style?: import('react').CSSProperties}} props */
export function Pop({ children, delay = 0, tilt = 0, distance = 55, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = bounce(frame, fps, delay);
  return (
    <div
      style={{
        ...style,
        opacity: Math.min(1, Math.max(0, value * 3)),
        transform: `translateY(${(1 - value) * distance}px) scale(${0.92 + value * 0.08}) rotate(${tilt + (1 - value) * -6}deg)`,
      }}
    >
      {children}
    </div>
  );
}

/** Colored panels bridge cuts without extending the action timeline. */
export function CandyWipe() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {[palette.coral, palette.mint, palette.yellow].map((color, index) => (
        <div
          key={color}
          style={{
            position: 'absolute',
            top: -100,
            left: -100,
            width: 1500,
            height: 920,
            background: color,
            transform: `translateX(${interpolate(frame - index, [0, 7, 14], [-1550, 0, 1550], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px) skewX(-10deg)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

/** @param {{dark?: boolean}} props */
export function Confetti({ dark = false }) {
  const frame = useCurrentFrame();
  const colors = [palette.coral, palette.mint, palette.yellow];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 10 }, (_, index) => index + 1).map((id) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: `${(id * 31) % 100}%`,
            top: `${((id * 23) % 85) + 5}%`,
            width: id % 2 ? 14 : 24,
            height: id % 2 ? 24 : 14,
            borderRadius: id % 3 ? 4 : 20,
            background: dark ? colors[id % 3] : palette.ink,
            opacity: 0.5,
            transform: `translateY(${Math.sin(frame / 17 + id) * 12}px) rotate(${id * 35 + frame * 0.6}deg)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}
