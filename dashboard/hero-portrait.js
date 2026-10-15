// Fixed positions keep the illustration identical across renders and appearances.
const layers = [0.4, 0.7, 1].map((depth, layer) => ({
  depth,
  dots: Array.from({ length: 28 }, (_, index) => {
    const angle = index * 2.39996 + layer * 0.8;
    const radius = 0.78 + ((index * 17 + layer * 11) % 23) / 100;
    return {
      x: 50 + Math.cos(angle) * 43 * radius,
      y: 44 + Math.sin(angle) * 40 * radius,
      size: index % 7 === 0 ? 3 : 2,
      opacity: 0.15 + ((index * 7) % 5) / 10,
    };
  }),
}));

/** Decorative background only: no data or permission state is encoded. */
export function HeroPortrait() {
  return (
    <div className="hero-portrait" aria-hidden="true">
      <div className="hero-portrait-sculpture" />
      {layers.map((layer) => (
        <div key={layer.depth} className="hero-portrait-particles">
          {layer.dots.map((dot) => (
            <span
              key={`${dot.x}-${dot.y}`}
              style={{
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: dot.size,
                height: dot.size,
                opacity: dot.opacity,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
