import { Directory, File, Paths } from 'expo-file-system';
import { domains } from '../core/data.js';
import { exportBasename, fileHeader, recordChunk, fileFooter } from '../core/export-files.js';
import { deliverExport } from './destinations.js';
import { catalog, readPage } from './data.js';
/** Stream a day into staging files; report source failures while preserving available records.
 * @param {import('./export-context.js').ExportContext} session @param {import('../core/profiles.js').ExportProfile} profile
 * @param {{day:string,start:string,end:string}} interval @param {()=>boolean} valid @param {(message:string)=>void} progress @param {(artifact:import('../core/history.js').HistoryArtifact)=>void} [onArtifact] */
export async function exportProfileDay(
  session,
  profile,
  interval,
  valid,
  progress,
  onArtifact = () => {},
) {
  const info = await catalog(session.owner, { health: true, time: true, location: true });
  if (!domains.some((d) => profile.selection[d].length))
    throw new Error('Select at least one data type.');
  const settings = profile.export;
  const root = new Directory(
    settings.destination === 'local' ? Paths.document : Paths.cache,
    settings.folderName,
    encodeURIComponent(session.deviceId),
    encodeURIComponent(profile.id),
  );
  root.create({ intermediates: true, idempotent: true });
  const files = settings.formats.map((format) => {
    const folder = settings.formatFolders ? new Directory(root, format) : root;
    folder.create({ intermediates: true, idempotent: true });
    const target = new File(folder, `${exportBasename(settings, interval.day)}.${format}`);
    const stage = new File(folder, `${exportBasename(settings, interval.day)}.${format}.partial`);
    stage.create({ overwrite: true });
    stage.write(fileHeader(format));
    return { format, target, stage };
  });
  let count = 0;
  const coverage = new Set();
  /** @type {unknown[]} */ const captures = [];
  /** @type {{domain:import('../core/data.js').Domain,type:string,source:string,message:string,recordCount:number}[]} */
  const failures = [];
  let completedSources = 0;
  try {
    for (const domain of domains)
      for (const key of profile.selection[domain]) {
        const source = key.startsWith('native:') ? 'native' : 'imported',
          type = key.slice(key.indexOf(':') + 1);
        if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
        if (!info.domains.find((v) => v.domain === domain)?.types.includes(key)) {
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
        let failed = false;
        let cursor = '';
        do {
          if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
          progress(`${interval.day}: ${type} · ${count} records`);
          /** @type {import('../core/data.js').DataPage} */ let page;
          try {
            // Pages depend on the previous cursor.
            // oxlint-disable-next-line eslint/no-await-in-loop
            page = await readPage(
              session.owner,
              {
                domain,
                type,
                source,
                start: interval.start,
                end: interval.end,
                cursor,
                limit: 5,
                format: 'json',
              },
              profile,
              false,
            );
          } catch (error) {
            if (!valid())
              throw new Error('Export cancelled: profile or schedule changed.', { cause: error });
            failures.push({
              domain,
              type,
              source,
              message: error instanceof Error ? error.message : 'Source could not be read.',
              recordCount: count - sourceStart,
            });
            failed = true;
            break;
          }
          for (const row of page.records) {
            for (const f of files)
              f.stage.write(recordChunk(f.format, row, count), { append: true });
            count++;
          }
          captures.push({ domain, type, source, capture: page.capture, warnings: page.warnings });
          for (const warning of page.warnings)
            coverage.add(`${interval.day}: ${type} · ${warning}`.slice(0, 2000));
          cursor = page.nextCursor ?? '';
        } while (cursor);
        if (!failed) completedSources++;
      }
    if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
    if (!completedSources && !count)
      throw new Error('No selected sources could be read. Review permissions or edit the profile.');
    const manifest = {
      schema: 'qr-connect.export.v1',
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
      f.stage.move(f.target, { overwrite: true });
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
        );
        onArtifact({
          day: interval.day,
          name: f.target.name,
          format: f.format,
          recordCount: count,
          bytes: f.target.size,
          uri: null,
          cloudId: delivered?.id ?? null,
          checksum: null,
          partial: failures.length > 0,
          warnings,
        });
        f.target.delete();
        continue;
      }
      saved.push(f.target.uri);
      if (f.format === 'jsonl') {
        const metadata = new File(
          f.target.parentDirectory,
          `${exportBasename(settings, interval.day)}.jsonl.manifest.json`,
        );
        const stagedMetadata = new File(metadata.parentDirectory, `${metadata.name}.partial`);
        stagedMetadata.write(JSON.stringify(manifest));
        stagedMetadata.move(metadata, { overwrite: true });
        saved.push(metadata.uri);
      }
      onArtifact({
        day: interval.day,
        name: f.target.name,
        format: f.format,
        recordCount: count,
        bytes: f.target.size,
        uri: f.target.uri,
        cloudId: null,
        checksum: f.target.md5,
        partial: failures.length > 0,
        warnings,
      });
    }
    return { count, files: saved, failedSources: failures.length };
  } finally {
    for (const f of files)
      if (f.stage.name.endsWith('.partial') && f.stage.exists) f.stage.delete();
  }
}
