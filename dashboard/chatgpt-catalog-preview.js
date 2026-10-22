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
