import { useState } from 'react';
import { Row, Icon, Copy } from '../src/components/ui.js';
import { View } from 'react-native';
import { chooseExportFolder, exportFolder } from './export-folder.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { showToast } from '../src/components/Toast.js';
/** @param {{context:{owner:string,deviceId:string},settings:import('../core/export-files.js').ExportSettings,onSettings:(settings:import('../core/export-files.js').ExportSettings)=>void,disabled:boolean}} props */
export default function LocalExportFolder({ context, settings, onSettings, disabled }) {
  const [busy, setBusy] = useState(false);
  const folder = exportFolder(context, settings.localFolderId);
  const folderName =
    folder?.name ??
    (settings.localFolderId ? 'Choose folder again' : `App Documents/${settings.folderName}`);
  async function choose() {
    setBusy(true);
    try {
      const id = await chooseExportFolder(context, settings.localFolderId);
      onSettings({ ...settings, localFolderId: id });
    } catch (error) {
      // Cancelling a native picker leaves the draft unchanged.
      if (!/cancel/i.test(errorMessage(error)))
        showToast({ message: errorMessage(error), kind: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Row
        compact
        title="Folder"
        value={folderName}
        testID="export-choose-folder"
        disabled={disabled || busy}
        onPress={() => void choose()}
        trailing={<Icon name="folder-outline" />}
      />
      {settings.localFolderId && (
        <Row
          compact
          title="Use app folder"
          testID="export-reset-folder"
          disabled={disabled || busy}
          onPress={() => {
            const next = { ...settings };
            delete next.localFolderId;
            onSettings(next);
          }}
        />
      )}
      <Copy variant="caption" muted>
        Files save directly into your chosen folder. Save this profile to apply.
      </Copy>
    </View>
  );
}
