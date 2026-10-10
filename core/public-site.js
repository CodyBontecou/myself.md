import { freeExports } from './billing.js';
import { privacyPolicy } from './privacy.js';

export const publicNavigation = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
];

const home = `# myself.md — Personal data for AI agents

myself.md brings your health, screen time and recorded location data together in files you control. Create export profiles that select data types, date ranges and destinations. Use local files, your own HTTPS endpoint, or the paired cloud service. Native sources differ between iOS and Android, and operating-system permissions still apply.

## When to use myself.md

Use myself.md when a person wants an AI agent to analyze their approved health records, understand screen-time patterns, or work with location points they chose to record. Use the public dataset explorer to preview fictional records before connecting any account. Never treat the demo as a real person's health data or infer permission from an empty result.

## Try the free public sandbox

The demo at https://myself.md/demo is a free, read-only sandbox with fictional datasets and example exports. It needs no account, API key or sales conversation. Preview supported data at https://myself.md/datasets. Mobile store distribution is coming soon; source and self-hosting instructions are available at https://github.com/CodyBontecou/myself.md.

## JavaScript integration

Install the official SDK with npm install myself-md-sdk. Package: https://www.npmjs.com/package/myself-md-sdk. The official CLI is https://www.npmjs.com/package/myself-md-cli; run npx myself-md-cli health for a public service check. The SDK provides public discovery, dataset pagination and authorized asynchronous phone-query methods.

## Connect an AI agent

Add https://myself.md/mcp as a remote MCP server in a compatible client. OAuth 2.0 signs you in and asks for consent. Pair your phone and approve specific profiles and data grants before requesting private records. Agents cannot grant themselves access. Read the developer guide at https://myself.md/docs and the privacy policy at https://myself.md/privacy.

## Your data, on your terms

Review sharing permissions, revoke future reads, and inspect activity in the phone app or authenticated dashboard. Cloud export content is encrypted at rest and expires after 30 days. The service decrypts approved records for authorized reads; providers receiving those records apply their own retention policies. Revocation cannot recall copies already delivered to another service.
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
];
export const publicLifetimePrice = '$19.99';
export const publicCloudPlans = [
  {
    capacity: '50 MB',
    price: '30-day free trial',
    billing: 'For Lifetime users · No automatic billing',
  },
  { capacity: '1 GB', price: '$1.99 / month', billing: 'or $19.99 / year' },
  { capacity: '10 GB', price: '$4.99 / month', billing: 'or $49.99 / year' },
];
const publicPricing = `The public demo and dataset catalog are free. The app includes ${freeExports} free exports or queries, followed by an optional one-time lifetime unlock. The planned US price is ${publicLifetimePrice}; actual checkout uses the localized price returned by Apple or Google. Mobile store distribution is coming soon. Eligible existing health.md and iso.me purchasers can claim lifetime access after purchase verification. Lifetime access removes export/query usage limits and does not include unlimited hosted storage. Paid hosted storage subscriptions are not implemented. Optional cloud storage requires an account. Proposed cloud plans: ${publicCloudPlans.map((plan) => `${plan.capacity}: ${plan.price} (${plan.billing})`).join('; ')}. These plans are coming soon; the prices are planned US prices and checkout will use localized store pricing.`;
const faqMarkdown = publicFAQs.map((item) => `## ${item.question}\n\n${item.answer}`).join('\n\n');
const overview = `# Get started

Connect your AI assistant to the health, screen time and location data you choose to share. Or use the SDK and CLI to build your own integration.

## Connect an AI assistant

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

Sign in with the authorization-code flow and PKCE. Request the \`qr-connect\` scope for the MCP resource. The owner completes sign-in and consent, pairs a phone, and approves the profiles and data types the agent can read. An agent cannot grant itself access, and a shared API key cannot replace consent.

Private requests need an agent OAuth bearer token. Missing or expired tokens return HTTP \`401\` with a \`WWW-Authenticate\` discovery header. Keep tokens out of URLs and public source code.

## Discover available data

After MCP initialization, call \`tools/list\` for the current schemas, inputs and limits.

1. Discover the owner’s paired phones.
2. Call \`get_phone_data_catalog\` for available data types and approved profiles.
3. Choose a supported type covered by the profile and its data grants.
4. Call \`query_phone_data\`, then poll \`get_phone_request\` for the result.

Use the returned identifiers rather than guessing them. \`create_phone_export_profile\` submits a profile for owner review; it does not grant access.

A phone read may need the app open and OS permissions enabled. Sign-in, permission prompts, purchases and system sharing require the owner on the device. Empty HealthKit results can mean missing records or limited permission; they do not prove authorization.

Try the [fictional-data demo](/demo) or browse [Datasets](/datasets) before connecting a phone. Neither authorizes private reads.

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

Cloud exports are encrypted in storage and expire after 30 days. The service decrypts them when you or an approved agent reads them. See the [privacy policy](/privacy) for details.

## Try it out

Explore the [free demo](/demo) and [supported datasets](/datasets) without an account or API key. The demo is read only and uses fictional data.

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
  [
    '/privacy',
    `# ${privacyPolicy.title}\n\nUpdated ${privacyPolicy.updated}\n\n${privacyPolicy.sections.map((section) => `## ${section.title}\n\n${section.body}`).join('\n\n')}\n\n## Support\n\n[${privacyPolicy.supportEmail}](mailto:${privacyPolicy.supportEmail}) · [GitHub issues (public)](${privacyPolicy.issuesUrl})\n`,
  ],
]);
export const agentIndex = `${home}\n## Developer resources\n\n- [myself.md MCP and OAuth documentation](https://myself.md/docs)\n- [Privacy policy](https://myself.md/privacy)\n- [Contact](https://myself.md/contact)\n- [OpenAPI public discovery specification](https://myself.md/openapi.json)\n- [MCP server card](https://myself.md/mcp/server-card)\n- [Agent resource catalog](https://myself.md/.well-known/ard.json)\n- [Sitemap](https://myself.md/sitemap.xml)\n`;
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
    )}<nav aria-label="Public resources"><a href="/">Home</a> · <a href="/demo">Demo</a> · <a href="/docs">Developers</a> · <a href="https://www.npmjs.com/package/myself-md-sdk">JavaScript SDK</a> · <a href="https://www.npmjs.com/package/myself-md-cli">CLI</a> · <a href="/pricing">Pricing</a> · <a href="/faq">FAQ</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="mailto:${privacyPolicy.supportEmail}">Email support</a> · <a href="${privacyPolicy.issuesUrl}">GitHub issues</a> · <a href="/llms.txt">Agent instructions</a></nav></main>`;
}
