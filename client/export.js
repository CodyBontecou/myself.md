import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { catalog, readPage } from './data.js';
/** @param {string} owner @param {import('./library.js').Grants} grants @param {import('../core/data.js').Domain} domain @param {import('../core/profiles.js').ExportProfile} profile @param {number} days @param {(message:string)=>void} progress */
export async function shareDomain(owner, grants, domain, profile, days, progress) {
  const info = await catalog(owner, grants, profile);
  const types = info.domains.find((d) => d.domain === domain)?.types ?? [];
  if (!types.length)
    throw new Error(
      'There is no readable data source yet. Enable permissions or import an archive.',
    );
  const file = new File(Paths.cache, `qr-connect-${domain}-${Date.now()}.json`);
  file.create();
  file.write('{"schema":"qr-connect.export.v1","records":[');
  /** @type {unknown[]} */ const manifest = [];
  let count = 0;
  const end = new Date().toISOString(),
    start = new Date(Date.now() - days * 86400000).toISOString();
  try {
    for (const key of types) {
      const source = key.startsWith('native:') ? 'native' : 'imported',
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
          for (const row of page.records) {
            file.write((count ? ',' : '') + JSON.stringify(row), { append: true });
            count++;
          }
          manifest.push({ type, source, capture: page.capture, warnings: page.warnings });
          cursor = page.nextCursor ?? '';
        } while (cursor);
      } catch (error) {
        manifest.push({
          type,
          source,
          capture: 'failed',
          error: error instanceof Error ? error.message : 'Read failed.',
        });
      }
    }
    file.write(
      `],"manifest":${JSON.stringify(manifest)},"interval":${JSON.stringify({ start, end })},"recordCount":${count}}`,
      { append: true },
    );
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: `Export ${domain} data`,
    });
    return count;
  } finally {
    file.delete();
  }
}
