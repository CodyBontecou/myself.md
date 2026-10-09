import { useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Group, Icon, Row } from '../src/components/ui';
import { Switch } from './Terminal.js';
import { useTheme } from '../src/lib/theme';
import { domains } from '../core/data.js';
import { categories } from './health-types.js';
/** @typedef {{kind:'type',domain:import('../core/data.js').Domain,key:string}} TypeRow */
/** @typedef {{kind:'group',key:string,selected:number,total:number,expanded:boolean}} GroupRow */
/** @typedef {{kind:'domain',domain:import('../core/data.js').Domain,key:string,expanded:boolean}} DomainRow */
/** @param {{types:Record<import('../core/data.js').Domain,string[]>,permissions:Record<string,string>,onOpenLocation:()=>void,onAuthorize:(domain:import('../core/data.js').Domain)=>Promise<{message:string}>,selection:import('../core/profiles.js').ProfileDraft['selection'],onSelection:(value:import('../core/profiles.js').ProfileDraft['selection'])=>void|Promise<void>,disabled:boolean,inline?:boolean,domain?:import('../core/data.js').Domain}} props */
export default function ProfileDataEditor({
  types,
  permissions,
  onAuthorize,
  onOpenLocation,
  selection,
  onSelection,
  disabled,
  inline = false,
  domain: selectedDomain,
}) {
  const [requesting, setRequesting] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const locked = disabled || requesting;
  /** @param {import('../core/data.js').Domain} domain */
  async function authorize(domain) {
    setRequesting(true);
    try {
      setAccessMessage((await onAuthorize(domain)).message);
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : 'Could not request access.');
    } finally {
      setRequesting(false);
    }
  }
  /** @param {import('../core/profiles.js').ProfileDraft['selection']} next */
  async function select(next) {
    if (locked) return;
    setRequesting(true);
    try {
      await onSelection(next);
      const added = domains.find(
        (domain) =>
          domain !== 'health' && next[domain].some((key) => !selection[domain].includes(key)),
      );
      if (added && permissions[added] !== 'authorized') await authorize(added);
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : 'Could not save selection.');
    } finally {
      setRequesting(false);
    }
  }
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(/** @type {string[]} */ ([]));
  const [expandedDomains, setExpandedDomains] = useState(
    /** @type {string[]} */ (selectedDomain ? [selectedDomain] : []),
  );
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
    domain !== 'health' ||
    !query ||
    `${domain} ${healthGroup(key)} ${key}`.toLowerCase().replace(/\s+/g, '').includes(query);
  /** @type {(TypeRow|GroupRow|DomainRow)[]} */
  const data = [];
  for (const domain of domains) {
    if (selectedDomain && domain !== selectedDomain) continue;
    const domainTypes = allTypes.filter((item) => item.domain === domain);
    const expanded = expandedDomains.includes(domain);
    data.push({ kind: 'domain', domain, key: domain, expanded });
    if (!expanded) continue;
    if (query && domain === 'health') {
      data.push(...domainTypes.filter(matches));
      continue;
    }
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
  /** @param {{item:TypeRow|GroupRow|DomainRow}} props */
  function renderItem({ item }) {
    if (item.kind === 'domain') {
      const label =
        item.domain === 'health' ? 'Health' : item.domain === 'time' ? 'Screen time' : 'Location';
      const selected = selection[item.domain];
      const available = types[item.domain];
      const allSelected = selected.length > 0 && available.every((key) => selected.includes(key));
      const toggleDisabled = locked || (!available.length && !selected.length);
      return (
        <View>
          <View
            style={[
              styles.domainHeader,
              inline && styles.inlineDomain,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              testID={`selection-domain-${item.domain}`}
              accessibilityLabel={`${label}, ${selection[item.domain].length} selected, ${types[item.domain].length} ${types[item.domain].length === 1 ? 'choice' : 'choices'}`}
              accessibilityState={{ expanded: item.expanded }}
              onPress={() =>
                setExpandedDomains((current) =>
                  current.includes(item.domain)
                    ? current.filter((domain) => domain !== item.domain)
                    : inline
                      ? [item.domain]
                      : [...current, item.domain],
                )
              }
              style={({ pressed }) => [
                styles.groupAction,
                inline && styles.compactAction,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Icon
                name={item.expanded ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color={colors.secondary}
              />
              <View style={[styles.groupText, inline && styles.domainTitle]}>
                <Copy style={styles.groupTitle}>{label}</Copy>
                <Copy variant="caption" muted>
                  {selection[item.domain].length}/
                  {allTypes.filter((type) => type.domain === item.domain).length}
                </Copy>
              </View>
            </Pressable>
            {(!inline || item.expanded) && (
              <View style={[styles.actions, inline && styles.inlineActions]}>
                {item.domain === 'health' && (
                  <Pressable
                    accessibilityRole="button"
                    testID="selection-search-toggle"
                    accessibilityLabel={
                      searchOpen ? 'Close Health search' : 'Search Health data types'
                    }
                    accessibilityState={{ expanded: searchOpen, disabled: locked }}
                    disabled={locked}
                    onPress={() => {
                      setSearchOpen(!searchOpen);
                      setExpandedDomains((current) => [...new Set([...current, 'health'])]);
                      if (searchOpen) {
                        setSearch('');
                        Keyboard.dismiss();
                      }
                    }}
                    style={styles.checkboxAction}
                  >
                    <Icon name={searchOpen ? 'close' : 'search'} size={20} color={colors.accent} />
                  </Pressable>
                )}
                {item.domain !== 'health' && (
                  <Pressable
                    accessibilityRole="button"
                    testID={`selection-permissions-${item.domain}`}
                    accessibilityLabel={`Review ${label} permissions`}
                    disabled={locked}
                    onPress={() => void authorize(item.domain)}
                    style={styles.action}
                  >
                    <Copy variant="caption" style={{ color: colors.accent }}>
                      Permissions
                    </Copy>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  testID={`selection-all-${item.domain}`}
                  accessibilityLabel={`Include all ${label} data types`}
                  accessibilityState={{
                    checked: allSelected ? true : selected.length ? 'mixed' : false,
                    disabled: toggleDisabled,
                  }}
                  disabled={toggleDisabled}
                  onPress={() =>
                    select({
                      ...selection,
                      [item.domain]: allSelected ? [] : [...new Set([...selected, ...available])],
                    })
                  }
                  style={[styles.checkboxAction, toggleDisabled && styles.disabled]}
                >
                  <Icon
                    name={
                      allSelected
                        ? 'checkbox'
                        : selected.length
                          ? 'remove-outline'
                          : 'square-outline'
                    }
                    size={20}
                    color={colors.accent}
                  />
                </Pressable>
              </View>
            )}
          </View>
          {inline && item.expanded && (
            <View style={styles.inlineFilters}>
              {item.domain === 'health' && healthSearch}
              {status}
              {!allTypes.some((type) => type.domain === item.domain && matches(type)) && (
                <Copy variant="caption" muted>
                  {query && item.domain === 'health'
                    ? 'No matching types.'
                    : 'No data types available yet.'}
                </Copy>
              )}
            </View>
          )}
          {!inline && item.domain === 'health' && item.expanded && healthSearch}
          {item.domain !== 'health' && item.expanded && (
            <Group compact>
              <Row
                compact
                title={`Access: ${permissions[item.domain] ?? 'checking'}`}
                subtitle={
                  item.domain === 'time'
                    ? Platform.OS === 'android'
                      ? 'Enable Usage Access in Android Settings to read app usage totals.'
                      : 'iOS data access requires 26.4+ and EU eligibility.'
                    : 'Only points recorded by myself.md are exported.'
                }
              />
              {item.domain === 'location' && (
                <Row
                  compact
                  title={inline ? 'Set up recording' : 'Save profile and set up recording'}
                  subtitle="Choose background recording or save a single point."
                  onPress={() => {
                    Keyboard.dismiss();
                    onOpenLocation();
                  }}
                  disabled={locked}
                />
              )}
            </Group>
          )}
        </View>
      );
    }
    if (item.kind === 'group') {
      return (
        <View
          style={[
            styles.groupHeader,
            inline && styles.compactGroup,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            testID={`selection-group-${item.key}`}
            accessibilityLabel={`${item.key}, ${item.selected} of ${item.total} selected`}
            accessibilityState={{ expanded: item.expanded }}
            onPress={() => {
              setExpandedGroups((current) =>
                current.includes(item.key)
                  ? current.filter((key) => key !== item.key)
                  : [...current, item.key],
              );
            }}
            style={({ pressed }) => [
              styles.groupAction,
              inline && styles.compactAction,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon
              name={item.expanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.secondary}
            />
            <View style={[styles.groupText, inline && styles.domainTitle]}>
              <Copy variant={inline ? 'caption' : 'body'} style={styles.groupTitle}>
                {item.key}
              </Copy>
              <Copy variant="caption" muted>
                {item.selected}/{item.total}
              </Copy>
            </View>
          </Pressable>
          {inline ? (
            <Pressable
              accessibilityRole="checkbox"
              testID={`selection-group-toggle-${item.key}`}
              accessibilityLabel={`Include ${item.key}`}
              accessibilityState={{
                checked: item.selected === item.total ? true : item.selected > 0 ? 'mixed' : false,
                disabled: locked,
              }}
              disabled={locked}
              onPress={() =>
                void select({
                  ...selection,
                  health: toggleHealthSection(
                    selection.health,
                    types.health,
                    item.key,
                    item.selected < item.total,
                  ),
                })
              }
              style={styles.checkboxAction}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: colors.border,
                    backgroundColor: item.selected ? colors.accent : colors.surface,
                  },
                ]}
              >
                {item.selected > 0 && (
                  <Icon
                    name={item.selected === item.total ? 'checkmark' : 'remove'}
                    size={14}
                    color={colors.onAccent}
                  />
                )}
              </View>
            </Pressable>
          ) : (
            <Switch
              testID={`selection-group-toggle-${item.key}`}
              accessibilityLabel={`Include ${item.key}`}
              style={styles.sectionSwitch}
              accessibilityValue={{ text: `${item.selected} of ${item.total} selected` }}
              disabled={
                locked ||
                (!item.selected && !types.health.some((key) => healthGroup(key) === item.key))
              }
              value={item.selected > 0}
              onValueChange={(enabled) =>
                select({
                  ...selection,
                  health: toggleHealthSection(selection.health, types.health, item.key, enabled),
                })
              }
            />
          )}
        </View>
      );
    }
    const { domain, key } = item;
    const label = key
      .replace(/^native:/, '')
      .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
    if (inline)
      return (
        <Pressable
          accessibilityRole="checkbox"
          testID={`selection-type-${domain}-${key}`}
          accessibilityLabel={`Include ${domain} ${key}`}
          accessibilityState={{ checked: selection[domain].includes(key), disabled: locked }}
          disabled={locked}
          onPress={() =>
            void select({
              ...selection,
              [domain]: selection[domain].includes(key)
                ? selection[domain].filter((value) => value !== key)
                : [...selection[domain], key],
            })
          }
          style={({ pressed }) => [
            styles.typeOption,
            {
              borderBottomColor: colors.border,
              backgroundColor: pressed ? colors.subtle : colors.surface,
              opacity: locked ? 0.45 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: colors.border,
                backgroundColor: selection[domain].includes(key) ? colors.accent : colors.surface,
              },
            ]}
          >
            {selection[domain].includes(key) && (
              <Icon name="checkmark" size={14} color={colors.onAccent} />
            )}
          </View>
          <View style={styles.groupText}>
            <Copy variant="caption">{label}</Copy>
            {!types[domain].includes(key) && (
              <Copy variant="caption" muted>
                Unavailable on this phone
              </Copy>
            )}
          </View>
        </Pressable>
      );
    return (
      <View style={!query && (domain === 'health' ? styles.healthTypes : styles.domainTypes)}>
        <Row
          compact
          title={key
            .replace(/^native:/, '')
            .replace(/^HK(Quantity|Category|Correlation|Data)TypeIdentifier/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')}
          subtitle={
            domain === 'health' && key.startsWith('native:') && types.health.includes(key)
              ? undefined
              : `${domain === 'time' ? 'Screen time' : domain === 'health' ? 'Health' : 'Location'} · Native${!types[domain].includes(key) ? ' · unavailable on this phone' : ''}`
          }
          trailing={
            <Switch
              disabled={locked}
              testID={`selection-type-${domain}-${key}`}
              accessibilityLabel={`Include ${domain} ${key}`}
              value={selection[domain].includes(key)}
              onValueChange={(enabled) =>
                select({
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
  }
  const healthSearch = searchOpen ? (
    <View style={styles.header}>
      <TextInput
        autoFocus
        testID="selection-search"
        accessibilityLabel="Search Health data types"
        placeholder="Search Health data types"
        placeholderTextColor={colors.secondary}
        value={search}
        onChangeText={setSearch}
        editable={!locked}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={Keyboard.dismiss}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />
    </View>
  ) : null;
  const status = accessMessage ? (
    <View testID="selection-status" accessibilityRole="alert" style={styles.header}>
      <Copy>{accessMessage}</Copy>
    </View>
  ) : null;
  if (inline)
    return (
      <View>
        {data.map((item) => (
          <View key={`${item.kind}:${item.kind === 'group' ? 'health' : item.domain}:${item.key}`}>
            {renderItem({ item })}
          </View>
        ))}
      </View>
    );
  return (
    <FlashList
      testID="selection-list"
      data={data}
      keyExtractor={(item) => `${item.kind === 'group' ? 'group' : item.domain}:${item.key}`}
      getItemType={(item) => item.kind}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      ListHeaderComponent={status}
      ListEmptyComponent={
        <Copy muted>{search ? 'No types match your search.' : 'No data types available yet.'}</Copy>
      }
      renderItem={renderItem}
    />
  );
}
/** @param {string[]} selected @param {string[]} available @param {string} group @param {boolean} enabled */
function toggleHealthSection(selected, available, group, enabled) {
  return enabled
    ? [...new Set([...selected, ...available.filter((key) => healthGroup(key) === group)])]
    : selected.filter((key) => healthGroup(key) !== group);
}
/** Presentation groups cover both platforms; unknown types remain visible.
 * @param {string} key */
function healthGroup(key) {
  const type = key.replace(/^native:/, '');
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
  inlineDomain: { marginTop: 0, borderRadius: 0, borderWidth: 0, paddingRight: 0 },
  domainTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactAction: { minHeight: 44, paddingVertical: 8 },
  compactGroup: {
    marginTop: 0,
    marginLeft: 8,
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 44,
    gap: 4,
    paddingRight: 0,
  },
  inlineActions: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
  },
  inlineFilters: { paddingHorizontal: 12, paddingBottom: 8 },
  checkboxAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 5,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOption: {
    minHeight: 44,
    marginLeft: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
