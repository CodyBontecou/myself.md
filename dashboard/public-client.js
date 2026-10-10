/** @typedef {{origin?:string,token?:string,fetch?:typeof globalThis.fetch}} ClientOptions */
/** Public reads and owner-approved asynchronous queries. @param {ClientOptions} [options] */
export function createMyselfClient(options = {}) {
  const origin = new URL(options.origin ?? 'https://myself.md');
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      ))
  )
    throw new Error('Use an HTTPS origin, or a local HTTP development origin.');
  const send = options.fetch ?? globalThis.fetch;
  /** @param {string} path @param {{method?:string,body?:Record<string,unknown>,key?:string,private?:boolean,text?:boolean}} [request] */
  async function read(path, request = {}) {
    if (request.private && !options.token) throw new Error('An agent OAuth token is required.');
    const response = await send(new URL(path, origin), {
      method: request.method ?? 'GET',
      redirect: 'error',
      headers: {
        Accept: request.text ? 'text/markdown' : 'application/json',
        ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        ...(request.private ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(request.key ? { 'Idempotency-Key': request.key } : {}),
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });
    if (!response.ok) throw new Error(`myself.md request failed (${response.status}).`);
    return request.text ? response.text() : response.json();
  }
  return {
    health: () => read('/v1/health'),
    config: () => read('/v1/config'),
    docs: () => read('/v1/docs', { text: true }),
    /** @param {{limit?:number,cursor?:string}} [input] */
    datasets: (input = {}) => {
      if (
        input.limit !== undefined &&
        (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 3)
      )
        throw new Error('limit must be 1–3.');
      if (input.cursor !== undefined && !/^catalog-v1:[0-3]$/.test(input.cursor))
        throw new Error('Invalid catalog cursor.');
      const params = new URLSearchParams();
      if (input.limit !== undefined) params.set('limit', String(input.limit));
      if (input.cursor !== undefined) params.set('cursor', input.cursor);
      return read(`/v1/dataset-catalog?${params}`);
    },
    /** @param {Record<string,unknown>} input @param {string} key */
    query: (input, key) => {
      if (!key || key.length > 200) throw new Error('Use an idempotency key of 1–200 characters.');
      return read('/api/v1/queries', { method: 'POST', body: input, key, private: true });
    },
    /** @param {string} requestId */
    request: (requestId) => {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))
        throw new Error('Use a request UUID.');
      return read(`/api/v1/queries/${requestId}`, { private: true });
    },
  };
}
