import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Ionicons accessible={false} name={name} size={size} color={color ?? colors.text} /></View>;
}
export function Copy({ children, variant = 'body', muted = false, style, selectable = false }: {
  children: ReactNode; variant?: 'body' | 'title' | 'caption' | 'heading'; muted?: boolean; style?: TextStyle; selectable?: boolean;
}) {
  const { colors } = useTheme();
  return <Text selectable={selectable} style={[styles[variant], { color: muted ? colors.secondary : colors.text }, style]}>{children}</Text>;
}
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + 32 }]}>
    <View style={styles.column}>{children}</View>
  </ScrollView>;
}
export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.subtle, opacity: pressed ? 0.6 : 1 }]}>
    <Icon name={icon} size={21} />
  </Pressable>;
}
export function Button({ label, onPress, secondary = false, disabled = false, icon }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: IconName;
}) {
  const { colors } = useTheme();
  const color = secondary ? colors.text : colors.onAccent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.subtle : colors.accent, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    {icon && <Icon name={icon} size={20} color={color} />}
    <Copy style={{ color, fontWeight: '600', textAlign: 'center' }}>{label}</Copy>
  </Pressable>;
}
export function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}
export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 72, backgroundColor: colors.border }} />;
}
export function Row({ title, subtitle, icon, trailing, onPress, selected }: {
  title: string; subtitle?: string; icon?: ReactNode; trailing?: ReactNode; onPress?: () => void; selected?: boolean;
}) {
  const { colors } = useTheme();
  const content = <>
    {icon}
    <View style={{ flex: 1, gap: 4 }}><Copy style={{ fontWeight: '500' }}>{title}</Copy>{subtitle && <Copy variant="caption" muted>{subtitle}</Copy>}</View>
    {trailing}
    {onPress && selected === undefined && <Icon name="chevron-forward" size={17} color={colors.secondary} />}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.subtle : 'transparent' }]}>{content}</Pressable>
    : <View style={styles.row}>{content}</View>;
}
export function SectionHeader({ title, count, action, onPress }: { title: string; count?: number; action?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return <View style={styles.sectionHeader}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Copy variant="heading">{title}</Copy>{count !== undefined && <Copy variant="caption" muted>{count}</Copy>}</View>
    {action && <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}><Copy variant="caption" style={{ color: colors.accent, fontWeight: '600' }}>{action}</Copy></Pressable>}
  </View>;
}
export function Notice({ title, body, icon = 'information-circle-outline' }: { title: string; body: string; icon?: IconName }) {
  const { colors } = useTheme();
  return <View style={[styles.notice, { backgroundColor: colors.subtle }]}>
    <Icon name={icon} size={20} color={colors.secondary} />
    <View style={{ flex: 1, gap: 5 }}><Copy variant="caption" style={{ fontWeight: '600' }}>{title}</Copy><Copy variant="caption" muted>{body}</Copy></View>
  </View>;
}
export function Empty({ title, body, action, onPress, icon = 'link-outline' }: { title: string; body: string; action?: string; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return <View style={styles.empty}>
    <View style={[styles.providerIcon, styles.largeIcon, { backgroundColor: colors.subtle }]}><Icon name={icon} size={32} color={colors.secondary} /></View>
    <Copy variant="heading" style={{ textAlign: 'center' }}>{title}</Copy>
    <Copy muted style={{ textAlign: 'center', maxWidth: 280 }}>{body}</Copy>
    {action && onPress && <View style={{ alignSelf: 'stretch', marginTop: 12 }}><Button label={action} onPress={onPress} /></View>}
  </View>;
}
export const styles = StyleSheet.create({
  screen: { paddingHorizontal: 24, paddingTop: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 24 },
  body: { fontSize: 16, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 19 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.7 },
  providerIcon: { width: 42, height: 42, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  largeIcon: { width: 76, height: 76, borderRadius: 24 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  group: { borderRadius: 20, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 80, paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 16 },
  notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, borderCurve: 'continuous' },
  empty: { paddingVertical: 32, paddingHorizontal: 12, alignItems: 'center', gap: 12 },
});
