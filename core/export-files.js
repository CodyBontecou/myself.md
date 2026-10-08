/** @typedef {'json'|'jsonl'} ExportFormat */
/** @typedef {{formats:ExportFormat[],lookbackDays:number,includeToday:boolean,folderName:string,filenameTemplate:string,formatFolders:boolean,destination:'local'|'http'|'cloud',httpUrl:string|null}} ExportSettings */
/** @param {unknown} value @returns {ExportSettings} */
export function parseExportSettings(value) {
  const s = /** @type {Record<string,unknown>} */ (value ?? {});
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid export settings.');
  const formats = s.formats ?? ['json'],
    lookbackDays = s.lookbackDays ?? 7,
    folderName = s.folderName ?? 'Exports',
    filenameTemplate = s.filenameTemplate ?? '{date}';
  if (
    !Array.isArray(formats) ||
    !formats.length ||
    formats.length > 2 ||
    formats.some((f) => f !== 'json' && f !== 'jsonl')
  )
    throw new Error('Choose JSON, JSONL or both.');
  if (
    typeof lookbackDays !== 'number' ||
    !Number.isInteger(lookbackDays) ||
    lookbackDays < 1 ||
    lookbackDays > 30
  )
    throw new Error('Choose 1–30 completed days.');
  if (
    typeof folderName !== 'string' ||
    !folderName.trim() ||
    folderName.length > 64 ||
    !/^[\w -]+$/.test(folderName)
  )
    throw new Error('Use a folder name with letters, numbers, spaces, hyphens or underscores.');
  if (
    typeof filenameTemplate !== 'string' ||
    filenameTemplate.length > 100 ||
    !/^[\w{} -]+$/.test(filenameTemplate) ||
    filenameTemplate.replace(/\{(date|year|month|day)\}/g, '').includes('{') ||
    filenameTemplate.replace(/\{(date|year|month|day)\}/g, '').includes('}') ||
    !(
      filenameTemplate.includes('{date}') ||
      ['{year}', '{month}', '{day}'].every((t) => filenameTemplate.includes(t))
    )
  )
    throw new Error('Filenames must include {date} or {year}, {month} and {day}; no paths.');
  for (const key of ['includeToday', 'formatFolders'])
    if (s[key] !== undefined && typeof s[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
  const destination = s.destination ?? 'local',
    httpUrl = s.httpUrl ?? null;
  if (!['local', 'http', 'cloud'].includes(String(destination)))
    throw new Error('Choose local, HTTP or cloud export.');
  if (
    httpUrl !== null &&
    (typeof httpUrl !== 'string' || httpUrl.length > 2048 || !/^https:\/\/[^\s@#]+$/.test(httpUrl))
  )
    throw new Error('HTTP destinations require an HTTPS URL without credentials or fragments.');
  if (destination === 'http' && !httpUrl) throw new Error('Enter an HTTPS destination URL.');
  return {
    destination: /** @type {ExportSettings['destination']} */ (destination),
    httpUrl: /** @type {string|null} */ (httpUrl),
    formats: [...new Set(/** @type {ExportFormat[]} */ (formats))],
    lookbackDays,
    folderName: folderName.trim(),
    filenameTemplate,
    includeToday: s.includeToday === true,
    formatFolders: s.formatFolders === true,
  };
}
/** @param {ExportSettings} settings @param {string} day */
export function exportBasename(settings, day) {
  const [year = '', month = '', date = ''] = day.split('-');
  return settings.filenameTemplate
    .replaceAll('{date}', day)
    .replaceAll('{year}', year)
    .replaceAll('{month}', month)
    .replaceAll('{day}', date);
}
/** @param {ExportFormat} format */
export function fileHeader(format) {
  return format === 'json' ? '{"schema":"qr-connect.export.v1","records":[' : '';
}
/** @param {ExportFormat} format @param {import('./data.js').DataRecord} record @param {number} count */
export function recordChunk(format, record, count) {
  return (
    (format === 'json' && count > 0 ? ',' : '') +
    JSON.stringify(record) +
    (format === 'jsonl' ? '\n' : '')
  );
}
/** @param {ExportFormat} format @param {Record<string,unknown>} manifest */
export function fileFooter(format, manifest) {
  const metadata = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'schema'));
  return format === 'json' ? `],${JSON.stringify(metadata).slice(1)}` : '';
}
