import { errorJSON } from './errors.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sorted } from './collections.js';
/** @typedef {import('./protocol.js').SupportState} SupportState */
/** Shared conversation state for mobile and dashboard. Requests are account scoped by the adapter.
 * @param {(method:'GET'|'POST'|'PUT',body?:unknown,before?:number)=>Promise<SupportState>} request @param {boolean} [active] */
export function useSupport(request, active = true) {
  const [state, setState] = useState(/** @type {SupportState|null} */ (null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    reading = useRef(false),
    writing = useRef(false);
  const retryRequest = useRef(request);
  const retry = useRef(/** @type {{id:string,text:string}|null} */ (null));
  /** @param {SupportState} next @param {boolean} [older] */
  const merge = useCallback((/** @type {SupportState} */ next, older = false) => {
    setState((previous) => {
      if (!previous || previous.conversationId !== next.conversationId) return next;
      const messages = new Map(previous.messages.map((message) => [message.id, message]));
      for (const message of next.messages) messages.set(message.id, message);
      return {
        ...next,
        messages: sorted([...messages.values()], (a, b) => a.sequence - b.sequence),
        before: older ? next.before : previous.before,
        hasMore: older ? next.hasMore : previous.hasMore,
      };
    });
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current || writing.current) return;
    reading.current = true;
    const version = epoch.current;
    try {
      const next = await request('GET');
      if (version === epoch.current) {
        merge(next);
        setError('');
      }
    } catch (reason) {
      if (version === epoch.current) setError(errorJSON(reason));
    } finally {
      reading.current = false;
    }
  }, [request, merge]);
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);
  useEffect(() => {
    if (retryRequest.current !== request) {
      retry.current = null;
      retryRequest.current = request;
    }
  }, [request]);
  useEffect(() => {
    epoch.current++;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setState(null);
      setError('');
      setBusy(false);
      if (active) void refresh();
      return undefined;
    });
    if (!active)
      return () => {
        cancelled = true;
      };
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      cancelled = true;
      invalidate();
      clearInterval(timer);
    };
  }, [active, refresh, invalidate]);
  /** @param {'POST'|'PUT'|'GET'} method @param {unknown} [body] @param {number} [before] */
  const write = useCallback(
    async (
      /** @type {'POST'|'PUT'|'GET'} */ method,
      /** @type {unknown} */ body,
      /** @type {number|undefined} */ before,
    ) => {
      if (writing.current) return false;
      writing.current = true;
      setBusy(true);
      setError('');
      const version = ++epoch.current;
      try {
        const next = await request(method, body, before);
        if (version !== epoch.current) return false;
        merge(next, method === 'GET');
        return true;
      } catch (reason) {
        if (version === epoch.current) setError(errorJSON(reason));
        return false;
      } finally {
        writing.current = false;
        if (version === epoch.current) setBusy(false);
      }
    },
    [request, merge],
  );
  /** @param {string} text */
  async function send(text) {
    if (retry.current?.text !== text)
      retry.current = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
        text,
      };
    const saved = await write('POST', retry.current, undefined);
    if (saved) retry.current = null;
    return saved;
  }
  /** @param {boolean} allowed */
  async function setAgentAccess(allowed) {
    const previous = state?.agentAccess ?? false;
    const version = epoch.current;
    setState((current) => (current ? { ...current, agentAccess: allowed } : null));
    const saved = await write('PUT', { agentAccess: allowed }, undefined);
    if (!saved && epoch.current === version + 1)
      setState((current) => (current ? { ...current, agentAccess: previous } : null));
    return saved;
  }
  return {
    state,
    error,
    busy,
    refresh,
    send,
    loadOlder: () =>
      state?.before ? write('GET', undefined, state.before) : Promise.resolve(false),
    setAgentAccess,
  };
}
