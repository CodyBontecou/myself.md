import assert from 'node:assert/strict';
import { screenTimePresetPeriod } from '../core/screen-time-period.js';
import { scheduleCalendar } from '../server/schedule-calendar.js';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { experimentSchema } from '../server/screen-time-experiment-store.js';
import { randomUUID } from 'node:crypto';
import { parseProfile } from '../core/profiles.js';

/** Exercise the restricted production-runtime route with a distinct fictional owner.
 * @param {{origin:string,request:(path:string,bearer:string|null,method?:string,body?:unknown)=>Promise<{status:number,value:unknown}>,token:(subject:string,client:string,path?:string)=>Promise<string>}} fixture */
export async function verifyWeeklyReviewWorker({ origin, request, token }) {
  const phone = await token('weekly-review-owner', 'myselfmd-phone');
  const agent = await token('weekly-review-owner', 'weekly-review-agent', '/mcp/chatgpt');
  const intruder = await token('weekly-review-intruder', 'myselfmd-phone');
  const setup = new Client({ name: 'weekly-review-setup', version: '1' });
  let ticket;
  try {
    await setup.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
        requestInit: {
          headers: { Authorization: await token('weekly-review-owner', 'weekly-review-agent') },
        },
      }),
    );
    const pairing = await setup.callTool({ name: 'create_phone_pairing', arguments: {} });
    ticket = new URL(
      z.object({ pairingUrl: z.string() }).parse(pairing.structuredContent).pairingUrl,
    ).hash.slice(1);
  } finally {
    await setup.close();
  }
  const device = z.object({ id: z.string() }).parse(
    (
      await request('/api/claim', phone, 'POST', {
        ticket,
        name: 'Fictional weekly-review phone',
      })
    ).value,
  ).id;
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Fictional weekly review',
      selection: { health: [], time: ['native:applications'], location: [] },
    }),
    id: 'weekly-review-worker',
  };
  const catalog = {
    profileSync: { base: null },
    profiles: [
      {
        ...profile,
        agentAccess: true,
        agentPermissions: { health: false, time: true, location: false, logs: false },
      },
    ],
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: domain === 'time',
      types: domain === 'time' ? ['native:applications'] : [],
      availableTypes: domain === 'time' ? ['native:applications'] : [],
      notes: [],
    })),
  };
  assert.equal((await request(`/api/phones/${device}/poll`, phone, 'POST', catalog)).status, 200);
  const upload = z
    .object({ token: z.string() })
    .parse(
      (await request('/api/cloud/credential', phone, 'POST', { deviceId: device, profile })).value,
    ).token;
  assert.equal(
    (
      await request('/api/billing', phone, 'POST', {
        action: 'reserve',
        id: 'weekly-review-upload',
        scope: { profileId: profile.id, days: ['2026-10-14'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  const records = Array.from({ length: 14 }, (_, index) => ({
    domain: 'time',
    type: 'applications',
    source: 'fictional-worker',
    start: new Date(Date.parse('2026-10-01') + index * 86400000).toISOString(),
    end: new Date(Date.parse('2026-10-01') + index * 86400000 + 3600000).toISOString(),
    native: {
      identifier: 'fictional.reader',
      durationMs: index < 7 ? 600000 : 1200000,
      fictional: true,
      granularity: 'hourly-aggregate',
    },
  }));
  const id = z.object({ id: z.string() }).parse(
    (
      await request('/api/cloud/uploads', `Upload ${upload}`, 'POST', {
        profile,
        day: '2026-10-14',
        format: 'jsonl',
        manifest: {
          profileId: profile.id,
          recordCount: records.length,
          billingOperationId: 'weekly-review-upload',
        },
      })
    ).value,
  ).id;
  assert.equal(
    (
      await fetch(`${origin}/api/cloud/uploads/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Upload ${upload}` },
        body: records.map((record) => JSON.stringify(record)).join('\n') + '\n',
      })
    ).status,
    200,
  );
  const client = new Client({ name: 'weekly-review-worker', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp/chatgpt'), {
        requestInit: { headers: { Authorization: agent } },
      }),
    );
    const tool = (await client.listTools()).tools.find(
      (entry) => entry.name === 'review_weekly_screen_time',
    );
    assert.ok(tool?.outputSchema);
    const result = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { exportIds: [id], weekStart: '2026-10-08', timezone: 'UTC' },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    const review = z
      .object({
        series: z.array(
          z.object({
            heatmap: z.object({
              cells: z.array(
                z.object({ date: z.string(), hour: z.number(), durationMs: z.number() }),
              ),
              days: z.array(z.object({ unallocatedRecords: z.number() })),
            }),
            changePercent: z.number(),
            dayBreakdowns: z.array(
              z.object({
                date: z.string(),
                durationMs: z.number().nullable(),
                topApps: z.array(z.object({ identifier: z.string(), durationMs: z.number() })),
              }),
            ),
            appDrilldowns: z.array(
              z.object({
                identifier: z.string(),
                daily: z.array(z.object({ date: z.string(), durationMs: z.number().nullable() })),
              }),
            ),
            current: z.object({ observedDurationMs: z.number() }),
          }),
        ),
      })
      .parse(result.structuredContent);
    assert.equal(review.series[0]?.changePercent, 100);
    assert.equal(review.series[0]?.current.observedDurationMs, 8400000);
    assert.equal(review.series[0]?.dayBreakdowns[7]?.topApps[0]?.durationMs, 1200000);
    assert.equal(review.series[0]?.appDrilldowns[0]?.daily.length, 14);
    assert.equal(review.series[0]?.heatmap.cells.length, 14);
    assert.equal(review.series[0]?.heatmap.cells[7]?.durationMs, 1200000);
    assert.equal(review.series[0]?.heatmap.cells[7]?.hour, 0);
    const custom = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-08',
        comparisonWeekStart: '2026-09-17',
        timezone: 'UTC',
      },
    });
    assert.ok(!custom.isError, JSON.stringify(custom));
    const customValue = z
      .object({
        previousWeekStart: z.string(),
        series: z.array(
          z.object({
            previous: z.object({
              observedDays: z.number(),
              observedDurationMs: z.number().nullable(),
            }),
            changePercent: z.number().nullable(),
          }),
        ),
      })
      .parse(custom.structuredContent);
    assert.equal(customValue.previousWeekStart, '2026-09-17');
    assert.equal(customValue.series[0]?.previous.observedDays, 0);
    assert.equal(customValue.series[0]?.previous.observedDurationMs, null);
    assert.equal(customValue.series[0]?.changePercent, null);
    const later = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-01',
        comparisonWeekStart: '2026-10-08',
        timezone: 'UTC',
      },
    });
    assert.ok(!later.isError, JSON.stringify(later));
    assert.equal(
      z
        .object({ series: z.array(z.object({ changePercent: z.number() })) })
        .parse(later.structuredContent).series[0]?.changePercent,
      -50,
    );
    const selectedComparisonContext = await client.callTool({
      name: 'inspect_screen_time_chart',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-01',
        comparisonWeekStart: '2026-10-09',
        timezone: 'UTC',
        series: {
          source: 'fictional-worker',
          type: 'applications',
          granularity: 'hourly-aggregate',
          device: '',
        },
        selection: { kind: 'day', date: '2026-10-02' },
      },
    });
    assert.ok(!selectedComparisonContext.isError, JSON.stringify(selectedComparisonContext));
    assert.equal(
      z
        .object({
          data: z.object({ context: z.object({ previous: z.object({ date: z.string() }) }) }),
        })
        .parse(selectedComparisonContext.structuredContent).data.context.previous.date,
      '2026-10-10',
    );
    const overlapping = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-08',
        comparisonWeekStart: '2026-10-07',
        timezone: 'UTC',
      },
    });
    assert.equal(overlapping.isError, true);
    const futureComparison = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-08',
        comparisonWeekStart: '2099-01-01',
        timezone: 'UTC',
      },
    });
    assert.equal(futureComparison.isError, true);
    const rangeArgs = {
      exportIds: [id],
      weekStart: '2026-10-08',
      weekEnd: '2026-10-10',
      comparisonWeekStart: '2026-10-01',
      comparisonWeekEnd: '2026-10-05',
      timezone: 'UTC',
    };
    const ranges = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: rangeArgs,
    });
    assert.ok(!ranges.isError, JSON.stringify(ranges));
    const rangeValue = z
      .object({
        currentDays: z.number(),
        comparisonDays: z.number(),
        weekEnd: z.string(),
        comparisonWeekEnd: z.string(),
        series: z.array(
          z.object({
            changeMs: z.number().nullable(),
            comparable: z.boolean(),
            daily: z.array(z.object({ date: z.string() })),
            current: z.object({ observedDays: z.number(), observedDurationMs: z.number() }),
            previous: z.object({ observedDays: z.number(), observedDurationMs: z.number() }),
          }),
        ),
      })
      .parse(ranges.structuredContent);
    assert.equal(rangeValue.currentDays, 3);
    assert.equal(rangeValue.comparisonDays, 5);
    assert.equal(rangeValue.series[0]?.daily.length, 8);
    assert.equal(rangeValue.series[0]?.current.observedDurationMs, 3600000);
    assert.equal(rangeValue.series[0]?.previous.observedDurationMs, 3000000);
    assert.equal(rangeValue.series[0]?.comparable, false);
    assert.equal(rangeValue.series[0]?.changeMs, null);
    const oneDay = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { ...rangeArgs, weekEnd: '2026-10-08', comparisonWeekEnd: '2026-10-01' },
    });
    assert.ok(!oneDay.isError, JSON.stringify(oneDay));
    assert.equal(
      z
        .object({ series: z.array(z.object({ changePercent: z.number() })) })
        .parse(oneDay.structuredContent).series[0]?.changePercent,
      100,
    );
    const invalidRanges = [
      { weekEnd: '2026-10-07' },
      { weekStart: '2026-08-01', weekEnd: '2026-09-01' },
      { comparisonWeekEnd: '2026-10-08' },
      { comparisonWeekEnd: '2099-01-01' },
      { weekEnd: '2026-02-30' },
    ];
    await Promise.all(
      invalidRanges.map(async (invalid) => {
        const rejected = await client.callTool({
          name: 'review_weekly_screen_time',
          arguments: { ...rangeArgs, ...invalid },
        });
        assert.equal(rejected.isError, true, JSON.stringify(invalid));
      }),
    );
    const rangeContext = await client.callTool({
      name: 'inspect_screen_time_chart',
      arguments: {
        ...rangeArgs,
        series: {
          source: 'fictional-worker',
          type: 'applications',
          granularity: 'hourly-aggregate',
          device: '',
        },
        selection: { kind: 'day', date: '2026-10-10' },
      },
    });
    assert.ok(!rangeContext.isError, JSON.stringify(rangeContext));
    assert.equal(
      z
        .object({
          data: z.object({ context: z.object({ previous: z.object({ date: z.string() }) }) }),
        })
        .parse(rangeContext.structuredContent).data.context.previous.date,
      '2026-10-03',
    );
    await Promise.all(
      /** @type {const} */ (['yesterday', 'last_7_days', 'last_30_days']).map(async (preset) => {
        const expected = screenTimePresetPeriod(
          preset,
          scheduleCalendar('America/Puerto_Rico').day(new Date().toISOString()),
        );
        const presetResult = await client.callTool({
          name: 'review_weekly_screen_time',
          arguments: { exportIds: [id], preset, timezone: 'America/Puerto_Rico' },
        });
        assert.ok(!presetResult.isError, JSON.stringify(presetResult));
        const actual = z
          .object({
            weekStart: z.string(),
            weekEnd: z.string(),
            previousWeekStart: z.string(),
            comparisonWeekEnd: z.string(),
            currentDays: z.number(),
            comparisonDays: z.number(),
          })
          .parse(presetResult.structuredContent);
        assert.equal(actual.weekStart, expected.weekStart);
        assert.equal(actual.weekEnd, expected.weekEnd);
        assert.equal(actual.previousWeekStart, expected.comparisonWeekStart);
        assert.equal(actual.comparisonWeekEnd, expected.comparisonWeekEnd);
        assert.equal(actual.currentDays, actual.comparisonDays);
      }),
    );
    const ambiguousPreset = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { ...rangeArgs, preset: 'yesterday' },
    });
    assert.equal(ambiguousPreset.isError, true);
    const invalidPreset = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { exportIds: [id], preset: 'last_365_days', timezone: 'UTC' },
    });
    assert.equal(invalidPreset.isError, true);
    const missingPeriod = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { exportIds: [id], timezone: 'UTC' },
    });
    assert.equal(missingPeriod.isError, true);
    const goalArgs = {
      requestId: randomUUID(),
      exportIds: [id],
      baselineWeekStart: '2026-10-01',
      weekStart: '2026-10-08',
      timezone: 'UTC',
      series: {
        source: 'fictional-worker',
        type: 'applications',
        granularity: 'hourly-aggregate',
        device: '',
      },
      appIdentifier: 'fictional.reader',
      targetMinutesPerDay: 20,
      plan: 'Fictional Worker verification',
    };
    const saved = await client.callTool({
      name: 'save_screen_time_experiment',
      arguments: goalArgs,
    });
    assert.ok(!saved.isError, JSON.stringify(saved));
    const savedValue = z
      .object({ experiments: z.array(experimentSchema) })
      .parse(saved.structuredContent).experiments[0];
    assert.ok(savedValue);
    assert.equal(savedValue.baseline.observedDays, 7);
    const evaluation = await client.callTool({
      name: 'review_screen_time_experiment',
      arguments: { experimentId: savedValue.id, exportIds: [id] },
    });
    assert.ok(!evaluation.isError, JSON.stringify(evaluation));
    const evaluated = z
      .object({ experiments: z.array(experimentSchema) })
      .parse(evaluation.structuredContent).experiments[0];
    assert.equal(evaluated?.latestReview?.outcome, 'within_goal');
    assert.equal(evaluated?.latestReview?.changeMs, 4200000);
    assert.ok(
      !(
        await client.callTool({
          name: 'cancel_screen_time_experiment',
          arguments: { experimentId: savedValue.id },
        })
      ).isError,
    );
    const listed = await client.callTool({ name: 'list_screen_time_experiments', arguments: {} });
    assert.equal(
      z.object({ experiments: z.array(experimentSchema) }).parse(listed.structuredContent)
        .experiments[0]?.state,
      'cancelled',
    );

    const reflectionId = randomUUID();
    const reflection = await client.callTool({
      name: 'save_screen_time_reflection',
      arguments: {
        reflectionId,
        deviceId: device,
        profileId: profile.id,
        weekStart: '2026-10-08',
        timezone: 'UTC',
        experimentId: savedValue.id,
        text: 'Fictional workerd reflection: reading week.',
      },
    });
    assert.ok(!reflection.isError, JSON.stringify(reflection));
    const notes = await client.callTool({
      name: 'list_screen_time_reflections',
      arguments: { deviceId: device, profileId: profile.id },
    });
    assert.equal(
      z
        .object({ data: z.object({ reflections: z.array(z.object({ id: z.string() })) }) })
        .parse(notes.structuredContent).data.reflections[0]?.id,
      reflectionId,
    );
    const coaching = await client.callTool({
      name: 'suggest_screen_time_experiments',
      arguments: { exportIds: [id], weekStart: '2026-10-08', timezone: 'UTC' },
    });
    assert.ok(!coaching.isError, JSON.stringify(coaching));
    const ready = await client.callTool({
      name: 'check_screen_time_readiness',
      arguments: { exportIds: [id], weekStart: '2026-10-08', timezone: 'UTC' },
    });
    assert.ok(!ready.isError, JSON.stringify(ready));
    const context = await client.callTool({
      name: 'inspect_screen_time_chart',
      arguments: {
        exportIds: [id],
        weekStart: '2026-10-08',
        timezone: 'UTC',
        series: goalArgs.series,
        selection: { kind: 'hour', date: '2026-10-08', hour: 0 },
      },
    });
    assert.ok(!context.isError, JSON.stringify(context));
    assert.equal(
      z
        .object({ data: z.object({ context: z.object({ changeMs: z.number() }) }) })
        .parse(context.structuredContent).data.context.changeMs,
      600000,
    );
    const hourly = await client.callTool({
      name: 'compare_screen_time_experiment_hours',
      arguments: {
        experimentId: savedValue.id,
        baselineExportIds: [id],
        experimentExportIds: [id],
      },
    });
    assert.ok(!hourly.isError, JSON.stringify(hourly));
    assert.equal(
      z
        .object({ data: z.object({ comparison: z.object({ pairedHours: z.number() }) }) })
        .parse(hourly.structuredContent).data.comparison.pairedHours,
      7,
    );
    const monthly = await client.callTool({
      name: 'review_monthly_attention',
      arguments: { exportIds: [id], month: '2026-09', timezone: 'UTC' },
    });
    assert.ok(!monthly.isError, JSON.stringify(monthly));
    const annotated = await client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { exportIds: [id], weekStart: '2026-10-08', timezone: 'UTC' },
    });
    assert.ok(!annotated.isError, JSON.stringify(annotated));
    assert.equal(
      z
        .object({ insights: z.object({ reflections: z.array(z.object({ id: z.string() })) }) })
        .parse(annotated.structuredContent).insights.reflections[0]?.id,
      reflectionId,
    );

    const { _meta: metadata } = tool;
    const uiUri = z.object({ ui: z.object({ resourceUri: z.string() }) }).parse(metadata)
      .ui.resourceUri;
    assert.equal(uiUri, 'ui://myself-md/weekly-screen-time-review-v15.html');
    const resource = await client.readResource({ uri: uiUri });
    assert.equal(
      (await client.readResource({ uri: 'ui://myself-md/weekly-screen-time-review.html' }))
        .contents[0]?.mimeType,
      'text/html;profile=mcp-app',
    );
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    assert.equal((await request(`/api/cloud/exports/${id}`, intruder, 'DELETE')).status, 404);
    console.log(
      'Weekly review Worker: restricted OAuth, real R2 reads, experiments, coaching, durable reflections, chart context, readiness, month stories, annotated hour comparisons and versioned UI passed.',
    );
  } finally {
    await client.close();
  }
}
