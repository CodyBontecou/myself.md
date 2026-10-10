import { WebMarkdown } from './markdown-web.js';
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
  const [nearBottom, setNearBottom] = useState(true);
  const latest = c?.messages.at(-1)?.id;
  const read = useRef('');
  useEffect(() => {
    const sequence = c?.messages.at(-1)?.sequence ?? 0;
    const cursor = `${c?.id}:${sequence}`;
    if (
      active &&
      c &&
      sequence > c.readThrough &&
      nearBottom &&
      !chat.busy &&
      read.current !== cursor
    ) {
      read.current = cursor;
      void chat.mutate('readCursor', { readThrough: sequence }).then((saved) => {
        if (!saved) read.current = '';
        return saved;
      });
    }
  }, [active, c, chat, nearBottom]);
  useEffect(() => {
    if (latest && viewport.current && atBottom.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [latest]);
  return (
    <section
      className="mx-auto flex h-[calc(100dvh-7rem)] min-h-0 w-full max-w-3xl flex-col px-4 lg:px-6"
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
      <div
        ref={viewport}
        onScroll={(event) => {
          if (!c) return;
          const element = event.currentTarget;
          atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          setNearBottom(atBottom.current);
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4"
      >
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
            {chat.conversations.map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                disabled={disabled}
                type="button"
                className="h-auto min-h-14 w-full justify-between whitespace-normal rounded-xl border-0 bg-transparent px-2 py-3 text-left shadow-none"
                onClick={() => {
                  setDraft('');
                  atBottom.current = true;
                  setNearBottom(true);
                  void chat.open(item.id);
                }}
              >
                <span>{item.title}</span>
                {!!item.unreadCount && (
                  <span
                    aria-label="New message"
                    className="h-2 w-2 shrink-0 rounded-full bg-foreground"
                  />
                )}
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
            <h3 className="text-lg font-medium">{c.title}</h3>
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
            <div role="log" aria-label="Support messages" className="flex flex-col gap-5">
              {c.messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.author === 'user'
                      ? 'ml-auto max-w-[86%] rounded-3xl bg-muted px-5 py-3'
                      : 'w-full py-2'
                  }
                >
                  {message.author === 'staff' && (
                    <p className="mb-2 text-xs text-muted-foreground">Support</p>
                  )}
                  {message.author === 'user' ? (
                    <p className="whitespace-pre-wrap break-words text-base leading-7">
                      {message.text}
                    </p>
                  ) : (
                    <WebMarkdown text={message.text} />
                  )}
                </article>
              ))}
            </div>
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
                    void chat.mutate('readCursor', {
                      readThrough: c.messages.at(-1)?.sequence ?? 0,
                    })
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
      </div>
      {(!c || c.status === 'open') && (
        <form
          className="mb-4 flex shrink-0 items-end gap-2 rounded-3xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30"
          onSubmit={(event) => {
            event.preventDefault();
            const value = (c ? draft : title).trim();
            if (disabled || !value) return;
            const pending = c
              ? chat.send(value, crypto.randomUUID())
              : chat.create(crypto.randomUUID(), value);
            void pending.then((saved) => {
              if (saved) {
                setDraft('');
                setTitle('');
              }
              return saved;
            });
          }}
        >
          {c && data && (
            <Button
              variant="ghost"
              type="button"
              aria-label="Attach recent logs"
              disabled={disabled}
              onClick={() => void logs.prepare(null)}
              className="h-11 w-11 shrink-0 rounded-full"
            >
              +
            </Button>
          )}
          <label className="sr-only" htmlFor={c ? messageId : titleId}>
            {c ? 'Your message' : 'Conversation title'}
          </label>
          <textarea
            id={c ? messageId : titleId}
            value={c ? draft : title}
            rows={1}
            maxLength={c ? 1800 : 120}
            required
            disabled={disabled}
            placeholder={c ? 'Message Isobot…' : 'Ask Isobot…'}
            onChange={(event) => (c ? setDraft(event.target.value) : setTitle(event.target.value))}
            className="max-h-36 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-3 text-base outline-none"
          />
          <Button
            type="submit"
            aria-label={c ? 'Send' : 'New conversation'}
            disabled={disabled || !(c ? draft : title).trim()}
            className="h-11 w-11 shrink-0 rounded-full"
          >
            ↑
          </Button>
        </form>
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
