import { useState } from 'react';
import { ArrowUpRight, Cloud, Smartphone, X } from 'lucide-react';
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
  return `${new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })} (UTC)`;
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
    ? `Paid storage ended. On ${date(lapse.deleteAt)}, the oldest whole exports will be deleted until usage is ${megabytes(lapse.targetBytes)} or less (at least ${megabytes(lapse.bytesToDelete)} removed), unless you resubscribe or delete enough files first.`
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

/** Browser-local presentation preference; account storage and billing remain unchanged.
 * @param {{storage:CloudStorageStatus,account:string}} props */
export function CloudStorageCard({ storage, account }) {
  const preferenceKey = `myselfmd:cloud-storage-hidden:${account}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) === 'true';
    } catch {
      return false;
    }
  });
  /** @param {boolean} next */
  function setVisibility(next) {
    setHidden(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
    } catch {
      // Keep the control usable when browser storage is unavailable.
    }
  }
  if (hidden)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cloud className="size-4" aria-hidden="true" />
            <span>Cloud storage</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setVisibility(false)}>
            Show cloud storage
          </Button>
        </div>
        {lapseLabel(storage) ? (
          <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm">
            {lapseLabel(storage)}
          </p>
        ) : (
          storage.overLimit && (
            <p role="status" className="rounded-lg border p-3 text-sm">
              Cloud storage is over capacity. Show cloud storage to review your plan; uploads that
              do not fit are blocked.
            </p>
          )
        )}
      </div>
    );
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-4 right-4 text-muted-foreground"
        aria-label="Hide cloud storage"
        onClick={() => setVisibility(true)}
      >
        <X aria-hidden="true" />
        Hide
      </Button>
      <CloudStorageDetails storage={storage} />
    </div>
  );
}

/** Plan, subscription and lapse state with a phone-app handoff for purchases and changes.
 * @param {{storage:CloudStorageStatus}} props */
function CloudStorageDetails({ storage }) {
  const handoff = storage.handoff ?? fallbackHandoff;
  const subscription = storage.subscription;
  const lapse = lapseLabel(storage);
  /** @type {readonly {label:string,usPrice:{monthly:string,yearly:string}}[]} */
  const plans = storage.plans ?? cloudPlans;
  if (!storage.eligible)
    return (
      <Card>
        <CardHeader className="pr-28">
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
    <Card className="gap-5">
      <CardHeader className="flex flex-row items-center gap-3 pr-28">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
          <Cloud className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <CardTitle>Cloud storage</CardTitle>
          <CardDescription>{cloudPlanName(storage)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="space-y-2.5">
          <p className="text-sm font-medium tabular-nums">{cloudUsageLabel(storage)}</p>
          <div
            role="meter"
            aria-label="Cloud storage usage"
            aria-valuemin={0}
            aria-valuemax={storage.limitBytes}
            aria-valuenow={Math.min(storage.usedBytes, storage.limitBytes)}
            aria-valuetext={cloudUsageLabel(storage)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={storage.overLimit ? 'h-full bg-destructive' : 'h-full bg-primary'}
              style={{ width: `${Math.min(100, (storage.usedBytes / storage.limitBytes) * 100)}%` }}
            />
          </div>
        </div>
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
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">Need more room?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.label} className="min-w-0 rounded-xl border bg-muted/20 px-4 py-3">
                <p className="font-semibold">{plan.label}</p>
                <p className="mt-2 tabular-nums">
                  <span className="text-xl font-semibold tracking-tight">
                    {plan.usPrice.monthly}
                  </span>
                  <span className="text-muted-foreground"> / month</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  or {plan.usPrice.yearly} / year
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            US prices · Auto-renewing · Lifetime required
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href={handoff.appLink}>
              <Smartphone aria-hidden="true" />
              {storage.plan === 'included' ? 'Choose a plan in the app' : 'Change plan in the app'}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          {subscription && (
            <Button asChild size="sm" variant="outline">
              <a href={handoff.manageUrls[subscription.store]} target="_blank" rel="noreferrer">
                Manage in {storeName[subscription.store]}
              </a>
            </Button>
          )}
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">
            How plans and billing work
          </summary>
          <p className="mt-2 max-w-prose leading-relaxed">{handoff.instructions}</p>
        </details>
      </CardFooter>
    </Card>
  );
}
