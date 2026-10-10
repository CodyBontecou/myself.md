import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { domains } from '../core/data.js';
import { Copy, Icon } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
import ProfileExports from './ProfileExports.js';
import ProfileQuickAction from './ProfileQuickAction.js';

/** @param {{profiles:import('../core/profiles.js').ExportProfile[],session:import('./session.js').Session,disabled:boolean,onAgentAccess:(profile:import('../core/profiles.js').ExportProfile,enabled:boolean)=>void}} props */
export default function ProfileFeed({ profiles, session, disabled, onAgentAccess }) {
  const { colors } = useTheme();
  const [layout, setLayout] = useState(1);
  const compact = layout === 0;
  const large = layout === 2;
  return (
    <View style={styles.feed}>
      <View testID="profiles-layout" style={styles.selector}>
        {layoutOptions.map((option, index) => (
          <Pressable
            key={option.label}
            testID={`profiles-layout-${option.label.toLowerCase()}`}
            accessibilityRole="button"
            accessibilityLabel={`${option.label} profile layout`}
            accessibilityState={{ selected: layout === index }}
            onPress={() => setLayout(index)}
            style={({ pressed }) => [
              styles.layoutButton,
              { backgroundColor: layout === index || pressed ? colors.subtle : colors.background },
            ]}
          >
            <Icon
              name={option.icon}
              size={20}
              color={layout === index ? colors.text : colors.secondary}
            />
          </Pressable>
        ))}
      </View>
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
          return (
            <View
              key={profile.id}
              testID={`profile-card-${profile.id}`}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
                compact && [styles.compactCard, { backgroundColor: colors.background }],
              ]}
            >
              <Pressable
                testID={`profile-row-${profile.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${profile.name}, ${access}, open profile`}
                onPress={() =>
                  router.push({ pathname: '/profiles/[id]', params: { id: profile.id } })
                }
                style={({ pressed }) => [
                  styles.header,
                  compact && styles.compactHeader,
                  large && styles.largeHeader,
                  pressed && { backgroundColor: colors.subtle },
                ]}
              >
                <View style={styles.identity}>
                  <Copy variant={compact ? 'body' : large ? 'title' : 'heading'}>
                    {profile.name}
                  </Copy>
                  {!compact && (
                    <Copy variant="caption" muted>
                      {access}
                    </Copy>
                  )}
                </View>
                <Icon name="chevron-forward" size={16} color={colors.secondary} />
              </Pressable>
              {!compact && (
                <View style={[styles.metadata, large && styles.largeMetadata]}>
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
              <View
                style={[
                  styles.footer,
                  { borderTopColor: colors.border, backgroundColor: colors.background },
                  large && styles.largeFooter,
                  compact && styles.compactFooter,
                ]}
              >
                <ProfileExports
                  session={session}
                  profile={profile}
                  disabled={disabled}
                  quick
                  roomy={large}
                  iconOnly={compact}
                  agentAction={
                    <ProfileQuickAction
                      testID={`profile-agents-${profile.id}`}
                      label={profile.agentAccess ? 'Disable agents' : 'Enable agents'}
                      icon={profile.agentAccess ? 'lock-open-outline' : 'lock-closed-outline'}
                      disabled={disabled}
                      roomy={large}
                      iconOnly={compact}
                      onPress={() => onAgentAccess(profile, !profile.agentAccess)}
                    />
                  }
                />
              </View>
            </View>
          );
        })}
      </View>
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
  feed: { gap: 16 },
  selector: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
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
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: { padding: 16, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 16 },
  compactHeader: { minHeight: 52, paddingVertical: 8, paddingHorizontal: 0, gap: 8, flex: 1 },
  largeHeader: { padding: 20 },
  identity: { flex: 1, gap: 4 },
  metadata: { paddingHorizontal: 16, paddingBottom: 16 },
  largeMetadata: { paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  source: { flex: 1, flexBasis: 80, gap: 4 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  field: { flexGrow: 1, flexBasis: '44%', gap: 4 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  largeFooter: { padding: 16 },
  compactFooter: { padding: 0, borderTopWidth: 0, width: 96 },
});
