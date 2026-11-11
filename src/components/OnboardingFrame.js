import { ErrorToast } from './Toast.js';
import { useRef, useState } from 'react';
import { router, Stack, useNavigation } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import StrandsMark from './StrandsMark.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboarding } from '../../client/onboarding';
import { useTheme } from '../lib/theme';
import { Copy, Button, Icon } from './ui';

function renderBackButton() {
  return (
    <Pressable
      testID="onboarding-back"
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => router.back()}
      style={styles.backButton}
    >
      <Icon name="chevron-back" size={28} />
    </Pressable>
  );
}

/** @param {{canGoBack?:boolean}} props */
function renderHeaderBack({ canGoBack }) {
  return canGoBack ? renderBackButton() : null;
}

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

function renderNoHeaderItems() {
  return [];
}
/** @returns {{type:'custom',element:import('react').ReactElement,hidesSharedBackground:boolean}[]} */
function renderSkipHeaderItems() {
  return [{ type: 'custom', element: renderSkipButton(), hidesSharedBackground: true }];
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
      filled={!secondary}
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
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { error } = useOnboarding();
  const container = useRef(/** @type {View|null} */ (null));
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  return (
    <View
      ref={container}
      onLayout={() => container.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}
      style={[styles.background, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        testID={testID}
        collapsable={false}
        style={styles.fill}
      >
        <Stack.Screen
          options={{
            headerRight: disabled ? renderNoSkipButton : renderSkipButton,
            headerLeft: renderHeaderBack,
            headerBackVisible: false,
            unstable_headerRightItems: disabled ? renderNoHeaderItems : renderSkipHeaderItems,
            unstable_headerLeftItems: () =>
              navigation.getState()?.index
                ? [{ type: 'custom', element: renderBackButton(), hidesSharedBackground: true }]
                : [],
            // Android ScrollView does not add automatic insets for an overlaid header.
            headerTransparent: Platform.OS !== 'android',
            headerStyle: {
              backgroundColor: Platform.OS === 'android' ? colors.background : 'transparent',
            },
          }}
        />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={styles.fill}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.column}>
            <StrandsMark height={72} />
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
  backButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  background: { flex: 1, overflow: 'hidden' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  column: { width: '100%', maxWidth: 560, gap: 20 },
  heading: { gap: 10 },
  title: { fontSize: 36, lineHeight: 39, letterSpacing: -1.1 },
  body: { fontSize: 15, lineHeight: 22 },
  footer: { paddingHorizontal: 16, paddingTop: 12, alignItems: 'center' },
  actions: {
    width: '100%',
    maxWidth: 560,
    gap: 8,
    alignItems: 'stretch',
  },
});
