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
        ],
        time: [],
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
      enabled: domain === 'health',
      types:
        domain === 'health'
          ? [
              'native:HKQuantityTypeIdentifierStepCount',
              'native:HKCategoryTypeIdentifierSleepAnalysis',
            ]
          : [],
      availableTypes:
        domain === 'health'
          ? [
              'native:HKQuantityTypeIdentifierStepCount',
              'native:HKCategoryTypeIdentifierSleepAnalysis',
            ]
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
  ];
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
            daily: z.array(z.object({ date: z.string(), value: z.number().nullable() })),
          }),
        ),
      })
      .parse(result.structuredContent);
    assert.equal(review.series.find((s) => s.kind === 'activity')?.daily.at(-1)?.value, 4000);
    assert.equal(review.series.find((s) => s.kind === 'sleep')?.daily.at(-1)?.value, 6);
    assert.equal(review.series[0]?.daily[0]?.value, null);
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
