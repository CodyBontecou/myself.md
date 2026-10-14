import { ErrorToast } from './Toast.js';
import { useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboarding } from '../../client/onboarding';
import { useTheme } from '../lib/theme';
import { Copy, Button } from './ui';

/** @param {{disabled:boolean}} props */
function SkipButton({ disabled }) {
  const { finish } = useOnboarding();
  return (
    <OnboardingButton
      testID="onboarding-skip"
      label="Skip"
      secondary
      disabled={disabled}
      onPress={() => finish('/profiles')}
    />
  );
}

function renderSkipButton() {
  return <SkipButton disabled={false} />;
}
function renderNoSkipButton() {
  return null;
}

/** @param {{label:string,onPress:()=>void,secondary?:boolean,testID?:string,disabled?:boolean,busy?:boolean}} props */
export function OnboardingButton({
  label,
  onPress,
  secondary = false,
  testID,
  disabled = false,
  busy = false,
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      secondary={secondary}
      disabled={disabled}
      busy={busy}
      {...(testID ? { testID } : {})}
    />
  );
}

/** @param {{title:string,body:string,children:import('react').ReactNode,footer:import('react').ReactNode,testID:string,disabled?:boolean}} props */
export default function OnboardingFrame({
  title,
  body,
  children,
  footer,
  testID,
  disabled = false,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { error } = useOnboarding();
  const container = useRef(/** @type {View|null} */ (null));
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  return (
    <View
      ref={container}
      onLayout={() => container.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}
      style={styles.fill}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        testID={testID}
        collapsable={false}
        style={[styles.fill, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ headerRight: disabled ? renderNoSkipButton : renderSkipButton }} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
      </KeyboardAvoidingView>
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
