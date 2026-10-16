import { z } from 'zod';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext, runInContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { readJSONResponse } from '../packages/support-chat/errors.js';
import { logJson, logsJson, selectLogs, logs as unifiedLogs } from '../core/logs.js';
import { exportEvent } from '../core/history.js';
import * as core from '../core/debug-log.js';
import { createDataService } from '../server/data-service.js';
import { restrictChatgptTools } from '../server/chatgpt-tools.js';
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
    /** @type {{recordDebug:(context:{owner:string,deviceId:string},operation:string,outcome:string,details?:{httpStatus?:number,durationMs?:number,error?:unknown})=>void,debugReport:(context:{owner:string,deviceId:string},forAgent?:boolean)=>import('../core/debug-log.js').DebugReport,debugSharing:(context:{owner:string,deviceId:string})=>{shared:boolean},setDebugSharing:(context:{owner:string,deviceId:string},shared:boolean)=>void}} */ (
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
/** @type {Map<string,import('../server/data-service.js').Job>} */
const jobs = new Map();
const service = createDataService({
  billing,
  history,
  phones,
  jobs,
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
      agentPermissions: { health: true, time: true, location: true, logs: true },
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
/** @param {string} subject @param {boolean} [chatgpt] */
async function connect(subject, chatgpt = false) {
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'logs-test', version: '1' });
    if (chatgpt) restrictChatgptTools(mcp);
    service.registerDataTools(mcp, subject, 'test-agent', { chatgpt });
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
  const transport = createContext({
    readJSONResponse,
    recordDebug: logs.recordDebug,
    debugOperation: core.debugOperation,
    Date,
    Headers,
    WebBrowser: { maybeCompleteAuthSession: () => {} },
    fetch: async () => ({
      status: 503,
      ok: false,
      text: async () => JSON.stringify({ error: 'private-token private-payload' }),
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
  assert.ok(!JSON.stringify(requestLog).includes('secret.example'));
  const legacyEntry = {
    time: Date.now(),
    operation: 'query',
    outcome: 'failed',
    durationMs: 17,
    httpStatus: 503,
    error: 'fixture raw error',
    url: 'https://fixture.test/path?token=fixture-url-token',
    credentials: { Authorization: 'Bearer fixture-credential' },
    records: {
      domain: 'health',
      type: 'sleep',
      profileId: 'private',
      values: [{ value: 'fixture-record-value' }],
      truncated: false,
    },
  };
  logs.recordDebug(context, 'query', 'failed', legacyEntry);
  assert.deepEqual(logs.debugReport(context).entries[0], core.parseDebugEntry(legacyEntry));
  db.exec('CREATE TABLE debug_content(owner TEXT,device TEXT,value TEXT)');
  db.prepare('INSERT INTO debug_content VALUES(?,?,?)').run(
    context.owner,
    deviceId,
    JSON.stringify({ records: true, credentials: true, urls: true }),
  );
  db.prepare('INSERT INTO debug_log(owner,device,time,value) VALUES(?,?,?,?)').run(
    context.owner,
    deviceId,
    legacyEntry.time,
    JSON.stringify(legacyEntry),
  );
  logs = await loadLogs();
  const retained = JSON.stringify(db.prepare('SELECT value FROM debug_log').all());
  assert.ok(!retained.includes('fixture-record-value'));
  assert.ok(!retained.includes('fixture-credential'));
  assert.ok(!retained.includes('fixture-url-token'));
  assert.ok(retained.includes('fixture raw error'), 'Migration preserves raw errors');
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debug_content'").get(),
    undefined,
    'Obsolete attachment choices are removed',
  );
  const legacyReport = {
    ...logs.debugReport(context),
    shared: true,
    content: { records: true, credentials: true, urls: true },
    entries: [legacyEntry],
  };
  heartbeat(legacyReport);
  assert.deepEqual(
    phones.get(deviceId)?.catalog.diagnostics?.entries,
    [core.parseDebugEntry(legacyEntry)],
    'Server strips attachments from legacy phone reports',
  );
  assert.ok(!JSON.stringify(phones.get(deviceId)?.catalog.diagnostics).includes('"content"'));
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
    (await listLogs(owner, { category: 'app', query: 'query', format: 'jsonl' })).value?.jsonl,
    '',
    'Search cannot expose diagnostics before owner consent',
  );
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
  const ownerHandoff = /** @type {{handoff:{deepLink:string,instructions:string}}} */ (
    handoff.structuredContent
  ).handoff;
  assert.equal(ownerHandoff.deepLink, 'myselfmd://profiles/private?section=agent-permissions');
  assert.ok(ownerHandoff.instructions.includes('Enable Logs'));
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
  assert.ok(catalog.profiles[0]);
  catalog.profiles[0].agentAccess = true;
  heartbeat(enabled);
  assert.deepEqual(
    (await read(owner)).structuredContent?.report,
    enabled,
    'Same local report reaches real MCP',
  );
  const logProfile = catalog.profiles[0];
  assert.ok(logProfile);
  logProfile.agentPermissions.logs = false;
  heartbeat(enabled);
  assert.equal(
    (await read(owner, { deviceId, profileId: logProfile.id })).structuredContent?.report,
    null,
    'Per-profile log revocation blocks diagnostics',
  );
  assert.equal(
    (await read(owner)).structuredContent?.report,
    null,
    'Unscoped diagnostics cannot bypass revoked profiles',
  );
  assert.equal(
    (await listLogs(owner)).value?.logs.filter((entry) => entry.category === 'app').length,
    0,
  );
  const requestedPermissions = { ...logProfile.agentPermissions, logs: true };
  const permissionsHandoff = await owner.callTool({
    name: 'request_phone_profile_permissions',
    arguments: { deviceId, profileId: logProfile.id, permissions: requestedPermissions },
  });
  assert.equal(
    /** @type {Record<string,unknown>} */ (permissionsHandoff.structuredContent).status,
    'awaiting_user',
  );
  assert.equal(logProfile.agentPermissions.logs, false, 'MCP cannot grant itself access');
  assert.equal(
    (
      await other.callTool({
        name: 'request_phone_profile_permissions',
        arguments: { deviceId, profileId: logProfile.id, permissions: requestedPermissions },
      })
    ).isError,
    true,
  );
  logProfile.agentPermissions.logs = true;
  heartbeat(enabled);
  assert.equal(
    (await read(owner, { deviceId, profileId: 'missing' })).structuredContent?.report,
    null,
  );
  const completedPermissions = await owner.callTool({
    name: 'request_phone_profile_permissions',
    arguments: { deviceId, profileId: logProfile.id, permissions: requestedPermissions },
  });
  assert.equal(
    /** @type {Record<string,unknown>} */ (completedPermissions.structuredContent).status,
    'completed',
  );
  const expected = unifiedLogs(history.list('owner', deviceId).events, enabled.entries, Date.now());
  assert.deepEqual(
    (await listLogs(owner)).value?.logs,
    expected,
    'Shared metadata selector and real MCP union agree',
  );
  const raw = (await listLogs(owner, { format: 'jsonl' })).value;
  assert.equal(
    raw?.jsonl,
    expected.map((log) => logJson(log)).join('\n'),
    'MCP raw JSON matches the authorized projection',
  );
  assert.deepEqual(
    (await listLogs(owner, { query: '  LOG-EXPORT  ', format: 'jsonl' })).value?.logs,
    expected.filter((log) => log.id === 'history:log-export'),
    'Search trims and ignores case, through the same authorized metadata selector',
  );
  assert.equal(
    (await listLogs(owner, { query: 'log-export', category: 'agents' })).value?.logs.length,
    0,
    'Search composes with source filters',
  );
  assert.equal((await listLogs(owner, { query: 'no-such-log', format: 'jsonl' })).value?.jsonl, '');
  assert.equal((await listLogs(owner, { query: 'x'.repeat(201) })).isError, true);
  assert.equal((await listLogs(other, { query: 'log-export' })).isError, true);
  const searched = (await listLogs(owner, { query: 'log-export', format: 'jsonl' })).value;
  assert.equal(searched?.jsonl, logsJson(searched?.logs ?? []));
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
  assert.equal(raw?.recommendedPollMs, 2000);
  assert.ok(Number.isSafeInteger(raw?.observedAt));
  assert.equal((await listLogs(owner, { format: 'console' })).isError, true);
  assert.equal((await listLogs(other, { format: 'jsonl' })).isError, true);
  logs.recordDebug(context, 'query', 'failed', { error: 'metadata-test failure' });
  const metadataReport = logs.debugReport(context, true);
  const destinationProfile = catalog.profiles[0];
  assert.ok(destinationProfile);
  destinationProfile.export = {
    ...destinationProfile.export,
    destination: 'http',
    writeMode: 'append',
    httpUrl: 'https://destination.fixture/?apiKey=synthetic-destination-key',
  };
  heartbeat(metadataReport);
  const catalogResult = await owner.callTool({
    name: 'get_phone_data_catalog',
    arguments: { deviceId },
  });
  assert.ok(
    !JSON.stringify(catalogResult.structuredContent).includes('fixture-record-value'),
    'Catalog never includes legacy diagnostic records',
  );
  const restricted = await connect('owner', true);
  try {
    const safeCatalog = await restricted.callTool({
      name: 'get_phone_data_catalog',
      arguments: { deviceId },
    });
    const safeText = JSON.stringify(safeCatalog);
    assert.equal(
      z
        .object({
          catalog: z.object({
            profiles: z.array(
              z.object({ id: z.string(), export: z.object({ writeMode: z.string() }) }),
            ),
          }),
        })
        .parse(safeCatalog.structuredContent)
        .catalog.profiles.find((p) => p.id === destinationProfile.id)?.export.writeMode,
      'append',
    );
    assert.ok(!safeText.includes('metadata-test failure'));
    assert.ok(!safeText.includes('diagnostics'));
    assert.ok(!safeText.includes('synthetic-destination-key'));
    await assert.rejects(
      () => restricted.callTool({ name: 'get_phone_debug_logs', arguments: { deviceId } }),
      /not found/,
    );
    assert.ok(
      JSON.stringify(catalogResult).includes('metadata-test failure'),
      'The separately consented full endpoint retains metadata and raw errors',
    );
    assert.ok(JSON.stringify(catalogResult).includes('synthetic-destination-key'));
    const requestId = randomUUID();
    jobs.set(requestId, {
      id: requestId,
      subject: 'owner',
      deviceId,
      client: 'test-agent',
      expires: Date.now() + 60000,
      state: 'failed',
      query: {
        deviceId,
        profileId: 'private',
        domain: 'health',
        type: 'fixture',
        source: 'native',
        start: '2026-10-12T00:00:00Z',
        end: '2026-10-13T00:00:00Z',
        cursor: '',
        limit: 50,
        format: 'json',
        schema: 'myself.md.export.v1',
      },
      error: 'Phone adapter failed with Bearer synthetic-capture-secret',
    });
    const safeFailure = await restricted.callTool({
      name: 'get_phone_request',
      arguments: { requestId },
    });
    assert.ok(JSON.stringify(safeFailure).includes('Phone capture failed.'));
    assert.ok(!JSON.stringify(safeFailure).includes('synthetic-capture-secret'));
    const fullFailure = await owner.callTool({
      name: 'get_phone_request',
      arguments: { requestId },
    });
    assert.ok(JSON.stringify(fullFailure).includes('synthetic-capture-secret'));
  } finally {
    await restricted.close();
  }
  assert.ok(
    !(await owner.listTools()).tools.some((tool) => tool.name === 'request_phone_debug_content'),
    'Attachment-content tool is removed',
  );
  const profileForGrant = catalog.profiles[0];
  assert.ok(profileForGrant);
  profileForGrant.agentAccess = true;
  profileForGrant.selection.health = ['native:sleep'];
  const healthForGrant = catalog.domains.find((domain) => domain.domain === 'health');
  assert.ok(healthForGrant);
  healthForGrant.enabled = true;
  healthForGrant.types = ['native:sleep'];
  heartbeat(metadataReport);
  assert.deepEqual(
    (await read(owner)).structuredContent?.report,
    metadataReport,
    'Diagnostics remain metadata-only regardless of data grants',
  );
  profileForGrant.agentPermissions.health = false;
  heartbeat(metadataReport);
  const queryArguments = {
    deviceId,
    profileId: profileForGrant.id,
    domain: 'health',
    source: 'native',
    type: 'sleep',
    start: '2026-10-10T00:00:00Z',
    end: '2026-10-11T00:00:00Z',
    cursor: '',
    limit: 1,
    format: 'json',
  };
  assert.equal(
    (await owner.callTool({ name: 'query_phone_data', arguments: queryArguments })).isError,
    true,
    'Server rejects a source disabled for this profile',
  );
  const independentProfile = {
    ...profileForGrant,
    id: 'independent',
    agentPermissions: { ...profileForGrant.agentPermissions, health: true, logs: false },
  };
  catalog.profiles.push(independentProfile);
  heartbeat(metadataReport);
  assert.equal(
    (
      await owner.callTool({
        name: 'query_phone_data',
        arguments: { ...queryArguments, profileId: independentProfile.id },
      })
    ).isError,
    undefined,
    'Another profile retains its independent source grant',
  );
  assert.equal(
    (await read(owner, { deviceId, profileId: independentProfile.id })).structuredContent?.report,
    null,
    'An enabled source never implies App logs permission',
  );
  assert.equal(
    (await read(owner, { deviceId, profileId: profileForGrant.id })).structuredContent?.status,
    'available',
  );
  catalog.profiles.pop();
  heartbeat(metadataReport);
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
  assert.equal(lastPage?.logs.filter((log) => log.category !== 'app').length, 5);
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
        entries: [{ ...core.parseDebugEntry(legacyEntry), httpStatus: 999 }],
      }),
    /Too big/,
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
    'Debug logs: metadata-only capture, legacy attachment removal, SQLite persistence, bounded retention, partition isolation, real MCP reads, consent, revocation races, stale-phone denial and disconnect pass.',
  );
} finally {
  await Promise.all([owner.close(), other.close()]);
  db.close();
  billing.db.close();
  history.db.close();
}
