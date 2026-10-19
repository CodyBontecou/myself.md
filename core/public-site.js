import { exportSchemas } from './export-schemas.js';
import { serviceTerms } from './terms.js';
import { freeExports, lifetimePurchaseGuide } from './billing.js';
import { privacyPolicy } from './privacy.js';
import { cloudPlans } from './cloud-plans.js';
import { cloudRetentionDays, lifetimeCloudBytes } from './cloud-allowance.js';
import { healthGuides } from './health-guides.js';
import { projectIdentity } from './project-identity.js';

const includedCloud = `${lifetimeCloudBytes / 1_000_000} MB`;

export const agentSetupPrompt = 'Set up myself.md using https://myself.md/llms.txt';

export const smitheryListingUrl = 'https://smithery.ai/servers/cody-82px/myself-md';

export const homepageOverview = {
  definition:
    'myself.md is an open-source iOS and Android app that exports selected health, screen time and recorded location data to files you control. Compatible AI assistants can query the data you approve through MCP.',
  question: 'When should I use myself.md?',
  answer:
    'Use myself.md to export your personal records, explore sleep and activity patterns with an AI assistant, understand screen-time habits, or work with location points you chose to record. Choose which data to share and which profiles agents can access.',
  limitations:
    'Supported sources vary by platform. Live phone queries require a reachable installed app and your approval. Public App Store and Google Play downloads are coming soon.',
};

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

const showcaseGuide = `## Recorded walkthroughs

- [Choose your context](https://myself.md/dashboard/showcase/selection.mp4): a silent recording of selecting data types and JSON/JSONL settings in an isolated app QA session.
- [Approve agent access](https://myself.md/dashboard/showcase/approval.mp4): a silent recording of phone-owner approval in an isolated QA profile. Agents cannot approve themselves.
- [From phone to agent](https://myself.md/dashboard/showcase/overview.mp4): a silent film combining app setup footage with an illustrated replay of an actual MCP run using synthetic phone data. The agent UI is illustrative.

Recordings date from October 2026; app UI may differ from the current release. Browsers provide native playback controls, and agents can retrieve these public media URLs without authentication. Watching a recording does not initiate account setup or change permissions.
`;

const home = `# myself.md — Personal data for AI agents

${homepageOverview.definition}

Create export profiles that select data types, date ranges and destinations. Use local files, your own HTTPS endpoint, or the paired cloud service. Operating-system permissions still apply.

## ${homepageOverview.question}

${homepageOverview.answer}

${homepageOverview.limitations}

Do not infer permission from an empty result.

## Explore supported datasets

Preview supported data at https://myself.md/datasets. Mobile store distribution is coming soon; source and self-hosting instructions are available at https://github.com/CodyBontecou/myself.md.

## JavaScript integration

Install the official SDK with npm install myself-md-sdk. Package: https://www.npmjs.com/package/myself-md-sdk. The official CLI is https://www.npmjs.com/package/myself-md-cli; run npx myself-md-cli health for a public service check. The SDK provides public discovery, dataset pagination and authorized asynchronous phone-query methods.

## Connect an AI agent

Give your agent this prompt: ${agentSetupPrompt}

Start with public discovery: GET https://myself.md/v1/dataset-catalog and GET https://myself.md/v1/docs need no account. Read https://myself.md/docs/reference for exact request schemas and tool availability in your client. For private data, discover connected phones and approved profiles with get_phone_data_catalog, request a bounded query with query_phone_data, then poll get_phone_request until it reaches a terminal state. Phone query states are queued, running, complete and failed; use records only after complete, and stop if the request is expired or missing. Other owner-reviewed operations may require awaiting_user handoffs or report cancelled outcomes; follow returned pagination cursors and capture warnings. Do not retry a mutation blindly after a lost response. Stored cloud exports use list_cloud_exports and read_cloud_export, subject to existing profile and source grants. If a restricted client does not expose an operation, report that limitation and use its documented owner handoff.

Add https://myself.md/mcp as a remote MCP server in a compatible client. OAuth 2.0 signs you in and asks for consent. Pair your phone and approve specific profiles and data grants before requesting private records. Agents cannot grant themselves access. Read the developer guide at https://myself.md/docs and the privacy policy at https://myself.md/privacy.

Find myself.md in the Smithery MCP directory: ${smitheryListingUrl}.

${showcaseGuide}
## Your data, on your terms

Review sharing permissions, revoke future reads, and inspect activity in the phone app or authenticated dashboard. Cloud export content is encrypted at rest and kept until you delete or replace it; the only exception is the ${cloudRetentionDays}-day lapse rule when paid cloud storage ends above the included allowance (see Pricing). The service decrypts approved records for authorized reads; providers receiving those records apply their own retention policies. Revocation cannot recall copies already delivered to another service.
`;
export const publicFAQs = [
  {
    question: 'What is myself.md?',
    answer:
      'myself.md is an open-source app for iOS and Android that exports selected health, screen time and recorded location data to files you control. Its MCP server lets compatible AI assistants query approved phone profiles or read authorized cloud exports. You choose the data types, date ranges, destinations and agent permissions.',
  },
  {
    question: 'Is myself.md the same project as self.md?',
    answer:
      'No. The name myself.md includes “my”. This phone data export and remote MCP project is maintained by Cody Bontecou at https://github.com/CodyBontecou/myself.md. Its official website is https://myself.md/ and its MCP endpoint is https://myself.md/mcp. self.md is a separate project; its pages and images do not document myself.md.',
  },
  {
    question: 'Which sources document myself.md setup and permissions?',
    answer:
      'Use https://myself.md/docs for connection and pairing, https://myself.md/datasets/health for supported health records and limitations, and https://myself.md/privacy for consent, retention and revocation. The source is https://github.com/CodyBontecou/myself.md. A listing for another apple-health-mcp or health-export-mcp project is not documentation for myself.md. Public store downloads are coming soon; live phone reads require an installed app or authorized test build.',
  },
  {
    question: 'How can I connect Apple Health to an AI assistant with myself.md?',
    answer:
      'On iPhone, myself.md reads supported Apple Health data through HealthKit after you grant operating-system permission. Select health types and a date range in an export profile. For agent queries, sign in, pair the phone, approve the profile’s agent access and connect https://myself.md/mcp in a compatible client. The phone must be available to complete a live query; an authorized stored cloud export is a separate read path.',
  },
  {
    question: 'Does myself.md support Android Health Connect?',
    answer:
      'Yes. The Android app reads supported Health Connect records after you grant permission. Select the records and date range in a profile, then export to files or approve access for a compatible MCP assistant. Historical access may be limited to 30 days without additional permission, and exercise routes can require separate consent. Check the public health dataset catalog for supported types and limitations.',
  },
  {
    question: 'Can Claude or Codex use my health data through myself.md?',
    answer:
      'Compatible Claude and Codex clients can connect to https://myself.md/mcp using OAuth. Sign-in alone grants no health records: pair your phone and approve specific profiles and data grants. Ask the assistant to discover available data, query an approved profile and wait for completion. Client tool availability varies; the setup guide documents handoffs and limitations. You can revoke future reads, but cannot recall copies already delivered to an AI provider.',
  },
  {
    question: 'Where can I install myself.md, and does the phone need to stay open?',
    answer:
      'Public App Store and Google Play downloads are coming soon. Live phone queries require an installed app or authorized test build; developers can use the source setup instructions on GitHub. Keep the app open and connected while verifying a live query, with the required operating-system permissions enabled. You can explore the public dataset catalog without installing anything. Reading an already-approved cloud export is a separate path that does not require a live phone query.',
  },
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
const publicPricing = `The dataset catalog is free. The app includes ${freeExports} free exports or queries, followed by an optional one-time lifetime unlock. The US price is ${publicLifetimePrice}; actual checkout uses the localized price returned by Apple or Google. Open the installed app for free at myselfmd:// or open Lifetime checkout at ${purchaseGuide.appLink}. ${purchaseGuide.instructions} ${purchaseGuide.accountInstructions} ${purchaseGuide.availability} Opening the app does not confirm payment or grant access. Eligible existing health.md, iso.me and time.md purchasers can claim lifetime access after purchase verification. Lifetime access removes export/query usage limits and does not include unlimited hosted storage. Optional cloud storage keeps encrypted exports for your account, provides a hosted MCP server for agents and requires an account. Cloud storage plans: ${publicCloudPlans.map((plan) => `${plan.capacity}: ${plan.price} (${plan.billing})`).join('; ')}. The 10 GB and 1 TB plans are auto-renewing App Store or Google Play subscriptions bought in the installed app at myselfmd://cloud-storage. They require Lifetime access and replace the included ${includedCloud}; capacities do not add up. Prices are US prices; checkout shows the localized store price and billing period. A subscription renews automatically unless cancelled at least 24 hours before the current period ends; manage or cancel it in App Store or Google Play subscription settings, and request refunds from Apple or Google. Storage continues during the store's billing grace period. If paid storage ends while usage is above ${includedCloud}, the files stay for ${cloudRetentionDays} days with push and email reminders; resubscribe or delete files before then, or the oldest exports are deleted until usage is ${includedCloud} or less. A refunded Lifetime purchase deletes all cloud exports. The dashboard and agents cannot purchase storage; they hand off to the app. Subscription terms: https://myself.md/terms.`;
const faqMarkdown = publicFAQs.map((item) => `## ${item.question}\n\n${item.answer}`).join('\n\n');
const localAgentSetupGuide = `## Codex CLI setup

If the owner uses the Codex CLI, first inspect existing connections with \`codex mcp list\`. Reuse an existing myself.md entry; otherwise add the remote server:

\`\`\`sh
codex mcp add myself --url https://myself.md/mcp
\`\`\`

If that entry still requires OAuth, start sign-in and let the owner complete the browser flow:

\`\`\`sh
codex mcp login myself --scopes myselfmd,offline_access
\`\`\`

Use the existing entry's name instead of myself when it differs. After authorization, verify the server's tools are available in the intended session; configuration alone is not a successful connection. Other clients use their supported remote MCP settings. See [official Codex MCP instructions](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
`;
const phoneSetupGuide = `## Pair a phone and approve a profile

Live reads require an installed myself.md app. Public App Store and Google Play downloads are coming soon. If the owner has no installed app or authorized test-build access, explain that prerequisite and offer public discovery or already-approved cloud exports. For a developer installation, use the [source setup instructions](https://github.com/CodyBontecou/myself.md#run-locally); do not invent a store link or treat the CLI as a phone installer.

1. Verify the intended account using get_account_logins where exposed, then list_connected_phones. Reuse the intended paired phone. If an existing connection points to the wrong account, ask the owner to correct it before reading records; do not silently switch accounts.
2. If a phone still needs pairing and tools/list exposes create_phone_pairing, call it once. Show its returned pairingUrl or QR to the owner. On the installed app, open **Settings → Agent connection**, scan the QR or paste the pairing link, sign in to the same account and confirm. If sign-in returns to **Account**, go Back to the retained **Confirm connection** screen and finish there. On the same phone, the pairing page's **Open in myself.md** button opens the app. Pairing links expire after five minutes and are single-use; keep the link private.
3. Where exposed, poll get_pairing_status with the returned pairingId, then refresh list_connected_phones and get_phone_data_catalog. Verify the returned device ID identifies the intended phone in that refreshed list and catalog; a non-null device alone is not enough. A displayed QR, browser sign-in or opened app is not a confirmed pairing. For an expired uncompleted link, create a new pairing handoff rather than reusing it.
4. Open **Profiles**, select the intended profile, and review **Data selection**. Select only the types needed for the task and complete the app's OS/provider permission prompts. On Android, Health Connect may list additional categories; enable only the intended types rather than Allow all. If an earlier denial prevents a new prompt, the owner must re-enable that access in Health Connect → App permissions for the installed myself.md app. Under that saved profile's **Agent permissions**, approve only the relevant Health, Screen time or Location permission. Saving a profile or selecting a type does not grant agent access. Keep the app open while verifying a live query.
5. Refresh get_phone_data_catalog and confirm the intended phone is online, the saved profile exists, and its selections and individual agentPermissions cover the request before querying. If catalog is null, there is no discoverable live profile yet; do not guess IDs or enqueue a query.

Some directory connections use the separate read-only resource https://myself.md/mcp/chatgpt. Reuse that connection for its approved reads. It does not expose pairing-ticket creation or profile proposals. If those tools are absent, explain the owner step: pair using a compatible full MCP client connected to https://myself.md/mcp, then return to this connection and rediscover. Both clients and the phone must use the same intended account; verify that identity before continuing. Do not change the existing connector's resource or try hidden tool names to bypass its restrictions. Owners always control profile and OS permissions in the phone app.
`;
const overview = `# Get started

Connect the phone data you choose to share to a compatible AI assistant through MCP (Model Context Protocol).

## Choose your starting point

Public App Store and Google Play downloads are coming soon. Live queries require an installed myself.md app or authorized test build. Developers can follow the [source setup instructions](https://github.com/CodyBontecou/myself.md#run-locally). The CLI connects to the service; it does not install the phone app.

- No installed app: explore the [supported datasets](/datasets), without an account or API key.
- Installed app: connect your assistant below, pair the same account and approve a profile on the phone.
- Existing approved cloud export: ask your assistant to list authorized exports and read the chosen file; this does not require a live phone query.

For guided agent setup, use this prompt: ${agentSetupPrompt}

## Connect an AI assistant

Directory listing: ${smitheryListingUrl}.

Add this URL as a remote MCP server in your assistant’s settings. MCP is the connection that lets an assistant use myself.md tools.

\`\`\`text
https://myself.md/mcp
\`\`\`

1. Sign in when your assistant opens the connection flow.
2. Pair your phone with the same account.
3. Approve the profiles and data types you want to share.

Your assistant can read only what you approve. Keep the phone app open and connected while verifying a live query, with the required operating-system permissions enabled.

## Verify your first health question

Ask: “Discover my approved phone profiles and available health types. Tell me which source, profile and date range you can read before querying.” Confirm the intended phone and individual Health agent permission. Then ask one bounded question, such as the step records for one explicit day and time zone. Wait for the request to complete and check its returned source, interval and pagination before interpreting the records. Empty records do not prove zero activity or authorization.

On iPhone, Apple Health reads use HealthKit. Select only the intended types and grant OS read permission; HealthKit does not disclose read denial. On Android, use Health Connect and enable only the intended read categories, rather than Allow all; older history and exercise routes may require additional consent. Follow the [health examples and platform limits](/datasets/health). Compatible Claude and Codex clients use the same endpoint above; connector tool availability varies.

## Source-specific connection guides

${healthGuides.map((guide) => `- [${guide.title}](/docs/${guide.slug}): ${guide.description}`).join('\n')}

${showcaseGuide}

${localAgentSetupGuide}

${phoneSetupGuide}

${publicFAQs
  .slice(0, 6)
  .map((item) => `## ${item.question}\n\n${item.answer}`)
  .join('\n\n')}

See the [health dataset catalog](/datasets/health) for supported HealthKit and Health Connect records, the [screen time catalog](/datasets/screen-time) for platform restrictions, and the [location catalog](/datasets/location) for recording limits. Read [pricing](/pricing) and [privacy](/privacy) before sharing private records.

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

Browse [Datasets](/datasets) before connecting a phone. This does not authorize private reads.

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

The website's bundled JavaScript client supports docs({ guide: 'apple-health-claude-mcp' }) and docs({ guide: 'android-health-connect-mcp' }). Older npm releases may support only docs(); read the guide's public HTTP URL instead. The optional guide selector is also available on get_public_documentation and WebMCP myself_public_documentation.

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

## Project and maintenance

myself.md is an open-source project maintained in [Cody Bontecou's repository](https://github.com/CodyBontecou/myself.md). Review the source and change history there, report documentation problems through [GitHub issues](${privacyPolicy.issuesUrl}), or [contact the project](/contact). Product documentation describes software capabilities and permission limits; it is not medical advice.

## Official project identity

${projectIdentity}

## Choose what to save

Create a profile with the data types, date range and destination you want. Save files on your phone, send them to your own HTTPS endpoint, or use the paired cloud service. Available data depends on your phone and its permissions.

## Connect your assistant

Connect to [myself.md MCP](https://myself.md/mcp), sign in, and pair your phone. Then approve the profiles and data types your assistant can read. Use it to explore your health records, screen-time patterns or recorded location points.

Review sharing and activity in the app or dashboard. You can stop future access at any time. Copies already sent to another service follow that service’s retention policy.

Cloud exports are encrypted in storage and kept until you delete or replace them. If paid cloud storage ends while you use more than the included ${includedCloud}, the oldest exports are deleted after ${cloudRetentionDays} days unless you resubscribe or delete files first. The service decrypts them when you or an approved agent reads them. See the [privacy policy](/privacy) and [terms](/terms) for details.

## Try it out

Explore the [supported datasets](/datasets) without an account or API key.

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
  ...healthGuides.map(
    (entry) => /** @type {[string,string]} */ ([`/docs/${entry.slug}`, entry.markdown]),
  ),
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
export const agentIndex = `# myself.md — Personal data for AI agents

> Work with the health, screen time and recorded location data a person chooses to share. Discover their available sources, query an approved phone profile, or read an authorized cloud export. The owner controls access; native and provider permissions still apply.

Website: https://myself.md
Remote MCP server (Streamable HTTP): https://myself.md/mcp
Source and self-hosting: https://github.com/CodyBontecou/myself.md

## Project identity and sources

${projectIdentity}

Use the source-specific guide for setup, the health catalog for supported records and the privacy policy for data handling. A matching topic in another project does not support a claim about myself.md.

Source-specific setup: https://myself.md/docs/apple-health-claude-mcp and https://myself.md/docs/android-health-connect-mcp. These describe myself.md; do not substitute setup commands from similarly named Apple Health MCP projects.

## Start with the person's task

Use myself.md for questions grounded in the person's own records, such as:

- Summarize sleep and activity over the last week, when those types are available.
- Compare screen-time patterns across days using the phone's supported capture window.
- Summarize location points the person chose to record during a specified interval.

Discover sources before promising an answer. Availability differs by platform, installed adapters, profile selections and permissions. Optional WHOOP data requires a connected provider account and consent. The public [dataset explorer](https://myself.md/datasets) describes capabilities. It does not prove access to personal records.

## Asked to set up myself.md?

Bootstrap prompt: ${agentSetupPrompt}

First check whether this client already exposes myself.md tools. Reuse a working connection and the intended account, phone and profile rather than creating duplicates. Choose the setup path that matches where you run:

- **Hosted assistant:** use the client's remote MCP connector flow with https://myself.md/mcp and OAuth. If you cannot configure connectors, give the owner that URL and the next step in their client, then wait for connection. Installing a CLI in an analysis sandbox does not connect the assistant.
- **Local coding agent:** configure the remote MCP server through the client's supported settings. Let the owner complete browser sign-in and consent. The CLI below is useful for terminal calls with an existing OAuth token; it does not perform login or register an MCP connection.
- **Cloud or restricted sandbox:** use an existing client connector if available. If network policy blocks myself.md, report the failed host and required network access to the owner or administrator. A public HTTP read or a CLI installed inside the sandbox does not establish a connector in the owner's client.

OAuth sign-in, phone pairing and data approval are separate steps. OS permission prompts, provider authentication and purchases remain owner handoffs. Agents cannot grant themselves access. Follow the phone setup steps below and the [getting-started guide](https://myself.md/docs).

After connecting, initialize MCP and call tools/list for the schemas and operations actually exposed by this client. A successful public health check proves service availability only. Verify available phones and approved profiles before saying personal data is ready.

${localAgentSetupGuide}

${phoneSetupGuide}

## Public discovery — no account needed

Read these before requesting private access:

- [Dataset catalog](https://myself.md/v1/dataset-catalog): supported sources and limitations. Omit limit for the default page, or use an integer from 1 to 3. Follow nextCursor as cursor until hasMore is false.
- [Getting started](https://myself.md/v1/docs): connection, pairing, SDK and CLI guidance. Send Accept: text/markdown for Markdown; ordinary browser/curl requests return HTML.
- [API reference](https://myself.md/docs/reference): authentication, request formats, pagination and limits.
- [Pricing](https://myself.md/pricing): the app includes ${freeExports} free exports or queries, then an optional Lifetime unlock. Successful phone captures consume allowance; discovering data is not a capture. Lifetime removes export/query usage limits and includes ${includedCloud} of cloud storage; additional storage is a separate subscription purchased in the phone app.

Public service check and Markdown guide:

\`\`\`sh
curl -fsS https://myself.md/v1/health
curl -fsS -H 'Accept: text/markdown' https://myself.md/v1/docs
\`\`\`

## First approved phone query

Use live tool schemas for arguments. Do not invent IDs, native type names or client capabilities.

1. Call list_connected_phones and select the intended owned phone. If several could match, resolve the choice with the owner.
2. Call get_phone_data_catalog with its deviceId. Inspect online status, domains, collection limits and catalog.profiles. Resolve a profile name to its current stable ID; names can be duplicated. An offline catalog may be stale.
3. Intersect the profile's selected types, relevant individual agentPermissions and available phone sources. Reuse a suitable approved profile. If one is missing, create_phone_export_profile can propose one for owner review where exposed. Delivery does not mean it was saved or approved. Access-review tools initiate owner handoffs; refresh the catalog to verify the saved permissions.
4. Choose one needed type and a bounded interval. Convert the person's dates using their timezone to UTC ISO 8601 start/end values. Phone queries allow at most 31 days, but a source can impose a smaller capture window. Explain any uncovered period before presenting a comparison.
5. Call query_phone_data with the discovered deviceId, profileId, domain and type, interval, and a caller-chosen requestKey. Save the returned requestId.
6. Poll get_phone_request. queued and running mean wait; complete means inspect the result; failed means inspect and report the error. Request metadata and results expire after five minutes. Stop on an expired or missing request. Accepted or queued work is not a completed read.
7. Follow every returned nextCursor by querying the next page with the same selection and interval. Each new page is new work and needs a new requestKey; reuse that page's key only for an identical retry. Preserve native units, source metadata and capture warnings. State the actual source, interval and any gaps in the answer.

Profile selection, OS access and agent permission are distinct. An empty HealthKit result can mean no records or limited permission; it does not establish authorization or a zero measurement. Request only the records needed for the task.

## Read existing cloud exports

Use list_cloud_exports and read_cloud_export where exposed, following their live schemas and existing profile/source grants. Confirm the export's source and date range; a stored file does not prove a fresh phone query. If the client lacks these operations, report the limitation and use the documented owner handoff. Do not claim a tool exists solely because it is named here.

## Terminal and JavaScript access

The [official CLI](https://www.npmjs.com/package/myself-md-cli) requires Node.js 22.13 or later:

\`\`\`sh
npx myself-md-cli health
npx myself-md-cli help
\`\`\`

health, config, docs and openapi are public reads. With an existing owner-authorized OAuth access token supplied securely in MYSELF_TOKEN:

\`\`\`sh
npx myself-md-cli tools
npx myself-md-cli call get_phone_data_catalog < catalog-arguments.json
\`\`\`

catalog-arguments.json must contain a JSON object with a discovered deviceId. Never put tokens in URLs, chat messages, committed files or command output. The CLI does not store tokens or grant access.

For JavaScript, install the [official SDK](https://www.npmjs.com/package/myself-md-sdk):

\`\`\`sh
npm install myself-md-sdk
\`\`\`

\`\`\`js
import { createMyselfClient } from 'myself-md-sdk';

const myself = createMyselfClient();
const page = await myself.datasets({ limit: 1 });
console.log(page.items);
\`\`\`

For private REST/SDK queries, use an existing agent OAuth token and the discovered query inputs. POST /api/v1/queries uses the Idempotency-Key header instead of the MCP requestKey argument. HTTP 202 means accepted; poll GET /api/v1/queries/{requestId}. The SDK's request() reads status once; continue polling until completion. See the [reference](https://myself.md/docs/reference) for complete examples.

## Retries and blockers

- **Lost query response:** retry identical MCP arguments with the same requestKey, or identical REST arguments with the same Idempotency-Key. A live retry retrieves the original job without another allowance reservation. Changed arguments or an unavailable original fail instead of redispatching. Check the outcome before starting a new request; other mutations have their own retry contracts.
- **401:** complete or renew OAuth through the client. A sign-in page showing invalid_signature means its continuation expired or could not be verified; return to the app or assistant that started sign-in and reconnect to get a fresh link. Do not reuse the old login URL or start an unrelated dashboard sign-in. **403 or permission errors:** inspect the account, profile and source grants; the owner must approve missing access.
- **No phone, offline phone or missing type:** report the specific prerequisite. Ask the owner to pair or open myself.md and review permissions as needed, then rediscover. Do not repeatedly enqueue work against stale state.
- **awaiting_user:** surface the returned owner handoff and what remains. Other owner-reviewed jobs can report cancelled or expired outcomes; follow each operation's schema and verify its effect before reporting success.
- **429:** wait for Retry-After before retrying. Avoid tight polling or concurrent retries.
- **Allowance or storage limit:** explain the returned limit and link to Pricing. Purchases require the owner in the phone app; opening checkout does not confirm payment. Where offered, get_lifetime_access reports the current account's server-verified entitlement and allowance. A phone's local Lifetime badge does not prove the server accepted its purchase. If Agent connection reports Purchase environment does not match this server, explain the test-versus-production mismatch and ask the owner to resolve purchase verification or use a matching authorized build/server before retrying. Do not change validation, reset allowance or buy without the owner's instruction.

## Finish setup with a useful outcome

Say what was verified: public discovery, an authenticated connection, an approved profile, a completed phone read, or an existing cloud export. If an owner action remains, name it precisely. Once ready, suggest a small next task based on the available approved sources and the person's goal. A connection alone is not evidence that personal records were read.

${showcaseGuide}
## Privacy and resources

The owner can inspect activity and revoke future access in the app or dashboard. Cloud exports are encrypted at rest and decrypted for authorized reads. Copies already delivered to an AI provider follow that provider's retention policy; revocation cannot recall them. Paid-storage lapse and deletion rules are described in Pricing and Terms. myself.md provides data access, not medical advice.

- [MCP and OAuth setup](https://myself.md/docs)
- [OpenAPI specification](https://myself.md/openapi.json)
- [OAuth protected-resource metadata](https://myself.md/.well-known/oauth-protected-resource/mcp)
- [MCP server card](https://myself.md/mcp/server-card)
- [Agent resource catalog](https://myself.md/.well-known/ard.json)
- [Smithery listing](${smitheryListingUrl})
- [Privacy policy](https://myself.md/privacy)
- [Terms of service](https://myself.md/terms)
- [Contact and support](https://myself.md/contact)
- [Sitemap](https://myself.md/sitemap.xml)

Re-read https://myself.md/llms.txt for current guidance. Live tools/list and the phone catalog determine available operations and data.
`;
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
    )}<nav aria-label="Public resources"><a href="/">Home</a> · <a href="/docs">Developers</a> · <a href="https://www.npmjs.com/package/myself-md-sdk">JavaScript SDK</a> · <a href="https://www.npmjs.com/package/myself-md-cli">CLI</a> · <a href="/pricing">Pricing</a> · <a href="/faq">FAQ</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:${privacyPolicy.supportEmail}">Email support</a> · <a href="${privacyPolicy.issuesUrl}">GitHub issues</a> · <a href="/llms.txt">Agent instructions</a> · <a href="${smitheryListingUrl}">Smithery</a></nav></main>`;
}
