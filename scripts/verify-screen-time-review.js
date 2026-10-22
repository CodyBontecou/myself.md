import { verifyScreenTimeInsights } from './verify-screen-time-insights.js';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimentOutcome } from '../core/screen-time-experiment.js';
import { z } from 'zod';
import { experimentSchema } from '../server/screen-time-experiment-store.js';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { chromium } from 'playwright';
import { CloudStore } from '../server/cloud-store.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { createCloudService } from '../server/cloud-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
import { attentionHeatmap } from '../core/attention-heatmap.js';
import { screenTimeHourSlots } from '../server/screen-time-hours.js';
import { screenTimeReview } from '../core/screen-time-review.js';
import { screenTimeAppName } from '../core/screen-time-app-name.js';
import { scheduleCalendar } from '../server/schedule-calendar.js';
import { parseProfile } from '../core/profiles.js';
import { reviewToolMetadata } from './mcp-review-metadata.js';

/** @param {Awaited<ReturnType<import('@modelcontextprotocol/client').Client['callTool']>>} response */
function experimentResult(response) {
  assert.ok(!response.isError, JSON.stringify(response));
  return z
    .object({
      experiments: z.array(experimentSchema.extend({ phase: z.string() })),
      cancelledId: z.string().nullable(),
    })
    .parse(response.structuredContent);
}

const cloud = new CloudStore(':memory:', randomBytes(32));
assert.equal(screenTimeAppName('com.myself.md', 'com.myself.md', 'applications'), 'myself.md');
assert.equal(screenTimeAppName('com.openai.chat', undefined, 'applications'), 'ChatGPT');
assert.equal(
  screenTimeAppName('com.openai.chat', 'Owner supplied label', 'applications'),
  'Owner supplied label',
);
assert.equal(screenTimeAppName('unknown.bundle', '', 'applications'), 'unknown.bundle');
assert.equal(screenTimeAppName('com.openai.chat', undefined, 'websites'), 'com.openai.chat');
const billing = new BillingStore(':memory:');
const history = new HistoryStore(':memory:', cloud);
const subject = 'weekly-review-fictional-owner';
const device = randomUUID();
const profile = {
  ...parseProfile({
    schema: 'myself.md.profile.v1',
    name: 'Fictional weekly review',
    selection: {
      health: ['native:sleep'],
      time: ['native:applications', 'native:sessions'],
      location: [],
    },
    export: { destination: 'cloud', formats: ['jsonl'], writeMode: 'new_file' },
  }),
  id: 'weekly-screen-time',
};
const approved = {
  ...profile,
  agentAccess: true,
  agentPermissions: { health: true, time: true, location: false, logs: false },
};
cloud.access(subject, device, profile, true);
cloud.syncAgentPermissions(subject, device, [approved]);
billing.grant(subject, 'weekly-review-fixture', 'fictional-only');
/** @type {import('../core/data.js').DataRecord[]} */
const records = Array.from({ length: 14 * 60 }, (_, index) => {
  const day = Math.floor(index / 60),
    slot = index % 60;
  const start = Date.parse('2026-10-01') + day * 86400000 + slot * 600000;
  return {
    domain: 'time',
    type: 'applications',
    source: 'fictional-usage',
    start: new Date(start).toISOString(),
    end: new Date(start + 600000).toISOString(),
    native: {
      identifier: `fictional.app.${slot % 3}`,
      displayName: ['Browser', 'Reader', 'Music'][slot % 3],
      durationMs: day < 7 ? 300000 : 360000,
      granularity: 'hourly-aggregate',
      fictional: true,
    },
  };
});
/** @param {string} date @param {string} zone */
function clockDay(date, zone) {
  const clock = scheduleCalendar(zone);
  return {
    date,
    start: clock.instant(date, 0, 0),
    end: clock.instant(new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10), 0, 0),
  };
}

/** @param {import('../core/data.js').DataRecord[]} values @param {string} day @param {'json'|'jsonl'} [format] @param {boolean} [partial] */
async function upload(values, day, format = 'jsonl', partial = false) {
  const manifest = {
    schema: profile.export.schema,
    profileId: profile.id,
    recordCount: values.length,
    status: partial ? 'partial' : 'complete',
    interval: { start: '2026-10-01T00:00:00Z', end: '2026-10-15T00:00:00Z' },
  };
  const file = cloud.begin(subject, device, profile.id, { day, format, profile, manifest });
  const bytes = Buffer.from(
    format === 'json'
      ? JSON.stringify({ ...manifest, records: values })
      : values.map((record) => JSON.stringify(record)).join('\n') + '\n',
  );
  await cloud.commit(subject, device, profile.id, file.id, bytes);
  return file.id;
}
const service = createCloudService({ cloud, billing, history, refreshEntitlement: async () => {} });
/** @param {string} owner @param {boolean} [restricted] */
async function connect(owner, restricted = true) {
  const server = new McpServer({ name: 'weekly-review-fixture', version: '1' });
  if (restricted) restrictChatgptTools(server);
  service.registerCloudTools(server, owner, 'weekly-review-fixture');
  const client = new Client({ name: 'weekly-review-fixture', version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}
/** @type {Awaited<ReturnType<typeof connect>>[]} */
const connections = [];
try {
  const mixed = [
    ...records,
    {
      domain: /** @type {const} */ ('health'),
      type: 'sleep',
      source: 'private-health',
      start: '2026-10-01T01:00:00Z',
      end: '2026-10-01T02:00:00Z',
      native: { secret: 'must-not-reach-review' },
    },
  ];
  const id = await upload(mixed, '2026-10-14');
  const duplicateId = await upload(records, '2026-10-13', 'json');
  const owner = await connect(subject);
  const other = await connect('other-fictional-owner');
  connections.push(owner, other);
  const tools = await owner.client.listTools();
  const metadata = reviewToolMetadata(tools.tools).find(
    (tool) => tool.name === 'review_weekly_screen_time',
  );
  assert.equal(metadata?.readOnlyHint, false);
  assert.equal(metadata?.idempotentHint, false);
  assert.ok(!tools.tools.some((tool) => tool.name === 'delete_cloud_export'));
  const args = { exportIds: [id, duplicateId], weekStart: '2026-10-08', timezone: 'UTC' };
  const result = await owner.client.callTool({
    name: 'review_weekly_screen_time',
    arguments: args,
  });
  assert.ok(!result.isError, JSON.stringify(result));
  const review = /** @type {ReturnType<typeof screenTimeReview>} */ (result.structuredContent);
  assert.equal(review.status, 'ready');
  const labelRecord = records[0];
  assert.ok(labelRecord);
  const labelDays = Array.from({ length: 14 }, (_, i) =>
    clockDay(`2026-10-${String(i + 1).padStart(2, '0')}`, 'UTC'),
  );
  const namedReview = screenTimeReview(
    labelDays,
    [
      {
        exportId: id,
        record: {
          ...labelRecord,
          native: {
            durationMs: 300000,
            granularity: 'hourly-aggregate',
            identifier: 'com.openai.chat',
            displayName: 'com.openai.chat',
          },
        },
      },
    ],
    [],
    'UTC',
    undefined,
    screenTimeHourSlots(labelDays, 'UTC'),
  );
  assert.equal(namedReview.series[0]?.topApps[0]?.name, 'ChatGPT');
  assert.equal(namedReview.series[0]?.appDrilldowns[0]?.identifier, 'com.openai.chat');
  assert.equal(namedReview.series[0]?.heatmap.cells[0]?.topApps[0]?.name, 'ChatGPT');
  assert.equal(review.series.length, 1);
  assert.equal(review.counts.duplicates, 840);
  assert.equal(review.series[0]?.current.observedDurationMs, 7 * 60 * 360000);
  assert.equal(review.series[0]?.previous.observedDurationMs, 7 * 60 * 300000);
  assert.equal(review.series[0]?.changePercent, 20);
  assert.equal(review.series[0]?.current.observedDays, 7);
  assert.equal(review.fictional, true);
  const series = review.series[0];
  assert.ok(series);
  assert.equal(series.dayBreakdowns.length, 14);
  for (const day of series.dayBreakdowns) {
    assert.equal(
      day.topApps.reduce((sum, app) => sum + app.durationMs, 0) + Number(day.otherDurationMs),
      day.durationMs,
    );
    assert.ok(day.topApps.length <= 10);
  }
  assert.equal(series.appDrilldowns.length, 3);
  assert.equal(series.heatmap.cells.length, 140);
  assert.equal(
    series.heatmap.cells.find((cell) => cell.date === '2026-10-08' && cell.hour === 0)?.durationMs,
    2160000,
  );
  assert.equal(
    series.heatmap.cells.find((cell) => cell.date === '2026-10-08' && cell.hour === 0)?.records,
    6,
  );
  assert.equal(
    series.heatmap.cells.find((cell) => cell.date === '2026-10-08' && cell.hour === 0)?.topApps[0]
      ?.durationMs,
    720000,
  );
  for (const day of series.heatmap.days) {
    assert.equal(
      (day.attributedDurationMs ?? 0) + (day.unallocatedDurationMs ?? 0),
      series.daily.find((item) => item.date === day.date)?.durationMs,
    );
    assert.equal(day.unallocatedRecords, 0);
  }

  assert.equal(series.appDrilldowns[0]?.daily[7]?.durationMs, 20 * 360000);
  assert.equal(series.appDrilldowns[0]?.daily[7]?.records, 20);

  assert.equal(JSON.stringify(review).includes('must-not-reach-review'), false);
  assert.equal(
    billing.snapshot(subject).used,
    34,
    'Seventeen authorized pages per file use existing billing',
  );
  const events = history.list(subject, device).events;
  assert.equal(events.length, 34);
  assert.ok(events.every((event) => event.status === 'complete' && event.actor === 'agent'));
  assert.equal(
    events.reduce((total, event) => total + (event.recordCount ?? 0), 0),
    1680,
    'Only screen-time records were paginated',
  );
  assert.equal(
    (await other.client.callTool({ name: 'review_weekly_screen_time', arguments: args })).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_weekly_screen_time',
        arguments: { ...args, timezone: 'Not/AZone' },
      })
    ).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_weekly_screen_time',
        arguments: { ...args, weekStart: '2099-01-01' },
      })
    ).isError,
    true,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_weekly_screen_time',
        arguments: { ...args, exportIds: [id, id] },
      })
    ).isError,
    true,
  );
  const experimentArgs = {
    requestId: randomUUID(),
    exportIds: [id],
    baselineWeekStart: '2026-10-01',
    weekStart: '2026-10-08',
    timezone: 'UTC',
    series: {
      source: series.source,
      type: series.type,
      granularity: series.granularity,
      device: series.device,
    },
    appIdentifier: 'fictional.app.0',
    targetMinutesPerDay: 120,
    plan: 'Use Reader instead of Browser before bed.',
  };
  const saved = experimentResult(
    await owner.client.callTool({ name: 'save_screen_time_experiment', arguments: experimentArgs }),
  ).experiments[0];
  assert.ok(saved);
  assert.equal(saved.weekStart, '2026-10-08');
  assert.equal(saved.reviewAfter, '2026-10-15T00:00:00.000Z');
  assert.equal(saved.retrospective, true);
  assert.equal(saved.baseline.observedDays, 7);
  assert.equal(saved.baseline.observedDurationMs, 7 * 20 * 300000);
  assert.equal(saved.targetMinutesPerDay, 120);
  const insightFixtures = await verifyScreenTimeInsights({
    client: owner.client,
    other: other.client,
    cloud,
    subject,
    device,
    approved,
    args,
    series,
    experiment: saved,
    monthExport: () =>
      upload(
        records.map((record) =>
          Object.assign({}, record, {
            start: new Date(Date.parse(record.start ?? '') - 30 * 86400000).toISOString(),
            end: new Date(Date.parse(record.end ?? '') - 30 * 86400000).toISOString(),
          }),
        ),
        '2026-09-30',
      ),
  });
  const diskDirectory = mkdtempSync(join(tmpdir(), 'myself-experiment-'));
  const diskKey = randomBytes(32);
  const diskPath = join(diskDirectory, 'cloud.sqlite');
  const persisted = cloud.experiments.get(subject, saved.id);
  assert.ok(persisted);
  const diskCloud = new CloudStore(diskPath, diskKey);
  diskCloud.experiments.save(subject, persisted);
  diskCloud.db.close();
  const restartedCloud = new CloudStore(diskPath, diskKey);
  assert.deepEqual(
    restartedCloud.experiments.get(subject, saved.id),
    persisted,
    'Encrypted goals survive a database restart',
  );
  restartedCloud.db.close();
  rmSync(diskDirectory, { recursive: true });
  const zero = {
    ...saved.baseline,
    usable: true,
    daily: saved.baseline.daily.map((day) => ({
      date: day.date,
      records: day.records,
      durationMs: 0,
    })),
    observedDurationMs: 0,
  };
  assert.equal(experimentOutcome(zero, zero, 0).outcome, 'within_goal');
  assert.equal(
    experimentOutcome(
      zero,
      {
        ...zero,
        usable: false,
        daily: zero.daily.map((day, index) =>
          index ? day : { date: day.date, records: day.records, durationMs: null },
        ),
      },
      0,
    ).outcome,
    'inconclusive',
  );
  const preInvalid = billing.snapshot(subject).used;
  assert.equal(
    (
      await owner.client.callTool({
        name: 'save_screen_time_experiment',
        arguments: { ...experimentArgs, requestId: randomUUID(), weekStart: '2026-10-07' },
      })
    ).isError,
    true,
  );
  assert.equal(
    billing.snapshot(subject).used,
    preInvalid,
    'Invalid date ordering is rejected before reads',
  );

  const afterSave = billing.snapshot(subject).used;
  experimentResult(
    await owner.client.callTool({ name: 'save_screen_time_experiment', arguments: experimentArgs }),
  );
  assert.equal(
    billing.snapshot(subject).used,
    afterSave,
    'Same saved goal retry does not reread exports',
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'save_screen_time_experiment',
        arguments: { ...experimentArgs, targetMinutesPerDay: 119 },
      })
    ).isError,
    true,
  );
  assert.equal(
    experimentResult(
      await other.client.callTool({ name: 'list_screen_time_experiments', arguments: {} }),
    ).experiments.length,
    0,
  );
  assert.equal(
    (
      await other.client.callTool({
        name: 'review_screen_time_experiment',
        arguments: { experimentId: saved.id, exportIds: [id] },
      })
    ).isError,
    true,
  );
  assert.equal(
    (
      await other.client.callTool({
        name: 'cancel_screen_time_experiment',
        arguments: { experimentId: saved.id },
      })
    ).isError,
    true,
  );
  const evaluated = experimentResult(
    await owner.client.callTool({
      name: 'review_screen_time_experiment',
      arguments: { experimentId: saved.id, exportIds: [id] },
    }),
  ).experiments[0];
  assert.equal(evaluated?.latestReview?.outcome, 'within_goal');
  assert.equal(evaluated?.latestReview?.changeMs, 7 * 20 * 60000);
  assert.equal(evaluated?.latestReview?.observed.observedDays, 7);
  const missArgs = { ...experimentArgs, requestId: randomUUID(), targetMinutesPerDay: 119 };
  const missed = experimentResult(
    await owner.client.callTool({ name: 'save_screen_time_experiment', arguments: missArgs }),
  ).experiments[0];
  assert.ok(missed);
  const above = experimentResult(
    await owner.client.callTool({
      name: 'review_screen_time_experiment',
      arguments: { experimentId: missed.id, exportIds: [id] },
    }),
  ).experiments[0];
  assert.equal(above?.latestReview?.outcome, 'above_goal');
  assert.equal(above?.latestReview?.daysAboveGoal.length, 7);

  const upcoming = experimentResult(
    await owner.client.callTool({
      name: 'save_screen_time_experiment',
      arguments: { ...experimentArgs, requestId: randomUUID(), weekStart: '2099-01-01' },
    }),
  ).experiments[0];
  assert.ok(upcoming);
  assert.equal(upcoming.phase, 'upcoming');
  assert.equal(upcoming.retrospective, false);
  const beforePremature = billing.snapshot(subject).used;
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_screen_time_experiment',
        arguments: { experimentId: upcoming.id, exportIds: [id] },
      })
    ).isError,
    true,
  );
  assert.equal(
    billing.snapshot(subject).used,
    beforePremature,
    'An unfinished experiment cannot consume review reads',
  );
  experimentResult(
    await owner.client.callTool({
      name: 'cancel_screen_time_experiment',
      arguments: { experimentId: upcoming.id },
    }),
  );
  const resumed = await connect(subject);
  connections.push(resumed);
  assert.equal(
    experimentResult(
      await resumed.client.callTool({ name: 'list_screen_time_experiments', arguments: {} }),
    ).experiments.length,
    3,
    'Goals survive a new MCP connection',
  );
  const encrypted = cloud.db
    .prepare('SELECT value FROM screen_time_experiments WHERE subject=? AND id=?')
    .get(subject, saved.id)?.value;
  assert.ok(encrypted instanceof Uint8Array);
  assert.equal(
    Buffer.from(encrypted).includes(Buffer.from(experimentArgs.plan)),
    false,
    'Plans and observations are encrypted at rest',
  );
  cloud.syncAgentPermissions(subject, device, [
    { ...approved, agentPermissions: { ...approved.agentPermissions, time: false } },
  ]);
  assert.equal(
    experimentResult(
      await owner.client.callTool({ name: 'list_screen_time_experiments', arguments: {} }),
    ).experiments.length,
    0,
  );
  assert.equal(
    (
      await owner.client.callTool({
        name: 'save_screen_time_experiment',
        arguments: experimentArgs,
      })
    ).isError,
    true,
    'Saved retries do not bypass revoked grants',
  );
  const cancellation = experimentResult(
    await owner.client.callTool({
      name: 'cancel_screen_time_experiment',
      arguments: { experimentId: missed.id },
    }),
  );
  assert.equal(cancellation.cancelledId, missed.id);
  assert.deepEqual(
    cancellation.experiments,
    [],
    'Cancellation after revocation does not disclose saved data',
  );
  cloud.syncAgentPermissions(subject, device, [approved]);
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_screen_time_experiment',
        arguments: { experimentId: missed.id, exportIds: [id] },
      })
    ).isError,
    true,
  );

  // Revocation after the first asynchronous storage read must prevent any review result.
  const readBytes = cloud.bytes.bind(cloud);
  let revoke = true;
  cloud.bytes = async (row) => {
    const bytes = await readBytes(row);
    if (revoke) {
      revoke = false;
      cloud.syncAgentPermissions(subject, device, [
        { ...approved, agentPermissions: { ...approved.agentPermissions, time: false } },
      ]);
    }
    return bytes;
  };
  const beforeFailure = billing.snapshot(subject).used;
  const revoked = await owner.client.callTool({
    name: 'review_weekly_screen_time',
    arguments: args,
  });
  assert.equal(revoked.isError, true);
  assert.equal(revoked.structuredContent, undefined);
  assert.equal(
    billing.snapshot(subject).used,
    beforeFailure,
    'Denied reads release the reservation',
  );
  cloud.bytes = readBytes;
  cloud.syncAgentPermissions(subject, device, [approved]);
  const gapId = await upload(
    records.filter((record) => !record.start?.startsWith('2026-10-10')),
    '2026-10-12',
  );
  const gaps = await owner.client.callTool({
    name: 'review_weekly_screen_time',
    arguments: { ...args, exportIds: [gapId] },
  });
  const gapReview = /** @type {ReturnType<typeof screenTimeReview>} */ (gaps.structuredContent);
  assert.equal(gapReview.series[0]?.changeMs, null);
  assert.deepEqual(gapReview.series[0]?.current.missingDays, ['2026-10-10']);
  assert.equal(gapReview.series[0]?.daily[9]?.durationMs, null);
  assert.equal(gapReview.series[0]?.dayBreakdowns[9]?.durationMs, null);
  assert.equal(gapReview.series[0]?.appDrilldowns[0]?.daily[9]?.durationMs, null);
  const insufficient = experimentResult(
    await owner.client.callTool({
      name: 'review_screen_time_experiment',
      arguments: { experimentId: saved.id, exportIds: [gapId] },
    }),
  ).experiments[0];
  assert.equal(insufficient?.latestReview?.outcome, 'inconclusive');
  assert.equal(insufficient?.latestReview?.changeMs, null);
  assert.deepEqual(insufficient?.latestReview?.observed.missingDays, ['2026-10-10']);
  const originalBytes = cloud.bytes.bind(cloud);
  let cancelDuringRead = true;
  cloud.bytes = async (row) => {
    const bytes = await originalBytes(row);
    if (cancelDuringRead) {
      cancelDuringRead = false;
      const current = cloud.experiments.get(subject, saved.id);
      assert.ok(current);
      cloud.experiments.save(subject, { ...current, state: 'cancelled' });
    }
    return bytes;
  };
  assert.equal(
    (
      await owner.client.callTool({
        name: 'review_screen_time_experiment',
        arguments: { experimentId: saved.id, exportIds: [id] },
      })
    ).isError,
    true,
  );
  assert.equal(
    cloud.experiments.get(subject, saved.id)?.latestReview?.outcome,
    'inconclusive',
    'Cancellation during awaited read cannot save a new result',
  );
  cloud.bytes = originalBytes;

  const partialId = await upload(records, '2026-10-11', 'jsonl', true);
  const partial = await owner.client.callTool({
    name: 'review_weekly_screen_time',
    arguments: { ...args, exportIds: [partialId] },
  });
  assert.equal(
    /** @type {ReturnType<typeof screenTimeReview>} */ (partial.structuredContent).series[0]
      ?.changeMs,
    null,
  );

  const days = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    start: new Date(Date.parse('2026-10-01') + i * 86400000).toISOString(),
    end: new Date(Date.parse('2026-10-01') + (i + 1) * 86400000).toISOString(),
  }));

  const hourSlots = screenTimeHourSlots(days, 'UTC');
  const dailyAggregate = screenTimeReview(
    days,
    [
      {
        exportId: id,
        record: {
          domain: 'time',
          source: 'daily-source',
          type: 'applications',
          start: '2026-10-08T00:00:00Z',
          end: '2026-10-09T00:00:00Z',
          native: { identifier: 'app', durationMs: 3600000, granularity: 'daily-aggregate' },
        },
      },
    ],
    [],
    'UTC',
    undefined,
    hourSlots,
  );
  assert.equal(dailyAggregate.series[0]?.heatmap.status, 'unavailable');
  assert.equal(dailyAggregate.series[0]?.heatmap.cells.length, 0);
  assert.equal(dailyAggregate.series[0]?.heatmap.days[7]?.unallocatedDurationMs, 3600000);
  const crossingHour = screenTimeReview(
    days,
    [
      {
        exportId: id,
        record: {
          domain: 'time',
          source: 'hourly-source',
          type: 'applications',
          start: '2026-10-08T00:50:00Z',
          end: '2026-10-08T01:10:00Z',
          native: { identifier: 'app', durationMs: 600000, granularity: 'hourly-aggregate' },
        },
      },
    ],
    [],
    'UTC',
    undefined,
    hourSlots,
  );
  assert.equal(crossingHour.series[0]?.heatmap.cells.length, 0);
  assert.equal(crossingHour.series[0]?.heatmap.days[7]?.unallocatedRecords, 1);
  const zeroHour = attentionHeatmap(
    [{ date: '2026-10-08', durationMs: 0, records: 1 }],
    [
      {
        day: 0,
        start: Date.parse('2026-10-08T00:00:00Z'),
        end: Date.parse('2026-10-08T00:01:00Z'),
        durationMs: 0,
        identifier: 'app',
        name: 'App',
      },
    ],
    'unspecified',
    hourSlots,
  );
  assert.equal(zeroHour.cells[0]?.durationMs, 0);
  assert.equal(zeroHour.cells[0]?.records, 1);
  assert.equal(zeroHour.days[0]?.attributedDurationMs, 0);
  const springSlots = screenTimeHourSlots(
    [clockDay('2026-03-08', 'America/New_York')],
    'America/New_York',
  );
  assert.equal(springSlots.length, 23);
  assert.ok(!springSlots.some((slot) => slot.hour === 2));
  const fallSlots = screenTimeHourSlots(
    [clockDay('2026-11-01', 'America/New_York')],
    'America/New_York',
  );
  const repeated = fallSlots.find((slot) => slot.hour === 1);
  assert.ok(repeated);
  assert.equal(repeated.end - repeated.start, 7200000);
  const fall = attentionHeatmap(
    [{ date: repeated.date, durationMs: 7200000, records: 2 }],
    [0, 1].map((index) => ({
      day: 0,
      start: repeated.start + index * 3600000,
      end: repeated.start + (index + 1) * 3600000,
      durationMs: 3600000,
      identifier: 'app',
      name: 'App',
    })),
    'foreground-session',
    fallSlots,
  );
  assert.equal(fall.cells[0]?.durationMs, 7200000);
  assert.equal(fall.clockChanges[0]?.durationMs, 7200000);
  const halfHour = screenTimeHourSlots(
    [clockDay('2026-10-04', 'Australia/Lord_Howe')],
    'Australia/Lord_Howe',
  );
  const shortHour = halfHour.find((slot) => slot.hour === 2);
  assert.ok(shortHour);
  assert.equal(shortHour.end - shortHour.start, 1800000);
  const nepal = screenTimeHourSlots([clockDay('2026-10-08', 'Asia/Kathmandu')], 'Asia/Kathmandu');
  assert.equal(new Date(nepal[0]?.start ?? 0).toISOString(), '2026-10-07T18:15:00.000Z');
  const first = records[0];
  assert.ok(first);
  const invalid = { ...first, native: { identifier: 'bad', durationMs: -1 } };
  const crossing = { ...first, start: '2026-10-01T23:55:00Z', end: '2026-10-02T00:05:00Z' };
  const conflicting = {
    ...first,
    native: { identifier: 'fictional.app.0', durationMs: 120000, granularity: 'hourly-aggregate' },
  };
  const separate = {
    ...first,
    type: 'sessions',
    native: {
      identifier: 'fictional.app.0',
      durationMs: 300000,
      granularity: 'foreground-session',
    },
  };
  const edge = screenTimeReview(
    days,
    [first, invalid, crossing, conflicting, separate].map((record) => ({ exportId: id, record })),
    [],
    'UTC',
    undefined,
    hourSlots,
  );
  assert.equal(edge.counts.invalid, 1);
  assert.equal(edge.counts.crossingDay, 1);
  assert.equal(edge.counts.overlaps, 2);
  assert.equal(edge.series.length, 2);
  assert.equal(edge.series.find((item) => item.type === 'applications')?.heatmap.cells.length, 0);
  assert.equal(
    edge.series.find((item) => item.type === 'applications')?.current.observedDurationMs,
    null,
  );
  assert.ok(
    edge.series.every((entry) =>
      entry.appDrilldowns.every((app) =>
        app.daily.every((day) => day.durationMs === null || entry.type === 'sessions'),
      ),
    ),
  );
  const manyApps = screenTimeReview(
    days,
    Array.from({ length: 12 }, (_, i) => ({
      exportId: id,
      record: { ...first, native: { identifier: `app-${i}`, durationMs: 1000 * (i + 1) } },
    })),
    [],
    'UTC',
  );
  const crowded = manyApps.series[0];
  assert.equal(crowded?.dayBreakdowns[0]?.topApps.length, 10);
  assert.equal(crowded?.dayBreakdowns[0]?.otherDurationMs, 3000);
  assert.equal(crowded?.appDrilldowns.length, 12);
  const calendar = scheduleCalendar('America/New_York');
  assert.equal(
    Date.parse(calendar.instant('2026-03-09', 0, 0)) -
      Date.parse(calendar.instant('2026-03-08', 0, 0)),
    23 * 3600000,
  );
  const dst = await owner.client.callTool({
    name: 'review_weekly_screen_time',
    arguments: { ...args, exportIds: [id], weekStart: '2026-03-08', timezone: 'America/New_York' },
  });
  assert.equal(dst.isError, undefined);
  assert.equal(
    /** @type {ReturnType<typeof screenTimeReview>} */ (dst.structuredContent).status,
    'no_data',
  );

  const resources = await owner.client.listResources();
  const uri = resources.resources.find(
    (resource) => resource.name === 'weekly-screen-time-review',
  )?.uri;
  assert.ok(uri);
  const resource = await owner.client.readResource({ uri });
  const html = resource.contents[0];
  assert.ok(html && 'text' in html);
  const browser = await chromium.launch({ headless: true });
  mkdirSync('.local/weekly-review', { recursive: true });
  try {
    const page = await browser.newPage();
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://weekly-review.test/', async (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Fictional MCP Apps host</title><iframe title="Weekly review" style="border:0;width:100%;height:2100px"></iframe>',
      }),
    );
    await page.goto('https://weekly-review.test/');
    await page.exposeFunction(
      'runExperimentTool',
      async (/** @type {string} */ name, /** @type {Record<string,unknown>} */ argumentsValue) =>
        owner.client.callTool({ name, arguments: argumentsValue }),
    );
    await page.evaluate(`window.chartMessages=[];window.addEventListener('message', async (event) => {
      const message=event.data;
      if(message?.method==='ui/initialize') event.source.postMessage({jsonrpc:'2.0',id:message.id,result:{}},'*');
      if(message?.method==='ui/message'){window.chartMessages.push(message.params);event.source.postMessage({jsonrpc:'2.0',id:message.id,result:{}},'*');}
      if(message?.method==='tools/call') {
        try {const result=await window.runExperimentTool(message.params.name,message.params.arguments);event.source.postMessage({jsonrpc:'2.0',id:message.id,result},'*');}
        catch(error){event.source.postMessage({jsonrpc:'2.0',id:message.id,error:{message:String(error)}},'*');}
      }
    });`);
    await page.evaluate(`document.querySelector('iframe').srcdoc = ${JSON.stringify(html.text)}`);
    const frame = page.frameLocator('iframe');
    await frame.getByText('Waiting for your weekly review…').waitFor();
    // Parent-origin messages exercise the same standard notification consumed in ChatGPT.
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0', method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(review)}}}, '*')`,
    );
    await frame.getByRole('heading', { name: 'Where your time went' }).waitFor();
    await frame.locator('.daily-values summary').click();
    assert.equal(await frame.getByRole('row').count(), 8);
    assert.equal(await frame.locator('.apps li').count(), 3);
    /** @param {number} width */
    async function verifyWidth(width) {
      await page.setViewportSize({ width, height: 1200 });
      assert.equal(
        await page.evaluate(
          "window.frames[0].document.documentElement.scrollWidth > document.querySelector('iframe').clientWidth",
        ),
        false,
      );
      await page.screenshot({ path: `.local/weekly-review/review-${width}.png`, fullPage: true });
    }
    await verifyWidth(760);
    await verifyWidth(375);
    const browsingBefore = billing.snapshot(subject).used;
    await frame.getByRole('button', { name: 'Help me choose a change', exact: true }).click();
    await frame.getByRole('heading', { name: 'Choose one small change', exact: true }).waitFor();
    assert.equal(
      await frame.getByRole('button', { name: 'Customize this experiment', exact: true }).count(),
      3,
    );
    await frame
      .getByRole('button', { name: 'Customize this experiment', exact: true })
      .first()
      .click();
    await frame.getByRole('heading', { name: 'Browser · daily usage', exact: true }).waitFor();
    assert.equal(await frame.getByLabel('Daily limit in minutes').inputValue(), '102');
    await frame.getByRole('button', { name: 'Ask ChatGPT', exact: true }).click();
    await frame
      .getByText('Question and selected context sent to ChatGPT.', { exact: true })
      .waitFor();
    assert.match(await page.evaluate('JSON.stringify(window.chartMessages)'), /fictional.app.0/);
    await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();
    await frame.getByRole('button', { name: 'Export readiness', exact: true }).click();
    await frame
      .getByRole('heading', { name: '14/14 days with observations', exact: true })
      .waitFor();
    await frame.getByRole('button', { name: 'Back to review', exact: true }).click();
    assert.equal(
      billing.snapshot(subject).used,
      browsingBefore,
      'Coaching, context and loaded readiness do not reread exports',
    );
    await frame.getByRole('button', { name: 'My reflections', exact: true }).click();
    await frame
      .getByLabel('What affected your attention?')
      .fill('Fictional reflection saved from the ChatGPT card.');
    await frame.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await frame
      .getByText('Fictional reflection saved from the ChatGPT card.', { exact: true })
      .waitFor();
    await frame
      .getByLabel('What affected your attention?')
      .fill('Fictional reflection edited from the card.');
    await frame.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await frame.getByText('Fictional reflection edited from the card.', { exact: true }).waitFor();
    await frame.getByRole('button', { name: 'Refresh reflections', exact: true }).click();
    await frame.getByText('Fictional reflection edited from the card.', { exact: true }).waitFor();
    await frame.getByRole('button', { name: 'Back to review', exact: true }).click();
    await frame.getByRole('button', { name: 'Monthly story', exact: true }).click();
    await frame.getByLabel('Calendar month').fill('2026-09');
    await frame
      .getByRole('button', { name: 'Read shared exports for this month', exact: true })
      .click();
    await frame.getByText('No usable observations in this month.', { exact: true }).waitFor();
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(insightFixtures.month)}}},'*')`,
    );
    await frame.getByRole('heading', { name: 'Weekly blocks', exact: true }).waitFor();
    await frame.getByText('77h 0m', { exact: true }).waitFor();
    await verifyWidth(375);
    await frame.getByRole('button', { name: 'Back to review', exact: true }).click();
    const annotatedReview = await owner.client.callTool({
      name: 'review_weekly_screen_time',
      arguments: args,
    });
    assert.ok(!annotatedReview.isError);
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(annotatedReview.structuredContent)}}},'*')`,
    );
    const heatmapUsed = billing.snapshot(subject).used;
    await frame.getByRole('button', { name: 'Attention heatmap', exact: true }).click();
    await frame.getByRole('heading', { name: 'Attention by hour', exact: true }).waitFor();
    assert.equal(await frame.locator('.heatmap-table .heat-cell').count(), 336);
    await frame.getByRole('heading', { name: 'Experiments in this view', exact: true }).waitFor();
    assert.ok((await frame.locator('.heatmap-table th[title]').count()) > 0);
    await verifyWidth(760);
    await verifyWidth(375);
    await frame
      .getByRole('button', {
        name: 'Explore 2026-10-08 00:00: 36m observed · 6 records',
        exact: true,
      })
      .click();
    await frame.getByRole('heading', { name: '2026-10-08 · 00:00', exact: true }).waitFor();
    assert.equal(await frame.locator('.apps li').count(), 3);
    await frame.getByRole('button', { name: 'Back to heatmap', exact: true }).click();
    await frame.getByLabel('Heatmap dates', { exact: true }).selectOption('0');
    await frame
      .getByRole('button', {
        name: 'Explore 2026-10-01 00:00: 30m observed · 6 records',
        exact: true,
      })
      .click();
    await frame.getByRole('heading', { name: '2026-10-01 · 00:00', exact: true }).waitFor();
    await frame.getByRole('button', { name: 'Back to heatmap', exact: true }).click();
    await frame
      .getByRole('button', {
        name: 'Explore 2026-10-01 23:00: No hourly records; usage unknown',
        exact: true,
      })
      .click();
    await frame
      .getByText('No hourly records in this cell. Usage is unknown, not zero.', { exact: true })
      .waitFor();
    await frame.getByRole('button', { name: 'Back to heatmap', exact: true }).click();
    assert.equal(
      billing.snapshot(subject).used,
      heatmapUsed,
      'Heatmap interactions do not reread or charge',
    );
    await frame.getByRole('button', { name: 'Period totals', exact: true }).click();

    await frame.locator('.daily-values summary').click();
    await frame.getByRole('button', { name: 'Explore 2026-10-08: 6h 0m', exact: true }).click();
    await frame.getByRole('heading', { name: 'Apps on 2026-10-08' }).waitFor();
    assert.equal(await frame.locator('.apps li').count(), 3);
    await frame.getByRole('button', { name: 'Browser', exact: true }).click();
    await frame.getByRole('heading', { name: 'Browser · daily usage' }).waitFor();
    assert.equal(await frame.locator('.apps li').count(), 14);
    await verifyWidth(375);
    await frame.getByRole('button', { name: 'Back to 2026-10-08', exact: true }).click();
    await frame.getByRole('heading', { name: 'Apps on 2026-10-08' }).waitFor();
    await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();
    await frame.getByRole('button', { name: 'Browser', exact: true }).click();
    await frame.getByRole('button', { name: '2026-10-01', exact: true }).click();
    await frame.getByRole('heading', { name: 'Apps on 2026-10-01' }).waitFor();
    await frame.getByRole('button', { name: 'Back to weekly review', exact: true }).click();

    await frame.getByText('Sources & limits', { exact: true }).click();
    await frame
      .getByText('These are fictional fixture records, not personal phone data.', { exact: true })
      .waitFor();
    // Host-delivered data is inserted as text, including attacker-controlled app names.
    const attack = structuredClone(gapReview);
    const app = attack.series[0]?.topApps[0];
    assert.ok(app);
    app.name = '<img src=x onerror=alert(1)>';
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0', method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(attack)}}}, '*')`,
    );
    await frame.getByText('<img src=x onerror=alert(1)>', { exact: true }).waitFor();
    assert.equal(await frame.locator('img').count(), 0);
    await frame.getByText('Weekly comparison unavailable', { exact: true }).waitFor();
    await frame.locator('.daily-values summary').click();
    await frame
      .getByRole('button', { name: 'Explore 2026-10-10: No records', exact: true })
      .click();
    await frame
      .getByText('No records for this day. Usage is unknown, not zero.', { exact: true })
      .waitFor();

    const baselineResponse = await owner.client.callTool({
      name: 'review_weekly_screen_time',
      arguments: { ...args, exportIds: [id], weekStart: '2026-10-01' },
    });
    assert.ok(!baselineResponse.isError);
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:${JSON.stringify(baselineResponse)}},'*')`,
    );
    await frame
      .getByText('No comparison data for 2026-09-24 – 2026-09-30.', { exact: false })
      .waitFor();
    await frame.locator('.daily-values summary').click();
    assert.equal(
      await frame.getByRole('columnheader', { name: 'Previous', exact: true }).count(),
      0,
    );
    assert.equal(
      await frame.getByRole('columnheader', { name: 'Review period', exact: true }).count(),
      1,
    );
    await verifyWidth(375);
    await frame.getByRole('button', { name: 'Browser', exact: true }).click();
    await frame.getByLabel('Experiment start date', { exact: true }).fill('2026-10-08');
    await frame.getByLabel('Daily limit in minutes', { exact: true }).fill('120');
    await frame
      .getByLabel('What will you try? (optional)', { exact: true })
      .fill('Fictional experiment from the card');
    await verifyWidth(375);
    await frame.getByRole('button', { name: 'Save experiment', exact: true }).click();
    await frame.getByRole('heading', { name: 'Personal experiments', exact: true }).waitFor();
    await frame.getByText('At or below 120 minutes each day', { exact: true }).waitFor();
    await frame
      .getByRole('button', { name: 'Read shared exports and review', exact: true })
      .click();
    await frame.getByRole('heading', { name: 'More data needed', exact: true }).waitFor();
    await verifyWidth(375);
    await frame.getByRole('button', { name: 'Cancel experiment', exact: true }).click();
    await frame
      .getByText('Your experiment is cancelled. Its history is retained.', { exact: true })
      .waitFor();
    await frame.getByRole('button', { name: 'Refresh experiments', exact: true }).click();
    await frame.getByText('Fictional experiment from the card', { exact: true }).waitFor();
    assert.equal(await frame.locator('.experiment-card').count(), 4);
    const compare = frame
      .getByRole('button', { name: 'Compare hourly patterns', exact: true })
      .filter({ visible: true });
    await compare.first().click();
    await frame.getByRole('heading', { name: 'Experiment hour patterns', exact: true }).waitFor();
    await frame.getByText(/hours have goal-app observations in both periods/).waitFor();
    await verifyWidth(375);
    const standaloneNotes = await owner.client.callTool({
      name: 'list_screen_time_reflections',
      arguments: { deviceId: device, profileId: approved.id },
    });
    await page.evaluate(`document.querySelector('iframe').srcdoc = ${JSON.stringify(html.text)}`);
    await frame.getByText('Waiting for your weekly review…').waitFor();
    await page.evaluate(
      `window.frames[0].postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(standaloneNotes.structuredContent)}}},'*')`,
    );
    await frame.getByRole('button', { name: 'Edit reflection', exact: true }).first().click();
    await frame
      .getByLabel('What affected your attention?')
      .fill('Fictional reflection edited without a loaded review.');
    await frame.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await frame
      .getByText('Fictional reflection edited without a loaded review.', { exact: true })
      .waitFor();
    await frame.getByRole('button', { name: 'Add another reflection', exact: true }).click();
    await frame
      .getByLabel('What affected your attention?')
      .fill('Fictional new note from the standalone reflection card.');
    await frame.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await frame
      .getByText('Fictional new note from the standalone reflection card.', { exact: true })
      .waitFor();
    await verifyWidth(375);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log(
    'Weekly review and personal experiments: goal persistence, retry, ownership, revoked grants, outcomes, UI save/review/cancel, MCP discovery, bounded billed reads, JSON/JSONL deduplication, ownership, revocation, gaps, partial files, source separation, DST and responsive renderer passed.',
  );
} finally {
  await Promise.all(
    connections.map(async ({ client, server }) => {
      await client.close();
      await server.close();
    }),
  );
  history.db.close();
  billing.db.close();
  cloud.db.close();
}
