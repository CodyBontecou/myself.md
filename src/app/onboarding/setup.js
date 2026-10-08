import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useOnboarding } from '../../../client/onboarding';
import OnboardingFrame from '../../components/OnboardingFrame';
import { Button, Copy, Icon } from '../../components/ui';
import { useTheme } from '../../lib/theme';

/** @type {{id:'data'|'agent',icon:import('../../components/ui').IconName,title:string,body:string,detail:string}[]} */
const options = [
  {
    id: 'data',
    icon: 'layers-outline',
    title: 'Start with my data',
    body: 'Explore Health, Screen time, and Location. Enable only what you need.',
    detail: 'Recommended if you’re new here',
  },
  {
    id: 'agent',
    icon: 'qr-code-outline',
    title: 'Connect my agent',
    body: 'Have a pairing code? Scan it or paste its link to connect your chat.',
    detail: 'You’ll need a code from your agent',
  },
];
export default function Setup() {
  const { colors } = useTheme();
  const { finish } = useOnboarding();
  const [selection, setSelection] = useState(/** @type {'data'|'agent'} */ ('data'));
  return (
    <OnboardingFrame
      step={3}
      title={'Make your first\nconnection.'}
      body="Start wherever you’re ready. You can always do the other step from Settings."
      footer={
        <>
          <Button
            label={selection === 'data' ? 'Explore data sources' : 'Connect agent'}
            icon="arrow-forward"
            onPress={() => finish(selection === 'data' ? '/settings/connections' : '/pair')}
          />
          <Button label="Explore the app first" secondary onPress={() => finish('/profiles')} />
        </>
      }
    >
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={`${option.title}. ${option.body}. ${option.detail}.`}
            accessibilityState={{ checked: selection === option.id }}
            onPress={() => setSelection(option.id)}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: selection === option.id ? colors.accent : colors.border,
                backgroundColor: pressed
                  ? colors.subtle
                  : selection === option.id
                    ? colors.accentSoft
                    : colors.surface,
              },
            ]}
          >
            <View style={styles.choiceHeader}>
              <Icon name={option.icon} size={28} color={colors.accent} />
              <View style={styles.choiceTitle}>
                <Copy variant="heading">{option.title}</Copy>
              </View>
              <Icon
                name={selection === option.id ? 'radio-button-on' : 'radio-button-off'}
                size={24}
                color={selection === option.id ? colors.accent : colors.secondary}
              />
            </View>
            <Copy muted>{option.body}</Copy>
            <Copy variant="caption" style={{ color: colors.accent }}>
              {option.detail}
            </Copy>
          </Pressable>
        ))}
      </View>
      <View style={styles.tip}>
        <Icon name="information-circle-outline" color={colors.secondary} />
        <Copy variant="caption" muted style={styles.tipText}>
          Pairing is optional. You can create profiles and export files on this phone without an
          agent.
        </Copy>
      </View>
    </OnboardingFrame>
  );
}
const styles = StyleSheet.create({
  choices: { gap: 16 },
  choice: { padding: 20, gap: 12, borderWidth: 1, borderRadius: 20, borderCurve: 'continuous' },
  choiceHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  choiceTitle: { flex: 1 },
  tip: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipText: { flex: 1 },
});
