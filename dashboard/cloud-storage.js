import { lifetimePurchaseGuide } from '../core/billing.js';
import { cloudUsageLabel, lifetimeCloudBytes } from '../core/cloud-allowance.js';
import { cloudPlan, cloudPlans } from '../core/cloud-plans.js';
import { Button } from './components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card.js';
/** @typedef {import('./workspace.js').CloudStorageStatus} CloudStorageStatus */
/** @typedef {import('./workspace.js').CloudHandoff} CloudHandoff */
/** @typedef {import('../core/cloud-allowance.js').CloudSubscription} CloudSubscription */

/** Used until the server status includes its own handoff; purchases happen only in the phone app. @type {CloudHandoff} */
const fallbackHandoff = {
  appLink: 'myselfmd://cloud-storage',
  requiresUser: true,
  instructions:
    'Open myself.md on your phone, signed in to this account, to choose, change or restore a cloud plan. Apple or Google confirms payment.',
  manageUrls: {
    ios: 'https://apps.apple.com/account/subscriptions',
    android: 'https://play.google.com/store/account/subscriptions?package=com.myself.md',
  },
};
const storeName = { ios: 'App Store', android: 'Google Play' };

/** @param {number} value */
function megabytes(value) {
  return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)} MB`;
}
/** @param {number} value */
function date(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
/** @param {CloudStorageStatus} storage */
export function cloudPlanName(storage) {
  if (storage.plan === 'none') return 'No cloud storage';
  if (storage.plan === 'included') return `Included ${megabytes(lifetimeCloudBytes)} with Lifetime`;
  return `${cloudPlan(storage.plan)?.label ?? storage.plan} cloud plan`;
}
/** @param {CloudSubscription} subscription */
export function subscriptionLabel(subscription) {
  const name = `${cloudPlan(subscription.plan)?.label ?? subscription.plan} ${subscription.period} via ${storeName[subscription.store]}`;
  const until = subscription.expiresAt ? ` ${date(subscription.expiresAt)}` : '';
  switch (subscription.status) {
    case 'active':
      return subscription.autoRenew
        ? `${name} · renews${until || ' automatically'}`
        : `${name} · cancelled, paid storage ends${until || ' at the end of the period'}`;
    case 'grace':
      return `${name} · payment issue; storage continues during the store’s grace period. Update your payment method in ${storeName[subscription.store]}.`;
    case 'billing_retry':
      return `${name} · payment failed; paid storage is paused until ${storeName[subscription.store]} collects payment.`;
    case 'expired':
      return `${name} · expired${until}`;
    case 'revoked':
      return `${name} · refunded or revoked`;
  }
}
/** @param {CloudStorageStatus} storage @returns {string|null} */
export function lapseLabel(storage) {
  const { lapse } = storage;
  if (!lapse) return null;
  return lapse.bytesToDelete > 0
    ? `Paid storage ended. On ${date(lapse.deleteAt)}, the oldest exports (${megabytes(lapse.bytesToDelete)}) will be deleted to bring usage to ${megabytes(lapse.targetBytes)}, unless you resubscribe or delete files first.`
    : `Paid storage ended. Usage now fits in ${megabytes(lapse.targetBytes)}, so nothing will be deleted; the pending deletion clears automatically.`;
}
/** One-line description for summary tooltips.
 * @param {CloudStorageStatus} storage */
export function cloudStorageSummary(storage) {
  if (!storage.eligible)
    return 'Sign in to the app and purchase or restore Lifetime access for included cloud storage; paid plans also require Lifetime';
  return [
    cloudPlanName(storage),
    storage.subscription && subscriptionLabel(storage.subscription),
    lapseLabel(storage) ??
      (storage.overLimit
        ? 'Over capacity; uploads are paused. Delete files or choose a larger plan in the app'
        : null),
    'encrypted at rest',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Plan, subscription and lapse state with a phone-app handoff for purchases and changes.
 * @param {{storage:CloudStorageStatus}} props */
export function CloudStorageCard({ storage }) {
  const handoff = storage.handoff ?? fallbackHandoff;
  const subscription = storage.subscription;
  const lapse = lapseLabel(storage);
  /** @type {readonly {label:string,usPrice:{monthly:string,yearly:string}}[]} */
  const plans = storage.plans ?? cloudPlans;
  if (!storage.eligible)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cloud storage</CardTitle>
          <CardDescription>Lifetime access required</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Lifetime access includes {megabytes(lifetimeCloudBytes)} of cloud storage. Larger plans
          also require Lifetime. {lifetimePurchaseGuide().accountInstructions}
        </CardContent>
        <CardFooter>
          <Button asChild size="sm">
            <a href={lifetimePurchaseGuide().appLink}>Unlock Lifetime in the app</a>
          </Button>
        </CardFooter>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud storage</CardTitle>
        <CardDescription>
          {cloudPlanName(storage)} · {cloudUsageLabel(storage)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {subscription && <p>{subscriptionLabel(subscription)}</p>}
        {lapse ? (
          <p role="alert" className="rounded-lg border border-destructive/50 p-3">
            {lapse}
          </p>
        ) : (
          storage.overLimit && (
            <p role="status" className="rounded-lg border p-3">
              Over capacity: uploads that do not fit are blocked. You can still read, download and
              delete files; nothing is deleted because of a smaller plan.
            </p>
          )
        )}
        <p className="text-muted-foreground">
          Plans:{' '}
          {plans
            .map(
              (plan) =>
                `${plan.label} ${plan.usPrice.monthly}/month or ${plan.usPrice.yearly}/year`,
            )
            .join(' · ')}{' '}
          (US prices; auto-renewing). {handoff.instructions}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={handoff.appLink}>
            {storage.plan === 'included' ? 'Choose a plan in the app' : 'Change plan in the app'}
          </a>
        </Button>
        {subscription && (
          <Button asChild size="sm" variant="outline">
            <a href={handoff.manageUrls[subscription.store]} target="_blank" rel="noreferrer">
              Manage in {storeName[subscription.store]}
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
