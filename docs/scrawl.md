# Scrawl development captures

The Expo config plugin `plugins/with-scrawl.cjs` links the official ScrawlKit Swift package, pinned to revision `6d4fa333475ef5170c4df683e306480f8618b95a`. It attaches its window observer to the React Native window from the Swift AppDelegate only in Debug, and handles pairing links before React Native routing. It survives `expo prebuild`; do not edit generated iOS files manually.

Run `npx expo prebuild --platform ios`, then `npm run build:ios:debug` (simulator) or `npm run build:ios:device-debug` (device). Debug requires iOS 18; Release keeps Expo's deployment target and does not install Scrawl or handle pairing links. Changes require a fresh native build; an OTA update alone cannot add this SDK.

With Scrawl running on your Mac, run `scrawl link --scheme myselfmd` and scan the QR code/open the pairing link on that phone. It contains a private token; do not commit it. Hold three fingers for half a second to start/finish. Approve microphone/local-network prompts when recording and sending. The SDK stays inert on unpaired devices. Open `myselfmd://scrawl?reset=1` to unpair.

On the Mac, use `scrawl inspect latest` or paste with Option-Shift-V. The Mac's `usbApps` list includes `com.myself.md` for USB fallback. Captures can include whatever is visible; no product data grants are changed. This is owner-operated, iOS-only development tooling; ScrawlKit has no Android SDK. On Android use an existing mirror with Scrawl's Mac screen capture.

Scrawl recording and pairing are local developer/OS handoffs, outside the ordinary remote phone-data MCP inventory. The agent can inspect the resulting local `.scrawl` bundle with the Scrawl CLI. Capturing does not authorize agent access to phone datasets or add a new remotely callable recording action.
