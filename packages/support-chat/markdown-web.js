import { markdownEntries, markdownTokens, markdownURL } from './markdown.js';

/** @param {{text:string}} props */
export function WebMarkdown({ text }) {
  return (
    <div className="space-y-3 break-words text-base leading-7">{nodes(markdownTokens(text))}</div>
  );
}

/** @param {import('marked').Token[]} tokens @returns {import('react').ReactNode} */
function nodes(tokens) {
  return markdownEntries(tokens, (token) => token.raw).map(({ value: token, key }) => {
    const children =
      'tokens' in token && token.tokens
        ? nodes(token.tokens)
        : 'text' in token
          ? token.text
          : token.raw;
    switch (token.type) {
      case 'space':
      case 'def':
        return null;
      case 'paragraph':
        return (
          <p key={key} className="whitespace-pre-wrap">
            {children}
          </p>
        );
      case 'heading':
        return (
          <p key={key} role="heading" aria-level={token.depth} className="font-semibold text-lg">
            {children}
          </p>
        );
      case 'strong':
        return <strong key={key}>{children}</strong>;
      case 'em':
        return <em key={key}>{children}</em>;
      case 'del':
        return <del key={key}>{children}</del>;
      case 'br':
        return <br key={key} />;
      case 'codespan':
        return (
          <code key={key} className="rounded bg-muted px-1 font-mono text-sm">
            {token.text}
          </code>
        );
      case 'code':
        return (
          <pre key={key} className="overflow-x-auto rounded-xl bg-muted p-4 text-sm">
            <code>{token.text}</code>
          </pre>
        );
      case 'blockquote':
        return (
          <blockquote key={key} className="space-y-3 border-l-2 pl-4 text-muted-foreground">
            {children}
          </blockquote>
        );
      case 'hr':
        return <hr key={key} />;
      case 'link': {
        const href = markdownURL(token.href);
        return href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {children}
          </a>
        ) : (
          <span key={key}>{children}</span>
        );
      }
      case 'image': {
        const src = markdownURL(token.href, true);
        return src ? (
          <img
            key={key}
            src={src}
            alt={token.text}
            loading="lazy"
            className="my-3 h-auto max-h-[420px] max-w-full rounded-xl object-contain"
          />
        ) : (
          <span key={key}>{token.text}</span>
        );
      }
      case 'list': {
        const items = markdownEntries(
          /** @type {import('marked').Tokens.ListItem[]} */ (token.items),
          (item) => item.raw,
        ).map(({ value: item, key: itemKey }) => (
          <li key={itemKey}>
            {item.task ? `${item.checked ? '☑' : '☐'} ` : ''}
            {nodes(item.tokens)}
          </li>
        ));
        return token.ordered ? (
          <ol key={key} start={Number(token.start) || 1} className="list-decimal space-y-2 pl-6">
            {items}
          </ol>
        ) : (
          <ul key={key} className="list-disc space-y-2 pl-6">
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={key} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {markdownEntries(
                    /** @type {import('marked').Tokens.TableCell[]} */ (token.header),
                    (cell) => cell.text,
                  ).map(({ value: cell, key: cellKey }) => (
                    <th key={cellKey} className="border p-2 text-left">
                      {nodes(cell.tokens)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {markdownEntries(
                  /** @type {import('marked').Tokens.TableCell[][]} */ (token.rows),
                  (row) => row.map((cell) => cell.text).join('|'),
                ).map(({ value: row, key: rowKey }) => (
                  <tr key={rowKey}>
                    {markdownEntries(row, (cell) => cell.text).map(
                      ({ value: cell, key: cellKey }) => (
                        <td key={cellKey} className="border p-2">
                          {nodes(cell.tokens)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return <span key={key}>{children}</span>;
    }
  });
}
