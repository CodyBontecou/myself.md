# Self hosting myself.md

myself.md is open source under [AGPL-3.0-only](../LICENSE). You can run your own instance on infrastructure you control. Your instance provides its own dashboard, phone pairing, export storage, and MCP endpoint; you manage its accounts, secrets, availability, and backups.

The steps below use the repository's Docker Compose stack on any host that supports it. Hosting providers are interchangeable; the application still needs a persistent filesystem, an identity service, and HTTPS. Review [billing and mobile builds](#billing-and-mobile-builds) before starting: the current code retains usage metering, social sign-in, and native integration requirements.

## What you will run

| Component  | Purpose                                                | Persistent state                                                           |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| App server | Dashboard, API, phone pairing, and Streamable HTTP MCP | SQLite databases and encrypted exports in `cloud-data`, mounted at `/data` |
| Keycloak   | OAuth sign-in and account identity                     | Accounts, provider credentials, and signing keys in PostgreSQL             |
| PostgreSQL | Keycloak database                                      | `identity-data`                                                            |
| Caddy      | Public HTTPS and certificate renewal                   | `caddy-data`                                                               |

[compose.cloud.yaml](../compose.cloud.yaml) connects these services on a private container network. Only Caddy publishes host ports. The app forwards the public realm's login routes under `/auth`; Keycloak administration remains private.

Run **one app server replica**. SQLite persistence and in-memory phone queues do not support multiple replicas. Stored exports and pairing metadata survive restarts; pending live queries and profile deliveries do not. See [cloud-service.md](cloud-service.md) for storage limits, retention, and data access behavior.

## 1 Prepare a host and domain

You need:

- A host with persistent disk, Docker Engine, and the Docker Compose plugin.
- Git and Node.js 22.13 or newer to run repository setup scripts. The app container uses Node.js 24.
- A domain or subdomain you control, such as `exports.example.com`, pointing to the host. Use your own real hostname everywhere below.
- Inbound ports 80 and 443 for the included HTTPS setup, and outbound access for image downloads, certificates, and OAuth providers.
- A GitHub OAuth application for your instance. GitHub is the default sign-in provider; Apple sign-in requires additional setup.

Native build tools and Java are unnecessary for hosting the container stack. They are needed if you build the mobile app or run Keycloak outside containers.

## 2 Get the source and generate configuration

```sh
git clone https://github.com/CodyBontecou/agent-bridge.git
cd agent-bridge
npm ci
npm run cloud:setup -- exports.example.com
```

Run commands from this checkout throughout the guide. Setup generates:

- `.env.cloud`, containing your hostname, a random encryption key, and identity database/admin passwords.
- `.local/cloud-realm/qr-connect.json`, containing the initial production OAuth realm and phone, dashboard, and MCP clients.

The realm has no initial users. Password sign-in, local registration, and password reset are disabled. First-time social sign-in creates an account.

Back up `.env.cloud` privately before continuing. Keep `CLOUD_ENCRYPTION_KEY` unchanged: losing it makes existing encrypted exports and history unreadable. These files are ignored by Git. Setup refuses to overwrite existing configuration; edit it in place when maintaining an instance.

[.env.cloud.example](../.env.cloud.example) describes additional settings. Use the generated `.env.cloud` as your starting point; the example includes identifiers for the project's hosted app that may need to differ for your build.

## 3 Start the services

```sh
npm run cloud:start
docker compose --env-file .env.cloud -f compose.cloud.yaml ps
docker compose --env-file .env.cloud -f compose.cloud.yaml logs --tail=100
```

The command builds the dashboard and server image, imports the realm into a new identity database, and starts HTTPS. Allow time for PostgreSQL, Keycloak, and certificate issuance to finish. Browser sign-in becomes usable after the next step.

Realm import only initializes a realm that does not already exist. Editing the seed file and restarting does not update a running realm's clients, users, or credentials; use private Keycloak administration or the provisioning scripts.

## 4 Configure GitHub sign-in

[Register a GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) under your own account or organization. Set:

| Field                      | Value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Homepage URL               | `https://exports.example.com/pair`                                          |
| Authorization callback URL | `https://exports.example.com/auth/realms/qr-connect/broker/github/endpoint` |

Leave device flow disabled. Add its credentials to your ignored `.env.cloud`:

```dotenv
GITHUB_OAUTH_CLIENT_ID=your-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-client-secret
```

The provisioning script needs a private HTTP loopback connection to Keycloak administration. With the included Compose stack, create `.local/compose.admin.yaml` containing:

```yaml
services:
  identity:
    ports:
      - '127.0.0.1:18081:8080'
```

Apply that temporary override and provision the provider **on the deployment host**:

```sh
docker compose --env-file .env.cloud -f compose.cloud.yaml -f .local/compose.admin.yaml up -d identity
```

Wait for Keycloak to finish restarting, then run:

```sh
KEYCLOAK_ADMIN_URL=http://127.0.0.1:18081/auth npm run cloud:auth:social
```

If administering from another computer, use a private SSH tunnel to that loopback port and run the script from a checkout with the same configuration and realm seed. Never expose the admin port publicly. The script configures the existing realm without replacing accounts and requests GitHub profile/email access, with no repository scope.

Remove the temporary port by recreating the identity service from the base configuration:

```sh
docker compose --env-file .env.cloud -f compose.cloud.yaml up -d identity
```

Wait for its restart, then open `https://exports.example.com/login` and choose **Continue with GitHub**. Accounts in this realm are separate from accounts on myself.md, even when the same GitHub identity signs in.

### Optional Apple sign-in

Use your own Apple Services ID, team, signing key, and exact broker return URL ending in `/broker/apple/endpoint`. The Apple provider also requires the pinned adapter in Keycloak. `npm run auth:social:install` downloads and verifies it into `.local/keycloak/providers` for the standalone development runtime; the production Compose image does **not** include or mount it automatically.

For production Apple sign-in, build a custom identity image with that verified JAR installed before Keycloak's build step, then configure `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY_PATH` for the provisioning script. Follow [Keycloak's custom provider container instructions](https://www.keycloak.org/server/containers) and the [repository's Apple configuration notes](../README.md#github-and-apple-sign-in). Apply credentials through the same private admin connection. Keep the original `.p8` key private. The Apple button is usable only after this provider is installed and configured; GitHub is sufficient for the initial deployment.

## 5 Verify the public endpoint

Replace the hostname in these checks:

```sh
curl --fail https://exports.example.com/health
curl --fail https://exports.example.com/config
curl --fail https://exports.example.com/.well-known/oauth-protected-resource
curl --fail https://exports.example.com/auth/realms/qr-connect/.well-known/openid-configuration
curl -i https://exports.example.com/mcp
```

Expect `/health` to return `{"ok":true}`. `/config` must advertise your HTTPS issuer and `https://exports.example.com/mcp` resource. Resource metadata must point to your issuer, and OAuth discovery must return successfully. An unauthenticated `/mcp` request should return `401` with OAuth discovery information. Health alone does not prove sign-in or storage works.

Complete a GitHub browser sign-in and confirm the dashboard opens. Your empty export library is expected on a new instance.

## 6 Connect a phone and an MCP client

1. Add `https://exports.example.com/mcp` to an MCP client that supports remote Streamable HTTP and OAuth. Sign in through your instance's GitHub provider.
2. Call `create_phone_pairing` to generate a short-lived QR for that account.
3. In myself.md, scan the QR or use the paste-link fallback. The phone discovers your server's issuer from the pairing link. On the browser pairing page, **Open in myself.md** provides a custom-scheme fallback for your domain.
4. Sign in on the phone with the same social account and explicitly confirm the connection. Call `list_connected_phones` to verify it.
5. Create a profile on the phone, select the data you want, choose the cloud destination, authorize uploads, and perform an export. Confirm the export appears in your dashboard.
6. Enable **Allow stored cloud data in MCP connectors** for that profile. Verify `list_cloud_exports` and `read_cloud_export` from the MCP client. Reads are metered; test within your allowance.

Pairing and uploading do not grant an agent access to your data. Phone data permissions, profile selection, and stored-cloud sharing remain explicit user choices. Review grants on the phone and in the dashboard.

The seed realm permits dynamic OAuth registration for callback hosts `chatgpt.com`, `claude.ai`, `grok.com`, and localhost. For a different client, add its exact callback host through private Keycloak administration or register a client with its exact callback URL. Preserve PKCE S256 and the `qr-connect` scope and MCP audience; avoid wildcard redirects.

## Billing and mobile builds

Self-hosting currently retains the shared five-use allowance and lifetime entitlement checks. There is no self-hosting environment switch that disables billing. Missing store credentials do not grant unlimited access. The existing manual grant script is specifically for verified time.md Stripe purchases; it is not a general self-hosting setup command.

Native purchase verification requires credentials authorized for the app whose receipts you are verifying. Building your own app does not provide access to the project's Apple or Google credentials. For your own store release, configure your app identifiers, products, and verification credentials as described in [lifetime-unlock.md](lifetime-unlock.md). Mount production verification files read-only using `IAP_CREDENTIALS_DIR`, and use container paths such as `/iap/AuthKey.p8` in server settings. Sandbox mode is for a separate test instance.

The mobile app can pair with a custom server without a native rebuild. Its separate account sign-in flow defaults to `https://myself.md`; a build fully configured for your instance must set `EXPO_PUBLIC_ACCOUNT_SERVER=https://exports.example.com` at build time. Your own iOS Universal Links also require your domain in Expo configuration, a matching `IOS_APP_ID` on the server, and a signed native rebuild. The scanner, paste-link, and custom-scheme fallback work without adding your domain to Universal Links.

Use the repository's [native build commands](../README.md#run-locally) for a custom build. Expo Go cannot provide all of the app's native integrations. Keep compatibility protocols such as `qrconnect://`, the `qr-connect` realm/scope, and profile schemas consistent between clients and server.

## Backups and recovery

Back up the whole deployment, including:

- `cloud-data`: all app SQLite databases, associated files, and encrypted data.
- `identity-data`: a consistent PostgreSQL backup containing accounts, signing keys, clients, and provider credentials.
- `.env.cloud`, the initial realm seed, custom deployment configuration, and any signing/verification credentials.
- `caddy-data`: certificate state for the included HTTPS service.

Use consistent database backups or stop the stack before taking volume snapshots. Copying only a live SQLite database can miss its write-ahead log. Store a protected copy of the encryption key separately from the data backup. Database and index metadata also contain account information, so protect backups even though export content is encrypted.

Restore the data, identity database, and original secrets together, then start the same configuration and verify sign-in and a stored export read. Test recovery before relying on the instance. Restoring only the realm seed does not restore users or configured social providers. Avoid `docker compose down --volumes`; it deletes persistent storage.

## Updates and domain changes

Before upgrading, take a backup and record your current Git commit. Fetch the upstream changes, review them, install the locked dependencies with `npm ci`, then run:

```sh
npm run format
npm run check
npm run cloud:start
```

The final command rebuilds the app image and recreates changed services while retaining named volumes. Repeat the public endpoint, sign-in, and export checks. Do not regenerate configuration or the encryption key on each update. Database changes may require restoring the matching backup when rolling back code.

When changing domains, preserve the same Keycloak realm/users, encryption key, and storage. Set `ACCOUNT_NAMESPACE` to the original issuer before changing `SERVICE_DOMAIN`; account partitions default to the initial issuer and must stay stable. Update Keycloak's hostname, MCP audience, dashboard callbacks/origins, and social-provider callbacks to match the new public URLs. Reauthenticate clients and generate new pairing links as needed. The [domain configuration notes](cloud-service.md#myselfmd-domain-cutover) explain how these identities are preserved in the project's deployment.

## Hosting without the included Compose stack

You can deploy the same components using your own process manager, container runtime, or HTTPS gateway. Preserve the following contract:

- Build the dashboard with `npm run dashboard:build` before running `npm run cloud:run`; the Dockerfile performs this build automatically.
- Supply the server environment explicitly. `cloud:run` does not load `.env.cloud`, and `SERVICE_DOMAIN` alone is a Compose input, not a server setting.
- Set `PUBLIC_URL` to your exact HTTPS origin, `OAUTH_ISSUER` to the public realm URL, `CLOUD_ENCRYPTION_KEY` to the persistent 64-character hex key, and `DATA_DIR` to a durable writable directory. Preserve `ACCOUNT_NAMESPACE` across issuer changes.
- Set `HOST` and `PORT` for your private listener. Route public HTTPS to it and allow Streamable HTTP requests to `/mcp` without buffering responses.
- For the included `/auth` routing, set `AUTH_PROXY=1` and `KEYCLOAK_INTERNAL_HOST` to the private Keycloak hostname. The app proxy connects to Keycloak on port 8080; configure Keycloak with the `/auth` relative path and your public HTTPS hostname.
- Import the generated realm into production Keycloak backed by a persistent database, then provision social login through private administration. Preserve the configured clients, scope, audience, and PKCE policy.
- Keep one app replica and private database/admin access. Leave `ALLOW_HTTP_DEV` and `EXPO_PUBLIC_ALLOW_HTTP` unset in production.

Static-only hosting or an ephemeral function filesystem cannot run this stack unchanged.

## Troubleshooting

| Symptom                                    | Check                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS fails                                | DNS resolves to your host, ports 80/443 reach Caddy, and no other process owns them. Inspect the `https` service logs.                  |
| `/health` works but OAuth fails            | Inspect `identity` and `database` logs; verify the issuer, `/auth` path, and private proxy connection.                                  |
| GitHub sign-in fails                       | Verify the exact broker callback, credentials, and successful `cloud:auth:social` provisioning.                                         |
| Admin provisioning cannot connect          | Wait for Keycloak readiness and check the temporary loopback port or private tunnel. Public `/auth/admin` is intentionally unavailable. |
| MCP registration or token validation fails | Verify exact callback hosts/URLs, HTTPS issuer, `qr-connect` scope, and the audience ending in `/mcp`.                                  |
| Phone pairing is rejected                  | Generate a fresh QR and sign in with the same account on phone and MCP client. Tickets expire after five minutes and can be used once.  |
| Uploads work but MCP sees no exports       | Enable stored-cloud sharing for that profile and check its selected data types and account.                                             |
| An export or read hits a paywall           | Review the usage allowance and entitlement requirements above; self-hosting does not disable them.                                      |
| Stored data is unreadable after a move     | Restore the original encryption key, identity database, account namespace, and matching app data.                                       |

Use `docker compose --env-file .env.cloud -f compose.cloud.yaml logs --tail=100` for diagnostics. Remove secrets, tokens, pairing tickets, and personal records before sharing logs in a GitHub issue.
