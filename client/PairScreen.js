import { errorMessage } from '../packages/support-chat/errors.js';
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { Stack, router } from 'expo-router';
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
  const authenticationRequired = Boolean(session?.authenticationRequired);
  return (
    <Screen compact testID="pair-screen">
      <Stack.Screen options={{ title: connected ? 'Your agent' : 'Connect agent' }} />
      {session?.requiresSignIn ? (
        <>
          <Notice
            title="Sign in again"
            body="Finish the myself.md upgrade using the same account. Your saved profiles and data remain on this phone."
          />
          <Button
            testID="pair-upgrade-sign-in"
            label="Sign in again"
            filled
            onPress={() => router.push('/account')}
          />
        </>
      ) : connected ? (
        <>
          <View style={styles.intro}>
            <Copy variant="heading" style={styles.heading}>
              {authenticationRequired ? 'Sign in to reconnect' : 'Your phone is connected'}
            </Copy>
            <Copy muted>
              {authenticationRequired
                ? 'Your login has expired. Sign in to the same account to reconnect this phone.'
                : 'Manage what your agent can access in each profile.'}
            </Copy>
          </View>
          <Group>
            <Row testID="pair-account" title="Account" subtitle={session?.account} />
            <Row testID="pair-server" title="Server" subtitle={session?.server} />
          </Group>
          <View style={styles.actions}>
            {authenticationRequired && (
              <Button
                testID="pair-sign-in-again"
                label="Sign in again"
                filled
                disabled={busy}
                onPress={() => router.push('/login?reauthenticate=1')}
              />
            )}
            <Button
              testID="pair-check-connection"
              label="Check connection"
              secondary
              disabled={busy}
              onPress={() => void run(refresh)}
            />
            <Button
              testID="pair-disconnect-agent"
              label="Disconnect agent"
              secondary
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Disconnect this phone?',
                  'Agent queries and scheduled exports stop. Recorded location data stays on this phone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: () => void run(disconnect),
                    },
                  ],
                )
              }
            />
          </View>
          {pairing && (
            <>
              <Copy>
                A new pairing link was received. You can switch to this server after disconnecting
                your current agent.
              </Copy>
              <Button
                testID="pair-switch-connection"
                label="Switch connection"
                secondary
                disabled={busy}
                onPress={() => void run(switchConnection)}
              />
              <Button
                testID="pair-dismiss-pairing-link"
                label="Dismiss pairing link"
                secondary
                onPress={reset}
              />
            </>
          )}
        </>
      ) : pairing ? (
        <>
          <View style={styles.intro}>
            <Copy variant="heading" style={styles.heading}>
              Confirm connection
            </Copy>
            <Copy muted>Connect this phone using the same account as your agent.</Copy>
          </View>
          <Group>
            <Row title="Server" subtitle={pairing.server} icon={<Icon name="link-outline" />} />
            {session && (
              <Row
                title="Account"
                subtitle={session.account}
                icon={<Icon name="person-circle-outline" />}
              />
            )}
          </Group>
          <Copy variant="caption" muted>
            Connecting does not grant data access. You choose what to share in each profile.
          </Copy>
          <View style={styles.actions}>
            {session ? (
              <Button
                testID="pair-confirm-connection"
                label={busy ? 'Connecting…' : 'Confirm connection'}
                filled
                busy={busy}
                disabled={busy}
                onPress={() => void run(confirm)}
              />
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  testID="pair-sign-in-with-apple"
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
                  testID="pair-continue-with-github"
                  label="Continue with GitHub"
                  secondary
                  disabled={busy}
                  onPress={() => void run(() => signIn('github'))}
                />
                <Button
                  testID="pair-continue-with-google"
                  label="Continue with Google"
                  secondary
                  disabled={busy}
                  onPress={() => void run(() => signIn('google'))}
                />
              </>
            )}
            <Button
              testID="pair-use-another-account"
              label="Use another account"
              secondary
              disabled={busy || !session}
              onPress={changeAccount}
            />
            <Button
              testID="pair-scan-another-code"
              label="Scan another code"
              secondary
              disabled={busy}
              onPress={() => {
                changeAccount();
                reset();
              }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.intro}>
            <Copy variant="heading" style={styles.heading}>
              Connect your agent
            </Copy>
            <Copy muted>
              Generate a pairing QR code in your agent, then scan it here or paste its link.
            </Copy>
          </View>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => scan(data)}
            />
          ) : (
            <Button
              testID="pair-camera-permission"
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
              testID="pair-link-input"
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
              testID="pair-use-pairing-link"
              label="Use pairing link"
              filled
              disabled={!link.trim() || busy}
              onPress={() => scan(link)}
            />
          </View>
          <Copy variant="caption" muted>
            Pairing codes expire after five minutes.
          </Copy>
        </>
      )}
      {busy && (
        <Copy testID="pair-loading" accessibilityState={{ busy: true }}>
          Connecting…
        </Copy>
      )}
      {error && (
        <View testID="pair-error" accessibilityRole="alert">
          <Notice title="Connection needs attention" body={errorMessage(error)} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  actions: { gap: 4 },
  appleButton: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
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
  camera: { height: 240, borderRadius: 12, overflow: 'hidden' },
  fields: { gap: 12 },
  input: { padding: 16, borderRadius: 12, minHeight: 52 },
});
