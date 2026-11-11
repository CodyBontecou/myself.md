import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, DockInset, Icon } from '../../components/ui.js';
import { useTheme } from '../../lib/theme.js';
import { fonts, themed } from '../../screens/strands/palette.js';

export const unstable_settings = { initialRouteName: 'today' };

/** @type {{name:string,href:'/today'|'/patterns'|'/profiles'|'/settings',label:string,icon:import('../../components/ui.js').IconName}[]} */
const tabs = [
  { name: 'today', href: '/today', label: 'Today', icon: 'reorder-four-outline' },
  { name: 'patterns', href: '/patterns', label: 'Patterns', icon: 'git-network-outline' },
  { name: 'profiles', href: '/profiles', label: 'Profiles', icon: 'albums-outline' },
  { name: 'settings', href: '/settings', label: 'Settings', icon: 'settings-outline' },
];

export default function TabLayout() {
  const { styles } = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      style={[styles.shell, { backgroundColor: colors.background }]}
      options={{ backBehavior: 'initialRoute' }}
    >
      <DockInset value={84}>
        <TabSlot style={styles.shell} />
      </DockInset>
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.dock, { bottom: insets.bottom + 6 }])}>
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <DockButton label={tab.label} icon={tab.icon} testID={`${tab.name}-tab`} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

/** @param {import('expo-router/ui').TabTriggerSlotProps & {label:string,icon:import('../../components/ui.js').IconName,testID:string}} props */
function DockButton({ label, icon, isFocused, testID, ...props }) {
  const { strands, styles } = useStyles();
  return (
    <Pressable
      {...props}
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(isFocused) }}
      style={({ pressed }) => [
        styles.button,
        isFocused ? styles.active : styles.idle,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={18} color={isFocused ? strands.ground : strands.soft} />
      {isFocused && <Copy style={styles.label}>{label}</Copy>}
    </Pressable>
  );
}

const useStyles = themed((strands) => {
  const styles = StyleSheet.create({
    shell: { flex: 1 },
    dock: {
      position: 'absolute',
      left: 16,
      right: 16,
      height: 64,
      flexDirection: 'row',
      gap: 4,
      padding: 6,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: strands.line,
      backgroundColor: strands.dock,
    },
    button: {
      minHeight: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    active: { flex: 2.2, backgroundColor: strands.text },
    idle: { flex: 1 },
    label: { fontFamily: fonts.semibold, fontSize: 14, color: strands.ground },
  });
  return styles;
});
