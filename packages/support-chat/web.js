import { errorJSON } from './errors.js';
import { useEffect, useId, useRef } from 'react';
import { supportNotice } from './protocol.js';
import { useSupport } from './useSupport.js';
/** @param {{request:import('./protocol.js').SupportRequest,active?:boolean,Button:import('react').ComponentType<import('react').ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'outline'}>,unavailableContent?:import('react').ReactNode}} props */
export function WebChat({
  request,
  active = true,
  Button,
  unavailableContent = 'Support chat is not configured yet.',
}) {
  const chat = useSupport(request, active);
  const composerId = useId();
  const viewport = useRef(/** @type {HTMLDivElement|null} */ (null));
  const atBottom = useRef(true);
  const latest = chat.state?.messages.at(-1)?.id;
  useEffect(() => {
    if (latest && atBottom.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [latest]);
  const composer = useRef(/** @type {HTMLTextAreaElement|null} */ (null));
  const unavailable = chat.state && !chat.state.available;
  return (
    <section
      className="mx-4 flex max-w-3xl flex-col gap-4 lg:mx-6"
      aria-label="Support conversation"
    >
      <p className="text-sm text-muted-foreground">{supportNotice}</p>
      {unavailable && <p role="status">{unavailableContent}</p>}
      {chat.error && (
        <div role="alert" className="rounded-lg border p-4">
          {errorJSON(chat.error)}{' '}
          <Button variant="outline" onClick={() => void chat.refresh()}>
            Retry
          </Button>
        </div>
      )}
      {chat.state?.warning && <p role="status">{chat.state.warning}</p>}
      {!chat.state && !chat.error && <p role="status">Loading conversation…</p>}
      {chat.state?.hasMore && (
        <Button variant="outline" disabled={chat.busy} onClick={() => void chat.loadOlder()}>
          Load earlier messages
        </Button>
      )}
      <div
        ref={viewport}
        onScroll={(event) => {
          const element = event.currentTarget;
          atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        role="log"
        aria-label="Messages"
        className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto rounded-xl border p-4"
      >
        {chat.state && !chat.state.messages.length && (
          <p className="py-6 text-sm text-muted-foreground">
            How can we help? Send a message to start a conversation with support.
          </p>
        )}
        {chat.state?.messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[90%] rounded-xl px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-muted'}`}
          >
            <p className="mb-1 text-xs opacity-75">{message.role === 'user' ? 'You' : 'Support'}</p>
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
            <p className="mt-2 text-xs opacity-75">
              {new Date(message.createdAt).toLocaleString()} ·{' '}
              {message.role === 'user'
                ? message.delivery === 'cancelled'
                  ? 'Cancelled after access was revoked'
                  : message.delivery === 'queued'
                    ? 'Waiting to reach support'
                    : 'Sent to support'
                : 'Reply'}
            </p>
          </article>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = composer.current?.value.trim() ?? '';
          if (text)
            void chat.send(text).then((saved) => {
              if (saved && composer.current?.value.trim() === text) composer.current.value = '';
              return undefined;
            });
        }}
      >
        <label htmlFor={composerId} className="text-sm font-medium">
          Your message
        </label>
        <textarea
          ref={composer}
          id={composerId}
          maxLength={1800}
          rows={3}
          required
          disabled={chat.busy || !chat.state?.available}
          className="w-full resize-y rounded-lg border bg-background p-3 text-base"
          placeholder="Tell us what you need help with…"
        />
        <Button className="self-end" disabled={chat.busy || !chat.state?.available} type="submit">
          {chat.busy ? 'Sending…' : 'Send message'}
        </Button>
      </form>
      {chat.state && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chat.state.agentAccess}
            disabled={chat.busy}
            onChange={(event) => void chat.setAgentAccess(event.target.checked)}
          />
          Allow my connected agents to read and send support messages
        </label>
      )}
    </section>
  );
}

export { WebSupport } from './support-web.js';
