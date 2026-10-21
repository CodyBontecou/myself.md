import { identityPageStyles } from './identity-page-style.js';

/** Browser recovery page; no requested path or query is reflected into the document. @param {string} nonce */
export function notFoundPage(nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Page not found · myself.md</title><style nonce="${nonce}">${identityPageStyles}
    .error-code { margin: 0 0 16px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 1.5px; }
    .recovery-actions { display: grid; gap: 12px; }
    .recovery-actions .action-link { margin: 0; min-height: 48px; }
  </style></head><body><header class="brand">myself<span>.md</span></header><main><p class="error-code">404 · PAGE NOT FOUND</p><h1>This page isn’t here.</h1><p class="intro">The link may be out of date, or the address may be incomplete. Head home or find what you need in the docs.</p><div class="recovery-actions"><a class="action-link primary" href="/">Back to myself.md</a><a class="action-link secondary" href="/docs">Open the docs</a></div><nav class="sign-in-footer" aria-label="Help and privacy"><a href="/contact">Contact support</a><a href="/privacy">Privacy</a></nav></main></body></html>`;
}
