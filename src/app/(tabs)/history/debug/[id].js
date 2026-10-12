import { Redirect, useLocalSearchParams } from 'expo-router';
export default function LegacyLogLink() {
  const { id, profileId } = useLocalSearchParams();
  return (
    <Redirect
      href={{
        pathname: '/history',
        params: {
          logId: typeof id === 'string' ? id : '',
          ...(typeof profileId === 'string' ? { profileId } : {}),
        },
      }}
    />
  );
}
