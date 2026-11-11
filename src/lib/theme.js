import { useColorScheme } from 'react-native';
/** Strands follows the system appearance: an ivory or dark ground with one color per data strand. */
const dark = {
  background: '#0E0F0C',
  surface: '#181A15',
  text: '#EDEBE3',
  secondary: '#9A9C92',
  border: '#2A2C25',
  outline: '#4A4C43',
  subtle: '#23251F',
  accent: '#EDEBE3',
  accentSoft: '#23251F',
  onAccent: '#0E0F0C',
  danger: '#FF8F66',
  tracking: '#7B93FF',
  place: '#C8E36A',
  attention: '#7B93FF',
  body: '#FF7A45',
};
/** @type {typeof dark} */
const light = {
  background: '#F6F5EF',
  surface: '#FFFFFF',
  text: '#141512',
  secondary: '#5E6057',
  border: '#E2E0D6',
  outline: '#BDBBB0',
  subtle: '#ECEAE2',
  accent: '#141512',
  accentSoft: '#ECEAE2',
  onAccent: '#F6F5EF',
  danger: '#B4441C',
  tracking: '#3550D9',
  place: '#55700F',
  attention: '#3550D9',
  body: '#C2410C',
};
export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
