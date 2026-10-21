import { AccordionLayout } from '../src/components/AccordionMotion.js';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Icon, Screen } from '../src/components/ui.js';
import { useTheme } from '../src/lib/theme.js';
/** @param {{profiles:import('../core/profiles.js').ExportProfile[],disabled:boolean,onNewProfile:()=>void,renderProfile:(profile:import('../core/profiles.js').ExportProfile)=>import('react').ReactNode,children?:import('react').ReactNode}} props */
export default function ProfileFeed({ profiles, disabled, onNewProfile, renderProfile, children }) {
  const { colors } = useTheme();
  return (
    <View style={styles.feed}>
      <View style={styles.toolbar}>
        <Copy variant="title" style={styles.title}>
          myself.md
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
        <Pressable
          testID="settings-open"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.newProfileButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
      <Screen>
        {children}
        <AccordionLayout style={styles.list}>
          {profiles.map((profile) => (
            <AccordionLayout key={profile.id}>{renderProfile(profile)}</AccordionLayout>
          ))}
        </AccordionLayout>
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
});
