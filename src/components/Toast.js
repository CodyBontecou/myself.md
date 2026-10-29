import { useEffect, useState, useSyncExternalStore } from 'react';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme.js';
import { Copy, Icon } from './ui.js';
import { errorMessage } from '../../packages/support-chat/errors.js';

/** @typedef {{label:string,onPress:()=>void,primary?:boolean}} ToastAction */
/** @typedef {{message:string,kind:'success'|'error'|'warning'|'loading',detail?:string|undefined,progress?:number|undefined,icon?:import('./ui.js').IconName,onPress?:()=>void,accessibilityLabel?:string,actions?:readonly [ToastAction]|readonly [ToastAction,ToastAction]}} Toast */
/** @type {Toast|null} */
let notification = null;
/** @type {Set<()=>void>} */
const listeners = new Set();
/** @param {Toast|null} toast */
function setToast(toast) {
  notification = toast;
  for (const listener of listeners) listener();
}
/** @param {Toast} toast */
export function showToast(toast) {
  let current = { ...toast, message: errorMessage(toast.message) };
  setToast(current);
  // An old operation must never replace a newer or dismissed notification.
  /** @param {Partial<Toast>} update */
  return (update) => {
    if (notification !== current) return;
    current = { ...current, ...update };
    setToast(current);
  };
}
/** @param {()=>void} listener */
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function snapshot() {
  return notification;
}

/** Keep native navigation screens from intercepting toast touches on iOS.
 * @param {{children:import('react').ReactNode}} props */
function ToastOverlay({ children }) {
  return Platform.OS === 'ios' ? (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
      {children}
    </FullWindowOverlay>
  ) : (
    children
  );
}

const MORPH = LinearTransition.duration(220).reduceMotion(ReduceMotion.System);
const STATUS_FADE = FadeIn.duration(140).reduceMotion(ReduceMotion.System);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Retain only the exiting pixels, never the active operation or its touch targets.
 * @param {Toast|null} active */
function useToastPresentation(active) {
  const [retained, setRetained] = useState(active);
  const visible = Boolean(active);
  const reducedMotion = useReducedMotion();
  const visibility = useSharedValue(0);
  if (active && retained !== active) setRetained(active);
  useEffect(() => {
    visibility.set(
      withTiming(visible ? 1 : 0, { duration: visible ? 220 : 140, easing: EASE_OUT }),
    );
    if (visible) return;
    const timer = setTimeout(() => setRetained(null), 140);
    return () => clearTimeout(timer);
  }, [visible, visibility]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: visibility.get(),
    transform: [
      { translateY: reducedMotion ? 0 : (1 - visibility.get()) * 8 },
      { scale: reducedMotion ? 1 : 0.96 + visibility.get() * 0.04 },
    ],
  }));
  return { toast: active ?? retained, animatedStyle, reducedMotion };
}

/** @param {{children:import('react').ReactNode}} props */
export function ToastProvider({ children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const active = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { toast, animatedStyle, reducedMotion } = useToastPresentation(active);
  const announcement = active?.message;
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);
  useEffect(() => {
    if (!active || active.kind === 'loading' || active.actions?.length || active.onPress) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [active]);
  const expanded = Boolean(
    toast?.detail || toast?.progress !== undefined || toast?.actions?.length,
  );
  const percentage =
    toast?.progress === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.floor(toast.progress)));
  return (
    <View style={styles.root}>
      {children}
      {toast && (
        <ToastOverlay>
          <View pointerEvents="box-none" style={[styles.overlay, { bottom: insets.bottom + 64 }]}>
            <Animated.View
              testID={active ? 'action-toast' : undefined}
              pointerEvents={active ? 'auto' : 'none'}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              {...(!reducedMotion && { layout: MORPH })}
              style={[
                styles.toast,
                expanded ? styles.expanded : styles.compact,
                animatedStyle,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Pressable
                testID="action-toast-content"
                accessibilityRole="button"
                accessibilityLabel={
                  toast.accessibilityLabel ?? `${toast.message}. Dismiss notification`
                }
                onPress={() => {
                  setToast(null);
                  toast.onPress?.();
                }}
                style={[styles.content, expanded && styles.expandedContent]}
              >
                <Animated.View
                  key={toast.kind}
                  {...(!reducedMotion && { entering: STATUS_FADE })}
                  style={styles.status}
                >
                  {toast.kind === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Icon
                      name={
                        toast.icon ??
                        (toast.kind === 'success'
                          ? 'checkmark-circle-outline'
                          : 'alert-circle-outline')
                      }
                      size={18}
                      color={toast.kind === 'error' ? colors.danger : colors.text}
                    />
                  )}
                </Animated.View>
                <View style={[styles.message, expanded && styles.expandedContent]}>
                  <View style={styles.heading}>
                    <Copy
                      testID="action-toast-message"
                      accessibilityRole="alert"
                      style={styles.title}
                    >
                      {toast.message}
                    </Copy>
                    {percentage !== undefined && (
                      <Copy testID="action-toast-percentage" style={styles.percentage}>
                        {percentage}%
                      </Copy>
                    )}
                  </View>
                  {toast.detail ? (
                    <Copy
                      testID="action-toast-detail"
                      variant="caption"
                      muted
                      style={styles.detail}
                    >
                      {toast.detail}
                    </Copy>
                  ) : null}
                  {percentage !== undefined && (
                    <View
                      testID="action-toast-progress"
                      accessibilityRole="progressbar"
                      accessibilityLabel="Export progress"
                      accessibilityValue={{ min: 0, max: 100, now: percentage }}
                      style={[styles.track, { backgroundColor: colors.subtle }]}
                    >
                      <Animated.View
                        {...(!reducedMotion && { layout: MORPH })}
                        style={[
                          styles.fill,
                          { backgroundColor: colors.accent, width: `${percentage}%` },
                        ]}
                      />
                    </View>
                  )}
                </View>
              </Pressable>
              {Boolean(toast.actions?.length) && (
                <View style={styles.actions}>
                  {toast.actions?.map((action, index) => (
                    <Pressable
                      key={action.label}
                      testID={`action-toast-action-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      onPress={() => {
                        setToast(null);
                        action.onPress();
                      }}
                      style={({ pressed }) => [
                        styles.action,
                        {
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.actionPill,
                          { backgroundColor: action.primary ? colors.accent : colors.subtle },
                        ]}
                      >
                        <Copy
                          style={[
                            styles.actionLabel,
                            { color: action.primary ? colors.onAccent : colors.text },
                          ]}
                        >
                          {action.label}
                        </Copy>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable
                testID="action-toast-dismiss"
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                onPress={() => setToast(null)}
                style={({ pressed }) => [styles.dismiss, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Icon name="close" size={18} />
              </Pressable>
            </Animated.View>
          </View>
        </ToastOverlay>
      )}
    </View>
  );
}

export function useToast() {
  return showToast;
}

/** @param {{error:unknown}} props */
export function ErrorToast({ error }) {
  useEffect(() => {
    if (error) showToast({ message: errorMessage(error), kind: 'error' });
  }, [error]);
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 560,
    minHeight: 52,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  compact: { flexShrink: 1 },
  expanded: { width: '100%' },
  status: { width: 20, alignItems: 'center', justifyContent: 'center' },
  content: {
    flexShrink: 1,
    minWidth: 120,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  expandedContent: { flexGrow: 1 },
  message: { flexShrink: 1, gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  percentage: { fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12, lineHeight: 18 },
  track: { height: 3, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
