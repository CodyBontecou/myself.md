import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { domains } from '../core/data.js';
import { Copy, Icon, Screen } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
import ProfileExports from './ProfileExports.js';
import ProfileQuickAction from './ProfileQuickAction.js';
import Storage from 'expo-sqlite/kv-store';
import { qaEnabled } from './qa-runtime.js';
import { useToast } from '../src/components/Toast.js';

const layoutKey = qaEnabled ? 'qa-profile-card-layout-v1' : 'profile-card-layout-v1';

function savedLayout() {
  try {
    const value = Storage.getItemSync(layoutKey);
    return value === '0' ? 0 : value === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

/** @param {{profiles:import('../core/profiles.js').ExportProfile[],session:import('./session.js').Session,disabled:boolean,onNewProfile:()=>void,children?:import('react').ReactNode,onAgentAccess:(profile:import('../core/profiles.js').ExportProfile,enabled:boolean)=>void}} props */
export default function ProfileFeed({
  profiles,
  session,
  disabled,
  onAgentAccess,
  onNewProfile,
  children,
}) {
  const { colors } = useTheme();
  const [layout, setLayout] = useState(savedLayout);
  const [pressedRow, setPressedRow] = useState(/** @type {string|null} */ (null));
  const showToast = useToast();
  /** @param {number} index */
  function selectLayout(index) {
    try {
      Storage.setItemSync(layoutKey, String(index));
      setLayout(index);
    } catch {
      showToast({
        message: 'Could not save your profile layout. Please try again.',
        kind: 'error',
      });
    }
  }
  const compact = layout === 0;
  const large = layout === 2;
  return (
    <View style={styles.feed}>
      <View style={styles.toolbar}>
        <Copy variant="title" style={styles.title}>
          Profiles
        </Copy>
        <View testID="profiles-layout" style={styles.selector}>
          {layoutOptions.map((option, index) => (
            <Pressable
              key={option.label}
              testID={`profiles-layout-${option.label.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityLabel={`${option.label} profile layout`}
              accessibilityState={{ selected: layout === index }}
              onPress={() => selectLayout(index)}
              style={({ pressed }) => [
                styles.layoutButton,
                {
                  backgroundColor: layout === index || pressed ? colors.subtle : colors.background,
                },
              ]}
            >
              <Icon
                name={option.icon}
                size={20}
                color={layout === index ? colors.text : colors.secondary}
              />
            </Pressable>
          ))}
          <Pressable
            testID="profile-new-profile"
            accessibilityRole="button"
            accessibilityLabel="New profile"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onNewProfile}
            style={({ pressed }) => [
              styles.layoutButton,
              {
                backgroundColor: pressed ? colors.subtle : 'transparent',
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          >
            <Icon name="add" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <Screen>
        {children}
        <View style={[styles.list, compact && styles.compactList]}>
          {profiles.map((profile) => {
            const count = domains.reduce(
              (total, domain) => total + profile.selection[domain].length,
              0,
            );
            const access = profile.agentAccess ? 'Agents enabled' : 'Private';
            const destination =
              profile.export.destination === 'local'
                ? 'On this phone'
                : profile.export.destination === 'http'
                  ? 'HTTPS endpoint'
                  : 'Cloud';
            const openProfile = () =>
              router.push({ pathname: '/profiles/[id]', params: { id: profile.id } });
            const header = (
              <Pressable
                testID={`profile-row-${profile.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${profile.name}, ${access}, open profile`}
                onPressIn={() => setPressedRow(profile.id)}
                onPressOut={() => setPressedRow(null)}
                onPress={(event) => {
                  event.stopPropagation();
                  openProfile();
                }}
                style={styles.header}
              >
                <View style={styles.identity}>
                  <Copy>{profile.name}</Copy>
                </View>
              </Pressable>
            );
            return (
              <Pressable
                key={profile.id}
                testID={`profile-card-${profile.id}`}
                accessible={false}
                onPress={openProfile}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: pressed ? colors.subtle : colors.surface,
                    borderColor: colors.border,
                  },
                  compact && [
                    styles.compactCard,
                    {
                      backgroundColor: pressed ? colors.subtle : colors.background,
                      borderColor: 'transparent',
                      borderBottomColor: colors.border,
                    },
                  ],
                ]}
              >
                <View
                  style={[
                    styles.headerActions,
                    pressedRow === profile.id && { backgroundColor: colors.subtle },
                  ]}
                >
                  <ProfileExports
                    session={session}
                    profile={profile}
                    disabled={disabled}
                    quick
                    iconOnly
                    leadingAction={header}
                    trailingAction={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${profile.name}`}
                        onPressIn={() => setPressedRow(profile.id)}
                        onPressOut={() => setPressedRow(null)}
                        onPress={(event) => {
                          event.stopPropagation();
                          openProfile();
                        }}
                        style={({ pressed }) => [styles.arrow, { opacity: pressed ? 0.5 : 1 }]}
                      >
                        <Icon name="chevron-forward" size={16} color={colors.secondary} />
                      </Pressable>
                    }
                    agentAction={
                      <ProfileQuickAction
                        testID={`profile-agents-${profile.id}`}
                        label={profile.agentAccess ? 'Disable agents' : 'Enable agents'}
                        icon={profile.agentAccess ? 'lock-open-outline' : 'lock-closed-outline'}
                        disabled={disabled}
                        iconOnly
                        onPress={() => onAgentAccess(profile, !profile.agentAccess)}
                      />
                    }
                  />
                </View>
                {!compact && (
                  <View style={[styles.metadata, large && styles.largeMetadata]}>
                    <Copy variant="caption" muted>
                      {access}
                    </Copy>
                    {large ? (
                      <>
                        <View style={styles.sources}>
                          {domains.map((domain) => (
                            <View key={domain} style={styles.source}>
                              <Copy variant="caption" muted>
                                {domain === 'time'
                                  ? 'Screen time'
                                  : domain === 'health'
                                    ? 'Health'
                                    : 'Location'}
                              </Copy>
                              <Copy variant="heading">
                                {profile.selection[domain].length}{' '}
                                {profile.selection[domain].length === 1 ? 'type' : 'types'}
                              </Copy>
                            </View>
                          ))}
                        </View>
                        <View style={styles.details}>
                          {[
                            ['Destination', destination],
                            ['Formats', profile.export.formats.join(' + ').toUpperCase()],
                            [
                              'Export window',
                              `${profile.export.lookbackDays} days${profile.export.includeToday ? ' + today' : ''}`,
                            ],
                            ['Schema', profile.export.schema.split('.').at(-1) ?? 'v1'],
                            ['Folder', profile.export.folderName],
                            ['Filename', profile.export.filenameTemplate],
                          ].map(([label, value]) => (
                            <View key={label} style={styles.field}>
                              <Copy variant="caption" muted>
                                {label}
                              </Copy>
                              <Copy>{value}</Copy>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : (
                      <Copy variant="caption" muted>
                        {count} data {count === 1 ? 'type' : 'types'} · {destination}
                      </Copy>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Screen>
    </View>
  );
}

/** @type {{label:string,icon:import('../src/components/ui.js').IconName}[]} */
const layoutOptions = [
  { label: 'Compact', icon: 'reorder-two-outline' },
  { label: 'Standard', icon: 'list-outline' },
  { label: 'Large', icon: 'albums-outline' },
];

const styles = StyleSheet.create({
  feed: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { flex: 1 },
  selector: { flexDirection: 'row', justifyContent: 'flex-end', gap: 0 },
  layoutButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 16 },
  compactList: { gap: 0 },
  card: { borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  compactCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
  },
  header: {
    paddingVertical: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  identity: { flex: 1, gap: 4 },
  metadata: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  largeMetadata: { paddingBottom: 20, gap: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  source: { flex: 1, flexBasis: 80, gap: 4 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  field: { flexGrow: 1, flexBasis: '44%', gap: 4 },
  headerActions: { paddingHorizontal: 16 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
