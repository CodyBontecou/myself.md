/** Adapt a host's authenticated HTTP transport. Never place Discord credentials in the client.
 * @param {(path:string,options:{method:'GET'|'POST'|'PUT',body?:string})=>Promise<import('./protocol.js').SupportState>} transport
 * @param {string} [endpoint] */
export function createSupportRequest(transport, endpoint = '/api/support') {
  /** @type {import('./protocol.js').SupportRequest} */
  const request = (method, body, before) => {
    const path =
      before === undefined
        ? endpoint
        : `${endpoint}${endpoint.includes('?') ? '&' : '?'}before=${encodeURIComponent(before)}`;
    return transport(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  return request;
}
