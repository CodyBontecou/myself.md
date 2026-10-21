import { Linking, StyleSheet, View } from 'react-native';
import { Copy, Divider, Row } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
import { Checkbox, Text } from './Terminal.js';
import { captureLocation } from './location-task.js';

/** @param {{data:ReturnType<typeof import('./DataPanel.js').usePhoneData>}} props */
export default function LocationSettings({ data }) {
  const { colors } = useTheme();
  const {
    session,
    busy,
    isTracking,
    locationInfo,
    message,
    run,
    changeRecording,
    setMessage,
    publish,
    refreshLocation,
  } = data;
  return (
    <View testID="source-location-screen" collapsable={false} style={styles.container}>
      <View>
        <Row
          title="Background recording"
          subtitle="Save points while your phone is locked."
          trailing={
            <Checkbox
              testID="source-location-recording"
              accessibilityLabel="Record location in background"
              value={isTracking}
              disabled={busy}
              onValueChange={(enabled) => void run(() => changeRecording(enabled))}
            />
          }
        />
        <Divider />
      </View>
      <Copy testID="source-location-summary" variant="caption" muted selectable>
        {locationInfo}
      </Copy>
      <View>
        <Row
          testID="source-location-location-permissions"
          title="Location permissions"
          disabled={busy}
          onPress={() => void run(() => Linking.openSettings())}
        />
        <Divider />
        <Row
          testID="source-location-location-capture"
          title="Save location point"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await captureLocation(session.owner);
              setMessage('Recorded one location point on this phone.');
              await publish();
              await refreshLocation();
            })
          }
        />
        <Divider />
      </View>
      <Copy variant="caption" muted>
        Points stay on this phone. Recording is optional and uses battery. Location history from
        before recording started is unavailable.
      </Copy>
      <Text
        testID="source-status"
        accessibilityState={{ busy }}
        accessibilityLiveRegion="polite"
        style={[styles.status, { color: colors.secondary }]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  status: { fontSize: 13, lineHeight: 19 },
});
