import { AccordionLayout } from '../src/components/AccordionMotion.js';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../src/components/ui.js';
import { ProfilesHeader } from '../src/screens/strands/ProfileStrands.js';
/** @param {{profiles:import('../core/profiles.js').ExportProfile[],disabled:boolean,onNewProfile:()=>void,renderProfile:(profile:import('../core/profiles.js').ExportProfile)=>import('react').ReactNode,children?:import('react').ReactNode}} props */
export default function ProfileFeed({ profiles, disabled, onNewProfile, renderProfile, children }) {
  return (
    <View style={styles.feed}>
      <View style={styles.toolbar}>
        <ProfilesHeader
          testID="profile-new-profile"
          caption={`${profiles.length} ${profiles.length === 1 ? 'profile' : 'profiles'}`}
          disabled={disabled}
          onNewProfile={onNewProfile}
        />
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
  toolbar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  list: { gap: 12 },
});
