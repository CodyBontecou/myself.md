/** Keep explanation and source configuration out of the plotting area.
 * All underlying observations and accessible control names stay intact.
 * @param {HTMLElement} root */
export function compactReview(root) {
  root.classList.add('visual-review');
  const limits = root.querySelector(':scope > details.review-notes');
  if (limits instanceof HTMLDetailsElement) {
    limits.classList.add('review-notes');
    limits.open = root.dataset.notesOpen === 'true';
    limits.addEventListener('toggle', () => {
      if (limits.isConnected) root.dataset.notesOpen = String(limits.open);
    });
    for (const note of root.querySelectorAll('.review-note'))
      if (!limits.contains(note)) limits.append(note);
  }
  const date = root.querySelector('.overview > p:first-child');
  if (date?.textContent?.includes(' · ')) {
    date.setAttribute('aria-label', date.textContent);
    date.setAttribute('title', date.textContent);
    date.textContent = date.textContent.split(' · ')[0] ?? '';
  }
  const labels = [...root.querySelectorAll('label')].filter((label) => {
    const select = label.querySelector('select');
    return select && /source/i.test(select.getAttribute('aria-label') ?? label.textContent ?? '');
  });
  if (labels.length) {
    const sources = document.createElement('details');
    sources.className = 'review-sources';
    sources.open = root.dataset.sourcesOpen === 'true';
    const summary = document.createElement('summary');
    summary.textContent = 'Sources';
    sources.append(summary, ...labels);
    sources.addEventListener('toggle', () => {
      if (sources.isConnected) root.dataset.sourcesOpen = String(sources.open);
    });
    const controls = root.querySelector('.controls');
    if (controls) controls.append(sources);
    else root.querySelector('.overview, .review-header, h1')?.after(sources);
  }
  for (const eyebrow of root.querySelectorAll('.eyebrow')) {
    if (/FICTIONAL|Demo data/.test(eyebrow.textContent ?? '')) eyebrow.textContent = 'Demo data';
    else eyebrow.remove();
  }
  // Rendering replaces controls. Keep keyboard users on the control they changed.
  for (const control of root.querySelectorAll('select'))
    control.addEventListener('change', () => {
      const name = control.getAttribute('aria-label');
      if (!name) return;
      const replacement = [...root.querySelectorAll('select')].find(
        (item) => item.getAttribute('aria-label') === name,
      );
      replacement?.focus({ preventScroll: true });
    });
}

/** @param {string} title @param {Node[]} content */
export function reviewDisclosure(title, content) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary, ...content);
  return details;
}
