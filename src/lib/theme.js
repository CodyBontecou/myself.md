import { useColorScheme } from 'react-native';
const light = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#171717',
  secondary: '#666666',
  border: '#E5E5E5',
  subtle: '#F2F2F2',
  accent: '#171717',
  accentSoft: '#F2F2F2',
  onAccent: '#FFFFFF',
  danger: '#A33B36',
};
const dark = {
  background: '#0A0A0A',
  surface: '#141414',
  text: '#EDEDED',
  secondary: '#A1A1A1',
  border: '#2E2E2E',
  subtle: '#1F1F1F',
  accent: '#EDEDED',
  accentSoft: '#1F1F1F',
  onAccent: '#0A0A0A',
  danger: '#F1A59F',
};
export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
