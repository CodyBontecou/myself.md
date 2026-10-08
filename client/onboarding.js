import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

const key = 'agent-bridge-onboarding-v1';
/** @typedef {'/profiles'|'/settings/connections'|'/pair'} Destination */
const Context = createContext(
  /** @type {{complete:boolean,destination:Destination,error:string,finish:(destination:Destination)=>void,resetDestination:()=>void}|null} */ (
    null
  ),
);

function readStatus() {
  try {
    return { complete: Storage.getItemSync(key) === 'complete', error: '' };
  } catch {
    return {
      complete: false,
      error: 'Your setup status could not be read. You can try finishing setup again.',
    };
  }
}

/** @param {{children:import('react').ReactNode}} props */
export function OnboardingProvider({ children }) {
  const [status, setStatus] = useState(readStatus);
  const [destination, setDestination] = useState(/** @type {Destination} */ ('/profiles'));
  const finish = useCallback((/** @type {Destination} */ target) => {
    try {
      Storage.setItemSync(key, 'complete');
      setDestination(target);
      setStatus({ complete: true, error: '' });
    } catch {
      setStatus({
        complete: false,
        error: 'Setup could not be saved on this phone. Please try again.',
      });
    }
  }, []);
  const resetDestination = useCallback(() => setDestination('/profiles'), []);
  const value = useMemo(
    () => ({ ...status, destination, finish, resetDestination }),
    [status, destination, finish, resetDestination],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error('Onboarding provider is required.');
  return value;
}
