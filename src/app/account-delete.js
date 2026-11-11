import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { Screen, Copy, Button, Checkbox, Icon } from '../components/ui.js';
import { usePhone } from '../../client/PhoneProvider.js';
import { useTheme } from '../lib/theme.js';

/** These groups restate `accountDeletionNotice`; the server request and its receipt are unchanged. */
const deleted = [
  'Cloud exports',
  'Sharing permissions',
  'Connected phones',
  'Activity history',
  'Linked usage analytics',
  'Support conversation and Discord thread',
];
const unaffected = [
  'Health and screen-time data in your phone’s system apps',
  'Files you sent to your own storage, and copies on other phones',
  'Store subscriptions and refunds. Cancel cloud storage in iPhone Settings → your name → Subscriptions, or in Google Play → Payments & subscriptions. Refunds come from Apple or Google.',
];

export default function DeleteAccountScreen() {
  const { session, accountProfile, busy, run, deleteAccount } = usePhone();
  const { colors } = useTheme();
  const [agreed, setAgreed] = useState(false);
  if (!session?.owner || session.requiresSignIn) return <Redirect href="/login" />;
  const who = accountProfile?.email || accountProfile?.name || 'your account';
  return (
    <Screen compact testID="account-delete-screen">
      <Stack.Screen options={{ title: 'Delete account' }} />
      <Copy muted>
        {`This permanently removes ${who} from myself.md. It can’t be undone. Deletion status stays available for seven days.`}
      </Copy>

      <View style={styles.stack}>
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.danger }]}
        >
          <Copy variant="caption" style={[styles.label, { color: colors.danger }]}>
            DELETED
          </Copy>
          <View style={styles.chips}>
            {deleted.map((item) => (
              <View
                key={item}
                style={[
                  styles.chip,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Copy variant="caption">{item}</Copy>
              </View>
            ))}
          </View>
          <View style={[styles.warning, { backgroundColor: colors.subtle }]}>
            <Icon name="warning-outline" size={18} color={colors.danger} />
            <Copy variant="caption" style={styles.warningText}>
              Lifetime access ends for this account. Your purchase stays with your Apple or Google
              account: Restore still unlocks exports on this phone, and you can link it to a new
              myself.md account later.
            </Copy>
          </View>
        </View>

        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Copy variant="caption" muted style={styles.label}>
            NOT AFFECTED
          </Copy>
          {unaffected.map((item) => (
            <View key={item} style={styles.item}>
              <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
              <Copy variant="caption" muted style={styles.itemText}>
                {item}
              </Copy>
            </View>
          ))}
        </View>

        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Copy variant="caption" muted style={styles.label}>
            KEPT WITHOUT YOUR ACCOUNT
          </Copy>
          <Copy variant="caption" muted>
            Purchase identifiers, without your account or receipt, so each purchase belongs to one
            account at a time. Pseudonymous credential and analytics retry-blocking markers, without
            analytics events.
          </Copy>
        </View>
      </View>

      <View style={styles.confirm}>
        <Checkbox
          testID="account-delete-understand"
          value={agreed}
          onValueChange={setAgreed}
          disabled={busy}
          accessibilityLabel="I understand this can’t be undone"
        />
        <Copy style={styles.confirmText}>I understand this can’t be undone</Copy>
      </View>
      <View style={styles.actions}>
        <Button
          testID="account-delete-confirm"
          label={busy ? 'Deleting…' : 'Delete account permanently'}
          filled
          destructive
          disabled={!agreed || busy}
          busy={busy}
          onPress={() => void run(deleteAccount)}
        />
        <Button
          testID="account-delete-cancel"
          label="Keep my account"
          secondary
          disabled={busy}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  card: { borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, padding: 16, gap: 10 },
  label: { fontWeight: '500', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  warning: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'flex-start',
  },
  warningText: { flex: 1 },
  item: { flexDirection: 'row', gap: 10 },
  dot: { marginTop: 7, width: 5, height: 5, borderRadius: 3 },
  itemText: { flex: 1 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -12 },
  confirmText: { flex: 1 },
  actions: { gap: 4 },
});
