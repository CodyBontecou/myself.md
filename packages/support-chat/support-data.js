import { errorJSON } from './errors.js';
import { useCallback, useEffect, useRef, useState } from 'react';
/** @typedef {import('./support-client.js').SupportDataAdapter} SupportDataAdapter */
/** @param {import('./support-client.js').SupportConversation|null} conversation
 * @param {SupportDataAdapter|undefined} adapter @param {()=>string} newId
 * @param {(action:string,input:Record<string,unknown>)=>Promise<boolean>} mutate */
export function useSupportData(conversation, adapter, newId, mutate) {
  const [preview, setPreview] = useState(
    /** @type {(import('./support-client.js').DataPreview & {id:string,requestId:string|null,conversationId:string,generation:number})|null} */ (
      null
    ),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const identity = `${conversation?.id}:${conversation?.generation}:${conversation?.status}`;
  const invalidate = useCallback(() => {
    version.current++;
  }, []);
  useEffect(() => {
    const scope = { identity, adapter };
    const generation = ++version.current;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !scope.identity || generation !== version.current) return;
      setPreview(null);
      setError('');
      setBusy(false);
      return undefined;
    });
    return () => {
      cancelled = true;
      invalidate();
    };
  }, [identity, adapter, invalidate]);
  /** @param {import('./support-client.js').SupportDataRequest|null} request */
  async function prepare(request) {
    if (!adapter || !conversation || conversation.status !== 'open') return;
    const generation = ++version.current;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const local = await adapter.collect(request);
      if (generation === version.current)
        setPreview({
          ...local,
          id: newId(),
          requestId: request?.id ?? null,
          conversationId: conversation.id,
          generation: conversation.generation,
        });
    } catch (reason) {
      if (generation === version.current) setError(errorJSON(reason));
    } finally {
      if (generation === version.current) setBusy(false);
    }
  }
  /** @param {string} content */
  function edit(content) {
    setPreview((current) => (current ? { ...current, id: newId(), content } : null));
  }
  async function share() {
    if (!preview || !adapter || busy) return;
    const snapshot = preview,
      generation = version.current;
    setBusy(true);
    setError('');
    try {
      const digest = await adapter.digest(snapshot.content);
      if (generation !== version.current) return;
      const saved = await mutate('share', { ...snapshot, digest, accepted: true });
      if (saved && generation === version.current) setPreview(null);
    } catch (reason) {
      if (generation === version.current) setError(errorJSON(reason));
    } finally {
      if (generation === version.current) setBusy(false);
    }
  }
  function cancel() {
    version.current++;
    setPreview(null);
    setBusy(false);
    setError('');
  }
  return { preview, error, busy, prepare, edit, share, cancel };
}
