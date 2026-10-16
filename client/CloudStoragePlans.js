import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/lib/theme.js';
import { openPrivacyLink } from '../src/components/PrivacyLinks.js';
import {
  Button,
  Copy,
  Group,
  Icon,
  Notice,
  Row,
  Screen,
  SectionHeader,
} from '../src/components/ui.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { showToast } from '../src/components/Toast.js';
import { cloudUsageLabel, lifetimeCloudBytes } from '../core/cloud-allowance.js';
import { cloudPlan, cloudPlans } from '../core/cloud-plans.js';
import { useBilling } from './BillingPaywalls.js';
import { CloudStatusNotices, useCloudStatus } from './CloudStorageUsage.js';
import { enableCloudReminders } from './export-task.js';
import { qaEnabled } from './qa-runtime.js';
import {
  buyCloudPlan,
  cloudOffers,
  manageCloudSubscription,
  restoreCloudPlan,
} from './store-purchases.js';
import {
  cloudPeriods,
  cloudPlanTitle,
  cloudPrivacyUrl,
  cloudTermsUrl,
  formatCloudDate,
  periodUnit,
  qaCloudOffers,
} from './cloud-storage.js';

const fixtureMessage = 'Purchases require a normal build for integration QA. Nothing was charged.';
const deviceStore = Platform.OS === 'android' ? 'android' : 'ios';
const nativeStore = Platform.OS === 'ios' || Platform.OS === 'android';

/** Cloud storage plans: current plan, tiers with localized store prices, checkout, restore and
 * store management. Reached from Settings, `myselfmd://cloud-storage` and lapse notifications. */
export default function CloudStoragePlans() {
  const { colors } = useTheme();
  const status = useCloudStatus();
  const billing = useBilling();
  const value = status.value;
  const [offers, setOffers] = useState(() => (qaEnabled ? qaCloudOffers(deviceStore) : []));
  const [offersError, setOffersError] = useState(
    qaEnabled || nativeStore ? '' : 'Subscribe in the myself.md iPhone or Android app.',
  );
  const current = value?.subscription ?? null;
  // Billing retry keeps a live store subscription even though paid capacity is paused.
  const live =
    current &&
    (current.status === 'active' ||
      current.status === 'grace' ||
      current.status === 'billing_retry')
      ? current
      : null;
  const [period, setPeriod] = useState(
    /** @type {import('../core/cloud-plans.js').CloudPeriod} */ (current?.period ?? 'monthly'),
  );
  const [selected, setSelected] = useState(
    /** @type {import('../core/cloud-plans.js').CloudPlanId|null} */ (null),
  );
  const [busy, setBusy] = useState(/** @type {''|'purchase'|'restore'|'manage'} */ (''));
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (qaEnabled || !nativeStore) return undefined;
    let active = true;
    void cloudOffers()
      .then((items) => {
        if (active) setOffers(items);
        return undefined;
      })
      .catch((e) => {
        if (active) setOffersError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);

  const chosen = selected ?? (live?.plan === 'cloud_10gb' ? 'cloud_1tb' : 'cloud_10gb');
  const plan = cloudPlan(chosen);
  const offer = offers.find((item) => item.plan === chosen && item.period === period) ?? null;
  const isCurrent = Boolean(live && live.plan === chosen && live.period === period);
  const otherStore = live && live.store !== deviceStore ? live.store : null;
  const signedIn = status.signedIn;
  const eligible = Boolean(value?.eligible);
  const unit = periodUnit(period);
  const canSubscribe = signedIn && eligible && Boolean(offer) && !busy && !isCurrent && !otherStore;

  /** @param {'purchase'|'restore'|'manage'} kind @param {()=>Promise<void>} action */
  async function run(kind, action) {
    setMessage('');
    if (qaEnabled) {
      showToast({ message: fixtureMessage, kind: 'warning' });
      return;
    }
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      showToast({ message: errorMessage(e), kind: 'error' });
    } finally {
      setBusy('');
    }
  }
  function subscribe() {
    if (!offer || !plan) return;
    void run('purchase', async () => {
      const event = await buyCloudPlan(offer);
      if (event.kind === 'verified') {
        setMessage(
          event.status.plan === offer.plan
            ? `${plan.label} cloud storage is active. Your capacity is now ${plan.label}.`
            : 'The store accepted your plan change. It takes effect at your next renewal date.',
        );
        // Lapse reminders are push notifications; ask once after a successful purchase.
        void enableCloudReminders().catch(() => {});
      } else if (event.kind === 'pending')
        setMessage(
          'Purchase pending. Cloud storage activates as soon as the store approves the payment.',
        );
      else if (event.kind === 'error')
        showToast({ message: errorMessage(event.error), kind: 'error' });
    });
  }
  function restore() {
    void run('restore', async () => {
      const restored = await restoreCloudPlan();
      setMessage(
        restored.plan === 'cloud_10gb' || restored.plan === 'cloud_1tb'
          ? `${cloudPlan(restored.plan)?.label} cloud storage restored to this account.`
          : 'Your store subscription is linked to this account, but it is not currently active.',
      );
    });
  }
  function manage() {
    void run('manage', () =>
      manageCloudSubscription(
        live?.store ?? deviceStore,
        live ? (cloudPlan(live.plan)?.android.productId ?? null) : null,
      ),
    );
  }

  return (
    <Screen compact testID="cloud-plans-screen">
      <View style={styles.intro}>
        <Copy variant="heading" style={styles.heading}>
          Choose cloud storage
        </Copy>
        <Copy muted>
          More room for your exports. Plans replace the 100 MB included with Lifetime.
        </Copy>
      </View>
      {value && <CloudStatusNotices value={value} />}

      <Group compact>
        <Row
          compact
          testID="cloud-plans-current"
          title={
            !signedIn
              ? 'Not signed in'
              : value
                ? value.eligible
                  ? cloudPlanTitle(value.plan)
                  : 'Lifetime access required'
                : status.loading
                  ? 'Checking cloud storage…'
                  : 'Cloud storage could not be checked'
          }
          subtitle={
            value?.eligible
              ? [cloudUsageLabel(value), subscriptionSummary(live)].filter(Boolean).join(' · ')
              : undefined
          }
        />
      </Group>
      {status.error && (
        <Copy testID="cloud-plans-status-error" muted>
          {value ? 'Showing last known status. ' : ''}
          {status.error}
        </Copy>
      )}
      {status.error && signedIn && (
        <Button
          testID="cloud-plans-refresh"
          label={status.loading ? 'Checking…' : 'Retry'}
          secondary
          disabled={status.loading}
          onPress={status.refresh}
        />
      )}

      {!signedIn && (
        <View testID="cloud-plans-sign-in-required" style={styles.gate}>
          <Notice
            title="Sign in for cloud storage"
            body="Cloud storage belongs to your myself.md account, so plans need a signed-in account with Lifetime access."
            icon="person-circle-outline"
          />
          <Button
            filled
            testID="cloud-plans-sign-in"
            label="Sign in to myself.md"
            onPress={() => router.push('/account')}
          />
        </View>
      )}
      {signedIn && value && !value.eligible && (
        <View testID="cloud-plans-lifetime-required" style={styles.gate}>
          <Notice
            title="Lifetime access required"
            body={
              billing.unlocked
                ? 'This phone has Lifetime access, but your account has not verified it yet. Check lifetime access on your account, then choose a plan.'
                : 'Cloud storage plans build on Lifetime access: each plan replaces the 100 MB included with Lifetime. Unlock Lifetime first, then choose a plan.'
            }
            icon="lock-closed-outline"
          />
          <Button
            filled
            testID="cloud-plans-lifetime"
            label={billing.unlocked ? 'Check lifetime access' : 'Unlock Lifetime'}
            onPress={() => router.push(billing.unlocked ? '/account' : '/unlock')}
          />
        </View>
      )}

      <View style={styles.choices}>
        <SectionHeader compact title="Choose a plan" />
        <View style={[styles.segment, { backgroundColor: colors.subtle }]}>
          {cloudPeriods.map((item) => {
            const active = item === period;
            return (
              <Pressable
                key={item}
                testID={`cloud-plan-period-${item}`}
                accessibilityRole="button"
                accessibilityLabel={item === 'monthly' ? 'Monthly billing' : 'Yearly billing'}
                accessibilityState={{ selected: active, disabled: Boolean(busy) }}
                disabled={Boolean(busy)}
                onPress={() => setPeriod(item)}
                style={[styles.segmentItem, active && { backgroundColor: colors.surface }]}
              >
                <Copy style={[styles.segmentLabel, !active && { color: colors.secondary }]}>
                  {item === 'monthly' ? 'Monthly' : 'Yearly'}
                </Copy>
              </Pressable>
            );
          })}
        </View>
        {cloudPlans.map((item) => {
          const itemOffer = offers.find((o) => o.plan === item.id && o.period === period);
          const active = item.id === chosen;
          const currentPlan = Boolean(live && live.plan === item.id && live.period === period);
          return (
            <Pressable
              key={item.id}
              testID={`cloud-plan-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} cloud storage, ${itemOffer ? `${itemOffer.displayPrice} per ${unit}` : 'price unavailable'}${currentPlan ? ', current plan' : ''}`}
              accessibilityState={{ selected: active, disabled: Boolean(busy) }}
              disabled={Boolean(busy)}
              onPress={() => setSelected(item.id)}
              style={[
                styles.plan,
                active ? styles.planSelected : styles.planUnselected,
                {
                  backgroundColor: colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={styles.planHeader}>
                <View style={styles.planName}>
                  <Icon
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? colors.accent : colors.secondary}
                  />
                  <Copy variant="heading">{item.label}</Copy>
                </View>
                {currentPlan && (
                  <Copy variant="caption" style={styles.badge}>
                    Current plan
                  </Copy>
                )}
              </View>
              <Copy style={styles.price}>
                {itemOffer ? `${itemOffer.displayPrice} / ${unit}` : 'Price unavailable'}
              </Copy>
              <Copy variant="caption" muted>
                {`${item.capacityBytes / lifetimeCloudBytes}× the 100 MB included with Lifetime`}
              </Copy>
            </Pressable>
          );
        })}
      </View>
      {offersError && (
        <Copy testID="cloud-plans-offers-error" muted>
          {offersError}
        </Copy>
      )}
      {otherStore && (
        <Copy testID="cloud-plans-other-store" muted>
          Your plan is billed through {otherStore === 'ios' ? 'the App Store' : 'Google Play'}.
          Change or cancel it there, or on the device you subscribed with.
        </Copy>
      )}
      <Button
        filled={signedIn && eligible}
        testID="cloud-plan-subscribe"
        label={
          busy === 'purchase'
            ? 'Waiting for the store…'
            : isCurrent
              ? 'Current plan'
              : `${live ? `Switch to ${plan?.label}` : `Subscribe to ${plan?.label}`}${offer ? ` · ${offer.displayPrice}/${unit}` : ''}`
        }
        busy={busy === 'purchase'}
        disabled={!canSubscribe}
        onPress={subscribe}
      />
      {message && (
        <Copy testID="cloud-plans-message" accessibilityRole="alert">
          {message}
        </Copy>
      )}
      <View style={styles.actions}>
        <Button
          testID="cloud-plan-restore"
          label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
          secondary
          busy={busy === 'restore'}
          disabled={Boolean(busy) || !signedIn}
          onPress={restore}
        />
        <Button
          testID="cloud-plan-manage"
          label="Manage subscription"
          secondary
          disabled={Boolean(busy)}
          onPress={manage}
        />
      </View>

      <Copy testID="cloud-plan-disclosure" variant="caption" muted>
        {disclosure(
          offer?.title ?? `Cloud Storage ${plan?.label ?? ''}`,
          period,
          offer?.displayPrice,
        )}
      </Copy>
      <Group compact>
        <Row
          compact
          testID="cloud-plan-terms"
          title="Terms of Use (EULA)"
          subtitle={cloudTermsUrl}
          onPress={() => void openPrivacyLink(cloudTermsUrl)}
        />
        <Row
          compact
          testID="cloud-plan-privacy"
          title="Privacy Policy"
          subtitle={cloudPrivacyUrl}
          onPress={() => void openPrivacyLink(cloudPrivacyUrl)}
        />
      </Group>
    </Screen>
  );
}

/** @param {import('../core/cloud-allowance.js').CloudSubscription|null} subscription */
function subscriptionSummary(subscription) {
  if (!subscription) return '';
  const billed = subscription.period === 'monthly' ? 'Monthly' : 'Yearly';
  if (subscription.status === 'grace') return `${billed} · payment problem, grace period`;
  if (subscription.status === 'billing_retry') return `${billed} · payment problem, paused`;
  if (!subscription.expiresAt) return billed;
  return `${billed} · ${subscription.autoRenew ? 'renews' : 'ends'} ${formatCloudDate(subscription.expiresAt)}`;
}

/** Store-required auto-renewal disclosure: title, length, price per period, renewal and cancellation.
 * @param {string} title @param {import('../core/cloud-plans.js').CloudPeriod} period @param {string|undefined} price */
function disclosure(title, period, price) {
  const length = period === 'monthly' ? '1 month' : '1 year';
  const cost = price ? `${price} per ${periodUnit(period)}` : 'the price shown by the store';
  const summary = `${title}: auto-renewing subscription, ${length}, ${cost}.`;
  const store =
    Platform.OS === 'android'
      ? 'Payment is charged to your Google Play account when you confirm the purchase. The subscription renews automatically at the same price and length until you cancel. Cancel anytime in Google Play subscriptions; storage continues until the end of the period already paid.'
      : 'Payment is charged to your Apple Account when you confirm the purchase. The subscription renews automatically at the same price and length unless you cancel at least 24 hours before the end of the current period; your account is charged for renewal within 24 hours before the period ends. Manage or cancel anytime in your App Store account settings.';
  return `${summary} ${store} Requires Lifetime access; the plan replaces the 100 MB included with Lifetime. Moving to a smaller plan never deletes files, but uploads beyond the smaller capacity are blocked.`;
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  choices: { gap: 8 },
  planName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gate: { gap: 8 },
  segment: { flexDirection: 'row', borderRadius: 12, borderCurve: 'continuous', padding: 4 },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { fontWeight: '600' },
  plan: { borderRadius: 12, borderCurve: 'continuous', padding: 12, gap: 4 },
  planSelected: { borderWidth: 2 },
  planUnselected: { borderWidth: 2 },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: { fontWeight: '600' },
  price: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
});
