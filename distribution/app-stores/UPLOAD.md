# myself.md store asset package

This is an en-US local production package. Building it does not upload, cancel a review, publish, or submit a compliance declaration. Open `index.html` to inspect every asset; `manifest.json` records dimensions, formats, hashes and provenance notes.

## Apple

| Folder                            | Purpose                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apple/screenshots/iphone-medium` | Eight ordered 1206×2622 screenshots. 01–04 are the approved editorial series; 05–08 show larger views of the actual profile, Health, Screen time and Location UI.                           |
| `apple/screenshots/iphone-large`  | The same sequence rendered at 1320×2868.                                                                                                                                                    |
| `apple/screenshots/ipad-13`       | One editorial cover and four app-in-use screenshots at 2064×2752, using actual iPad captures.                                                                                               |
| `apple/screenshots/watch`         | Actual 416×496 Watch interface. No invented step values, phone frame or promotional overlay.                                                                                                |
| `apple/icon.png`                  | Unmodified 1024×1024 portrait master. This is supplied through the app build, rather than as a separate App Store Connect icon upload.                                                      |
| `apple/creative`                  | 3840×1646 header, 3840×2560 search, 5244×2950 universal artwork; six-second header/search loops and their poster frames. Availability of creative-asset slots depends on App Store Connect. |
| `apple/previews`                  | A 16-second 886×1920 H.264 app preview and poster. Real normal-app source-selection interactions, with a silent AAC track.                                                                  |
| `apple/promotional`               | Separate 1024×1024 Lifetime Unlock, Cloud 100 GB Monthly and Cloud 100 GB Yearly promotional images. These are optional marketing images, not purchase-review evidence.                     |

Use one complete ordered screenshot set per display slot. Do not mix phone captures into iPad slots. Apple's scaling can fill smaller device sizes; extra legacy, TV, macOS, Vision Pro and iMessage imagery is not claimed. Review the app preview in App Store Connect before submission, including the five-second poster setting. No new app build or layered Icon Composer source is part of this artwork package.

## Google Play

| Folder                         | Purpose                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `google/screenshots/phone`     | Eight ordered 1080×1920 screenshots: four editorial images, then four larger app-in-use images.                                                                          |
| `google/screenshots/tablet-7`  | Four UI-only 1080×1920 captures from an actual 720-dp Android emulator layout.                                                                                           |
| `google/screenshots/tablet-10` | Four UI-only 1080×1920 captures from an actual 960-dp Android emulator layout.                                                                                           |
| `google/icon.png`              | 512×512 RGBA PNG derived from the exact Apple portrait master. No baked-in rounded mask, shadow, text or alternate logo.                                                 |
| `google/feature-graphic.png`   | 1024×500 RGB PNG, using the three source illustrations rather than duplicating the portrait icon.                                                                        |
| `google/video`                 | A 30-second 1920×1080 silent product video and poster, ready for a separately authorized YouTube upload. Google Play uses a YouTube URL rather than a direct MP4 upload. |

Tablet captures show the real responsive layout. The Android system's letterboxing was removed; app content was not rebuilt or stretched. Tablet source selectors and permission states remain truthful, with no fabricated personal records. TV, Wear OS, Automotive and XR assets are not applicable to the current app.

The owner authorized the AI label on the eight designed phone images, feature graphic and video, plus an unlisted YouTube upload of the approved silent preview and poster. See `SUBMISSION.md` for the submission receipts. This authorization does not make the video public.

## Event templates and listing copy

`templates/event-card.png` and `templates/event-detail.png` provide reusable 16:9 and 9:16 brand artwork. They are not submission-ready In-App Events: a real qualifying event, event metadata and dates are required before using them. No fictitious launch, award, promotion, price or event is claimed.

`metadata.json` contains draft Apple subtitle/promotional text and Google short description, checked against character limits. `alt-text.json` supplies image descriptions of at most 140 characters for accessible listing uploads. Worldwide distribution does not mean these en-US images have been localized. Add reviewed localized copy and rerender for additional listing languages.

## Verification and source

Run `npm run app-stores:build` to regenerate the package, or add `-- --stills` for a still-only inspection pass. It checks PNG dimensions, RGB/RGBA channels, file limits, MP4 codec, pixel format, duration and video resolution, then creates a ZIP with a manifest and gallery.

Captures are from the normal app on dedicated simulators/emulators. No QA-only overlay, fictional health reading, source-record query, account sign-in, permission grant, real location recording or export was used. The retained source walkthrough recordings are diagnostic media captures, not passing regression tests: some recorder selectors were broad or coordinate-based, especially with Android letterboxing. Actual resulting UI was inspected independently. The capture emulator's display overrides and recording watermark setting were restored, and only task-owned capture services were stopped.

Source artwork: `launch-video/app-stores.js`, `launch-video/store-package.js`, `launch-video/store-assets.js`. Native captures and the trimmed preview are retained in `launch-video/public/app-stores/`. The normal Debug binaries loaded current local source through Metro; this package does not claim production-binary runtime verification.

Reference guidance checked 22 October 2026:

- [Apple asset best practices](https://developer.apple.com/app-store/asset-best-practices/)
- [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple creative asset specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications)
- [Apple app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/)
- [Google Play preview asset guidelines](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
