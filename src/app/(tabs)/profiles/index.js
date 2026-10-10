import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import DataPanel from '../../../../client/DataPanel';
import { qaBannerEnabled } from '../../../../client/qa-runtime.js';
export default function ProfilesScreen() {
  return (
    <SafeAreaView edges={qaBannerEnabled ? [] : ['top']} style={styles.screen}>
      <DataPanel management />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ screen: { flex: 1 } });
