import assert from 'node:assert/strict';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { heartRateContextFixture } from './heart-rate-context-fixture.js';
import { parseProfile } from '../core/profiles.js';

/** Exercise the restricted production-runtime route with a distinct fictional owner.
 * @param {{origin:string,request:(path:string,bearer:string|null,method?:string,body?:unknown)=>Promise<{status:number,value:unknown}>,token:(subject:string,client:string,path?:string)=>Promise<string>}} fixture */
export async function verifyHeartRateContextWorker({ origin, request, token }) {
  const phone = await token('weekly-review-owner', 'myselfmd-phone');
  const agent = await token('weekly-review-owner', 'heart-rate-context-agent', '/mcp/chatgpt');
  const intruder = await token('heart-rate-context-intruder', 'myselfmd-phone');
  const setup = new Client({ name: 'heart-rate-context-setup', version: '1' });
  let ticket;
  try {
    await setup.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
        requestInit: {
          headers: {
            Authorization: await token('weekly-review-owner', 'heart-rate-context-agent'),
          },
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
        name: 'Fictional heart-rate-context phone',
      })
    ).value,
  ).id;
  const profile = {
    ...parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Fictional health review',
      selection: {
        health: ['native:HKQuantityTypeIdentifierHeartRate'],
        time: ['native:application'],
        location: ['native:points'],
      },
    }),
    id: 'heart-rate-context-worker',
  };
  const catalog = {
    profileSync: { base: null },
    profiles: [
      {
        ...profile,
        agentAccess: true,
        agentPermissions: { health: true, time: true, location: true, logs: false },
      },
    ],
    domains: ['health', 'time', 'location'].map((domain) => ({
      domain,
      enabled: true,
      types: profile.selection[/** @type {import('../core/data.js').Domain} */ (domain)],
      availableTypes: profile.selection[/** @type {import('../core/data.js').Domain} */ (domain)],
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
        id: 'heart-rate-context-upload',
        scope: { profileId: profile.id, days: ['2026-10-14'], formats: ['jsonl'] },
      })
    ).status,
    200,
  );
  const records = heartRateContextFixture('2026-10-14');
  const id = z.object({ id: z.string() }).parse(
    (
      await request('/api/cloud/uploads', `Upload ${upload}`, 'POST', {
        profile,
        day: '2026-10-14',
        format: 'jsonl',
        manifest: {
          profileId: profile.id,
          recordCount: records.length,
          billingOperationId: 'heart-rate-context-upload',
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
  const client = new Client({ name: 'heart-rate-context-worker', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + '/mcp/chatgpt'), {
        requestInit: { headers: { Authorization: agent } },
      }),
    );
    const tool = (await client.listTools()).tools.find(
      (entry) => entry.name === 'review_heart_rate_context',
    );
    assert.ok(tool?.outputSchema);
    const result = await client.callTool({
      name: 'review_heart_rate_context',
      arguments: {
        healthExportIds: [id],
        contextExportIds: [id],
        context: 'location',
        start: '2026-10-08',
        end: '2026-10-14',
        timezone: 'UTC',
        maxOffsetSeconds: 300,
      },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    const parse = z.object({
      sources: z.array(
        z.object({
          observations: z.array(
            z.object({
              heartRates: z.array(
                z.object({ bpm: z.number().nullable(), sampleIds: z.array(z.string()) }),
              ),
            }),
          ),
        }),
      ),
    });
    const review = parse.parse(result.structuredContent);
    assert.equal(review.sources[0]?.observations[0]?.heartRates[0]?.bpm, 72);
    assert.equal(review.sources[0]?.observations[2]?.heartRates[0]?.bpm, null);
    const screen = await client.callTool({
      name: 'review_heart_rate_context',
      arguments: {
        healthExportIds: [id],
        contextExportIds: [id],
        context: 'screen_time',
        start: '2026-10-08',
        end: '2026-10-14',
        timezone: 'UTC',
      },
    });
    assert.ok(!screen.isError, JSON.stringify(screen));
    assert.equal(
      parse.parse(screen.structuredContent).sources[0]?.observations[0]?.heartRates[0]?.sampleIds
        .length,
      3,
    );
    const resource = await client.readResource({
      uri: 'ui://myself-md/heart-rate-context-v2.html',
    });
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    assert.equal((await request(`/api/cloud/exports/${id}`, intruder, 'DELETE')).status, 404);
    assert.equal((await request(`/api/cloud/exports/${id}`, phone, 'DELETE')).status, 200);
    assert.equal(
      (
        await client.callTool({
          name: 'review_heart_rate_context',
          arguments: {
            healthExportIds: [id],
            contextExportIds: [id],
            context: 'location',
            start: '2026-10-08',
            end: '2026-10-14',
            timezone: 'UTC',
            maxOffsetSeconds: 300,
          },
        })
      ).isError,
      true,
    );
    console.log(
      'Heart-rate context Worker: restricted OAuth, real R2 reads, both overlays, unmatched points, embedded resource and deleted-export denial passed.',
    );
  } finally {
    await client.close();
  }
}
