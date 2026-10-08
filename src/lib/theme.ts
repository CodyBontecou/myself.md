import { useColorScheme } from 'react-native';

export const light = {
  background: '#F7F7F4', surface: '#FFFFFF', text: '#252521', secondary: '#6A6A62',
  border: '#E7E7E0', subtle: '#EEEEE8', accent: '#9C5034', accentSoft: '#F5E8DF',
  onAccent: '#FFFFFF', danger: '#A33B36',
};
export const dark: typeof light = {
  background: '#191A17', surface: '#242520', text: '#F4F4EE', secondary: '#B3B4AA',
  border: '#383A32', subtle: '#303229', accent: '#E6A487', accentSoft: '#3E2D24',
  onAccent: '#251B15', danger: '#F1A59F',
};
export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
