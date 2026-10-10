import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext, runInContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import * as updates from '../client/log-updates.js';
import { logJson, logsJson, selectLogs, logs as unifiedLogs } from '../core/logs.js';
import { exportEvent } from '../core/history.js';
import * as core from '../core/debug-log.js';
import { createDataService } from '../server/data-service.js';
import { BillingStore } from '../server/billing-store.js';
import { HistoryStore } from '../server/history-store.js';
import { parseProfile } from '../core/profiles.js';
const db = new DatabaseSync(':memory:');
const sqlite = {
  execSync: (/** @type {string} */ sql) => db.exec(sql),
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
  runSync: (sql, ...args) => db.prepare(sql).run(...args),
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
  getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
  getAllSync: (sql, ...args) => db.prepare(sql).all(...args),
  withTransactionSync: (/** @type {()=>void} */ action) => action(),
};
async function loadLogs() {
  const runtime = createContext({ URL });
  const module = new SourceTextModule(
    await readFile(new URL('../client/debug-log.js', import.meta.url), 'utf8'),
    { context: runtime },
  );
  await module.link((specifier) => {
    const values =
      specifier === 'react-native'
        ? { Platform: { OS: 'ios' } }
        : specifier === './phone-database.js'
          ? { phoneDatabase: () => sqlite }
          : specifier === './log-updates.js'
            ? updates
            : core;
    return new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context: runtime },
    );
  });
  await module.evaluate();
  const boundary =
    /** @type {{recordDebug:(context:{owner:string,deviceId:string},operation:string,outcome:string,details?:{httpStatus?:number,durationMs?:number,error?:unknown,url?:string,credentials?:Record<string,string>,records?:Omit<import('../core/debug-log.js').DebugRecords,'truncated'>})=>void,debugReport:(context:{owner:string,deviceId:string},forAgent?:boolean)=>import('../core/debug-log.js').DebugReport,debugSharing:(context:{owner:string,deviceId:string})=>{shared:boolean},debugContent:(context:{owner:string,deviceId:string})=>import('../core/debug-log.js').DebugContent,setDebugContent:(context:{owner:string,deviceId:string},content:import('../core/debug-log.js').DebugContent)=>void,setDebugSharing:(context:{owner:string,deviceId:string},shared:boolean)=>void}} */ (
      module.namespace
    );
  return {
    ...boundary,
    debugReport: (/** @type {{owner:string,deviceId:string}} */ scope, forAgent = false) =>
      JSON.parse(JSON.stringify(boundary.debugReport(scope, forAgent))),
  };
}
const deviceId = randomUUID(),
  context = { owner: 'owner', deviceId };
let logs = await loadLogs();
const billing = new BillingStore(':memory:');
const history = new HistoryStore(':memory:', { seal: (value) => value, open: (value) => value });
/** @type {Map<string,import('../server/data-service.js').Phone>} */
const phones = new Map();
const service = createDataService({
  billing,
  history,
  phones,
  refreshEntitlement: async () => {},
  devices: (subject) =>
    subject === 'owner' ? [{ id: deviceId, name: 'Test', created: Date.now() }] : [],
});
const catalog = {
  profiles: [
    {
      ...parseProfile({
        schema: 'myself.md.profile.v1',
        name: 'Private',
        selection: { health: [], time: [], location: [] },
      }),
      id: 'private',
      agentAccess: false,
    },
  ],
  domains: ['health', 'time', 'location'].map((domain) => ({
    domain,
    enabled: false,
    availableTypes: [],
    types: /** @type {string[]} */ ([]),
    notes: [],
  })),
};
/** @param {import('../core/debug-log.js').DebugReport} report */
function heartbeat(report) {
  service.phoneApi(`/api/phones/${deviceId}/poll`, 'POST', 'owner', {
    ...catalog,
    diagnostics: report,
  });
}
/** @param {string} subject */
async function connect(subject) {
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'logs-test', version: '1' });
    service.registerDataTools(mcp, subject, 'test-agent');
    return mcp;
  });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }),
  );
  return client;
}
const owner = await connect('owner'),
  other = await connect('other');
/** @param {Client} client @param {Record<string,unknown>} [args] */
async function read(client, args = { deviceId }) {
  const result = await client.callTool({ name: 'get_phone_debug_logs', arguments: args });
  return {
    ...result,
    structuredContent: /** @type {Record<string,unknown>|undefined} */ (result.structuredContent),
  };
}
try {
  let deliveries = 0;
  const unsubscribe = updates.subscribeLogs(context, () => {
    assert.ok(logs.debugReport(context).entries.length, 'Observers read committed events');
    deliveries++;
  });
  const stopOther = updates.subscribeLogs({ ...context, owner: 'other' }, () => {
    throw new Error('Wrong partition received a notification');
  });
  let otherDeliveries = 0;
  const stopOtherCount = updates.subscribeLogs({ ...context, owner: 'other' }, () => {
    otherDeliveries++;
  });
  logs.recordDebug(context, 'app', 'started');
  logs.recordDebug(context, 'profile', 'succeeded');
  await Promise.resolve();
  assert.equal(deliveries, 1, 'Same-turn writes are batched and delivered immediately');
  assert.equal(otherDeliveries, 0);
  logs.recordDebug(context, 'profile', 'succeeded');
  await Promise.resolve();
  assert.equal(deliveries, 1, 'Suppressed repeats do not emit updates');
  logs.recordDebug(context, 'query', 'started');
  unsubscribe();
  await Promise.resolve();
  assert.equal(deliveries, 1, 'Unsubscribe cancels a queued delivery');
  stopOther();
  stopOtherCount();
  const stopThrowing = updates.subscribeLogs(context, () => {
    throw new Error('Viewer failed');
  });
  logs.recordDebug(context, 'app', 'succeeded');
  await Promise.resolve();
  stopThrowing();
  db.exec('DELETE FROM debug_log');
  const transport = createContext({
    recordDebug: logs.recordDebug,
    debugOperation: core.debugOperation,
    Date,
    Headers,
    WebBrowser: { maybeCompleteAuthSession: () => {} },
    fetch: async () => ({
      status: 503,
      ok: false,
      json: async () => ({ error: 'private-token private-payload' }),
    }),
  });
  runInContext(
    (await readFile(new URL('../client/session.js', import.meta.url), 'utf8'))
      .replace(/^import .*;\n/gm, '')
      .replace(/^export /gm, ''),
    transport,
  );
  await assert.rejects(
    transport.request(
      'https://secret.example/?token=private',
      {},
      { session: context, operation: 'cloud' },
    ),
    /private-token/,
  );
  const requestLog = logs.debugReport(context).entries[0];
  assert.equal(requestLog?.httpStatus, 503);
  assert.equal(requestLog?.outcome, 'failed');
  assert.ok(
    requestLog?.error?.includes('private-token private-payload'),
    'Raw error text is always retained',
  );
  assert.equal(requestLog?.url, undefined);
  assert.equal(requestLog?.credentials, undefined);
  assert.equal(requestLog?.records, undefined);
  const allContent = { records: true, credentials: true, urls: true };
  const attachment = {
    domain: /** @type {const} */ ('health'),
    type: 'sleep',
    profileId: 'private',
    values: [{ value: 'fixture-record-value' }],
  };
  logs.setDebugContent(context, allContent);
  logs.recordDebug(context, 'query', 'failed', {
    error: 'fixture raw error',
    url: 'https://fixture.test/path?token=fixture-url-token',
    credentials: { Authorization: 'Bearer fixture-credential' },
    records: attachment,
  });
  const rich = logs.debugReport(context).entries[0];
  assert.equal(rich?.credentials?.Authorization, 'Bearer fixture-credential');
  assert.ok(rich?.url?.includes('fixture-url-token'));
  assert.equal(rich?.records?.values.length, 1);
  logs = await loadLogs();
  assert.deepEqual(logs.debugContent(context), allContent, 'Content choices survive restart');
  assert.deepEqual(
    logs.debugContent({ ...context, owner: 'other' }),
    core.parseDebugContent(undefined),
  );
  logs.setDebugContent(context, core.parseDebugContent(undefined));
  const purged = db.prepare('SELECT value FROM debug_log WHERE owner=?').all(context.owner);
  assert.ok(!JSON.stringify(purged).includes('fixture-record-value'));
  assert.ok(!JSON.stringify(purged).includes('fixture-credential'));
  assert.ok(!JSON.stringify(purged).includes('fixture-url-token'));
  assert.ok(
    JSON.stringify(purged).includes('fixture raw error'),
    'Disabling attachments preserves errors',
  );
  logs.setDebugContent(context, { records: false, credentials: false, urls: true });
  logs.recordDebug(context, 'cloud', 'started', {
    url: 'https://user:password@fixture.test/path?token=fixture-url-secret#fragment-secret',
    credentials: { Authorization: 'fixture-header-secret' },
  });
  const urlOnly = logs.debugReport(context).entries[0];
  assert.ok(urlOnly?.url?.includes('/path'));
  assert.ok(!JSON.stringify(urlOnly).includes('secret'));
  assert.ok(!JSON.stringify(urlOnly).includes('password'));
  logs.setDebugContent(context, core.parseDebugContent(undefined));
  logs.recordDebug(context, 'query', 'failed', { error: 'a'.repeat(16001) });
  assert.equal(logs.debugReport(context).entries[0]?.errorTruncated, true);
  assert.equal(logs.debugReport(context).entries[0]?.error?.length, 16000);
  db.exec('DELETE FROM debug_log');
  logs.recordDebug(context, 'connection', 'failed', { httpStatus: 503, durationMs: 12 });
  logs.recordDebug(context, 'connection', 'failed', { httpStatus: 503 });
  logs.recordDebug(context, 'secret-token', 'failed');
  assert.equal(
    logs.debugReport(context).entries.length,
    1,
    'Suppress repeats and unknown messages',
  );
  logs = await loadLogs();
  assert.equal(logs.debugReport(context).entries.length, 1, 'Survive a JS runtime restart');
  assert.equal(logs.debugReport({ ...context, owner: 'other' }).entries.length, 0);
  assert.equal(logs.debugReport({ ...context, deviceId: randomUUID() }).entries.length, 0);
  assert.equal(logs.debugReport(context, true).entries.length, 0, 'Off by default');
  for (let i = 0; i < 320; i++) logs.recordDebug(context, i % 2 ? 'query' : 'export', 'started');
  assert.equal(logs.debugReport(context).entries.length, 300);
  db.prepare('UPDATE debug_log SET time=?').run(Date.now() - core.debugRetentionMs - 1);
  assert.equal(logs.debugReport(context).entries.length, 0, 'Expire local logs');
  logs.recordDebug(context, 'query', 'failed');
  heartbeat(logs.debugReport(context, true));
  assert.equal((await read(owner)).structuredContent?.report, null);
  const profile = catalog.profiles[0];
  assert.ok(profile);
  const stamp = new Date().toISOString();
  const event = exportEvent({
    id: 'log-export',
    profile,
    actor: 'manual',
    stamp,
    timezone: 'UTC',
    interval: { start: stamp, end: stamp },
  });
  history.record('owner', deviceId, { ...event, status: 'failed' });
  history.record('owner', deviceId, {
    ...event,
    id: 'log-agent',
    kind: 'access',
    actor: 'agent',
    status: 'complete',
  });
  /** @param {Client} client @param {Record<string,unknown>} [args] */
  const listLogs = async (client, args = {}) => {
    const result = await client.callTool({
      name: 'list_phone_logs',
      arguments: { deviceId, ...args },
    });
    return {
      isError: result.isError,
      value:
        /** @type {{logs:import('../core/logs.js').Log[],nextHistoryOffset:number|null,unavailableIds:string[],jsonl?:string,observedAt:number,recommendedPollMs:number,diagnostics:{status:string}}|undefined} */ (
          result.structuredContent
        ),
    };
  };
  assert.equal((await listLogs(other)).isError, true, 'Unified logs enforce device ownership');
  assert.equal((await listLogs(owner, { category: 'secrets' })).isError, true);
  assert.equal((await listLogs(owner, { token: 'secret' })).isError, true);
  const privateLogs = (await listLogs(owner)).value;
  assert.equal(privateLogs?.logs.length, 2, 'History is readable without diagnostics consent');
  assert.equal(privateLogs?.diagnostics.status, 'awaiting_user');
  assert.equal(
    (await listLogs(owner, { format: 'jsonl', category: 'app' })).value?.jsonl,
    '',
    'Raw output cannot bypass consent',
  );
  assert.equal((await listLogs(owner, { category: 'app' })).value?.logs.length, 0);
  assert.equal(
    (await listLogs(owner, { category: 'agents' })).value?.logs[0]?.id,
    'history:log-agent',
  );
  assert.equal((await listLogs(owner, { issues: true })).value?.logs[0]?.id, 'history:log-export');
  assert.equal((await listLogs(owner, { profileId: 'different' })).value?.logs.length, 0);
  const handoff = await owner.callTool({
    name: 'request_phone_debug_access',
    arguments: { deviceId },
  });
  assert.equal(
    /** @type {Record<string,unknown>|undefined} */ (handoff.structuredContent)?.status,
    'awaiting_user',
  );
  assert.equal(logs.debugSharing(context).shared, false, 'Agent cannot grant itself access');
  assert.equal((await read(other)).isError, true);
  assert.throws(
    () =>
      service.phoneApi(
        `/api/phones/${deviceId}/diagnostics`,
        'POST',
        'other',
        logs.debugReport(context, true),
      ),
    /not found/,
  );
  logs.setDebugSharing(context, true);
  const enabled = logs.debugReport(context, true);
  heartbeat(enabled);
  assert.deepEqual(
    (await read(owner)).structuredContent?.report,
    enabled,
    'Same local report reaches real MCP',
  );
  const expected = unifiedLogs(history.list('owner', deviceId).events, enabled.entries, Date.now());
  assert.deepEqual(
    (await listLogs(owner)).value?.logs,
    expected,
    'Mobile selector and real MCP union agree',
  );
  const raw = (await listLogs(owner, { format: 'jsonl' })).value;
  assert.equal(
    raw?.jsonl,
    expected.map((log) => logJson(log)).join('\n'),
    'MCP raw JSON matches the UI projection',
  );
  const chosenIds = expected.slice(0, 2).map((entry) => entry.id);
  const chosen = (await listLogs(owner, { format: 'jsonl', selectedIds: chosenIds })).value;
  assert.equal(chosen?.jsonl, logsJson(selectLogs(expected, chosenIds).logs));
  assert.equal(chosen?.logs.length, chosenIds.length);
  const missing = (await listLogs(owner, { format: 'jsonl', selectedIds: ['missing-log'] })).value;
  assert.deepEqual(missing?.unavailableIds, ['missing-log']);
  assert.equal(missing?.jsonl, '');
  assert.equal((await listLogs(owner, { selectedIds: ['same', 'same'] })).isError, true);
  assert.equal((await listLogs(other, { selectedIds: chosenIds, format: 'jsonl' })).isError, true);
  assert.throws(() => selectLogs(expected, Array(351).fill('id')));
  const changed = expected.map((log) =>
    'entry' in log
      ? Object.assign({}, log, {
          entry: core.debugEntryContent(log.entry, core.parseDebugContent(undefined)),
        })
      : log,
  );
  assert.equal(
    logsJson(selectLogs(changed, chosenIds).logs),
    logsJson(changed.filter((log) => chosenIds.includes(log.id))),
    'Selections resolve current content, never old snapshots',
  );
  assert.equal(raw?.recommendedPollMs, 2000);
  assert.ok(Number.isSafeInteger(raw?.observedAt));
  assert.equal((await listLogs(owner, { format: 'console' })).isError, true);
  assert.equal((await listLogs(other, { format: 'jsonl' })).isError, true);
  logs.setDebugContent(context, allContent);
  logs.recordDebug(context, 'query', 'failed', {
    error: 'grant-test failure',
    credentials: { Authorization: 'Bearer grant-test' },
    url: 'https://fixture.test/private',
    records: attachment,
  });
  const richReport = logs.debugReport(context, true);
  heartbeat(richReport);
  const deniedRecordReport = /** @type {import('../core/debug-log.js').DebugReport} */ (
    (await read(owner)).structuredContent?.report
  );
  assert.equal(
    deniedRecordReport.entries[0]?.records,
    undefined,
    'Diagnostic capture cannot bypass data grants',
  );
  assert.equal(deniedRecordReport.entries[0]?.credentials?.Authorization, 'Bearer grant-test');
  const catalogResult = await owner.callTool({
    name: 'get_phone_data_catalog',
    arguments: { deviceId },
  });
  assert.ok(
    !JSON.stringify(catalogResult.structuredContent).includes('fixture-record-value'),
    'Catalog cannot bypass diagnostic record authorization',
  );
  const requestContent = await owner.callTool({
    name: 'request_phone_debug_content',
    arguments: { deviceId, content: { records: false, credentials: false, urls: false } },
  });
  assert.equal(
    /** @type {Record<string,unknown>|undefined} */ (requestContent.structuredContent)?.status,
    'awaiting_user',
  );
  assert.deepEqual(logs.debugContent(context), allContent, 'Agents cannot change content consent');
  const profileForGrant = catalog.profiles[0];
  assert.ok(profileForGrant);
  profileForGrant.agentAccess = true;
  profileForGrant.selection.health = ['native:sleep'];
  const healthForGrant = catalog.domains.find((domain) => domain.domain === 'health');
  assert.ok(healthForGrant);
  healthForGrant.enabled = true;
  healthForGrant.types = ['native:sleep'];
  heartbeat(richReport);
  assert.deepEqual(
    (await read(owner)).structuredContent?.report,
    richReport,
    'Current domain/type and profile approval authorize attached records',
  );
  profileForGrant.agentAccess = false;
  heartbeat(richReport);
  assert.equal(
    /** @type {import('../core/debug-log.js').DebugReport} */ (
      (await read(owner)).structuredContent?.report
    )?.entries[0]?.records,
    undefined,
    'Profile revocation removes record attachments',
  );
  logs.setDebugContent(context, core.parseDebugContent(undefined));
  heartbeat(richReport);
  service.phoneApi(
    `/api/phones/${deviceId}/diagnostics`,
    'POST',
    'owner',
    logs.debugReport(context, true),
  );
  heartbeat(richReport);
  assert.equal(
    /** @type {import('../core/debug-log.js').DebugReport} */ (
      (await read(owner)).structuredContent?.report
    )?.entries[0]?.credentials,
    undefined,
    'Older in-flight snapshots cannot restore disabled content',
  );
  db.exec('DELETE FROM debug_log');
  logs.recordDebug(context, 'query', 'failed');
  heartbeat(logs.debugReport(context, true));
  const duplicates = unifiedLogs(
    [],
    [enabled.entries[0], enabled.entries[0]].filter((entry) => entry !== undefined),
    enabled.generatedAt,
  );
  assert.equal(
    new Set(duplicates.map((entry) => entry.id)).size,
    2,
    'Duplicate app events have distinct detail keys',
  );
  assert.equal(unifiedLogs([], enabled.entries, enabled.generatedAt, { issues: true }).length, 1);
  assert.equal(
    unifiedLogs([], enabled.entries, enabled.generatedAt + core.debugRetentionMs + 1).length,
    0,
  );
  for (let index = 0; index < 51; index++)
    history.record('owner', deviceId, { ...event, id: `page-${index}`, status: 'complete' });
  const firstPage = (await listLogs(owner, { category: 'app' })).value;
  assert.equal(firstPage?.nextHistoryOffset, 50, 'History cursor advances before filtering');
  const lastPage = (await listLogs(owner, { historyOffset: 50 })).value;
  assert.equal(lastPage?.nextHistoryOffset, null);
  assert.equal(lastPage?.logs.filter((log) => log.category !== 'app').length, 3);
  assert.equal(
    (await read(owner, { deviceId, filter: 'issues' })).structuredContent?.status,
    'available',
  );
  assert.equal((await read(owner, { deviceId, filter: 'secrets' })).isError, true);
  assert.equal((await read(owner, { deviceId, token: 'secret' })).isError, true);
  assert.throws(
    () =>
      heartbeat({
        ...enabled,
        entries: [
          /** @type {import('../core/debug-log.js').DebugEntry} */ ({
            ...enabled.entries[0],
            message: 'secret',
          }),
        ],
      }),
    /Unrecognized key/,
  );
  logs.setDebugSharing(context, false);
  service.phoneApi(
    `/api/phones/${deviceId}/diagnostics`,
    'POST',
    'owner',
    logs.debugReport(context, true),
  );
  heartbeat(enabled);
  assert.equal(
    (await listLogs(owner, { category: 'app' })).value?.logs.length,
    0,
    'Unified logs honor revocation',
  );
  assert.equal(
    (await read(owner)).structuredContent?.report,
    null,
    'Stale in-flight heartbeat cannot restore access',
  );
  logs.setDebugSharing(context, true);
  heartbeat(logs.debugReport(context, true));
  const phone = phones.get(deviceId);
  assert.ok(phone);
  phone.seen = Date.now() - 15001;
  assert.equal((await read(owner)).structuredContent?.report, null, 'No stale/offline read');
  assert.equal(
    (await listLogs(owner, { category: 'app' })).value?.logs.length,
    0,
    'Unified logs hide stale diagnostics',
  );
  service.cancelPhone(deviceId, 'owner');
  assert.equal(
    (await read(owner)).structuredContent?.report,
    null,
    'Disconnect removes server report',
  );
  console.log(
    'Debug logs: SQLite persistence, bounded retention, safe fields, partition isolation, real MCP reads, consent, revocation races, stale-phone denial and disconnect pass.',
  );
} finally {
  await Promise.all([owner.close(), other.close()]);
  db.close();
  billing.db.close();
  history.db.close();
}
