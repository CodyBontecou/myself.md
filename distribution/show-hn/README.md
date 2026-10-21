# myself.md Show HN preparation

Local preparation revised October 19, 2026; readiness must be reviewed before posting. Nothing posted, submitted, scheduled or entered into an HN form.

The title should state what the software does. The opening comment should give readers a concrete task, explain the approval boundary and say which part they can try today. The repository is the proposed destination so readers can inspect the source and follow installation instructions. Public store downloads are coming soon.

HN's current [submission and comment guidelines](https://news.ycombinator.com/newsguidelines.html) ask authors to write their own text and exclude generated or AI-edited posts/comments. Use this packet as preparation for Cody's own final wording, not text to paste into HN. No automated posting is planned.

## Working title

Show HN: myself.md – Give AI agents access to selected phone data

## Submission destination

https://github.com/CodyBontecou/myself.md

Use the clean URL. HN link submissions have a title and destination; the maker introduction below belongs in an opening comment on the eventual thread. It is not a separate text submission or a second launch post.

## Opening comment preparation

I built myself.md because I wanted daily access to my own data that was already being recorded—things like steps, screen time and location. I wanted to ask an AI agent questions about that data and choose exactly what it could read.

You can inspect the [source and setup instructions](https://github.com/CodyBontecou/myself.md) and browse the [supported datasets](https://myself.md/datasets). Public mobile store downloads are coming soon. Reading your own records requires an installed app, the relevant OS permissions and your approval.

I'd love to hear what you'd want to ask about your own data, and what you'd need to see before sharing it with an agent.

[Docs](https://myself.md/docs) · [Source](https://github.com/CodyBontecou/myself.md)

## Founder motivation

Cody supplied the reason for building myself.md: “I wanted daily access to my own data thats already being recorded.” The opening uses this motivation without inventing a prior workflow, a specific device, frustration with another product or traction. The daily-access motivation describes his goal; it does not promise that background phone jobs execute at an exact daily time.

## Facts for follow-up discussion

These are reference notes, not prepared HN replies. Answer actual questions in the author's own words.

| Likely question                        | Supported detail                                                                                                                                                                                                      | Source                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Can I try it without signing in?       | The public dataset catalog is available without signing in. The installed app supports local exports without an account; hosted agent access requires account setup and owner approval.                               | [Public product content](../../core/public-site.js)                                                          |
| What can an agent read?                | Owner-approved profiles and data grants, subject to account/device ownership and OS permissions. An agent cannot grant itself access.                                                                                 | [MCP setup and API guide](https://myself.md/docs)                                                            |
| Does saving a profile grant access?    | Data selection and sharing approval are separate. Cloud-sharing controls govern stored exports; phone source permissions remain in the app.                                                                           | [Privacy disclosures](../../core/privacy.js), [setup guide](https://myself.md/docs)                          |
| Does the phone have to stay online?    | Live requests may need the app open. Previously stored exports can be read while the phone is offline if they are shared. Accepted jobs are not completed reads.                                                      | [Connector prerequisites](../claude/listing.json)                                                            |
| Who can decrypt cloud exports?         | The service decrypts approved reads. Encryption at rest is not end-to-end encryption, and revocation cannot erase copies held by another provider.                                                                    | [Privacy disclosures](../../core/privacy.js)                                                                 |
| Is it free?                            | Current source specifies five free exports/queries, an optional lifetime unlock and separate cloud-storage allowances/plans. Confirm the deployed offer and checkout availability before quoting prices.              | [Billing](../../core/billing.js), [public offer](../../core/public-site.js)                                  |
| Is every platform/data type supported? | iOS and Android use different adapters and OS permissions. Review dataset-specific limits; an empty HealthKit result does not prove read permission.                                                                  | [Dataset catalog](https://myself.md/datasets), [privacy disclosures](../../core/privacy.js)                  |
| Can I use my own storage?              | Local files and an HTTPS destination are supported export routes. Source and self-hosting instructions are linked from the public site. Do not imply self-hosting removes entitlement or native-platform constraints. | [Public product content](../../core/public-site.js), [repository](https://github.com/CodyBontecou/myself.md) |

## Readiness before an eventual launch

The [Show HN guidelines](https://news.ycombinator.com/showhn.html) require something the maker worked on and readers can try, favor low-friction access and prohibit soliciting votes or comments. They exclude landing pages and signup-only previews. A repository link alone does not prove that a new reader can install and use the phone workflow.

Before posting, verify a new reader can install the app using the linked instructions and complete a bounded, owner-approved read or export. Update the availability paragraph with tested installation steps. If that workflow is not available, wait before submitting as Show HN. Keep the phone, dashboard and live-agent boundaries explicit.

Cody should write the final title/comment himself using his motivation above, and choose a time when he can answer technical questions. Do not coordinate votes/comments, arrange a promotion wave or delete and repost to improve placement. No launch date is selected here.

This packet changes no app behavior, UI capability or MCP operation. Existing Product Hunt draft state is unchanged.
