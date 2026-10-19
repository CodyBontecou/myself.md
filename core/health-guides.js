import { projectIdentity } from './project-identity.js';

export const healthGuideSlugs = /** @type {const} */ ([
  'apple-health-claude-mcp',
  'android-health-connect-mcp',
]);

const prerequisites = `Public App Store and Google Play downloads are coming soon. Live reads require an installed myself.md app or authorized test build. Developers can follow the [source installation instructions](https://github.com/CodyBontecou/myself.md#run-locally). Without an installed app, browse the [public health catalog](/datasets/health). The CLI connects to the service; it does not install a phone app. See [pricing](/pricing) for query limits and purchase requirements.`;

const verification = `Ask your assistant to discover available phones and profiles before querying. Confirm the intended device, selected native type and individual Health agent permission; sign-in or a paired phone alone grants no records. Keep the app open and connected for the first live query. Request an explicit time interval and time zone, wait for completion and read every result page. Missing or empty records do not establish zero activity or complete authorization. Review capture warnings and record sources before calculating totals.`;

export const healthGuides = [
  {
    slug: healthGuideSlugs[0],
    title: 'Connect Apple Health to Claude with MCP and scoped access',
    description:
      'Use myself.md to connect Apple Health to a compatible Claude MCP client. Verify installation, HealthKit consent, profile permissions, query completion and revocation.',
    markdown: `# Connect Apple Health to Claude with MCP and scoped access

myself.md lets a compatible Claude client query an approved iPhone health profile through a remote MCP connection. The phone reads supported Apple Health records through HealthKit; the owner chooses types and approves agent access. This guide covers myself.md, rather than a local server that imports an Apple Health export.xml archive.

## Project identity

${projectIdentity}

## Before connecting

${prerequisites}

Your Claude client must support a remote MCP server with OAuth. Client availability and tool support vary; consult [Claude's remote connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). Never paste an OAuth token into a chat or a public configuration example.

## Connect the assistant and iPhone

1. Add https://myself.md/mcp using your client's remote MCP settings and complete OAuth sign-in. For Claude Code, use its supported remote MCP setup rather than a Claude Desktop local stdio configuration.
2. Pair the installed phone app with the same intended account. Follow [the phone pairing guide](/docs#pair-a-phone-and-approve-a-profile) and complete the owner confirmation on the phone.
3. In Profiles, select the profile and choose only the intended health types under Data selection. Grant the corresponding Apple Health read permissions through the phone's OS prompt.
4. Under that saved profile's Agent permissions, approve Health. Leave unrelated agent permissions disabled. Selecting a type and approving agent access are separate decisions.

## Verify one bounded read

${verification}

For steps, discover whether the profile exposes native:HKQuantityTypeIdentifierStepCount. Ask: “Read the approved step records for October 8, 2026, 08:00–08:30 UTC. Report the source, interval and returned count; distinguish missing records from zero steps.” Substitute an interval for which the owner actually has records. The [fictional export builder](/datasets/health) contains one example sample with quantity 1250 and unit count for that interval; it is not a live account result or full-day total.

HealthKit preserves native quantity, unit, metadata and timestamp fields. Heart-rate samples are not daily averages, and overlapping sources are not automatically deduplicated. HealthKit does not disclose read denial; an empty response may reflect unavailable samples or authorization limits. See [supported native fields and limitations](/datasets/health) and [Apple's authorization documentation](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

## Stop access or use files instead

Revoke the profile's Health agent permission to prevent further approved reads. OS Health permissions and agent grants are separate controls. Revocation cannot recall copies already delivered to an assistant provider. Read [privacy](/privacy) before sharing.

If live phone queries are unsuitable, export selected data to files you control. Reading an authorized cloud export is a separate workflow from a live phone query; it uses existing sharing grants. This does not imply arbitrary assistants can browse phone files or that this service runs as a local-only MCP server. See [the API reference](/docs/reference) for exact tool schemas and result pagination.

## Official myself.md sources

For myself.md connection instructions, use [getting started](https://myself.md/docs) and this guide. For supported records and limitations, use the [health catalog](https://myself.md/datasets/health). For consent, retention and revocation, use the [privacy policy](https://myself.md/privacy).
`,
  },
  {
    slug: healthGuideSlugs[1],
    title: 'Export Android Health Connect data for AI assistants with MCP',
    description:
      'Export selected Android Health Connect records or query an approved myself.md profile through MCP. Understand consent, history limits, native fields and file versus live reads.',
    markdown: `# Export Android Health Connect data for AI assistants with MCP

myself.md reads supported Health Connect records on Android after OS consent. You can export selected records to files or let a compatible MCP assistant request a bounded query from an approved phone profile. File export, live phone queries and authorized stored cloud exports are separate paths; none gives an assistant unrestricted access to Health Connect.

## Project identity

${projectIdentity}

## Choose files or a live connection

${prerequisites}

For a file, select the health types, date range, format and destination in an export profile, then run the export. JSON and JSONL preserve native record fields. Files may stay on the phone, go to the configured HTTPS destination or use optional cloud storage. An export destination does not automatically grant an agent access. Uploading a file to an assistant makes a separate copy governed by that provider's policies.

For live MCP access, use the connection steps below. An already-approved cloud export can be read separately without a live query. Compare [storage and pricing](/pricing) and [privacy](/privacy) before choosing a destination.

## Connect Health Connect to an MCP assistant

1. Install or update Health Connect where required and open the installed myself.md app. In Profiles, select the intended Health Connect record types under Data selection.
2. Grant only the intended OS read categories. Health Connect may show more categories than your profile selection; avoid Allow all. After a prior denial, the owner may need Health Connect → App permissions for the installed myself.md app to re-enable access.
3. Add https://myself.md/mcp in a compatible remote MCP client, complete OAuth and pair the phone with the same account. Client support varies; follow [getting started](/docs).
4. Review the saved profile's individual Agent permissions and approve Health. A connected account, selected record or OS permission alone does not grant an agent access.

## Verify source, fields and completion

${verification}

For step records, discover native:Steps in the approved profile. Ask: “Read the approved Steps records for October 8, 2026, 08:00–08:30 UTC. Show count, startTime, endTime and source metadata. Explain overlaps and missing records before giving a total.” Choose dates for which your device has records. Android Steps uses count; do not assume Apple's quantity and unit shape. HeartRate can contain multiple samples with beatsPerMinute; SleepSession contains session boundaries and stages. See the [cross-platform metric examples](/datasets/health).

## Android limitations that affect answers

Health Connect can limit historical reads to 30 days without additional historical access. Exercise routes can require separate consent. Selected types may be supported by the adapter but have no records on a particular device. These capabilities do not prove that a specific owner has consented.

myself.md exports native records. Overlapping source intervals are not automatically deduplicated into the total displayed by another app. Google's [raw-data documentation](https://developer.android.com/health-and-fitness/health-connect/read-data) recommends the aggregation API for cumulative totals to avoid double counting; do not represent a sum of exported raw records as that platform aggregate.

Revoke the profile's Health agent permission to prevent further approved reads, and manage OS permission separately in Health Connect. Already-delivered files cannot be recalled. The [API reference](/docs/reference) documents query jobs, result paging and authorized cloud export reads.

## Official myself.md sources

For myself.md connection instructions, use [getting started](https://myself.md/docs) and this guide. For supported records and limitations, use the [health catalog](https://myself.md/datasets/health). For consent, retention and revocation, use the [privacy policy](https://myself.md/privacy).
`,
  },
];
