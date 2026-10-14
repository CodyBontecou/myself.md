import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Icon } from './ui.js';
import { useTheme } from '../lib/theme.js';
/** @param {{account?:string|undefined,onPress?:()=>void,testID?:string}} props */
export default function AccountAvatar({ account, onPress, testID }) {
  const { colors } = useTheme();
  const content = account ? (
    <Copy style={styles.initial}>{account.trim().slice(0, 1).toUpperCase()}</Copy>
  ) : (
    <Icon name="person-outline" size={22} />
  );
  const style = [styles.avatar, { backgroundColor: colors.subtle }];
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={account ? 'Manage account' : 'Sign in'}
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 20, fontWeight: '600' },
});
