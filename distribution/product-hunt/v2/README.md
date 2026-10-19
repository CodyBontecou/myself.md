# Product Hunt gallery v2

Review packet revised October 19, 2026. The copy and five mobile gallery images were saved to the existing Product Hunt draft and verified that day. The launch remains unpublished and unscheduled.

This revision focuses on the current iPhone app, using cream, charcoal and the app's existing neutral interface. The full iPhone frames are larger, with enlarged control details and a single short headline per slide. [Copy](copy.md) and [listing](listing.json) are included. Edit the source listing one directory above, then run `npm run product-hunt:render` to regenerate this version.

![Gallery preview](preview.png)

| Order | Image                                             | Message                                                    |
| ----- | ------------------------------------------------- | ---------------------------------------------------------- |
| 1     | [Cover](gallery/01-cover.png)                     | Your phone data. On your terms.                            |
| 2     | [Data selection](gallery/02-data-selection.png)   | Select individual types such as Step Count.                |
| 3     | [Private permissions](gallery/03-permissions.png) | Selecting export data leaves agent access private.         |
| 4     | [Owner approval](gallery/04-owner-approval.png)   | Review the actual app confirmation before allowing Health. |
| 5     | [Health only](gallery/05-health-only.png)         | Health enabled; Screen time, Location and Logs remain off. |

Each gallery PNG is 1270×760. The square thumbnail is 240×240. `assets.json` records dimensions and sizes. `preview.png` is a review sheet, not an additional gallery image.

## Capture evidence

Full, unmodified screenshots were captured from a dedicated iPhone 17 Pro simulator running the current checkout's JavaScript on October 16. The fictional profile is named My week. It selects only Step Count. Full phone screenshots sit beside enlarged crops of the same capture; controls and records are not reconstructed. Sources are in `launch-video/public/product-hunt/mobile-v2/`.

The app used its isolated populated QA fixture and documented clean preview mode (`EXPO_PUBLIC_QA=1`, `EXPO_PUBLIC_QA_BANNER=0`). System permission labels are synthetic fixture state. These images demonstrate the current app interface and category-specific approval; they do not prove live HealthKit reads, pairing or public installation. Public mobile downloads remain described as coming soon.

The recorded `product-hunt-iphone-screens-v2` flow replayed with 57 passing checks and no failures. It selected Step Count, opened the actual Health confirmation and verified that only Health became enabled. A separate capture path verified all permissions off after disabling Health. Direct simulator PNG capture avoided a stale refresh overlay returned by some automation screenshot frames. The isolated fixture was reset afterward, its preview server stopped and its simulator shut down. No real account, phone data or OS grant was changed.

## Review before eventual publication

Review maker wording, public installation, pricing and final release behavior. The five screenshots tell one narrow permission story; they do not substitute for new-user installation and a completed native read. Use only this current mobile gallery; superseded local screenshots and packet have been removed.

The renderer checks the 60-character tagline and 500-character description limits, PNG dimensions and thumbnail size. Layout source is `launch-video/product-hunt.js`. No app capability or MCP operation changed.
