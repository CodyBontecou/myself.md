import { errorJSON } from './errors.js';
import { useEffect, useId, useRef, useState } from 'react';
import { useSupportInbox } from './support-client.js';
import { useSupportData } from './support-data.js';
/** @param {{Button?:import('react').ComponentType<import('react').ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'outline'|'ghost'}>,request:import('./support-client.js').SupportClient,active?:boolean,data?:import('./support-client.js').SupportDataAdapter}} props */
export function WebSupport({ request, active = true, data, Button = SupportButton }) {
  const chat = useSupportInbox(request, active);
  const titleId = useId(),
    messageId = useId(),
    previewId = useId();
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const c = chat.conversation;
  const logs = useSupportData(c, data, () => crypto.randomUUID(), chat.mutate);
  const disabled = chat.busy || logs.busy;
  const viewport = useRef(/** @type {HTMLDivElement|null} */ (null));
  const atBottom = useRef(true);
  const latest = c?.messages.at(-1)?.id;
  useEffect(() => {
    if (latest && viewport.current && atBottom.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [latest]);
  return (
    <section
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 lg:px-6"
      aria-label="Support inbox"
    >
      <header className="flex items-center justify-between border-b py-4">
        <h2 className="text-sm font-medium">
          Isobot <span className="ml-2 text-muted-foreground">Support</span>
        </h2>
        <Button
          variant="ghost"
          type="button"
          disabled={disabled}
          onClick={() => void chat.refresh()}
        >
          Refresh
        </Button>
      </header>
      {chat.error && (
        <pre role="alert" className="whitespace-pre-wrap break-words font-mono text-xs">
          {errorJSON(chat.error)}
        </pre>
      )}
      {logs.error && (
        <pre role="alert" className="whitespace-pre-wrap break-words font-mono text-xs">
          {errorJSON(logs.error)}
        </pre>
      )}
      {!c ? (
        <>
          <div className="space-y-2 py-2">
            <h3 className="text-xl font-semibold tracking-tight">How can we help?</h3>
            <p className="text-sm text-muted-foreground">
              Ask Isobot a question or report a problem. Staff can join the conversation.
            </p>
          </div>
          <form
            className="rounded-xl border bg-background p-3 focus-within:ring-2 focus-within:ring-ring/30"
            onSubmit={(event) => {
              event.preventDefault();
              void chat.create(crypto.randomUUID(), title).then((saved) => {
                if (saved) {
                  setTitle('');
                  setDraft('');
                }
                return undefined;
              });
            }}
          >
            <label className="sr-only" htmlFor={titleId}>
              Conversation title
            </label>
            <textarea
              rows={3}
              placeholder="What do you need help with?"
              disabled={disabled}
              id={titleId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              className="w-full resize-none border-0 bg-transparent p-1 text-base outline-none placeholder:text-muted-foreground"
            />
            <Button
              className="mt-2 ml-auto flex"
              disabled={disabled || !title.trim()}
              type="submit"
            >
              New conversation
            </Button>
          </form>
          {chat.conversations.map((item) => (
            <Button
              variant="ghost"
              key={item.id}
              disabled={disabled}
              type="button"
              className="h-auto w-full justify-start rounded-none border-0 border-b bg-transparent px-0 py-3 text-left shadow-none"
              onClick={() => {
                setDraft('');
                atBottom.current = true;
                void chat.open(item.id);
              }}
            >
              {item.title} · {item.status}
              {item.unreadCount ? ` · ${item.unreadCount} unread` : ''}
            </Button>
          ))}
        </>
      ) : (
        <>
          <Button
            className="self-start px-0"
            variant="ghost"
            type="button"
            disabled={disabled}
            onClick={() => {
              logs.cancel();
              setDraft('');
              void chat.open('');
            }}
          >
            Back to conversations
          </Button>
          <h3 className="text-lg font-medium">
            {c.title} · {c.status}
          </h3>
          {c.hasMore && (
            <Button
              variant="ghost"
              disabled={disabled}
              type="button"
              onClick={() => void chat.loadOlder()}
            >
              Load earlier messages
            </Button>
          )}
          <div
            ref={viewport}
            onScroll={(event) => {
              const element = event.currentTarget;
              atBottom.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            }}
            role="log"
            aria-label="Support messages"
            className="flex min-h-48 max-h-[55vh] flex-col divide-y overflow-y-auto"
          >
            {c.messages.map((message) => (
              <article key={message.id} className="w-full py-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  {message.author === 'pi'
                    ? 'Isobot'
                    : message.author === 'staff'
                      ? 'Support'
                      : 'You'}{' '}
                  · {new Date(message.createdAt).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap break-words text-base leading-7">
                  {message.text}
                </p>
              </article>
            ))}
          </div>
          {c.status === 'open' && (
            <form
              className="sticky bottom-4 z-10 rounded-xl border bg-background p-3 focus-within:ring-2 focus-within:ring-ring/30"
              onSubmit={(event) => {
                event.preventDefault();
                const value = draft.trim();
                if (!disabled && value)
                  void chat.send(value, crypto.randomUUID()).then((saved) => {
                    if (saved) setDraft('');
                    return undefined;
                  });
              }}
            >
              <label className="sr-only" htmlFor={messageId}>
                Your message
              </label>
              <textarea
                id={messageId}
                value={draft}
                maxLength={1800}
                rows={3}
                placeholder="Message Isobot…"
                required
                disabled={disabled}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none border-0 bg-transparent p-1 text-base outline-none placeholder:text-muted-foreground"
              />
              <Button
                className="mt-2 ml-auto flex"
                type="submit"
                disabled={disabled || !draft.trim()}
              >
                Send
              </Button>
            </form>
          )}
          {c.requests.map((r) => (
            <article key={r.id} className="rounded-lg border p-4" aria-label="Data request">
              <p>{r.reason}</p>
              <p>
                {r.selector.category} · {new Date(r.selector.from).toLocaleString()} to{' '}
                {new Date(r.selector.to).toLocaleString()} · {r.status}
              </p>
              {r.status === 'pending' && (
                <>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={disabled || !data}
                    onClick={() => void logs.prepare(r)}
                  >
                    Review requested data
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={disabled}
                    onClick={() => void chat.mutate('decline', { requestId: r.id })}
                  >
                    Decline
                  </Button>
                </>
              )}
            </article>
          ))}
          {c.attachments.map((a) => (
            <p key={a.id}>
              {a.category} attachment · {a.removed ? 'Removed when archived' : 'Shared'}
            </p>
          ))}
          {logs.preview && (
            <div className="rounded-lg border p-4">
              <p>
                Review this snapshot. Remove any entries you do not want to share. Accepted data
                will be processed by Isobot and its model provider.
              </p>
              <label htmlFor={previewId}>Data preview</label>
              <textarea
                id={previewId}
                value={logs.preview.content}
                maxLength={128000}
                rows={12}
                disabled={disabled}
                onChange={(event) => logs.edit(event.target.value)}
                className="w-full rounded-lg border bg-background p-3 font-mono text-sm"
              />
              <Button
                variant="ghost"
                disabled={disabled}
                type="button"
                onClick={() => void logs.share()}
              >
                Accept and share this snapshot
              </Button>
              <Button variant="ghost" disabled={disabled} type="button" onClick={logs.cancel}>
                Cancel
              </Button>
            </div>
          )}
          <details className="border-t py-3 text-sm">
            <summary className="cursor-pointer font-medium">Conversation details</summary>
            <div className="mt-3 flex flex-col items-start gap-2">
              <Button
                variant="ghost"
                disabled={disabled}
                type="button"
                onClick={() =>
                  void chat.mutate('readCursor', { readThrough: c.messages.at(-1)?.sequence ?? 0 })
                }
              >
                Mark as read
              </Button>
              {c.status === 'open' ? (
                <>
                  {data && (
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={disabled}
                      onClick={() => void logs.prepare(null)}
                    >
                      Attach recent logs
                    </Button>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={c.agentAccess}
                      disabled={disabled}
                      onChange={(event) =>
                        void chat.mutate('update', { agentAccess: event.target.checked })
                      }
                    />{' '}
                    Allow connected agents to access this conversation
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={c.autoReply}
                      disabled={disabled}
                      onChange={(event) =>
                        void chat.mutate('update', { autoReply: event.target.checked })
                      }
                    />{' '}
                    Isobot replies automatically
                  </label>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={disabled}
                    onClick={() => void chat.mutate('update', { status: 'resolved' })}
                  >
                    Resolve conversation
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  type="button"
                  disabled={disabled}
                  onClick={() => void chat.mutate('update', { status: 'open' })}
                >
                  Reopen conversation
                </Button>
              )}
              {c.status !== 'archived' && (
                <Button
                  variant="ghost"
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Archive this conversation? Text stays; attachments are deleted.',
                      )
                    )
                      void chat.mutate('archive');
                  }}
                >
                  Archive conversation
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={disabled}
                type="button"
                onClick={() => {
                  if (window.confirm('Delete this conversation and its attachments permanently?'))
                    void chat.mutate('delete');
                }}
              >
                Delete conversation
              </Button>
              {c.jobs?.map((job) => (
                <p key={job.id}>
                  Implementation task · {job.status}
                  {job.result ? ` · ${job.result}` : ''}
                </p>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

/** Standalone fallback; hosts can supply their shadcn Button.
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'outline'|'ghost'}} props */
function SupportButton({ className = '', variant = 'outline', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg ${variant === 'ghost' ? 'border border-transparent' : 'border'} bg-background px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
