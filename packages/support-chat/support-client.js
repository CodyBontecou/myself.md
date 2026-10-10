import { errorJSON } from './errors.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sorted } from './collections.js';
/** @typedef {{id:string,title:string,status:string,unreadCount:number,updatedAt:string}} SupportSummary */
/** @typedef {{id:string,reason:string,selector:{category:string,from:number,to:number,operations:string[],issuesOnly:boolean},status:string,expiresAt:number}} SupportDataRequest */
/** @typedef {{id:string,title:string,status:string,generation:number,agentAccess:boolean,autoReply:boolean,readThrough:number,messages:{id:string,sequence:number,author:'user'|'pi'|'staff',text:string,createdAt:string}[],requests:SupportDataRequest[],attachments:{id:string,category:string,removed:boolean}[],hasMore:boolean,before:number|null,jobs?:{id:string,status:string,result:string|null}[]}} SupportConversation */
/** @typedef {(action:string,input?:Record<string,unknown>)=>Promise<unknown>} SupportClient */
/** @typedef {{category:string,content:string,capturedAt:number}} DataPreview */
/** @typedef {{collect:(request:SupportDataRequest|null)=>Promise<DataPreview>,digest:(content:string)=>Promise<string>}} SupportDataAdapter */

/** Adapt the host's owner-authenticated transport to the versioned isobot service.
 * @param {(path:string,options:{method:string,body?:string})=>Promise<unknown>} transport
 * @param {string} [endpoint] @returns {SupportClient} */
export function createSupportClient(transport, endpoint = '/api/support/v1') {
  return (action, input = {}) =>
    transport(endpoint, { method: 'POST', body: JSON.stringify({ ...input, action }) });
}

/** Inbox and conversation state share one owner-scoped transport. Remount on account changes.
 * @param {SupportClient} request @param {boolean} [active] @param {string} [initialConversationId] */
export function useSupportInbox(request, active = true, initialConversationId = '') {
  const [conversations, setConversations] = useState(/** @type {SupportSummary[]} */ ([]));
  const [conversation, setConversation] = useState(/** @type {SupportConversation|null} */ (null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const createRetry = useRef(/** @type {{id:string,title:string}|null} */ (null));
  const selected = useRef('');
  const epoch = useRef(0);
  const working = useRef(false);
  const alive = useRef(true);
  const retry = useRef(/** @type {{id:string,text:string,conversationId:string}|null} */ (null));
  /** @param {SupportConversation} next @param {boolean} [older] */
  const merge = useCallback((/** @type {SupportConversation} */ next, older = false) => {
    setConversation((previous) => {
      if (!previous || previous.id !== next.id || previous.generation !== next.generation)
        return next;
      const messages = new Map(previous.messages.map((m) => [m.id, m]));
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
    if (working.current) return;
    working.current = true;
    const version = epoch.current;
    try {
      const inbox = /** @type {{conversations:SupportSummary[]}} */ (await request('list'));
      if (alive.current && version === epoch.current) setConversations(inbox.conversations);
      if (selected.current) {
        const next = /** @type {SupportConversation} */ (
          await request('read', { conversationId: selected.current })
        );
        if (alive.current && version === epoch.current) merge(next);
      }
      if (alive.current && version === epoch.current) setError('');
    } catch (reason) {
      if (alive.current && version === epoch.current) setError(errorJSON(reason));
    } finally {
      working.current = false;
    }
  }, [request, merge]);
  const invalidate = useCallback(() => {
    alive.current = false;
    epoch.current++;
  }, []);
  useEffect(() => {
    const scope = { request, initialConversationId };
    alive.current = true;
    epoch.current++;
    selected.current = scope.initialConversationId;
    retry.current = null;
    createRetry.current = null;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !scope.request) return;
      setConversation(null);
      setConversations([]);
      setError('');
      return undefined;
    });
    return () => {
      cancelled = true;
      invalidate();
    };
  }, [request, initialConversationId, invalidate]);
  useEffect(() => {
    if (!active) return undefined;
    void Promise.resolve().then(refresh);
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [active, refresh]);
  /** @param {string} id */
  async function open(id) {
    const version = ++epoch.current;
    selected.current = id;
    retry.current = null;
    setConversation(null);
    setError('');
    if (!id) return;
    try {
      const next = /** @type {SupportConversation} */ (
        await request('read', { conversationId: id })
      );
      if (alive.current && version === epoch.current) merge(next);
    } catch (reason) {
      if (alive.current && version === epoch.current) setError(errorJSON(reason));
    }
  }
  /** @param {string} action @param {Record<string,unknown>} [input] */
  async function mutate(action, input = {}) {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setError('');
    const version = epoch.current;
    try {
      const next = await request(action, {
        ...(selected.current ? { conversationId: selected.current } : {}),
        ...input,
      });
      if (!alive.current || version !== epoch.current) return false;
      if (next && typeof next === 'object' && 'messages' in next)
        merge(/** @type {SupportConversation} */ (next), action === 'read');
      if (action === 'archive' || action === 'delete') {
        selected.current = '';
        epoch.current++;
        setConversation(null);
        retry.current = null;
      }
      return true;
    } catch (reason) {
      if (alive.current && version === epoch.current) setError(errorJSON(reason));
      return false;
    } finally {
      working.current = false;
      if (alive.current) {
        setBusy(false);
        void refresh();
      }
    }
  }
  /** @param {string} value @param {string} id */
  async function send(value, id) {
    if (retry.current?.text !== value || retry.current.conversationId !== selected.current)
      retry.current = { id, text: value, conversationId: selected.current };
    const saved = await mutate('send', retry.current);
    if (saved) retry.current = null;
    return saved;
  }
  /** @param {string} id @param {string} title */
  async function create(id, title) {
    if (createRetry.current?.title !== title) createRetry.current = { id, title };
    const pending = createRetry.current;
    const saved = await mutate('create', pending);
    if (saved) {
      createRetry.current = null;
      await open(pending.id);
    }
    return saved;
  }
  return {
    conversations,
    conversation,
    error,
    busy,
    refresh,
    open,
    create,
    send,
    mutate,
    loadOlder: () =>
      conversation?.hasMore
        ? mutate('read', { before: conversation.before })
        : Promise.resolve(false),
  };
}
