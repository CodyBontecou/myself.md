import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../lib/theme';

/** Decorative braid of the Place, Attention and Body strands.
 * @param {{height?:number}} props */
export default function StrandsMark({ height = 96 }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.mark}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={height} viewBox="0 0 342 150" preserveAspectRatio="none">
        <Path
          d="M4 30 C 60 30, 80 120, 171 75 S 280 30, 338 120"
          fill="none"
          stroke={colors.place}
          strokeWidth={10}
          strokeLinecap="round"
          strokeOpacity={0.9}
        />
        <Path
          d="M4 75 C 60 140, 110 10, 171 75 S 290 140, 338 30"
          fill="none"
          stroke={colors.attention}
          strokeWidth={10}
          strokeLinecap="round"
          strokeOpacity={0.9}
        />
        <Path
          d="M4 120 C 70 60, 100 40, 171 75 S 270 110, 338 75"
          fill="none"
          stroke={colors.body}
          strokeWidth={10}
          strokeLinecap="round"
          strokeOpacity={0.9}
        />
      </Svg>
    </View>
  );
}

/** A short vertical bar in one strand's color, for list rows.
 * @param {{strand:'place'|'attention'|'body'}} props */
export function StrandBar({ strand }) {
  const { colors } = useTheme();
  return <View style={[styles.bar, { backgroundColor: colors[strand] }]} />;
}

/** One cell per free export, filled while it is still available.
 * @param {{used:number,total?:number}} props */
export function ExportAllowance({ used, total = 5 }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.allowance}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${Math.max(0, total - used)} of ${total} free exports remain`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            i < used
              ? { backgroundColor: colors.background, borderColor: colors.border }
              : { backgroundColor: colors.surface, borderColor: colors.place },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: '100%' },
  bar: { width: 8, height: 30, borderRadius: 4 },
  allowance: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1 },
});
