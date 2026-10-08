import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useOnboarding } from '../../client/onboarding';
export default function Index() {
  const { complete, destination, resetDestination } = useOnboarding();
  const navigation =
    /** @type {import('expo-router/react-navigation').NavigationProp<{'(tabs)':undefined,pair:undefined}>} */ (
      useNavigation()
    );
  // Consume the setup choice once; later returns to / open Profiles.
  const [target] = useState(complete ? destination : '/onboarding');
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    resetDestination();
    // Pairing is optional: leave the app underneath it so Back returns home.
    if (target === '/pair') {
      navigation.reset({ index: 1, routes: [{ name: '(tabs)' }, { name: 'pair' }] });
    } else {
      router.replace(target);
    }
  }, [target, resetDestination, navigation]);
  return null;
}
