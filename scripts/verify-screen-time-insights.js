import { experimentHourComparison } from '../core/screen-time-insights.js';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CloudStore } from '../server/cloud-store.js';
/** @param {Awaited<ReturnType<import('@modelcontextprotocol/client').Client['callTool']>>} response */
function insight(response) {
  assert.ok(!response.isError, JSON.stringify(response));
  return z
    .object({
      version: z.literal('myself.md.screen-time-insights.v1'),
      kind: z.string(),
      data: z.record(z.string(), z.unknown()),
    })
    .parse(response.structuredContent);
}
/** @param {{client:import('@modelcontextprotocol/client').Client,other:import('@modelcontextprotocol/client').Client,cloud:CloudStore,subject:string,device:string,approved:import('../core/profiles.js').ExportProfile & {agentPermissions:import('../core/profiles.js').AgentPermissions},args:{exportIds:string[],weekStart:string,timezone:string},series:import('../core/screen-time-insights.js').UsageSeries,experiment:import('../server/screen-time-experiment-store.js').ScreenTimeExperiment,monthExport:()=>Promise<string>}} input */
export async function verifyScreenTimeInsights({
  client,
  other,
  cloud,
  subject,
  device,
  approved,
  args,
  series,
  experiment,
  monthExport,
}) {
  const identity = {
    source: series.source,
    type: series.type,
    granularity: series.granularity,
    device: series.device,
  };
  const coach = insight(
    await client.callTool({ name: 'suggest_screen_time_experiments', arguments: args }),
  );
  const suggestions = z
    .object({
      series: z.array(
        z.object({
          suggestions: z.array(
            z.object({
              appIdentifier: z.string(),
              targetMinutesPerDay: z.number(),
              observedDays: z.number(),
            }),
          ),
        }),
      ),
    })
    .parse(coach.data).series[0]?.suggestions;
  assert.equal(suggestions?.length, 3);
  assert.equal(suggestions?.[0]?.targetMinutesPerDay, 102);
  assert.equal(suggestions?.[0]?.observedDays, 7);
  const selected = insight(
    await client.callTool({
      name: 'inspect_screen_time_chart',
      arguments: {
        ...args,
        series: identity,
        selection: { kind: 'hour', date: '2026-10-08', hour: 0 },
      },
    }),
  );
  assert.equal(
    z.object({ context: z.object({ changeMs: z.number() }) }).parse(selected.data).context.changeMs,
    360000,
  );
  const previousMissing = insight(
    await client.callTool({
      name: 'inspect_screen_time_chart',
      arguments: {
        ...args,
        series: identity,
        selection: { kind: 'hour', date: '2026-10-01', hour: 23 },
      },
    }),
  );
  assert.equal(
    z
      .object({ context: z.object({ changeMs: z.null(), selected: z.null(), previous: z.null() }) })
      .parse(previousMissing.data).context.selected,
    null,
  );
  const readiness = insight(
    await client.callTool({ name: 'check_screen_time_readiness', arguments: args }),
  );
  const coverage = z
    .object({
      series: z.array(
        z.object({
          readiness: z.object({
            observedDays: z.number(),
            expectedDays: z.number(),
            unallocatedRecords: z.number(),
          }),
        }),
      ),
    })
    .parse(readiness.data).series[0]?.readiness;
  assert.deepEqual(coverage, { observedDays: 14, expectedDays: 14, unallocatedRecords: 0 });
  const reflectionArgs = {
    reflectionId: randomUUID(),
    deviceId: device,
    profileId: approved.id,
    weekStart: experiment.weekStart,
    timezone: experiment.timezone,
    experimentId: experiment.id,
    text: 'Fictional: travel week. Felt more focused while reading.',
    expectedUpdatedAt: null,
  };
  const saved = insight(
    await client.callTool({ name: 'save_screen_time_reflection', arguments: reflectionArgs }),
  );
  assert.equal(saved.kind, 'reflections');
  const reflection = cloud.reflections.get(subject, reflectionArgs.reflectionId);
  assert.ok(reflection);
  assert.equal(reflection.text, reflectionArgs.text);
  const retry = insight(
    await client.callTool({ name: 'save_screen_time_reflection', arguments: reflectionArgs }),
  );
  assert.deepEqual(retry.data, saved.data);
  assert.equal(
    (
      await client.callTool({
        name: 'save_screen_time_reflection',
        arguments: { ...reflectionArgs, text: 'A changed note without the expected revision.' },
      })
    ).isError,
    true,
  );
  const edited = insight(
    await client.callTool({
      name: 'save_screen_time_reflection',
      arguments: {
        ...reflectionArgs,
        text: 'Fictional: edited reflection.',
        expectedUpdatedAt: reflection.updatedAt,
      },
    }),
  );
  assert.equal(
    z.object({ reflections: z.array(z.object({ text: z.string() })) }).parse(edited.data)
      .reflections[0]?.text,
    'Fictional: edited reflection.',
  );
  assert.equal(
    (await other.callTool({ name: 'save_screen_time_reflection', arguments: reflectionArgs }))
      .isError,
    true,
  );
  assert.equal(
    z
      .object({ reflections: z.array(z.unknown()) })
      .parse(
        insight(await other.callTool({ name: 'list_screen_time_reflections', arguments: {} })).data,
      ).reflections.length,
    0,
  );
  const encrypted = cloud.db
    .prepare('SELECT value FROM screen_time_reflections WHERE subject=? AND id=?')
    .get(subject, reflection.id)?.value;
  assert.ok(encrypted instanceof Uint8Array);
  assert.equal(Buffer.from(encrypted).includes(Buffer.from('edited reflection')), false);
  const directory = mkdtempSync(join(tmpdir(), 'myself-reflections-')),
    key = randomBytes(32),
    path = join(directory, 'cloud.sqlite');
  const disk = new CloudStore(path, key);
  disk.reflections.save(subject, reflection);
  disk.db.close();
  const restarted = new CloudStore(path, key);
  assert.deepEqual(restarted.reflections.get(subject, reflection.id), reflection);
  restarted.db.close();
  rmSync(directory, { recursive: true });
  cloud.syncAgentPermissions(subject, device, [
    { ...approved, selection: { ...approved.selection, time: [] } },
  ]);
  assert.equal(
    z
      .object({ reflections: z.array(z.unknown()) })
      .parse(
        insight(await client.callTool({ name: 'list_screen_time_reflections', arguments: {} }))
          .data,
      ).reflections.length,
    0,
  );
  assert.equal(
    (await client.callTool({ name: 'save_screen_time_reflection', arguments: reflectionArgs }))
      .isError,
    true,
  );
  cloud.syncAgentPermissions(subject, device, [approved]);
  const annotated = await client.callTool({ name: 'review_weekly_screen_time', arguments: args });
  assert.ok(!annotated.isError);
  const extras = z
    .object({
      insights: z.object({
        experiments: z.array(z.object({ id: z.string() })),
        reflections: z.array(z.object({ id: z.string() })),
      }),
    })
    .parse(annotated.structuredContent).insights;
  assert.ok(extras.experiments.some((item) => item.id === experiment.id));
  assert.ok(extras.reflections.some((item) => item.id === reflection.id));
  const unequal = experimentHourComparison(
    Object.assign({}, series, {
      heatmap: Object.assign({}, series.heatmap, {
        clockChanges: [{ date: '2026-10-01', hour: 0, durationMs: 7200000 }],
      }),
    }),
    series,
    '2026-10-01',
    '2026-10-08',
    experiment.appIdentifier,
  );
  assert.equal(unequal.cells[0]?.baselineElapsedMs, 7200000);
  assert.equal(
    unequal.cells[0]?.changeMs,
    null,
    'Different elapsed clock-hour lengths must not receive a change',
  );
  const hours = insight(
    await client.callTool({
      name: 'compare_screen_time_experiment_hours',
      arguments: {
        experimentId: experiment.id,
        baselineExportIds: args.exportIds,
        experimentExportIds: args.exportIds,
      },
    }),
  );
  const comparison = z
    .object({
      comparison: z.object({
        pairedHours: z.number(),
        cells: z.array(
          z.object({
            date: z.string(),
            hour: z.number(),
            baselineMs: z.number().nullable(),
            experimentMs: z.number().nullable(),
            changeMs: z.number().nullable(),
          }),
        ),
      }),
    })
    .parse(hours.data).comparison;
  assert.equal(comparison.pairedHours, 70);
  assert.equal(
    comparison.cells.find((cell) => cell.date === '2026-10-08' && cell.hour === 0)?.changeMs,
    120000,
  );
  assert.equal(comparison.cells.find((cell) => cell.hour === 23)?.changeMs, null);
  assert.equal(
    (
      await other.callTool({
        name: 'compare_screen_time_experiment_hours',
        arguments: {
          experimentId: experiment.id,
          baselineExportIds: args.exportIds,
          experimentExportIds: args.exportIds,
        },
      })
    ).isError,
    true,
  );
  assert.equal(
    (
      await client.callTool({
        name: 'review_monthly_attention',
        arguments: { exportIds: args.exportIds, month: '2099-01', timezone: 'UTC' },
      })
    ).isError,
    true,
  );
  const monthId = await monthExport();
  const month = insight(
    await client.callTool({
      name: 'review_monthly_attention',
      arguments: { exportIds: [monthId], month: '2026-09', timezone: 'UTC' },
    }),
  );
  const story = z
    .object({
      series: z.array(
        z.object({
          story: z.object({
            observedDays: z.number(),
            expectedDays: z.number(),
            observedDurationMs: z.number(),
            weeks: z.array(
              z.object({ observedDays: z.number(), durationMs: z.number().nullable() }),
            ),
            shifts: z.array(z.object({ changeMs: z.number().nullable() })),
          }),
        }),
      ),
    })
    .parse(month.data).series[0]?.story;
  assert.ok(story);
  assert.equal(story.observedDays, 14);
  assert.equal(story.expectedDays, 30);
  assert.equal(story.observedDurationMs, 77 * 3600000);
  assert.equal(story.weeks.length, 5);
  assert.equal(story.weeks[2]?.durationMs, null);
  assert.ok(story.shifts.every((shift) => shift.changeMs === null));
  console.log(
    'Attention insights MCP: three editable suggestions, chart context, readiness, encrypted reflection restart/retry/edit/ownership/revocation, annotations, paired hour comparisons, monthly coverage and future-period rejection passed.',
  );
  return { month, reflectionId: reflection.id };
}
