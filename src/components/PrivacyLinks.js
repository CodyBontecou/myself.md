import { showToast } from './Toast.js';
import { errorMessage } from '../../packages/support-chat/errors.js';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { privacyPolicy } from '../../core/privacy.js';
import { Row } from './ui';

/** Open a public resource with a recoverable error and its URL.
 * @param {string} url */
export async function openPrivacyLink(url) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    showToast({ message: errorMessage(error), kind: 'error' });
  }
}

export default function PrivacyLinks() {
  return (
    <>
      <Row
        testID="privacy-policy-link"
        title="Privacy policy"
        subtitle="Collection, retention, deletion and AI sharing"
        onPress={() => router.push('/privacy')}
      />
      <Row
        testID="support-link"
        title="Email support"
        subtitle={privacyPolicy.supportEmail}
        onPress={() => void openPrivacyLink(`mailto:${privacyPolicy.supportEmail}`)}
      />
      <Row
        testID="support-issues-link"
        title="GitHub issues"
        subtitle="Public bug reports · omit personal data"
        onPress={() => void openPrivacyLink(privacyPolicy.issuesUrl)}
      />
    </>
  );
}
