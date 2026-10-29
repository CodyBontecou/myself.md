/** @template {keyof SVGElementTagNameMap} T @param {T} tag @param {Record<string,string|number>} attrs @param {string} [text] */
function svgNode(tag, attrs, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  element.textContent = text;
  return element;
}

/** Interactive ranges: no guessed midpoints or fitted relationship.
 * @param {ReturnType<typeof import('../core/pre-sleep-usage.js').preSleepUsage>} windows
 * @param {number} maxMinutes
 * @param {(id:string)=>void} select */
export function sleepPerformanceChart(windows, maxMinutes, select) {
  const figure = document.createElement('figure');
  figure.style.margin = '16px 0';
  const svg = svgNode('svg', {
    viewBox: '0 0 480 355',
    class: 'performance-chart',
    role: 'group',
    'aria-label': 'Pre-sleep usage and WHOOP sleep performance chart',
  });
  svg.append(svgNode('text', { x: 45, y: 18 }, 'WHOOP performance (%)'));
  for (const value of [0, 25, 50, 75, 100]) {
    const y = 300 - value * 2.6;
    svg.append(
      svgNode('line', { x1: 45, x2: 465, y1: y, y2: y, stroke: 'currentColor', opacity: 0.15 }),
      svgNode('text', { x: 38, y: y + 4, 'text-anchor': 'end' }, String(value)),
    );
  }
  const x = (/** @type {number} */ ms) => 45 + (420 * ms) / 60000 / maxMinutes;
  for (const value of [0, maxMinutes / 2, maxMinutes])
    svg.append(
      svgNode('text', { x: x(value * 60000), y: 320, 'text-anchor': 'middle' }, value.toFixed(0)),
    );
  svg.append(
    svgNode('text', { x: 255, y: 347, 'text-anchor': 'middle' }, 'Screen time before sleep (min)'),
  );
  const points = windows.flatMap((w) =>
    w.lowerMs === null || w.upperMs === null || w.sleepPerformancePercent === null
      ? []
      : [
          {
            ...w,
            lowerMs: w.lowerMs,
            upperMs: w.upperMs,
            sleepPerformancePercent: w.sleepPerformancePercent,
          },
        ],
  );
  for (const point of points) {
    const y = 300 - point.sleepPerformancePercent * 2.6,
      left = x(point.lowerMs),
      right = x(point.upperMs);
    const label = `${point.nap ? 'Nap' : 'Sleep'} ${point.sessionStart} · ${point.sleepPerformancePercent}% WHOOP performance · ${(point.lowerMs / 60000).toFixed(1)}–${(point.upperMs / 60000).toFixed(1)} min observed usage`;
    const mark = svgNode('g', { role: 'button', tabindex: 0, 'aria-label': label });
    mark.append(
      svgNode('title', {}, label),
      svgNode('line', {
        x1: left,
        x2: right,
        y1: y,
        y2: y,
        stroke: 'transparent',
        'stroke-width': 18,
      }),
    );
    const color = point.nap ? '#298f83' : '#8875ec';
    mark.append(
      svgNode('line', {
        x1: left,
        x2: right,
        y1: y,
        y2: y,
        stroke: color,
        'stroke-width': 3,
        'stroke-dasharray': point.nap ? '5 3' : 'none',
      }),
    );
    for (const edge of [left, right])
      mark.append(
        svgNode('line', {
          x1: edge,
          x2: edge,
          y1: y - 5,
          y2: y + 5,
          stroke: color,
          'stroke-width': 2,
        }),
      );
    if (left === right) mark.append(svgNode('circle', { cx: left, cy: y, r: 4, fill: color }));
    mark.addEventListener('click', () => select(point.sessionId));
    mark.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(point.sessionId);
      }
    });
    svg.append(mark);
  }
  const caption = document.createElement('figcaption');
  caption.textContent = points.length
    ? '2 h before sleep · Ranges = observed usage · Dashed = naps'
    : 'No paired observations. See sessions for unknown values.';
  figure.append(svg, caption);
  return figure;
}
