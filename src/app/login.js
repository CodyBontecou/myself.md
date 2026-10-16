import { Redirect, Stack, router } from 'expo-router';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { usePhone } from '../../client/PhoneProvider.js';
import { Screen, Copy, Button, Icon, Notice } from '../components/ui.js';
import { ErrorToast } from '../components/Toast.js';
import { useTheme } from '../lib/theme.js';
import googleLogo from '../../assets/google-logo.png';
const providers = /** @type {const} */ ([
  {
    id: 'apple',
    label: 'Sign in with Apple',
    icon: 'logo-apple',
    testID: 'account-sign-in-with-apple',
  },
  {
    id: 'google',
    label: 'Continue with Google',
    icon: 'logo-google',
    testID: 'account-continue-with-google',
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    icon: 'logo-github',
    testID: 'account-continue-with-github',
  },
]);
export default function LoginScreen() {
  const { session, busy, error, run, signInAccount, deletionStatusUrl } = usePhone();
  const { colors } = useTheme();
  if (session?.owner && !session.requiresSignIn) return <Redirect href="/account" />;
  return (
    <Screen compact testID="login-screen">
      <Stack.Screen options={{ title: 'Sign in' }} />
      <Copy muted style={styles.center}>
        Sign in to save exports in the cloud and manage your account.
      </Copy>
      {session?.requiresSignIn && (
        <Notice
          title="Sign in again"
          body="Use the same account to keep your connected phone and data."
        />
      )}
      <View style={styles.providers}>
        {providers.map((provider) => (
          <Pressable
            key={provider.id}
            testID={provider.testID}
            accessibilityRole="button"
            accessibilityLabel={provider.label}
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void run(() => signInAccount(provider.id))}
            style={({ pressed }) => [
              styles.provider,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: busy ? 0.45 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <View style={styles.providerContent}>
              <View style={styles.providerIcon}>
                {provider.id === 'google' ? (
                  <Image
                    source={googleLogo}
                    style={styles.providerLogo}
                    resizeMode="contain"
                    accessible={false}
                  />
                ) : (
                  <Icon name={provider.icon} size={22} />
                )}
              </View>
              <Copy style={styles.providerLabel}>{provider.label}</Copy>
            </View>
          </Pressable>
        ))}
      </View>
      {busy && (
        <Copy muted style={styles.center}>
          Signing in…
        </Copy>
      )}
      <Button
        testID="login-existing-access"
        label="Already purchased health.md, iso.me or time.md?"
        secondary
        onPress={() => router.push('/claim-access')}
      />
      <Copy variant="caption" muted style={styles.center}>
        Your account is created automatically when you sign in.
      </Copy>
      {deletionStatusUrl && (
        <Button
          label="View account deletion status"
          secondary
          testID="account-view-account-deletion-status"
          onPress={() => void Linking.openURL(deletionStatusUrl)}
        />
      )}
      <ErrorToast error={error} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  providers: { gap: 12 },
  providerLogo: { width: 22, height: 22 },
  providerIcon: { position: 'absolute', left: 0, width: 22, alignItems: 'center' },
  providerContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  provider: {
    minHeight: 56,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  providerLabel: { fontWeight: '600', flex: 1, textAlign: 'center', paddingHorizontal: 34 },
});
