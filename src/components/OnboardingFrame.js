import { ErrorToast } from './Toast.js';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboarding } from '../../client/onboarding';
import { useTheme } from '../lib/theme';
import { Copy } from './ui';

function SkipButton() {
  const { finish } = useOnboarding();
  return (
    <OnboardingButton
      testID="onboarding-skip"
      label="Skip"
      secondary
      onPress={() => finish('/profiles')}
    />
  );
}

function renderSkipButton() {
  return <SkipButton />;
}

/** @param {{label:string,onPress:()=>void,secondary?:boolean,testID?:string}} props */
export function OnboardingButton({ label, onPress, secondary = false, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: secondary ? 'transparent' : colors.text, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Copy
        style={[styles.buttonLabel, { color: secondary ? colors.secondary : colors.background }]}
      >
        {label}
      </Copy>
    </Pressable>
  );
}

/** @param {{title:string,body:string,children:import('react').ReactNode,footer:import('react').ReactNode,testID:string}} props */
export default function OnboardingFrame({ title, body, children, footer, testID }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { error } = useOnboarding();
  return (
    <View
      testID={testID}
      collapsable={false}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ headerRight: renderSkipButton }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.fill}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.column}>
          <View style={styles.heading}>
            <Copy variant="title" style={styles.title}>
              {title}
            </Copy>
            <Copy muted style={styles.body}>
              {body}
            </Copy>
          </View>
          {children}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.actions}>
          <ErrorToast error={error} />
          {footer}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  column: { width: '100%', maxWidth: 560, gap: 24 },
  heading: { gap: 8 },
  title: { fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  body: { fontSize: 14, lineHeight: 21 },
  footer: { paddingHorizontal: 16, paddingTop: 12, alignItems: 'center' },
  actions: { width: '100%', maxWidth: 560, gap: 12 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
