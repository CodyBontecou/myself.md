import { ToastProvider } from '../components/Toast.js';
import { SupportNotifications } from '../../client/support-notifications.js';
import { useEffect, useSyncExternalStore } from 'react';
import { feedbackState } from '../../client/gripe.js';
import QaPhoneProvider from '../../client/QaPhoneProvider.js';
import { qaEnabled, qaSnapshot, subscribeQa } from '../../client/qa-runtime.js';
import BillingPaywalls from '../../client/BillingPaywalls';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import PhoneProvider from '../../client/PhoneProvider';
import { OnboardingProvider, useOnboarding } from '../../client/onboarding';
export const unstable_settings = { initialRouteName: 'index' };
export default function RootLayout() {
  useEffect(() => {
    if (qaEnabled) return;
    void feedbackState().catch(() => {});
  }, []);
  const fixture = useSyncExternalStore(subscribeQa, qaSnapshot);
  return (
    <OnboardingProvider key={qaEnabled ? fixture.revision : 0}>
      <RootStack />
    </OnboardingProvider>
  );
}
function RootStack() {
  const { colors, isDark } = useTheme();
  const { complete } = useOnboarding();
  const Provider = qaEnabled ? QaPhoneProvider : PhoneProvider;
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
        <ToastProvider>
          <Provider>
            {!qaEnabled && <BillingPaywalls />}
            {!qaEnabled && <SupportNotifications />}
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
              <Stack.Protected guard={qaEnabled}>
                <Stack.Screen name="qa" options={{ title: 'QA fixtures' }} />
              </Stack.Protected>
              <Stack.Protected guard={!complete}>
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Protected guard={complete}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="data/[domain]" options={{ title: 'Data source' }} />
                <Stack.Screen name="manage" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Screen name="unlock" options={{ title: 'Lifetime unlock' }} />
              <Stack.Screen name="pair" options={{ title: 'Connect agent' }} />
              <Stack.Screen name="account" options={{ title: 'Lifetime access' }} />
              <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
              <Stack.Screen name="diagnostics" options={{ title: 'Log sharing' }} />
            </Stack>
          </Provider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
