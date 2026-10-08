import { Directory, File, Paths } from 'expo-file-system';
import { domains } from '../core/data.js';
import { exportBasename, fileHeader, recordChunk, fileFooter } from '../core/export-files.js';
import { deliverExport } from './destinations.js';
import { catalog, readPage } from './data.js';
/** Stream a complete day into staging files; publish only after all selected sources succeed.
 * @param {import('./export-context.js').ExportContext} session @param {import('../core/profiles.js').ExportProfile} profile
 * @param {{day:string,start:string,end:string}} interval @param {()=>boolean} valid @param {(message:string)=>void} progress */
export async function exportProfileDay(session, profile, interval, valid, progress) {
  const info = await catalog(session.owner, { health: true, time: true, location: true });
  if (!domains.some((d) => profile.selection[d].length))
    throw new Error('Select at least one data type.');
  for (const d of domains)
    for (const key of profile.selection[d])
      if (!info.domains.find((v) => v.domain === d)?.types.includes(key))
        throw new Error(
          `Unavailable selected source: ${d} ${key}. Enable permissions or edit the profile.`,
        );
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
  /** @type {unknown[]} */ const captures = [];
  try {
    for (const domain of domains)
      for (const key of profile.selection[domain]) {
        const source = key.startsWith('native:') ? 'native' : 'imported',
          type = key.slice(key.indexOf(':') + 1);
        let cursor = '';
        do {
          if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
          progress(`${interval.day}: ${type} · ${count} records`);
          // Pages depend on the previous cursor.
          // oxlint-disable-next-line eslint/no-await-in-loop
          const page = await readPage(
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
          for (const row of page.records) {
            for (const f of files)
              f.stage.write(recordChunk(f.format, row, count), { append: true });
            count++;
          }
          captures.push({ domain, type, source, capture: page.capture, warnings: page.warnings });
          cursor = page.nextCursor ?? '';
        } while (cursor);
      }
    if (!valid()) throw new Error('Export cancelled: profile or schedule changed.');
    const manifest = {
      schema: 'qr-connect.export.v1',
      profileId: profile.id,
      profileName: profile.name,
      interval,
      recordCount: count,
      captures,
      exportedAt: new Date().toISOString(),
    };
    const saved = [];
    for (const f of files) {
      f.stage.write(fileFooter(f.format, manifest), { append: true });
      f.stage.move(f.target, { overwrite: true });
      if (settings.destination !== 'local') {
        // Destinations acknowledge each complete daily file before progress advances.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await deliverExport(session, profile, f.target, f.format, manifest, valid);
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
    }
    return { count, files: saved };
  } finally {
    for (const f of files)
      if (f.stage.name.endsWith('.partial') && f.stage.exists) f.stage.delete();
  }
}
