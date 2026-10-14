import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme.js';
import { Copy, Icon } from './ui.js';
import { errorMessage } from '../../packages/support-chat/errors.js';

/** @typedef {{label:string,onPress:()=>void,primary?:boolean}} ToastAction */
/** @typedef {{message:string,kind:'success'|'error'|'warning',icon?:import('./ui.js').IconName,actions?:readonly [ToastAction]|readonly [ToastAction,ToastAction]}} Toast */
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
  setToast({ ...toast, message: errorMessage(toast.message) });
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

/** @param {{children:import('react').ReactNode}} props */
export function ToastProvider({ children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.message);
    if (toast.actions?.length) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <View style={styles.root}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={[styles.overlay, { bottom: insets.bottom + 64 }]}>
          <View
            testID="action-toast"
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.content}>
              <Icon
                name={
                  toast.icon ??
                  (toast.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline')
                }
                size={18}
                color={toast.kind === 'error' ? colors.danger : colors.text}
              />
              <Copy testID="action-toast-message" accessibilityRole="alert" style={styles.message}>
                {toast.message}
              </Copy>
            </View>
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
          </View>
        </View>
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
    width: '100%',
    minHeight: 48,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  content: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  message: { flex: 1, fontSize: 14, lineHeight: 20 },
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
