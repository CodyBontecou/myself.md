import { useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Group, Row, Notice, Button } from '../src/components/ui';
import { Switch } from './Terminal.js';
import { useTheme } from '../src/lib/theme';
import { domains } from '../core/data.js';
/** @param {{types:Record<import('../core/data.js').Domain,string[]>,selection:import('../core/profiles.js').ProfileDraft['selection'],onSelection:(value:import('../core/profiles.js').ProfileDraft['selection'])=>void,disabled:boolean,error:string}} props */
export default function ProfileDataEditor({ types, selection, onSelection, disabled, error }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const data = domains.flatMap((domain) =>
    [...new Set([...types[domain], ...selection[domain]])]
      .filter((key) =>
        search
          ? `${domain} ${key}`
              .toLowerCase()
              .replace(/\s+/g, '')
              .includes(search.toLowerCase().replace(/\s+/g, ''))
          : !selectedOnly || selection[domain].includes(key),
      )
      .map((key) => ({ domain, key })),
  );
  return (
    <FlashList
      data={data}
      keyExtractor={(item) => `${item.domain}:${item.key}`}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      ListHeaderComponent={
        <View style={styles.header}>
          <Copy variant="heading">Data selection</Copy>
          <TextInput
            accessibilityLabel="Search data types"
            placeholder="Search data types"
            placeholderTextColor={colors.secondary}
            value={search}
            onChangeText={setSearch}
            editable={!disabled}
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <Group>
            <Row
              title="Show only selected types"
              trailing={
                <Switch
                  accessibilityLabel="Show only selected types"
                  disabled={disabled}
                  value={selectedOnly}
                  onValueChange={setSelectedOnly}
                />
              }
            />
          </Group>
          {domains.map((domain) => (
            <View key={domain} style={styles.header}>
              <Copy variant="heading">
                {domain === 'health' ? 'Health' : domain === 'time' ? 'Screen time' : 'Location'} ·{' '}
                {selection[domain].length} selected
              </Copy>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button
                    label="Clear"
                    secondary
                    disabled={disabled || !selection[domain].length}
                    onPress={() => onSelection({ ...selection, [domain]: [] })}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label="Select available"
                    secondary
                    disabled={disabled || !types[domain].length}
                    onPress={() =>
                      onSelection({
                        ...selection,
                        [domain]: [
                          ...new Set([
                            ...selection[domain],
                            ...types[domain].filter((key) => key !== 'imported:archive'),
                          ]),
                        ],
                      })
                    }
                  />
                </View>
              </View>
              {!types[domain].length && (
                <Copy variant="caption" muted>
                  No available types. Review source permissions or import data.
                </Copy>
              )}
            </View>
          ))}
          <Notice
            title="Explicit selections"
            body="New types stay off. Select available excludes original archives; selecting an archive includes its complete contents. System permissions and agent domain access still apply."
          />
          {error ? <Copy>{error}</Copy> : null}
        </View>
      }
      ListEmptyComponent={
        <Copy muted>
          {search
            ? 'No types match your search.'
            : selectedOnly
              ? 'No selected types. Turn off the filter to choose data.'
              : 'No data types available yet.'}
        </Copy>
      }
      renderItem={({ item: { domain, key } }) => (
        <Row
          title={key
            .replace(/^(native|imported):/, '')
            .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')}
          subtitle={`${domain === 'time' ? 'Screen time' : domain === 'health' ? 'Health' : 'Location'} · ${key.startsWith('imported:') ? 'Imported' : 'Native'}${!types[domain].includes(key) ? ' · unavailable on this phone' : ''}${key === 'imported:archive' ? ' · includes all imported data' : ''}`}
          trailing={
            <Switch
              disabled={disabled}
              accessibilityLabel={`Include ${domain} ${key}`}
              value={selection[domain].includes(key)}
              onValueChange={(enabled) =>
                onSelection({
                  ...selection,
                  [domain]: enabled
                    ? [...selection[domain], key]
                    : selection[domain].filter((k) => k !== key),
                })
              }
            />
          }
        />
      )}
    />
  );
}
const styles = StyleSheet.create({
  content: { padding: 24 },
  header: { gap: 16, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
});
