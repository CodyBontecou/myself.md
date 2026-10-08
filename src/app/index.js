import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { useOnboarding } from '../../client/onboarding';
export default function Index() {
  const { complete, destination, resetDestination } = useOnboarding();
  // Consume the setup choice once; later returns to / open Profiles.
  const [target] = useState(complete ? destination : '/onboarding');
  useEffect(resetDestination, [resetDestination]);
  return <Redirect href={target} />;
}
