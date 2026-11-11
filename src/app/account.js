import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { freeExports } from '../../core/billing.js';
import {
  Screen,
  Copy,
  Button,
  Group,
  Row,
  Divider,
  SectionHeader,
  Icon,
} from '../components/ui.js';
import AccountAvatar from '../components/AccountAvatar.js';
import ConnectedLogins from '../../client/ConnectedLogins.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { useBilling } from '../../client/BillingPaywalls.js';
import { useTheme } from '../lib/theme.js';

export default function AccountScreen() {
  const { session, accountProfile, busy, run, disconnect, deletionStatusUrl } = usePhone();
  const current = useBilling();
  const { colors } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  if (!session?.owner || session.requiresSignIn) return <Redirect href="/login" />;
  const name = accountProfile?.name || accountProfile?.email || 'Your account';
  return (
    <Screen compact testID="account-screen">
      <Stack.Screen options={{ title: 'Account' }} />
      <View style={styles.identity}>
        <AccountAvatar
          signedIn
          picture={accountProfile?.picture}
          name={accountProfile?.name}
          email={accountProfile?.email}
          unlocked={current.accountUnlocked}
          size={76}
        />
        <View style={styles.identityText}>
          <Copy testID="account-account" variant="heading" selectable style={styles.name}>
            {name}
          </Copy>
          {accountProfile?.name && accountProfile.email && (
            <Copy muted selectable style={styles.email}>
              {accountProfile.email}
            </Copy>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Access" />
        <View
          testID="account-lifetime-access"
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: current.accountUnlocked ? colors.outline : colors.border,
            },
          ]}
        >
          <View style={styles.cardTop}>
            <Copy style={styles.cardTitle}>
              {current.accountUnlocked
                ? current.lifetime
                  ? 'Lifetime access'
                  : 'Cloud subscription access'
                : current.unlocked
                  ? 'Unlocked on this phone'
                  : 'Free exports'}
            </Copy>
            <Copy
              variant="caption"
              style={[
                styles.cardBadge,
                { color: current.accountUnlocked ? colors.place : colors.secondary },
              ]}
            >
              {current.accountUnlocked
                ? '● Active'
                : current.unlocked
                  ? 'Not verified'
                  : `${current.remaining} of ${freeExports} left`}
            </Copy>
          </View>
          <Copy variant="caption" muted>
            {current.accountUnlocked
              ? 'Unlimited exports and agent queries, linked to this account on every phone you sign in to.'
              : current.unlocked
                ? 'Account access isn’t verified yet, so agent queries can’t use it.'
                : 'No lifetime access linked to this account yet.'}
          </Copy>
          <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no">
            {current.accountUnlocked
              ? [colors.place, colors.attention, colors.body].map((color) => (
                  <View key={color} style={[styles.meterCell, { backgroundColor: color }]} />
                ))
              : Array.from({ length: freeExports }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.meterCell,
                      {
                        backgroundColor:
                          current.unlocked || i < current.used ? colors.text : colors.outline,
                      },
                    ]}
                  />
                ))}
          </View>
          {!current.accountUnlocked && (
            <View style={styles.cardActions}>
              {!current.unlocked && (
                <Button
                  testID="account-unlock"
                  label="Unlock forever · $19.99"
                  filled
                  onPress={() => router.push('/unlock')}
                />
              )}
              <Button
                testID="account-claim-existing-access"
                label="Claim existing-customer access"
                secondary
                onPress={() => router.push('/claim-access')}
              />
            </View>
          )}
        </View>
      </View>

      <ConnectedLogins />

      <View style={styles.section}>
        <SectionHeader title="This phone" />
        <Group>
          <Row
            testID="account-sign-in-again"
            title="Sign in again"
            subtitle="Refresh this phone’s sign-in"
            disabled={busy}
            onPress={() => router.push('/login?reauthenticate=1')}
          />
          <Divider />
          <Row
            testID="account-sign-out"
            title="Sign out"
            subtitle="Disconnects this phone"
            disabled={busy}
            trailing={<Icon name="log-out-outline" size={20} color={colors.secondary} />}
            selected={false}
            onPress={() => setSigningOut(true)}
          />
        </Group>
      </View>

      <View style={styles.section}>
        <View style={[styles.danger, { borderColor: colors.danger }]}>
          <Row
            testID="account-delete-account"
            title="Delete account"
            subtitle="Removes your cloud account and what’s linked to it"
            destructive
            disabled={busy}
            onPress={() => router.push('/account-delete')}
          />
        </View>
        {deletionStatusUrl && (
          <Button
            testID="account-view-account-deletion-status"
            label="View account deletion status"
            secondary
            onPress={() => void Linking.openURL(deletionStatusUrl)}
          />
        )}
      </View>

      <SignOutSheet
        visible={signingOut}
        busy={busy}
        onCancel={() => setSigningOut(false)}
        onConfirm={() => {
          setSigningOut(false);
          void run(disconnect);
        }}
      />
    </Screen>
  );
}

/** @param {{visible:boolean,busy:boolean,onCancel:()=>void,onConfirm:()=>void}} props */
function SignOutSheet({ visible, busy, onCancel, onConfirm }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const effects = [
    { color: colors.body, text: 'Disconnects your phone from your account and agent' },
    { color: colors.body, text: 'Stops background location recording' },
    {
      color: colors.place,
      text: 'Your account and its access are kept, so you can sign in again any time',
    },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.sheetRoot}>
        <Pressable
          testID="account-sign-out-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Cancel sign out"
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
        <View
          testID="account-sign-out-sheet"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              marginBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.outline }]} />
          <Copy variant="heading" accessibilityRole="header" style={styles.sheetTitle}>
            Sign out of this phone?
          </Copy>
          <View style={styles.effects}>
            {effects.map((effect) => (
              <View key={effect.text} style={styles.effect}>
                <View style={[styles.effectDot, { backgroundColor: effect.color }]} />
                <Copy muted style={styles.effectText}>
                  {effect.text}
                </Copy>
              </View>
            ))}
          </View>
          <View style={styles.sheetActions}>
            <Button
              testID="account-sign-out-confirm"
              label="Sign out"
              filled
              disabled={busy}
              onPress={onConfirm}
            />
            <Pressable
              testID="account-sign-out-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Copy muted style={styles.cancelLabel}>
                Cancel
              </Copy>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4 },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 28, lineHeight: 32, fontWeight: '600', letterSpacing: -0.6 },
  email: { fontSize: 14 },
  section: { gap: 8 },
  card: { borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, padding: 16, gap: 6 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  cardTitle: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  cardBadge: { fontWeight: '500' },
  meter: { flexDirection: 'row', gap: 4, marginTop: 8 },
  meterCell: { flex: 1, height: 6, borderRadius: 3 },
  cardActions: { marginTop: 10, gap: 8 },
  danger: { borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, overflow: 'hidden' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(5, 6, 4, 0.72)' },
  sheet: {
    marginHorizontal: 8,
    borderRadius: 32,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { marginTop: 20 },
  effects: { marginTop: 14, gap: 10 },
  effect: { flexDirection: 'row', gap: 10 },
  effectDot: { marginTop: 8, width: 6, height: 6, borderRadius: 3 },
  effectText: { flex: 1 },
  sheetActions: { marginTop: 22, gap: 4 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15 },
});
