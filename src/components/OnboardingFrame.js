import { ErrorToast } from './Toast.js';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboarding } from '../../client/onboarding';
import { useTheme } from '../lib/theme';
import { Copy, Button } from './ui';

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
  return (
    <Button label={label} onPress={onPress} secondary={secondary} {...(testID ? { testID } : {})} />
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
});
