# Blog

The public site serves `/blog` (latest post and dated archive), `/blog/{slug}`, and `/blog/feed.xml`. Pages contain their complete content in the initial HTML, with no browser JavaScript required. They use the existing site navigation and support light/dark appearance and narrow screens.

## Write in Obsidian

Run `npm run blog:setup` once. This clones [myself.md-vault](https://github.com/codybontecou/myself.md-vault) into ignored `.local/blog-vault`. The committed `content/blog` symlink points there; open `content/blog` as an Obsidian vault. You can instead point that symlink at an existing local vault checkout. The setup command does not pull updates or change an existing checkout.

All nonempty `.md` notes are published unless marked `draft: true`, `publish: false`, or dated in the future. Hidden directories, Obsidian configuration, plugins and nested symlinks are ignored. Use a dedicated blog vault rather than a private journal vault. Only the body and the metadata listed below enter the generated snapshot. Location frontmatter and other unrecognized properties are discarded; Obsidian `%%comments%%` are omitted. This does not redact sensitive information written in the note body.

Optional frontmatter uses single-line scalar properties (multiline YAML properties are unsupported):

```markdown
---
title: Why myself.md?
slug: why-myself-md
date: 2026-10-13
updated: 2026-10-14
description: Why I am bringing health, screen time and location data together.
author: Cody Bontecou
draft: false
---

Write the post here.
```

Title defaults to the first H1, then the filename. Slug defaults to the filename, normalized to lowercase letters, digits and hyphens. Set an explicit slug to keep URLs stable when renaming a note. Dates must be `YYYY-MM-DD`; publication defaults to a leading filename date, then the first Git commit date. Modification defaults to the latest commit date. Set dates explicitly for uncommitted/new notes. Future posts appear only after a rebuild on or after their publication date. Duplicate slugs and invalid metadata dates fail the build.

Standard Markdown, fenced code, tables, lists and HTTPS images work. Obsidian `[[Note]]`, `[[Note|label]]`, heading fragments and Markdown `.md` links resolve to published posts. Unpublished note references remain plain text. Vault attachment embeds and transclusion are not supported; use hosted HTTPS images. Raw HTML is escaped and unsafe link protocols are rejected.

## Build and release

1. Edit locally in Obsidian, or pull committed vault updates with `git -C .local/blog-vault pull --ff-only` after checking that checkout for local changes.
2. Run `npm run blog:build` to refresh `server/blog-content.js`. Review this generated public snapshot before committing it to the site repository.
3. Run `npm run format`, `npm run check` and `npm run verify:blog`. The existing HTTP and Worker fixtures also verify the blog: `npm run verify:cloud` and `npm run verify:worker`.
4. Release using the site's normal deployment workflow, or use the automatic blog publisher below.

`npm run dashboard:build` refreshes the snapshot automatically when the local vault exists. In CI, Docker or a checkout without the vault, it explicitly reports that it uses the committed snapshot. Thus deployments do not depend on an external symlink or a GitHub credential. `npm run blog:build` always requires the linked vault and fails if it is missing. Builds never fetch from GitHub automatically.

`npm run worker:deploy` first runs `npm run blog:check-source`, which requires a clean linked vault at the current remote `main` revision. This prevents a later application deployment from overwriting newer blog posts with an old snapshot. Run setup and pull the vault before deploying; a missing vault, unpublished edits, stale revision or unavailable remote blocks deployment. Offline builds can still use the committed snapshot.

## Automatic publishing from myself.md

The workflow is `.github/workflows/publish-blog.yml` in **CodyBontecou/myself.md**. It checks the vault every 15 minutes (at minutes 7, 22, 37 and 52 UTC) and offers **Actions → Publish blog → Run workflow** for immediate manual publication. `npm run blog:publish` invokes the same manual action through authenticated GitHub CLI. GitHub may delay scheduled runs; scheduled workflows in public repositories are disabled after 60 days without repository activity and must then be re-enabled.

The vault contains only notes and Obsidian configuration; it requires no build scripts, Actions workflow or deployment secret. The website workflow checks out the latest website `main`, then the private vault `main` with full Git history into `.local/blog-vault`. The existing `content/blog` symlink resolves to that checkout. Credentials are removed after checkout, and vault plugins/scripts are never executed.

The website repository owns two Actions secrets:

- `BLOG_VAULT_SSH_KEY`: a dedicated SSH private key whose public key is installed as a **read-only deploy key** on `CodyBontecou/myself.md-vault`. It cannot modify the vault or access other repositories.
- `CLOUDFLARE_API_TOKEN`: the dedicated production deployment token scoped to the Cloudflare account and Worker/routes used by myself.md. It is exposed only to the deployment step. Never substitute a GitHub token or a general interactive Cloudflare login credential.

Every run builds the public snapshot, then compares its content SHA-256 with the live `/blog` response's `X-Blog-Content-SHA256` header. Unchanged scheduled runs skip the dashboard build, validation and deployment. Changes to bodies, allowed metadata, publication eligibility or deleted notes change the hash. This also publishes future-dated notes once eligible without requiring another vault commit. Failed HTTP reads stop the run rather than triggering a deployment. A missing hash on an older deployment triggers an initial publication. Manual runs force publication, even when the hash matches.

Before publishing, the workflow runs aggregate static checks and blog regression checks. It downloads the currently deployed unminified Worker and replaces only its `blogPosts` array, content hash and freshness header. Unknown bundle shapes fail explicitly. It uploads a version with inherited bindings and retained assets, compares its bindings/runtime with the active version, then rechecks production code, settings and deployment state before activation. An unresolved staged version or concurrent application deployment stops publication for review. Only then does it activate the content version and verify live HTML, Markdown, RSS, sitemap, the content hash and adjacent-post navigation. The Actions summary records website/vault revisions and the published Worker version. Failed post-deployment verification requires review or the normal rollback process.

The publisher preserves the deployed application code, static assets, bindings, runtime configuration and application release state. It does not rebuild or deploy the application from website `main`. This avoids rolling back application fixes when publishing notes. New blog rendering features still use the normal application release process. Runs share one publication concurrency group without cancelling active publication; application releases outside this workflow still need normal coordination. Generated snapshots are not committed back to either repository.

When migrating from the former vault workflow, first install these secrets and this website workflow, run a successful manual publication, and confirm a scheduled run skips unchanged content. Only then remove `.github/workflows/publish-blog.yml` and `CLOUDFLARE_API_TOKEN` from the vault repository. To stop automatic publication later, disable **Publish blog** in the myself.md Actions tab; remove its secrets and the vault deploy key when retiring the integration.

## Discovery and SEO

Each post has a canonical URL, unique title/description, publication/modification dates, author, Open Graph/Twitter metadata and `BlogPosting` JSON-LD. The archive has `Blog` structured data. Posts appear in `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, RSS and ordinary HTML navigation. Robots policy allows public blog crawling. Missing posts return HTTP 404 with a link back to the archive; HTML errors carry `noindex`.

Agents can request `Accept: text/markdown` on archive/post URLs, or fetch `/blog/{slug}.md`. Responses declare `Vary: Accept`, and GET/HEAD share the Node/Worker routing. The full OAuth MCP endpoint exposes `read_public_blog`: omit `slug` for the complete structured index, then pass a discovered slug for the same full Markdown body. Public HTTP reads need no account. The restricted ChatGPT data connector retains its existing tool allowlist and does not expose this editorial tool.

This follows [Is Agentic's public guidance](https://is-agentic.com/) on retrievable initial HTML, correct HTTP status, semantic structure, canonical identity and previews. Search indexing and an Is Agentic score can only be verified after deployment; this implementation does not claim either has occurred.

## Is Agentic audit — 15 October 2026

The live `/blog` scan scored **100/100**, with **10/10 essential checks** passing. [Report](https://is-agentic.com/scan/myself.md/blog). The original snapshot was taken at 10:26 UTC (12:26 Berlin). The report inferred an app from the site's shared API/MCP discovery, so blog and documentation pages now explicitly declare the `content` site type. This changes the report's default lens, not its numeric score. Public documentation page titles now include `myself.md` to improve brand-specific discovery.

Direct unauthenticated checks returned HTTP 200 for `/blog`, `/docs`, `/docs/reference`, `/demo`, `/llms.txt`, `/robots.txt` and `/openapi.json`; `/features` correctly returned 404. The observed journey's claims of 401 documentation pages and a tagline-only homepage were not reproducible on this release. It should not be used as proof that current public documentation requires sign-in.

Remaining recommendations were assessed against the real interfaces:

- Brand and developer searches did not surface this newly published site in one search sample. Sitemap/robots, public documentation, canonical URLs and branded titles are in place. Search-engine indexing and ranking cannot be guaranteed by an application change.
- The Organization schema lacks a postal address. No public business postal address has been supplied; the blog does not invent an address or expose private location data to satisfy this check.
- The editorial blog requires no credentials, and `/demo` is a public fictional-data sandbox. Private app reads use owner-approved OAuth rather than self-issued API keys. No new key-generation or account flow is warranted for blog reading.
- Every documented operation has a typed successful response. The phone-query creation operation correctly uses HTTP 202 with its own JSON schema; HTML, Markdown and plain-text reads declare string schemas with their actual media types. Recommendations favoring JSON or HTTP 200 do not justify changing those contracts.
- The MCP endpoint requires authentication by design. Its presence is discoverable publicly; existing authenticated Node/workerd fixtures verify emitted tools, scopes and data isolation. The scanner's inability to inspect protected tools is not a reason to remove OAuth.
