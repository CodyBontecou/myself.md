import { useEffect, useRef, useState } from 'react';

/**
 * @param {{value:unknown,name?:string|undefined,depth?:number,comma?:boolean,recordList?:boolean,selection?:string|undefined,highlighted:string|null}} props
 */
function JsonNode({
  value,
  name,
  depth = 0,
  comma = false,
  recordList = false,
  selection,
  highlighted,
}) {
  const array = Array.isArray(value);
  const object = value !== null && typeof value === 'object';
  const prefix = `${'  '.repeat(depth)}${name === undefined ? '' : `${JSON.stringify(name)}: `}`;
  const suffix = comma ? ',' : '';
  if (!object) {
    return (
      <span className="export-json-line">
        {prefix}
        {JSON.stringify(value)}
        {suffix}
      </span>
    );
  }
  /** @type {Array<[string, unknown]>} */
  const entries = array
    ? value.map((child, index) => [String(index), child])
    : Object.entries(value);
  const opening = array ? '[' : '{';
  const closing = array ? ']' : '}';
  const label = `${name ?? (selection ? 'Record' : 'JSON')} ${array ? 'array' : 'object'}`;
  return (
    <span
      className="export-json-record"
      data-selection={selection}
      data-highlighted={highlighted === selection ? 'true' : undefined}
    >
      {selection && <span aria-hidden="true" className="export-json-highlight" />}
      <details open className="export-json-node relative">
        <summary className="export-json-line" aria-label={label}>
          {prefix}
          {opening}
          <span className="export-json-collapsed">
            {' '}
            … {closing}
            {suffix}
          </span>
        </summary>
        {entries.map(([key, child], index) => {
          const record =
            recordList &&
            child !== null &&
            typeof child === 'object' &&
            'domain' in child &&
            'type' in child
              ? `${child.domain}:native:${child.type}`
              : undefined;
          return (
            <JsonNode
              key={record ?? key}
              value={child}
              name={array ? undefined : key}
              depth={depth + 1}
              comma={index < entries.length - 1}
              recordList={!array && key === 'records'}
              selection={record}
              highlighted={highlighted}
            />
          );
        })}
        <span className="export-json-line">
          {'  '.repeat(depth)}
          {closing}
          {suffix}
        </span>
      </details>
    </span>
  );
}

/** @typedef {{domain:import('../core/data.js').Domain,key:string}} AddedSelection */
/** @param {{value:Record<string,unknown>,added:AddedSelection|null}} props */
export function ExportJson({ value, added }) {
  const pane = useRef(/** @type {HTMLPreElement|null} */ (null));
  const [highlighted, setHighlighted] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    const container = pane.current;
    if (!container || !added || !container.getClientRects().length) return;
    const targetKey = `${added.domain}:${added.key}`;
    const target = [...container.querySelectorAll('[data-selection]')].find(
      (element) => element.getAttribute('data-selection') === targetKey,
    );
    if (!target) return;
    // Reveal the newly selected record even when its ancestors were collapsed.
    let ancestor = target.parentElement?.closest('details');
    while (ancestor) {
      ancestor.open = true;
      ancestor = ancestor.parentElement?.closest('details') ?? null;
    }
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
          <JsonNode value={value} highlighted={highlighted} />
        </code>
      </pre>
    </section>
  );
}
