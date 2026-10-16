import { defaultExportSchema, parseExportSchema, serializeExportRecord } from './export-schemas.js';
/** @typedef {'json'|'jsonl'} ExportFormat */
/** @typedef {'replace'|'append'|'new_file'|'skip'} ExportWriteMode */
/** @typedef {{writeMode?:ExportWriteMode,schema:import('./export-schemas.js').ExportSchema,formats:ExportFormat[],localFolderId?:string,lookbackDays:number,includeToday:boolean,folderName:string,filenameTemplate:string,formatFolders:boolean,destination:'local'|'http'|'cloud',httpUrl:string|null}} ExportSettings */
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
  if (
    s.localFolderId !== undefined &&
    (typeof s.localFolderId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(s.localFolderId))
  )
    throw new Error('Invalid local folder selection. Choose a folder on the phone.');
  const writeMode = s.writeMode ?? 'replace';
  if (!['replace', 'append', 'new_file', 'skip'].includes(String(writeMode)))
    throw new Error('Choose replace, append, create a new file or skip.');
  return {
    writeMode: /** @type {ExportWriteMode} */ (writeMode),
    ...(typeof s.localFolderId === 'string' ? { localFolderId: s.localFolderId } : {}),
    schema: parseExportSchema(s.schema),
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
/** Cloud stores one JSONL file per day; local and HTTP destinations write every selected format.
 * @param {ExportSettings} settings @returns {ExportFormat[]} */
export function deliveredFormats(settings) {
  return settings.destination === 'cloud' ? ['jsonl'] : settings.formats;
}
/** @param {ExportSettings} settings @param {string} day */
export function exportBasename(settings, day) {
  const [year = '', month = '', date = ''] = day.split('-');
  return (
    settings.filenameTemplate
      .replaceAll('{date}', day)
      .replaceAll('{year}', year)
      .replaceAll('{month}', month)
      .replaceAll('{day}', date) + `.${parseExportSchema(settings.schema).split('.').at(-1)}`
  );
}
/** @param {ExportFormat} format @param {import('./export-schemas.js').ExportSchema} [schema] */
export function fileHeader(format, schema = defaultExportSchema) {
  parseExportSchema(schema);
  return format === 'json' ? `{"schema":${JSON.stringify(schema)},"records":[` : '';
}
/** @param {ExportFormat} format @param {import('./data.js').DataRecord} record @param {number} count @param {import('./export-schemas.js').ExportSchema} [schema] */
export function recordChunk(format, record, count, schema = defaultExportSchema) {
  return (
    (format === 'json' && count > 0 ? ',' : '') +
    serializeExportRecord(record, schema) +
    (format === 'jsonl' ? '\n' : '')
  );
}
/** @param {ExportFormat} format @param {Record<string,unknown>} manifest */
export function fileFooter(format, manifest) {
  parseExportSchema(manifest.schema);
  const metadata = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'schema'));
  return format === 'json'
    ? Object.keys(metadata).length
      ? `],${JSON.stringify(metadata).slice(1)}`
      : ']}'
    : '';
}

/** Local file conflict choices shared by profile UI and validated export settings. */
export const exportWriteModes = [
  {
    value: 'replace',
    title: 'Replace matching file',
    description: 'Replace the existing file with the latest export.',
  },
  {
    value: 'append',
    title: 'Append to matching file',
    description: 'Add records to the existing file. Repeated exports may duplicate records.',
  },
  {
    value: 'new_file',
    title: 'Create a new file',
    description: 'Keep existing files and add a numbered suffix to the new filename.',
  },
  {
    value: 'skip',
    title: 'Skip existing file',
    description: 'Keep the existing file and export only missing files.',
  },
];
/** Append structured exports without producing concatenated invalid JSON documents.
 * @param {string} existing @param {string} incoming @param {'json'|'jsonl'|'manifest'} format */
export function appendExportContent(existing, incoming, format) {
  if (format === 'jsonl') {
    for (const line of (existing + '\n' + incoming).split('\n')) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      if (!record || typeof record !== 'object' || Array.isArray(record))
        throw new Error('Cannot append: the existing JSONL file contains invalid records.');
    }
    return existing + (existing && !existing.endsWith('\n') ? '\n' : '') + incoming;
  }
  const previous = JSON.parse(existing),
    next = JSON.parse(incoming);
  if (!previous || !next || previous.schema !== next.schema || typeof next.schema !== 'string')
    throw new Error('Cannot append files with different export schemas.');
  for (const document of [previous, next]) {
    if (
      (document.recordCount !== undefined &&
        (!Number.isSafeInteger(document.recordCount) || document.recordCount < 0)) ||
      (document.captures !== undefined && !Array.isArray(document.captures)) ||
      (document.failures !== undefined && !Array.isArray(document.failures))
    )
      throw new Error('Cannot append: the existing export metadata is invalid.');
  }
  const merged = {
    ...previous,
    ...next,
    recordCount:
      (previous.recordCount ?? previous.records?.length ?? 0) +
      (next.recordCount ?? next.records?.length ?? 0),
    captures: [...(previous.captures ?? []), ...(next.captures ?? [])],
    failures: [...(previous.failures ?? []), ...(next.failures ?? [])],
    status: previous.status === 'partial' || next.status === 'partial' ? 'partial' : next.status,
  };
  if (format === 'json') {
    if (!Array.isArray(previous.records) || !Array.isArray(next.records))
      throw new Error('Cannot append: the existing JSON file has no records array.');
    merged.records = [...previous.records, ...next.records];
    merged.recordCount = merged.records.length;
  }
  return JSON.stringify(merged);
}
