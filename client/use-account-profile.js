import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api } from './session.js';

const accountProfile = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  picture: z.url().startsWith('https://').nullable(),
});
/** @typedef {import('zod').infer<typeof accountProfile>} AccountProfile */

/** @param {import('./session.js').Session|null} session */
export function useAccountProfile(session) {
  const [loaded, setLoaded] = useState(
    /** @type {{session:import('./session.js').Session,profile:AccountProfile}|null} */ (null),
  );
  useEffect(() => {
    if (!session?.owner || session.requiresSignIn) return;
    let active = true;
    void api(session, '/api/account-profile')
      .then((value) => {
        const profile = accountProfile.parse(value);
        if (active) setLoaded({ session, profile });
        return undefined;
      })
      // A missing profile must never prevent access to account controls.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session]);
  return loaded?.session === session && !session?.requiresSignIn ? loaded?.profile : null;
}
