/** @typedef {{owner:string,deviceId:string}} Context */
/** @type {Set<{context:Context,listener:()=>void,pending:boolean}>} */
const subscriptions = new Set();
/** Subscribe only to persisted metadata in the current account/device partition.
 * @param {Context} context @param {()=>void} listener */
export function subscribeLogs(context, listener) {
  const subscription = { context, listener, pending: false };
  subscriptions.add(subscription);
  return () => {
    subscriptions.delete(subscription);
  };
}
/** Coalesce writes in the same turn. Observers cannot interrupt application work.
 * @param {Context} context */
export function notifyLogs(context) {
  for (const subscription of subscriptions) {
    if (
      subscription.pending ||
      subscription.context.owner !== context.owner ||
      subscription.context.deviceId !== context.deviceId
    )
      continue;
    subscription.pending = true;
    void Promise.resolve().then(() => {
      subscription.pending = false;
      if (!subscriptions.has(subscription)) return undefined;
      try {
        subscription.listener();
      } catch {
        // A log viewer must not break the operation being observed.
      }
      return undefined;
    });
  }
}
