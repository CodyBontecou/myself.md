import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { scheduleOnRN } from 'react-native-worklets';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Storage from 'expo-sqlite/kv-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { qaEnabled } from '../../client/qa-runtime.js';
import { useTheme } from '../lib/theme.js';
import { useToast } from './Toast.js';

/** @typedef {Pick<import('react-native').PressableProps,'accessibilityActions'|'onAccessibilityAction'|'accessibilityHint'>} DockAccessibility */
export const NavigationDockContext = createContext(/** @type {DockAccessibility} */ ({}));

/** @typedef {'left'|'right'|'top'|'bottom'} Edge */
/** @typedef {{edge:Edge,offset:number}} Position */
const createPanGesture = Gesture.Pan;
const preferenceKey = qaEnabled ? 'qa-navigation-dock-v1' : 'navigation-dock-v1';
const length = 232;
const thickness = 64;
const margin = 12;
/** @returns {Position} */
function savedPosition() {
  try {
    const value = JSON.parse(Storage.getItemSync(preferenceKey) ?? 'null');
    if (
      value &&
      ['left', 'right', 'top', 'bottom'].includes(value.edge) &&
      Number.isFinite(value.offset) &&
      value.offset >= 0 &&
      value.offset <= 1
    )
      return value;
  } catch {}
  return { edge: 'right', offset: 0.5 };
}
/** @param {number} value @param {number} low @param {number} high */
function clamp(value, low, high) {
  'worklet';
  return Math.max(low, Math.min(value, Math.max(low, high)));
}
/** @param {{children:import('react').ReactNode}} props */
export default function FloatingNavigation({ children }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const [size, setSize] = useState({ width: screen.width, height: screen.height });
  const [position, setPosition] = useState(savedPosition);
  const showToast = useToast();
  const pathname = usePathname();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const hiddenForComposer = pathname.startsWith('/support') && keyboardVisible;
  const selectedIndex = pathname.startsWith('/settings')
    ? 3
    : pathname.startsWith('/support')
      ? 2
      : pathname.startsWith('/history')
        ? 1
        : 0;
  const selectionOffset = useSharedValue(selectedIndex * 56);
  useEffect(() => {
    selectionOffset.set(
      withTiming(selectedIndex * 56, {
        duration: 180,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [selectedIndex, selectionOffset]);
  const horizontal = position.edge === 'top' || position.edge === 'bottom';
  const dockWidth = horizontal ? length : thickness;
  const dockHeight = horizontal ? thickness : length;
  const minX = insets.left + margin;
  const minY = insets.top + margin;
  const maxX = Math.max(minX, size.width - insets.right - margin - dockWidth);
  const maxY = Math.max(minY, size.height - insets.bottom - margin - dockHeight);
  const x = useSharedValue(0),
    y = useSharedValue(0);
  const startX = useSharedValue(0),
    startY = useSharedValue(0);
  const velocityX = useSharedValue(0),
    velocityY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const initialized = useSharedValue(false);
  const glassAvailable = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const backgroundColor = glassAvailable ? 'transparent' : colors.surface;

  const commit = useCallback(
    /** @param {Position} next */ (next) => {
      setPosition(next);
      try {
        Storage.setItemSync(preferenceKey, JSON.stringify(next));
      } catch {
        showToast({
          message: 'Could not save the menu position. Please try again.',
          kind: 'error',
        });
      }
    },
    [showToast],
  );

  useEffect(() => {
    const targetX =
      position.edge === 'left'
        ? minX
        : position.edge === 'right'
          ? maxX
          : minX + (maxX - minX) * position.offset;
    const targetY =
      position.edge === 'top'
        ? minY
        : position.edge === 'bottom'
          ? maxY
          : minY + (maxY - minY) * position.offset;
    if (!initialized.get()) {
      x.set(targetX);
      y.set(targetY);
      initialized.set(true);
      return;
    }
    x.set(
      withSpring(targetX, {
        duration: 400,
        dampingRatio: 0.8,
        velocity: velocityX.get(),
        overshootClamping: true,
        reduceMotion: ReduceMotion.System,
      }),
    );
    y.set(
      withSpring(targetY, {
        duration: 400,
        dampingRatio: 0.8,
        velocity: velocityY.get(),
        overshootClamping: true,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [position, minX, minY, maxX, maxY, x, y, initialized, velocityX, velocityY]);

  const pan = useMemo(
    () =>
      createPanGesture()
        .activateAfterLongPress(250)
        .onStart(() => {
          'worklet';
          cancelAnimation(x);
          cancelAnimation(y);
          startX.set(x.get());
          startY.set(y.get());
          dragging.set(true);
        })
        .onUpdate((event) => {
          'worklet';
          x.set(clamp(startX.get() + event.translationX, minX, maxX));
          y.set(clamp(startY.get() + event.translationY, minY, maxY));
        })
        .onEnd((event) => {
          'worklet';
          const distances = [
            event.absoluteX - insets.left,
            size.width - insets.right - event.absoluteX,
            event.absoluteY - insets.top,
            size.height - insets.bottom - event.absoluteY,
          ];
          const nearest = distances.indexOf(Math.min(...distances));
          const edge = /** @type {Edge} */ (['left', 'right', 'top', 'bottom'][nearest]);
          const nextHorizontal = nearest >= 2;
          const low = nextHorizontal ? minX : minY;
          const high = nextHorizontal
            ? size.width - insets.right - margin - length
            : size.height - insets.bottom - margin - length;
          const center = nextHorizontal ? x.get() + dockWidth / 2 : y.get() + dockHeight / 2;
          const offset =
            high > low ? (clamp(center - length / 2, low, high) - low) / (high - low) : 0.5;
          velocityX.set(event.velocityX);
          velocityY.set(event.velocityY);
          scheduleOnRN(commit, { edge, offset });
        })
        .onFinalize((_event, success) => {
          'worklet';
          const wasDragging = dragging.get();
          dragging.set(false);
          if (!success && wasDragging) {
            x.set(
              withSpring(startX.get(), {
                duration: 400,
                dampingRatio: 1,
                reduceMotion: ReduceMotion.System,
              }),
            );
            y.set(
              withSpring(startY.get(), {
                duration: 400,
                dampingRatio: 1,
                reduceMotion: ReduceMotion.System,
              }),
            );
          }
        }),
    [
      x,
      y,
      startX,
      startY,
      velocityX,
      velocityY,
      dragging,
      minX,
      minY,
      maxX,
      maxY,
      insets,
      size,
      dockWidth,
      dockHeight,
      commit,
    ],
  );

  const accessibility = useMemo(
    () =>
      /** @type {DockAccessibility} */ ({
        accessibilityHint:
          'Tap to open. Hold and drag to move the menu, or use accessibility actions.',
        accessibilityActions: [
          { name: 'left', label: 'Move to left edge' },
          { name: 'right', label: 'Move to right edge' },
          { name: 'top', label: 'Move to top edge' },
          { name: 'bottom', label: 'Move to bottom edge' },
          { name: 'increment', label: 'Move along edge forward' },
          { name: 'decrement', label: 'Move along edge backward' },
        ],
        onAccessibilityAction: ({ nativeEvent }) => {
          const action = nativeEvent.actionName;
          if (action === 'increment' || action === 'decrement')
            commit({
              ...position,
              offset: clamp(position.offset + (action === 'increment' ? 0.1 : -0.1), 0, 1),
            });
          else if (
            action === 'left' ||
            action === 'right' ||
            action === 'top' ||
            action === 'bottom'
          )
            commit({ edge: action, offset: 0.5 });
        },
      }),
    [commit, position],
  );

  const selectionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: horizontal ? selectionOffset.get() : 0 },
      { translateY: horizontal ? 0 : selectionOffset.get() },
    ],
  }));
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: dragging.get() ? 1.03 : 1 },
    ],
  }));
  return (
    <View
      pointerEvents={hiddenForComposer ? 'none' : 'box-none'}
      accessibilityElementsHidden={hiddenForComposer}
      importantForAccessibility={hiddenForComposer ? 'no-hide-descendants' : 'auto'}
      style={[styles.overlay, hiddenForComposer && styles.hidden]}
      onLayout={({ nativeEvent }) =>
        setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })
      }
    >
      <NavigationDockContext value={accessibility}>
        <GestureDetector gesture={pan}>
          <Animated.View
            testID="navigation-dock"
            accessible={false}
            style={[
              styles.dock,
              horizontal ? styles.horizontal : styles.vertical,
              { backgroundColor, borderColor: colors.border },
              animatedStyle,
            ]}
          >
            {glassAvailable && (
              <GlassView
                pointerEvents="none"
                glassEffectStyle="regular"
                colorScheme={isDark ? 'dark' : 'light'}
                style={styles.glass}
              />
            )}
            <Animated.View
              pointerEvents="none"
              testID="navigation-selection"
              style={[styles.selection, { backgroundColor: colors.subtle }, selectionStyle]}
            />
            {children}
          </Animated.View>
        </GestureDetector>
      </NavigationDockContext>
    </View>
  );
}
const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  selection: { position: 'absolute', left: 8, top: 8, width: 48, height: 48, borderRadius: 24 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
  dock: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 32,
    borderCurve: 'continuous',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.16)',
  },
  horizontal: { flexDirection: 'row' },
  vertical: { flexDirection: 'column' },
  glass: { ...StyleSheet.absoluteFill, borderRadius: 32, borderCurve: 'continuous' },
});
