import assert from 'node:assert/strict';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parseProfile } from '../core/profiles.js';

/** Exercise the restricted production-runtime route with a distinct fictional owner.
 * @param {{origin:string,request:(path:string,bearer:string|null,method?:string,body?:unknown)=>Promise<{status:number,value:unknown}>,token:(subject:string,client:string,path?:string)=>Promise<string>}} fixture */
export async function verifyHealthReviewWorker({ origin, request, token }) {
  const phone = await token('weekly-review-owner', 'myselfmd-phone');
  const agent = await token('weekly-review-owner', 'health-review-agent', '/mcp/chatgpt');
  const intruder = await token('health-review-intruder', 'myselfmd-phone');
  const setup = new Client({ name: 'health-review-setup', version: '1' });
  let ticket;
  try {
    await setup.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
        requestInit: {
          headers: { Authorization: await token('weekly-review-owner', 'health-review-agent') },
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
        name: 'Fictional health-review phone',
      })
    ).value,
  ).id;
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Fictional health review',
      selection: {
        health: [
          'native:HKQuantityTypeIdentifierStepCount',
          'native:HKCategoryTypeIdentifierSleepAnalysis',
          'native:whoop.sleep',
        ],
        time: ['native:application'],
        location: [],
      },
    }),
    id: 'health-review-worker',
  };
  const catalog = {
    profileSync: { base: null },
    profiles: [
      {
        ...profile,
        agentAccess: true,
        agentPermissions: { health: true, time: false, location: false, logs: false },
      },
    ],
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: domain === 'health' || domain === 'time',
      types:
        domain === 'health'
          ? [
              'native:HKQuantityTypeIdentifierStepCount',
              'native:HKCategoryTypeIdentifierSleepAnalysis',
              'native:whoop.sleep',
            ]
          : domain === 'time'
            ? ['native:application']
            : [],
      availableTypes:
        domain === 'health'
          ? [
              'native:HKQuantityTypeIdentifierStepCount',
              'native:HKCategoryTypeIdentifierSleepAnalysis',
              'native:whoop.sleep',
            ]
          : domain === 'time'
            ? ['native:application']
            : [],
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
        id: 'health-review-upload',
        scope: { profileId: profile.id, days: ['2026-10-14'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  /** @type {import('../core/data.js').DataRecord[]} */
  const records = [
    {
      domain: 'health',
      type: 'HKQuantityTypeIdentifierStepCount',
      source: 'fictional-worker',
      start: '2026-10-14T01:00:00Z',
      end: '2026-10-14T02:00:00Z',
      native: { quantity: 4000, unit: 'count', fictional: true },
    },
    {
      domain: 'health',
      type: 'HKCategoryTypeIdentifierSleepAnalysis',
      source: 'fictional-worker',
      start: '2026-10-14T00:00:00Z',
      end: '2026-10-14T06:00:00Z',
      native: { value: 4, fictional: true },
    },
    {
      domain: 'health',
      type: 'whoop.sleep',
      source: 'whoop',
      start: '2026-10-13T22:00:00Z',
      end: '2026-10-14T06:00:00Z',
      native: {
        id: 'worker-whoop-sleep',
        fictional: true,
        score_state: 'SCORED',
        nap: false,
        score: {
          sleep_performance_percentage: 88,
          stage_summary: {
            total_light_sleep_time_milli: 4 * 3600000,
            total_slow_wave_sleep_time_milli: 3600000,
            total_rem_sleep_time_milli: 2 * 3600000,
            total_awake_time_milli: 3600000,
            total_no_data_time_milli: 0,
            total_in_bed_time_milli: 8 * 3600000,
          },
        },
      },
    },
  ];
  records.push({
    domain: 'time',
    type: 'application',
    source: 'fictional-usage',
    start: '2026-10-13T21:00:00Z',
    end: '2026-10-13T22:00:00Z',
    native: {
      identifier: 'fixture.reader',
      displayName: 'Fictional Reader',
      durationMs: 3600000,
      fictional: true,
    },
  });
  const id = z.object({ id: z.string() }).parse(
    (
      await request('/api/cloud/uploads', `Upload ${upload}`, 'POST', {
        profile,
        day: '2026-10-14',
        format: 'jsonl',
        manifest: {
          profileId: profile.id,
          recordCount: records.length,
          billingOperationId: 'health-review-upload',
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
  const client = new Client({ name: 'health-review-worker', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp/chatgpt'), {
        requestInit: { headers: { Authorization: agent } },
      }),
    );
    const tool = (await client.listTools()).tools.find(
      (entry) => entry.name === 'review_activity_sleep',
    );
    assert.ok(tool?.outputSchema);
    const result = await client.callTool({
      name: 'review_activity_sleep',
      arguments: { exportIds: [id], start: '2026-10-08', end: '2026-10-14', timezone: 'UTC' },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    const review = z
      .object({
        series: z.array(
          z.object({
            kind: z.string(),
            source: z.string(),
            daily: z.array(z.object({ date: z.string(), value: z.number().nullable() })),
          }),
        ),
      })
      .parse(result.structuredContent);
    assert.equal(review.series.find((s) => s.kind === 'activity')?.daily.at(-1)?.value, 4000);
    assert.equal(review.series.find((s) => s.kind === 'sleep')?.daily.at(-1)?.value, 6);
    assert.equal(review.series[0]?.daily[0]?.value, null);
    assert.equal(review.series.find((s) => s.source === 'whoop')?.daily.at(-1)?.value, 7);
    assert.equal(
      (await client.readResource({ uri: 'ui://myself-md/activity-sleep-review-v3.html' })).contents
        .length,
      1,
    );
    // Unrelated large HealthKit records must not prevent a WHOOP-only comparison.
    const largeRecords = [
      ...records.filter((record) => record.source === 'whoop'),
      {
        domain: 'health',
        type: 'HKQuantityTypeIdentifierStepCount',
        source: 'fictional-health',
        start: '2026-10-14T10:00:00Z',
        end: '2026-10-14T10:01:00Z',
        native: { fictional: true, payload: 'x'.repeat(210000) },
      },
    ];
    assert.equal(
      (
        await request('/api/billing', phone, 'POST', {
          action: 'reserve',
          id: 'comparison-large-health-upload',
          scope: { profileId: profile.id, days: ['2026-10-15'], formats: ['jsonl'] },
        })
      ).status,
      200,
    );
    const largeId = z.object({ id: z.string() }).parse(
      (
        await request('/api/cloud/uploads', `Upload ${upload}`, 'POST', {
          profile,
          day: '2026-10-15',
          format: 'jsonl',
          manifest: {
            profileId: profile.id,
            recordCount: largeRecords.length,
            billingOperationId: 'comparison-large-health-upload',
          },
        })
      ).value,
    ).id;
    assert.equal(
      (
        await fetch(`${origin}/api/cloud/uploads/${largeId}`, {
          method: 'PUT',
          headers: { Authorization: `Upload ${upload}` },
          body: largeRecords.map((record) => JSON.stringify(record)).join('\n') + '\n',
        })
      ).status,
      200,
    );
    const comparison = await client.callTool({
      name: 'compare_sleep_screen_time',
      arguments: {
        healthExportIds: [largeId],
        screenTimeExportIds: [id],
        view: 'sleep_performance',
        start: '2026-10-14',
        end: '2026-10-14',
        timezone: 'UTC',
      },
    });
    assert.ok(!comparison.isError, JSON.stringify(comparison));
    const compared = z
      .object({
        view: z.literal('sleep_performance'),
        usageSources: z.array(
          z.object({
            preSleep: z.array(
              z.object({
                lowerMs: z.number().nullable(),
                upperMs: z.number().nullable(),
                sleepPerformancePercent: z.number().nullable(),
              }),
            ),
          }),
        ),
        rows: z.array(
          z.object({
            sleepHours: z.number().nullable(),
            screenHours: z.number().nullable(),
            paired: z.boolean(),
          }),
        ),
      })
      .parse(comparison.structuredContent);
    assert.equal(compared.rows[0]?.sleepHours, 7);
    assert.equal(compared.rows[0]?.screenHours, 1);
    assert.equal(compared.rows[0]?.paired, true);
    assert.equal(compared.usageSources[0]?.preSleep[0]?.lowerMs, 3600000);
    assert.equal(compared.usageSources[0]?.preSleep[0]?.upperMs, 3600000);
    assert.equal(compared.usageSources[0]?.preSleep[0]?.sleepPerformancePercent, 88);
    assert.equal(
      (await client.readResource({ uri: 'ui://myself-md/sleep-screen-time-v1.html' })).contents
        .length,
      1,
    );
    const resource = await client.readResource({
      uri: 'ui://myself-md/activity-sleep-review-v1.html',
    });
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    assert.equal((await request(`/api/cloud/exports/${id}`, intruder, 'DELETE')).status, 404);
    assert.equal((await request(`/api/cloud/exports/${id}`, phone, 'DELETE')).status, 200);
    assert.equal(
      (
        await client.callTool({
          name: 'review_activity_sleep',
          arguments: { exportIds: [id], start: '2026-10-08', end: '2026-10-14', timezone: 'UTC' },
        })
      ).isError,
      true,
    );
    console.log(
      'Health review Worker: restricted OAuth, real R2 reads, structured steps/sleep, unknown days, embedded resource and deleted-export denial passed.',
    );
  } finally {
    await client.close();
  }
}
