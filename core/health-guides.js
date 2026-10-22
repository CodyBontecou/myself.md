export const healthGuideSlugs = /** @type {const} */ ([
  'apple-health-claude-mcp',
  'android-health-connect-mcp',
  'whoop-claude-mcp',
]);

export const healthGuides = [
  {
    slug: healthGuideSlugs[0],
    operationId: 'getAppleHealthClaudeGuide',
    navigationTitle: 'Apple Health → Claude',
    title: 'Connect Apple Health to Claude with myself.md and MCP',
    description:
      'Connect an approved Apple Health profile to Claude through myself.md. Set up MCP, pair your iPhone, choose permissions and verify your first read.',
    markdown: `# Connect Apple Health to Claude with myself.md and MCP

Use myself.md to share selected Apple Health records with Claude through MCP. Your iPhone reads the data; you choose what Claude can access.

For health conversations directly in Claude on iPhone, [Claude's native Apple Health beta](https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps) may suit you. This guide covers myself.md's separate MCP connection.

## Before you start

You need an iPhone with health records, myself.md installed, and a Claude client supporting remote MCP with OAuth. Use the same myself.md account on both sides.

Public App Store downloads are coming soon. Use an authorized test build or the [developer installation instructions](https://github.com/CodyBontecou/myself.md#run-locally). See [pricing](https://myself.md/pricing) for query limits.

## 1. Connect Claude

Add a custom remote connector in Claude:

\`\`\`text
https://myself.md/mcp
\`\`\`

Sign in, review consent and enable the connector in your conversation. Managed accounts may need an administrator. Follow [Claude's connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp); keep credentials out of chat.

## 2. Pair your iPhone

Ask Claude:

\`\`\`text
Set up myself.md using https://myself.md/llms.txt. Reuse my paired phone or create a pairing link. Verify pairing before reading records.
\`\`\`

In myself.md, open \`Settings → Agent connection\`, scan the QR or paste the link, sign in to the same account and confirm. If sign-in returns to Account, go Back to finish Confirm connection. Links expire after five minutes. [Pairing help](https://myself.md/docs#pair-a-phone-and-approve-a-profile)

![Agent connection on iPhone: scan your agent’s QR code or paste its pairing link.](https://myself.md/dashboard/guide-images/iphone-agent-pairing.png)

## 3. Approve health access

Open your profile in \`Profiles\`:

1. Under \`Data selection\`, choose the health types you need, such as steps.
2. In Apple's permission sheet, enable only the types you need. If extra types are on, tap Turn Off All, then enable your chosen types.
3. Save the profile. A paired online phone approves authenticated agent reads of its selected data.

![Expand Health to choose data types and review Apple Health permissions.](https://myself.md/dashboard/guide-images/iphone-health-data-selection.png)

OS permissions and data selections limit reads. Leave unrelated OS permissions off.


## 4. Check your first read

Keep myself.md open and online. Ask Claude to discover the phone, profile and available step type; confirm the intended profile. Then try this prompt with your own dates and time zone:

\`\`\`text
Read approved step records for October 19, 2026, 08:00–09:00 in America/Puerto_Rico. Wait for completion and read every page. Report sources, missing records and warnings before calculating totals.
\`\`\`

Queued work is not a completed read. Check the returned interval and completeness before using the answer.

## Missing data and stopping access

Check the account, phone connection, selected types, Apple Health access and profile selections. HealthKit does not reveal read denial, so empty results do not prove zero activity. Overlapping sources can make raw totals differ from Apple Health. See [supported data and limits](https://myself.md/datasets/health).

Remove selected health types or disconnect the phone to stop live reads; manage Apple Health permission separately. Already-delivered copies cannot be recalled. An authorized cloud export can be read separately without a new live phone query. See [privacy](https://myself.md/privacy) and [setup](https://myself.md/docs).

[About myself.md](https://myself.md/about) · [Source code](https://github.com/CodyBontecou/myself.md)
`,
  },
  {
    slug: healthGuideSlugs[1],
    operationId: 'getHealthConnectGuide',
    navigationTitle: 'Android Health Connect',
    title: 'Connect Android Health Connect to an AI assistant with MCP',
    description:
      'Use myself.md to query selected Android Health Connect records through MCP. Choose permissions, pair your phone and verify a completed health query.',
    markdown: `# Connect Android Health Connect to an AI assistant with MCP

Use myself.md to share selected Health Connect records with a compatible MCP assistant. You choose the records and grant Android source permission. Paired online phones approve authenticated agent reads of selected data.

## Before you start

You need an Android phone with Health Connect records, myself.md installed, and an assistant supporting remote MCP with OAuth. Your health apps must write the relevant records to Health Connect.

Public Google Play downloads are coming soon. Use an authorized test build or the [developer installation instructions](https://github.com/CodyBontecou/myself.md#run-locally). See [supported data](https://myself.md/datasets/health) and [pricing](https://myself.md/pricing).

## 1. Choose records and OS permissions

In \`Profiles\`, open your profile and select Health Connect types under \`Data selection\`. Start with one type, such as Steps.

![Choose Steps under Data selection → Health → Activity & fitness. Selecting a type does not grant access.](https://myself.md/dashboard/guide-images/android-health-data-selection.png)

Grant only the needed categories in the Health Connect prompt. Leave \`Allow all\` off, scroll to your categories and enable them, then tap \`Allow\`. If access was previously denied, review \`Health Connect → App permissions → myself.md\`. A supported type may still have no records.

![Health Connect asks which categories myself.md may read. Shown before approval, with Allow all off.](https://myself.md/dashboard/guide-images/android-health-connect-permissions.png)

Screenshots use an Android 16 emulator with no personal records. System screens may vary by Android version.

## 2. Connect and pair

Add this remote MCP URL in your assistant, then sign in to the same myself.md account used on the phone:

\`\`\`text
https://myself.md/mcp
\`\`\`

Claude users can follow [its connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). Ask your assistant:

\`\`\`text
Set up myself.md using https://myself.md/llms.txt. Reuse my intended Android phone or create a pairing link. Verify pairing before reading records.
\`\`\`

On the phone, open \`Settings → Agent connection\`, scan the QR or paste the link, sign in and confirm. If sign-in returns to Account, go Back to finish Confirm connection. Links expire after five minutes.

![On Android, open Settings → Agent connection to scan a QR code or paste your agent’s pairing link.](https://myself.md/dashboard/guide-images/android-agent-pairing.png)

Read-only connections cannot create pairing links. Pair through a compatible full MCP client first. [Pairing help](https://myself.md/docs#pair-a-phone-and-approve-a-profile)

## 3. Save your selection

Save the profile. A paired online phone approves authenticated agent reads of selected data when OS permissions allow it.


Ask the assistant to refresh its phone catalog and confirm the device, profile and selected types. Finish setup before querying if no profile is discoverable.

## 4. Check your first read

Keep myself.md open and online. Use your dates and time zone in this example:

\`\`\`text
Read the approved Android Steps records for October 19, 2026, 08:00–09:00 in America/Puerto_Rico. Wait for completion and read every page. Show count, startTime, endTime, sources and warnings before calculating totals.
\`\`\`

Queued work is not a completed read. Check the interval and any partial results.

## Data limits and stopping access

Older history may require additional permission; exercise routes can need separate consent. Empty results do not prove zero activity. Android records use native fields, which differ from Apple Health.

Overlapping sources can double count activity. A sum of raw records may differ from the platform total; see [Google's aggregation guidance](https://developer.android.com/health-and-fitness/health-connect/read-data).

Remove selected health types or disconnect the phone to stop live reads; manage Health Connect permission separately. You can also export selected types, dates and formats to files. A destination does not grant MCP access, and copies sent to an assistant cannot be recalled. See [privacy](https://myself.md/privacy) and [setup](https://myself.md/docs).

[About myself.md](https://myself.md/about) · [Source code](https://github.com/CodyBontecou/myself.md)
`,
  },
  {
    slug: healthGuideSlugs[2],
    operationId: 'getWhoopClaudeGuide',
    navigationTitle: 'WHOOP → Claude',
    title: 'Connect WHOOP to Claude with myself.md and MCP',
    description:
      'Share selected WHOOP sleep, recovery and workout records with Claude through myself.md. Connect your account, approve a profile and verify a bounded MCP query.',
    markdown: `# Connect WHOOP to Claude with myself.md and MCP

Share selected WHOOP cycles, recovery, sleep, workouts and current body measurements with Claude through myself.md's MCP connection.

## Before you start

You need a WHOOP account with records, myself.md with WHOOP support, and a Claude client supporting remote MCP with OAuth.

Public app-store downloads are coming soon; use an authorized test build or the [developer installation instructions](https://github.com/CodyBontecou/myself.md#run-locally). WHOOP access currently uses a limited sandbox registration. Check availability and [pricing](https://myself.md/pricing) before relying on it.

iPhone reads have been verified. Android, unattended exports and automatic token refresh after expiry still need live verification.

## 1. Connect WHOOP

In myself.md, open \`Settings → WHOOP → Connect WHOOP\`. Complete WHOOP sign-in and consent yourself, then confirm the app shows Connected.

![WHOOP connected on iPhone. Select WHOOP data in a profile to make it available to authenticated agents.](https://myself.md/dashboard/guide-images/iphone-whoop-connected.png)

You do not need your own developer app or credentials in Claude. [WHOOP authorization details](https://developer.whoop.com/docs/developing/oauth/)

## 2. Approve selected data

Open a profile’s \`Data selection → Health\`, search WHOOP and choose the types you need. Save it. Authenticated agents can read these types when the paired phone is online.

![Search WHOOP to choose cycles, recovery, sleep, workouts or body measurements. Shown before selection.](https://myself.md/dashboard/guide-images/iphone-whoop-data-types.png)


Agents can read only the WHOOP types selected in the profile. WHOOP-only selections need no Apple Health or Health Connect permission; selecting OS health sources requires those permissions separately.

## 3. Connect Claude and pair

Add a custom remote connector in Claude and sign in to the same myself.md account:

\`\`\`text
https://myself.md/mcp
\`\`\`

Follow [Claude's connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) and enable it in your conversation. Ask Claude:

\`\`\`text
Set up myself.md using https://myself.md/llms.txt. Reuse my paired phone or create a pairing link. Verify pairing before reading records.
\`\`\`

On the phone, open \`Settings → Agent connection\`, scan the QR or paste the link, sign in and confirm. If sign-in returns to Account, go Back to finish Confirm connection. Links expire after five minutes. [Pairing help](https://myself.md/docs#pair-a-phone-and-approve-a-profile)

![Agent connection on iPhone: scan your agent’s QR code or paste its pairing link.](https://myself.md/dashboard/guide-images/iphone-agent-pairing.png)

## 4. Check your first read

Keep myself.md open and online. Ask Claude to confirm the intended phone, profile and selected WHOOP types. Use your dates and time zone in this example:

\`\`\`text
Read WHOOP sleep records from my approved profile for October 12–18, 2026, using America/Puerto_Rico day boundaries. Wait for completion and read every page. Report durations, sources, missing nights and warnings. Keep Apple Health records separate.
\`\`\`

Check that results identify WHOOP as the source. A pending query or connected provider does not prove a successful read.

## Data limits and stopping access

- Join recovery records by cycle/sleep IDs; they lack an independent measurement timestamp.
- Body measurements are current snapshots, even when requesting an older interval.
- Missing or unscored values are not zero.
- WHOOP RMSSD and Apple Health SDNN are different HRV metrics.
- WHOOP and OS records are not automatically deduplicated; associations do not establish causes.

For failures, check provider connection, profile selections and phone connectivity. Use Reconnect for expired or revoked authorization. Sandbox access limits require provider/app access, not another prompt.

Remove selected health types or disconnect the phone to stop live reads. To disconnect WHOOP, use \`Settings → WHOOP → Disconnect\` and verify success. Existing exports and copies sent to Claude remain. See [privacy](https://myself.md/privacy), [supported data](https://myself.md/datasets/health) and [setup](https://myself.md/docs).

[About myself.md](https://myself.md/about) · [Source code](https://github.com/CodyBontecou/myself.md)
`,
  },
];
