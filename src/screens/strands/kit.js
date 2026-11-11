import { useContext } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, DockInset, Icon } from '../../components/ui.js';
import { fonts, themed } from './palette.js';

/** Scrolling Strands page on the palette's ground; the root status bar follows the system.
 * @param {{children:import('react').ReactNode,testID?:string}} props */
export function StrandsScreen({ children, testID }) {
  const { styles } = useStyles();
  const insets = useSafeAreaInsets();
  const dock = useContext(DockInset);
  return (
    <ScrollView
      testID={testID}
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + dock + 24 },
      ]}
    >
      {children}
    </ScrollView>
  );
}

/** @param {{children:import('react').ReactNode,color?:string,size?:number}} props */
export function Mono({ children, color, size = 12 }) {
  const { strands, styles } = useStyles();
  return (
    <Copy style={[styles.mono, { color: color ?? strands.muted, fontSize: size }]}>{children}</Copy>
  );
}

/** @param {{children:import('react').ReactNode,style?:import('react-native').StyleProp<import('react-native').ViewStyle>,testID?:string}} props */
export function Card({ children, style, testID }) {
  const { styles } = useStyles();
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

/** @param {{label:string,onPress:()=>void,filled?:boolean,icon?:import('../../components/ui.js').IconName,disabled?:boolean,testID?:string}} props */
export function Pill({ label, onPress, filled = false, icon, disabled = false, testID }) {
  const { strands, styles } = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        filled ? styles.pillFilled : styles.pillOutline,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon && <Icon name={icon} size={16} color={filled ? strands.ground : strands.text} />}
      <Copy style={[styles.pillLabel, filled ? styles.onLight : styles.onDark]}>{label}</Copy>
    </Pressable>
  );
}

/** @param {{icon:import('../../components/ui.js').IconName,label:string,onPress:()=>void}} props */
export function RoundButton({ icon, label, onPress }) {
  const { strands, styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.round, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={18} color={strands.text} />
    </Pressable>
  );
}

/** Shared Strands type styles for the current palette. */
export const useText = themed((strands) => {
  const text = /** @type {const} */ ({
    title: {
      fontFamily: fonts.semibold,
      fontSize: 40,
      lineHeight: 42,
      letterSpacing: -1.2,
      color: strands.text,
    },
    heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 25, color: strands.text },
    body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: strands.soft },
    small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: strands.muted },
    value: { fontFamily: fonts.medium, fontSize: 14, color: strands.text },
    strong: { fontFamily: fonts.semibold },
  });
  return text;
});

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    fill: { flex: 1, backgroundColor: strands.ground },
    content: { paddingHorizontal: 20, gap: 14 },
    mono: { fontFamily: fonts.mono, letterSpacing: 0.3 },
    card: {
      backgroundColor: strands.surface,
      borderColor: strands.line,
      borderWidth: 1,
      borderRadius: 20,
      padding: 16,
      gap: 10,
    },
    pill: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    pillFilled: { backgroundColor: strands.text },
    pillOutline: { borderWidth: 1, borderColor: strands.rule },
    pillLabel: { fontFamily: fonts.semibold, fontSize: 14 },
    onLight: { color: strands.ground },
    onDark: { color: strands.text },
    round: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: strands.line,
      backgroundColor: strands.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
  return styles;
});
