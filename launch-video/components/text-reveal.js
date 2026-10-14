// Adapted from SnapCN afce9f0, MIT; see SNAPCN-LICENSE. Animation unchanged.
import { useEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  getRemotionEnvironment,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
const PUSH_EASE = Easing.bezier(0.25, 1, 0.5, 1);
const ZOOM_EASE = Easing.bezier(0.5, 0, 0.05, 1);
const WORD_EASE = Easing.bezier(0.22, 0.8, 0.36, 1);
/** @param {{text?: string, fontSize?: number, color?: string, fontWeight?: number, fontFamily?: string, initialScale?: number, introDuration?: number, holdDuration?: number, pushScale?: number, recedeDuration?: number, assembleDuration?: number, wordDelay?: number, wordStagger?: number, wordDuration?: number, wordPush?: number, wordFade?: number, letterSpacing?: string, speed?: number, className?: string, align?: 'left' | 'center'}} props */
export function TextReveal({
  text = 'Meet Acme Billing',
  fontSize = 72,
  color = '#171717',
  fontWeight = 600,
  fontFamily = 'Arial, sans-serif',
  initialScale = 2.3,
  introDuration = 6,
  holdDuration = 12,
  pushScale = 1.06,
  recedeDuration = 14,
  assembleDuration = 30,
  wordDelay = 7,
  wordStagger = 4,
  wordDuration = 14,
  wordPush = 0.5,
  wordFade = 2,
  letterSpacing = '-0.03em',
  speed = 1,
  className,
  align = 'center',
}) {
  const frame = useCurrentFrame() * speed;
  const { width } = useVideoConfig();
  const face = fontFamily;
  const fill = color;
  const lineRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const leadRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const [handle] = useState(() => delayRender('text-reveal: measure line'));
  const baselineRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const [metrics, setMetrics] = useState(
    /** @type {{lineWidth: number, leadRatio: number, baseline: number} | null} */ (null),
  );
  useEffect(() => {
    const line = lineRef.current;
    const lead = leadRef.current;
    if (!line || !lead) {
      continueRender(handle);
      return;
    }
    const lineWidth2 = line.offsetWidth;
    const leadCenter = lead.offsetLeft + lead.offsetWidth / 2;
    const baseline2 = baselineRef.current?.offsetTop ?? line.offsetHeight * 0.8;
    setMetrics({ lineWidth: lineWidth2, leadRatio: leadCenter / lineWidth2, baseline: baseline2 });
  }, [handle]);
  useEffect(() => {
    if (metrics) continueRender(handle);
  }, [metrics, handle]);
  const words = text.split(' ').filter(Boolean);
  const ready = metrics !== null;
  const leadRatio = metrics?.leadRatio ?? 0.14;
  const lineWidth = metrics?.lineWidth ?? width * 0.5;
  const baseline = metrics?.baseline ?? fontSize * 0.88;
  const zoomStart = holdDuration;
  const slideDistance = lineWidth * (0.5 - leadRatio);
  return (
    <AbsoluteFill
      style={{
        alignItems: align === 'left' ? 'flex-start' : 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <span
        ref={lineRef}
        className={className}
        style={{
          position: 'relative',
          display: 'inline-block',
          fontSize,
          fontWeight,
          color: fill,
          letterSpacing,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          fontFamily: face,
          // Pivot on the lead word's centre horizontally — so the line scales out
          // from that word and it stays planted — and on the baseline vertically,
          // which is the point that must not move. See above.
          transformOrigin: `${leadRatio * 100}% ${baseline}px`,
          // Drift toward the viewer, then the fall back. The two curves never
          // overlap — the first clamps at the peak once the recede starts, the
          // second is 0 until then — so they sum into one continuous scale
          // running initialScale → peak → 1.
          scale:
            interpolate(frame, [0, holdDuration], [initialScale, initialScale * pushScale], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: PUSH_EASE,
            }) +
            interpolate(
              frame,
              [zoomStart, zoomStart + recedeDuration],
              [0, 1 - initialScale * pushScale],
              {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: ZOOM_EASE,
              },
            ),
          // The slide left: same start frame as the recede, but it runs about
          // twice as long on a heavily eased-in curve, so the line holds its
          // ground while the lead word falls back and only travels once it has
          // landed.
          translate: `${interpolate(
            frame,
            [zoomStart, zoomStart + assembleDuration],
            [slideDistance, 0],
            {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: ZOOM_EASE,
            },
          )}px`,
          opacity: ready ? 1 : 0,
          // Hinting off: renders each outline as it actually is, so the
          // letterforms stop re-snapping to the pixel grid as the size slides.
          // Also forces sub-pixel glyph positioning, which Blink otherwise only
          // enables above a device scale factor of 1 — and a render is exactly 1.
          textRendering: 'geometricPrecision',
          // Rendering and live playback want opposite things here, so give each
          // what it needs.
          //
          // A render has no time budget: the browser re-shapes and re-rasterises
          // every glyph at every new size, which is why the type stays genuinely
          // crisp, and the two fixes above are what make that smooth. Compositing
          // it would only replace real type with a rescaled texture — and worse,
          // a render is spread across parallel browser tabs, each of which
          // inherits a stale raster from whatever scale it drew last, so the same
          // frame comes out differently depending on which tab drew it.
          //
          // The Player is the opposite: one continuous tab, and roughly eight
          // milliseconds a frame on a 120Hz screen. Re-shaping a line of type at
          // a brand-new size every frame is the most expensive way to draw text,
          // and a frame that misses the budget is simply shown for the wrong
          // length of time — stutter that no amount of CSS can fix. So for live
          // playback, hand the scale to the compositor: measured on a single
          // continuous tab it is smooth (0.016px of judder) with no loss of
          // sharpness at all.
          ...(getRemotionEnvironment().isRendering ? null : { willChange: 'transform' }),
        }}
      >
        {words.map((word, i) => {
          const isLead = i === 0;
          const pushStart = zoomStart + wordDelay + (i - 1) * wordStagger;
          const opacity = isLead
            ? interpolate(frame, [0, introDuration], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : interpolate(frame, [pushStart, pushStart + wordFade], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
          return (
            <span
              key={`${word}-${words.slice(0, i).join(' ')}`}
              ref={isLead ? leadRef : void 0}
              style={{
                display: 'inline-block',
                opacity,
                translate: isLead
                  ? void 0
                  : `${interpolate(
                      frame,
                      [pushStart, pushStart + wordDuration],
                      [wordPush * fontSize, 0],
                      {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                        easing: WORD_EASE,
                      },
                    )}px`,
              }}
            >
              {word}
              {i < words.length - 1 ? '\xA0' : ''}
            </span>
          );
        })}
        {/* Baseline ruler. An empty, zero-sized inline-block aligns its bottom
       edge to the text baseline, so `offsetTop` reads the baseline straight
       off the font's real metrics. Zero-sized, so it changes no layout. */}
        <span ref={baselineRef} style={{ display: 'inline-block', width: 0, height: 0 }} />
      </span>
    </AbsoluteFill>
  );
}
