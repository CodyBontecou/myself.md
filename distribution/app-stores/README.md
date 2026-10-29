# Store artwork

Run `npm run app-stores:build` to produce the complete en-US asset package in `.local/store-redesign/final/` and `.local/store-redesign/myself-md-store-assets.zip`. Open the generated `index.html` gallery to inspect every file. See [UPLOAD.md](UPLOAD.md) for sizes, upload order, optional slots and source provenance.

The package includes iPhone, iPad, Watch, Android phone and Android tablet screenshots; matching Apple and Google portrait icons; Google feature artwork and a product video; Apple creative images, motion loops, a genuine app preview and purchase promotional images; event artwork templates; draft listing copy, accessible image descriptions and a dimension/hash manifest. Event templates require a real qualifying event before submission. The Google product video requires a separately authorized YouTube upload.

The compositions reuse the website's Geist font, monochrome palette and stippled portrait. The portrait source stories pair the face with a health pulse, screen-time dial or location trail, alongside genuine app controls. The source series also retains the original ivory health illustration. These are decorative illustrations without measurements, personal records or actual geography. Android tablet images contain actual responsive app UI without marketing overlays.

Rendering validates PNG dimensions/channels and file limits, plus MP4 resolution, codec, pixel format and duration. `-- --stills` skips the rendered motion assets. `-- --reuse` retains existing rendered files and revalidates them while rebuilding metadata and the ZIP; use it only when visual source has not changed. The smaller earlier editorial draft remains available through `npm run app-stores:render` in `.local/store-redesign/editorial/`.

Building does not upload or submit anything. The owner subsequently authorized submission; see [SUBMISSION.md](SUBMISSION.md) for current review receipts and pending steps.

## Earlier 22 October 2026 submission

Apple replacement submission `45fe2414-48f0-4ba7-974d-bd7ec684fb5b` was Waiting for Review with all five original review items reattached. Its four iPhone images, iPad image and retained Watch capture reported COMPLETE delivery. These are the earlier graphics, not this package.

The Google listing editor contained an earlier portrait icon, feature graphic and four screenshots, with its AI asset declaration awaiting the owner's explicit choice. Those revised Google assets had not been submitted; the existing production review remained in progress. Upload and submission receipts are retained in `.local/store-redesign/`.
