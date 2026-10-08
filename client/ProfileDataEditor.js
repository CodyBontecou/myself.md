import { useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Group, Icon, Row } from '../src/components/ui';
import { Switch } from './Terminal.js';
import { useTheme } from '../src/lib/theme';
import { domains } from '../core/data.js';
import { categories } from './health-types.js';
/** @typedef {{kind:'type',domain:import('../core/data.js').Domain,key:string}} TypeRow */
/** @typedef {{kind:'group',key:string,selected:number,total:number,expanded:boolean}} GroupRow */
/** @typedef {{kind:'domain',domain:import('../core/data.js').Domain,key:string,expanded:boolean}} DomainRow */
/** @param {{types:Record<import('../core/data.js').Domain,string[]>,selection:import('../core/profiles.js').ProfileDraft['selection'],onSelection:(value:import('../core/profiles.js').ProfileDraft['selection'])=>void,disabled:boolean}} props */
export default function ProfileDataEditor({ types, selection, onSelection, disabled }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(/** @type {string[]} */ ([]));
  const [expandedDomains, setExpandedDomains] = useState(/** @type {string[]} */ ([]));
  const query = search.toLowerCase().replace(/\s+/g, '');
  const allTypes = domains.flatMap((domain) =>
    [...new Set([...types[domain], ...selection[domain]])].map((key) => ({
      kind: /** @type {const} */ ('type'),
      domain,
      key,
    })),
  );
  /** @param {TypeRow} item */
  const matches = ({ domain, key }) =>
    (!query ||
      `${domain} ${domain === 'health' ? healthGroup(key) : ''} ${key}`
        .toLowerCase()
        .replace(/\s+/g, '')
        .includes(query)) &&
    (!selectedOnly || selection[domain].includes(key));
  /** @type {(TypeRow|GroupRow|DomainRow)[]} */
  const data = [];
  for (const domain of domains) {
    const domainTypes = allTypes.filter((item) => item.domain === domain);
    if (query) {
      data.push(...domainTypes.filter(matches));
      continue;
    }
    const expanded = expandedDomains.includes(domain);
    data.push({ kind: 'domain', domain, key: domain, expanded });
    if (!expanded) continue;
    if (domain !== 'health') {
      data.push(...domainTypes.filter(matches));
      continue;
    }
    const groups = [...new Set(domainTypes.map(({ key }) => healthGroup(key)))];
    for (const group of groups) {
      const members = domainTypes.filter(({ key }) => healthGroup(key) === group);
      const visible = members.filter(matches);
      if (!visible.length) continue;
      const groupExpanded = expandedGroups.includes(group);
      data.push({
        kind: 'group',
        key: group,
        selected: members.filter(({ key }) => selection.health.includes(key)).length,
        total: members.length,
        expanded: groupExpanded,
      });
      if (groupExpanded) data.push(...visible);
    }
  }
  return (
    <FlashList
      data={data}
      keyExtractor={(item) => `${item.kind === 'group' ? 'group' : item.domain}:${item.key}`}
      getItemType={(item) => item.kind}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <Group compact>
            <Row
              compact
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
          {!search && (
            <Copy variant="caption" muted>
              New types stay off. Select all excludes original archives; an archive includes all its
              data. Source permissions still apply.
            </Copy>
          )}
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
      renderItem={({ item }) => {
        if (item.kind === 'domain') {
          const label =
            item.domain === 'health'
              ? 'Health'
              : item.domain === 'time'
                ? 'Screen time'
                : 'Location';
          return (
            <View
              style={[
                styles.domainHeader,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${selection[item.domain].length} selected, ${types[item.domain].length} available`}
                accessibilityState={{ expanded: item.expanded }}
                onPress={() =>
                  setExpandedDomains((current) =>
                    current.includes(item.domain)
                      ? current.filter((domain) => domain !== item.domain)
                      : [...current, item.domain],
                  )
                }
                style={({ pressed }) => [styles.groupAction, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Icon
                  name={item.expanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.secondary}
                />
                <View style={styles.groupText}>
                  <Copy style={styles.groupTitle}>{label}</Copy>
                  <Copy
                    variant="caption"
                    muted
                  >{`${selection[item.domain].length} selected · ${types[item.domain].length} available`}</Copy>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Clear ${item.domain} selection`}
                  accessibilityState={{ disabled: disabled || !selection[item.domain].length }}
                  disabled={disabled || !selection[item.domain].length}
                  onPress={() => onSelection({ ...selection, [item.domain]: [] })}
                  style={[
                    styles.action,
                    (disabled || !selection[item.domain].length) && styles.disabled,
                  ]}
                >
                  <Copy variant="caption" style={{ color: colors.accent }}>
                    Clear
                  </Copy>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select available ${item.domain} types`}
                  accessibilityState={{ disabled: disabled || !types[item.domain].length }}
                  disabled={disabled || !types[item.domain].length}
                  onPress={() =>
                    onSelection({
                      ...selection,
                      [item.domain]: [
                        ...new Set([
                          ...selection[item.domain],
                          ...types[item.domain].filter((key) => key !== 'imported:archive'),
                        ]),
                      ],
                    })
                  }
                  style={[
                    styles.action,
                    (disabled || !types[item.domain].length) && styles.disabled,
                  ]}
                >
                  <Copy variant="caption" style={{ color: colors.accent }}>
                    Select all
                  </Copy>
                </Pressable>
              </View>
            </View>
          );
        }
        if (item.kind === 'group') {
          return (
            <View
              style={[
                styles.groupHeader,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.key}, ${item.selected} of ${item.total} selected`}
                accessibilityState={{ expanded: item.expanded }}
                onPress={() => {
                  setExpandedGroups((current) =>
                    current.includes(item.key)
                      ? current.filter((key) => key !== item.key)
                      : [...current, item.key],
                  );
                }}
                style={({ pressed }) => [styles.groupAction, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Icon
                  name={item.expanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.secondary}
                />
                <View style={styles.groupText}>
                  <Copy style={styles.groupTitle}>{item.key}</Copy>
                  <Copy variant="caption" muted>{`${item.selected}/${item.total} selected`}</Copy>
                </View>
              </Pressable>
              {item.key !== 'Imported archives' && (
                <Switch
                  accessibilityLabel={`Include ${item.key}`}
                  style={styles.sectionSwitch}
                  accessibilityValue={{ text: `${item.selected} of ${item.total} selected` }}
                  disabled={
                    disabled ||
                    (!item.selected && !types.health.some((key) => healthGroup(key) === item.key))
                  }
                  value={item.selected > 0}
                  onValueChange={(enabled) =>
                    onSelection({
                      ...selection,
                      health: toggleHealthSection(
                        selection.health,
                        types.health,
                        item.key,
                        enabled,
                      ),
                    })
                  }
                />
              )}
            </View>
          );
        }
        const { domain, key } = item;
        return (
          <View style={!query && (domain === 'health' ? styles.healthTypes : styles.domainTypes)}>
            <Row
              compact
              title={key
                .replace(/^(native|imported):/, '')
                .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')}
              subtitle={
                domain === 'health' && key.startsWith('native:') && types.health.includes(key)
                  ? undefined
                  : `${domain === 'time' ? 'Screen time' : domain === 'health' ? 'Health' : 'Location'} · ${key.startsWith('imported:') ? 'Imported' : 'Native'}${!types[domain].includes(key) ? ' · unavailable on this phone' : ''}${key === 'imported:archive' ? ' · includes all imported data' : ''}`
              }
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
          </View>
        );
      }}
    />
  );
}
/** @param {string[]} selected @param {string[]} available @param {string} group @param {boolean} enabled */
function toggleHealthSection(selected, available, group, enabled) {
  return enabled
    ? [
        ...new Set([
          ...selected,
          ...available.filter((key) => key !== 'imported:archive' && healthGroup(key) === group),
        ]),
      ]
    : selected.filter((key) => healthGroup(key) !== group);
}
/** Presentation groups cover both platforms and imported identifiers; unknown types remain visible.
 * @param {string} key */
function healthGroup(key) {
  const type = key.replace(/^(native|imported):/, '');
  if (type === 'archive') return 'Imported archives';
  if (/Sleep/i.test(type)) return 'Sleep';
  if (
    /HeartRate|HeartRhythm|Heartbeat|AtrialFibrillation|BloodPressure|Hypertension|Electrocardiogram|CardioFitness|PeripheralPerfusion/i.test(
      type,
    )
  )
    return 'Heart';
  if (/Dietary|Nutrition|Hydration|Food|AlcoholicBeverages|BloodAlcohol/i.test(type))
    return 'Nutrition';
  if (
    /Menstrual|Menstruation|Intermenstrual|Ovulation|CervicalMucus|Pregnancy|Progesterone|Contraceptive|Lactation|SexualActivity|Menopausal|Menopause|Vaginal|BasalBodyTemperature/i.test(
      type,
    )
  )
    return 'Cycle & reproductive health';
  if (/Mindful|StateOfMind|Mood/i.test(type)) return 'Mindfulness';
  if (/Audio|SoundReduction/i.test(type)) return 'Hearing';
  if (/Respiratory|OxygenSaturation|Expiratory|VitalCapacity|Inhaler/i.test(type))
    return 'Respiratory';
  if (/BloodGlucose|InsulinDelivery/i.test(type)) return 'Blood sugar';
  if (/Body|BoneMass|SkinTemperature|Height|Weight|Waist/i.test(type) && !/BodyAche/i.test(type))
    return 'Body measurements';
  if (/Walking|Stair|TimesFallen|SixMinuteWalk/i.test(type) && !/DistanceWalking/i.test(type))
    return 'Mobility';
  if (
    /Energy|Calories|Metabolic|Exercise|MoveTime|Stand|Step|Distance|Cycling|Running|Swimming|Skiing|SnowSports|Paddle|Rowing|Skating|Wheelchair|PushCount|Flights|Floors|Elevation|Workout|Effort|NikeFuel|VO2Max|Speed|Power/i.test(
      type,
    )
  )
    return 'Activity & fitness';
  if (categories.includes(type)) return 'Symptoms & care';
  return 'Other health';
}
const styles = StyleSheet.create({
  domainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingRight: 12,
    marginTop: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  domainTypes: { marginLeft: 12 },
  healthTypes: { marginLeft: 24 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingRight: 12,
    marginTop: 8,
    marginLeft: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  groupAction: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  groupText: { flex: 1 },
  sectionSwitch: { alignSelf: 'center' },
  groupTitle: { fontWeight: '600' },
  content: { padding: 16 },
  header: { gap: 8, marginBottom: 8 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '55%',
  },
  disabled: { opacity: 0.45 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
});
