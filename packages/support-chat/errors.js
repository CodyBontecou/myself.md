/** @typedef {{name:string,message:string,code?:string|number,domain?:string,status?:number,retryAfter?:number,stack?:string,cause?:ErrorDetails,response?:unknown,truncated?:boolean}} ErrorDetails */
const limit = 16000;
/** Preserve diagnostic text without copying credential values into display JSON.
 * @param {string} text */
function safeText(text) {
  return text
    .slice(0, limit)
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [redacted]')
    .replace(
      /([?&](?:access_token|refresh_token|token|api_key|apiKey|password|secret|signature)=)[^&#\s"']*/gi,
      '$1[redacted]',
    );
}
/** Project error payload fields, never request headers, credentials or account records.
 * @param {unknown} value @param {number} depth @returns {unknown} */
function responseDetails(value, depth) {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return safeText(value);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (!value || typeof value !== 'object') return String(value);
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => responseDetails(item, depth + 1));
  const record = /** @type {Record<string,unknown>} */ (value);
  return Object.fromEntries(
    [
      'error',
      'message',
      'detail',
      'code',
      'status',
      'retryAfter',
      'error_description',
      'errors',
      'issues',
      'reason',
    ]
      .filter((key) => key in record)
      .map((key) => [key, responseDetails(record[key], depth + 1)]),
  );
}
/** Preserve non-enumerable Error fields and bounded causes, including native bridge codes.
 * @param {unknown} value @param {Set<object>} seen @param {number} depth @returns {ErrorDetails} */
function describe(value, seen, depth) {
  if (!value || typeof value !== 'object')
    return { name: 'Error', message: safeText(String(value)) };
  if (seen.has(value) || depth > 4)
    return { name: 'Error', message: '[circular or truncated cause]', truncated: true };
  seen.add(value);
  const record = /** @type {Record<string,unknown>} */ (value);
  const message = typeof record.message === 'string' ? record.message : String(value);
  /** @type {ErrorDetails} */
  const result = {
    name: typeof record.name === 'string' ? safeText(record.name) : 'Error',
    message: safeText(message),
  };
  if (message.length > limit || record.truncated === true) result.truncated = true;
  if (typeof record.code === 'string' || typeof record.code === 'number')
    result.code = typeof record.code === 'string' ? safeText(record.code) : record.code;
  if (typeof record.stack === 'string') result.stack = safeText(record.stack);
  if (typeof record.domain === 'string') result.domain = safeText(record.domain);
  if (typeof record.status === 'number') result.status = record.status;
  if (typeof record.retryAfter === 'number') result.retryAfter = record.retryAfter;
  if (record.cause !== undefined) result.cause = describe(record.cause, seen, depth + 1);
  if (record.response !== undefined) result.response = responseDetails(record.response, 0);
  return result;
}
/** JSON for error displays; already-formatted errors stay JSON rather than being double encoded.
 * @param {unknown} value @returns {string} */
export function errorJSON(value) {
  if (value === '') return '';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (
        parsed?.error &&
        typeof parsed.error.message === 'string' &&
        typeof parsed.error.name === 'string'
      ) {
        value = parsed.error;
      }
    } catch {
      /* Plain validation and legacy error text are wrapped below. */
    }
  }
  let details;
  try {
    details = describe(value, new Set(), 0);
  } catch (cause) {
    details = {
      name: 'ErrorSerializationError',
      message: 'Error details could not be read.',
      cause: describe(cause, new Set(), 0),
    };
  }
  const result = { error: details };
  const formatted = JSON.stringify(result, null, 2);
  if (formatted.length <= limit) return formatted;
  return JSON.stringify(
    {
      error: {
        name: result.error.name.slice(0, 100),
        message: result.error.message.slice(0, 1200),
        ...(result.error.code !== undefined
          ? {
              code:
                typeof result.error.code === 'string'
                  ? result.error.code.slice(0, 100)
                  : result.error.code,
            }
          : {}),
        ...(result.error.status !== undefined ? { status: result.error.status } : {}),
        truncated: true,
      },
    },
    null,
    2,
  );
}
/** Preserve HTTP status and the actual error payload at the transport boundary.
 * @param {number} status @param {unknown} response */
function responseError(status, response) {
  const body = /** @type {Record<string,unknown>|null} */ (response);
  const message =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : `HTTP ${status}`;
  return Object.assign(new Error(message), {
    name: 'HTTPError',
    status,
    response: responseDetails(response, 0),
  });
}

/** Decode transport responses without losing the status when a server returns non-JSON.
 * @param {Response} response @returns {Promise<unknown>} */
export async function readJSONResponse(response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    if (!response.ok) throw responseError(response.status, text);
    throw Object.assign(new Error('The server returned invalid JSON.'), {
      name: 'InvalidResponseError',
      status: response.status,
      cause,
    });
  }
  if (!response.ok) throw responseError(response.status, body);
  return body;
}
