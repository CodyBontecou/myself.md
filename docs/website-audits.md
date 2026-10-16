# Recurring website audits

The website audit uses GitHub Actions for cadence and the existing Isobot Pi Durable conversation `myself-md-seo` for analysis. Isobot receives bounded observed evidence; it is not given Cloudflare, Google, or GitHub credentials. Actionable recommendations can produce one draft PR per run through Codex. Nothing merges or deploys automatically.

## Cadence and evidence

The workflow runs at 07:23 UTC daily. Monday's run includes deeper analytics review. Technical checks read the public site, robots policy, sitemap, metadata and structured data. Weekly review adds read-only Cloudflare Web Analytics and Google Search Console data when authorized. GitHub schedules can be delayed and run only after this workflow is on the default branch.

Cloudflare's current `lite: true` configuration excludes EU visitors. Collection before the CSP repair on 16 October 2026 is not a reliable baseline. Search Console data is delayed; compare finalized periods, not today's incomplete results. Missing access, empty results and insufficient volume are reported explicitly, never converted into zero traffic or proof of a regression. A measured optimization opportunity is a hypothesis, not a promise of higher rankings.

Only evidence-backed, in-scope website changes may become draft PRs. The implementation job has no analytics/Isobot/GitHub credentials. A separate validation job checks the patch and enforces a public-presentation file allowlist before a separate publication job receives GitHub write permission. Stable recommendation markers prevent repeated PRs for the same finding. Authentication, billing, native code, infrastructure and workflows remain outside automatic fixes.

The full evidence and model reply are not published as public Actions artifacts. Downstream jobs receive sanitized technical findings and the minimum page-level numeric evidence needed for selected opportunities, not search terms, raw analytics rows, credentials or page bodies. The private Isobot conversation is the place to inspect the analysis.

## Installed identities

- GitHub secret `ISOBOT_PROMPT_API_TOKEN`: existing dedicated Isobot prompt credential; not the support bridge/task credentials.
- GitHub secret `CF_ANALYTICS_API_TOKEN`: Account Analytics Read only, restricted to the hosting account. Expires 16 October 2027; rotate before expiry. It cannot change DNS or deploy Workers.
- GitHub secret `CODEX_API_KEY`: existing implementation credential, used only by the Codex job.
- GitHub variables `GSC_WORKLOAD_IDENTITY_PROVIDER` and `GSC_SERVICE_ACCOUNT`: keyless Google identity. No service-account private key is stored in GitHub.

Google identity: `myself-seo-audit@costream-365419.iam.gserviceaccount.com`. Its federation provider accepts only this repository's `website-audit.yml` on `main`; the service account has no project-level roles. The workflow requests only the `webmasters.readonly` scope.

### Owner action: Search Console access

In the verified `myself.md` Domain property, open **Settings → Users and permissions → Add user**. Add `myself-seo-audit@costream-365419.iam.gserviceaccount.com` with **Restricted** permission. The bot cannot grant itself access. Keep the existing Google DNS verification TXT record.

Until this grant exists, Google analytics collection reports an authorization problem; technical and Cloudflare checks remain useful. An API access error is not an SEO finding and must not generate an implementation PR.

## Operate

Run a manual report-only audit after the workflow is merged:

```sh
gh workflow run website-audit.yml --repo CodyBontecou/myself.md --ref main -f mode=daily -f publish=false
```

Select weekly mode for the analytics review. Scheduled runs may publish draft PRs; manual runs default to report-only. Review evidence, changed paths and validation before merging any generated PR. An allowed file path is not proof that a proposed change is useful or safe.

To pause the cadence without touching the website:

```sh
gh workflow disable website-audit.yml --repo CodyBontecou/myself.md
```

Rotate the Cloudflare secret through a new account-scoped read-only token; never substitute a deploy/admin token. If Google authentication fails, inspect the workflow's source status, federation condition and Search Console user grant. Do not weaken the federation condition or expand scopes to bypass the error.
