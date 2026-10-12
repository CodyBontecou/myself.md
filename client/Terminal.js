import { Text as NativeText, StyleSheet } from 'react-native';
import { Button as BridgeButton } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
/** @param {import('react-native').TextProps} props */
export function Text({ style, ...props }) {
  const { colors } = useTheme();
  return <NativeText {...props} style={[styles.text, { color: colors.text }, style]} />;
}
/** @param {{title:string,onPress:()=>void,disabled?:boolean,busy?:boolean,testID?:string}} props */
export function Button({ title, onPress, disabled = false, busy = false, testID }) {
  return (
    <BridgeButton
      {...(testID ? { testID } : {})}
      busy={busy}
      label={title}
      onPress={onPress}
      disabled={disabled}
      secondary
    />
  );
}
export { Checkbox } from '../src/components/ui.js';

const styles = StyleSheet.create({ text: { fontSize: 16, lineHeight: 23 } });
