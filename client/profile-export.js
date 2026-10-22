import { errorJSON } from '../packages/support-chat/errors.js';
import { recordDebug } from './debug-log.js';
import { Directory, File, Paths } from 'expo-file-system';
import { domains } from '../core/data.js';
import {
  deliveredFormats,
  exportBasename,
  fileHeader,
  recordChunk,
  fileFooter,
} from '../core/export-files.js';
import { saveInExportFolder } from './export-folder.js';
import { deliverExport } from './destinations.js';
import { catalog, readPage } from './data.js';
/** Stream a day into staging files; report source failures while preserving available records.
 * @param {import('./export-context.js').ExportContext} session @param {import('../core/profiles.js').ExportProfile} profile
 * @param {{day:string,start:string,end:string}} interval @param {()=>boolean} valid @param {(message:string)=>void} progress @param {(artifact:import('../core/history.js').HistoryArtifact)=>void} [onArtifact] @param {string} [billingOperationId] @param {(force?:boolean)=>Promise<void>} [check] @param {import('./destinations.js').DestinationCredential|null} [cloudAuthorization] */
export async function exportProfileDay(
  session,
  profile,
  interval,
  valid,
  progress,
  onArtifact = () => {},
  billingOperationId = '',
  check = async () => {},
  cloudAuthorization = null,
) {
  const info = await catalog(session.owner, { health: true, time: true, location: true });
  if (!domains.some((d) => profile.selection[d].length))
    throw new Error('Select at least one data type.');
  const settings = profile.export;
  const root = new Directory(
    Paths.cache,
    settings.folderName,
    encodeURIComponent(session.deviceId),
    encodeURIComponent(profile.id),
  );
  root.create({ intermediates: true, idempotent: true });
  const files = deliveredFormats(settings).map((format) => {
    const folder = settings.formatFolders ? new Directory(root, format) : root;
    folder.create({ intermediates: true, idempotent: true });
    const target = new File(folder, `${exportBasename(settings, interval.day)}.${format}`);
    const stage = new File(folder, `${exportBasename(settings, interval.day)}.${format}.partial`);
    stage.create({ overwrite: true });
    stage.write(fileHeader(format, settings.schema));
    return { format, target, stage };
  });
  let count = 0;
  let lastSourceProgress = -Infinity;
  const coverage = new Set();
  /** @type {unknown[]} */ const captures = [];
  /** @type {{domain:import('../core/data.js').Domain,type:string,source:string,message:string,recordCount:number}[]} */
  const failures = [];
  let completedSources = 0;
  /** @typedef {{kind:'page',page:import('../core/data.js').DataPage}|{kind:'provider'|'fatal',error:unknown}} PrefetchedPage */
  /** @type {Map<string,Promise<PrefetchedPage>>} */
  const prefetched = new Map();
  const whoop = profile.selection.health.filter(
    (key) =>
      key.startsWith('native:whoop.') &&
      info.domains.find((v) => v.domain === 'health')?.types.includes(key),
  );
  let nextWhoop = 0;
  let stopped = false;
  /** @type {{fatal:{error:unknown}|null}} */
  const pendingState = { fatal: null };
  function checkPrefetchFailure() {
    if (pendingState.fatal) throw pendingState.fatal.error;
  }
  /** @param {import('../core/data.js').Domain} domain @param {string} type @param {string} cursor */
  const readSourcePage = (domain, type, cursor) =>
    readPage(
      session.owner,
      {
        domain,
        type,
        source: 'native',
        start: interval.start,
        end: interval.end,
        cursor,
        limit: 50,
        format: 'json',
      },
      profile,
      false,
    );
  // Keep at most three selected provider sources in flight, including the source being consumed.
  // Native Health and usage reads retain their existing sequential execution.
  function fillWhoop() {
    if (stopped || pendingState.fatal) return;
    while (prefetched.size < 3 && nextWhoop < whoop.length) {
      const key = whoop[nextWhoop++];
      if (!key) break;
      /** @returns {Promise<PrefetchedPage>} */
      const pending = async () => {
        try {
          await check(false);
          checkPrefetchFailure();
          if (stopped || !valid())
            throw new Error('Export cancelled: profile or schedule changed.');
          try {
            return { kind: 'page', page: await readSourcePage('health', key.slice(7), '') };
          } catch (error) {
            return { kind: 'provider', error };
          }
        } catch (error) {
          pendingState.fatal ??= { error };
          return { kind: 'fatal', error };
        }
      };
      prefetched.set(key, pending());
    }
  }
  try {
    fillWhoop();
    for (const domain of domains)
      for (const key of profile.selection[domain]) {
        const source = /** @type {const} */ ('native'),
          type = key.slice(key.indexOf(':') + 1);
        if (!info.domains.find((v) => v.domain === domain)?.types.includes(key)) {
          if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
          failures.push({
            domain,
            type,
            source,
            message: 'Source unavailable. Review permissions or edit the profile.',
            recordCount: 0,
          });
          continue;
        }
        const sourceStart = count;
        const hadPrefetch = prefetched.has(key);
        let failed = false;
        let cursor = '';
        do {
          if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
          // Local validity runs every page; remote read checks may reuse a short-lived success.
          // oxlint-disable-next-line eslint/no-await-in-loop
          await check(false);
          checkPrefetchFailure();
          const now = Date.now();
          if (now - lastSourceProgress >= 100) {
            progress(`${interval.day}: ${type} · ${count} records`);
            lastSourceProgress = now;
          }
          // A provider failure is reported only when its original source position is reached.
          // Remote validity failures abort the entire operation rather than becoming partial data.
          const pending = cursor ? null : prefetched.get(key);
          // oxlint-disable-next-line eslint/no-await-in-loop -- Consume prefetched pages in profile order.
          const queued = pending ? await pending : null;
          if (pending) prefetched.delete(key);
          if (queued?.kind === 'fatal') throw queued.error;
          /** @type {import('../core/data.js').DataPage} */ let page;
          try {
            if (queued?.kind === 'provider') throw queued.error;
            if (queued?.kind === 'page') page = queued.page;
            else {
              // Pages depend on the previous cursor.
              // oxlint-disable-next-line eslint/no-await-in-loop
              page = await readSourcePage(domain, type, cursor);
            }
            recordDebug(session, 'export', 'succeeded');
          } catch (error) {
            recordDebug(session, 'export', 'failed', { error });
            if (!valid())
              throw new Error('Export cancelled: profile or schedule changed.', { cause: error });
            failures.push({
              domain,
              type,
              source,
              message: errorJSON(error),
              recordCount: count - sourceStart,
            });
            failed = true;
            break;
          }
          checkPrefetchFailure();
          if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
          // Bound serialization to one provider page and cross the native file boundary once.
          if (page.records.length)
            for (const f of files)
              f.stage.write(
                page.records
                  .map((row, index) => recordChunk(f.format, row, count + index, settings.schema))
                  .join(''),
                { append: true },
              );
          count += page.records.length;
          if (page.complete === false && !failed) {
            failed = true;
            failures.push({
              domain,
              type,
              source,
              message:
                'Nested source detail could not be fully read. Inspect record captureFailures.',
              recordCount: page.records.length,
            });
          }
          captures.push({ domain, type, source, capture: page.capture, warnings: page.warnings });
          for (const warning of page.warnings)
            coverage.add(`${interval.day}: ${type} · ${warning}`.slice(0, 2000));
          cursor = page.nextCursor ?? '';
        } while (cursor);
        if (!failed) completedSources++;
        if (hadPrefetch) fillWhoop();
      }
    checkPrefetchFailure();
    if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
    if (!completedSources && !count)
      throw new Error('No selected sources could be read. Review permissions or edit the profile.');
    const manifest = {
      schema: settings.schema,
      billingOperationId,
      profileId: profile.id,
      profileName: profile.name,
      interval,
      recordCount: count,
      captures,
      status: failures.length ? 'partial' : 'complete',
      failures,
      exportedAt: new Date().toISOString(),
    };
    for (const failure of failures)
      coverage.add(`${interval.day}: ${failure.type} · Source could not be fully read.`);
    const warnings = [...coverage].slice(0, 100);
    const saved = [];
    for (const f of files) {
      f.stage.write(fileFooter(f.format, manifest), { append: true });
      // Expo 57 moves asynchronously; metadata and delivery require the committed file.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await f.stage.move(f.target, { overwrite: true });
      const bytes = f.target.size;
      if (!Number.isSafeInteger(bytes) || bytes < 0)
        throw new Error('Could not read export file size.');
      // Revalidate before publishing each file, including after slow native reads.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await check();
      checkPrefetchFailure();
      if (!valid()) throw new Error('Export cancelled: profile changed.');
      if (settings.destination !== 'local') {
        // Destinations acknowledge each complete daily file before progress advances.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const delivered = await deliverExport(
          session,
          profile,
          f.target,
          f.format,
          manifest,
          valid,
          cloudAuthorization,
        );
        onArtifact({
          day: interval.day,
          name: f.target.name,
          format: f.format,
          schema: settings.schema,
          recordCount: delivered?.recordCount ?? count,
          bytes: delivered?.bytes ?? bytes,
          uri: null,
          cloudId: delivered?.id ?? null,
          checksum: null,
          partial: delivered?.partial ?? failures.length > 0,
          warnings,
        });
        f.target.delete();
        continue;
      }
      let appended = false;
      // oxlint-disable-next-line eslint/no-await-in-loop
      const localFile = await saveInExportFolder(session, profile, f.target, f.format, {
        onAppend: () => {
          appended = true;
        },
      });
      if (!localFile) {
        progress(`${interval.day}: existing ${f.format.toUpperCase()} file skipped.`);
        f.target.delete();
        continue;
      }
      saved.push(localFile.uri);
      if (f.format === 'jsonl') {
        const metadata = new File(
          f.target.parentDirectory,
          `${exportBasename(settings, interval.day)}.jsonl.manifest.json`,
        );
        const stagedMetadata = new File(metadata.parentDirectory, `${metadata.name}.partial`);
        stagedMetadata.write(JSON.stringify(manifest));
        // oxlint-disable-next-line eslint/no-await-in-loop
        await stagedMetadata.move(metadata, { overwrite: true });
        // oxlint-disable-next-line eslint/no-await-in-loop
        const localMetadata = await saveInExportFolder(session, profile, metadata, f.format, {
          filename: `${localFile.name}.manifest.json`,
          writeMode: appended ? 'append' : 'replace',
        });
        if (localMetadata) saved.push(localMetadata.uri);
        metadata.delete();
      }
      onArtifact({
        day: interval.day,
        name: localFile.name,
        format: f.format,
        schema: settings.schema,
        recordCount: count,
        bytes: localFile.size,
        uri: localFile.uri,
        cloudId: null,
        checksum: localFile.md5,
        partial: failures.length > 0,
        warnings,
      });
      f.target.delete();
    }
    return {
      count,
      files: saved,
      failedSources: new Set(failures.map((failure) => `${failure.domain}:${failure.type}`)).size,
    };
  } finally {
    stopped = true;
    prefetched.clear();
    for (const f of files)
      if (f.stage.name.endsWith('.partial') && f.stage.exists) f.stage.delete();
  }
}
