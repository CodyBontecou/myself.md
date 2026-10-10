import { useEffect, useId, useRef } from 'react';
import { animate } from 'motion/mini';

const sources = [
  {
    name: 'Health',
    icon: 'apple-health',
    color: '#ff4775',
    x: 92,
    path: 'M92 132v22c0 25 16 30 40 30h68c24 0 40 12 40 36v24',
  },
  { name: 'Location', icon: 'google-maps', color: '#4285f4', x: 240, path: 'M240 132v112' },
  {
    name: 'Screen time',
    icon: 'google-chrome',
    color: '#34a853',
    x: 388,
    path: 'M388 132v22c0 25-16 30-40 30h-68c-24 0-40 12-40 36v24',
  },
];

/** An illustration of data categories, not direct connections to the pictured apps. */
export function HeroDataFlow() {
  const id = useId();
  const graphic = useRef(/** @type {SVGSVGElement|null} */ (null));
  useEffect(() => {
    const svg = graphic.current;
    if (!svg) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @type {ReturnType<typeof animate>[]} */
    let animations = [];
    function start() {
      animations.forEach((animation) => animation.cancel());
      animations = sources.flatMap((_source, index) => {
        const path = svg?.querySelector(`#${CSS.escape(id)}-route-${index}`);
        const pulse = svg?.querySelector(`#${CSS.escape(id)}-pulse-${index}`);
        if (!(path instanceof SVGPathElement) || !(pulse instanceof SVGElement)) return [];
        const length = path.getTotalLength();
        const transforms = Array.from({ length: 65 }, (_, step) => {
          const point = path.getPointAtLength((length * step) / 64);
          return `translate(${point.x}px, ${point.y}px)`;
        });
        if (reduced.matches) {
          pulse.style.transform = transforms[32] ?? 'none';
          return [
            animate(
              pulse,
              { opacity: [0.15, 0.5, 0.15] },
              { duration: 4, repeat: Infinity, ease: 'linear' },
            ),
          ];
        }
        return [
          animate(
            pulse,
            { transform: transforms, opacity: [0, 1, 1, 0] },
            { duration: 3.6, repeat: Infinity, delay: index * 1.2, ease: 'linear' },
          ),
        ];
      });
    }
    start();
    reduced.addEventListener('change', start);
    const observer = new IntersectionObserver(([entry]) => {
      animations.forEach((animation) =>
        entry?.isIntersecting ? animation.play() : animation.pause(),
      );
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
      reduced.removeEventListener('change', start);
      animations.forEach((animation) => animation.cancel());
    };
  }, [id]);
  return (
    <figure
      className="hero-data-flow"
      aria-label="Health, location and screen time flowing into a JSON file"
    >
      <svg ref={graphic} viewBox="0 0 480 244" role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>Your health, location and screen time, saved as JSON</title>
        <defs>
          <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0.4" y2="1">
            <stop stopColor="#fff" />
            <stop offset="1" stopColor="#f5f6f8" />
          </linearGradient>
          <clipPath id={`${id}-health-tile`}>
            <rect x="48" y="8" width="88" height="88" rx="24" />
          </clipPath>
          <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#22293b" floodOpacity=".09" />
          </filter>
        </defs>
        <g fill="none" strokeWidth="1.5" strokeLinecap="round">
          {sources.map((source, index) => (
            <g key={source.name}>
              <path id={`${id}-route-${index}`} className="hero-flow-lines" d={source.path} />
              <path d={source.path} stroke={source.color} opacity=".12" />
            </g>
          ))}
        </g>
        {sources.map((source, index) => (
          <g
            key={source.name}
            id={`${id}-pulse-${index}`}
            className="hero-flow-pulse"
            fill={source.color}
          >
            <circle r="9" opacity=".1" />
            <circle r="5" opacity=".2" />
            <circle r="2.5" />
          </g>
        ))}
        <path
          d="m235 236 5 5 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity=".6"
        />
        <g filter={`url(#${id}-shadow)`}>
          {sources.map((source) => (
            <rect
              key={source.name}
              className="hero-source-tile"
              fill={`url(#${id}-tile)`}
              x={source.x - 44}
              y="8"
              width="88"
              height="88"
              rx="24"
            />
          ))}
        </g>
        <image
          href="/dashboard/brand-icons/apple-health.png"
          clipPath={`url(#${id}-health-tile)`}
          x="48"
          y="8"
          width="88"
          height="88"
        />
        <image
          href="/dashboard/brand-icons/google-maps.png"
          x="212"
          y="24"
          width="56"
          height="56"
        />
        <image
          href="/dashboard/brand-icons/google-chrome.png"
          x="360"
          y="24"
          width="56"
          height="56"
        />
        <g className="hero-flow-labels" textAnchor="middle">
          <text x="92" y="120">
            Health
          </text>
          <text x="240" y="120">
            Location
          </text>
          <text x="388" y="120">
            Screen time
          </text>
        </g>
      </svg>
    </figure>
  );
}
