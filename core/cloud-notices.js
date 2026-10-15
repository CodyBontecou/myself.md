import { lifetimeCloudBytes } from './cloud-allowance.js';
import { cloudPlan } from './cloud-plans.js';

/** @typedef {'lapse-0'|'lapse-23'|'lapse-29'|'lapse-deleted'|'lifetime-revoked-deleted'} CloudNoticeKind */
/** For lapse reminders `deleteAt` is the scheduled deletion and `bytesToDelete` the expected amount.
 * For `lapse-deleted` and `lifetime-revoked-deleted` they are when deletion ran and the bytes actually deleted.
 * `plan` is the ended or still-billed paid tier ID, when known.
 * @typedef {{deleteAt:number|null,bytesToDelete:number,plan:string|null}} CloudNoticeContext */
/** Push (`title`, `body`) and email copy for one cloud storage service notice.
 * @typedef {{title:string,body:string,emailSubject:string,emailText:string,emailHtml:string}} CloudNotice */
/** @typedef {string|{list:string[]}} Block */

const supportEmail = 'support@myself.md';
const appLink = 'myselfmd://cloud-storage';
const dashboardUrl = 'https://myself.md/dashboard';
const termsUrl = 'https://myself.md/terms';
const appleSubscriptions = 'https://apps.apple.com/account/subscriptions';
const googleSubscriptions =
  'https://play.google.com/store/account/subscriptions?package=com.myself.md';
const included = `${lifetimeCloudBytes / 1_000_000} MB`;
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const reminders = {
  'lapse-0': {
    daysLeft: 30,
    title: 'Cloud storage plan ended',
    subject: 'Your cloud storage plan ended',
  },
  'lapse-23': {
    daysLeft: 7,
    title: '7 days until cloud exports are deleted',
    subject: '7 days left',
  },
  'lapse-29': {
    daysLeft: 1,
    title: '1 day until cloud exports are deleted',
    subject: '1 day left',
  },
};

/** @param {number|null} time */
function utcDate(time) {
  if (time === null || !Number.isFinite(time)) return null;
  const date = new Date(time);
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
/** Rounded up so the stated amount never understates what is deleted. @param {number} bytes */
function megabytes(bytes) {
  if (!(bytes > 0)) return '0 MB';
  if (bytes < 1_000_000) return 'less than 1 MB';
  return `about ${String(Math.ceil(bytes / 1_000_000)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} MB`;
}
/** @param {string|null} plan */
function planName(plan) {
  const label = cloudPlan(plan)?.label;
  return label ? `${label} cloud storage plan` : 'paid cloud storage plan';
}
/** @param {string} text */
function escape(text) {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
/** Escape, then link web URLs and email addresses. The app link stays text because mail clients drop custom schemes.
 * @param {string} text */
function inline(text) {
  return escape(text).replace(
    /(https:\/\/[^\s<]*[^\s<.,;:)])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g,
    (_match, url, email) =>
      url ? `<a href="${url}">${url}</a>` : `<a href="mailto:${email}">${email}</a>`,
  );
}
/** @param {readonly Block[]} blocks */
function emailText(blocks) {
  return `${blocks
    .map((block) =>
      typeof block === 'string' ? block : block.list.map((item) => `- ${item}`).join('\n'),
    )
    .join('\n\n')}\n`;
}
/** @param {string} subject @param {readonly Block[]} blocks */
function emailHtml(subject, blocks) {
  const body = blocks
    .map((block) =>
      typeof block === 'string'
        ? `<p>${inline(block)}</p>`
        : `<ul>${block.list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1c1e;max-width:560px">
${body}
</body></html>
`;
}
/** @type {readonly Block[]} */
const footer = [
  `Questions? Reply to this email or write to ${supportEmail}.`,
  `This is a service notice about data stored in your myself.md account, not marketing. Storage terms: ${termsUrl}`,
];
/** @param {string} subject @param {readonly Block[]} blocks @param {string} title @param {string} body @returns {CloudNotice} */
function notice(subject, blocks, title, body) {
  const all = [...blocks, ...footer];
  return {
    title,
    body,
    emailSubject: subject,
    emailText: emailText(all),
    emailHtml: emailHtml(subject, all),
  };
}

/** Plain-language push and email copy for paid-storage lapse reminders and deletion confirmations. Pure.
 * @param {CloudNoticeKind} kind @param {CloudNoticeContext} context @returns {CloudNotice} */
export function cloudNotice(kind, { deleteAt, bytesToDelete, plan }) {
  const date = utcDate(deleteAt);
  const amount = megabytes(bytesToDelete);
  if (kind === 'lapse-0' || kind === 'lapse-23' || kind === 'lapse-29') {
    const reminder = reminders[kind];
    const when = date
      ? `starting ${date} (UTC)`
      : `in ${reminder.daysLeft} ${reminder.daysLeft === 1 ? 'day' : 'days'}`;
    const ended =
      kind === 'lapse-0'
        ? `Your ${planName(plan)} for myself.md has ended. Lifetime access still includes ${included} of cloud storage, and your cloud exports use more than that.`
        : `Your ${planName(plan)} for myself.md ended, and your cloud exports still use more than the ${included} included with Lifetime access.`;
    return notice(
      `${reminder.subject}: cloud exports will be deleted ${when}`,
      [
        ended,
        `${when.charAt(0).toUpperCase()}${when.slice(1)}, we will delete your oldest cloud exports in one pass until your usage is ${included} or less. Based on your current usage, ${amount} needs to be removed; because we delete whole exports, the amount deleted may be larger. Deleted exports cannot be recovered. Data on your phone is not affected.`,
        'Before then, you can:',
        {
          list: [
            `Keep your cloud exports by resubscribing on the Cloud storage screen in the myself.md app (on your phone, ${appLink} opens it), or by deleting exports at ${dashboardUrl} until your usage is ${included} or less.`,
            `Download any exports you want to keep a copy of at ${dashboardUrl}. Downloading alone does not reduce cloud usage or prevent deletion.`,
          ],
        },
        'If you have already resubscribed or reduced your usage, nothing will be deleted and you can ignore this email.',
      ],
      reminder.title,
      `Your oldest cloud exports will be deleted ${when}. Current excess: ${amount}. Resubscribe or reduce usage to ${included} to keep them.`,
    );
  }
  if (kind === 'lapse-deleted') {
    const on = date ? ` on ${date} (UTC)` : '';
    return notice(
      'We deleted your oldest cloud exports',
      [
        `Your ${planName(plan)} for myself.md ended 30 days ago and your cloud exports used more than the ${included} included with Lifetime access, so we deleted your oldest cloud exports${on}: ${amount} in total.`,
        `Your remaining cloud exports fit within ${included}. Deleted exports cannot be recovered. Data on your phone was not affected.`,
        `If you need more space, you can subscribe again on the Cloud storage screen in the myself.md app (on your phone, ${appLink} opens it). You can download or delete your remaining exports at ${dashboardUrl}.`,
      ],
      'Oldest cloud exports deleted',
      `We deleted ${amount} of your oldest cloud exports so your storage fits the included ${included}.`,
    );
  }
  const on = date ? ` on ${date} (UTC)` : '';
  const label = cloudPlan(plan)?.label;
  const subscription = label
    ? `Your ${label} cloud storage subscription does not give you cloud storage without Lifetime access, and we cannot cancel it for you. Cancel it in your store account so you are not charged again:`
    : 'If you have a myself.md cloud storage subscription, it does not give you cloud storage without Lifetime access, and we cannot cancel it for you. Cancel it in your store account so you are not charged again:';
  return notice(
    'Your cloud exports were deleted after a Lifetime refund or revocation',
    [
      `Your myself.md Lifetime purchase was refunded or revoked by the App Store or Google Play. Cloud storage requires Lifetime access, so we deleted all of your cloud exports${on}: ${amount} in total. Deleted exports cannot be recovered. Data on your phone was not affected.`,
      subscription,
      { list: [`App Store: ${appleSubscriptions}`, `Google Play: ${googleSubscriptions}`] },
      `Refunds for store purchases are handled by Apple or Google. If you think this is a mistake, write to ${supportEmail}.`,
    ],
    'Cloud exports deleted',
    'Lifetime access was refunded or revoked, so we deleted all cloud exports. Cancel any cloud storage subscription in the App Store or Google Play.',
  );
}
