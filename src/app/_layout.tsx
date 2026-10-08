import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import PhoneProvider from '../../client/PhoneProvider';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  return <SafeAreaProvider>
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.background, text: colors.text, border: colors.border } }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <PhoneProvider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text }, headerLargeTitleStyle: { color: colors.text },
        headerShadowVisible: false, contentStyle: { backgroundColor: colors.background }, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ title: 'Connections' }} />
        <Stack.Screen name="data/[domain]" options={{ title: 'Data source' }} />
        <Stack.Screen name="manage" options={{ title: 'Profiles & exports' }} />
        <Stack.Screen name="pair" options={{ title: 'Connect agent' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
      </Stack>
      </PhoneProvider>
    </ThemeProvider>
  </SafeAreaProvider>;
}
