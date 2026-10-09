import { privacyPolicy } from '../../core/privacy.js';
import { Button, Copy, Screen } from '../components/ui';
import { openPrivacyLink } from '../components/PrivacyLinks';

export default function PrivacyPolicy() {
  return (
    <Screen testID="privacy-policy-screen">
      <Copy variant="title">{privacyPolicy.title}</Copy>
      <Copy muted>Updated {privacyPolicy.updated}</Copy>
      {privacyPolicy.sections.map((section) => (
        <Copy key={section.title} selectable>
          {section.title}
          {'\n\n'}
          {section.body}
        </Copy>
      ))}
      <Button
        label="Open published policy"
        secondary
        onPress={() => void openPrivacyLink(privacyPolicy.url)}
      />
      <Button
        label="Email support"
        secondary
        onPress={() => void openPrivacyLink(`mailto:${privacyPolicy.supportEmail}`)}
      />
      <Button
        label="GitHub issues"
        secondary
        onPress={() => void openPrivacyLink(privacyPolicy.issuesUrl)}
      />
    </Screen>
  );
}
