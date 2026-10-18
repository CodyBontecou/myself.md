import { exportSchemas } from './export-schemas.js';
import { serviceTerms } from './terms.js';
import { freeExports, lifetimePurchaseGuide } from './billing.js';
import { privacyPolicy } from './privacy.js';
import { cloudPlans } from './cloud-plans.js';
import { cloudRetentionDays, lifetimeCloudBytes } from './cloud-allowance.js';

const includedCloud = `${lifetimeCloudBytes / 1_000_000} MB`;

export const smitheryListingUrl = 'https://smithery.ai/servers/cody-82px/myself-md';

export const publicNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
];

const home = `# myself.md — Personal data for AI agents

myself.md brings your health, screen time and recorded location data together in files you control. Create export profiles that select data types, date ranges and destinations. Use local files, your own HTTPS endpoint, or the paired cloud service. Native sources differ between iOS and Android, and operating-system permissions still apply.

## When to use myself.md

Use myself.md when a person wants an AI agent to analyze their approved health records, understand screen-time patterns, or work with location points they chose to record. Use the public dataset explorer to preview fictional records before connecting any account. Never treat the demo as a real person's health data or infer permission from an empty result.

## Preview the cloud dashboard

The cloud dashboard demo at https://myself.md/demo is a free browser-only sandbox with fictional datasets and example exports. Explore the dashboard without an account or API key; changes stay in the demo and reset when you reload. Preview supported data at https://myself.md/datasets. Mobile store distribution is coming soon; source and self-hosting instructions are available at https://github.com/CodyBontecou/myself.md.

## JavaScript integration

Install the official SDK with npm install myself-md-sdk. Package: https://www.npmjs.com/package/myself-md-sdk. The official CLI is https://www.npmjs.com/package/myself-md-cli; run npx myself-md-cli health for a public service check. The SDK provides public discovery, dataset pagination and authorized asynchronous phone-query methods.

## Connect an AI agent

Add https://myself.md/mcp as a remote MCP server in a compatible client. OAuth 2.0 signs you in and asks for consent. Pair your phone and approve specific profiles and data grants before requesting private records. Agents cannot grant themselves access. Read the developer guide at https://myself.md/docs and the privacy policy at https://myself.md/privacy.

Find myself.md in the Smithery MCP directory: ${smitheryListingUrl}.

## Your data, on your terms

Review sharing permissions, revoke future reads, and inspect activity in the phone app or authenticated dashboard. Cloud export content is encrypted at rest and kept until you delete or replace it; the only exception is the ${cloudRetentionDays}-day lapse rule when paid cloud storage ends above the included allowance (see Pricing). The service decrypts approved records for authorized reads; providers receiving those records apply their own retention policies. Revocation cannot recall copies already delivered to another service.
`;
export const publicFAQs = [
  {
    question: 'Can an agent access my data without approval?',
    answer:
      'No. OAuth sign-in, a paired phone, approved profiles and data grants are required. Agents cannot grant themselves access.',
  },
  {
    question: 'Can I try myself.md without an account?',
    answer:
      'Yes. The app is free to use without an account, with an optional one-time lifetime purchase for unlimited exports and queries. Optional cloud storage requires an account.',
  },
  {
    question: 'Which data can myself.md export?',
    answer:
      'Health, screen time and recorded location data supported by the installed phone adapters. Operating-system permissions and platform limitations apply.',
  },
  {
    question: 'How do I revoke an agent’s access?',
    answer:
      'Review and revoke sharing permissions in the phone app or authenticated dashboard. Revocation prevents future reads but cannot recall copies already delivered.',
  },
  {
    question: 'What happens to my cloud files if a storage subscription ends?',
    answer: `Paid storage continues while your store subscription is active or in the store’s billing grace period. If paid storage ends while you keep Lifetime access and your cloud exports use more than ${includedCloud}, you have ${cloudRetentionDays} days to resubscribe or delete files. Reminders arrive by push notification and email when this starts, 7 days before and 1 day before. After ${cloudRetentionDays} days, the oldest cloud exports are deleted until usage is ${includedCloud} or less. Phone files are not affected.`,
  },
];
export const publicLifetimePrice = '$19.99';
/** Public cloud storage rows: the included Lifetime allowance followed by the paid tiers in `cloud-plans.js`. */
export const publicCloudPlans = [
  {
    id: 'included',
    capacity: includedCloud,
    price: 'Included with Lifetime',
    billing: 'No recurring charge',
  },
  ...cloudPlans.map((plan) => ({
    id: plan.id,
    capacity: plan.label,
    price: `${plan.usPrice.monthly} / month`,
    billing: `or ${plan.usPrice.yearly} / year`,
  })),
];
const purchaseGuide = lifetimePurchaseGuide();
const publicPricing = `The cloud dashboard demo and dataset catalog are free. The app includes ${freeExports} free exports or queries, followed by an optional one-time lifetime unlock. The US price is ${publicLifetimePrice}; actual checkout uses the localized price returned by Apple or Google. Open the installed app for free at myselfmd:// or open Lifetime checkout at ${purchaseGuide.appLink}. ${purchaseGuide.instructions} ${purchaseGuide.accountInstructions} ${purchaseGuide.availability} Opening the app does not confirm payment or grant access. Eligible existing health.md, iso.me and time.md purchasers can claim lifetime access after purchase verification. Lifetime access removes export/query usage limits and does not include unlimited hosted storage. Optional cloud storage keeps encrypted exports for your account, provides a hosted MCP server for agents and requires an account. Cloud storage plans: ${publicCloudPlans.map((plan) => `${plan.capacity}: ${plan.price} (${plan.billing})`).join('; ')}. The 10 GB and 1 TB plans are auto-renewing App Store or Google Play subscriptions bought in the installed app at myselfmd://cloud-storage. They require Lifetime access and replace the included ${includedCloud}; capacities do not add up. Prices are US prices; checkout shows the localized store price and billing period. A subscription renews automatically unless cancelled at least 24 hours before the current period ends; manage or cancel it in App Store or Google Play subscription settings, and request refunds from Apple or Google. Storage continues during the store's billing grace period. If paid storage ends while usage is above ${includedCloud}, the files stay for ${cloudRetentionDays} days with push and email reminders; resubscribe or delete files before then, or the oldest exports are deleted until usage is ${includedCloud} or less. A refunded Lifetime purchase deletes all cloud exports. The dashboard and agents cannot purchase storage; they hand off to the app. Subscription terms: https://myself.md/terms.`;
const faqMarkdown = publicFAQs.map((item) => `## ${item.question}\n\n${item.answer}`).join('\n\n');
const overview = `# Get started

Connect your AI assistant to the health, screen time and location data you choose to share. Or use the SDK and CLI to build your own integration.

## Connect an AI assistant

Directory listing: ${smitheryListingUrl}.

Add this URL as a remote MCP server in your assistant’s settings. MCP is the connection that lets an assistant use myself.md tools.

\`\`\`text
https://myself.md/mcp
\`\`\`

1. Sign in when your assistant opens the connection flow.
2. Pair your phone with the same account.
3. Approve the profiles and data types you want to share.

Your assistant can read only what you approve. Phone reads may need the app open and operating-system permissions enabled.

## Use the JavaScript SDK

Install the [official SDK](https://www.npmjs.com/package/myself-md-sdk):

\`\`\`sh
npm install myself-md-sdk
\`\`\`

Start with the public dataset catalog. It needs no account or token.

\`\`\`js
import { createMyselfClient } from 'myself-md-sdk';

const myself = createMyselfClient();
const datasets = await myself.datasets();
console.log(datasets.items);
\`\`\`

For private phone queries, use an existing agent OAuth token and an approved profile. The [API reference](/docs/reference) covers authentication, queries and results.

## Use the CLI

Check that the service is available with the [official CLI](https://www.npmjs.com/package/myself-md-cli). Requires Node.js 22.13 or later.

\`\`\`sh
npx myself-md-cli health
\`\`\`

Run \`npx myself-md-cli help\` to see the commands. Private tool calls need an owner-authorized token in \`MYSELF_TOKEN\`.

## Read your phone data

Ask your assistant to discover your phone’s available data and approved profiles, then request the records you need. A query starts a job; wait for its completed result before using the data.

- Follow every returned cursor to read the next page.
- Review capture warnings. Missing records can reflect limited permissions.
- Revoke future access in the app or dashboard whenever you need to.

See [supported datasets](/datasets) for platform availability. Data already delivered to another service follows that service’s retention policy.

## Keep going

Read the [API reference](/docs/reference) for request formats, safe retries and rate limits, or explore the [OpenAPI specification](/openapi.json).

For product questions, see [pricing](/pricing), the [privacy policy](/privacy) or [contact support](/contact).
`;
const guide = `# API reference

Use MCP to discover approved phone data, then read it through MCP or REST. Public catalog and documentation requests need no account. For setup, start with [Getting started](/docs).

## Authenticate

Connect a Streamable HTTP MCP client to:

\`\`\`text
https://myself.md/mcp
\`\`\`

Use [protected-resource metadata](/.well-known/oauth-protected-resource/mcp) and [authorization-server metadata](/.well-known/oauth-authorization-server) to find the issuer and registration, authorization and token endpoints.

Sign in with the authorization-code flow and PKCE. Request the \`myselfmd\` scope for the MCP resource. The owner completes sign-in and consent, pairs a phone, and approves the profiles and data types the agent can read. An agent cannot grant itself access, and a shared API key cannot replace consent.

Private requests need an agent OAuth bearer token. Missing or expired tokens return HTTP \`401\` with a \`WWW-Authenticate\` discovery header. Keep tokens out of URLs and public source code.

## Discover available data

After MCP initialization, call \`tools/list\` for the current schemas, inputs and limits.

1. Discover the owner’s paired phones.
2. Call \`get_phone_data_catalog\` for available data types and approved profiles.
3. Choose a supported type covered by the profile and its data grants.
4. Call \`query_phone_data\`, then poll \`get_phone_request\` for the result.

Use the returned identifiers rather than guessing them. \`create_phone_export_profile\` submits a profile for owner review; it does not grant access.

A phone read may need the app open and OS permissions enabled. Sign-in, permission prompts, purchases and system sharing require the owner on the device. Empty HealthKit results can mean missing records or limited permission; they do not prove authorization.

Try the [cloud dashboard demo](/demo) or browse [Datasets](/datasets) before connecting a phone. Neither authorizes private reads.

## Query through REST

Submit a query to \`POST /api/v1/queries\`. Use the JSON arguments from \`query_phone_data\`, leaving out \`requestKey\`. The [OpenAPI specification](/openapi.json) lists the request and response fields.

Save those arguments in \`query.json\`, then send:

\`\`\`sh
curl https://myself.md/api/v1/queries \\
  -H "Authorization: Bearer $MYSELF_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $QUERY_KEY" \\
  --data @query.json
\`\`\`

Set \`QUERY_KEY\` to a unique value of 1–200 characters. Use the phone, profile and type discovered through MCP.

HTTP \`202\` means the request was accepted. The response includes \`requestId\`, \`status\` and \`expiresAt\`; the \`Location\` header points to \`GET /api/v1/queries/{requestId}\`. Set \`REQUEST_ID\` to the returned \`requestId\`, then poll with the same authorization:

\`\`\`sh
curl "https://myself.md/api/v1/queries/$REQUEST_ID" \\
  -H "Authorization: Bearer $MYSELF_TOKEN"
\`\`\`

- \`queued\` or \`running\`: wait for the phone.
- \`complete\`: read the result page and capture warnings.
- \`failed\`: inspect the error.

Request metadata and results expire after five minutes. Wait for \`complete\` before treating a read as successful. REST and MCP share validation, permissions, billing, history and phone execution.

## Retry safely

If a response is lost, resend the same arguments with the same \`Idempotency-Key\`. A live retry returns the original request without another phone job or billing reservation. Keys are scoped to the account and agent OAuth client.

- Changing the arguments with the same key fails.
- Revoked grants or an unavailable original request fail rather than dispatching the old request again.
- While the original request is initializing, a retry may fail. Check its result before using a new key.

The service retains an activity fingerprint for 90 days to prevent redispatch after a job is forgotten, expires, or the service restarts. Keep keys unique beyond that period. For any write with an uncertain outcome, check its status before retrying with a new identifier.

Validation and permission failures return HTTP \`422\` with an error. Authentication failures return \`401\` or \`403\`.

## Use the SDK

The [JavaScript SDK](https://www.npmjs.com/package/myself-md-sdk) has no runtime dependencies. Import \`createMyselfClient\` from \`myself-md-sdk\`, or use the [standalone module](/sdk/myself.mjs).

Public methods need no token:

- \`health()\` checks service availability.
- \`config()\` reads public configuration.
- \`docs()\` reads the getting-started guide.
- \`datasets({ limit: 1 })\` reads a catalog page.

Pass \`nextCursor\` as \`cursor\` to get the next catalog page. Stop when \`nextCursor\` is null and \`hasMore\` is false. The catalog describes adapter capabilities; it contains no personal records.

For private queries, create a client with an existing agent token:

\`\`\`js
import { createMyselfClient } from 'myself-md-sdk';

const myself = createMyselfClient({ token });
const job = await myself.query(input, idempotencyKey);
const status = await myself.request(job.requestId);
\`\`\`

Use the discovered query arguments for \`input\` and the same retry rules described above. \`request()\` reads the current status once; continue polling until the job finishes. For phone results, follow every returned pagination cursor and review capture warnings.

Browsers with WebMCP expose \`myself_public_documentation\` and \`myself_dataset_catalog\` through \`document.modelContext\`, with \`navigator.modelContext\` as a compatibility fallback.

## Use the CLI

The [official CLI](https://www.npmjs.com/package/myself-md-cli) requires Node.js 22.13 or later:

\`\`\`sh
npx myself-md-cli help
\`\`\`

Or install it globally with \`npm install --global myself-md-cli\` and run \`myself help\`.

Use \`health\`, \`config\`, \`docs\` and \`openapi\` for public reads. \`tools\` lists the live MCP schemas; \`call TOOL\` reads a JSON argument object from standard input. Private commands need an existing owner-approved OAuth token in \`MYSELF_TOKEN\`. \`MYSELF_URL\` selects an HTTPS service origin. The CLI does not store tokens or grant access.

A [standalone download](/cli/myself.mjs) runs with \`node myself.mjs help\`; review the file before running it. Read its [dependency notices](/cli/notices.txt). The repository source is \`scripts/myself.js\`; after installing dependencies, run \`npm run myself -- help\` or \`npm run myself -- call TOOL\`. Both distributions expose the same public reads and authorized MCP operations. Check \`get_phone_request\` to verify that queued phone work completed.

## Rate limits

Public OpenAPI reads share a limit of 120 requests per 60 seconds per source IP. REST queries, including polling, have a separate limit of 120 per minute per account and agent client.

These limits apply locally to each Node process or Worker isolate. They are best-effort abuse limits, not global account quotas. Shared networks share a public bucket, and restarting a process resets its window.

Read the response headers to check the current window:

- \`RateLimit-Limit\`: request limit.
- \`RateLimit-Remaining\`: requests left.
- \`RateLimit-Reset\`: seconds until reset.
- \`RateLimit-Policy\`: window policy.

HTTP \`429\` returns a JSON error and \`Retry-After\` in seconds. Wait that long before retrying, and avoid concurrent retries. The \`X-RateLimit\` compatibility headers describe the same quota, with the reset expressed in epoch seconds. Private MCP and owner APIs keep their existing authorization and limits.

## API versions

Public discovery reads use \`/v1\`, such as \`/v1/health\` and \`/v1/config\`. Unversioned URLs remain aliases for the same contract. Clients should ignore unknown response fields; a breaking change requires a new major path.

Deprecations are announced here at least 90 days before removal. Affected routes return \`Deprecation\` and \`Sunset\` headers. No v1 route is currently deprecated. MCP negotiates its protocol version separately and uses the live \`tools/list\` schemas.

The [OpenAPI specification](/openapi.json) covers public discovery and REST phone queries. The [agent catalog](/.well-known/ard.json) links to the [MCP server card](/mcp/server-card) for connection metadata. These documents expose no private records; discover current private operations through authenticated \`tools/list\`.

${exportSchemas()
  .versions.map(
    (version) => `## Export schema ${version.version}

${version.description}

${version.changes.join(' ')} Saved profiles keep their selected version. JSON exports contain a schema identifier and records array; JSONL exports contain one record per line. Empty objects in these definitions allow any JSON value. The example uses fictional data.

JSON export definition:

\`\`\`json
${JSON.stringify(version.definition, null, 2)}
\`\`\`

JSONL record definition:

\`\`\`json
${JSON.stringify(version.jsonlRecordDefinition, null, 2)}
\`\`\`

Example JSON export:

\`\`\`json
${JSON.stringify(version.example, null, 2)}
\`\`\`
`,
  )
  .join('\n')}

## Privacy and help

Blocking an agent or revoking its grant stops future reads. Copies already delivered to an AI provider follow that provider’s retention policy.

\`get_privacy_policy\` returns the shared policy and support contacts under MCP account authentication, without a data grant. Read the [privacy policy](/privacy) before sharing sensitive records. myself.md provides data access, not medical advice.

See [pricing](/pricing) and [common questions](/faq) for product details, or [contact us](/contact) for help. The [source code](https://github.com/CodyBontecou/myself.md) is public.
`;
const about = `# About myself.md

Save your health, screen time and location as files you can keep. Share the data you choose with your AI assistant.

## Choose what to save

Create a profile with the data types, date range and destination you want. Save files on your phone, send them to your own HTTPS endpoint, or use the paired cloud service. Available data depends on your phone and its permissions.

## Connect your assistant

Connect to [myself.md MCP](https://myself.md/mcp), sign in, and pair your phone. Then approve the profiles and data types your assistant can read. Use it to explore your health records, screen-time patterns or recorded location points.

Review sharing and activity in the app or dashboard. You can stop future access at any time. Copies already sent to another service follow that service’s retention policy.

Cloud exports are encrypted in storage and kept until you delete or replace them. If paid cloud storage ends while you use more than the included ${includedCloud}, the oldest exports are deleted after ${cloudRetentionDays} days unless you resubscribe or delete files first. The service decrypts them when you or an approved agent reads them. See the [privacy policy](/privacy) and [terms](/terms) for details.

## Try it out

Explore the [cloud dashboard demo](/demo) and [supported datasets](/datasets) without an account or API key. The dashboard demo uses fictional data; changes stay in your browser and reset when you reload.

The mobile apps are coming soon. You can find the source code and self-hosting instructions on [GitHub](https://github.com/CodyBontecou/myself.md).

## Build with myself.md

Use the [JavaScript SDK](https://www.npmjs.com/package/myself-md-sdk) to browse datasets and query approved phone data. The [CLI](https://www.npmjs.com/package/myself-md-cli) gives you the same access from your terminal.

Start with [Docs](/docs) for setup and examples.
`;
const contact = `# Contact

Need help with the app, an export or your account? Get in touch.

## Email

[${privacyPolicy.supportEmail}](mailto:${privacyPolicy.supportEmail})

You can also email us with privacy or account deletion questions.

[GitHub issues (public)](${privacyPolicy.issuesUrl})

`;
/** Public descriptions contain no account records or credentials. */
export const publicPages = new Map([
  ['/', `${home}\n## Pricing\n\n${publicPricing}\n\n${faqMarkdown}`],
  ['/docs', overview],
  ['/docs/reference', guide],
  ['/pricing', `# myself.md pricing\n\n${publicPricing}`],
  [
    '/faq',
    `# Frequently asked questions\n\n${publicFAQs.map((item) => `## ${item.question}\n\n${item.answer}`).join('\n\n')}`,
  ],
  ['/about', about],
  ['/contact', contact],
  ['/terms', serviceTerms],
  [
    '/privacy',
    `# ${privacyPolicy.title}\n\nUpdated ${privacyPolicy.updated}\n\n${privacyPolicy.sections.map((section) => `## ${section.title}\n\n${section.body}`).join('\n\n')}\n\n## Support\n\n[${privacyPolicy.supportEmail}](mailto:${privacyPolicy.supportEmail}) · [GitHub issues (public)](${privacyPolicy.issuesUrl})\n`,
  ],
]);
export const agentIndex = `${home}\n## Developer resources\n\n- [myself.md MCP and OAuth documentation](https://myself.md/docs)\n- [Privacy policy](https://myself.md/privacy)\n- [Terms of service](https://myself.md/terms)\n- [Contact](https://myself.md/contact)\n- [OpenAPI public discovery specification](https://myself.md/openapi.json)\n- [MCP server card](https://myself.md/mcp/server-card)\n- [Agent resource catalog](https://myself.md/.well-known/ard.json)\n- [Sitemap](https://myself.md/sitemap.xml)\n`;
/** @param {string} value */
function escapeHTML(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
/** Render the same public copy for browsers without JavaScript. @param {string} markdown */
export function publicHTML(markdown) {
  return `<main class="mx-auto max-w-3xl space-y-6 p-6 sm:p-10">${markdown
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const heading = block.match(/^(#{1,2}) (.*)$/);
      return heading?.[1] && heading[2]
        ? `<h${heading[1].length} class="text-2xl font-semibold">${escapeHTML(heading[2])}</h${heading[1].length}>`
        : `<p>${escapeHTML(block)}</p>`;
    })
    .join(
      '\n',
    )}<nav aria-label="Public resources"><a href="/">Home</a> · <a href="/demo">Cloud dashboard demo</a> · <a href="/docs">Developers</a> · <a href="https://www.npmjs.com/package/myself-md-sdk">JavaScript SDK</a> · <a href="https://www.npmjs.com/package/myself-md-cli">CLI</a> · <a href="/pricing">Pricing</a> · <a href="/faq">FAQ</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:${privacyPolicy.supportEmail}">Email support</a> · <a href="${privacyPolicy.issuesUrl}">GitHub issues</a> · <a href="/llms.txt">Agent instructions</a> · <a href="${smitheryListingUrl}">Smithery</a></nav></main>`;
}
