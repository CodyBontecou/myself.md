import { marked } from 'marked';

/** Parse agent text without generating or executing HTML.
 * @param {string} text */
export function markdownTokens(text) {
  return marked.lexer(text, { gfm: true, breaks: true });
}

/** @param {string} href @param {boolean} [image] */
export function markdownURL(href, image = false) {
  try {
    const url = new URL(href);
    return (image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:']).includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Content keys keep repeated Markdown fragments distinct.
 * @template T
 * @param {T[]} values
 * @param {(value:T)=>string} identify */
export function markdownEntries(values, identify) {
  const counts = new Map();
  return values.map((value) => {
    const content = identify(value);
    const occurrence = counts.get(content) ?? 0;
    counts.set(content, occurrence + 1);
    return { value, key: `${content}:${occurrence}` };
  });
}
