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
/** @param {{children:import('react').ReactNode,variant?:'body'|'title'|'caption'|'heading',muted?:boolean,style?:import('react-native').StyleProp<import('react-native').TextStyle>,selectable?:boolean,testID?:string,accessibilityRole?:import('react-native').TextProps['accessibilityRole'],accessibilityState?:import('react-native').TextProps['accessibilityState']}} props */
export function Copy({
  children,
  variant = 'body',
  muted = false,
  style,
  selectable = false,
  testID,
  accessibilityRole,
  accessibilityState,
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
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
/** @param {{children:import('react').ReactNode,compact?:boolean,testID?:string}} props */
export function Screen({ children, compact = false, testID }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={[styles.fill, { backgroundColor: colors.background }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.screen,
        compact && styles.compactScreen,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={[styles.column, compact && styles.compactColumn]}>{children}</View>
    </ScrollView>
  );
}
/** @param {{icon:IconName,label:string,onPress:()=>void,testID?:string}} props */
export function IconButton({ icon, label, onPress, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
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
/** @param {{label:string,onPress:()=>void,secondary?:boolean,plain?:boolean,disabled?:boolean,busy?:boolean,testID?:string,icon?:IconName}} props */
export function Button({
  label,
  onPress,
  secondary = false,
  plain = false,
  disabled = false,
  busy = false,
  testID,
  icon,
}) {
  const { colors } = useTheme();
  const color = plain ? colors.accent : secondary ? colors.text : colors.onAccent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: plain ? 'transparent' : secondary ? colors.surface : colors.accent,
          borderColor: secondary ? colors.border : colors.accent,
          ...(plain && { borderWidth: 0 }),
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon && <Icon name={icon} size={20} color={color} />}
      <Copy style={[styles.buttonLabel, { color }]}>{label}</Copy>
    </Pressable>
  );
}
/** @param {{children:import('react').ReactNode,compact?:boolean}} props */
export function Group({ children, compact = false }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.group,
        compact && styles.compactGroup,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}
export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}
/** @param {{title:string,subtitle?:string|undefined,icon?:import('react').ReactNode,trailing?:import('react').ReactNode,onPress?:(()=>void)|undefined,selected?:boolean,compact?:boolean,value?:string,disabled?:boolean,destructive?:boolean,testID?:string}} props */
export function Row({
  title,
  subtitle,
  icon,
  trailing,
  onPress,
  selected,
  compact = false,
  value,
  disabled = false,
  destructive = false,
  testID,
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon}
      <View style={styles.rowText}>
        <Copy
          style={[
            styles.rowTitle,
            compact && styles.compactTitle,
            destructive && { color: colors.danger },
          ]}
        >
          {title}
        </Copy>
        {subtitle && (
          <Copy variant="caption" muted>
            {subtitle}
          </Copy>
        )}
      </View>
      {value !== undefined && (
        <Copy selectable variant="caption" style={styles.rowValue}>
          {value}
        </Copy>
      )}
      {trailing}
      {onPress && selected === undefined && (
        <Icon name="chevron-forward" size={17} color={colors.secondary} />
      )}
    </>
  );
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      accessibilityLabel={[title, value, subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && [styles.compactRow, { borderBottomColor: colors.border }],
        disabled && styles.disabled,
        { backgroundColor: pressed ? colors.subtle : 'transparent' },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={testID}
      style={[styles.row, compact && [styles.compactRow, { borderBottomColor: colors.border }]]}
    >
      {content}
    </View>
  );
}
/** @param {{title:string,count?:number,action?:string,onPress?:()=>void,compact?:boolean,testID?:string}} props */
export function SectionHeader({ title, count, action, onPress, compact = false, testID }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, compact && styles.compactSectionHeader]}>
      <View style={styles.sectionTitle}>
        <Copy variant={compact ? 'caption' : 'heading'} style={compact && styles.semibold}>
          {title}
        </Copy>
        {count !== undefined && (
          <Copy variant="caption" muted>
            {count}
          </Copy>
        )}
      </View>
      {action && (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={styles.textButton}
        >
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
        <Copy variant="caption" muted selectable>
          {body}
        </Copy>
      </View>
    </View>
  );
}
/** @param {{title:string,body:string,action?:string,onPress?:()=>void,icon?:IconName,testID?:string}} props */
export function Empty({ title, body, action, onPress, icon = 'link-outline', testID }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.empty}>
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
  compactScreen: { paddingHorizontal: 16, paddingTop: 8 },
  compactColumn: { gap: 16 },
  compactGroup: { borderRadius: 12 },
  compactRow: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactTitle: { fontSize: 14, lineHeight: 20 },
  rowValue: { flexShrink: 1, maxWidth: '60%', textAlign: 'right', fontVariant: ['tabular-nums'] },
  compactSectionHeader: { minHeight: 32 },
  disabled: { opacity: 0.45 },
  buttonLabel: { fontWeight: '600', textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontWeight: '500' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semibold: { fontWeight: '600' },
  noticeText: { flex: 1, gap: 5 },
  center: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', maxWidth: 280 },
  emptyAction: { alignSelf: 'stretch', marginTop: 12 },
  screen: { paddingHorizontal: 16, paddingTop: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 24 },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 19 },
  heading: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.7 },
  providerIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeIcon: { width: 48, height: 48, borderRadius: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  group: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  empty: { paddingVertical: 32, paddingHorizontal: 12, alignItems: 'center', gap: 12 },
});
