export const pairingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Connect your phone · myself.md</title>
  <style>
    :root { color-scheme: light dark; --bg: #fafafa; --card: #fff; --text: #171717; --muted: #666; --line: #e8e8e8; --soft: #f5f5f5; --button: #171717; --button-text: #fff; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-underline-offset: 4px; }
    a:focus-visible { outline: 2px solid var(--text); outline-offset: 5px; }
    .shell { max-width: 1080px; min-height: 100svh; margin: auto; padding: 32px 40px 24px; display: flex; flex-direction: column; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .brand { font-size: 20px; font-weight: 650; letter-spacing: -.8px; text-decoration: none; }
    .header-note { color: var(--muted); font-size: 13px; }
    main { flex: 1; display: grid; place-items: center; padding: 64px 0; }
    .connection { width: 100%; max-width: 900px; }
    .eyebrow { margin: 0 0 18px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(32px, 5vw, 48px); font-weight: 600; line-height: 1.1; letter-spacing: -1.8px; }
    .intro { margin: 18px 0 0; max-width: 390px; color: var(--muted); font-size: 16px; line-height: 1.65; }
    .layout { display: grid; grid-template-columns: 1fr 340px; align-items: center; gap: 76px; }
    ol { list-style: none; padding: 0; margin: 36px 0 0; display: grid; gap: 23px; }
    li { display: flex; align-items: flex-start; gap: 14px; }
    .number { flex: 0 0 26px; height: 26px; border: 1px solid var(--line); border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600; }
    li strong { display: block; padding-top: 2px; font-size: 14px; font-weight: 600; }
    li p { margin: 6px 0 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
    .card { padding: 28px; border: 1px solid var(--line); border-radius: 20px; background: var(--card); text-align: center; box-shadow: 0 8px 32px #00000004; }
    .qr-area { width: 100%; aspect-ratio: 1; display: grid; place-items: center; border-radius: 10px; background: #fff; overflow: hidden; }
    #qr { display: block; width: 100%; height: auto; }
    .complete { color: #25824c; }
    .complete svg { width: 100px; height: 100px; }
    .placeholder { color: #737373; }
    .placeholder svg { width: 64px; height: 64px; }
    .card-title { margin: 22px 0 0; font-size: 15px; font-weight: 600; }
    .card-note { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
    .divider { display: flex; gap: 12px; align-items: center; margin: 24px 0 16px; color: var(--muted); font-size: 12px; }
    .divider::before, .divider::after { content: ""; height: 1px; flex: 1; background: var(--line); }
    .button { min-height: 46px; padding: 13px 16px; display: flex; align-items: center; justify-content: center; gap: 10px; border-radius: 9px; background: var(--button); color: var(--button-text); text-decoration: none; font-size: 14px; font-weight: 600; }
    .button:hover { opacity: .85; }
    .button svg { width: 16px; height: 16px; }
    .approval { display: flex; align-items: flex-start; gap: 10px; margin: 40px 0 0; padding-top: 24px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; line-height: 1.6; }
    .approval svg { flex: 0 0 16px; height: 16px; margin-top: 2px; }
    footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; color: var(--muted); font-size: 12px; }
    footer nav { display: flex; gap: 22px; }
    footer a { text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    noscript p { max-width: 900px; margin: 24px auto 0; padding: 16px; background: var(--soft); border-radius: 9px; line-height: 1.6; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #171717; --card: #202020; --text: #fafafa; --muted: #aaa; --line: #363636; --soft: #262626; --button: #fafafa; --button-text: #171717; }
    }
    @media (max-width: 760px) {
      .shell { padding: 24px; }
      main { padding: 48px 0; }
      .layout { grid-template-columns: 1fr; gap: 32px; }
      .connection { max-width: 440px; }
      .copy { display: contents; }
      .card { order: 1; }
      ol { order: 2; margin-top: 4px; }
      .card { width: 100%; max-width: 340px; justify-self: center; padding: 24px; }
      h1 { letter-spacing: -1.2px; }
      .approval { margin-top: 32px; }
      .header-note { font-size: 12px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <a class="brand" href="/" aria-label="myself.md home">myself.md</a>
      <span class="header-note">Phone connection</span>
    </header>
    <noscript><p>Enable JavaScript to display your pairing code and open the app. Then reload this page.</p></noscript>
    <main>
      <section class="connection" aria-labelledby="heading">
        <div class="layout">
          <div class="copy">
            <div>
            <p class="eyebrow">One connection. Your control.</p>
            <h1 id="heading">Connect your phone.</h1>
            <p id="intro" class="intro">Bring your phone into myself.md. Scan the code, then confirm the connection in the app.</p>
            </div>
            <ol id="steps">
              <li><span class="number" aria-hidden="true">1</span><div><strong>Scan the QR code</strong><p>Use your phone’s Camera or the scanner in myself.md.</p></div></li>
              <li><span class="number" aria-hidden="true">2</span><div><strong>Sign in to the same account</strong><p>Use the account that created this pairing link.</p></div></li>
              <li><span class="number" aria-hidden="true">3</span><div><strong>Confirm on your phone</strong><p>Review the connection in myself.md and approve it when you’re ready.</p></div></li>
            </ol>
          </div>
          <div class="card">
            <div id="qr-area" class="qr-area">
              <div id="complete" class="complete" hidden aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="43"/><path d="m30 50 14 14 26-28"/></svg></div>
              <div id="placeholder" class="placeholder" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5H7a2 2 0 0 0-2 2v10M31 5h10a2 2 0 0 1 2 2v10M43 31v10a2 2 0 0 1-2 2H31M17 43H7a2 2 0 0 1-2-2V31"/><path d="M13 13h7v7h-7zM28 13h7v7h-7zM13 28h7v7h-7zM28 28h7v7h-7z"/></svg></div>
              <img id="qr" width="282" height="282" alt="Scan to connect your phone to myself.md" hidden>
            </div>
            <div role="status" aria-live="polite">
              <p id="code-title" class="card-title">Open your pairing link</p>
              <p id="code-note" class="card-note">Ask your connected agent to create a phone pairing link, then open it here.</p>
            </div>
            <div id="app-action" hidden>
              <div class="divider">Already on your phone?</div>
              <a id="open-app" class="button">Open in myself.md <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>
              <p class="card-note">Requires the myself.md app.</p>
            </div>
          </div>
        </div>
        <p class="approval"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>Connecting requires your approval on the phone. You choose which data to share in the app.</p>
      </section>
    </main>
    <footer><span>Your phone. Your data.</span><nav aria-label="Help and privacy"><a href="/docs">Help</a><a href="/privacy">Privacy</a></nav></footer>
  </div>
  <script>
    const ticket = location.hash.slice(1);
    const qr = document.getElementById('qr');
    const placeholder = document.getElementById('placeholder');
    const title = document.getElementById('code-title');
    const note = document.getElementById('code-note');
    const action = document.getElementById('app-action');
    let finished = false;
    function showOutcome(status) {
      finished = true;
      qr.hidden = true;
      placeholder.hidden = true;
      action.hidden = true;
      document.getElementById('steps').hidden = true;
      if (status === 'connected') {
        document.getElementById('complete').hidden = false;
        document.getElementById('heading').textContent = 'Your phone is connected.';
        document.getElementById('intro').textContent = 'You confirmed the connection in myself.md. You can return to your agent or close this page.';
        title.textContent = 'Phone connected';
        note.textContent = 'You choose which data to share in the app.';
        document.title = 'Phone connected · myself.md';
      } else {
        document.getElementById('qr-area').hidden = true;
        title.textContent = status === 'disconnected' ? 'Phone disconnected' : 'This pairing link has expired';
        note.textContent = 'Ask your agent for a new pairing link to connect your phone.';
      }
    }
    async function checkConnection() {
      try {
        const response = await fetch('/api/pairing-status/' + ticket, {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Status unavailable');
        const result = await response.json();
        if (['connected', 'expired', 'disconnected'].includes(result.status)) {
          showOutcome(result.status);
          return;
        }
      } catch {
        if (!finished) note.textContent = 'Connection status is temporarily unavailable. Retrying automatically…';
      }
      if (!finished) setTimeout(checkConnection, 2000);
    }
    if (/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      title.textContent = 'Loading your code…';
      note.textContent = 'Keep this page open while you connect.';
      qr.onload = () => {
        if (finished) return;
        placeholder.hidden = true;
        qr.hidden = false;
        action.hidden = false;
        title.textContent = 'Scan to connect';
        note.textContent = 'Pairing codes expire five minutes after creation.';
      };
      qr.onerror = () => {
        if (finished) return;
        qr.hidden = true;
        placeholder.hidden = false;
        action.hidden = true;
        title.textContent = 'This code couldn’t be loaded';
        note.textContent = 'It may have expired or already been used. Ask your agent for a new pairing link, or reload to try again.';
      };
      document.getElementById('open-app').href = 'myselfmd://pair?url=' + encodeURIComponent(location.origin + '/pair#' + ticket);
      qr.src = '/qr/' + ticket;
      checkConnection();
    } else if (ticket) {
      title.textContent = 'This pairing link is incomplete';
      note.textContent = 'Open the full link from your agent, or ask it to create a new phone pairing.';
    }
  </script>
</body>
</html>`;
