import { mountLocationMap } from './chatgpt-catalog-map.js';
/** Report content height from the opaque sandbox without granting DOM access to the host. */
const content = document.querySelector('main');
if (content) {
  let previousHeight = 0;
  const reportSize = () => {
    // Measure content rather than viewport/scrollHeight so a collapsed view can shrink again.
    const height = Math.ceil(content.getBoundingClientRect().height);
    if (height === previousHeight || height <= 0) return;
    previousHeight = height;
    window.parent.postMessage(
      { jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height } },
      '*',
    );
  };
  new ResizeObserver(reportSize).observe(content);
  reportSize();
}

if (content instanceof HTMLElement && content.dataset.map === 'true') {
  /** @type {(()=>void)|undefined} */
  let cleanup;
  const renderMap = () => {
    const field = content.querySelector('.coordinate-field:not([data-map-ready])');
    if (field instanceof HTMLElement) {
      cleanup?.();
      cleanup = mountLocationMap(field);
    }
  };
  new MutationObserver(renderMap).observe(content, { childList: true, subtree: true });
  renderMap();
}

// Standalone insight cards share the connected renderer but have no account transport.
if (content instanceof HTMLElement) {
  const preparePreview = () => {
    if (!content.querySelector('.eyebrow')) {
      const badge = document.createElement('p');
      badge.className = 'eyebrow';
      badge.textContent = 'Demo data';
      content.prepend(badge);
    }
    for (const button of content.querySelectorAll('button'))
      if (
        /^(Refresh experiments|Cancel experiment|Compare hourly patterns|Read shared exports and review|Add another reflection|Add experiment reflection|Refresh reflections|Edit reflection|Delete reflection)$/.test(
          button.textContent ?? '',
        )
      )
        button.remove();
    for (const details of content.querySelectorAll('details'))
      if (details.querySelector('form') && details.children.length === 2) details.remove();
  };
  new MutationObserver(preparePreview).observe(content, { childList: true, subtree: true });
  preparePreview();
}
