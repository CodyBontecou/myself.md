export const identityPageStyles = `
  :root {
    color-scheme: light dark;
    --background: #f8f9fa;
    --surface: #fff;
    --foreground: #18181b;
    --muted: #60616b;
    --border: #e6e7eb;
    --inset: #f8f9fa;
    --primary: #18181b;
    --on-primary: #fff;
    --hover: #303036;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.5;
    background: var(--background);
    color: var(--foreground);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
  }
  .brand {
    margin-bottom: 24px;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.8px;
  }
  .brand span { color: var(--muted); }
  main {
    width: 100%;
    max-width: 480px;
    padding: 32px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: 0 4px 24px rgb(0 0 0 / 3%);
    overflow-wrap: anywhere;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: -0.8px;
    text-wrap: balance;
  }
  .intro { margin: 12px 0 24px; color: var(--muted); }
  .intro strong { color: var(--foreground); font-weight: 600; }
  .permissions {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--inset);
  }
  h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--muted); }
  .scope {
    margin: 0 0 20px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
  }
  .permission-detail + .permission-detail { margin-top: 16px; }
  h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
  .permission-detail p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .decision-note { margin: 20px 0; color: var(--muted); font-size: 13px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  button, .action-link {
    width: 100%;
    min-height: 46px;
    padding: 12px 16px;
    border: 1px solid transparent;
    border-radius: 9px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .action-link { display: flex; align-items: center; justify-content: center; margin-top: 24px; text-decoration: none; }
  .primary { background: var(--primary); color: var(--on-primary); }
  .secondary { background: var(--surface); color: var(--foreground); border-color: var(--border); }
  button:focus-visible, .action-link:focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; }
  .sign-in-form button { display: grid; grid-template-columns: 20px 1fr 20px; align-items: center; gap: 12px; min-height: 48px; padding: 12px 18px; }
  .sign-in-form svg { flex-shrink: 0; }
  .sign-in-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; margin-top: 20px; }
  .sign-in-footer a { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); font-size: 13px; font-weight: 500; text-decoration: none; }
  .sign-in-footer a:focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; border-radius: 3px; }
  @media (hover: hover) and (pointer: fine) {
    .primary:hover { background: var(--hover); }
    .secondary:hover { background: var(--inset); }
    .sign-in-footer a:hover { color: var(--foreground); text-decoration: underline; text-underline-offset: 4px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    button:active { transform: scale(0.98); }
  }
  @media (max-width: 520px) {
    body { padding: 28px 16px; }
    main { padding: 24px; border-radius: 16px; }
    h1 { font-size: 24px; }
    .permissions { padding: 16px; }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: #111113;
      --surface: #1b1b1f;
      --foreground: #f4f4f5;
      --muted: #a7a7b1;
      --border: #333338;
      --inset: #222226;
      --primary: #f4f4f5;
      --on-primary: #18181b;
      --hover: #dedee3;
    }
  }
`;
