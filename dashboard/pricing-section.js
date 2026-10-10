import { freeExports } from '../core/billing.js';
import { publicLifetimePrice, publicCloudPlans } from '../core/public-site.js';

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-8 space-y-8">
      <div className="space-y-3">
        <h2 id="pricing-title" className="text-2xl font-medium tracking-tight">
          Pricing
        </h2>
        <p className="text-base leading-8 text-muted-foreground sm:text-lg">
          Start free. Unlock once. Keep your files for life.
        </p>
      </div>
      <div className="grid gap-8 border-y border-border py-8 sm:grid-cols-2 sm:gap-0">
        <div className="space-y-5 sm:pr-8">
          <h3 className="text-lg font-medium">Free</h3>
          <p className="text-4xl font-medium tracking-tight">$0</p>
          <p className="text-base leading-7 text-muted-foreground">
            {freeExports} exports or queries to try the app with your own data.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Choose the data you want to keep</li>
            <li>Export readable JSON or JSONL files</li>
            <li>Explore the public demo with fictional data</li>
          </ul>
        </div>
        <div className="space-y-5 border-t border-border pt-8 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-8">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-medium">Lifetime</h3>
            <span className="text-xs text-muted-foreground">Coming soon</span>
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
          <p className="text-sm text-muted-foreground">Available on iOS and Android at launch.</p>
        </div>
      </div>
      <section aria-labelledby="cloud-pricing-title" className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 id="cloud-pricing-title" className="text-xl font-medium">
              Optional cloud storage
            </h3>
            <span className="text-xs text-muted-foreground">Coming soon</span>
          </div>
          <p className="text-base leading-7 text-muted-foreground">
            Store your exports in the cloud and connect your agents through a hosted MCP server.
            Lifetime users get a 30-day free trial with 50 MB of storage. Requires an account; paid
            cloud storage is a separate subscription.
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {publicCloudPlans.map((plan) => (
            <div
              key={plan.capacity}
              className="flex flex-wrap items-center justify-between gap-3 py-5"
            >
              <h4 className="text-lg font-medium">{plan.capacity}</h4>
              <div className="text-right">
                <p className="text-sm font-medium">{plan.price}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.billing}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Planned US pricing. Cloud plans are coming soon; Apple and Google will show your localized
          subscription price at checkout.
        </p>
        <a href="/demo" className="inline-block text-sm underline underline-offset-4">
          Try the free demo
        </a>
      </section>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          Planned US price. Apple and Google show your localized price at checkout. Lifetime access
          does not include unlimited hosted storage.
        </p>
        <p>
          Already own an eligible health.md or iso.me purchase? You can claim lifetime access after
          verifying your purchase.
        </p>
      </div>
    </section>
  );
}
