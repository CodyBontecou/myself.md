import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const schema = z.literal('myself.md.auth.v1');
const diagnostic = z.discriminatedUnion('phase', [
  z.object({
    schema,
    phase: z.literal('state'),
    reason: z.enum([
      'verification_missing',
      'browser_cookie_mismatch',
      'browser_cookie_missing',
      'state_value_mismatch',
      'expired',
      'state_missing',
      'state_invalid',
      'other',
    ]),
  }),
  z.object({
    schema,
    phase: z.literal('callback'),
    provider: z.enum(['apple', 'google', 'github']),
    method: z.enum(['GET', 'POST']),
    target: z.enum(['native', 'canonical_callback', 'web_error', 'other', 'invalid']),
    error: z.enum([
      'none',
      'state_mismatch',
      'state_not_found',
      'state_invalid',
      'account_not_linked',
      'account_already_linked_to_different_user',
      'access_denied',
      'invalid_code',
      'invalid_grant',
      'invalid_client',
      'invalid_request',
      'login_required',
      'other',
    ]),
    hasCode: z.boolean(),
  }),
  z.object({
    schema,
    phase: z.literal('phone_token'),
    httpStatus: z.number().int().min(100).max(599),
    outcome: z.enum(['issued', 'rejected']),
  }),
]);

async function main() {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, to: { type: 'string' } },
    allowPositionals: false,
  });
  const to = values.to ? Date.parse(z.iso.datetime({ offset: true }).parse(values.to)) : Date.now();
  const from = values.from
    ? Date.parse(z.iso.datetime({ offset: true }).parse(values.from))
    : to - 30 * 60_000;
  if (from >= to || to - from > 2 * 60 * 60_000) {
    throw new Error('Use a positive time window of at most two hours, with explicit timezones.');
  }
  let token;
  try {
    token = execFileSync(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-a',
        'myself-md',
        '-s',
        'myself.md.cloudflare.observability',
        '-w',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    throw new Error('The Observability token is unavailable in Mac Keychain.');
  }
  const response = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/e4265f322e6380ee832b83ad45e3e8c0/workers/observability/telemetry/query',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queryId: 'myself-auth-diagnostics',
        dry: true,
        view: 'events',
        limit: 200,
        timeframe: { from, to },
        parameters: {
          filters: [
            { key: '$metadata.service', operation: 'eq', type: 'string', value: 'myself-md' },
            { key: 'schema', operation: 'eq', type: 'string', value: 'myself.md.auth.v1' },
          ],
          filterCombination: 'and',
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Cloudflare query failed (HTTP ${response.status}); check token expiry and Observability Read permission.`,
    );
  const envelope = z
    .object({
      success: z.literal(true),
      result: z.object({ events: z.object({ events: z.array(z.unknown()) }) }),
    })
    .safeParse(await response.json());
  if (!envelope.success)
    throw new Error('Unexpected Cloudflare query response. No raw logs printed.');
  const events = [];
  let omitted = 0;
  for (const raw of envelope.data.result.events.events) {
    const event = z
      .object({
        timestamp: z.number().int().min(0).max(8_640_000_000_000_000),
        source: diagnostic,
      })
      .safeParse(raw);
    if (!event.success) {
      omitted++;
      continue;
    }
    events.push({ at: new Date(event.data.timestamp).toISOString(), ...event.data.source });
  }
  console.log(
    JSON.stringify(
      {
        worker: 'myself-md',
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        possiblyTruncated: envelope.data.result.events.events.length >= 200,
        omitted,
        events,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Diagnostic query failed.');
  process.exitCode = 1;
});
