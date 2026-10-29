/** @typedef {{token:string,category:string,scrollY:number,cardId:string}} CatalogPosition */
const storageKey = 'myself.catalog.positions.v1';
/** Ignore invalid or unavailable tab-local storage. @returns {CatalogPosition[]} */
function positions() {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value.filter(validPosition).slice(-20) : [];
  } catch {
    return [];
  }
}
/** @param {unknown} value @returns {value is CatalogPosition} */
function validPosition(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    'token' in value &&
    typeof value.token === 'string' &&
    /^[a-f0-9-]{36}$/.test(value.token) &&
    'category' in value &&
    typeof value.category === 'string' &&
    ['all', 'time', 'health', 'location', 'combined'].includes(value.category) &&
    'scrollY' in value &&
    typeof value.scrollY === 'number' &&
    Number.isFinite(value.scrollY) &&
    value.scrollY >= 0 &&
    'cardId' in value &&
    typeof value.cardId === 'string' &&
    /^[a-z-]*$/.test(value.cardId)
  );
}
/** Preserve each gallery visit independently; no account data or server writes. */
export function mountCatalogNavigation() {
  const returnToken = new URLSearchParams(location.hash.slice(1)).get('catalog-return');
  const savedReturn = positions().find((value) => value.token === returnToken);
  const back = document.querySelector('.toolbar > a');
  if (back instanceof HTMLAnchorElement) {
    if (savedReturn) back.hash = `catalog-return=${savedReturn.token}`;
    return;
  }
  /** @type {NodeListOf<HTMLButtonElement>} */
  const filters = document.querySelectorAll('button[data-filter]');
  /** @type {NodeListOf<HTMLElement>} */
  const cards = document.querySelectorAll('article[data-category]');
  if (!filters.length || !cards.length) return;
  const historyValue = history.state?.myselfCatalog;
  /** @type {CatalogPosition} */
  let position = validPosition(historyValue)
    ? historyValue
    : (savedReturn ?? {
        token: crypto.randomUUID(),
        category: 'all',
        scrollY: 0,
        cardId: '',
      });
  /** @param {string} category */
  function filter(category) {
    position.category = category;
    for (const control of filters)
      control.setAttribute('aria-pressed', String(control.dataset.filter === category));
    let count = 0;
    for (const card of cards) {
      card.hidden = category !== 'all' && card.dataset.category !== category;
      if (!card.hidden) count++;
    }
    const label = document.getElementById('example-count');
    if (label) label.textContent = `${count} interactive ${count === 1 ? 'example' : 'examples'}`;
  }
  function remember() {
    position = { ...position, scrollY: window.scrollY };
    history.replaceState({ ...history.state, myselfCatalog: position }, '');
  }
  function saveReturn() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(
          [...positions().filter((p) => p.token !== position.token), position].slice(-20),
        ),
      );
    } catch {
      // Native Back still has this history entry when storage is unavailable.
    }
  }
  let restoring = false;
  let restoreGeneration = 0;
  /** @param {CatalogPosition} value */
  function restore(value) {
    position = { ...value };
    filter(position.category);
    history.replaceState({ ...history.state, myselfCatalog: position }, '');
    restoring = true;
    const generation = ++restoreGeneration;
    // Wait for font/layout shifts and native history/hash scrolling before restoring pixels.
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (generation !== restoreGeneration) return;
          window.scrollTo({ top: position.scrollY, behavior: 'instant' });
          restoring = false;
        }),
      ),
    );
  }
  if (savedReturn || validPosition(historyValue)) restore(position);
  else history.replaceState({ ...history.state, myselfCatalog: position }, '');
  for (const control of filters)
    control.addEventListener('click', () => {
      restoreGeneration++;
      restoring = false;
      filter(control.dataset.filter ?? 'all');
      remember();
    });
  for (const link of document.querySelectorAll('a.preview-link'))
    if (link instanceof HTMLAnchorElement)
      link.addEventListener('click', () => {
        position = {
          ...position,
          token: crypto.randomUUID(),
          cardId: link.closest('article')?.id ?? '',
        };
        remember();
        saveReturn();
        link.hash = `catalog-return=${position.token}`;
      });
  window.addEventListener('pagehide', () => {
    if (!restoring) remember();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && validPosition(history.state?.myselfCatalog))
      restore(history.state.myselfCatalog);
  });
  // A second return to an already-open gallery changes only its hash.
  window.addEventListener('hashchange', () => {
    const token = new URLSearchParams(location.hash.slice(1)).get('catalog-return');
    const value = positions().find((p) => p.token === token);
    if (value) restore(value);
  });
}
