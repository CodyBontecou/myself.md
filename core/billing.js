export const freeExports = 5;
export const lifetimeProductId = 'myself_md_lifetime';
/** Shared guidance for mobile and agent purchase-verification handoffs. */
export function existingCustomerGuide() {
  return {
    title: 'Already own health.md, iso.me, or time.md?',
    summary: 'Your eligible purchase includes free lifetime access to myself.md.',
    steps: [
      {
        title: '1. Verify in your original app',
        body: 'Open Settings in health.md or iso.me, choose Claim myself.md access, then Verify purchase and continue.',
      },
      {
        title: '2. Choose your myself.md account',
        body: 'The claim opens in your browser. Sign in with Apple or GitHub, check the account shown, and confirm lifetime access.',
      },
      {
        title: '3. Sign in here with the same account',
        body: 'Return to myself.md, sign in below, then choose Check lifetime access if needed. No agent pairing is required.',
      },
    ],
    eligibility:
      'Eligible paid health.md downloads and lifetime purchases in health.md or iso.me qualify. Individual and Family purchasers can claim for one account; family-shared recipients do not qualify.',
    timeOffer:
      'Bought time.md? Contact the developer with your Stripe purchase receipt to request your offer. After it is activated, sign in here with the account that received access.',
    accountLink: 'qrconnect://account',
    requiresUser: true,
  };
}
/** @typedef {{used:number,reserved:number,unlocked:boolean,remaining:number,complimentary?:boolean}} ExportAllowance */
/** @param {number} used @param {number} reserved @param {boolean} unlocked @returns {ExportAllowance} */
export function exportAllowance(used, reserved, unlocked) {
  return { used, reserved, unlocked, remaining: Math.max(0, freeExports - used - reserved) };
}
