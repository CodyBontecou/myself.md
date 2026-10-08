import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/ui/tooltip.js';

/** @param {string} day */
function dateLabel(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** @param {{workspace:import('./session.js').Workspace,asOf:string}} props */
export function ExportActivity({ workspace, asOf }) {
  const [selected, setSelected] = useState('');
  const calendar = useRef(/** @type {HTMLDivElement|null} */ (null));
  const today = asOf.slice(0, 10);
  useEffect(() => {
    if (calendar.current) calendar.current.scrollLeft = calendar.current.scrollWidth;
  }, []);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 364);
  const cutoff = start.toISOString().slice(0, 10);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const counts = new Map();
  for (const item of workspace.exports) {
    counts.set(item.day, (counts.get(item.day) ?? 0) + 1);
  }
  const weeks = Array.from({ length: 53 }, (_week, column) =>
    Array.from({ length: 7 }, (_day, row) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + column * 7 + row);
      const day = date.toISOString().slice(0, 10);
      return { day, date, count: counts.get(day) ?? 0, outside: day > today || day < cutoff };
    }),
  );
  const days = weeks.flat().filter((day) => !day.outside);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const active = days.filter((day) => day.count > 0).length;
  const selectedDay = days.find((day) => day.day === selected);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export activity</CardTitle>
        <CardDescription>
          {total} stored {total === 1 ? 'export' : 'exports'} across {active}{' '}
          {active === 1 ? 'day' : 'days'} · Past year
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div ref={calendar} className="export-calendar-scroll overflow-x-auto pb-2">
          <div className="export-calendar" aria-label="Stored exports by date">
            <div className="export-calendar-labels" aria-hidden="true">
              <span />
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <span key={day}>{['Mon', 'Wed', 'Fri'].includes(day) ? day : ''}</span>
              ))}
            </div>
            <TooltipProvider delayDuration={150}>
              {weeks.map((week, index) => {
                const first = week[0];
                if (!first) return null;
                const month = week.find((day) => day.date.getUTCDate() === 1);
                const label = month ?? (index === 0 && first.date.getUTCDate() < 25 ? first : null);
                return (
                  <div className="export-calendar-week" key={first.day}>
                    <span className="export-calendar-month" aria-hidden="true">
                      {label?.date.toLocaleDateString(undefined, {
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                    {week.map(({ day, count, outside }) =>
                      outside ? (
                        <span className="export-calendar-future" key={day} />
                      ) : (
                        <Tooltip key={day}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="export-calendar-day"
                              data-level={Math.min(count, 4)}
                              aria-label={`${count} ${count === 1 ? 'export' : 'exports'} on ${dateLabel(day)}`}
                              aria-pressed={selected === day}
                              onClick={() => setSelected(day)}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            {count} {count === 1 ? 'export' : 'exports'} on {dateLabel(day)}
                          </TooltipContent>
                        </Tooltip>
                      ),
                    )}
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p role="status">
            {selectedDay
              ? `${dateLabel(selectedDay.day)} · ${selectedDay.count} stored ${selectedDay.count === 1 ? 'export' : 'exports'}`
              : total === 0
                ? 'Your cloud exports will appear here. Select a date to see its count.'
                : 'Select a date to see its export count.'}
          </p>
          <div
            className="flex items-center gap-1.5"
            aria-label="Intensity: 0, 1, 2, 3, or 4 or more exports"
          >
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                className="export-calendar-swatch"
                data-level={level}
                key={level}
                aria-hidden="true"
              />
            ))}
            <span>More</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Based on export dates of files currently stored in the cloud. Expired and deleted files
          are excluded.
        </p>
      </CardContent>
    </Card>
  );
}
