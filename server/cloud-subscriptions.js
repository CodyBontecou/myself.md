import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  cloudReminderDays,
  lapseRemindersDue,
  nextLapse,
  retentionVictims,
  subscriptionEntitled,
} from '../core/cloud-allowance.js';
import { cloudPlans } from '../core/cloud-plans.js';
import { cloudNotice } from '../core/cloud-notices.js';
import { PairingError } from './errors.js';
import { sendExpoPush } from './export-schedules.js';
import { subscriptionClaimed } from './billing-store.js';
import {
  accountTokenKey,
  needsAcknowledgement,
  purchaseAccountToken,
  storeSubscriptions,
  subscriptionKey,
} from './store-subscriptions.js';
const day = 86_400_000;
const hour = 3_600_000;
/** Paid tiers shown to every client; store product IDs stay server- and app-side. */
const cloudPlanSummaries = cloudPlans.map(({ id, label, capacityBytes, usPrice }) => ({
  id,
  label,
  capacityBytes,
  usPrice,
}));
/** Purchases, upgrades, restores and cancellations always require the account owner in the phone app or store. */
const cloudHandoff = {
  appLink: 'myselfmd://cloud-storage',
  requiresUser: true,
  instructions:
    'myself.md Cloud includes 100 GB and app access while subscribed, with no Lifetime purchase required. Subscriptions are bought or restored by the account owner in the myself.md phone app, signed in to this account (open myselfmd://cloud-storage). Manage or cancel an existing subscription in App Store or Google Play subscription settings. Agents cannot purchase or cancel plans.',
  manageUrls: {
    ios: 'https://apps.apple.com/account/subscriptions',
    android: 'https://play.google.com/store/account/subscriptions?package=com.myself.md',
  },
};
/** @typedef {{bind:(key:string,subject:string)=>Promise<void>,owner:(key:string)=>Promise<string|null>}} Owners */
/** @typedef {{configured:boolean,send:(message:{to:string,subject:string,text:string,html:string})=>Promise<unknown>}} Mailer */
/** @typedef {import('./store-subscriptions.js').VerifiedSubscription} VerifiedSubscription */
/** @typedef {Exclude<import('./store-subscriptions.js').StoreEvent,{kind:'ignored'}>} StoreEvent */

/** Subscription verification, ownership, lapse retention and reminder delivery shared by Node and Workers.
 * @param {{
 *   billing:import('./billing-store.js').BillingStore,
 *   cloud:import('./cloud-store.js').CloudStore,
 *   history:import('./history-store.js').HistoryStore,
 *   refreshEntitlement:(subject:string,force?:boolean)=>Promise<void>,
 *   owners?:Owners,
 *   verifier?:import('./store-subscriptions.js').SubscriptionVerifier,
 *   pushTokens?:(subject:string)=>string[],
 *   accountEmail?:(subject:string)=>Promise<string|null>,
 *   mailer?:Mailer,
 *   send?:typeof fetch,
 *   arm?:(at:number)=>Promise<void>,
 *   now?:()=>number,
 * }} dependencies */
export function createCloudSubscriptions({
  billing,
  cloud,
  history,
  refreshEntitlement,
  owners = {
    bind: async (key, subject) => billing.bindOwner(key, subject),
    owner: async (key) => billing.owner(key),
  },
  verifier = storeSubscriptions,
  pushTokens = () => [],
  accountEmail = async () => null,
  mailer = { configured: false, send: async () => {} },
  send = fetch,
  arm = async () => {},
  now = Date.now,
}) {
  /** @type {Map<string,Promise<unknown>>} */
  const queues = new Map();
  const context = new AsyncLocalStorage();
  /** Lapse and deletion work for one account never interleaves.
   * @template T @param {string} subject @param {()=>Promise<T>} task @returns {Promise<T>} */
  function serial(subject, task) {
    if (context.getStore() === subject) return task();
    const next = (queues.get(subject) ?? Promise.resolve())
      .catch(() => {})
      .then(() => context.run(subject, task));
    queues.set(subject, next);
    next
      .finally(() => {
        if (queues.get(subject) === next) queues.delete(subject);
      })
      .catch(() => {});
    return next;
  }

  /** @param {string} subject */
  function body(subject) {
    return {
      ...cloud.storageStatus(subject),
      appAccess: billing.snapshot(subject),
      plans: cloudPlanSummaries,
      handoff: cloudHandoff,
      diagnostics: { noticeFailure: billing.noticeFailure(subject) },
    };
  }
  /** Store outages must not prevent subscription expiry or pending retention work.
   * @param {string} subject */
  async function refreshLifetime(subject) {
    try {
      await refreshEntitlement(subject);
    } catch {
      console.error(
        'Lifetime refresh unavailable; retaining last verified state without extending its validity.',
      );
    }
  }
  /** `/api/cloud/status`, dashboard `cloudStorage` and MCP `get_cloud_storage`.
   * @param {string} subject */
  function status(subject) {
    return serial(subject, async () => {
      await refreshLifetime(subject);
      await refresh(subject);
      await reconcile(subject);
      return body(subject);
    });
  }
  /** @param {string} subject */
  async function purchaseAccount(subject) {
    const appAccountToken = purchaseAccountToken(subject);
    await owners.bind(accountTokenKey(appAccountToken), subject);
    return { appAccountToken };
  }
  /** Verify a phone purchase or restore. Idempotent.
   * @param {string} subject @param {{store:'ios'|'android',proof:string,productId:string}} input */
  function subscribe(subject, input) {
    return serial(subject, async () => {
      await purchaseAccount(subject);
      const value = await verifier.verify(input.store, input.proof);
      if (value.product !== input.productId)
        throw new PairingError(403, 'Subscription product does not match the purchase.');
      await apply(subject, value);
      return body(subject);
    });
  }
  /** Bind and persist verified store state, then acknowledge and reconcile.
   * @param {string} subject @param {VerifiedSubscription} value @param {boolean} [reconcileAfter] */
  async function apply(subject, value, reconcileAfter = true) {
    if (value.accountToken && value.accountToken !== purchaseAccountToken(subject))
      throw new PairingError(409, subscriptionClaimed);
    // Bind all chain ancestors, including upgrades never posted by the phone.
    const keys = [subscriptionKey(value.store, value.id)];
    const seen = new Set([value.id]);
    let linked = value.linkedId;
    while (linked && !seen.has(linked)) {
      seen.add(linked);
      const key = subscriptionKey(value.store, linked);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Resolve ownership before following this ancestor's next link.
      const owner = await owners.owner(key);
      if (owner && owner !== subject) throw new PairingError(409, subscriptionClaimed);
      keys.push(key);
      if (owner) break;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each verified ancestor supplies the next token in the chain.
        const previous = await verifier.read(value.store, linked);
        if (previous.accountToken && previous.accountToken !== purchaseAccountToken(subject))
          throw new PairingError(409, subscriptionClaimed);
        linked = previous.linkedId;
      } catch (error) {
        // Old Google tokens can leave the lookup window. Only a store-bound account
        // identifier may bridge an unverifiable, previously unbound ancestor.
        if (
          error instanceof PairingError &&
          error.status === 403 &&
          value.accountToken === purchaseAccountToken(subject)
        )
          break;
        throw error;
      }
    }
    // Bind oldest first so a conflicting ancestor stops the chain before its descendants are claimed.
    for (let key = keys.pop(); key !== undefined; key = keys.pop()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Confirm each ancestor binding before claiming its descendant.
      await owners.bind(key, subject);
    }
    if (needsAcknowledgement(value)) await verifier.acknowledge(value);
    billing.saveSubscription(subject, value, now());
    if (reconcileAfter) await reconcile(subject);
  }
  /** Hourly re-verification on read and alarm; outages never extend provider expiry.
   * @param {string} subject */
  async function refresh(subject) {
    const at = now();
    for (const row of billing.subscriptions(subject)) {
      if (row.status === 'revoked' || row.verified > at - hour) continue;
      if (row.status === 'expired' && (row.expiresAt ?? 0) < at - 60 * day) continue;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Accounts hold few subscriptions; keep store API use sequential.
        const current = await verifier.read(row.store, row.id);
        // oxlint-disable-next-line eslint/no-await-in-loop -- Persist this verified chain before refreshing another subscription.
        await apply(subject, current, false);
      } catch (error) {
        if (error instanceof PairingError && error.status === 403)
          billing.saveSubscription(subject, { ...row, status: 'expired' }, now());
        else
          console.error(
            'Cloud subscription refresh failed; capacity still ends at provider expiry.',
          );
      }
    }
  }
  /** Notification for an account already resolved from the purchase binding.
   * @param {string} subject @param {StoreEvent} event */
  function notification(subject, event) {
    return serial(subject, async () => {
      if (event.kind === 'lifetime') {
        if (billing.revocation(subject)) {
          await lifetimeRevoked(subject);
          return;
        }
        if (!billing.purchaseHeld(subject, event.store, event.id)) return;
        // An old signed callback must not delete a purchase whose refund was reversed.
        // Confirmed store denials revoke immediately; verification outages retry upstream.
        await refreshEntitlement(subject, true);
        await reconcile(subject);
        return;
      }
      const stored = billing
        .subscriptions(subject)
        .find((row) => row.store === event.store && row.id === event.id);
      // Replayed callbacks cannot resurrect a chain already revoked. An owner may
      // explicitly restore with a newly verified proof if the store reverses the revocation.
      if (stored?.status === 'revoked' && !event.revoked) return;
      let current;
      try {
        current = await verifier.read(event.store, event.id);
      } catch (error) {
        if (!event.revoked || !stored || !(error instanceof PairingError) || error.status !== 403)
          throw error;
        current = { ...stored, accountToken: null, acknowledged: true };
      }
      await apply(subject, event.revoked ? { ...current, status: 'revoked' } : current);
    });
  }

  /** Delete exports through the normal path (R2 included) and record each in activity history.
   * @param {string} subject @param {{id:string,device:string,size:number}[]} rows @param {string} reason */
  async function removeExports(subject, rows, reason) {
    let bytes = 0;
    for (const item of rows) {
      const row = cloud.row(subject, item.id);
      /** @type {{name:string,selection:import('../core/profiles.js').ExportProfile['selection']}} */
      let profile = { name: 'Cloud export', selection: { health: [], time: [], location: [] } };
      try {
        profile = cloud.metadata(row).profile;
      } catch {
        // Deletion must not depend on readable metadata.
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each deletion is confirmed before it is recorded.
      await cloud.delete(subject, item.id);
      bytes += item.size;
      const stamp = new Date(now()).toISOString();
      history.record(subject, row.device, {
        id: randomUUID(),
        kind: 'export',
        schema: /** @type {import('../core/export-schemas.js').ExportSchema} */ (row.schema),
        startedAt: stamp,
        updatedAt: stamp,
        status: 'expired',
        actor: 'schedule',
        client: null,
        target: 'cloud',
        destination: 'myself.md Cloud',
        profile: { id: row.profile, name: profile.name, selection: profile.selection },
        interval: {
          start: new Date(Date.parse(row.day)).toISOString(),
          end: new Date(Date.parse(row.day) + day).toISOString(),
        },
        timezone: 'UTC',
        formats: [row.format],
        recordCount: null,
        artifacts: [],
        warnings: [reason],
        relatedId: item.id,
        error: null,
      });
    }
    return bytes;
  }
  /** Lapse executor: start, cancel, remind and delete. Runs after every entitlement change and on alarms.
   * @param {string} subject */
  function reconcile(subject) {
    return serial(subject, async () => {
      if (billing.revocation(subject)) await lifetimeRevoked(subject);
      const at = now();
      const exports = cloud.usage(subject);
      const used = exports.reduce((sum, item) => sum + item.size, 0);
      const entitlement = billing.cloudEntitlement(subject, at);
      const stored = billing.lapse(subject);
      // Lapses follow paid storage; a held Lifetime survives a delayed hourly store check.
      const lapse =
        stored || billing.hasSubscriptionHistory(subject)
          ? nextLapse({ ...entitlement, lifetime: billing.lifetimeHeld(subject) }, used, at)
          : null;
      const plan = entitlement.subscription?.plan ?? null;
      if (!lapse) {
        if (stored) {
          billing.setLapse(subject, null);
          billing.dropNotices(subject, 'lapse:');
        }
      } else if (at >= lapse.deleteAt) {
        billing.setLapse(subject, lapse);
        const victims = new Set(retentionVictims(exports, lapse.targetBytes));
        const deleted = await removeExports(
          subject,
          exports.filter((item) => victims.has(item.id)),
          `Deleted automatically 30 days after Cloud ended, oldest first, to fit the remaining ${lapse.targetBytes / 1_000_000} MB allowance.`,
        );
        billing.setLapse(subject, null);
        billing.dropNotices(subject, 'lapse:');
        if (deleted)
          billing.queueNotice(
            subject,
            `deleted:${lapse.startedAt}`,
            'lapse-deleted',
            { deleteAt: at, bytesToDelete: deleted, plan, targetBytes: lapse.targetBytes },
            at,
          );
      } else {
        billing.setLapse(subject, lapse);
        const due = lapseRemindersDue(lapse, billing.lapse(subject)?.sent ?? [], at);
        for (const offset of due)
          billing.queueNotice(
            subject,
            `lapse:${lapse.startedAt}:${offset}`,
            `lapse-${offset}`,
            {
              deleteAt: lapse.deleteAt,
              bytesToDelete: Math.max(0, used - lapse.targetBytes),
              targetBytes: lapse.targetBytes,
              plan,
            },
            at,
          );
      }
      await deliver(subject);
      const wake = nextWake(subject, at);
      if (wake !== null) await arm(wake);
      return wake;
    });
  }
  /** @param {string} subject @param {number} at */
  function nextWake(subject, at) {
    const current = billing.lapse(subject);
    const times = current
      ? [
          ...cloudReminderDays
            .filter((offset) => !current.sent.includes(offset))
            .map((offset) => current.lapse.startedAt + offset * day),
          current.lapse.deleteAt,
        ].filter((time) => time > at)
      : [];
    if (billing.revocation(subject)) times.push(at + 60000);
    for (const row of billing.subscriptions(subject))
      if (subscriptionEntitled(row) && row.expiresAt !== null && row.expiresAt > at)
        times.push(row.expiresAt);
    if (billing.subscriptions(subject).some((row) => row.status !== 'revoked'))
      times.push(at + hour);
    if (billing.pendingNotices(subject).length) times.push(at + hour);
    return times.length ? Math.min(...times) : null;
  }
  /** Push and email each pending notice. A channel is retried on the next alarm until it succeeds;
   * reminder days are recorded only once every available channel has delivered.
   * @param {string} subject */
  async function deliver(subject) {
    for (const notice of billing.pendingNotices(subject)) {
      const message = cloudNotice(
        /** @type {import('../core/cloud-notices.js').CloudNoticeKind} */ (notice.kind),
        notice.details,
      );
      let { push, email } = notice;
      /** @type {{channel:string,message:string}|null} */
      let failure = null;
      if (push === 0) {
        const tokens = pushTokens(subject);
        if (!tokens.length) push = 2;
        else {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Record each notice's outcome before the next.
          const results = await Promise.all(
            tokens.map((to) =>
              sendExpoPush(send, {
                to,
                title: message.title,
                body: message.body,
                channelId: 'cloud-storage',
                data: { type: 'cloud-storage', url: 'myselfmd://cloud-storage' },
              }).catch(() => ({ accepted: false, unregistered: false })),
            ),
          );
          if (
            results.every((result) => result.accepted || result.unregistered) &&
            results.some((result) => result.accepted)
          )
            push = 1;
          else if (results.every((result) => result.unregistered)) push = 2;
          else
            failure = {
              channel: 'push',
              message:
                'Push gateway did not accept the notification. Check connectivity and Expo/APNs/FCM credentials; reopen the phone to refresh its token.',
            };
        }
      }
      if (email === 0) {
        if (!mailer.configured)
          failure = {
            channel: 'email',
            message: 'Email delivery is not configured; the notice will retry.',
          };
        else
          try {
            // oxlint-disable-next-line eslint/no-await-in-loop -- Record each notice's outcome before the next.
            const to = await accountEmail(subject);
            if (!to)
              failure = {
                channel: 'email',
                message: 'Account email is unavailable; the notice will retry.',
              };
            else {
              // oxlint-disable-next-line eslint/no-await-in-loop -- Record each notice's outcome before the next.
              await mailer.send({
                to,
                subject: message.emailSubject,
                text: message.emailText,
                html: message.emailHtml,
              });
              email = 1;
            }
          } catch (error) {
            const code =
              error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            failure = {
              channel: 'email',
              message: `Email delivery failed${/^[A-Za-z_]+$/.test(code) ? ` (${code})` : ''}.`,
            };
          }
      }
      if (push === 2 && email === 2 && !failure)
        failure = {
          channel: 'all',
          message:
            'No registered push token or email delivery is available for this account; the notice was not delivered.',
        };
      // Delivery outages remain retryable; there is no arbitrary attempt cutoff.
      billing.noticeResult(subject, notice.id, { push, email, failure }, now());
      const reminder = notice.id.match(/^lapse:(\d+):(\d+)$/);
      if (reminder && push !== 0 && email !== 0)
        billing.markRemindersSent(subject, Number(reminder[1]), [Number(reminder[2])]);
    }
  }
  /** Lifetime refunded or revoked by the store: no storage remains, so every export is deleted immediately.
   * Complimentary grants or another verified purchase keep Lifetime and skip deletion.
   * @param {string} subject */
  function lifetimeRevoked(subject) {
    return serial(subject, async () => {
      if (
        billing.lifetimeHeld(subject) ||
        subscriptionEntitled(billing.cloudSubscription(subject, now()))
      ) {
        billing.clearRevocation(subject);
        return;
      }
      const at = now();
      const exports = cloud.usage(subject);
      const subscription = billing.cloudSubscription(subject, at);
      const billed = subscriptionEntitled(subscription) ? (subscription?.plan ?? null) : null;
      billing.queueRevocation(
        subject,
        at,
        exports.reduce((sum, item) => sum + item.size, 0),
        billed,
      );
      const intent = billing.revocation(subject);
      await arm(at + 60000);
      await removeExports(
        subject,
        exports,
        'Deleted because lifetime access was refunded or revoked; no active Cloud subscription remains.',
      );
      billing.setLapse(subject, null);
      billing.dropNotices(subject, 'lapse:');
      if (intent)
        billing.queueNotice(
          subject,
          `revoked:${intent.at}`,
          'lifetime-revoked-deleted',
          { deleteAt: at, bytesToDelete: intent.bytes, plan: intent.plan },
          at,
        );
      billing.clearRevocation(subject);
      await deliver(subject);
      const wake = nextWake(subject, at);
      if (wake !== null) await arm(wake);
    });
  }
  /** Alarm and self-hosted interval entry point. Returns the next time work is due.
   * @param {string} subject */
  function maintain(subject) {
    return serial(subject, async () => {
      await refreshLifetime(subject);
      await refresh(subject);
      return reconcile(subject);
    });
  }

  return {
    run: serial,
    status,
    purchaseAccount,
    subscribe,
    notification,
    reconcile,
    lifetimeRevoked,
    maintain,
  };
}
