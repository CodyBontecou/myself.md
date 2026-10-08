import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen, Copy } from '../components/ui';
import { usePhoneData } from '../../client/DataPanel';
import ProfilePanel from '../../client/ProfilePanel';
export default function ProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session, profiles, types, busy, changeProfiles } = usePhoneData();
  const profileId = typeof id === 'string' ? id : '';
  const profile = profiles?.profiles.find((p) => p.id === profileId);
  return (
    <Screen compact>
      <Stack.Screen options={{ title: profile?.name ?? 'Profile' }} />
      {profiles ? (
        <ProfilePanel
          key={profileId}
          profileId={profileId}
          session={session}
          state={profiles}
          types={types}
          busy={busy}
          onChange={changeProfiles}
          draft={null}
          onDismiss={() => {}}
        />
      ) : (
        <Copy>Loading profile…</Copy>
      )}
    </Screen>
  );
}
