import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboarding } from '../../client/onboarding';
import { useTheme } from '../lib/theme';
import { Copy, Notice } from './ui';

function SkipButton() {
  const { finish } = useOnboarding();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip introduction"
      onPress={() => finish('/profiles')}
      style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Copy style={{ color: colors.accent }}>Skip</Copy>
    </Pressable>
  );
}

function renderSkipButton() {
  return <SkipButton />;
}

/** @param {{step:number,title:string,body:string,children:import('react').ReactNode,footer:import('react').ReactNode}} props */
export default function OnboardingFrame({ step, title, body, children, footer }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { error } = useOnboarding();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
    >
      <Stack.Screen options={{ headerRight: renderSkipButton }} />
      <View style={styles.column}>
        <View style={styles.progress} accessible accessibilityLabel={`Step ${step} of 3`}>
          {[1, 2, 3].map((part) => (
            <View
              key={part}
              style={[
                styles.segment,
                { backgroundColor: part <= step ? colors.accent : colors.border },
              ]}
            />
          ))}
        </View>
        <View style={styles.content}>
          <View style={styles.heading}>
            <Copy variant="caption" muted style={styles.eyebrow}>
              AGENT BRIDGE
            </Copy>
            <Copy variant="title" style={styles.title}>
              {title}
            </Copy>
            <Copy muted style={styles.body}>
              {body}
            </Copy>
          </View>
          {children}
        </View>
        <View style={styles.footer}>
          {error ? <Notice title="Setup needs attention" body={error} /> : null}
          {footer}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 16 },
  column: { flexGrow: 1, width: '100%', maxWidth: 560, gap: 32 },
  progress: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, height: 4, borderRadius: 2, borderCurve: 'continuous' },
  content: { flexGrow: 1, gap: 32 },
  heading: { gap: 12 },
  eyebrow: { fontWeight: '600', letterSpacing: 2 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  body: { fontSize: 17, lineHeight: 24 },
  footer: { gap: 16 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
