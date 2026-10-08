import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import OnboardingFrame from '../../components/OnboardingFrame';
import { Button, Copy, Icon } from '../../components/ui';
import { useTheme } from '../../lib/theme';

/** @type {{icon:import('../../components/ui').IconName,title:string,body:string}[]} */
const controls = [
  {
    icon: 'options-outline',
    title: 'Choose exactly what to include',
    body: 'Profiles define data types, date ranges, and export destinations.',
  },
  {
    icon: 'hand-left-outline',
    title: 'Allow access when you’re ready',
    body: 'Enable sources individually. Your phone asks for permission when a source needs it.',
  },
  {
    icon: 'unlink-outline',
    title: 'Disconnect whenever you need',
    body: 'Disconnecting stops agent queries and scheduled exports. Files already shared stay at their destination.',
  },
];
export default function Privacy() {
  const { colors } = useTheme();
  return (
    <OnboardingFrame
      step={2}
      title={'A useful bridge.\nYou hold the keys.'}
      body="You decide what your agent can access and where your exports go."
      footer={
        <>
          <Button
            label="Continue"
            icon="arrow-forward"
            onPress={() => router.navigate('/onboarding/setup')}
          />
          <Copy variant="caption" muted style={styles.center}>
            This introduction doesn’t enable sharing.
          </Copy>
        </>
      }
    >
      <View style={[styles.emblem, { backgroundColor: colors.accentSoft }]}>
        <Icon name="shield-checkmark-outline" color={colors.accent} size={44} />
      </View>
      <View style={styles.controls}>
        {controls.map((control) => (
          <View key={control.title} style={styles.row}>
            <Icon name={control.icon} color={colors.accent} size={24} />
            <View style={styles.rowText}>
              <Copy variant="heading">{control.title}</Copy>
              <Copy muted>{control.body}</Copy>
            </View>
          </View>
        ))}
      </View>
    </OnboardingFrame>
  );
}
const styles = StyleSheet.create({
  emblem: {
    width: 88,
    height: 88,
    borderRadius: 20,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: { gap: 28 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  rowText: { flex: 1, gap: 8 },
  center: { textAlign: 'center' },
});
