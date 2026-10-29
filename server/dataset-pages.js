import { datasets, healthMetricExamples } from '../dashboard/dataset-catalog.js';
import { docsHTML } from './docs-page.js';
import {
  datasetWorkflows,
  workflowPrerequisites,
  workflowQuerySteps,
} from '../core/dataset-workflows.js';

/** @param {string} value */
function escape(value) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** Public adapter documentation, never private phone records. @param {string} pathname */
export function datasetPage(pathname) {
  const path = pathname.replace(/\/$/, '');
  const entry = Object.entries(datasets).find(([slug]) => path === `/datasets/${slug}`);
  const index = path === '/datasets' || path === '/datasets/all';
  if (!entry && !index) return null;
  const selected = entry ? [entry] : Object.entries(datasets);
  const canonical = entry ? `/datasets/${entry[0]}` : '/datasets';
  const title = entry ? `${entry[1].title} exports` : 'Supported phone datasets';
  const description = entry
    ? `${entry[1].introduction} ${entry[1].sources}`
    : 'Explore questions your AI can answer about health, screen time and recorded locations, the data they need, platform limits and fictional examples. Technical types and JSON are available below.';
  const workflows = datasetWorkflows.filter((workflow) =>
    selected.some(([slug]) => workflow.dataset === slug),
  );
  const markdown = `# Ask about your data

${description}

Copy a question into your agent to get started. This catalog describes capabilities, not a connected person's available records. All answer examples are fictional.

${workflows
  .map(
    (workflow) => `## ${workflow.question}

${workflow.description}

Fictional answer example: ${workflow.example}

Data needed: ${workflow.dataNeeded}

Availability: ${workflow.availability}

${workflow.limitations.map((limit) => `- ${limit}`).join('\n')}

Prompt to send to your agent:

${workflow.prompt}

[Explore ${workflow.dataset} data types and example JSON](/datasets/${workflow.dataset}#technical-explorer).`,
  )
  .join('\n\n')}

## Connect your data when you’re ready

${workflowPrerequisites.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join('\n')}

Viewing this page or copying a prompt does not grant access. Your assistant must check available records and date coverage before answering. Public App Store and Google Play downloads are coming soon.

[Connect an AI assistant](/docs). Agents can discover these same structured workflows, required types, prerequisites and query steps through \`get_public_dataset_catalog\` or [the public catalog](/v1/dataset-catalog). Follow \`nextCursor\` until \`hasMore\` is false.

${workflowQuerySteps.map((step, stepIndex) => `${stepIndex + 1}. \`${step.tool}\`: ${step.instruction}`).join('\n')}

## Technical explorer

${title} in myself.md. Select native types in the interactive explorer to update a fictional JSON export. Agent reads require supported phone sources, operating-system permission, selected profile types and separate agent approval.

${selected
  .map(
    ([slug, dataset]) => `## ${dataset.title}: sources and supported collections

${dataset.introduction}

Sources: ${dataset.sources}

${dataset.groups.map((group) => `- ${group.title}: ${group.keys.length} selectable types.`).join('\n')}

${
  slug === 'health'
    ? `## Common health questions and native fields

These examples come from the supported adapter catalog. Field names and units stay native; availability does not establish OS authorization, profile approval or existing records. A profile selection uses the identifier with a \`native:\` prefix.

| Metric and platform | Native identifier | Fields and interpretation |
| --- | --- | --- |
${healthMetricExamples.map((example) => `| ${example.metric} (${example.platform}) | \`${example.type}\` | ${example.fields}. ${example.note} |`).join('\n')}

## Reproduce a fictional step question

Question: “How many steps are in the example's October 8, 2026, 08:00–08:30 UTC interval?” Open the [health export builder](/datasets/health), select only iOS \`HKQuantityTypeIdentifierStepCount\`, and inspect the fictional JSON preview. The fixture contains one sample for that interval with \`quantity: 1250\` and \`unit: "count"\`, so the sample reports 1,250 steps. This is one fictional interval, not a full-day total or a live phone result.

For an approved phone profile, first discover its actual IDs and types. Request step records for 2026-10-08T08:00:00.000Z through 2026-10-08T08:30:00.000Z, wait for completion and follow all result pages. Verify returned source, timestamps and units before aggregating; real records may differ, overlap or be absent. On Android choose \`Steps\` and read its \`count\` field rather than assuming the iOS shape. See [the connection and verification steps](/docs).

`
    : ''
}## ${dataset.title}: platform limitations

${dataset.limitations.map((limitation) => `- ${limitation}`).join('\n')}

## ${dataset.title}: fictional native record example

This illustrates native fields for ${dataset.sampleType} from ${dataset.sampleSource}, not a complete export envelope or a real person's records. The interactive builder previews selected types in the released export schema.

\`\`\`json
${JSON.stringify(dataset.sample, null, 2)}
\`\`\`

[Explore ${dataset.title.toLowerCase()} types and build a fictional export](/datasets/${slug}).`,
  )
  .join('\n\n')}

## Connect an AI assistant

Add https://myself.md/mcp as a remote MCP server in a compatible client and complete OAuth sign-in. Pair your phone with the same account, select a profile and approve its relevant individual Agent permissions. The assistant discovers available types before requesting a bounded query and waits for completion. A stored cloud export is a separate read path; signing in or viewing this catalog grants no private data.

Read [getting started](/docs), the [API reference](/docs/reference), [pricing](/pricing) and [privacy](/privacy).

For source-specific instructions, read [Apple Health with Claude and scoped MCP access](/docs/apple-health-claude-mcp), [Android Health Connect exports and MCP queries](/docs/android-health-connect-mcp) or [WHOOP with Claude and MCP](/docs/whoop-claude-mcp).

## Explore other datasets

${Object.entries(datasets)
  .map(([slug, dataset]) => `- [${dataset.title}](/datasets/${slug}): ${dataset.sources}`)
  .join('\n')}
`;
  return { canonical, title, description, markdown };
}

/** Give dataset routes their own metadata and readable fallback while retaining the app bundle.
 * @param {string} template @param {string} pathname
 */
export function datasetDocument(template, pathname) {
  const page = datasetPage(pathname);
  if (!page) return template;
  const url = `https://myself.md${page.canonical}`;
  const title = `${page.title} · myself.md`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': page.canonical === '/datasets' ? 'CollectionPage' : 'WebPage',
    name: title,
    description: page.description,
    url,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://myself.md/' },
        { '@type': 'ListItem', position: 2, name: 'Datasets', item: 'https://myself.md/datasets' },
        ...(page.canonical === '/datasets'
          ? []
          : [{ '@type': 'ListItem', position: 3, name: page.title, item: url }]),
      ],
    },
  };
  return (
    template
      // Dataset pages have no translated equivalents; homepage alternates do not apply.
      .replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+"\s*\/?>/g, '')
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(title)}</title>`)
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*"/,
        () => `<meta name="description" content="${escape(page.description)}"`,
      )
      .replace(/(<link rel="canonical" href=")[^"]*"/, () => `<link rel="canonical" href="${url}"`)
      .replace(
        /(<meta\s+property="og:(title|url|description)"\s+content=")[^"]*"/g,
        (_match, _prefix, field) =>
          `<meta property="og:${field}" content="${escape(field === 'title' ? title : field === 'url' ? url : page.description)}"`,
      )
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
      .replace(
        /<link rel="alternate" type="text\/markdown" href="[^"]*"\s*\/>/,
        () => `<link rel="alternate" type="text/markdown" href="${page.canonical}.md" />`,
      )
      .replace(
        '</head>',
        () =>
          `<link rel="stylesheet" href="/dashboard/docs.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`,
      )
      .replace('__PUBLIC_CONTENT__', () => docsHTML(page.markdown, page.canonical))
  );
}
