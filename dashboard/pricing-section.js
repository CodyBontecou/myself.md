import QRCode from 'qrcode';
import { freeExports, lifetimePurchaseGuide } from '../core/billing.js';
import { publicLifetimePrice, publicCloudPlans } from '../core/public-site.js';
import { cloudRetentionDays } from '../core/cloud-allowance.js';
import { Button } from './components/ui/button.js';

const purchase = lifetimePurchaseGuide();
const qr = QRCode.create(purchase.appLink);
const qrPath = Array.from(qr.modules.data, (dark, index) =>
  dark
    ? `M${(index % qr.modules.size) + 4} ${Math.floor(index / qr.modules.size) + 4}h1v1h-1z`
    : '',
).join('');

export function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="site-pricing scroll-mt-8 space-y-8"
    >
      <div className="space-y-3">
        <h2 id="pricing-title" className="text-2xl font-medium tracking-tight">
          Pricing
        </h2>
        <p className="text-base leading-8 text-muted-foreground sm:text-lg">
          Start free. Buy Lifetime or subscribe to Cloud.
        </p>
      </div>
      <div className="pricing-cards">
        <div className="pricing-card space-y-5">
          <h3 className="text-lg font-medium">Free</h3>
          <p className="text-4xl font-medium tracking-tight">$0</p>
          <p className="text-base leading-7 text-muted-foreground">
            {freeExports} exports or queries to try the app with your own data.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Choose the data you want to keep</li>
            <li>Export readable JSON or JSONL files</li>
            <li>Preview supported datasets with fictional data</li>
          </ul>
          <Button asChild variant="outline">
            <a href="myselfmd://">Open the app for free</a>
          </Button>
          <p className="text-sm text-muted-foreground">
            Already installed? Start with no purchase.
          </p>
        </div>
        <div className="pricing-card pricing-lifetime space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-medium">Lifetime</h3>
            <span className="text-xs text-muted-foreground">In-app purchase</span>
          </div>
          <p className="text-4xl font-medium tracking-tight">
            {publicLifetimePrice}
            <span className="ml-2 text-sm font-normal tracking-normal text-muted-foreground">
              one time
            </span>
          </p>
          <p className="text-base leading-7 text-muted-foreground">
            Remove export and query limits with a single purchase.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Everything in Free</li>
            <li>Unlimited exports and queries</li>
            <li>No recurring app subscription</li>
          </ul>
          <Button asChild>
            <a href={purchase.appLink}>Unlock Lifetime in the app</a>
          </Button>
          <p className="text-sm leading-6 text-muted-foreground">
            {purchase.instructions} Payment is confirmed by Apple or Google.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer underline underline-offset-4">
              On a computer? Scan to open checkout on your phone
            </summary>
            <div className="mt-4 space-y-3">
              <svg
                role="img"
                aria-label="QR code to open Lifetime checkout in myself.md"
                width={176}
                height={176}
                viewBox={`0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`}
                shapeRendering="crispEdges"
              >
                <rect width="100%" height="100%" fill="white" />
                <path d={qrPath} fill="black" />
              </svg>
              <p className="leading-6 text-muted-foreground">
                Scan with your phone’s camera, or open this page on your phone and tap Unlock
                Lifetime. The app must already be installed.
              </p>
            </div>
          </details>
        </div>
      </div>
      <a className="pricing-full-link" href="/pricing">
        View all plans and purchase details ↗
      </a>
      <section aria-labelledby="cloud-pricing-title" className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 id="cloud-pricing-title" className="text-xl font-medium">
              myself.md Cloud
            </h3>
            <span className="text-xs text-muted-foreground">In-app subscription</span>
          </div>
          <p className="text-base leading-7 text-muted-foreground">
            Store your exports in the cloud and connect your agents through a hosted MCP server.
            Lifetime users get {publicCloudPlans[0]?.capacity} of included storage with no recurring
            charge. Cloud includes 100 GB and app access while subscribed, with no Lifetime purchase
            required. Sign in with your account to subscribe.
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {publicCloudPlans
            .filter((plan) => plan.id !== 'included')
            .map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-5">
                <h4 className="text-lg font-medium">{plan.capacity}</h4>
                <div className="text-right">
                  <p className="text-sm font-medium">{plan.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.billing}</p>
                </div>
              </div>
            ))}
        </div>
        <Button asChild variant="outline">
          <a href="myselfmd://cloud-storage">Subscribe to Cloud in the app</a>
        </Button>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            US prices shown. Apple and Google show your localized price and billing period at
            checkout. Plans are auto-renewing subscriptions that renew unless cancelled at least 24
            hours before the current period ends. Manage or cancel them in your App Store or Google
            Play subscription settings; refunds are handled by the store.
          </p>
          <p>
            Storage continues during the store’s billing grace period. If paid storage ends while
            your files exceed the remaining allowance ({publicCloudPlans[0]?.capacity} with
            Lifetime, zero otherwise), your files stay for {cloudRetentionDays} days with push and
            email reminders. Resubscribe or delete files before then, or the oldest exports are
            deleted until usage fits. See the{' '}
            <a href="/terms" className="underline underline-offset-4">
              terms
            </a>
            .
          </p>
        </div>
      </section>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          US Lifetime price shown. Apple and Google show your localized price at checkout. Lifetime
          access does not include unlimited hosted storage. {purchase.availability}
        </p>
        <p>{purchase.accountInstructions}</p>
        <p>
          Already own an eligible health.md or iso.me purchase? You can claim lifetime access after
          verifying your purchase.
        </p>
      </div>
    </section>
  );
}
