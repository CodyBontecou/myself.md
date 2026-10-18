import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Group, Icon, Row } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';

/** @param {{version:ReturnType<typeof import('../core/export-schemas.js').exportSchemas>['versions'][number]}} props */
export default function SchemaViewer({ version }) {
  const [message, setMessage] = useState('');
  const sections = [
    { id: 'definition', title: 'JSON schema', value: version.definition },
    { id: 'jsonl', title: 'JSONL record schema', value: version.jsonlRecordDefinition },
    { id: 'example', title: 'Example export', value: version.example },
  ];
  /** @param {unknown} value @param {string} title */
  async function copy(value, title) {
    try {
      const copied = await Clipboard.setStringAsync(JSON.stringify(value, null, 2));
      setMessage(copied ? `${title} copied.` : 'Could not copy. Try again.');
    } catch {
      setMessage('Could not copy. Try again.');
    }
  }
  return (
    <View style={styles.viewer}>
      <Group compact>
        <Row
          compact
          title="Read schema documentation"
          testID="export-schema-docs"
          selected={false}
          trailing={<Icon name="open-outline" />}
          onPress={() => {
            void Linking.openURL(version.documentationUrl).catch(() =>
              setMessage('Could not open documentation. Visit ' + version.documentationUrl),
            );
          }}
        />
        <Row
          compact
          title="Copy complete schema and example"
          testID="export-schema-copy"
          selected={false}
          trailing={<Icon name="copy-outline" />}
          onPress={() =>
            void copy(
              {
                definition: version.definition,
                jsonlRecordDefinition: version.jsonlRecordDefinition,
                example: version.example,
              },
              'Schema and example',
            )
          }
        />
      </Group>
      {message ? (
        <Copy variant="caption" accessibilityRole="alert">
          {message}
        </Copy>
      ) : null}
      <Copy variant="caption" muted>
        Tap objects and arrays to expand or collapse them.
      </Copy>
      {sections.map(({ id, title, value }) => (
        <View key={id} style={styles.section}>
          <Row
            compact
            title={`Copy ${title}`}
            testID={`export-schema-copy-${id}`}
            selected={false}
            trailing={<Icon name="copy-outline" />}
            onPress={() => void copy(value, title)}
          />
          <JsonNode key={`${version.id}-${id}`} label={title} value={value} path={id} depth={0} />
        </View>
      ))}
    </View>
  );
}

/** @param {{label:string,value:unknown,path:string,depth:number}} props */
function JsonNode({ label, value, path, depth }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(depth === 0);
  const container = value !== null && typeof value === 'object';
  const array = Array.isArray(value);
  const entries = container ? Object.entries(value) : [];
  const expandable = entries.length > 0;
  const summary = container
    ? `${array ? '[' : '{'}${expandable ? ` ${entries.length} ${array ? (entries.length === 1 ? 'item' : 'items') : entries.length === 1 ? 'key' : 'keys'} ` : ''}${array ? ']' : '}'}`
    : JSON.stringify(value);
  const text = `${label}: ${summary}`;
  return (
    <View>
      {expandable ? (
        <Pressable
          testID={`export-schema-node-${path}`}
          accessibilityRole="button"
          accessibilityLabel={text}
          accessibilityHint="Expand or collapse this JSON value"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => [styles.node, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.secondary}
          />
          <Copy variant="caption" style={styles.code}>
            {text}
          </Copy>
        </Pressable>
      ) : (
        <View style={styles.leaf}>
          <Copy variant="caption" selectable style={styles.code}>
            {text}
          </Copy>
        </View>
      )}
      {expanded && expandable && (
        <View style={[styles.children, { borderColor: colors.border }]}>
          {entries.map(([key, child]) => (
            <JsonNode
              key={key}
              label={array ? `[${key}]` : JSON.stringify(key)}
              value={child}
              path={`${path}/${key}`}
              depth={depth + 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: { gap: 12 },
  section: { gap: 4 },
  node: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  leaf: { paddingVertical: 6, paddingLeft: 22 },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flexShrink: 1 },
  children: { marginLeft: 8, paddingLeft: 8, borderLeftWidth: 1 },
});
