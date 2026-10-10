import { useEffect, useRef, useState } from 'react';

/** @typedef {{domain:import('../core/data.js').Domain,key:string}} AddedSelection */
/** @param {{value:Record<string,unknown>,added:AddedSelection|null}} props */
export function ExportJson({ value, added }) {
  const pane = useRef(/** @type {HTMLPreElement|null} */ (null));
  const [highlighted, setHighlighted] = useState(/** @type {string|null} */ (null));
  const records = /** @type {import('../core/data.js').DataRecord[]} */ (value.records);
  const metadata = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'schema' && key !== 'records'),
  );

  useEffect(() => {
    const container = pane.current;
    if (!container || !added || !container.getClientRects().length) return;
    const targetKey = `${added.domain}:${added.key}`;
    const target = [...container.querySelectorAll('[data-selection]')].find(
      (element) => element.getAttribute('data-selection') === targetKey,
    );
    if (!target) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Move only the JSON pane, keeping the checkbox and document position steady.
    const top =
      container.scrollTop +
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      16;
    container.scrollTo({ top, left: 0, behavior: reduced ? 'instant' : 'smooth' });
    setHighlighted(targetKey);
    const timeout = window.setTimeout(() => setHighlighted(null), 700);
    return () => {
      window.clearTimeout(timeout);
      // A subsequent toggle retargets from the current scroll position.
      container.scrollTo({ top: container.scrollTop, behavior: 'instant' });
      setHighlighted(null);
    };
  }, [added]);

  return (
    <section className="space-y-3">
      <pre
        ref={pane}
        className="export-json-pane overflow-x-hidden overflow-y-auto text-xs leading-relaxed"
        tabIndex={0}
        aria-label="Export JSON"
      >
        <code>
          {`{\n  "schema": ${JSON.stringify(value.schema)},\n  "records": [${records.length ? '\n' : ''}`}
          {records.map((item, index) => {
            const selection = `${item.domain}:native:${item.type}`;
            return (
              <span
                key={JSON.stringify(item)}
                className="export-json-record"
                data-selection={selection}
                data-highlighted={highlighted === selection ? 'true' : undefined}
              >
                <span aria-hidden="true" className="export-json-highlight" />
                <span className="relative">
                  {JSON.stringify(item, null, 2)
                    .split('\n')
                    .map((line) => `    ${line}`)
                    .join('\n')}
                  {index < records.length - 1 ? ',' : ''}
                  {'\n'}
                </span>
              </span>
            );
          })}
          {`${records.length ? '  ' : ''}],\n${JSON.stringify(metadata, null, 2).slice(2)}`}
        </code>
      </pre>
    </section>
  );
}
