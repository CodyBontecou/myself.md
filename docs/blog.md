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
4. Release using the site's normal deployment workflow, or install the automatic vault deployment below.

`npm run dashboard:build` refreshes the snapshot automatically when the local vault exists. In CI, Docker or a checkout without the vault, it explicitly reports that it uses the committed snapshot. Thus deployments do not depend on an external symlink or a GitHub credential. `npm run blog:build` always requires the linked vault and fails if it is missing. Builds never fetch from GitHub automatically.

## Automatic vault deployment

The workflow source is `distribution/blog/publish-blog.yml`. Run `npm run blog:install-deploy` with authenticated GitHub CLI access to install or update `.github/workflows/publish-blog.yml` on the private vault's `main` branch. This command commits only that workflow through the GitHub Contents API; it does not stage this checkout, change notes, or store a credential. It is idempotent when the remote workflow already matches.

The website's blog implementation must first be published to `CodyBontecou/myself.md` on `main`. Add a `CLOUDFLARE_API_TOKEN` Actions secret to `CodyBontecou/myself.md-vault`, scoped to the Cloudflare account that owns myself.md and its Worker deployment/routes. Never use a GitHub or Cloudflare login token as a substitute. No cross-repository GitHub token is needed: the website source is public and the vault workflow's read-only `GITHUB_TOKEN` checks out its own private content.

Once those prerequisites exist, pushing Markdown changes to vault `main` rebuilds and deploys. The workflow also supports **Run workflow** from the vault Actions tab. It fetches website `main` and the latest vault `main` with full Git history, so queued runs build current notes and preserve publication dates. The checked-in symlink resolves to that nested vault checkout. It runs the dashboard build, aggregate static checks, blog publication tests and a Wrangler dry run before deployment. A missing blog implementation or token fails explicitly.

Only the deploy step receives the Cloudflare token. The workflow uses pinned official GitHub actions, read-only repository permissions, a 25-minute deadline and one deployment at a time without cancelling an active deployment. `wrangler deploy --keep-vars` preserves dashboard-managed variables; existing secret values are not replaced. This deploys the complete website/API Worker from website `main` because public content is bundled into that Worker. Keep production-ready application code on that branch; the workflow never publishes uncommitted local app work. Concurrent deployments performed outside this vault workflow still need normal release coordination.

After deployment, `npm run blog:verify-live` checks that the live HTML, Markdown, RSS, sitemap and adjacent-post links match the built vault snapshot, with brief retries for propagation. The Actions summary records both source commit IDs only after that verification passes. Failed validation prevents deployment; a failed post-deployment check reports failure and requires review or a normal Worker rollback. It does not silently roll back a potentially newer release. Snapshot updates stay within the build and are not committed back to either repository.

To stop automatic updates, disable **Publish blog** in the vault Actions tab or remove its workflow. Revoke the dedicated Cloudflare token when retiring the integration. Future-dated posts still need a later vault push or a manual workflow run on/after their date; this workflow adds no scheduled runs.

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
