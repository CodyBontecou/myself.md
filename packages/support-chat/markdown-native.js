import { useState } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { markdownEntries, markdownTokens, markdownURL } from './markdown.js';

/** @typedef {{text:string,subtle?:string,surface:string,border:string}} Colors */
/** @param {{text:string,colors:Colors}} props */
export function NativeMarkdown({ text, colors }) {
  return <View style={styles.blocks}>{blocks(markdownTokens(text), colors)}</View>;
}

/** @param {import('marked').Token[]} tokens @param {Colors} colors @returns {import('react').ReactNode} */
function inline(tokens, colors) {
  return markdownEntries(tokens, (token) => token.raw).map(({ value: token, key }) => {
    const children =
      'tokens' in token && token.tokens
        ? inline(token.tokens, colors)
        : 'text' in token
          ? token.text
          : token.raw;
    switch (token.type) {
      case 'strong':
        return (
          <Text key={key} style={styles.bold}>
            {children}
          </Text>
        );
      case 'em':
        return (
          <Text key={key} style={styles.italic}>
            {children}
          </Text>
        );
      case 'del':
        return (
          <Text key={key} style={styles.deleted}>
            {children}
          </Text>
        );
      case 'br':
        return '\n';
      case 'codespan':
        return (
          <Text
            key={key}
            style={[styles.mono, { backgroundColor: colors.subtle ?? colors.surface }]}
          >
            {token.text}
          </Text>
        );
      case 'link': {
        const url = markdownURL(token.href);
        return (
          <Text
            key={key}
            accessibilityRole={url ? 'link' : 'text'}
            style={url ? styles.link : undefined}
            onPress={
              url
                ? () => {
                    void Linking.openURL(url).catch(() => undefined);
                  }
                : undefined
            }
          >
            {children}
          </Text>
        );
      }
      case 'image':
        return token.text;
      default:
        return children;
    }
  });
}

/** @param {import('marked').Token[]} tokens @param {Colors} colors @returns {import('react').ReactNode} */
function blocks(tokens, colors) {
  return markdownEntries(tokens, (token) => token.raw).map(({ value: token, key }) => {
    const color = { color: colors.text };
    switch (token.type) {
      case 'space':
      case 'def':
        return null;
      case 'paragraph':
      case 'text':
      case 'heading': {
        const parts = token.tokens ?? [token];
        /** @type {import('marked').Token[][]} */
        const runs = [];
        for (const part of parts) {
          if (part.type === 'image' || !runs.length || runs.at(-1)?.[0]?.type === 'image')
            runs.push([part]);
          else runs.at(-1)?.push(part);
        }
        return (
          <View key={key} style={styles.blocks}>
            {markdownEntries(runs, (run) => run.map((part) => part.raw).join('')).map(
              ({ value: run, key: runKey }) =>
                run[0]?.type === 'image' ? (
                  <MarkdownImage
                    key={runKey}
                    href={run[0].href}
                    alt={run[0].text}
                    colors={colors}
                  />
                ) : (
                  <Text
                    key={runKey}
                    selectable
                    style={[styles.body, color, token.type === 'heading' && styles.heading]}
                  >
                    {inline(run, colors)}
                  </Text>
                ),
            )}
          </View>
        );
      }
      case 'code':
        return (
          <ScrollView
            key={key}
            horizontal
            style={[styles.codeBox, { backgroundColor: colors.subtle ?? colors.surface }]}
            contentContainerStyle={styles.codePadding}
          >
            <Text selectable style={[styles.body, styles.code, color]}>
              {token.text}
            </Text>
          </ScrollView>
        );
      case 'blockquote':
        return (
          <View key={key} style={[styles.quote, { borderColor: colors.border }]}>
            {blocks(token.tokens ?? [], colors)}
          </View>
        );
      case 'hr':
        return <View key={key} style={[styles.rule, { backgroundColor: colors.border }]} />;
      case 'list':
        return (
          <View key={key} style={styles.list}>
            {markdownEntries(
              /** @type {import('marked').Tokens.ListItem[]} */ (token.items),
              (item) => item.raw,
            ).map(({ value: item, key: itemKey }, index) => (
              <View key={itemKey} style={styles.listRow}>
                <Text style={[styles.body, color]}>
                  {item.task
                    ? item.checked
                      ? '☑'
                      : '☐'
                    : token.ordered
                      ? `${Number(token.start) + index}.`
                      : '•'}
                </Text>
                <View style={styles.listContent}>{blocks(item.tokens, colors)}</View>
              </View>
            ))}
          </View>
        );
      case 'table': {
        const rows = /** @type {import('marked').Tokens.TableCell[][]} */ ([
          token.header,
          ...token.rows,
        ]);
        return (
          <ScrollView key={key} horizontal>
            <View>
              {markdownEntries(rows, (row) => row.map((cell) => cell.text).join('|')).map(
                ({ value: row, key: rowKey }, index) => (
                  <View key={rowKey} style={styles.tableRow}>
                    {markdownEntries(row, (cell) => cell.text).map(
                      ({ value: cell, key: cellKey }) => (
                        <Text
                          key={cellKey}
                          selectable
                          style={[
                            styles.body,
                            styles.cell,
                            color,
                            { borderColor: colors.border },
                            index === 0 && styles.bold,
                          ]}
                        >
                          {inline(cell.tokens, colors)}
                        </Text>
                      ),
                    )}
                  </View>
                ),
              )}
            </View>
          </ScrollView>
        );
      }
      default:
        return (
          <Text key={key} selectable style={[styles.body, color]}>
            {'text' in token ? token.text : token.raw}
          </Text>
        );
    }
  });
}

/** @param {{href:string,alt:string,colors:Colors}} props */
function MarkdownImage({ href, alt, colors }) {
  const url = markdownURL(href, true);
  const { width } = useWindowDimensions();
  const [ratio, setRatio] = useState(1.5);
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <Image
      accessibilityLabel={alt || 'Image from support'}
      source={{ uri: url }}
      resizeMode="contain"
      onError={() => setFailed(true)}
      onLoad={({ nativeEvent }) =>
        setRatio(nativeEvent.source.width / nativeEvent.source.height || 1.5)
      }
      style={[styles.image, { width: Math.min(width - 40, 600), aspectRatio: ratio }]}
    />
  ) : (
    <Text selectable style={[styles.body, { color: colors.text }]}>
      {alt || 'Image unavailable'}
    </Text>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 12 },
  body: { fontSize: 16, lineHeight: 26 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  deleted: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  mono: { fontFamily: 'monospace' },
  heading: { fontWeight: '700', fontSize: 20, lineHeight: 28 },
  codeBox: { borderRadius: 12 },
  codePadding: { padding: 14 },
  code: { fontFamily: 'monospace', fontSize: 14 },
  quote: { borderLeftWidth: 2, paddingLeft: 14, gap: 12 },
  rule: { height: 1 },
  list: { gap: 8 },
  listRow: { flexDirection: 'row', gap: 8 },
  listContent: { flex: 1, gap: 8 },
  tableRow: { flexDirection: 'row' },
  cell: { width: 180, padding: 8, borderWidth: 1 },
  image: { maxWidth: '100%', maxHeight: 420, borderRadius: 12 },
});
