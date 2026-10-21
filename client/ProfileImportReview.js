import { Copy, SectionHeader } from '../src/components/ui.js';
import { StyleSheet, View } from 'react-native';
import { domains } from '../core/data.js';
/** @param {{review:import('../core/profile-compatibility.js').ProfileCompatibility}} props */
export default function ProfileImportReview({ review }) {
  const selected = domains.reduce(
    (count, domain) => count + review.profile.selection[domain].length,
    0,
  );
  return (
    <View testID="profile-import-review" style={styles.review}>
      <SectionHeader compact title="Ready for this phone" />
      <Copy variant="caption" muted>
        Equivalent data types are selected automatically. Saving does not allow agent access or turn
        on automatic exports.
      </Copy>
      {review.mapped.map((item) => (
        <Copy key={`${item.domain}:${item.from}`} testID={`profile-import-mapped-${item.from}`}>
          {item.label} · matched for this phone
        </Copy>
      ))}
      {review.unsupported.length > 0 && (
        <>
          <SectionHeader compact title="Not included on this phone" />
          <Copy variant="caption" muted>
            These selections cannot be imported here. The remaining data and file settings are ready
            to save. Your original shared profile stays unchanged.
          </Copy>
          {review.unsupported.map((item) => (
            <Copy
              key={`${item.domain}:${item.type}`}
              testID={`profile-import-unsupported-${item.type}`}
            >
              {item.label} · {item.reason}
            </Copy>
          ))}
        </>
      )}
      <Copy variant="caption" muted>
        Your phone will still need permission to read the selected data.
      </Copy>
      {selected === 0 && (
        <Copy testID="profile-import-empty">
          None of the selected data is available here. You can save the file settings and choose
          data later.
        </Copy>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ review: { gap: 8 } });
