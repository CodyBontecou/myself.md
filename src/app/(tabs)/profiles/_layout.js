import { Stack } from 'expo-router';
import { ProfileEditorProvider } from '../../../../client/ProfileEditorState';
import AppStack from '../../../components/AppStack';
export const unstable_settings = { initialRouteName: 'index' };
export default function ProfilesLayout() {
  return (
    <ProfileEditorProvider>
      <AppStack>
        <Stack.Screen name="index" options={{ title: 'Profiles', headerShown: false }} />
        <Stack.Screen
          name="editor/index"
          options={{ title: 'New profile', animation: 'slide_from_right' }}
        />
        <Stack.Screen name="editor/data" options={{ title: 'Data selection' }} />
        <Stack.Screen name="[id]" options={{ title: 'Profile' }} />
        <Stack.Screen name="history/index" options={{ title: 'Profile logs' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Activity details' }} />
      </AppStack>
    </ProfileEditorProvider>
  );
}
