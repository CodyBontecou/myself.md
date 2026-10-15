import { ErrorToast } from './Toast.js';
import { useRef, useState } from 'react';
import { router, Stack, useNavigation } from 'expo-router';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import portrait from '../../assets/myself-portrait.png';
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
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const portraitWidth = Math.min(width * 1.5, 760);
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
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Image
          source={portrait}
          resizeMode="contain"
          accessible={false}
          style={[
            styles.portrait,
            isDark ? styles.portraitDark : styles.portraitLight,
            {
              width: portraitWidth,
              height: portraitWidth * (1073 / 720),
              right: -portraitWidth * 0.3,
              tintColor: colors.text,
            },
          ]}
        />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
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
  portrait: { position: 'absolute', top: -64 },
  portraitLight: { opacity: 0.07 },
  portraitDark: { opacity: 0.1 },
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
  actions: {
    width: '100%',
    maxWidth: 560,
    gap: 12,
    alignItems: 'flex-end',
    paddingRight: 12,
  },
});
