export const freeExports = 5;
export const lifetimeProductId = 'myself_md_lifetime';
/** Opening checkout is a user handoff; only verified store proof unlocks access. */
export function lifetimePurchaseGuide() {
  return {
    appLink: 'myselfmd://unlock',
    requiresUser: true,
    instructions:
      'Open the installed iOS or Android app, review the localized store price, then confirm the one-time Lifetime purchase. Use Restore purchases for a purchase already made with this store account.',
    accountInstructions:
      'For cloud access, sign in to the app with the same account as your dashboard or MCP connection, then check lifetime access.',
    availability:
      'Requires an installed app. Public App Store and Google Play downloads are coming soon. TestFlight sandbox purchases do not unlock production access.',
  };
}
/** Shared guidance for mobile and agent purchase-verification handoffs. */
export function existingCustomerGuide() {
  const timeClaimUrl = 'https://timemd.app/myself-claim.html';
  return {
    title: 'Already own health.md, iso.me, or time.md?',
    summary: 'Your eligible purchase includes free lifetime access to myself.md.',
    apps: [
      ...['health.md', 'iso.me'].map((app) => ({
        id: app === 'health.md' ? 'health' : 'iso',
        name: app,
        handoffUrl: app === 'health.md' ? 'healthmd://myself/claim' : 'isome://myself/claim',
        steps: [
          {
            title: `Open ${app}`,
            body: 'The button below opens Claim myself.md access. Choose Verify purchase and continue.',
          },
          {
            title: 'Confirm your account',
            body: 'In the browser, sign in and confirm the account receiving access.',
          },
          {
            title: 'Return to myself.md',
            body: 'Sign in with the same account, then choose Check lifetime access.',
          },
        ],
        eligibility: `${app === 'health.md' ? 'Paid downloads and lifetime purchases qualify.' : 'Lifetime purchases qualify.'} Individual and Family purchasers can claim for one account. Family-shared recipients do not qualify.`,
      })),
      {
        id: 'time',
        name: 'time.md',
        handoffUrl: timeClaimUrl,
        steps: [
          {
            title: 'Have your activation key ready',
            body: 'Enter it on the purchase verification page.',
          },
          {
            title: 'Confirm your account',
            body: 'Sign in and confirm the account receiving access. Return here and use that same account.',
          },
        ],
        eligibility:
          'Paid licenses qualify. Trials, free licenses, refunded and disputed payments do not qualify.',
      },
    ],
    steps: [
      {
        title: '1. Verify in your original app',
        body: 'Open Settings in health.md or iso.me, choose Claim myself.md access, then Verify purchase and continue.',
      },
      {
        title: '2. Choose your myself.md account',
        body: 'The claim opens in your browser. Sign in with Apple, GitHub, or Google, check the account shown, and confirm lifetime access.',
      },
      {
        title: '3. Sign in here with the same account',
        body: 'Return to myself.md, open your account from Settings, and sign in with the same account. Choose Check lifetime access if needed. No agent pairing is required.',
      },
    ],
    eligibility:
      'Eligible paid health.md downloads and lifetime purchases in health.md or iso.me qualify. Individual and Family purchasers can claim for one account; family-shared recipients do not qualify.',
    timeOffer:
      'Bought time.md? Open https://timemd.app/myself-claim.html, enter your activation key, and choose Verify purchase and continue. Sign in and confirm the account receiving access. Trials, free licenses, refunded and disputed payments do not qualify.',
    timeClaimUrl,
    accountLink: 'myselfmd://account',
    requiresUser: true,
  };
}
/** @typedef {{used:number,reserved:number,unlocked:boolean,remaining:number,complimentary?:boolean}} ExportAllowance */
/** @param {number} used @param {number} reserved @param {boolean} unlocked @returns {ExportAllowance} */
export function exportAllowance(used, reserved, unlocked) {
  return { used, reserved, unlocked, remaining: Math.max(0, freeExports - used - reserved) };
}
