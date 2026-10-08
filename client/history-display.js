/** @typedef {import('../core/history.js').HistoryEvent} Event */
/** @param {Event} event */
export function historyTitle(event) {
  return event.profile.name;
}
/** @param {Event} event */
export function historyOutcome(event) {
  if (event.status === 'complete')
    return event.kind === 'access'
      ? 'Returned to agent'
      : event.target === 'local'
        ? 'Saved'
        : event.target === 'share'
          ? 'Share sheet opened'
          : 'Delivered';
  return {
    running: 'In progress',
    ready: 'Ready for agent',
    partial: 'Partial export',
    failed: 'Failed',
    cancelled: 'Cancelled',
    expired: 'Expired',
    interrupted: 'Interrupted',
  }[event.status];
}
/** @param {Event} event */
export function historyRoute(event) {
  return event.kind === 'access'
    ? `${event.target === 'cloud' ? 'Cloud export' : 'This phone'} → Connected agent`
    : `${event.actor === 'schedule' ? 'Schedule' : 'You'} → ${event.destination}`;
}
/** @param {string} stamp */
export function historyDay(stamp) {
  const date = new Date(stamp),
    today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
