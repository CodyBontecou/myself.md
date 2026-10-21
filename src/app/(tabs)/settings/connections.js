import { Redirect } from 'expo-router';

// Existing links now lead to the profiles that own data access.
export default function ConnectionsRedirect() {
  return <Redirect href="/profiles" />;
}
