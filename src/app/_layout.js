import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import PhoneProvider from '../../client/PhoneProvider';
import { OnboardingProvider, useOnboarding } from '../../client/onboarding';
export const unstable_settings = { initialRouteName: 'index' };
export default function RootLayout() {
  return (
    <OnboardingProvider>
      <RootStack />
    </OnboardingProvider>
  );
}
function RootStack() {
  const { colors, isDark } = useTheme();
  const { complete } = useOnboarding();
  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            primary: colors.accent,
            background: colors.background,
            card: colors.background,
            text: colors.text,
            border: colors.border,
          },
        }}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <PhoneProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text },
              headerLargeTitleStyle: { color: colors.text },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.background },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Protected guard={!complete}>
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={complete}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="data/[domain]" options={{ title: 'Data source' }} />
              <Stack.Screen name="manage" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Screen name="pair" options={{ title: 'Connect agent' }} />
          </Stack>
        </PhoneProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
