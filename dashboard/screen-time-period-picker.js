import { screenTimePresetPeriod } from '../core/screen-time-period.js';

/** @param {string} date @param {number} offset */
function shiftDate(date, offset) {
  return new Date(Date.parse(date) + offset * 86400000).toISOString().slice(0, 10);
}
/** Latest start of seven completed local calendar days. Server validation remains authoritative.
 * @param {string} timezone */
function latestWeek(timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return shiftDate(`${parts.year}-${parts.month}-${parts.day}`, -7);
}
/** @param {string} label @param {HTMLElement} control */
function field(label, control) {
  const node = document.createElement('label');
  control.setAttribute('aria-label', label);
  node.append(document.createTextNode(label), control);
  return node;
}
/** @param {{weekStart:string,comparisonWeekStart:string,weekEnd:string,comparisonWeekEnd:string,timezone:string,day:string,hour:string,onSelect:(date:string,hour:string)=>void,onLoad:(weekStart:string,timezone:string,comparisonWeekStart:string,weekEnd:string,comparisonWeekEnd:string)=>Promise<void>}} options */
export function screenTimePeriodPicker({
  weekStart,
  comparisonWeekStart,
  weekEnd,
  comparisonWeekEnd,
  timezone,
  day,
  hour,
  onSelect,
  onLoad,
}) {
  const form = document.createElement('form');
  form.className = 'period-picker';
  form.setAttribute('aria-label', 'Review period');
  const fields = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Explore a period';
  fields.append(legend);
  const weekRow = document.createElement('div');
  weekRow.className = 'period-week';
  const week = document.createElement('input');
  week.type = 'date';
  week.required = true;
  week.value = weekStart;
  week.max = shiftDate(latestWeek(timezone), 6);

  const end = document.createElement('input');
  end.type = 'date';
  end.required = true;
  end.value = weekEnd;
  const compareEnd = document.createElement('input');
  compareEnd.type = 'date';
  compareEnd.required = true;
  compareEnd.value = comparisonWeekEnd;
  end.max = week.max;
  compareEnd.max = week.max;
  const rangeMode = document.createElement('select');
  for (const [value, label] of [
    ['week', 'Seven days'],
    ['custom', 'Custom range'],
  ]) {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? '';
    rangeMode.append(option);
  }
  rangeMode.value = weekEnd === shiftDate(weekStart, 6) ? 'week' : 'custom';
  end.disabled = rangeMode.value === 'week';
  const comparison = document.createElement('input');
  comparison.type = 'date';
  comparison.required = true;
  comparison.value = comparisonWeekStart;
  comparison.max = week.max;
  const comparisonMode = document.createElement('select');
  for (const [value, label] of /** @type {const} */ ([
    ['previous', 'Previous period'],
    ['custom', 'Choose dates'],
  ])) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    comparisonMode.append(option);
  }
  comparisonMode.value =
    comparisonWeekStart ===
      shiftDate(weekStart, -(Date.parse(weekEnd) - Date.parse(weekStart)) / 86400000 - 1) &&
    comparisonWeekEnd === shiftDate(weekStart, -1)
      ? 'previous'
      : 'custom';
  function syncDates() {
    end.disabled = rangeMode.value === 'week';
    if (end.disabled) end.value = shiftDate(week.value, 6);
    comparison.disabled = comparisonMode.value === 'previous';
    compareEnd.disabled = comparison.disabled;
    if (comparison.disabled && week.value && end.value) {
      comparison.value = shiftDate(
        week.value,
        -(Date.parse(end.value) - Date.parse(week.value)) / 86400000 - 1,
      );
      compareEnd.value = shiftDate(week.value, -1);
    }
  }
  rangeMode.addEventListener('change', syncDates);
  comparisonMode.addEventListener('change', syncDates);
  week.addEventListener('change', syncDates);
  end.addEventListener('change', syncDates);
  syncDates();
  const zone = document.createElement('input');
  zone.type = 'text';
  zone.required = true;
  zone.maxLength = 100;
  zone.value = timezone;
  zone.spellcheck = false;
  zone.autocomplete = 'off';
  const load = document.createElement('button');
  load.type = 'submit';
  load.className = 'drill-link primary';
  load.textContent = 'Load review';
  load.setAttribute('aria-label', 'Load review');
  const status = document.createElement('p');
  status.className = 'subtle period-status';
  status.setAttribute('role', 'status');
  const presets = document.createElement('div');
  presets.className = 'period-presets';
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', 'Quick date presets');
  for (const [preset, label] of /** @type {const} */ ([
    ['yesterday', 'Yesterday'],
    ['last_7_days', 'Last 7 days'],
    ['last_30_days', 'Last 30 days'],
  ])) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'drill-link';
    control.textContent = label;
    const active = screenTimePresetPeriod(preset, shiftDate(latestWeek(timezone), 7));
    control.setAttribute(
      'aria-pressed',
      String(
        active.weekStart === weekStart &&
          active.weekEnd === weekEnd &&
          active.comparisonWeekStart === comparisonWeekStart &&
          active.comparisonWeekEnd === comparisonWeekEnd,
      ),
    );
    control.addEventListener('click', () => {
      try {
        const dates = screenTimePresetPeriod(preset, shiftDate(latestWeek(zone.value.trim()), 7));
        rangeMode.value = preset === 'last_7_days' ? 'week' : 'custom';
        week.value = dates.weekStart;
        end.value = dates.weekEnd;
        comparisonMode.value = 'previous';
        syncDates();
        void loadWeek(dates.weekStart);
      } catch {
        status.textContent = 'Enter a valid IANA timezone, such as America/Puerto_Rico.';
        status.setAttribute('role', 'alert');
      }
    });
    presets.append(control);
  }
  /** @param {string} start */
  async function loadWeek(start) {
    if (fields.disabled) return;
    status.removeAttribute('role');
    status.setAttribute('role', 'status');
    try {
      const maximum = shiftDate(latestWeek(zone.value.trim()), 6);
      const finish = rangeMode.value === 'week' ? shiftDate(start, 6) : end.value;
      const count = (Date.parse(finish) - Date.parse(start)) / 86400000 + 1;
      const compareStart =
        comparisonMode.value === 'previous' ? shiftDate(start, -count) : comparison.value;
      const compareFinish =
        comparisonMode.value === 'previous' ? shiftDate(start, -1) : compareEnd.value;
      const compareCount = (Date.parse(compareFinish) - Date.parse(compareStart)) / 86400000 + 1;
      for (const [first, last, length] of [
        [start, finish, count],
        [compareStart, compareFinish, compareCount],
      ]) {
        if (
          !first ||
          !last ||
          !Number.isInteger(length) ||
          Number(length) < 1 ||
          Number(length) > 31
        )
          throw new Error(
            'Choose inclusive ranges of 1–31 days, with each end on or after its start.',
          );
        if (String(last) > maximum) throw new Error('Choose completed days in this timezone.');
      }
      if (compareStart <= finish && start <= compareFinish)
        throw new Error('Choose non-overlapping review and comparison date ranges.');
      if (
        start === weekStart &&
        zone.value.trim() === timezone &&
        compareStart === comparisonWeekStart &&
        finish === weekEnd &&
        compareFinish === comparisonWeekEnd
      ) {
        status.textContent =
          'These periods and timezone are already loaded. Choose a day or hour below.';
        return;
      }
      fields.disabled = true;
      presets.setAttribute('aria-busy', 'true');
      presets.querySelectorAll('button').forEach((control) => {
        control.disabled = true;
      });
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'Discovering shared exports and loading this period…';
      await onLoad(start, zone.value.trim(), compareStart, finish, compareFinish);
    } catch (error) {
      status.textContent =
        error instanceof RangeError
          ? 'Enter a valid IANA timezone, such as America/Puerto_Rico.'
          : error instanceof Error
            ? error.message
            : 'Unable to load this period. Try again.';
      status.setAttribute('role', 'alert');
    } finally {
      fields.disabled = false;
      presets.removeAttribute('aria-busy');
      presets.querySelectorAll('button').forEach((control) => {
        control.disabled = false;
      });
      form.removeAttribute('aria-busy');
    }
  }
  /** @param {string} label @param {number} offset */
  function navigation(label, offset) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'drill-link period-nav';
    control.textContent = offset < 0 ? '←' : '→';
    control.setAttribute('aria-label', label);
    control.disabled = shiftDate(weekEnd, offset) > shiftDate(latestWeek(timezone), 6);
    control.addEventListener('click', () => {
      end.value = shiftDate(weekEnd, offset);
      void loadWeek(shiftDate(weekStart, offset));
    });
    return control;
  }
  weekRow.append(
    navigation('Previous week', -7),
    field('Range', rangeMode),
    field('Review start', week),
    field('Review end', end),
    navigation('Next week', 7),
    field('Time zone', zone),
    load,
  );
  const detailRow = document.createElement('div');
  detailRow.className = 'period-detail period-selection';
  const date = document.createElement('select');
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Period overview';
  date.append(all);
  for (const [title, start, finish] of [
    ['Review period', weekStart, weekEnd],
    ['Comparison period', comparisonWeekStart, comparisonWeekEnd],
  ]) {
    const group = document.createElement('optgroup');
    group.label = String(title);
    for (
      let index = 0;
      index <= (Date.parse(String(finish)) - Date.parse(String(start))) / 86400000;
      index++
    ) {
      const value = shiftDate(String(start), index);
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${value} · ${new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(value))}`;
      group.append(option);
    }
    date.append(group);
  }
  date.value = day;
  const time = document.createElement('select');
  const allHours = document.createElement('option');
  allHours.value = '';
  allHours.textContent = 'All day';
  time.append(allHours);
  for (let index = 0; index < 24; index++) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${String(index).padStart(2, '0')}:00 – ${String(index + 1).padStart(2, '0')}:00`;
    time.append(option);
  }
  time.value = hour;
  time.disabled = !day;
  date.addEventListener('change', () => onSelect(date.value, ''));
  time.addEventListener('change', () => onSelect(date.value, time.value));
  detailRow.append(field('Day', date), field(`Hour · ${timezone}`, time));
  const compareRow = document.createElement('div');
  compareRow.className = 'period-detail';
  compareRow.append(
    field('Compare with', comparisonMode),
    field('Comparison start', comparison),
    field('Comparison end', compareEnd),
  );
  fields.append(presets, weekRow, compareRow, detailRow);
  const notice = document.createElement('p');
  notice.className = 'subtle';
  notice.textContent =
    'Presets end yesterday in the selected timezone and compare the preceding equal-length period. Day/hour: loaded data, no extra reads. Date ranges/timezone: refreshes shared files using the normal read allowance. Inclusive ranges contain 1–31 completed days. Days align by position; unmatched days have no comparison. Unequal lengths show totals and averages without raw change claims. Missing records remain unknown.';
  form.append(fields, notice, status);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.reportValidity()) void loadWeek(week.value);
  });
  // Keep browser date validation in sync when the timezone changes.
  zone.addEventListener('change', () => {
    try {
      week.max = shiftDate(latestWeek(zone.value.trim()), 6);
      end.max = week.max;
      compareEnd.max = week.max;
      comparison.max = week.max;
      zone.setCustomValidity('');
    } catch {
      zone.setCustomValidity('Enter a valid IANA timezone.');
    }
  });
  zone.addEventListener('input', () => zone.setCustomValidity(''));
  return form;
}
