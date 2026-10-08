import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
/** @typedef {import('react').ComponentProps<typeof Ionicons>['name']} IconName */
/** @param {{name:IconName,size?:number,color?:string|undefined}} props */
export function Icon({ name, size = 22, color }) {
  const { colors } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons accessible={false} name={name} size={size} color={color ?? colors.text} />
    </View>
  );
}
/** @param {{children:import('react').ReactNode,variant?:'body'|'title'|'caption'|'heading',muted?:boolean,style?:import('react-native').StyleProp<import('react-native').TextStyle>,selectable?:boolean}} props */
export function Copy({ children, variant = 'body', muted = false, style, selectable = false }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      key={fontScale}
      selectable={selectable}
      style={[
        {
          body: styles.body,
          caption: styles.caption,
          heading: styles.heading,
          title: styles.title,
        }[variant],
        { color: muted ? colors.secondary : colors.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
/** @param {{children:import('react').ReactNode}} props */
export function Screen({ children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}
/** @param {{icon:IconName,label:string,onPress:()=>void}} props */
export function IconButton({ icon, label, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.subtle, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={21} />
    </Pressable>
  );
}
/** @param {{label:string,onPress:()=>void,secondary?:boolean,disabled?:boolean,icon?:IconName}} props */
export function Button({ label, onPress, secondary = false, disabled = false, icon }) {
  const { colors } = useTheme();
  const color = secondary ? colors.text : colors.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.subtle : colors.accent,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && <Icon name={icon} size={20} color={color} />}
      <Copy style={[styles.buttonLabel, { color }]}>{label}</Copy>
    </Pressable>
  );
}
/** @param {{children:import('react').ReactNode}} props */
export function Group({ children }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}
export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}
/** @param {{title:string,subtitle?:string|undefined,icon?:import('react').ReactNode,trailing?:import('react').ReactNode,onPress?:(()=>void)|undefined,selected?:boolean}} props */
export function Row({ title, subtitle, icon, trailing, onPress, selected }) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon}
      <View style={styles.rowText}>
        <Copy style={styles.rowTitle}>{title}</Copy>
        {subtitle && (
          <Copy variant="caption" muted>
            {subtitle}
          </Copy>
        )}
      </View>
      {trailing}
      {onPress && selected === undefined && (
        <Icon name="chevron-forward" size={17} color={colors.secondary} />
      )}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.subtle : 'transparent' },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}
/** @param {{title:string,count?:number,action?:string,onPress?:()=>void}} props */
export function SectionHeader({ title, count, action, onPress }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitle}>
        <Copy variant="heading">{title}</Copy>
        {count !== undefined && (
          <Copy variant="caption" muted>
            {count}
          </Copy>
        )}
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}>
          <Copy variant="caption" style={[styles.semibold, { color: colors.accent }]}>
            {action}
          </Copy>
        </Pressable>
      )}
    </View>
  );
}
/** @param {{title:string,body:string,icon?:IconName}} props */
export function Notice({ title, body, icon = 'information-circle-outline' }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: colors.subtle }]}>
      <Icon name={icon} size={20} color={colors.secondary} />
      <View style={styles.noticeText}>
        <Copy variant="caption" style={styles.semibold}>
          {title}
        </Copy>
        <Copy variant="caption" muted>
          {body}
        </Copy>
      </View>
    </View>
  );
}
/** @param {{title:string,body:string,action?:string,onPress?:()=>void,icon?:IconName}} props */
export function Empty({ title, body, action, onPress, icon = 'link-outline' }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.providerIcon, styles.largeIcon, { backgroundColor: colors.subtle }]}>
        <Icon name={icon} size={32} color={colors.secondary} />
      </View>
      <Copy variant="heading" style={styles.center}>
        {title}
      </Copy>
      <Copy muted style={styles.emptyBody}>
        {body}
      </Copy>
      {action && onPress && (
        <View style={styles.emptyAction}>
          <Button label={action} onPress={onPress} />
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  buttonLabel: { fontWeight: '600', textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontWeight: '500' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semibold: { fontWeight: '600' },
  noticeText: { flex: 1, gap: 5 },
  center: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', maxWidth: 280 },
  emptyAction: { alignSelf: 'stretch', marginTop: 12 },
  screen: { paddingHorizontal: 24, paddingTop: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 24 },
  body: { fontSize: 16, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 19 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.7 },
  providerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeIcon: { width: 76, height: 76, borderRadius: 24 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  group: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 80,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sectionHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 16 },
  notice: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  empty: { paddingVertical: 32, paddingHorizontal: 12, alignItems: 'center', gap: 12 },
});
