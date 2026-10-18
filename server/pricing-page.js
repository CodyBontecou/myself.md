import { publicSiteHeader, publicSiteHeaderStyles } from '../core/site-header.js';
import { freeExports, lifetimePurchaseGuide } from '../core/billing.js';
import { publicLifetimePrice, publicCloudPlans } from '../core/public-site.js';
import { cloudRetentionDays } from '../core/cloud-allowance.js';

/** Public purchase guidance; checkout and payment confirmation remain in the phone app. */
export function pricingPage() {
  const purchase = lifetimePurchaseGuide();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pricing · myself.md</title>
  <meta name="description" content="Try myself.md free, unlock unlimited exports with a one-time Lifetime purchase, and add optional cloud storage.">
  <link rel="canonical" href="https://myself.md/pricing">
  <style>
    :root { color-scheme: light dark; --bg: #fafafa; --surface: #fff; --text: #171717; --muted: #666; --line: #e5e5e5; --soft: #f3f3f3; --primary: #171717; --on-primary: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-underline-offset: 4px; }
    a:focus-visible, summary:focus-visible { outline: 2px solid var(--text); outline-offset: 5px; }
    .shell { max-width: 1040px; padding: 28px 32px 32px; margin: auto; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .brand { font-size: 20px; font-weight: 650; letter-spacing: -.8px; text-decoration: none; }
    nav { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 13px; color: var(--muted); }
    nav a { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; }
    nav a:hover { color: var(--text); text-decoration: underline; }
    .hero { max-width: 650px; padding: 72px 0 40px; }
    .eyebrow { margin: 0 0 16px; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; font-weight: 600; }
    h1 { margin: 0; font-size: clamp(36px, 5vw, 56px); line-height: 1.08; font-weight: 600; letter-spacing: -2px; }
    .intro { margin: 20px 0 0; max-width: 540px; color: var(--muted); font-size: 17px; line-height: 1.7; }
    .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .plan { display: flex; flex-direction: column; padding: 32px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; }
    .plan.lifetime { border-color: var(--text); }
    .plan-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h2, h3 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.4px; }
    .badge { padding: 5px 9px; border-radius: 6px; background: var(--soft); color: var(--muted); font-size: 11px; font-weight: 500; }
    .price { margin: 24px 0 12px; font-size: 46px; font-weight: 600; line-height: 1.1; letter-spacing: -1.8px; font-variant-numeric: tabular-nums; }
    .price span { margin-left: 6px; font-size: 13px; color: var(--muted); font-weight: 400; letter-spacing: 0; }
    .description { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .features { list-style: none; padding: 24px 0; margin: 0 0 auto; display: grid; gap: 14px; font-size: 14px; }
    .features li { display: flex; gap: 10px; line-height: 1.5; }
    .features li::before { content: '✓'; color: var(--muted); }
    .button { min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 12px 16px; border: 1px solid var(--line); border-radius: 9px; font-size: 14px; font-weight: 600; text-align: center; text-decoration: none; }
    .button:hover { opacity: .8; }
    .primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
    .caption { margin: 12px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
    .availability { margin: 20px 0 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
    .cloud { margin-top: 64px; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    .cloud h2 { font-size: 26px; letter-spacing: -.7px; }
    .cloud > p { max-width: 660px; margin: 14px 0 28px; }
    .cloud-table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    .cloud-table th { padding: 12px 0; color: var(--muted); font-size: 12px; font-weight: 500; border-bottom: 1px solid var(--line); }
    .cloud-table td { padding: 20px 0; border-bottom: 1px solid var(--line); line-height: 1.6; }
    .cloud-table td:first-child { width: 30%; font-size: 18px; font-weight: 600; }
    .cloud-table td:last-child, .cloud-table th:last-child { text-align: right; }
    .cloud-table td span { display: block; color: var(--muted); font-size: 12px; font-weight: 400; }
    .cloud-action { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin-top: 24px; font-size: 13px; }
    .cloud-action .button { background: var(--surface); }
    .existing { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px; margin: 48px 0; background: var(--soft); border-radius: 12px; }
    .existing h2 { font-size: 16px; }
    .existing p { margin: 8px 0 0; }
    .existing a { flex-shrink: 0; font-size: 13px; font-weight: 600; }
    .details { margin: 48px 0; }
    .details > h2 { margin-bottom: 16px; }
    details { border-bottom: 1px solid var(--line); }
    summary { padding: 20px 0; cursor: pointer; font-size: 14px; font-weight: 500; line-height: 1.5; }
    details p { max-width: 780px; margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.8; }
    footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
    @media (prefers-color-scheme: dark) { :root { --bg: #171717; --surface: #202020; --text: #fafafa; --muted: #aaa; --line: #363636; --soft: #262626; --primary: #fafafa; --on-primary: #171717; } }
    @media (max-width: 640px) { .shell { padding: 20px; } header { align-items: flex-start; gap: 12px; } header nav { gap: 16px; } .hero { padding: 48px 0 32px; } h1 { letter-spacing: -1.3px; } .plans { grid-template-columns: 1fr; gap: 16px; } .plan { padding: 24px; } .cloud { margin-top: 48px; } .section-heading { display: block; } .section-heading .badge { display: inline-block; margin-top: 12px; } .existing { align-items: flex-start; flex-direction: column; } .cloud-table td { padding: 16px 0; } }
    ${publicSiteHeaderStyles}
  </style>
</head>
<body>
  <div class="shell">
    ${publicSiteHeader('/pricing')}
    <main>
      <section class="hero" aria-labelledby="pricing-heading"><p class="eyebrow">Pricing</p><h1 id="pricing-heading">Start free.<br>Make it yours for life.</h1><p class="intro">Save the data you choose as files you control. Try your first ${freeExports} exports or queries free, then unlock Lifetime with one purchase.</p></section>
      <div class="plans">
        <section class="plan" aria-labelledby="free-title"><div class="plan-heading"><h2 id="free-title">Free</h2><span class="badge">A place to start</span></div><p class="price">$0</p><p class="description">Try myself.md with your own data.</p><ul class="features"><li>${freeExports} exports or queries</li><li>Choose your data types and date ranges</li><li>Save readable JSON or JSONL files</li><li>Free cloud dashboard demo and dataset previews</li></ul><a class="button" href="myselfmd://">Open the app for free</a><p class="caption">Requires the installed iOS or Android app.</p></section>
        <section class="plan lifetime" aria-labelledby="lifetime-title"><div class="plan-heading"><h2 id="lifetime-title">Lifetime</h2><span class="badge">One-time purchase</span></div><p class="price">${publicLifetimePrice}<span>USD, once</span></p><p class="description">Keep exporting without usage limits.</p><ul class="features"><li>Unlimited exports and queries</li><li>No recurring app subscription</li><li>${publicCloudPlans[0]?.capacity} of included cloud storage</li><li>Optional cloud plans when you need more space</li></ul><a class="button primary" href="${purchase.appLink}">Unlock Lifetime in the app</a><p class="caption">Review and confirm your localized store price at checkout.</p></section>
      </div>
      <p class="availability">${purchase.availability} Opening the app does not confirm payment or grant access.</p>
      <section class="cloud" aria-labelledby="cloud-heading"><div class="section-heading"><h2 id="cloud-heading">A home for your cloud exports.</h2><span class="badge">Optional storage</span></div><p class="description">Keep encrypted exports in your account and connect agents through a hosted MCP server. Cloud storage requires an account and Lifetime access. Larger plans replace your included storage.</p><table class="cloud-table"><caption class="eyebrow">Cloud storage plans · US prices</caption><thead><tr><th scope="col">Storage</th><th scope="col">Price</th><th scope="col">Billing</th></tr></thead><tbody>${publicCloudPlans.map((plan) => `<tr><td>${plan.capacity}</td><td>${plan.price}<span>${plan.billing}</span></td><td>${plan.id === 'included' ? 'With Lifetime' : 'Subscription'}</td></tr>`).join('')}</tbody></table><div class="cloud-action"><a class="button" href="myselfmd://cloud-storage">Choose a plan in the app</a><a href="/demo">Explore the cloud dashboard demo ↗</a></div></section>
      <aside class="existing"><div><h2>Already own health.md, iso.me, or time.md?</h2><p class="description">Eligible purchases include complimentary Lifetime access after verification.</p></div><a href="/claim">Claim your access ↗</a></aside>
      <section class="details" aria-labelledby="details-heading"><h2 id="details-heading">Before you choose</h2><details><summary>How does the Lifetime purchase work?</summary><p>${purchase.instructions} ${purchase.accountInstructions} Lifetime removes export and query usage limits; it does not include unlimited hosted storage. A refunded Lifetime purchase deletes all cloud exports.</p></details><details><summary>How are cloud subscriptions billed?</summary><p>US prices are shown above. Apple and Google show your localized store price and billing period at checkout. Paid plans renew automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel in App Store or Google Play subscription settings; refunds are handled by the store. The dashboard and agents hand off purchases to the app.</p></details><details><summary>What happens if my paid storage ends?</summary><p>Storage continues during the store’s billing grace period. If paid storage ends while you use more than ${publicCloudPlans[0]?.capacity}, your files stay for ${cloudRetentionDays} days with push and email reminders. Resubscribe or delete files before then, or the oldest exports are deleted until your usage fits the included allowance. Plan capacities replace one another; they do not add up.</p></details></section>
    </main>
    <footer><span>Your phone. Your data.</span><nav aria-label="Help and policies"><a href="/contact">Contact</a><a href="/faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav></footer>
  </div>
</body>
</html>`;
}
