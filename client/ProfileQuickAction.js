import { Pressable, StyleSheet } from 'react-native';
import { Copy, Icon } from '../src/components/ui.js';

/** @param {{label:string,icon:import('../src/components/ui.js').IconName,onPress:()=>void,onDisabledPress?:()=>void,disabled:boolean,busy?:boolean,roomy?:boolean,iconOnly?:boolean,testID:string}} props */
export default function ProfileQuickAction({
  label,
  icon,
  onPress,
  onDisabledPress,
  disabled,
  busy = false,
  roomy = false,
  iconOnly = false,
  testID,
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled && !onDisabledPress, busy }}
      accessibilityHint={
        disabled && onDisabledPress ? 'Explains why this action is unavailable' : undefined
      }
      disabled={disabled && !onDisabledPress}
      onPress={(event) => {
        event.stopPropagation();
        if (disabled) onDisabledPress?.();
        else onPress();
      }}
      style={({ pressed }) => [
        iconOnly ? styles.iconOnly : styles.action,
        roomy && styles.roomy,
        {
          opacity: disabled ? 0.45 : pressed ? 0.5 : 1,
        },
      ]}
    >
      <Icon name={icon} size={roomy || iconOnly ? 20 : 16} />
      {!iconOnly && (
        <Copy variant={roomy ? 'body' : 'caption'} style={styles.label}>
          {label}
        </Copy>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 132,
    minHeight: 44,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontWeight: '500', flexShrink: 1 },
  roomy: { minHeight: 56, padding: 16 },
  iconOnly: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
