import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import OnboardingFrame from '../../components/OnboardingFrame';
import { Button, Copy, Icon } from '../../components/ui';
import { useTheme } from '../../lib/theme';

export default function Welcome() {
  const { colors } = useTheme();
  return (
    <OnboardingFrame
      step={1}
      title={'Your phone.\nMore useful in your chat.'}
      body="Give your agent context from your day, with the data you choose to share."
      footer={
        <>
          <Button
            label="Continue"
            icon="arrow-forward"
            onPress={() => router.navigate('/onboarding/privacy')}
          />
          <Copy variant="caption" muted style={styles.center}>
            No account needed to explore.
          </Copy>
        </>
      }
    >
      <View
        style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.previewHeader}>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Icon name="phone-portrait-outline" color={colors.accent} size={28} />
          </View>
          <View style={styles.label}>
            <Copy variant="heading">Context from your day</Copy>
            <Copy variant="caption" muted>
              Health · Screen time · Location
            </Copy>
          </View>
        </View>
        <View style={[styles.connection, { borderColor: colors.border }]}>
          <Icon name="arrow-down" color={colors.accent} size={24} />
          <Copy variant="caption" muted>
            Through a profile you control
          </Copy>
        </View>
        <View style={[styles.message, { backgroundColor: colors.subtle }]}>
          <Copy style={styles.semibold}>“How did I sleep this week?”</Copy>
          <Copy variant="caption" muted>
            Bring the context into the conversation.
          </Copy>
        </View>
        <Copy variant="caption" muted>
          Example question · availability depends on your data sources.
        </Copy>
      </View>
      <View style={styles.note}>
        <Icon name="options-outline" color={colors.accent} />
        <Copy muted style={styles.noteText}>
          Choose a source. Create a profile. Share on your terms.
        </Copy>
      </View>
    </OnboardingFrame>
  );
}
const styles = StyleSheet.create({
  preview: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 20,
  },
  previewHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, gap: 4 },
  connection: { borderLeftWidth: 1, marginLeft: 28, paddingLeft: 20, gap: 8 },
  message: { padding: 16, borderRadius: 16, borderCurve: 'continuous', gap: 8 },
  semibold: { fontWeight: '600' },
  note: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  noteText: { flex: 1 },
  center: { textAlign: 'center' },
});
