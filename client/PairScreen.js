import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { Stack } from 'expo-router';
import { Screen, Copy, Group, Row, Button, Icon, Notice } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { usePhone } from './PhoneProvider';
export default function PairScreen() {
  const { colors } = useTheme();
  const {
    session,
    connected,
    permission,
    requestPermission,
    pairing,
    busy,
    error,
    link,
    setLink,
    scan,
    confirm,
    refresh,
    disconnect,
    run,
    reset,
    changeAccount,
    switchConnection,
    signIn,
  } = usePhone();
  return (
    <Screen>
      <Stack.Screen options={{ title: connected ? 'Your agent' : 'Connect agent' }} />
      {connected ? (
        <>
          <Copy variant="heading">Your phone is connected</Copy>
          <Group>
            <Row title="Account" subtitle={session?.account} />
            <Row title="Server" subtitle={session?.server} />
          </Group>
          <Button
            label="Check connection"
            secondary
            disabled={busy}
            onPress={() => void run(refresh)}
          />
          <Button
            label="Disconnect agent"
            secondary
            disabled={busy}
            onPress={() =>
              Alert.alert(
                'Disconnect this phone?',
                'Agent queries and scheduled exports stop. Imported data stays on this phone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disconnect', style: 'destructive', onPress: () => void run(disconnect) },
                ],
              )
            }
          />
          {pairing && (
            <>
              <Copy>
                A new pairing link was received. You can switch to this server after disconnecting
                your current agent.
              </Copy>
              <Button
                label="Switch connection"
                secondary
                disabled={busy}
                onPress={() => void run(switchConnection)}
              />
              <Button label="Dismiss pairing link" secondary onPress={reset} />
            </>
          )}
        </>
      ) : pairing ? (
        <>
          <Copy variant="heading">Confirm your connection</Copy>
          <Copy selectable>{pairing.server}</Copy>
          <Notice
            title="Pair with your agent"
            body="Continue with the same account used by your MCP client. Your data permissions remain under your control."
          />
          {session ? (
            <>
              <Copy>{session?.account}</Copy>
              <Button
                label="Confirm connection"
                disabled={busy}
                onPress={() => void run(confirm)}
              />
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in with Apple"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void run(() => signIn('apple'))}
                style={({ pressed }) => [
                  styles.appleButton,
                  { opacity: busy ? 0.45 : pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="logo-apple" size={22} color="#fff" />
                <Copy style={styles.appleLabel}>Sign in with Apple</Copy>
              </Pressable>
              <Button
                label="Continue with GitHub"
                secondary
                disabled={busy}
                onPress={() => void run(() => signIn('github'))}
              />
            </>
          )}
          <Button
            label="Use another account"
            secondary
            disabled={busy || !session}
            onPress={changeAccount}
          />
          <Button
            label="Scan another code"
            secondary
            disabled={busy}
            onPress={() => {
              changeAccount();
              reset();
            }}
          />
        </>
      ) : (
        <>
          <Copy variant="heading">Connect your chat to this phone</Copy>
          <Copy muted>
            Generate a pairing QR code in your agent, then scan it here or paste its link.
          </Copy>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => scan(data)}
            />
          ) : (
            <Button
              label={
                permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera access'
              }
              secondary
              onPress={() => {
                if (permission?.canAskAgain === false) void Linking.openSettings();
                else void requestPermission();
              }}
            />
          )}
          <View style={styles.fields}>
            <Copy variant="caption" muted>
              Pairing link
            </Copy>
            <TextInput
              accessibilityLabel="Pairing link"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://server/pair#code"
              placeholderTextColor={colors.secondary}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              value={link}
              onChangeText={setLink}
              onSubmitEditing={() => scan(link)}
            />
            <Button
              label="Use pairing link"
              disabled={!link.trim() || busy}
              onPress={() => scan(link)}
            />
          </View>
          <Copy variant="caption" muted>
            Pairing codes expire after five minutes.
          </Copy>
        </>
      )}
      {busy && <Copy>Connecting…</Copy>}
      {error && <Notice title="Connection needs attention" body={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000',
    borderColor: '#fff',
    borderWidth: 1,
  },
  appleLabel: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  camera: { height: 240, borderRadius: 20, overflow: 'hidden' },
  fields: { gap: 12 },
  input: { padding: 16, borderRadius: 14, minHeight: 52 },
});
