import { experimentHourChart } from './experiment-hour-chart.js';
import { compactReview, reviewDisclosure } from './review-presentation.js';
/** @typedef {import('../server/screen-time-reflection-store.js').ScreenTimeReflection} Reflection */
/** @typedef {import('../server/screen-time-experiment-store.js').ScreenTimeExperiment} SavedExperiment */
/** @typedef {{source:string,type:string,granularity:string,device:string}} SeriesKey */
/** @typedef {{coaching:(SeriesKey & {suggestions:ReturnType<typeof experimentCoaching>})[],readiness:(SeriesKey & ReturnType<typeof import('../core/screen-time-insights.js').exportReadiness>)[],experiments:SavedExperiment[],reflections:Reflection[]}} ReviewInsights */
/** @typedef {{version:string,kind:'coach'|'reflections'|'readiness'|'chart'|'month'|'experiment_hours',data:{suggestions?:ReturnType<typeof experimentCoaching>,review?:ReturnType<typeof import('../core/screen-time-review.js').screenTimeReview> & {scope:{deviceId:string,profileId:string},insights?:ReviewInsights},reflections?:Reflection[],experiment?:SavedExperiment|undefined,experiments?:SavedExperiment[],series?:{series:SeriesKey,readiness?:ReturnType<typeof import('../core/screen-time-insights.js').exportReadiness>,story?:ReturnType<typeof import('../core/screen-time-insights.js').monthlyAttentionStory>}[],month?:string,timezone?:string,fictional?:boolean,message?:string,warnings?:string[],comparison?:ReturnType<typeof import('../core/screen-time-insights.js').experimentHourComparison>,baselineCoverage?:ReturnType<typeof import('../core/screen-time-insights.js').exportReadiness>|null,experimentCoverage?:ReturnType<typeof import('../core/screen-time-insights.js').exportReadiness>|null,context?:ReturnType<typeof chartContext>}}} InsightView */
import { chartContext, experimentCoaching, exportReadiness } from '../core/screen-time-insights.js';
import { screenTimePeriodPicker } from './screen-time-period-picker.js';
/** @typedef {{experiments:(import('../server/screen-time-experiment-store.js').ScreenTimeExperiment & {phase:string})[],message:string,cancelledId:string|null}} ExperimentView */
/** @typedef {{version?:string,experiments?:ExperimentView['experiments'],message?:string,cancelledId?:string|null,exports?:{id:string,agentPermissions?:{time:boolean}}[],nextCursor?:string|null}} ExperimentToolValue */
/** @typedef {{isError?:boolean,structuredContent?:ExperimentToolValue,content?:{type:string,text?:string}[]}} ExperimentToolResult */
/** Self-contained MCP Apps renderer; serialized into the resource without external assets. */
/** @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [text] @param {string} [className] */
function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
/** @param {number|null} ms */
function duration(ms) {
  if (ms === null) return 'No records';
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
/** @param {string} label @param {()=>void} action */
function button(label, action) {
  const node = element('button', label, 'drill-link');
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', (event) => {
    action();
    // Pointer navigation gets a short transition; keyboard navigation stays immediate.
    if (
      !node.isConnected &&
      event.detail > 0 &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      document.querySelector('.drilldown, .attention-heatmap, .chart-card')?.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    }
  });
  return node;
}
/** @param {HTMLLIElement} row @param {number|null} value @param {number} maximum @param {number} [rank] */
function rankRow(row, value, maximum, rank) {
  if (rank !== undefined) row.prepend(element('span', String(rank).padStart(2, '0'), 'app-rank'));
  if (value === null) return;
  const track = element('span', '', 'app-track');
  track.style.transform = `scaleX(${Math.min(1, Math.max(0, value / Math.max(1, maximum)))})`;
  track.setAttribute('aria-hidden', 'true');
  row.prepend(track);
}
/** @param {ExperimentToolResult} result @returns {ExperimentToolValue} */
function toolValue(result) {
  if (result?.isError)
    throw new Error(
      result.content?.find((item) => item.type === 'text')?.text ?? 'The operation was denied.',
    );
  return (
    result?.structuredContent ??
    JSON.parse(result?.content?.find((item) => item.type === 'text')?.text ?? '{}')
  );
}
/** @param {HTMLElement} parent @param {ReturnType<typeof import('../core/screen-time-insights.js').exportReadiness>} readiness */
function readinessCard(parent, readiness) {
  parent.append(
    element('h3', `${readiness.observedDays}/${readiness.expectedDays} days with observations`),
    element(
      'p',
      `${readiness.hourlyCells} hourly cells · ${readiness.unallocatedRecords} records without hourly placement${readiness.partial ? ' · Partial files' : ''}`,
      'subtle',
    ),
  );
  if (readiness.missingDays.length)
    parent.append(element('p', `Missing dates: ${readiness.missingDays.join(', ')}`));
  const steps = element('ol');
  readiness.steps.forEach((step) => steps.append(element('li', step)));
  parent.append(steps);
}

function mountScreenTimeReview() {
  const root = document.getElementById('review');
  if (!root) return;
  const container = root;
  /** @type {ReturnType<typeof import('../core/screen-time-review.js').screenTimeReview> & {scope?:{deviceId:string,profileId:string},insights?:ReviewInsights}|null} */
  let review = null;
  let selected = 0;
  /** @type {{experiments:(import('../server/screen-time-experiment-store.js').ScreenTimeExperiment & {phase:string})[],message:string,cancelledId:string|null}|null} */
  let experimentView = null;
  /** @type {Map<string,{resolve:(value:ExperimentToolResult)=>void,reject:(error:Error)=>void,timer:ReturnType<typeof setTimeout>}>} */
  const pending = new Map();
  let sequence = 0;
  let initialized = false;
  let loadingPeriod = false;
  let controlsOpen = false;
  /** @param {string} weekStart @param {string} timezone @param {string} comparisonWeekStart @param {string} weekEnd @param {string} comparisonWeekEnd */
  async function loadPeriod(weekStart, timezone, comparisonWeekStart, weekEnd, comparisonWeekEnd) {
    if (!review?.scope || loadingPeriod)
      throw new Error('Open an account-backed review before loading another week.');
    const original = review;
    const scope = review.scope;
    const source = original.series[selected];
    loadingPeriod = true;
    try {
      const ids = await experimentExportIds(scope);
      const response = await callTool('review_weekly_screen_time', {
        exportIds: ids,
        weekStart,
        timezone,
        comparisonWeekStart,
        weekEnd,
        comparisonWeekEnd,
      });
      if (response.isError)
        throw new Error(
          response.content?.find((item) => item.type === 'text')?.text ??
            'Unable to load this week.',
        );
      const value = /** @type {NonNullable<typeof review>} */ (
        /** @type {unknown} */ (
          response.structuredContent ??
            JSON.parse(response.content?.find((item) => item.type === 'text')?.text ?? '{}')
        )
      );
      if (
        value.version !== 'myself.md.screen-time-review.v1' ||
        !Array.isArray(value.series) ||
        value.weekStart !== weekStart ||
        value.previousWeekStart !== comparisonWeekStart ||
        value.weekEnd !== weekEnd ||
        value.comparisonWeekEnd !== comparisonWeekEnd ||
        value.timezone !== timezone ||
        value.scope?.deviceId !== original.scope?.deviceId ||
        value.scope?.profileId !== original.scope?.profileId
      )
        throw new Error('Unexpected review response. Your previous review is still available.');
      review = value;
      selected = Math.max(
        0,
        value.series.findIndex(
          (item) =>
            item.source === source?.source &&
            item.type === source?.type &&
            item.granularity === source?.granularity &&
            item.device === source?.device,
        ),
      );
      insightView = null;
      experimentView = null;
      drilldown = null;
      returnDay = '';
      heatmapStart = -1;
      render();
      container.querySelector('h1')?.focus();
    } finally {
      loadingPeriod = false;
    }
  }
  /** @param {string} name @param {Record<string,unknown>} args @returns {Promise<ExperimentToolResult>} */
  function callTool(name, args) {
    return callHost('tools/call', { name, arguments: args });
  }
  /** @param {string} method @param {Record<string,unknown>} params @returns {Promise<ExperimentToolResult>} */
  function callHost(method, params) {
    if (!initialized)
      return Promise.reject(
        new Error('The host bridge is not ready. Try again or use the experiment tools in chat.'),
      );
    const id = `experiment-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The host did not respond. Check My experiments before retrying a save.'));
      }, 60000);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  }
  /** @param {HTMLButtonElement} action @param {()=>Promise<ExperimentToolValue>} run @param {HTMLElement} status */
  async function perform(action, run, status) {
    action.disabled = true;
    status.textContent = 'Working…';
    try {
      const value = await run();
      if (
        value.version !== 'myself.md.screen-time-experiments.v1' ||
        !Array.isArray(value.experiments)
      )
        throw new Error('Unexpected experiment response. Ask in chat to list your experiments.');
      experimentView = {
        experiments: value.experiments,
        message: value.message ?? 'Experiments updated.',
        cancelledId: value.cancelledId ?? null,
      };
      render();
      container.querySelector('h1')?.focus();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Unable to complete the operation. Try in chat.';
      status.setAttribute('role', 'alert');
      action.disabled = false;
    }
  }
  /** @param {NonNullable<typeof review>['series'][number]} series @param {string} identifier @param {string} name */
  function renderGoalForm(series, identifier, name) {
    if (!review?.scope) return;
    const value = review;
    const form = element('form', '', 'goal-form');
    form.append(element('h3', `Try a goal for ${name}`));
    const minutesLabel = element('label', 'Daily limit in minutes');
    const minutes = element('input');
    minutes.type = 'number';
    minutes.min = '0';
    minutes.max = '1440';
    minutes.step = '1';
    minutes.required = true;
    minutes.value =
      goalDraft?.appIdentifier === identifier ? String(goalDraft.targetMinutesPerDay) : '30';
    minutesLabel.append(minutes);
    const planLabel = element('label', 'What will you try? (optional)');
    const plan = element('input');
    plan.type = 'text';
    plan.value = goalDraft?.appIdentifier === identifier ? goalDraft.plan : '';
    plan.maxLength = 300;
    plan.placeholder = 'For example, leave my phone outside the bedroom';
    planLabel.append(plan);
    const minimumStart = new Date(Date.parse(value.weekStart) + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: value.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    const tomorrow = new Date(Date.parse(`${parts.year}-${parts.month}-${parts.day}`) + 86400000)
      .toISOString()
      .slice(0, 10);
    const startLabel = element('label', 'Experiment start date');
    const start = element('input');
    start.type = 'date';
    start.min = minimumStart;
    start.required = true;
    start.value = tomorrow > minimumStart ? tomorrow : minimumStart;
    startLabel.append(start);
    form.append(
      startLabel,
      minutesLabel,
      planLabel,
      element(
        'p',
        `Seven local days from the selected date · ${value.timezone}. Saves to your account and reads the baseline again using the normal allowance. Already-started periods are labeled retrospective. No reminder or phone limit is set.`,
        'subtle',
      ),
    );
    const save = button('Save experiment', () => {});
    save.type = 'submit';
    save.classList.add('primary');
    const status = element('p', '', 'subtle');
    status.setAttribute('role', 'status');
    let requestId = '',
      previousInput = '';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || save.disabled) return;
      const input = {
        exportIds: value.exports.map((file) => file.id),
        baselineWeekStart: value.weekStart,
        weekStart: start.value,
        timezone: value.timezone,
        series: {
          source: series.source,
          type: series.type,
          granularity: series.granularity,
          device: series.device,
        },
        appIdentifier: identifier,
        targetMinutesPerDay: minutes.valueAsNumber,
        plan: plan.value.trim(),
      };
      const key = JSON.stringify(input);
      if (key !== previousInput) {
        requestId = crypto.randomUUID();
        previousInput = key;
      }
      void perform(
        save,
        async () =>
          toolValue(await callTool('save_screen_time_experiment', { ...input, requestId })),
        status,
      );
    });
    form.append(save, status);
    container.append(reviewDisclosure('Plan an experiment', [form]));
  }
  /** @param {{deviceId:string,profileId:string}} experiment */
  async function experimentExportIds(experiment) {
    const ids = [];
    let cursor = '';
    for (let page = 0; page < 20; page++) {
      // Each metadata cursor must follow the previous response.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await callTool('list_cloud_exports', {
        deviceId: experiment.deviceId,
        profileId: experiment.profileId,
        limit: 100,
        cursor,
      });
      const value = toolValue(response);
      for (const file of value.exports ?? []) if (file.agentPermissions?.time) ids.push(file.id);
      if (ids.length > 32)
        throw new Error(
          'More than 32 shared files are available. Ask in chat to choose the relevant files before loading this review.',
        );
      cursor = value.nextCursor ?? '';
      if (!cursor) break;
    }
    if (cursor || !ids.length)
      throw new Error(
        'Shared export discovery is incomplete or no files are available. Check exports in chat.',
      );
    return ids;
  }
  /** @param {SavedExperiment} experiment */
  async function reviewExperiment(experiment) {
    return toolValue(
      await callTool('review_screen_time_experiment', {
        experimentId: experiment.id,
        exportIds: await experimentExportIds(experiment),
      }),
    );
  }
  /** @type {InsightView|null} */
  let insightView = null;
  /** @type {{appIdentifier:string,targetMinutesPerDay:number,plan:string}|null} */
  let goalDraft = null;
  /** @type {Reflection|null} */
  let reflectionDraft = null;
  /** @param {HTMLButtonElement} action @param {()=>Promise<InsightView>} run @param {HTMLElement} status */
  async function performInsight(action, run, status) {
    action.disabled = true;
    status.textContent = 'Working…';
    try {
      const value = await run();
      if (value.version !== 'myself.md.screen-time-insights.v1')
        throw new Error('Unexpected response. Ask in chat to inspect the result.');
      insightView = value;
      render();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Unable to complete this action.';
      status.setAttribute('role', 'alert');
      action.disabled = false;
    }
  }
  /** @param {string} name @param {Record<string,unknown>} args @returns {Promise<InsightView>} */
  async function insightTool(name, args) {
    return /** @type {InsightView} */ (toolValue(await callTool(name, args)));
  }
  /** @param {import('../server/screen-time-reflection-store.js').ScreenTimeReflection} [existing] @param {import('../server/screen-time-experiment-store.js').ScreenTimeExperiment} [experiment] */
  function reflectionForm(existing, experiment) {
    const draft = existing ?? (!review ? reflectionDraft : null);
    const scope = draft ?? experiment ?? review?.scope;
    if (!scope)
      return element('p', 'Open a weekly review to choose the phone/profile for your reflection.');
    const form = element('form', '', 'goal-form');
    form.append(
      element(
        'h3',
        existing
          ? 'Edit reflection'
          : experiment
            ? `Reflect on ${experiment.appName}`
            : 'Add a personal reflection',
      ),
    );
    const weekLabel = element('label', 'Reflection week start');
    const week = element('input');
    week.type = 'date';
    week.required = true;
    week.value =
      existing?.weekStart ?? experiment?.weekStart ?? review?.weekStart ?? draft?.weekStart ?? '';
    week.disabled = Boolean(experiment || existing?.experimentId);
    weekLabel.append(week);
    const textLabel = element('label', 'What affected your attention?');
    const text = element('textarea');
    text.required = true;
    text.maxLength = 1000;
    text.rows = 3;
    text.value = existing?.text ?? '';
    text.placeholder = 'Travel week, work demands, or how the change felt…';
    textLabel.append(text);
    const status = element('p', '', 'subtle');
    status.setAttribute('role', 'status');
    const save = button('Save reflection', () => {});
    save.type = 'submit';
    const reflectionId = existing?.id ?? crypto.randomUUID();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || save.disabled) return;
      void performInsight(
        save,
        () =>
          insightTool('save_screen_time_reflection', {
            reflectionId,
            deviceId: scope.deviceId,
            profileId: scope.profileId,
            weekStart: week.value,
            timezone:
              existing?.timezone ??
              experiment?.timezone ??
              review?.timezone ??
              draft?.timezone ??
              'UTC',
            experimentId: existing?.experimentId ?? experiment?.id ?? draft?.experimentId ?? null,
            text: text.value.trim(),
            expectedUpdatedAt: existing?.updatedAt ?? null,
          }),
        status,
      );
    });
    form.append(
      weekLabel,
      textLabel,
      element(
        'p',
        'Saved to your account under current Screen time sharing. Reflections are your context, not measured causes.',
        'subtle',
      ),
      save,
      status,
    );
    return form;
  }
  /** @param {HTMLElement} parent @param {import('../server/screen-time-reflection-store.js').ScreenTimeReflection[]} notes */
  function reflectionList(parent, notes) {
    if (!notes.length)
      parent.append(element('p', 'No personal reflections for this view.', 'subtle'));
    for (const note of notes) {
      const card = element('section', '', 'experiment-card');
      card.append(
        element('h3', note.weekStart),
        element('p', note.text),
        element(
          'p',
          `${note.timezone}${note.experimentId ? ' · Experiment reflection' : ''}`,
          'subtle',
        ),
        button('Edit reflection', () => {
          insightView = {
            version: 'myself.md.screen-time-insights.v1',
            kind: 'reflections',
            data: { reflections: [note] },
          };
          render();
        }),
      );
      parent.append(card);
    }
  }
  function renderInsights() {
    if (!insightView) return;
    const value = insightView;
    container.replaceChildren(element('p', 'MYSELF.MD · ATTENTION', 'eyebrow'));
    const titles = {
      coach: 'Choose one small change',
      reflections: 'Personal reflections',
      readiness: 'Export readiness',
      chart: 'Your chart selection',
      month: 'Your month in attention',
      experiment_hours: 'Experiment hour patterns',
    };
    container.append(element('h1', titles[value.kind] ?? 'Attention review'));
    if (review || experimentView)
      container.append(
        button('Back to review', () => {
          insightView = null;
          render();
        }),
      );
    const data = value.data;
    if (value.kind === 'coach') {
      const current = review?.series[selected];
      const suggestions = data.suggestions ?? [];
      if (!suggestions.length)
        container.append(
          element(
            'p',
            review?.currentDays !== 7
              ? 'Weekly experiments need a seven-day review baseline. Choose Seven days in the Range control to plan a goal.'
              : 'No app-cap suggestions are available from the selected observations. Add shared exports or choose an app yourself.',
          ),
        );
      for (const suggestion of suggestions) {
        const card = element('section', '', 'experiment-card');
        card.append(
          element('h2', suggestion.appName),
          element('p', `Try ${suggestion.targetMinutesPerDay} minutes a day`, 'comparison'),
          element('p', suggestion.reason, 'subtle review-note'),
          element('p', suggestion.plan),
        );
        if (current)
          card.append(
            button('Customize this experiment', () => {
              goalDraft = suggestion;
              insightView = null;
              openDetail('app', suggestion.appIdentifier);
            }),
          );
        container.append(card);
      }
      container.append(
        element(
          'p',
          'These are optional starting points. Customize the cap, plan and start date before saving; no goal is created by viewing suggestions.',
          'subtle review-note',
        ),
      );
    } else if (value.kind === 'reflections') {
      const notes = data.reflections ?? [];
      reflectionList(container, notes);
      container.append(
        button('Add another reflection', () => {
          reflectionDraft = notes[0] ?? reflectionDraft;
          insightView = {
            version: 'myself.md.screen-time-insights.v1',
            kind: 'reflections',
            data: { reflections: [], experiment: data.experiment },
          };
          render();
        }),
      );
      const existing = notes.length === 1 ? notes[0] : undefined;
      container.append(reflectionForm(existing, data.experiment));
      const status = element('p', '', 'subtle');
      const refresh = button('Refresh reflections', () => {
        void performInsight(
          refresh,
          () => insightTool('list_screen_time_reflections', review?.scope ?? {}),
          status,
        );
      });
      container.append(refresh, status);
    } else if (value.kind === 'readiness') {
      for (const item of data.series ?? []) {
        container.append(element('h2', `${item.series.source} · ${item.series.type}`));
        if (item.readiness) readinessCard(container, item.readiness);
      }
      if (!(data.series ?? []).length)
        container.append(
          element(
            'p',
            data.message ??
              'No usable observations. On the phone, export the desired screen-time dates to cloud storage and share the profile with agents.',
          ),
        );
    } else if (value.kind === 'month') {
      const monthForm = element('form', '', 'goal-form');
      const monthLabel = element('label', 'Calendar month');
      const monthInput = element('input');
      monthInput.type = 'month';
      monthInput.required = true;
      monthInput.value =
        data.month ??
        new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1))
          .toISOString()
          .slice(0, 7);
      monthLabel.append(monthInput);
      const monthStatus = element('p', '', 'subtle');
      const monthRead = button('Read shared exports for this month', () => {});
      monthRead.type = 'submit';
      monthRead.disabled = !review;
      monthForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!monthForm.reportValidity() || !review || monthRead.disabled) return;
        const current = review;
        void performInsight(
          monthRead,
          () =>
            insightTool('review_monthly_attention', {
              exportIds: current.exports.map((file) => file.id),
              month: monthInput.value,
              timezone: current.timezone,
            }),
          monthStatus,
        );
      });
      monthForm.append(
        monthLabel,
        element(
          'p',
          'Reads the selected review files using the normal allowance. If they do not cover this month, discover and select the relevant files in chat.',
          'subtle',
        ),
        monthRead,
        monthStatus,
      );
      container.append(data.month ? reviewDisclosure('Change month', [monthForm]) : monthForm);

      container.append(element('p', `${data.month ?? ''} · ${data.timezone ?? ''}`, 'subtle'));
      if (data.fictional) container.append(element('p', 'FICTIONAL EXAMPLE', 'eyebrow'));
      for (const item of data.series ?? []) {
        const story = item.story;
        if (!story) continue;
        const section = element('section', '', 'experiment-card');
        section.append(
          element(
            'h2',
            `${item.series.source} · ${item.series.type} · ${item.series.granularity}${item.series.device ? ` · ${item.series.device}` : ''}`,
          ),
          element('p', duration(story.observedDurationMs), 'total'),
          element('p', story.narrative, 'review-note'),
        );
        const weeks = element('ol', '', 'apps');
        for (const week of story.weeks) {
          const row = element('li');
          row.append(
            element(
              'span',
              `${week.start} – ${week.end} (${week.observedDays}/${week.expectedDays} days)`,
            ),
            element('span', duration(week.durationMs), 'app-duration'),
          );
          rankRow(row, week.durationMs, Math.max(1, ...story.weeks.map((w) => w.durationMs ?? 0)));
          weeks.append(row);
        }
        section.append(element('h3', 'Weekly blocks'), weeks);
        const patterns = reviewDisclosure('Apps & patterns', [
          element('h3', 'Leading observed hours'),
        ]);
        story.leadingHours.forEach((hour) =>
          patterns.append(
            element(
              'p',
              `${String(hour.hour).padStart(2, '0')}:00 · ${duration(hour.durationMs)} across ${hour.observedDays} observed days`,
            ),
          ),
        );
        patterns.append(element('h3', 'Top apps'));
        story.topApps.forEach((app) =>
          patterns.append(element('p', `${app.name} · ${duration(app.currentMs)}`)),
        );
        patterns.append(element('h3', 'First to final week'));
        story.shifts
          .slice(0, 10)
          .forEach((shift) =>
            patterns.append(
              element(
                'p',
                `${shift.appName}: ${shift.firstDays}/7 → ${shift.lastDays}/7 app days · ${shift.changeMs === null ? 'Change unavailable' : `${duration(Math.abs(shift.changeMs))} ${shift.changeMs < 0 ? 'less' : 'more'} observed usage`}`,
              ),
            ),
          );
        patterns.append(element('p', story.note, 'subtle review-note'));
        section.append(patterns);
        container.append(section);
      }
      if (data.month && !(data.series ?? []).length)
        container.append(element('p', 'No usable observations in this month.'));
      const context = reviewDisclosure('Experiments & reflections', [
        element('h2', 'Experiments this month'),
      ]);
      for (const experiment of data.experiments ?? [])
        context.append(
          element(
            'p',
            `${experiment.appName} · ${experiment.weekStart} – ${experiment.weekEnd} · ${experiment.state} · ${experiment.latestReview?.outcome ?? 'Not reviewed'}${experiment.retrospective ? ' · Retrospective' : ''}`,
          ),
        );
      context.append(element('h2', 'Your reflections'));
      reflectionList(context, data.reflections ?? []);
      (data.warnings ?? []).forEach((warning) =>
        container.append(element('p', warning, 'subtle review-note')),
      );
      container.append(context);
    } else if (value.kind === 'experiment_hours') {
      if (data.experiment)
        container.append(
          element('h2', data.experiment.appName),
          element(
            'p',
            `${data.experiment.weekStart} – ${data.experiment.weekEnd}${data.experiment.retrospective ? ' · Retrospective' : ''}`,
            'subtle',
          ),
        );
      if (data.comparison) {
        container.append(experimentHourChart(data.comparison));
        container.append(
          element(
            'p',
            `${data.comparison.pairedHours}/168 hours have goal-app observations in both periods.`,
          ),
          element('p', data.comparison.note, 'subtle review-note'),
        );
        const table = element('table');
        table.append(element('caption', 'Same local weekday/hour: baseline → experiment'));
        const body = element('tbody');
        for (const cell of data.comparison.cells) {
          if (cell.baselineMs === null && cell.experimentMs === null) continue;
          const row = element('tr');
          row.append(
            element('td', `${cell.date} ${String(cell.hour).padStart(2, '0')}:00`),
            element('td', duration(cell.baselineMs)),
            element('td', duration(cell.experimentMs)),
          );
          body.append(row);
        }
        table.append(body);
        container.append(reviewDisclosure('Hourly values', [table]));
      }
      const coverage = reviewDisclosure('Coverage', []);
      if (data.baselineCoverage) {
        coverage.append(element('h3', 'Baseline coverage'));
        readinessCard(coverage, data.baselineCoverage);
      }
      if (data.experimentCoverage) {
        coverage.append(element('h3', 'Experiment coverage'));
        readinessCard(coverage, data.experimentCoverage);
      }
      if (data.baselineCoverage || data.experimentCoverage) container.append(coverage);
    } else if (value.kind === 'chart') {
      const context = data.context;
      if (context) {
        const observation = context.selected;
        const selection = context.selection;
        container.append(
          element(
            'h2',
            selection.kind === 'app'
              ? 'Selected app'
              : `${selection.date ?? ''}${selection.kind === 'hour' ? ` · ${String(selection.hour).padStart(2, '0')}:00` : ''}`,
          ),
        );
        if (!observation)
          container.append(
            element('p', 'No observation for this selection. Usage is unknown, not zero.'),
          );
        else if ('daily' in observation) {
          container.append(element('h3', observation.name));
          const list = element('ol', '', 'apps');
          for (const day of observation.daily) {
            const row = element('li');
            row.append(
              element('span', day.date),
              element('span', duration(day.durationMs), 'app-duration'),
            );
            list.append(row);
          }
          container.append(list);
        } else {
          container.append(
            element(
              'p',
              `${duration(observation.durationMs)} observed · ${observation.records} records`,
            ),
          );
          for (const app of observation.topApps)
            container.append(element('p', `${app.name} · ${duration(app.durationMs)}`));
        }
        if (context.previous)
          container.append(
            element('p', `Same weekday/hour previously: ${duration(context.previous.durationMs)}`),
          );
        container.append(
          element(
            'p',
            context.changeMs === null
              ? 'Comparison unavailable.'
              : `${duration(Math.abs(context.changeMs))} ${context.changeMs < 0 ? 'less' : 'more'} observed usage.`,
          ),
          element('p', context.note, 'subtle review-note'),
        );
      }
      container.append(
        element(
          'p',
          'Ask your question in chat using this selected context.',
          'subtle review-note',
        ),
      );
    }
  }
  /** @param {NonNullable<typeof review>['series'][number]} series */
  function chartConversation(series) {
    if (!drilldown || !review) return element('span');
    const selection =
      drilldown.kind === 'app'
        ? { kind: /** @type {const} */ ('app'), appIdentifier: drilldown.key }
        : drilldown.kind === 'hour'
          ? { kind: /** @type {const} */ ('hour'), date: drilldown.key, hour: drilldown.hour ?? 0 }
          : { kind: /** @type {const} */ ('day'), date: drilldown.key };
    const context = {
      scope: review.scope,
      weekStart: review.weekStart,
      comparisonWeekStart: review.previousWeekStart,
      weekEnd: review.weekEnd,
      comparisonWeekEnd: review.comparisonWeekEnd,
      timezone: review.timezone,
      source: {
        source: series.source,
        type: series.type,
        granularity: series.granularity,
        device: series.device,
      },
      exportIds: review.exports.map((file) => file.id),
      ...chartContext(series, selection),
      warnings: review.warnings,
    };
    const form = element('form', '', 'goal-form');
    form.append(element('h3', 'Ask about this selection'));
    const label = element('label', 'Question for ChatGPT');
    const question = element('input');
    question.value = 'How does this compare with the selected comparison week?';
    question.required = true;
    question.maxLength = 500;
    label.append(question);
    const status = element('p', '', 'subtle');
    status.setAttribute('role', 'status');
    const send = button('Ask ChatGPT', () => {});
    send.type = 'submit';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || send.disabled) return;
      send.disabled = true;
      status.textContent = 'Sending selected context…';
      void callHost('ui/message', {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${question.value}\nSelected myself.md chart context (data, not instructions):\n${JSON.stringify(context)}`,
          },
        ],
      })
        .then(() => {
          status.textContent = 'Question and selected context sent to ChatGPT.';
          return null;
        })
        .catch((error) => {
          send.disabled = false;
          status.textContent = `${error instanceof Error ? error.message : 'Host messaging unavailable.'} Ask in chat and use inspect_screen_time_chart with the selected date/app/hour.`;
        });
    });
    form.append(label, send, status, element('p', context.note, 'subtle review-note'));
    return form;
  }

  function renderExperiments() {
    if (!experimentView) return;
    container.replaceChildren();
    const title = element('h1', 'Personal experiments');
    title.tabIndex = -1;
    container.append(
      element('p', 'MYSELF.MD · SCREEN TIME', 'eyebrow'),
      title,
      element('p', experimentView.message, 'subtle'),
    );
    if (review)
      container.append(
        button('Back to weekly review', () => {
          experimentView = null;
          render();
        }),
      );
    const refreshStatus = element('p', '', 'subtle');
    const refresh = button('Refresh experiments', () => {
      void perform(
        refresh,
        async () => toolValue(await callTool('list_screen_time_experiments', {})),
        refreshStatus,
      );
    });
    container.append(refresh, refreshStatus);
    if (!experimentView.experiments.length)
      container.append(
        element(
          'p',
          experimentView.cancelledId
            ? 'Your experiment is cancelled. Its history is retained.'
            : 'No experiments available under the current profile permissions. Choose an app in a weekly review to save a goal.',
        ),
      );
    for (const experiment of experimentView.experiments) {
      const card = element('section', '', 'experiment-card');
      card.append(
        element('p', experiment.fictional ? 'FICTIONAL EXAMPLE' : 'SAVED GOAL', 'eyebrow'),
        element('h2', experiment.appName),
        element(
          'p',
          `At or below ${experiment.targetMinutesPerDay} minutes each day`,
          'comparison',
        ),
        element(
          'p',
          `${experiment.weekStart} – ${experiment.weekEnd} · ${experiment.timezone}`,
          'subtle',
        ),
        element('p', `Status: ${experiment.phase.replaceAll('_', ' ')}`),
      );
      if (experiment.retrospective)
        card.append(
          element(
            'p',
            'Retrospective goal: this period had already started when the goal was saved.',
            'subtle',
          ),
        );
      if (experiment.plan) card.append(element('p', experiment.plan));
      card.append(
        element(
          'p',
          `Baseline: ${duration(experiment.baseline.observedDurationMs)} across ${experiment.baseline.observedDays}/7 observed app days (${experiment.baselineWeekStart}).`,
          'subtle',
        ),
      );
      if (experiment.baseline.warnings.length)
        card.append(element('p', experiment.baseline.warnings.join(' '), 'subtle'));
      const outcome = experiment.latestReview;
      if (outcome) {
        card.append(
          element(
            'h3',
            outcome.outcome === 'inconclusive'
              ? 'More data needed'
              : outcome.outcome === 'within_goal'
                ? 'Observed usage within goal'
                : 'Observed usage above goal',
          ),
          element(
            'p',
            `${duration(outcome.observed.observedDurationMs)} across ${outcome.observed.observedDays}/7 observed app days.`,
          ),
        );
        if (outcome.changeMs !== null)
          card.append(
            element(
              'p',
              `${duration(Math.abs(outcome.changeMs))} ${outcome.changeMs <= 0 ? 'less' : 'more'} observed usage than baseline.`,
            ),
          );
        if (outcome.observed.warnings.length)
          card.append(element('p', outcome.observed.warnings.join(' '), 'subtle'));
        const list = element('ol', '', 'apps');
        outcome.observed.daily.forEach((day) => {
          const row = element('li');
          row.append(
            element('span', day.date),
            element('span', duration(day.durationMs), 'app-duration'),
          );
          list.append(row);
        });
        card.append(list, element('p', outcome.caveat, 'subtle'));
      }
      const status = element('p', '', 'subtle');
      status.setAttribute('role', 'status');
      if (experiment.state !== 'cancelled') {
        if (['ready_to_review', 'awaiting_data', 'reviewed'].includes(experiment.phase)) {
          card.append(
            element(
              'p',
              'Review reads currently shared exports using the normal allowance and saves the latest result.',
              'subtle',
            ),
          );
          const action = button('Read shared exports and review', () => {
            void perform(action, () => reviewExperiment(experiment), status);
          });
          card.append(action);
        } else
          card.append(
            element(
              'p',
              `Return to review after ${experiment.reviewAfter}. No reminder is scheduled.`,
              'subtle',
            ),
          );
        const cancel = button('Cancel experiment', () => {
          void perform(
            cancel,
            async () =>
              toolValue(
                await callTool('cancel_screen_time_experiment', { experimentId: experiment.id }),
              ),
            status,
          );
        });
        card.append(cancel);
      }
      const compareStatus = element('p', '', 'subtle');
      const compare = button('Compare hourly patterns', () => {
        void performInsight(
          compare,
          async () => {
            const ids = await experimentExportIds(experiment);
            return insightTool('compare_screen_time_experiment_hours', {
              experimentId: experiment.id,
              baselineExportIds: ids,
              experimentExportIds: ids,
            });
          },
          compareStatus,
        );
      });
      compare.disabled = Date.now() < Date.parse(experiment.reviewAfter);
      card.append(
        compare,
        element(
          'p',
          'Hourly comparison reads baseline and experiment exports using the normal allowance; absent app hours stay unknown.',
          'subtle',
        ),
        compareStatus,
        button('Add experiment reflection', () => {
          insightView = {
            version: 'myself.md.screen-time-insights.v1',
            kind: 'reflections',
            data: { experiment, reflections: [] },
          };
          render();
        }),
      );
      card.append(status);
      container.append(card);
    }
  }

  let reviewView = 'weekly';
  let heatmapStart = -1;
  /** @param {NonNullable<typeof review>['series'][number]} series */
  function renderAppComparison(series) {
    const section = reviewDisclosure(`Apps · ${series.topApps.length}`, []);
    const apps = element('ol', '', 'apps app-comparisons');
    const maximum = Math.max(
      1,
      ...series.topApps.flatMap((app) => [app.currentMs, app.previousMs]),
    );
    for (const app of series.topApps) {
      const detail = series.appDrilldowns?.find((item) => item.identifier === app.identifier);
      const periods = [series.previous, series.current].map((period, index) => {
        const observations = detail?.daily.filter(
          (day) => day.date >= period.start && day.date <= period.end,
        );
        return {
          label: index ? 'Review' : 'Comparison',
          value: observations
            ? observations.some((day) => day.durationMs !== null)
              ? observations.reduce((sum, day) => sum + (day.durationMs ?? 0), 0)
              : null
            : (index ? app.currentMs : app.previousMs) || null,
          complete: !!observations?.length && observations.every((day) => day.durationMs !== null),
        };
      });
      const row = element('li');
      row.dataset.app = app.identifier;
      const heading = element('div', '', 'app-comparison-heading');
      heading.append(
        series.appDrilldowns
          ? button(app.name, () => openDetail('app', app.identifier))
          : element('span', app.name),
      );
      const previous = periods[0],
        current = periods[1];
      const change =
        series.comparable &&
        previous?.complete &&
        current?.complete &&
        previous.value !== null &&
        current.value !== null
          ? current.value - previous.value
          : null;
      heading.append(
        element(
          'span',
          change === null
            ? 'Change unavailable'
            : change === 0
              ? 'No change'
              : `${change < 0 ? '−' : '+'}${duration(Math.abs(change))}`,
          'app-change',
        ),
      );
      row.append(heading);
      for (const [index, period] of periods.entries()) {
        const pair = element('div', '', 'app-period');
        const track = element('span', '', 'app-pair-track');
        const bar = element(
          'span',
          '',
          `app-pair-bar${index ? '' : ' old'}${period.value === null ? ' unknown' : period.value === 0 ? ' zero' : ''}`,
        );
        if (period.value !== null) bar.style.width = `${(period.value / maximum) * 100}%`;
        track.setAttribute('aria-hidden', 'true');
        track.append(bar);
        pair.append(
          element('span', period.label),
          track,
          element(
            'span',
            period.value === null ? 'Unknown' : duration(period.value),
            'app-duration',
          ),
        );
        row.append(pair);
      }
      apps.append(row);
    }
    section.append(
      apps,
      element(
        'p',
        'Up to 10 apps ranked by observed review usage. Bar lengths share one scale across apps and periods. Changes require comparable periods and app records on every selected day; absent records are unknown.',
        'subtle review-note',
      ),
    );
    container.append(section);
  }

  /** @param {NonNullable<typeof review>['series'][number]} series */
  function renderDailyChart(series) {
    const card = element('section', '', 'chart-card');
    card.setAttribute('aria-label', 'Daily observed usage chart');
    const header = element('div', '', 'chart-heading');
    header.append(element('h2', 'Your days, at a glance'));
    const legend = element('div', '', 'chart-legend');
    for (const [label, className] of [
      ['Review period', ''],
      ['Comparison', 'old'],
    ]) {
      if (className === 'old' && !series.previous.observedDays) continue;
      const item = element('span', '', 'legend-item');
      item.append(element('i', '', `legend-dot ${className}`), element('span', label));
      legend.append(item);
    }
    header.append(legend);
    card.append(header);
    const readout = element('div', '', 'chart-readout');
    const readoutDate = element('span');
    const readoutValue = element('strong');
    readout.setAttribute('aria-live', 'off');
    readout.append(readoutDate, readoutValue);
    card.append(readout);
    const chart = element('div', '', 'daily-chart');
    const axis = element('div', '', 'chart-axis');
    axis.setAttribute('aria-hidden', 'true');
    const maximum = Math.max(3600000, ...series.daily.map((day) => day.durationMs ?? 0));
    const ceiling = Math.ceil(maximum / 3600000) * 3600000;
    for (const value of [ceiling, ceiling / 2, 0])
      axis.append(element('span', `${value / 3600000}h`));
    const columns = element('div', '', 'chart-columns');
    const days = series.daily.filter(
      (day) => day.date >= series.current.start && day.date <= series.current.end,
    );
    columns.style.gridTemplateColumns = `repeat(${days.length}, minmax(38px, 1fr))`;
    const peak = days.reduce(
      (best, day) => ((day.durationMs ?? -1) > (best?.durationMs ?? -1) ? day : best),
      days[0],
    );
    /** @param {typeof days[number]} day @param {HTMLButtonElement} control */
    function inspect(day, control) {
      columns.querySelectorAll('button').forEach((item) => item.removeAttribute('aria-current'));
      control.setAttribute('aria-current', 'true');
      readoutDate.textContent = `${new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date))}${day === peak && day.durationMs !== null ? ' · Most observed usage' : ''}`;
      readoutValue.textContent = duration(day.durationMs);
    }
    for (const [index, day] of days.entries()) {
      const control = button('', () => openDetail('day', day.date));
      control.className = 'chart-day';
      const before = series.daily.filter(
        (entry) => entry.date >= series.previous.start && entry.date <= series.previous.end,
      )[index];
      control.setAttribute(
        'aria-label',
        `${day.date}: ${duration(day.durationMs)} observed${series.previous.observedDays ? `; comparison day ${duration(before?.durationMs ?? null)}` : ''}. Open day details`,
      );
      const bars = element('span', '', 'chart-bars');
      bars.setAttribute('aria-hidden', 'true');
      for (const [value, old] of series.previous.observedDays
        ? [
            [before?.durationMs ?? null, true],
            [day.durationMs, false],
          ]
        : [[day.durationMs, false]]) {
        const column = element(
          'span',
          '',
          `chart-column${old ? ' old' : ''}${value === null ? ' unknown' : value === 0 ? ' zero' : ''}`,
        );
        column.style.transform = `scaleY(${Number(value ?? 0) / ceiling})`;
        bars.append(column);
      }
      control.append(
        bars,
        element(
          'span',
          new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(
            new Date(day.date),
          ),
          'chart-day-label',
        ),
      );
      control.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch') inspect(day, control);
      });
      control.addEventListener('focus', () => inspect(day, control));
      columns.append(control);
      if (day === peak) inspect(day, control);
    }
    chart.append(axis, columns);
    card.append(
      chart,
      element(
        'p',
        'Hover or focus to inspect. Select a day to explore its apps. Dashed marks mean unknown usage.',
        'chart-hint review-note',
      ),
    );
    container.append(card);
  }
  /** @param {NonNullable<typeof review>['series'][number]} series */
  function renderHeatmap(series) {
    const heatmap = series.heatmap;
    const section = element('section', '', 'attention-heatmap');
    section.append(element('h2', 'Hourly usage'));
    const comparisonDays = series.daily.filter(
      (day) => day.date >= series.previous.start && day.date <= series.previous.end,
    );
    const reviewDays = series.daily.filter(
      (day) => day.date >= series.current.start && day.date <= series.current.end,
    );
    const count = Math.max(comparisonDays.length, reviewDays.length);
    if (heatmapStart < 0 || heatmapStart >= count) heatmapStart = 0;
    const columns = Math.min(7, count - heatmapStart);
    const label = element('label', 'Dates', 'source-label');
    const select = element('select');
    select.setAttribute('aria-label', 'Heatmap dates');
    for (let offset = 0; offset < count; offset += 7) {
      const option = element('option', `Days ${offset + 1}–${Math.min(offset + 7, count)}`);
      option.value = String(offset);
      option.selected = heatmapStart === offset;
      select.append(option);
    }
    select.addEventListener('change', () => {
      heatmapStart = Number(select.value);
      render();
      const control = container.querySelector('.attention-heatmap select');
      if (control instanceof HTMLSelectElement) control.focus();
    });
    label.append(select);
    section.append(
      label,
      element(
        'p',
        'Periods align by day position and local clock hour, even when weekdays differ. Dots mean unknown usage; 0 means an explicit zero observation. Outside range is not missing data.',
        'subtle review-note',
      ),
    );
    const readout = element('div', '', 'heatmap-readout');
    const readoutTitle = element('p', 'Select an hour');
    const readoutValue = element('p', 'Observed usage · gaps unknown', 'subtle');
    readout.append(readoutTitle, readoutValue);
    section.append(readout);
    const scale = element('div', '', 'heatmap-scale');
    scale.setAttribute(
      'aria-label',
      'Observed app duration thresholds, shared across both periods',
    );
    const maximum = Math.max(
      240000,
      Math.ceil(Math.max(0, ...heatmap.cells.map((cell) => cell.durationMs)) / 240000) * 240000,
    );
    for (let level = 1; level <= 4; level++) {
      const bin = element('span', '', 'heatmap-bin');
      const swatch = element('i', '', `heat-level-${level}`);
      swatch.setAttribute('aria-hidden', 'true');
      const lower = (maximum * (level - 1)) / 4 / 60000;
      const upper = (maximum * level) / 4 / 60000;
      bin.append(
        swatch,
        element('span', `>${Number(lower.toFixed(3))}–${Number(upper.toFixed(3))} min`),
      );
      scale.append(bin);
    }
    for (const [name, className] of [
      ['Zero', 'heat-zero'],
      ['Unknown', 'heat-unknown'],
    ]) {
      const bin = element('span', '', 'heatmap-bin');
      const swatch = element('i', '', className);
      swatch.setAttribute('aria-hidden', 'true');
      bin.append(swatch, element('span', name));
      scale.append(bin);
    }
    scale.append(
      element(
        'p',
        'Summed observed app minutes per local clock hour. App durations can overlap; totals can exceed 60 minutes. Scale uses both selected periods.',
        'subtle review-note',
      ),
    );
    section.append(scale);

    const panels = element('div', '', 'heatmap-panels');
    panels.append(periodPanel('Comparison', comparisonDays), periodPanel('Review', reviewDays));
    section.append(
      panels,
      element(
        'p',
        'Only intervals fully bounded by one local clock hour are mapped. Other valid usage remains in daily totals. Partial files and review exclusions still apply.',
        'subtle review-note',
      ),
    );
    container.append(section);

    /** @param {string} name @param {typeof series.daily} periodDays */
    function periodPanel(name, periodDays) {
      const days = periodDays.slice(heatmapStart, heatmapStart + columns);
      const panel = element('section', '', 'heatmap-period');
      panel.dataset.period = name.toLowerCase();
      panel.setAttribute('aria-label', `${name} hourly usage`);
      const heading = element('div', '', 'heatmap-period-heading');
      heading.append(
        element('h3', name),
        element(
          'p',
          days.length ? `${days[0]?.date} – ${days.at(-1)?.date}` : 'Outside selected range',
          'subtle',
        ),
      );
      panel.append(heading);
      const notes = element('div', '', 'heatmap-period-notes');
      const dates = new Set(days.map((day) => day.date));
      const cells = heatmap.cells.filter((cell) => dates.has(cell.date));
      const summaries = heatmap.days.filter((day) => dates.has(day.date));
      const mapped = summaries.some((day) => day.attributedDurationMs !== null)
        ? summaries.reduce((sum, day) => sum + (day.attributedDurationMs ?? 0), 0)
        : null;
      const unallocated = summaries.some((day) => day.unallocatedDurationMs !== null)
        ? summaries.reduce((sum, day) => sum + (day.unallocatedDurationMs ?? 0), 0)
        : null;
      const skipped = summaries.reduce((sum, day) => sum + day.unallocatedRecords, 0);
      if (days.length)
        notes.append(
          element(
            'p',
            `${duration(mapped)} mapped to hours · ${duration(unallocated)} without hourly placement${skipped ? ` (${skipped} records)` : ''}.`,
            'subtle review-note',
          ),
        );
      if (!days.length)
        notes.append(element('p', 'No dates from this period in this paired window.', 'subtle'));
      if (!cells.length && days.length)
        notes.append(
          element(
            'p',
            skipped
              ? 'Hourly detail unavailable for these dates. Daily or hour-crossing records cannot be assigned to individual hours.'
              : 'No hourly observations for these dates. Usage is unknown, not zero.',
            'heatmap-empty',
          ),
        );
      const annotations =
        review?.insights?.experiments.filter(
          (experiment) =>
            experiment.series.source === series.source &&
            experiment.series.type === series.type &&
            experiment.series.granularity === series.granularity &&
            experiment.series.device === series.device &&
            experiment.weekStart <= (days.at(-1)?.date ?? '') &&
            experiment.weekEnd >= (days[0]?.date ?? ''),
        ) ?? [];
      if (annotations.length) {
        const markers = element('div', '', 'experiment-markers');
        markers.append(element('h3', 'Experiments in this view'));
        for (const experiment of annotations)
          markers.append(
            element(
              'p',
              `${experiment.appName}: ${experiment.weekStart} – ${experiment.weekEnd} · ${experiment.state}${experiment.retrospective ? ' · Retrospective' : ''}`,
            ),
          );
        markers.append(
          element(
            'p',
            '◆ marks the experiment start date. Compare hourly patterns in My experiments; collection coverage can differ.',
            'subtle review-note',
          ),
        );
        notes.append(markers);
      }
      const table = element('table', '', 'heatmap-table');
      table.append(element('caption', `${name} observed app usage · ${review?.timezone ?? ''}`));
      const head = element('thead'),
        header = element('tr');
      const hourHeader = element('th', 'Hour');
      hourHeader.scope = 'col';
      header.append(hourHeader);
      for (let position = 0; position < columns; position++) {
        const day = days[position];
        if (!day) {
          const outside = element('th', 'Outside\nrange');
          outside.scope = 'col';
          header.append(outside);
          continue;
        }
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
          new Date(day.date).getUTCDay()
        ];
        const starts = annotations.filter((experiment) => experiment.weekStart === day.date);
        const th = element(
          'th',
          `${weekday}\n${Number(day.date.slice(-2))}${starts.length ? ' ◆' : ''}`,
        );
        th.setAttribute('aria-label', day.date);
        th.title = day.date;
        if (starts.length)
          th.title = starts
            .map((experiment) => `${experiment.appName} experiment starts ${day.date}`)
            .join('; ');
        th.scope = 'col';
        header.append(th);
      }
      head.append(header);
      table.append(head);
      const body = element('tbody');
      for (let hour = 0; hour < 24; hour++) {
        const row = element('tr');
        const th = element('th', `${String(hour).padStart(2, '0')}:00`);
        th.scope = 'row';
        row.append(th);
        for (let position = 0; position < columns; position++) {
          const day = days[position];
          const td = element('td');
          if (!day) {
            const outside = element('span', '—', 'heat-outside');
            outside.setAttribute(
              'aria-label',
              `${name} day ${heatmapStart + position + 1}: outside selected range`,
            );
            td.append(outside);
            row.append(td);
            continue;
          }
          const clock = heatmap.clockChanges.find(
            (item) => item.date === day.date && item.hour === hour,
          );
          if (clock?.durationMs === 0) {
            const missing = element('span', '—', 'heat-clock-gap');
            missing.setAttribute(
              'aria-label',
              `${day.date} ${hour}:00: this clock hour does not exist in the review timezone`,
            );
            td.append(missing);
          } else {
            const cell = cells.find((item) => item.date === day.date && item.hour === hour);
            const value = cell?.durationMs ?? null;
            const open = button(value === null ? '·' : value === 0 ? '0' : '', () =>
              openHour(day.date, hour),
            );
            open.className = `heat-cell ${value === null ? 'heat-unknown' : value === 0 ? 'heat-zero' : `heat-level-${Math.max(1, Math.ceil((value / maximum) * 4))}`}`;
            const accessible = `Explore ${day.date} ${String(hour).padStart(2, '0')}:00: ${value === null ? 'No hourly records; usage unknown' : `${duration(value)} observed · ${cell?.records} records`}${clock ? ` · clock hour spans ${Math.round(clock.durationMs / 60000)} elapsed minutes` : ''}`;
            open.setAttribute('aria-label', accessible);
            open.title = accessible;
            const inspect = () => {
              readoutTitle.textContent = `${name} · ${day.date} · ${String(hour).padStart(2, '0')}:00`;
              readoutValue.textContent =
                value === null
                  ? 'No hourly records · Usage unknown'
                  : `${duration(value)} observed${cell?.topApps[0] ? ` · ${cell.topApps[0].name} leads this hour` : ''}`;
            };
            open.addEventListener('pointerenter', (event) => {
              if (event.pointerType !== 'touch') inspect();
            });
            open.addEventListener('focus', inspect);
            td.append(open);
          }
          row.append(td);
        }
        body.append(row);
      }
      table.append(body);
      panel.append(table, notes);
      if (heatmap.clockChanges.some((item) => dates.has(item.date)))
        notes.append(
          element(
            'p',
            'Clock changes apply: repeated clock hours are combined; — marks a nonexistent hour. A clock-hour label may cover fewer or more than 60 elapsed minutes.',
            'subtle review-note',
          ),
        );
      return panel;
    }
  }
  /** @param {string} date @param {number} hour */
  function openHour(date, hour) {
    drilldown = { kind: 'hour', key: date, hour };
    returnDay = '';
    render();
    container.querySelector('h2')?.focus();
  }

  /** @type {{kind:'day'|'app'|'hour', key:string,hour?:number}|null} */
  let drilldown = null;
  let returnDay = '';
  /** @param {'day'|'app'} kind @param {string} key */
  function openDetail(kind, key) {
    returnDay = kind === 'app' && drilldown?.kind === 'day' ? drilldown.key : '';
    drilldown = { kind, key };
    render();
    container.querySelector('h2')?.focus();
  }
  /** Context stays visible while the loaded detail scrolls; no additional reads or actions.
   * @param {NonNullable<typeof review>['series'][number]} series */
  function renderDetailOverview(series) {
    if (!drilldown) return;
    const overview = element('section', '', 'detail-overview');
    overview.setAttribute('aria-label', 'Loaded period overview');
    const selectedDate = drilldown.kind === 'app' ? returnDay : drilldown.key;
    const app =
      drilldown.kind === 'app'
        ? series.appDrilldowns.find((item) => item.identifier === drilldown?.key)
        : null;
    const selection =
      drilldown.kind === 'app'
        ? `App: ${app?.name ?? drilldown.key}${selectedDate ? ` · from ${selectedDate}` : ''}`
        : drilldown.kind === 'hour'
          ? `Hour: ${drilldown.key} · ${String(drilldown.hour).padStart(2, '0')}:00`
          : `Day: ${drilldown.key}`;
    const header = element('div', '', 'detail-overview-heading');
    header.append(element('strong', 'Period overview'), element('span', selection));
    overview.append(
      header,
      element(
        'p',
        `${review?.timezone ?? ''} · ${series.source}${series.device ? ` · ${series.device}` : ''}`,
        'detail-overview-source review-note',
      ),
    );
    const ceiling = Math.max(
      3600000,
      Math.ceil(Math.max(0, ...series.daily.map((day) => day.durationMs ?? 0)) / 3600000) * 3600000,
    );
    const periods = [series.previous, series.current];
    const days = periods.map((period) =>
      series.daily.filter((day) => day.date >= period.start && day.date <= period.end),
    );
    const count = Math.max(...days.map((periodDays) => periodDays.length));
    for (const [index, period] of periods.entries()) {
      const name = index ? 'Review' : 'Comparison';
      const row = element('div', '', 'detail-overview-row');
      const label = element('div', '', 'detail-overview-label');
      label.append(element('span', name), element('span', `${period.start} – ${period.end}`));
      const chart = element('div', '', 'detail-overview-bars');
      chart.setAttribute('role', 'img');
      chart.setAttribute(
        'aria-label',
        `${name} daily observed usage: ${days[index]?.map((day) => `${day.date}: ${day.durationMs === null ? 'unknown' : duration(day.durationMs)}`).join('; ')}. Shared scale 0 to ${duration(ceiling)}.`,
      );
      for (let position = 0; position < count; position++) {
        const day = days[index]?.[position];
        const slot = element(
          'span',
          '',
          `detail-overview-slot${day?.date === selectedDate ? ' selected' : ''}`,
        );
        slot.setAttribute('aria-hidden', 'true');
        slot.dataset.date = day?.date ?? '';
        slot.title = day
          ? `${day.date}: ${day.durationMs === null ? 'Unknown' : duration(day.durationMs)}${day.date === selectedDate ? ' · selected day' : ''}`
          : 'Outside selected range';
        const mark = element(
          'span',
          !day ? '—' : '',
          `detail-overview-mark${index ? '' : ' old'}${!day ? ' outside' : day.durationMs === null ? ' unknown' : day.durationMs === 0 ? ' zero' : ''}`,
        );
        if (day?.durationMs) mark.style.height = `${(day.durationMs / ceiling) * 100}%`;
        slot.append(mark);
        chart.append(slot);
      }
      const total = element(
        'span',
        period.observedDurationMs === null ? 'Unknown' : duration(period.observedDurationMs),
        'detail-overview-total',
      );
      row.append(label, chart, total);
      overview.append(row);
    }
    overview.append(
      element(
        'p',
        `Shared daily scale: 0–${duration(ceiling)} · dashed = unknown · solid baseline = zero · — = outside range${selectedDate ? ' · outlined column = selected day' : ''}`,
        'detail-overview-key review-note',
      ),
    );
    container.append(overview);
  }

  /** @param {NonNullable<typeof review>['series'][number]} series */
  function renderDetail(series) {
    if (!drilldown) return;
    const panel = element('section', '', 'drilldown');
    panel.append(
      button(reviewView === 'heatmap' ? 'Back to heatmap' : 'Back to weekly review', () => {
        drilldown = null;
        render();
        container.querySelector('h1')?.focus();
      }),
    );
    const heading = element('h2');
    heading.tabIndex = -1;
    panel.append(heading);
    if (drilldown.kind === 'day') {
      const day = series.dayBreakdowns.find((item) => item.date === drilldown?.key);
      if (!day) return;
      heading.textContent = `Apps on ${day.date}`;
      panel.append(element('p', `${duration(day.durationMs)} observed · ${day.records} records`));
      if (day.durationMs === null)
        panel.append(
          element('p', 'No records for this day. Usage is unknown, not zero.', 'subtle'),
        );
      else {
        const list = element('ol', '', 'apps');
        day.topApps.forEach((app) => {
          const row = element('li');
          rankRow(row, app.durationMs, Math.max(1, ...day.topApps.map((item) => item.durationMs)));
          row.append(
            button(app.name, () => openDetail('app', app.identifier)),
            element('span', duration(app.durationMs), 'app-duration'),
          );
          list.append(row);
        });
        panel.append(list);
        if (day.otherDurationMs)
          panel.append(element('p', `Other apps: ${duration(day.otherDurationMs)}`, 'subtle'));
        panel.append(
          element(
            'p',
            'Up to 10 leading apps. Select an app to explore its daily observations.',
            'subtle review-note',
          ),
        );
      }
    } else if (drilldown.kind === 'hour') {
      const date = drilldown.key,
        hour = drilldown.hour;
      const cell = series.heatmap.cells.find((item) => item.date === date && item.hour === hour);
      heading.textContent = `${date} · ${String(hour).padStart(2, '0')}:00`;
      panel.append(element('p', review?.timezone ?? '', 'subtle'));
      if (!cell)
        panel.append(element('p', 'No hourly records in this cell. Usage is unknown, not zero.'));
      else {
        panel.append(
          element('p', `${duration(cell.durationMs)} observed · ${cell.records} records`),
        );
        const list = element('ol', '', 'apps');
        for (const app of cell.topApps) {
          const row = element('li');
          rankRow(row, app.durationMs, Math.max(1, ...cell.topApps.map((item) => item.durationMs)));
          row.append(
            element('span', app.name),
            element('span', duration(app.durationMs), 'app-duration'),
          );
          list.append(row);
        }
        panel.append(list);
        if (cell.otherDurationMs)
          panel.append(element('p', `Other apps: ${duration(cell.otherDurationMs)}`, 'subtle'));
      }
      const summary = series.heatmap.days.find((day) => day.date === date);
      if (summary?.unallocatedRecords)
        panel.append(
          element(
            'p',
            `${summary.unallocatedRecords} records (${duration(summary.unallocatedDurationMs)}) on this day lack hourly placement. They are not included in this cell.`,
            'subtle',
          ),
        );
      const clock = series.heatmap.clockChanges.find(
        (item) => item.date === date && item.hour === hour,
      );
      if (clock)
        panel.append(
          element(
            'p',
            `This clock-hour label spans ${clock.durationMs / 60000} elapsed minutes due to a timezone offset change.`,
            'subtle',
          ),
        );
      panel.append(
        button('Explore whole day', () => openDetail('day', date)),
        element(
          'p',
          'Up to 10 leading apps from intervals wholly inside this clock hour. These are observed app durations, not unique screen-on time or proof of full collection.',
          'subtle review-note',
        ),
      );
    } else {
      const app = series.appDrilldowns.find((item) => item.identifier === drilldown?.key);
      if (!app) return;
      heading.textContent = `${app.name} · daily usage`;
      panel.append(element('p', app.identifier, 'subtle review-note'));
      if (returnDay) {
        const date = returnDay;
        panel.append(button(`Back to ${date}`, () => openDetail('day', date)));
      }
      const list = element('ol', '', 'apps');
      app.daily.forEach((day) => {
        const row = element('li');
        rankRow(row, day.durationMs, Math.max(1, ...app.daily.map((item) => item.durationMs ?? 0)));
        row.append(
          button(day.date, () => openDetail('day', day.date)),
          element('span', duration(day.durationMs), 'app-duration'),
        );
        list.append(row);
      });
      panel.append(list);
      panel.append(
        element(
          'p',
          'No records means unknown usage for this app. Collection may be incomplete even on days with records. These are observed totals, not an explanation of why usage changed.',
          'subtle review-note',
        ),
      );
    }
    panel.append(
      element('p', 'Uses the loaded review. No additional reads or charges.', 'subtle review-note'),
    );
    panel.append(reviewDisclosure('Ask about selection', [chartConversation(series)]));
    container.append(panel);
    if (drilldown.kind === 'app') {
      const app = series.appDrilldowns.find((item) => item.identifier === drilldown?.key);
      if (
        review?.currentDays === 7 &&
        app &&
        app.daily
          .filter((day) => day.date >= series.current.start && day.date <= series.current.end)
          .some((day) => day.durationMs !== null)
      )
        renderGoalForm(series, app.identifier, app.name);
    }
  }

  function finishPresentation() {
    container.classList.add('screen-time-visual');
    if (drilldown && !insightView && !experimentView) {
      const context = [
        ...container.querySelectorAll(
          ':scope > .review-answer, :scope > .stats, :scope > .review-controls, :scope > .review-modes',
        ),
      ];
      container.append(reviewDisclosure('Period & view', context));
    }
    let notes = container.querySelector(':scope > details.review-notes');
    if (!notes) {
      notes = reviewDisclosure('About this data', []);
      notes.classList.add('review-notes');
      container.append(notes);
    }
    compactReview(container);
  }

  function render() {
    if (insightView) {
      renderInsights();
      finishPresentation();
      return;
    }
    if (experimentView) {
      renderExperiments();
      finishPresentation();
      return;
    }
    if (!review) return;
    const value = review;
    // Older saved tool results predate explicit range metadata and always contain seven-day periods.
    value.currentDays ??= 7;
    value.comparisonDays ??= 7;
    value.weekEnd ??= new Date(Date.parse(value.weekStart) + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    value.comparisonWeekEnd ??= new Date(Date.parse(value.previousWeekStart) + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    container.replaceChildren();
    container.append(
      element(
        'p',
        value.fictional ? 'MYSELF.MD · FICTIONAL EXAMPLE' : 'MYSELF.MD · SCREEN TIME',
        'eyebrow',
      ),
    );
    const pageTitle = element('h1', 'Screen time');
    pageTitle.tabIndex = -1;
    const reviewHeader = element('div', '', 'review-header');
    reviewHeader.append(pageTitle);
    const experimentsStatus = element('p', '', 'subtle');
    const experiments = button('My experiments', () => {
      void perform(
        experiments,
        async () => toolValue(await callTool('list_screen_time_experiments', {})),
        experimentsStatus,
      );
    });
    container.append(reviewHeader);
    const controls = element('details', '', 'review-controls');
    controls.open = controlsOpen;
    controls.append(element('summary', 'Dates & filters'));
    controls.addEventListener('toggle', () => {
      controlsOpen = controls.open;
    });
    controls.append(
      screenTimePeriodPicker({
        weekStart: value.weekStart,
        comparisonWeekStart: value.previousWeekStart,
        weekEnd: value.weekEnd,
        comparisonWeekEnd: value.comparisonWeekEnd,
        timezone: value.timezone,
        day: drilldown?.kind === 'day' || drilldown?.kind === 'hour' ? drilldown.key : '',
        hour: drilldown?.kind === 'hour' ? String(drilldown.hour) : '',
        onLoad: loadPeriod,
        onSelect: (date, hour) => {
          if (loadingPeriod) return;
          if (date) {
            const index =
              value.series[selected]?.daily.findIndex((item) => item.date === date) ?? -1;
            const count = value.comparisonDays;
            heatmapStart =
              index < count ? Math.floor(index / 7) * 7 : Math.floor((index - count) / 7) * 7;
            if (hour !== '') openHour(date, Number(hour));
            else openDetail('day', date);
          } else {
            drilldown = null;
            returnDay = '';
            render();
          }
          const control = container.querySelector(
            hour !== '' ? '.period-selection label:last-child select' : '.period-selection select',
          );
          if (control instanceof HTMLSelectElement) control.focus();
        },
      }),
    );
    controls.append(
      element(
        'p',
        `Comparison: ${value.previousWeekStart} – ${value.comparisonWeekEnd} · Days align by position within each range.`,
        'subtle comparison-range',
      ),
    );
    container.append(controls);
    const series = value.series[selected];
    const actions = element('div', '', 'insight-actions');
    actions.append(experiments);
    if (series)
      actions.append(
        button('Help me choose a change', () => {
          insightView = {
            version: 'myself.md.screen-time-insights.v1',
            kind: 'coach',
            data: { suggestions: experimentCoaching(series, value.weekStart) },
          };
          render();
        }),
        button('Export readiness', () => {
          insightView = {
            version: 'myself.md.screen-time-insights.v1',
            kind: 'readiness',
            data: {
              series: [
                {
                  series: {
                    source: series.source,
                    type: series.type,
                    granularity: series.granularity,
                    device: series.device,
                  },
                  readiness: exportReadiness(
                    series,
                    value.exports.some((file) => file.partial),
                    value.counts,
                  ),
                },
              ],
            },
          };
          render();
        }),
      );
    actions.append(
      button('My reflections', () => {
        insightView = {
          version: 'myself.md.screen-time-insights.v1',
          kind: 'reflections',
          data: { reflections: value.insights?.reflections ?? [] },
        };
        render();
      }),
      button('Monthly story', () => {
        insightView = { version: 'myself.md.screen-time-insights.v1', kind: 'month', data: {} };
        render();
      }),
    );
    if (!series) {
      container.append(element('p', 'No usable screen-time records in this period.', 'summary'));
      container.append(
        element(
          'p',
          'Choose shared screen-time exports covering the review week and the preceding week. Missing records do not mean zero usage.',
        ),
      );
    } else {
      const periodContext = element('div', '', 'period-context');
      periodContext.append(
        element(
          'p',
          `${series.current.start} – ${series.current.end} · ${value.timezone}`,
          'subtle',
        ),
        element('p', `Compared with ${series.previous.start} – ${series.previous.end}`, 'subtle'),
      );
      if (value.series.length > 1) {
        const label = element('label', 'Usage source', 'source-label');
        const select = element('select');
        select.setAttribute('aria-label', 'Usage source');
        value.series.forEach((item, index) => {
          const option = element(
            'option',
            `${item.source} · ${item.type} · ${item.granularity}${item.device ? ` · ${item.device}` : ''}`,
          );
          option.value = String(index);
          option.selected = selected === index;
          select.append(option);
        });
        select.addEventListener('change', () => {
          selected = Number(select.value);
          drilldown = null;
          returnDay = '';
          render();
          container.querySelector('select')?.focus();
        });
        label.append(select);
        container.append(label);
      }
      const summary = element('div', '', 'stats');
      const hasPrevious = series.previous.observedDays > 0;
      const current = element('div');
      current.append(
        element('p', 'Review', 'subtle'),
        element('p', duration(series.current.observedDurationMs), 'total'),
      );
      const previous = element('div');
      previous.append(
        element('p', 'Comparison', 'subtle'),
        element('p', duration(series.previous.observedDurationMs), 'previous-total'),
        element(
          'p',
          `${series.previous.observedDays ? duration((series.previous.observedDurationMs ?? 0) / series.previous.observedDays) : 'Unknown'} per observed comparison day`,
          'subtle review-note',
        ),
      );
      summary.append(current);
      if (hasPrevious) summary.append(previous);
      const average = element('div');
      average.append(
        element('p', 'Per observed day', 'subtle'),
        element(
          'p',
          series.current.observedDays
            ? duration((series.current.observedDurationMs ?? 0) / series.current.observedDays)
            : 'Unknown',
          'metric-value',
        ),
      );
      summary.append(average);
      const change =
        series.changeMs === null
          ? value.currentDays !== value.comparisonDays
            ? 'Different range lengths: compare totals and per-observed-day averages; raw change is unavailable.'
            : 'Period comparison unavailable'
          : series.changeMs === 0
            ? 'No change in observed usage'
            : `${duration(Math.abs(series.changeMs))} ${series.changeMs < 0 ? 'less' : 'more'} observed usage${series.changePercent === null ? '' : ` (${Math.abs(series.changePercent).toFixed(0)}%)`}`;
      const answer = element('section', '', 'review-answer');
      answer.setAttribute('aria-label', 'Period comparison summary');
      answer.append(element('p', change, 'comparison'), periodContext);
      const reasons = [];
      if (value.currentDays !== value.comparisonDays)
        reasons.push('The ranges have different lengths.');
      if (
        series.current.observedDays < value.currentDays ||
        series.previous.observedDays < value.comparisonDays
      )
        reasons.push('One or both periods have missing days.');
      if (value.exports.some((file) => file.partial)) reasons.push('A selected export is partial.');
      if (value.counts.invalid || value.counts.crossingDay || value.counts.overlaps)
        reasons.push('Invalid, cross-midnight or conflicting records were excluded.');
      if (series.changeMs === null)
        answer.append(
          element(
            'p',
            reasons.join(' ') || 'These observations do not support a period comparison.',
            'subtle comparison-reason',
          ),
        );
      if (!hasPrevious)
        answer.append(
          element(
            'p',
            `No comparison data for ${series.previous.start} – ${series.previous.end}.`,
            'subtle coverage-note',
          ),
        );
      answer.append(
        element(
          'p',
          `${series.current.observedDays}/${value.currentDays} review days with records · ${series.previous.observedDays}/${value.comparisonDays} comparison days with records. Missing days are unknown; observed days may be incomplete.`,
          'subtle coverage-summary review-note',
        ),
      );
      container.insertBefore(answer, controls);
      container.append(summary);
      if (series.heatmap) {
        const modes = element('div', '', 'review-modes');
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', 'Review view');
        for (const [key, name] of [
          ['weekly', 'Period totals'],
          ['heatmap', 'Attention heatmap'],
        ]) {
          const mode = button(name ?? '', () => {
            reviewView = key ?? 'weekly';
            drilldown = null;
            returnDay = '';
            render();
            const selectedMode = container.querySelector(
              `.review-modes button[aria-pressed="true"]`,
            );
            if (selectedMode instanceof HTMLElement) selectedMode.focus();
          });
          mode.setAttribute('aria-pressed', String(reviewView === key));
          modes.append(mode);
        }
        container.append(modes);
      }
      if (drilldown && series.dayBreakdowns && series.appDrilldowns) {
        renderDetailOverview(series);
        renderDetail(series);
      } else if (reviewView === 'heatmap' && series.heatmap) {
        renderHeatmap(series);
      } else {
        renderDailyChart(series);
        const table = element('table');
        table.append(
          element(
            'caption',
            hasPrevious
              ? `Daily observed usage. Comparison: ${series.previous.start} – ${series.previous.end} (gray). This week: ${series.current.start} – ${series.current.end} (violet).`
              : 'Daily observed usage for the review week (violet).',
          ),
        );
        const header = element('tr');
        for (const title of hasPrevious
          ? ['Date', 'Comparison', 'Review period']
          : ['Date', 'Review period']) {
          const th = element('th', title);
          th.scope = 'col';
          header.append(th);
        }
        const head = element('thead');
        head.append(header);
        table.append(head);
        const body = element('tbody');
        const maximum = Math.max(1, ...series.daily.map((day) => day.durationMs ?? 0));
        for (let i = 0; i < Math.max(value.currentDays, value.comparisonDays); i++) {
          const before = i < value.comparisonDays ? series.daily[i] : undefined,
            day = i < value.currentDays ? series.daily[i + value.comparisonDays] : undefined;
          const row = element('tr');
          const name = element('th', `Day ${i + 1}`);
          name.scope = 'row';
          row.append(name);
          for (const [index, entry] of [before, day].entries()) {
            if (index === 0 && !hasPrevious) continue;
            const cell = element('td');
            if (!entry) {
              cell.textContent = 'Outside range';
              row.append(cell);
              continue;
            }
            const bar = element('span', '', index === 0 ? 'bar previous' : 'bar current');
            bar.style.width = `${Math.max(0, ((entry.durationMs ?? 0) / maximum) * 100)}%`;
            bar.setAttribute('aria-hidden', 'true');
            cell.append(bar);
            if (series.dayBreakdowns) {
              const open = button(`${entry.date.slice(5)} · ${duration(entry.durationMs)}`, () =>
                openDetail('day', entry.date),
              );
              open.classList.add('bar-label');
              open.setAttribute(
                'aria-label',
                `Explore ${entry.date}: ${duration(entry.durationMs)}`,
              );
              cell.append(open);
            } else cell.append(element('span', duration(entry.durationMs), 'bar-label'));
            cell.title = `${entry.date}: ${duration(entry.durationMs)}`;
            row.append(cell);
          }
          body.append(row);
        }
        table.append(body);
        const dailyValues = element('details', '', 'daily-values');
        dailyValues.append(element('summary', 'Daily values & comparison'), table);
        container.append(dailyValues);
        renderAppComparison(series);
        if (series.dayBreakdowns)
          container.append(
            element(
              'p',
              'Select a day or app to explore. Uses the loaded review without additional reads.',
              'subtle review-note',
            ),
          );
      }
      container.append(
        element(
          'p',
          `${series.source} · ${series.type} · ${series.granularity}${series.device ? ` · ${series.device}` : ''}`,
          'subtle review-note',
        ),
      );
    }
    container.append(reviewDisclosure('Explore more', [actions, experimentsStatus]));
    const details = element('details', '', 'review-notes');
    details.append(element('summary', 'Sources & limits'));
    const list = element('ul');
    value.warnings.forEach((warning) => list.append(element('li', warning)));
    list.append(
      element(
        'li',
        `Excluded: ${value.counts.invalid} invalid, ${value.counts.crossingDay} crossing midnight, ${value.counts.overlaps} overlapping records. ${value.counts.duplicates} exact repeats removed.`,
      ),
    );
    value.exports.forEach((file) =>
      list.append(
        element(
          'li',
          `${file.day} · ${file.id} · uploaded ${file.created}${file.partial ? ' · partial' : ''}`,
        ),
      ),
    );
    details.append(list);
    container.append(details);
    container.append(element('p', value.nextStep, 'reflection review-note'));
    finishPresentation();
    window.parent.postMessage(
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/size-changed',
        params: { height: Math.ceil(container.getBoundingClientRect().height) },
      },
      '*',
    );
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    const request = pending.get(String(event.data.id));
    if (request) {
      pending.delete(String(event.data.id));
      clearTimeout(request.timer);
      if (event.data.error)
        request.reject(new Error(event.data.error.message ?? 'Host request failed.'));
      else request.resolve(event.data.result);
      return;
    }
    if (event.data.id === 'review-init' && event.data.result) {
      initialized = true;
      window.parent.postMessage(
        { jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} },
        '*',
      );
    }
    if (event.data.method !== 'ui/notifications/tool-result') return;
    if (event.data.params?.isError) {
      review = null;
      container.replaceChildren(
        element('h1', 'Review unavailable'),
        element(
          'p',
          'Refresh your shared exports and try again. Any successfully read pages still use the normal allowance.',
        ),
      );
      return;
    }
    const value = event.data.params?.structuredContent;
    if (value?.version === 'myself.md.screen-time-insights.v1') {
      if (value.kind === 'coach' && value.data?.review) {
        review = value.data.review;
        experimentView = null;
        insightView = {
          ...value,
          data: { ...value.data, suggestions: value.data.series?.[0]?.suggestions ?? [] },
        };
      } else {
        insightView = value;
      }
      render();
      return;
    }
    if (value?.version === 'myself.md.screen-time-experiments.v1') {
      insightView = null;
      experimentView = {
        experiments: value.experiments,
        message: value.message ?? 'Experiments updated.',
        cancelledId: value.cancelledId ?? null,
      };
      render();
      return;
    }
    if (value?.version !== 'myself.md.screen-time-review.v1' || !Array.isArray(value.series))
      return;
    insightView = null;
    experimentView = null;
    review = value;
    selected = 0;
    reviewView = container.dataset.initialView === 'heatmap' ? 'heatmap' : 'weekly';
    heatmapStart = -1;
    drilldown = null;
    returnDay = '';
    render();
  });
  new ResizeObserver(() => {
    window.parent.postMessage(
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/size-changed',
        params: { height: Math.ceil(container.getBoundingClientRect().height) },
      },
      '*',
    );
  }).observe(container);
  window.parent.postMessage(
    {
      jsonrpc: '2.0',
      id: 'review-init',
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appInfo: { name: 'myself.md weekly review', version: '1.0.0' },
        appCapabilities: {},
      },
    },
    '*',
  );
}

mountScreenTimeReview();
