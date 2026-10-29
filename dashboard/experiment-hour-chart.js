/** Compact paired heatmaps use the returned goal-app observations without combining sources.
 * @param {ReturnType<typeof import('../core/screen-time-insights.js').experimentHourComparison>} comparison */
export function experimentHourChart(comparison) {
  const chart = document.createElement('section');
  chart.className = 'experiment-hour-chart';
  chart.setAttribute('aria-label', 'Paired experiment hourly usage');
  const maximum = Math.max(
    60000,
    ...comparison.cells.flatMap((c) => [c.baselineMs ?? 0, c.experimentMs ?? 0]),
  );
  const readout = document.createElement('p');
  readout.className = 'hour-map-readout';
  readout.setAttribute('aria-live', 'polite');
  readout.textContent = 'Select an hour · gaps unknown';
  const days = [...new Set(comparison.cells.map((c) => c.date))];
  for (const period of /** @type {const} */ (['baseline', 'experiment'])) {
    const title = document.createElement('h2');
    title.textContent = period === 'baseline' ? 'Baseline' : 'Experiment';
    chart.append(title);
    const axis = document.createElement('div');
    axis.className = 'hour-map-axis';
    for (const hour of ['00:00', '12:00', '23:00']) {
      const label = document.createElement('span');
      label.textContent = hour;
      axis.append(label);
    }
    chart.append(axis);
    for (const date of days) {
      const row = document.createElement('div');
      row.className = 'hour-map-row';
      const label = document.createElement('span');
      const cells = comparison.cells.filter((c) => c.date === date);
      label.textContent = (period === 'baseline' ? cells[0]?.baselineDate : date)?.slice(5) ?? '';
      row.append(label);
      for (const cell of cells) {
        const value = period === 'baseline' ? cell.baselineMs : cell.experimentMs;
        const elapsed = period === 'baseline' ? cell.baselineElapsedMs : cell.experimentElapsedMs;
        const day = period === 'baseline' ? cell.baselineDate : cell.date;
        const mark = document.createElement('button');
        mark.type = 'button';
        mark.className = `hour-map-cell${value === null ? ' unknown' : value === 0 ? ' zero' : ''}`;
        mark.textContent = elapsed === 0 ? '—' : value === null ? '·' : value === 0 ? '0' : '';
        if (value !== null && value > 0)
          mark.style.background = `color-mix(in srgb,var(--accent) ${20 + (80 * value) / maximum}%,var(--surface))`;
        const description = `${period} ${day} ${String(cell.hour).padStart(2, '0')}:00 · ${elapsed === 0 ? 'Nonexistent clock hour' : value === null ? 'Unknown usage' : `${(value / 60000).toFixed(1)} min observed`} · ${elapsed / 60000} elapsed minutes`;
        mark.setAttribute('aria-label', description);
        mark.title = description;
        mark.addEventListener('click', () => {
          readout.textContent = description;
        });
        row.append(mark);
      }
      chart.append(row);
    }
  }
  const legend = document.createElement('p');
  legend.className = 'subtle';
  legend.textContent = `Observed app minutes · 0–${(maximum / 60000).toFixed(1)} · · unknown · — clock gap`;
  chart.append(readout, legend);
  return chart;
}
