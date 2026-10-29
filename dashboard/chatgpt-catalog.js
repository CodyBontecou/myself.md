import { mountCatalogNavigation } from './catalog-navigation.js';
/** Public host for sandboxed fictional previews. It has no account/tool transport. */
async function mountCatalog() {
  mountCatalogNavigation();
  /** @type {NodeListOf<HTMLIFrameElement>} */
  const frames = document.querySelectorAll('iframe[data-example]');
  const status = document.getElementById('catalog-status');
  /** @type {ReturnType<typeof import('../server/chatgpt-catalog.js').readVisualizationCatalog>|null} */
  let catalog = null;
  /** @param {HTMLIFrameElement} frame */
  function send(frame) {
    const example = catalog?.examples.find((e) => e.id === frame.dataset.example);
    if (example?.data)
      frame.contentWindow?.postMessage(
        {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: { structuredContent: example.data },
        },
        '*',
      );
  }
  window.addEventListener('message', (event) => {
    const frame = [...frames].find((f) => f.contentWindow === event.source);
    if (!frame || event.data?.jsonrpc !== '2.0') return;
    if (event.data.method === 'ui/initialize') {
      frame.contentWindow?.postMessage(
        {
          jsonrpc: '2.0',
          id: event.data.id,
          result: {
            protocolVersion: '2026-01-26',
            hostInfo: { name: 'myself.md fictional catalog', version: '1.0.0' },
            hostCapabilities: {},
          },
        },
        '*',
      );
      send(frame);
    } else if (event.data.method === 'ui/notifications/size-changed') {
      const height = event.data.params?.height;
      if (typeof height === 'number' && Number.isFinite(height) && height > 0 && height <= 100000)
        frame.style.height = `${Math.ceil(height)}px`;
    } else if (event.data.id && event.data.method) {
      frame.contentWindow?.postMessage(
        {
          jsonrpc: '2.0',
          id: event.data.id,
          error: {
            code: -32601,
            message:
              'This fictional preview has no account actions. Reset the preview to explore the example again.',
          },
        },
        '*',
      );
    }
  });
  /** @type {NodeListOf<HTMLButtonElement>} */
  const resets = document.querySelectorAll('button[data-reset]');
  for (const reset of resets)
    reset.addEventListener('click', () => {
      const frame = [...frames].find((f) => f.dataset.example === reset.dataset.reset);
      if (frame) send(frame);
    });
  // The gallery's data-derived SVG thumbnails need no embedded apps or record payload.
  if (!frames.length) {
    if (status) status.textContent = '';
    return;
  }
  try {
    const params = new URLSearchParams(location.search),
      query = new URLSearchParams({ includeData: '1' });
    if (params.has('example')) query.set('example', params.get('example') ?? '');
    const response = await fetch(`/apps/chatgpt/catalog.json?${query}`, { credentials: 'omit' });
    if (!response.ok) throw new Error('Catalog request failed.');
    catalog = await response.json();
    for (const frame of frames) frame.src = frame.dataset.src ?? '';
    if (status)
      status.textContent = 'Choose a day, app, hour or point inside a preview to explore.';
  } catch {
    if (status)
      status.textContent =
        'Previews could not load. Reload this page or open the example data below.';
  }
}
void mountCatalog();
