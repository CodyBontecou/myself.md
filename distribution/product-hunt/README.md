# myself.md Product Hunt preparation

The [saved Product Hunt draft](https://www.producthunt.com/products/myself-md?launch=myself-md) was updated and verified October 19, 2026. Its description, maker comment and five mobile images match the cleaned local packet. It remains a draft with no launch scheduled. Saved copy (local-only: `.local/reports/distribution/product-hunt/saved-draft-copy.json`). [Edit draft](https://www.producthunt.com/posts/myself-md/edit) · Status (local-only: `.local/reports/distribution/product-hunt/draft-status.json`).

Use the [current mobile gallery and packet](v2/README.md): preview (local-only: `.local/product-hunt/v2/preview.png`), [copy](copy.md), ZIP (local-only: `.local/product-hunt/v2/myself-md-product-hunt-v2.zip`). Superseded local screenshots, copy snapshots and the older packet have been removed. Historical versions remain in Git.

[listing.json](listing.json) is the editable source for the name, tagline, description and maker comment. The copy points to supported datasets and connection instructions. Private reads require an installed app, permissions and owner approval. Confirm public installation and pricing before publication; the maker should review the first-person wording.

## Gallery

Five-image mobile gallery preview (local-only: `.local/product-hunt/v2/preview.png`)

| Order | Image                                                                                 | Message                                             |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1     | Cover (local-only: `.local/product-hunt/v2/gallery/01-cover.png`)                     | Your phone data. On your terms.                     |
| 2     | Data selection (local-only: `.local/product-hunt/v2/gallery/02-data-selection.png`)   | Select individual types such as Step Count.         |
| 3     | Private permissions (local-only: `.local/product-hunt/v2/gallery/03-permissions.png`) | Selecting export data leaves agent access private.  |
| 4     | Owner approval (local-only: `.local/product-hunt/v2/gallery/04-owner-approval.png`)   | Review the app confirmation before allowing Health. |
| 5     | Health only (local-only: `.local/product-hunt/v2/gallery/05-health-only.png`)         | Health enabled; other categories remain off.        |

Each gallery PNG is 1270×760. The thumbnail (local-only: `.local/product-hunt/v2/thumbnail.png`) is 240×240. Asset inventory (local-only: `.local/product-hunt/v2/assets.json`). These are isolated app QA captures; they do not prove native reads, pairing or public installation. Capture provenance is in the [mobile packet README](v2/README.md).

## Reproduce locally

```sh
npm run product-hunt:render
```

The command writes the mobile gallery, thumbnail, contact sheet, copy, inventory and ZIP to ignored `.local/product-hunt/v2/`. It checks copy limits and dimensions. Retained screenshot inputs and editable listing/layout source stay tracked. The `zip` command is required. It performs no publication or network submission. First use may download Remotion's official browser. Editable layouts are in [product-hunt.js](../../launch-video/product-hunt.js); captures are in `launch-video/public/product-hunt/mobile-v2/`.

## Before publication

Review the maker's username and wording, installation instructions, pricing, fictional-data labels and the complete new-user workflow. The local QA images do not replace a completed native read. No launch date, discount or promotion code is assumed.

This packet changes no app capability, authorization or MCP operation. Run `npm run format` and `npm run check` after edits.
