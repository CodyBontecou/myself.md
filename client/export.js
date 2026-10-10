import { errorJSON } from '../packages/support-chat/errors.js';
import { recordDebug } from './debug-log.js';
import { reserveExport, settleExport } from './billing.js';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { saveShareEvent } from './history.js';
import { catalog, readPage } from './data.js';
import { fileHeader, recordChunk, fileFooter } from '../core/export-files.js';
/** @param {import('./export-context.js').ExportContext} context @param {import('./library.js').Grants} grants @param {import('../core/data.js').Domain} domain @param {import('../core/profiles.js').ExportProfile} profile @param {number} days @param {(message:string)=>void} progress */
export async function shareDomain(context, grants, domain, profile, days, progress) {
  const owner = context.owner;
  const info = await catalog(owner, grants, profile);
  const types = info.domains.find((d) => d.domain === domain)?.types ?? [];
  if (!types.length)
    throw new Error('There is no readable data source yet. Enable source permissions.');
  const file = new File(
    Paths.cache,
    `myselfmd-${domain}-${Date.now()}.${profile.export.schema.split('.').at(-1)}.json`,
  );
  file.create();
  file.write(fileHeader('json', profile.export.schema));
  /** @type {unknown[]} */ const manifest = [];
  let count = 0;
  const end = new Date().toISOString(),
    start = new Date(Date.now() - days * 86400000).toISOString();
  /** @type {import('../core/history.js').HistoryEvent} */
  const event = {
    id: file.name,
    kind: 'export',
    schema: profile.export.schema,
    startedAt: end,
    updatedAt: end,
    status: 'running',
    actor: 'manual',
    client: null,
    target: 'share',
    destination: 'System share sheet',
    profile: {
      id: profile.id,
      name: profile.name,
      selection: JSON.parse(JSON.stringify(profile.selection)),
    },
    interval: { start, end },
    timezone: 'UTC',
    formats: ['json'],
    recordCount: null,
    artifacts: [],
    warnings: [],
    relatedId: null,
    error: null,
  };
  saveShareEvent(context, event);
  let produced = false;
  try {
    await reserveExport(context, event.id);
    for (const key of types) {
      const source = /** @type {const} */ ('native'),
        type = key.slice(key.indexOf(':') + 1);
      let cursor = '';
      try {
        do {
          progress(`Exporting ${type} · ${count} records`);
          // Each page depends on the preceding native cursor; queries cannot run in parallel.
          // oxlint-disable-next-line eslint/no-await-in-loop
          const page = await readPage(
            owner,
            {
              domain,
              type,
              source,
              start,
              end,
              cursor,
              limit: 5,
              format: 'json',
            },
            profile,
            false,
          );
          recordDebug(context, 'export', 'succeeded', {
            records: { domain, type, profileId: profile.id, values: page.records },
          });
          for (const row of page.records) {
            file.write(recordChunk('json', row, count, profile.export.schema), { append: true });
            count++;
          }
          manifest.push({ type, source, capture: page.capture, warnings: page.warnings });
          if (page.complete === false)
            event.warnings.push(`${type}: nested source detail could not be fully read.`);
          cursor = page.nextCursor ?? '';
        } while (cursor);
      } catch (error) {
        recordDebug(context, 'export', 'failed', { error });
        event.warnings.push(`${type}: source could not be fully read.`);
        manifest.push({
          type,
          source,
          capture: 'failed',
          error: errorJSON(error),
        });
      }
    }
    file.write(
      fileFooter('json', {
        schema: profile.export.schema,
        manifest,
        interval: { start, end },
        recordCount: count,
        status: event.warnings.length ? 'partial' : 'complete',
      }),
      { append: true },
    );
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this device.');
    event.recordCount = count;
    event.status = event.warnings.length ? 'partial' : 'complete';
    event.warnings.push(
      `This export includes only ${domain === 'time' ? 'screen time' : domain} data from the profile.`,
    );
    event.warnings.push(
      'The share sheet opened. The receiving app and final delivery cannot be confirmed. This temporary file is not retained.',
    );
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: `Export ${domain} data`,
    });
    produced = true;
    await settleExport(context, event.id, true);
    saveShareEvent(context, { ...event, updatedAt: new Date().toISOString() });
    return count;
  } catch (error) {
    recordDebug(context, 'export', 'failed', { error });
    await settleExport(context, event.id, produced).catch(() => {});
    saveShareEvent(context, {
      ...event,
      status: 'failed',
      error: 'The file could not be generated or shared.',
      updatedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    file.delete();
  }
}
