import { defaultExportSchema } from '../core/export-schemas.js';
import { errorJSON } from '../packages/support-chat/errors.js';
import { createContext, useContext, useRef, useState } from 'react';
import { parseProfile } from '../core/profiles.js';

/** @typedef {{profile:import('../core/profiles.js').ProfileDraft,id:string,onSaved:(()=>void)|undefined}} EditSession */
const EditorContext = createContext(/** @type {ReturnType<typeof useEditorState>|null} */ (null));
function useEditorState() {
  const [session, setSession] = useState(/** @type {EditSession|null} */ (null));
  const [draft, setDraft] = useState(() =>
    parseProfile({
      schema: 'myself.md.profile.v1',
      name: 'Profile',
      export: { schema: defaultExportSchema },
      selection: { health: [], time: [], location: [] },
    }),
  );
  const [saved, setSaved] = useState(/** @type {{id:string,location:boolean}|null} */ (null));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const [original, setOriginal] = useState('');
  /** @param {import('../core/profiles.js').ProfileDraft} profile @param {string} [id] @param {()=>void} [onSaved] */
  function start(profile, id = '', onSaved) {
    const parsed = parseProfile(profile);
    setOriginal(JSON.stringify(parsed));
    setDraft(parsed);
    setSession({ profile: parsed, id, onSaved });
    setError('');
    setSaved(null);
  }
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorJSON(e));
    } finally {
      running.current = false;
      setWorking(false);
    }
  }
  return {
    session,
    draft,
    setDraft,
    start,
    working,
    error,
    run,
    saved,
    setSaved,
    dirty: JSON.stringify(draft) !== original,
  };
}
/** @param {{children:import('react').ReactNode}} props */
export function ProfileEditorProvider({ children }) {
  const value = useEditorState();
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
export function useProfileEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error('Profile editor provider is required.');
  return value;
}
