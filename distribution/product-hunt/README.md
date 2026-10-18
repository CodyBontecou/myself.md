# myself.md Product Hunt preparation

**Saved Product Hunt draft:** [Open draft](https://www.producthunt.com/products/myself-md?launch=myself-md) · [Edit](https://www.producthunt.com/posts/myself-md/edit). Verified October 16: “This product is a draft and is not scheduled for a launch yet.” The draft contains the copy and five images from the original frozen bundle approved in this chat, plus its thumbnail. [Saved copy](saved-draft-copy.json) · [Status](draft-status.json). The newer local v2 mobile gallery has not been uploaded. Nothing was published or scheduled.

**Latest revision:** [v2 mobile gallery and copy](v2/README.md), using current iPhone screens and a restrained neutral palette. [Preview](v2/preview.png) · [Copy](v2/copy.md) · [ZIP](v2/myself-md-product-hunt-v2.zip). The files below describe the preserved first iteration; `npm run product-hunt:render` now regenerates v2.

Historical preparation state before the saved draft above: local-only materials prepared October 16, 2026, before any form entry or upload.

The [copy](copy.md) leads with bringing selected phone data into an AI workflow and makes owner approval explicit. [listing.json](listing.json) is the editable source for the name, tagline, description and maker comment. The description preserves current mobile availability; update that sentence only after public installation works. The maker should review the first-person wording before eventual publication.

## Gallery

![Five-image gallery preview](preview.png)

Upload order when publication is later authorized:

| Image                                              | Message                             | Source and scope                                                                                            |
| -------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [01-cover.png](gallery/01-cover.png)               | Put your phone data to work with AI | Graphic layout using the current app icon configured in `app.json`                                          |
| [02-explore.png](gallery/02-explore.png)           | Look inside your exports            | Actual public demo explorer, captured October 16 with fictional records                                     |
| [03-permissions.png](gallery/03-permissions.png)   | You decide what's shared            | Actual public demo cloud-sharing panel; phone permissions are separate                                      |
| [04-agent-result.png](gallery/04-agent-result.png) | Ask about your week                 | Illustration of the retained actual local MCP transcript with synthetic data, not an AI-provider screenshot |
| [05-demo.png](gallery/05-demo.png)                 | Try it before you connect           | Actual public demo export library; no login required                                                        |

Every gallery image is 1270×760 PNG. The [thumbnail](thumbnail.png) is 240×240 PNG and uses the current statue app icon. [assets.json](assets.json) records dimensions and file sizes. `preview.png` is a review contact sheet, not a sixth upload image.

The screenshots are honest crops inside graphic layouts. They do not reconstruct product controls, change displayed records or imply the gallery's result happened inside the browser demo. Gallery four derives 64,980 steps and 352 app minutes from [`agent-transcript.json`](../../launch-video/public/agent-transcript.json). Its protocol execution used a synthetic phone adapter, not native health reads; the chart covers October 6 through 12. The prior video capture notes explain the [execution provenance](../../launch-video/README.md).

Older mobile captures were excluded because the current app changed its permission controls and removed Logs/Support tabs. This gallery focuses on the current public dashboard and the verified synthetic protocol example. It does not establish mobile installation, native source permissions or compatibility with every AI client.

## Reproduce locally

```sh
npm run product-hunt:render
```

The command renders the five images, thumbnail and contact sheet through the existing Remotion renderer. It checks copy limits, PNG dimensions and thumbnail size, regenerates `copy.md` from the JSON, and writes the asset inventory. It performs no publication or network submission. First use may download Remotion's official browser, as the video renderer does.

Editable layouts are in [`product-hunt.js`](../../launch-video/product-hunt.js), within the existing strict video type-check scope. Source captures live in `launch-video/public/product-hunt/`: `dashboard.jpg`, `explorer.jpg`, `profiles.jpg` and the copied current app icon. Captures were made signed out in the browser without changing any real account data or sharing grants. The permission capture shows the sample location profile kept private and its Share with agents action. No private records or credentials are included.

The [Product Hunt checklist](https://www.producthunt.com/launch/preparing-for-launch), checked October 16, permits a 60-character tagline and 500-character description. It recommends 1270×760 gallery images, requires at least two, and recommends a square 240px thumbnail under 3 MB. Use clean product links. Optional video needs a non-private YouTube URL; no video was uploaded here.

## Before eventual publication

Confirm the maker's Product Hunt username, released installation links, the offer/pricing selection and the current availability wording. Review final images at full size, especially the fictional-data labels. The demo and local protocol example do not replace a successful new-user phone setup. No launch discount, promotion code or launch date is assumed.

No app capability, dashboard action, authorization behavior or MCP operation changed. The parity inventory is unaffected. Gallery tooling uses the existing static checker scope; `npm run format` and `npm run check` remain the aggregate validation commands.
