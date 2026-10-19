import { useRef, useState } from 'react';
import { datasetWorkflows } from '../core/dataset-workflows.js';
import { datasets } from './dataset-catalog.js';
import { Button } from './components/ui/button.js';

/** @param {{workflow:typeof datasetWorkflows[number]}} props */
function WorkflowQuestion({ workflow }) {
  const [copyStatus, setCopyStatus] = useState('');
  const details = useRef(/** @type {HTMLDetailsElement|null} */ (null));
  const prompt = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  return (
    <div data-workflow={workflow.id} className="border-t border-border py-5">
      <details ref={details} className="group">
        <summary className="cursor-pointer text-base font-medium leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">
          {workflow.question}
        </summary>
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          <div className="space-y-3">
            <label className="block font-medium" htmlFor={`${workflow.id}-prompt`}>
              Prompt to send to your agent
            </label>
            <textarea
              ref={prompt}
              id={`${workflow.id}-prompt`}
              readOnly
              value={workflow.prompt}
              rows={5}
              className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <p className="text-muted-foreground">{workflow.availability}</p>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Fictional answer example
            </p>
            <p>{workflow.example}</p>
          </div>
          <div>
            <p className="font-medium">Data needed</p>
            <p className="text-muted-foreground">{workflow.dataNeeded}</p>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {workflow.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(workflow.prompt);
              setCopyStatus('Copied.');
            } catch {
              if (details.current) details.current.open = true;
              prompt.current?.focus();
              prompt.current?.select();
              setCopyStatus('Copy unavailable. Copy the selected prompt manually.');
            }
          }}
        >
          Copy prompt
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {copyStatus}
        </p>
      </div>
    </div>
  );
}

/** @param {{dataset:string}} props */
export function DatasetQuestions({ dataset }) {
  const topics = Object.entries(datasets).filter(([slug]) => dataset === 'all' || slug === dataset);
  return (
    <section className="space-y-8" aria-labelledby="questions-title">
      <div className="max-w-3xl space-y-4">
        <h1
          id="questions-title"
          className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Ask about your data
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Copy a question into your agent to get started.
        </p>
        <a href="#technical-explorer" className="inline-block text-sm underline underline-offset-4">
          Explore data types and example JSON
        </a>
      </div>
      <div className={`grid gap-6 ${topics.length > 1 ? 'lg:grid-cols-3' : ''}`}>
        {topics.map(([slug, topic]) => {
          const workflows = datasetWorkflows.filter((workflow) => workflow.dataset === slug);
          return (
            <article key={slug} className="min-w-0 rounded-xl border border-border p-5 sm:p-6">
              <h2 className="text-xl font-medium tracking-tight">{topic.title}</h2>
              {workflows.map((workflow) => (
                <WorkflowQuestion key={workflow.id} workflow={workflow} />
              ))}
              <a
                href={`/datasets/${slug}#technical-explorer`}
                className="text-sm underline underline-offset-4"
              >
                Explore {topic.title.toLowerCase()} data types
              </a>
            </article>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Your agent can help you connect.{' '}
        <a href="/docs" className="underline underline-offset-4">
          Setup guide
        </a>
      </p>
    </section>
  );
}
