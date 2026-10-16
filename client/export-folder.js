import { appendExportContent } from '../core/export-files.js';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { phoneDatabase } from './phone-database.js';
import { qaEnabled } from './qa-runtime.js';
const db = phoneDatabase();
db.execSync(
  'CREATE TABLE IF NOT EXISTS export_folders (owner TEXT, device TEXT, id TEXT, name TEXT, uri TEXT, bookmark TEXT, PRIMARY KEY(owner,device,id))',
);
/** @typedef {{owner:string,deviceId:string}} Context */
/** @typedef {{id:string,name:string,uri:string,bookmark:string|null}} Folder */
/** @type {{bookmark:(uri:string)=>Promise<string>,restore:(bookmark:string)=>Promise<{uri:string,bookmark:string}>}|null} */
const native = requireOptionalNativeModule('ExportFolder');
/** Device-local grants are never accepted from an imported profile or agent-supplied URI.
 * @param {Context} context @param {string|undefined} id @returns {Folder|null} */
export function exportFolder(context, id) {
  if (!id) return null;
  return /** @type {Folder|null} */ (
    db.getFirstSync(
      'SELECT id,name,uri,bookmark FROM export_folders WHERE owner=? AND device=? AND id=?',
      context.owner,
      context.deviceId,
      id,
    )
  );
}
/** @param {Context} context @param {string|undefined} previous */
export async function chooseExportFolder(context, previous) {
  if (qaEnabled)
    throw new Error(
      'Folder selection requires a normal build. QA fixtures cannot grant file access.',
    );
  if (Platform.OS === 'ios' && !native)
    throw new Error('Install the updated app to choose an export folder.');
  const directory = await Directory.pickDirectoryAsync(exportFolder(context, previous)?.uri);
  const bookmark = Platform.OS === 'ios' ? await native?.bookmark(directory.uri) : null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.runSync(
    'INSERT INTO export_folders VALUES (?,?,?,?,?,?)',
    context.owner,
    context.deviceId,
    id,
    directory.name || 'Selected folder',
    directory.uri,
    bookmark ?? null,
  );
  return id;
}
/** @param {Context} context @param {string} id */
async function selectedDirectory(context, id) {
  const folder = exportFolder(context, id);
  if (!folder || qaEnabled) throw new Error('Choose the export folder again on this phone.');
  let uri = folder.uri;
  if (Platform.OS === 'ios') {
    if (!native || !folder.bookmark)
      throw new Error('Choose the export folder again on this phone.');
    const restored = await native.restore(folder.bookmark);
    uri = restored.uri;
    db.runSync(
      'UPDATE export_folders SET uri=?,bookmark=? WHERE owner=? AND device=? AND id=?',
      uri,
      restored.bookmark,
      context.owner,
      context.deviceId,
      id,
    );
  }
  const directory = new Directory(uri);
  if (!directory.exists) throw new Error('Export folder is unavailable. Choose the folder again.');
  return directory;
}
/** Commit a completed local export using the profile's conflict policy.
 * @param {Context} context @param {import('../core/profiles.js').ExportProfile} profile
 * @param {File} file @param {string} format
 * @param {{filename?:string,writeMode?:import('../core/export-files.js').ExportWriteMode,onAppend?:()=>void}} [options]
 * @returns {Promise<File|null>} */
export async function saveInExportFolder(context, profile, file, format, options = {}) {
  const filename = options.filename ?? file.name;
  const writeMode = options.writeMode ?? profile.export.writeMode ?? 'replace';
  let directory;
  if (profile.export.localFolderId) {
    directory = await selectedDirectory(context, profile.export.localFolderId);
    if (profile.export.formatFolders) {
      const existing = directory
        .list()
        .find((item) => item instanceof Directory && item.name === format);
      directory = existing instanceof Directory ? existing : directory.createDirectory(format);
    }
  } else {
    directory = new Directory(
      Paths.document,
      profile.export.folderName,
      encodeURIComponent(context.deviceId),
      encodeURIComponent(profile.id),
      ...(profile.export.formatFolders ? [format] : []),
    );
    directory.create({ intermediates: true, idempotent: true });
  }
  const entries = directory.list();
  const find = (/** @type {string} */ name) => entries.find((item) => item.name === name);
  let name = filename;
  const metadata = name.endsWith('.manifest.json');
  if (writeMode === 'new_file' && !metadata) {
    const extension = name.lastIndexOf('.');
    const base = name.slice(0, extension),
      suffix = name.slice(extension);
    let number = 1;
    const occupied = (/** @type {string} */ candidate) =>
      find(candidate) || (format === 'jsonl' && find(`${candidate}.manifest.json`));
    while (occupied(name)) {
      name = `${base} (${number++})${suffix}`;
    }
  }
  const existing = find(name);
  if (existing instanceof Directory)
    throw new Error('A folder already uses this export filename. Choose another filename.');
  if (existing instanceof File && writeMode === 'skip') return null;
  let content = null;
  if (existing instanceof File && writeMode === 'append') {
    // Bound memory before loading either complete structured document.
    if (existing.size + file.size > 32 * 1024 * 1024)
      throw new Error('Append is limited to 32 MB. Choose Create a new file or Replace.');
    if (format === 'jsonl' && !metadata) {
      const sidecar = find(`${name}.manifest.json`);
      if (!(sidecar instanceof File))
        throw new Error(
          'Cannot append JSONL without its export manifest. Choose Create a new file.',
        );
      if (sidecar.size > 32 * 1024 * 1024)
        throw new Error('Append manifest exceeds 32 MB. Choose Create a new file.');
      const manifestText = await sidecar.text();
      const manifest = JSON.parse(manifestText);
      // Validate the sidecar before committing any appended data.
      appendExportContent(
        manifestText,
        JSON.stringify({ schema: profile.export.schema, recordCount: 0 }),
        'manifest',
      );
      if (manifest.schema !== profile.export.schema)
        throw new Error('Cannot append files with different export schemas.');
    }
    content = appendExportContent(
      await existing.text(),
      await file.text(),
      metadata ? 'manifest' : format === 'jsonl' ? 'jsonl' : 'json',
    );
  }
  const target =
    existing instanceof File
      ? existing
      : directory.createFile(
          name,
          format === 'jsonl' && !metadata ? 'application/x-ndjson' : 'application/json',
        );
  if (content !== null) {
    // Prepare and parse before touching an existing file.
    const staged = new File(
      Paths.cache,
      `append-${Date.now()}-${Math.random().toString(36).slice(2)}.partial`,
    );
    try {
      staged.write(content);
      await staged.copy(target, { overwrite: true });
      if (target.size !== staged.size)
        throw new Error('Export folder write was incomplete. Retry the export.');
    } finally {
      if (staged.exists) staged.delete();
    }
  } else {
    await file.copy(target, { overwrite: true });
    if (target.size !== file.size)
      throw new Error('Export folder write was incomplete. Retry the export.');
  }
  if (content !== null) options.onAppend?.();
  return target;
}

/** @param {Context} context @param {import('../core/export-files.js').ExportSettings} settings */
function exportFolderName(context, settings) {
  return (
    exportFolder(context, settings.localFolderId)?.name ??
    (settings.localFolderId ? 'Choose folder again' : `App Documents/${settings.folderName}`)
  );
}

/** Safe discovery excludes raw URLs and OS bookmarks.
 * @param {Context} context @param {import('../core/profiles.js').ExportProfile} profile */
export function exportFolderStatus(context, profile) {
  const folder = exportFolder(context, profile.export.localFolderId);
  return {
    status: profile.export.localFolderId ? (folder ? 'selected' : 'needs_selection') : 'default',
    name: exportFolderName(context, profile.export),
    requiresUser: true,
    deepLink: `myselfmd://profiles/${encodeURIComponent(profile.id)}`,
    instructions:
      'Open Output → Folders → Folder, choose a folder in the system picker, then Save. Folder access can only be granted on the phone. Exports save directly into the chosen folder, with format subfolders only when enabled. Verify the next catalog and completed export history.',
  };
}
