import { Text as NativeText, Switch as NativeSwitch, StyleSheet } from 'react-native';
import { Button as BridgeButton } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
/** @param {import('react-native').TextProps} props */
export function Text({ style, ...props }) {
  const { colors } = useTheme();
  return <NativeText {...props} style={[styles.text, { color: colors.text }, style]} />;
}
/** @param {{title:string,onPress:()=>void,disabled?:boolean}} props */
export function Button({ title, onPress, disabled = false }) {
  return <BridgeButton label={title} onPress={onPress} disabled={disabled} secondary />;
}
/** @param {import('react-native').SwitchProps} props */
export function Switch(props) {
  const { colors } = useTheme();
  return (
    <NativeSwitch
      {...props}
      trackColor={{ false: colors.border, true: colors.accent }}
      hitSlop={8}
    />
  );
}

const styles = StyleSheet.create({ text: { fontSize: 16, lineHeight: 23 } });
