# MCP directory submission research

Verified against primary sources on October 12–13, 2026. This document covers Claude, the official MCP Registry, Smithery, and Glama. The official Registry entry is published and OpenAI is in review. [Smithery and Glama's ledger](mcp-smithery-glama-submission.md) records their current progress. Platform requirements can change; recheck the linked pages immediately before submitting.

## Distinguish the distribution routes

A user adding our URL as a custom connector makes the server usable by that user; it does not create a public directory listing. Claude's public directory has a separate developer submission portal. A remote MCP connector and a plugin bundle are separate submission types: a plugin can contain instructions and a reference to the connector. Claude recommends submitting the remote server separately even when a plugin references it. A connector requires no public source repository; a plugin's GitHub repository must be public before publication. [Claude directory publishing](https://claude.com/docs/directory/publish)

The official MCP Registry publishes server metadata for discovery rather than hosting server code. Publishing there does not itself satisfy Claude's directory review or establish a ChatGPT listing. Treat it as a complementary channel. [Official Registry introduction](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/)

## Claude Connectors Directory

Submission: [Claude developer portal](https://claude.ai/directory/manage), then **Submit new → MCP connector**. Submit from the organization that should own the listing. Paid Pro, Max, Team, or Enterprise is required; Team requires an Owner, and Enterprise also permits members granted Directory permission through a custom role. [Who can submit](https://claude.com/docs/directory/publish)

Prepare a reachable HTTPS endpoint, documentation and privacy-policy URLs, support contact, icon, populated reviewer account, company website/contact, use cases, and account/plan prerequisites. Listing limits are 100 characters for the name, 200 for the one-liner, 2,000 for the description, and one to five categories. The published slug is permanent. MCP Apps additionally need 3–5 PNG screenshots at least 1000 pixels wide, cropped to the response, with prompts supplied separately. Ordinary tool-only connectors do not have that screenshot requirement. The portal also asks about health data handling. Every submission is scanned; Community is the default listing label, while Verified review is a separate higher-touch process. [Submission requirements and portal](https://claude.com/docs/connectors/building/submission)

Review gates:

- Every tool needs a title, a name no longer than 64 characters, and appropriate annotations. Claude's checklist explicitly calls for `readOnlyHint: true` on reads and `destructiveHint: true` on tools that modify or delete data.
- Split reads and writes into separate tools. A catch-all HTTP tool accepting both safe and unsafe methods fails review.
- Descriptions must accurately explain the operation without instructions that try to control the model.
- Validate inputs, return useful errors, keep output bounded, and use first-party or legitimately proxied APIs. The server domain should match the service.
- Test every tool through MCP Inspector and a Claude custom connector. Reviewers need a populated account and complete access instructions.

[Claude connector checklist](https://claude.com/docs/connectors/building/review-criteria)

For a personal account service, use OAuth rather than relying on static bearer-token setup. Claude supports DCR and Client ID Metadata Documents (CIMD); static headers are a limited organization beta. Unauthenticated requests must return `401` with a `WWW-Authenticate` pointer to protected-resource metadata, whose `resource` exactly matches the server URL. Support S256 PKCE and authorization-server discovery. CIMD requires both `client_id_metadata_document_supported: true` and `none` in `token_endpoint_auth_methods_supported`; otherwise Claude falls back to DCR. Hosted surfaces redirect to `https://claude.ai/api/mcp/auth_callback`. Claude Code needs loopback redirects for both localhost and 127.0.0.1 with a variable port. [Claude authentication requirements](https://claude.com/docs/connectors/building/authentication)

## Official MCP Registry

Publication route: the official `mcp-publisher` CLI and [publishing quickstart](https://modelcontextprotocol.io/registry/quickstart). Create `server.json`, authenticate, publish, and verify the registry API returns the entry. The quickstart's npm package publication steps apply to package distribution; a remotely hosted server can use `remotes` instead. [Quickstart](https://modelcontextprotocol.io/registry/quickstart), [remote servers](https://modelcontextprotocol.io/registry/remote-servers)

Use the current schema, a stable namespaced name, description, version, and a `remotes` entry containing `type: "streamable-http"` and the production HTTPS URL. Remote servers must be publicly reachable; publicly reachable does not mean account data must be unauthenticated. Secret headers can be described as user-supplied values rather than embedded credentials. SSE is deprecated. [Remote server metadata](https://modelcontextprotocol.io/registry/remote-servers)

Prove namespace ownership: GitHub authentication corresponds to an `io.github.<owner>/...` name; a domain namespace requires domain verification. Referenced packages also require ownership verification. Only metadata under `_meta["io.modelcontextprotocol.registry/publisher-provided"]` is preserved by the official registry, with a 4KB limit. [Official registry requirements](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md)

The draft is [distribution/mcp/server.json](../distribution/mcp/server.json), using `md.myself/mcp` for the `myself.md` domain. DNS authentication requires a signing key and a domain TXT record containing its public key; keep the private key outside the repository. DNS ownership and publication completed for version 1.0.0; see the submission ledger. The draft deliberately omits a source repository and icon rather than claiming an unverified public asset. Its shape follows the [current server schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json); the 100-character description limit differs from Claude's listing limits. [Registry authentication](https://modelcontextprotocol.io/registry/authentication)

## Smithery

Submission: [smithery.ai/new](https://smithery.ai/new). Bring the hosted HTTPS URL; Streamable HTTP and OAuth for protected services are required. Smithery's Gateway proxies to the upstream server, so assess that data path before recommending it for personal data. It scans tools, prompts, and resources, requesting authentication when needed. If scanning cannot finish, a static `/.well-known/mcp/server-card.json` can describe public capabilities without exposing account data. Vendor verification is available afterward in Settings → Verification. Smithery documents CIMD handling and expects `401`, rather than `403`, to start OAuth discovery. [Smithery publishing](https://smithery.ai/docs/build/publish)

## Glama

For our hosted service, use [Glama connectors](https://glama.ai/mcp/connectors) → **Add MCP Server → Connector**. Supply a name, description, HTTPS Streamable HTTP URL, and optional private test credentials. OAuth DCR can avoid supplying test credentials. Only healthy connectors are indexed; submissions become public when healthy. Claim ownership through domain DNS/HTTPS verification or matching GitHub identity, then declare the correct authentication method in the test profile. The separate [open-source server catalog](https://glama.ai/mcp/servers) takes a GitHub repository, name, and description and can use `glama.json` indexing metadata. A catalog listing and Glama Gateway usage are separate choices: the gateway logs full tool payloads, which matters if we later choose to distribute through it. [Glama submission and ownership FAQ](https://glama.ai/mcp/faq)

## Suggested execution order

This order is an implementation recommendation, not a requirement imposed by a directory:

1. Complete production OAuth, annotations, public setup docs, privacy policy, and an isolated populated reviewer account.
2. Verify all tools through Inspector and Claude with that account; record evidence without credentials.
3. Prepare and validate the official Registry manifest using the production URL and a namespace we control.
4. Submit Claude and the official Registry, then Smithery and Glama using the same reviewed listing copy.
5. Consider a Claude plugin containing focused workflows only after the connector itself works reliably.

Do not put real user records or production secrets in submission artifacts. Reviewer credentials belong in each platform's private submission mechanism.
