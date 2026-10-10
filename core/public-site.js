import { privacyPolicy } from './privacy.js';

const home = `# myself.md — Personal data for AI agents

myself.md brings your health, screen time and recorded location data together in files you control. Create export profiles that select data types, date ranges and destinations. Use local files, your own HTTPS endpoint, or the paired cloud service. Native sources differ between iOS and Android, and operating-system permissions still apply.

## When to use myself.md

Use myself.md when a person wants an AI agent to analyze their approved health records, understand screen-time patterns, or work with location points they chose to record. Use the public dataset explorer to preview fictional records before connecting any account. Never treat the demo as a real person's health data or infer permission from an empty result.

## Try the free public sandbox

The demo at https://myself.md/demo is a free, read-only sandbox with fictional datasets and example exports. It needs no account, API key or sales conversation. Preview supported data at https://myself.md/datasets. Mobile store distribution is coming soon; source and self-hosting instructions are available at https://github.com/CodyBontecou/myself.md.

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
      'Yes. The public demo uses fictional records and requires no account. It does not connect a phone or authorize private reads.',
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
const guide = `# myself.md developer documentation — MCP and OAuth 2.0

## When to use this

Use myself.md to query user-approved health, screen time and recorded location data through semantic MCP tools. For public evaluation, use the free fictional-data sandbox at https://myself.md/demo and the dataset catalog at https://myself.md/datasets. The sandbox does not connect a phone or authorize private reads.

## JavaScript SDK and browser tools

Download the dependency-free JavaScript SDK from https://myself.md/sdk/myself.mjs. Import createMyselfClient and call health(), config(), docs(), or datasets({limit: 1}). Pass nextCursor as cursor for subsequent catalog pages; a null cursor and hasMore false mark completion. The public catalog describes adapter capabilities, never personal records. Browsers supporting WebMCP expose myself_public_documentation and myself_dataset_catalog through document.modelContext, with a navigator.modelContext compatibility fallback.

For approved phone queries, createMyselfClient({token}) exposes query(input, idempotencyKey) and request(requestId). The token must belong to an agent OAuth client with qr-connect scope. Never put tokens in browser URLs or public source. Registry publication is pending; download the SDK from the official domain until a package is published.

## Asynchronous REST queries and safe retries

POST https://myself.md/api/v1/queries with an agent bearer token, Content-Type: application/json and an Idempotency-Key of 1–200 characters. The JSON arguments are those of query_phone_data, excluding requestKey. Discover the actual phone, approved profile and supported type through MCP first. A successful submission returns HTTP 202, requestId, status and expiresAt, with Location pointing to GET /api/v1/queries/{requestId}. Poll with the same authorization. queued and running indicate pending work; complete includes the actual page and capture warnings; failed includes an error. Request metadata and results expire after five minutes. A 202 response never proves the phone read succeeded.

Reuse the same key and identical arguments after a lost response. A live retry returns the original request and creates no additional phone job or billing reservation. Keys are scoped to the account and OAuth client. Changed arguments fail, and revoked grants, forgotten jobs, expired jobs or a service restart cannot cause an old request to dispatch again while its activity fingerprint is retained (90 days). If the original request is still initializing, a retry may fail until that submission finishes; inspect the original result before choosing a new key. Keep keys unique beyond the retention window. Tool validation and permission failures return HTTP 422 with an error; authentication failures return 401/403. Consult /openapi.json for typed inputs and responses. Both REST and MCP use the same validation, grants, billing, history and phone execution logic.

## Authentication and onboarding

Connect a Streamable HTTP MCP client to https://myself.md/mcp. Discover OAuth protected-resource metadata at https://myself.md/.well-known/oauth-protected-resource/mcp and authorization-server metadata at https://myself.md/.well-known/oauth-authorization-server. Use the returned issuer, registration, authorization and token endpoints with authorization code and PKCE. Request the qr-connect scope for the MCP resource. The owner completes sign-in and consent; no shared API key or agent-created grant replaces that approval. A missing or expired bearer token returns HTTP 401 with a WWW-Authenticate discovery header.

## Discover, choose, act and verify

After MCP initialization, call tools/list for the current tool schemas. Discover owned phones and call get_phone_data_catalog before choosing a data type or profile. create_phone_export_profile proposes a profile for owner review; it never grants access. Use the catalog's approved profile and domain grants to request records. Poll get_phone_request for the actual result and follow every pagination cursor. Missing records do not prove HealthKit authorization. Read tool descriptions for exact inputs, limits and availability rather than guessing identifiers.

Phone operations distinguish acceptance from completion. A paired foreground phone may be required. User approval, OS permissions, purchases and system sharing remain device handoffs. Do not retry an uncertain write with a new identifier; check its status first. Blocking an agent or revoking a grant stops future authorized access. Existing results in an AI provider are outside myself.md's control.

## Public discovery API

Read https://myself.md/openapi.json for the public HTTP discovery API. The agent catalog at https://myself.md/.well-known/ard.json points to the MCP server card at https://myself.md/mcp/server-card. These documents describe connection metadata, not private tools or granted records. Use the live MCP tools/list response after authentication for current private operations.

## API compatibility and rate limits

Public discovery reads are available under https://myself.md/v1 (for example /v1/health and /v1/config). The existing unversioned URLs remain compatibility aliases with the same v1 contract. Additive response fields are compatible; consumers should ignore unknown fields. Breaking changes require a new major path. We announce deprecations here at least 90 days before removal and send Deprecation and Sunset headers on affected routes. No v1 route is currently deprecated. MCP uses its negotiated protocol version and live tools/list schemas independently of this public HTTP version.

The seven OpenAPI public reads share a limit of 120 requests per 60 seconds per source IP, per Node process or Worker isolate. It is a best-effort local abuse limit, not a global account quota; shared networks share a bucket and process restarts reset it. RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset (seconds) and RateLimit-Policy report the current local window. HTTP 429 returns a JSON error and Retry-After in seconds. Back off for that delay; avoid concurrent retries. The REST query adapter applies a separate 120-per-minute local window per account and agent client, including polling. X-RateLimit compatibility headers report the same quota with an epoch-seconds reset time. Private MCP and owner APIs retain their existing authorization and limits.

## Official CLI

Download the standalone Node.js 22+ CLI from https://myself.md/cli/myself.mjs and run node myself.mjs help. Dependency notices are at https://myself.md/cli/notices.txt. Review the downloaded file before running it. The same JavaScript source ships in scripts/myself.js in the project checkout. After installing the repository dependencies, run npm run myself -- health, config, docs, openapi or tools. Run npm run myself -- call TOOL with a JSON argument object on standard input. MYSELF_URL selects an HTTPS service origin; MYSELF_TOKEN provides an existing owner-approved OAuth access token for tools and call. The CLI never stores tokens or grants access. Discover the live tool schemas before calling operations and verify queued phone completion through get_phone_request. The CLI is distributed directly from myself.md; no npm registry package is published yet.

## Privacy and support

get_privacy_policy returns the shared policy and support contacts without a data grant, under the existing MCP account authentication. Read https://myself.md/privacy before sharing sensitive records. Public support is at https://myself.md/support. Source: https://github.com/CodyBontecou/myself.md. This service provides data access, not medical advice.
`;
const contact = `# Contact myself.md support

For app help, pairing problems, export failures, privacy questions or account deletion questions, email ${privacyPolicy.supportEmail}. Public development issues can be opened at ${privacyPolicy.issuesUrl}. Email composition and issue submission are external actions you complete yourself; reading this page does not send a message or create a report.

Do not include health records, precise location, access tokens, passwords, purchase receipts or other private information in an initial request. GitHub issues may be public. Describe the platform, the action you tried, the observed result and the time of the failure. Review screenshots and diagnostic information before sending them. Read https://myself.md/privacy for storage, retention and revocation details. For account deletion use https://myself.md/delete-account and follow the authenticated confirmation flow.
`;
/** Public descriptions contain no account records or credentials. */
export const publicPages = new Map([
  ['/', home],
  ['/docs', guide],
  [
    '/faq',
    `# Frequently asked questions\n\n${publicFAQs.map((item) => `## ${item.question}\n\n${item.answer}`).join('\n\n')}`,
  ],
  ['/about', `# About myself.md\n\n${home.slice(home.indexOf('\n\n') + 2)}`],
  ['/contact', contact],
  ['/support', contact],
  [
    '/privacy',
    `# ${privacyPolicy.title}\n\nUpdated ${privacyPolicy.updated}\n\n${privacyPolicy.sections.map((section) => `## ${section.title}\n\n${section.body}`).join('\n\n')}\n\nSupport: ${privacyPolicy.supportEmail}\n`,
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
    )}<nav aria-label="Public resources"><a href="/">Home</a> · <a href="/demo">Demo</a> · <a href="/docs">Developers</a> · <a href="/faq">FAQ</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="mailto:${privacyPolicy.supportEmail}">Email support</a> · <a href="${privacyPolicy.issuesUrl}">GitHub issues</a> · <a href="/llms.txt">Agent instructions</a></nav></main>`;
}
