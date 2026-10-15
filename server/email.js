/** Outbound service email through the Cloudflare Email Service `send_email` Worker binding named `EMAIL`.
 * https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 * The self-hosted Node server has no binding, so it reports `configured: false`; callers keep push delivery
 * and record the email as not sent. Cloudflare's REST send endpoint would be the Node equivalent but needs
 * an account API token and an onboarded sending domain, which self-hosted installs do not have. */

const emailSender = { email: 'support@myself.md', name: 'myself.md' };

/** Structural subset of the Workers `SendEmail` binding used here.
 * @typedef {{send(message:{to:string,from:{email:string,name:string},replyTo:string,subject:string,text:string,html:string}):Promise<{messageId:string}>}} EmailBinding */
/** @typedef {{to:string,subject:string,text:string,html:string}} EmailMessage */
/** @typedef {{configured:boolean,send(message:EmailMessage):Promise<void>}} EmailSender */

/** Codes where resending the same message cannot succeed: the request or recipient is unusable.
 * Everything else (rate and daily limits, internal errors, sender domain not yet verified, unknown failures)
 * may succeed later. https://developers.cloudflare.com/email-service/api/send-emails/workers-api/#error-codes */
const permanent = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_TOO_MANY_ATTACHMENTS',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_CONTENT_TOO_LARGE',
  'E_DELIVERY_FAILED',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY',
  'not_configured',
  'invalid_message',
]);

/** Send failure. `code` is the Cloudflare `E_*` code, `not_configured`, `invalid_message` or `E_UNKNOWN`.
 * Messages never include addresses or message content. */
class EmailSendError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'EmailSendError';
    this.code = code;
    this.retryable = !permanent.has(code);
  }
}

/** @param {unknown} error */
function sendError(error) {
  const value = /** @type {{code?:unknown}} */ (typeof error === 'object' && error ? error : {});
  const code =
    typeof value.code === 'string' && /^E_[A-Z_]+$/.test(value.code) ? value.code : 'E_UNKNOWN';
  return new EmailSendError(code, `Email send failed (${code})`);
}
/** @param {EmailMessage} message */
function validate(message) {
  const address = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;
  if (typeof message?.to !== 'string' || message.to.length > 254 || !address.test(message.to))
    throw new EmailSendError('invalid_message', 'Email recipient is not a single valid address');
  if (
    typeof message.subject !== 'string' ||
    !message.subject.trim() ||
    /[\r\n]/.test(message.subject)
  )
    throw new EmailSendError('invalid_message', 'Email subject must be one non-empty line');
  if (
    typeof message.text !== 'string' ||
    !message.text ||
    typeof message.html !== 'string' ||
    !message.html
  )
    throw new EmailSendError('invalid_message', 'Email needs both text and HTML bodies');
}

/** @param {{EMAIL?:unknown}|null|undefined} env Worker env (or any object carrying the `EMAIL` binding).
 * @returns {EmailSender} */
export function createEmailSender(env) {
  const candidate = /** @type {{send?:unknown}|undefined} */ (env?.EMAIL);
  const binding =
    typeof candidate?.send === 'function' ? /** @type {EmailBinding} */ (candidate) : null;
  return {
    configured: Boolean(binding),
    async send(message) {
      if (!binding)
        throw new EmailSendError(
          'not_configured',
          'Email sending is not configured on this server',
        );
      validate(message);
      try {
        await binding.send({
          to: message.to,
          from: emailSender,
          replyTo: emailSender.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        throw sendError(error);
      }
    },
  };
}
