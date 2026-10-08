import { Stack } from 'expo-router';
import { useTheme } from '../lib/theme';
/** @param {{children:import('react').ReactNode}} props */
export default function AppStack({ children }) {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      {children}
    </Stack>
  );
}
