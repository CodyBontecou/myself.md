import { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme.js';
import { Copy, Icon } from './ui.js';

/** @typedef {{message:string,kind:'success'|'error'|'warning'}} Toast */
const ToastContext = createContext(/** @type {(toast:Toast)=>void} */ (() => {}));

/** @param {{children:import('react').ReactNode}} props */
export function ToastProvider({ children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(/** @type {Toast|null} */ (null));
  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.message);
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={setToast}>
      <View style={styles.root}>
        {children}
        {toast && (
          <View pointerEvents="box-none" style={[styles.overlay, { bottom: insets.bottom + 152 }]}>
            <Pressable
              testID="action-toast"
              accessibilityRole="button"
              accessibilityLabel={`${toast.message} Dismiss notification`}
              onPress={() => setToast(null)}
              style={({ pressed }) => [
                styles.toast,
                {
                  backgroundColor: colors.accent,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon
                name={
                  toast.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'
                }
                size={22}
                color={colors.onAccent}
              />
              <Copy
                testID="action-toast-message"
                accessibilityRole="alert"
                style={[styles.message, { color: colors.onAccent }]}
              >
                {toast.message}
              </Copy>
            </Pressable>
          </View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
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
    width: '100%',
    maxWidth: 560,
    minHeight: 48,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: { flex: 1 },
});
