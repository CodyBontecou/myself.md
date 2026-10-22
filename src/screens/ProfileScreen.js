import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen, Copy } from '../components/ui';
import { usePhoneData } from '../../client/DataPanel';
import ProfileExports from '../../client/ProfileExports.js';
import ProfilePanel from '../../client/ProfilePanel';
export default function ProfileScreen() {
  const { id, firstExport, section } = useLocalSearchParams();
  const data = usePhoneData();
  const { session, profiles, types, sourcePermissions, reviewSourceAccess, busy, changeProfiles } =
    data;
  const profileId = typeof id === 'string' ? id : '';
  const profile = profiles?.profiles.find((p) => p.id === profileId);
  return (
    <Screen testID="profile-detail-screen" compact>
      <Stack.Screen options={{ title: profile?.name ?? 'Profile' }} />
      {profiles && profile && section === 'cloud-access' ? (
        <ProfileExports session={session} profile={profile} disabled={busy} cloudAccessOnly />
      ) : profiles ? (
        <ProfilePanel
          key={profileId}
          profileId={profileId}
          exportFirst={firstExport === '1'}
          session={session}
          state={profiles}
          types={types}
          permissions={sourcePermissions}
          onAuthorize={reviewSourceAccess}
          busy={busy}
          isTracking={data.isTracking}
          onRecordingChange={(enabled) => void data.run(() => data.changeRecording(enabled))}
          onChange={changeProfiles}
          draft={null}
          onDismiss={() => {}}
        />
      ) : (
        <Copy testID="profile-loading" accessibilityState={{ busy: true }}>
          Loading profile…
        </Copy>
      )}
    </Screen>
  );
}
