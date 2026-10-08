import { Text as NativeText, Switch as NativeSwitch } from 'react-native';
import { Button as BridgeButton } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
export function Text({ style, ...props }) {
  const { colors } = useTheme();
  return <NativeText {...props} style={[{ color: colors.text, fontSize: 16, lineHeight: 23 }, style]} />;
}
export function Button({ title, onPress, disabled = false }) {
  return <BridgeButton label={title} onPress={onPress} disabled={disabled} secondary />;
}
export function Switch(props) {
  const { colors } = useTheme();
  return <NativeSwitch {...props} trackColor={{ false: colors.border, true: colors.accent }} hitSlop={8} />;
}
