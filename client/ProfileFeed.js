import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { domains } from '../core/data.js';
import { Copy, Icon, Screen } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
import ProfileExports from './ProfileExports.js';
/** @param {{profiles:import('../core/profiles.js').ExportProfile[],session:import('./session.js').Session,disabled:boolean,isTracking:boolean,onNewProfile:()=>void,children?:import('react').ReactNode}} props */
export default function ProfileFeed({
  profiles,
  session,
  disabled,
  isTracking,
  onNewProfile,
  children,
}) {
  const { colors } = useTheme();
  const [pressedRow, setPressedRow] = useState(/** @type {string|null} */ (null));
  return (
    <View style={styles.feed}>
      <View style={styles.toolbar}>
        <Copy variant="title" style={styles.title}>
          Profiles
        </Copy>
        <Pressable
          testID="profile-new-profile"
          accessibilityRole="button"
          accessibilityLabel="New profile"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onNewProfile}
          style={({ pressed }) => [
            styles.newProfileButton,
            {
              backgroundColor: pressed ? colors.subtle : 'transparent',
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          <Icon name="add" size={26} color={colors.text} />
        </Pressable>
      </View>
      <Screen>
        {children}
        <View style={styles.list}>
          {profiles.map((profile) => {
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
                    showStatus
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
                  />
                </View>
                <View style={styles.metadata}>
                  <Copy variant="caption" muted>
                    {access}
                  </Copy>

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
                        {domain === 'location' &&
                          profile.selection.location.includes('native:points') && (
                            <Pressable
                              testID={`profile-location-tracking-${profile.id}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Location tracking ${isTracking ? 'on' : 'off'}, open location settings`}
                              onPress={(event) => {
                                event.stopPropagation();
                                router.push('/data/location');
                              }}
                              style={({ pressed }) => [
                                styles.tracking,
                                { opacity: pressed ? 0.5 : 1 },
                              ]}
                            >
                              <Icon
                                name="navigate"
                                size={12}
                                color={isTracking ? colors.tracking : colors.secondary}
                              />
                              <Copy
                                variant="caption"
                                style={{ color: isTracking ? colors.tracking : colors.secondary }}
                              >
                                Tracking {isTracking ? 'on' : 'off'}
                              </Copy>
                            </Pressable>
                          )}
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
                </View>
              </Pressable>
            );
          })}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  feed: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { flex: 1 },
  newProfileButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 16 },
  card: { borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  header: {
    paddingVertical: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  identity: { flex: 1, gap: 4 },
  metadata: { paddingHorizontal: 16, paddingBottom: 20, gap: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  source: { flex: 1, flexBasis: 80, gap: 4 },
  tracking: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  field: { flexGrow: 1, flexBasis: '44%', gap: 4 },
  headerActions: { paddingHorizontal: 16 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
