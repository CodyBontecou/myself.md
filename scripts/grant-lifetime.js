import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
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
const worker = args.includes('--worker') ? args[args.indexOf('--worker') + 1] : null;
if (args.includes('--worker') && !worker)
  throw new Error('Specify the HTTPS Worker origin after --worker.');
if (worker) {
  if (new URL(worker).protocol !== 'https:') throw new Error('Use the HTTPS hosted Worker URL.');
  const secret = parseEnv(readFileSync('.dev.vars', 'utf8')).IMPORT_SECRET;
  if (!secret) throw new Error('Set the private IMPORT_SECRET in .dev.vars.');
  const response = await fetch(new URL('/__migration', worker), {
    method: 'POST',
    headers: { Authorization: `Migration ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'grant_time', name: subject, payment }),
  });
  if (!response.ok)
    throw new Error(
      `Grant failed (${response.status}). Enable migration mode for an operator grant, then disable it immediately afterward.`,
    );
} else {
  const store = new BillingStore(join(process.env.DATA_DIR ?? '.local', 'billing.sqlite'));
  try {
    store.grant(subject, 'time.md:stripe', payment);
  } finally {
    store.db.close();
  }
}
console.log('Complimentary lifetime access granted to the account.');
