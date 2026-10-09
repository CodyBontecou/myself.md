import { join } from 'node:path';
import { BillingStore } from '../server/billing-store.js';
const args = process.argv.slice(2);
const subject = args[args.indexOf('--subject') + 1];
const payment = args[args.indexOf('--stripe-payment') + 1];
if (
  !args.includes('--subject') ||
  !args.includes('--stripe-payment') ||
  !payment ||
  !subject?.includes('|') ||
  !/^(pi_|ch_)[A-Za-z0-9]+$/.test(payment ?? '')
)
  throw new Error(
    'Usage: npm run billing:grant -- --subject <ACCOUNT_NAMESPACE|account-id> --stripe-payment <pi_... or ch_...>. Verify the Stripe purchase first.',
  );
const store = new BillingStore(join(process.env.DATA_DIR ?? '.local', 'billing.sqlite'));
try {
  store.grant(subject, 'time.md:stripe', payment);
  console.log('Complimentary lifetime access granted to the account.');
} finally {
  store.db.close();
}
