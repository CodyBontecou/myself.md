# Support Chat

A portable JavaScript client package for React web and React Native apps. This directory can be copied into its own repository or packed with `npm pack`. It has no imports from myself.md and includes its existing AGPL-3.0-only license. It is not published to npm.

The package includes the conversation hook, authenticated HTTP adapter, web conversation view and native conversation view. It handles polling every 15 seconds while active, earlier-message pagination, message delivery status, retry IDs, composer clearing, and owner-controlled agent access.

Discord delivery stays on the server. The client sends messages to an authenticated support endpoint; the server validates account ownership, encrypts history, enforces limits, creates Discord threads, sends messages and imports staff replies. Never ship a bot token in this package or an app bundle.

## Entry points

| Import                                | Exports                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `@codybontecou/support-chat`          | `useSupport`, `createSupportRequest`, `supportNotice` |
| `@codybontecou/support-chat/web`      | `WebChat`                                             |
| `@codybontecou/support-chat/native`   | `NativeChat`                                          |
| `@codybontecou/support-chat/protocol` | JSDoc protocol types and `supportNotice`              |

React 19+ is required. The native entry point additionally requires React Native 0.81+. Web consumers do not import React Native. Components ship as JavaScript with JSX: configure the consuming bundler to transpile this package, including `.js` JSX. There is no compiled distribution or new native dependency.

## Host transport

Create a stable request adapter using the host's existing authenticated HTTP client. The host must handle authentication, JSON parsing and non-success responses. The callback returns the parsed `SupportState`, not a `Response` object.

```js
import { createSupportRequest } from '@codybontecou/support-chat';

// authenticatedJson supplies the host's owner credential, content-type,
// JSON parsing and error handling. Do not use a connected agent credential.
const request = createSupportRequest(authenticatedJson, '/api/support');
```

Keep the adapter stable across renders. On sign-in/account changes, create a new adapter and remount the chat with an account-specific React `key`. This clears conversation state and drafts and prevents a previous account's pending request from updating the next account's view. Supply `active={false}` when the screen is hidden/backgrounded; the host owns navigation and lifecycle detection.

The endpoint contract matches the retained myself.md support server:

| Request                                           | Effect                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/support`                                | Refresh latest messages and delivery status            |
| `GET /api/support?before=<sequence>`              | Load earlier messages                                  |
| `POST /api/support`, JSON `{id, text}`            | Save/send a message; reuse its ID on uncertain retries |
| `PUT /api/support`, JSON `{agentAccess: boolean}` | Owner enables or revokes agent access                  |

Every successful response returns `{conversationId, messages, hasMore, before, available, agentAccess, warning}`. Message fields are `{id, sequence, role, text, createdAt, delivery, agent}`; see `protocol.js` for the types. `delivery: "delivered"` means Discord accepted the message, not that Cody read it. Text is limited to 1,800 characters; the existing server enforces 30 new user messages per hour. Authentication policy belongs to the server: arbitrary app credentials are not automatically accepted by myself.md's owner-only endpoint.

## Web

```jsx
import { WebChat } from '@codybontecou/support-chat/web';

function Button({ variant, ...props }) {
  return <button {...props} />;
}

<WebChat
  key={accountId}
  request={request}
  active={visible}
  Button={Button}
  unavailableContent="Chat is unavailable. Email support instead."
/>;
```

The host supplies its button. The view uses Tailwind utility classes and semantic color utilities (`background`, `muted`, `muted-foreground`, `primary`, `primary-foreground`). Include the package's `web.js` in your Tailwind source scan and define these theme colors, or adapt the classes to your own styling. Tailwind and the host design system are not bundled. Composer IDs are unique so multiple mounted conversations have correctly associated labels.

## React Native

```jsx
import { NativeChat } from '@codybontecou/support-chat/native';

<NativeChat
  key={accountId}
  request={request}
  active={focused && foreground}
  colors={colors}
  components={{ Screen, Copy, Button, Row }}
/>;
```

The host supplies `colors` (`danger`, `accent`, `surface`, `onAccent`, `secondary`, `text`, `border`) and UI primitives:

- `Screen`: scrollable container with keyboard handling, accepting children and `testID`.
- `Copy`: text primitive accepting children, `muted`, `variant="caption"`, `selectable`, `accessibilityRole`, and `style`.
- `Button`: accepts `label`, `onPress`, `secondary`, `disabled`, `busy`, and `testID`.
- `Row`: accepts `title`, `subtitle`, and `trailing`.

Optional `unavailableContent` replaces the unavailable notice. The host owns safe areas, navigation, session storage, keyboard behavior and focus detection. For a custom view, use `useSupport(request, active)` directly; it exposes `state`, `error`, `busy`, `refresh`, `send`, `loadOlder`, and `setAgentAccess`.

## Extraction and verification

The v1 integration adds a phone support route, Settings action and dashboard inbox; see [IMPLEMENTATION.md](./IMPLEMENTATION.md). The older single-conversation client remains compatible with its retained server. Its server support service, encrypted store, Discord transport, setup script, account-deletion cleanup and MCP operations remain in place. Agent-access approval requires a future owner client integration; the server's old chat deep links cannot complete that handoff while the views are removed.

From myself.md, run `npm run format`, `npm run check` and `npm run verify:support`. The aggregate gate includes this package's strict native/web JavaScript checks, lint and unused-code checks. Runtime verification mounts the exported web component and adapter against the retained authenticated server using a deterministic Discord fixture. It checks messaging, retries, authorization, agent controls and cleanup without sending live Discord messages. Native device/keyboard behavior and live Discord delivery are not covered by that fixture.

For standalone development, run `npm install` and `npm run check`. Development dependencies include React Native for the native type check; web consumers do not need it. `npm pack --dry-run` lists the distributable source, documentation, license and type-check configs. Authentication and a compatible support server must be integrated by each consuming app.

## Isobot v1 inbox

`createSupportClient`, `useSupportInbox`, `WebSupport`, and `NativeSupport` expose the versioned account inbox and independent conversations. The host transport supplies owner authentication to `/api/support/v1`; it must never include Isobot service credentials in the app. Remount with an account-specific key and pass `active={focused && foreground}` on mobile.

```js
import { createSupportClient } from '@codybontecou/support-chat';
import { WebSupport } from '@codybontecou/support-chat/web';
const request = createSupportClient(authenticatedJson);
// <WebSupport key={accountId} request={request} data={dataAdapter} />
```

A data adapter provides `collect(request)` returning `{category, capturedAt, content}` and `digest(content)` returning a SHA-256 hex digest. Collection must stay local; the component shows an editable preview and sends only after acceptance. `NativeSupport` additionally requires the existing host primitives/colors, a secure `newId` function, and optional `initialConversationId` and `onEnableNotifications` callbacks. The package itself adds no native dependency.

See [implementation and deployment notes](./IMPLEMENTATION.md) for the Isobot service, consent lifecycle, notification integration, Codex workflow, verification, and live-test boundaries.
