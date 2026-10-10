/** Shared disclosure for the phone, dashboard and agent handoff. */
export const accountDeletionNotice =
  'Permanently delete your myself.md account, cloud exports, sharing permissions, connected phones, activity history, support conversation and its Discord thread, and account-linked lifetime access. This cannot be undone. A deletion-status receipt is retained for seven days. Purchase identifiers are retained without your account or receipt to prevent duplicate claims. Health and screen-time data in system apps, files sent to your own storage and copies on other phones are outside this cloud account. Deletion does not cancel store subscriptions or issue refunds.';
/** @typedef {'active'|'running'|'failed'|'completed'|'unavailable'} DeletionState */
/** @typedef {{state:DeletionState,subject:string,notice:string,error:string|null,statusUrl?:string}} DeletionStatus */
