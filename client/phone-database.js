import { openDatabaseSync } from 'expo-sqlite';
import { qaEnabled } from './qa-runtime.js';

// Even module initialization and background callbacks must stay in the fixture partition.
export function phoneDatabase() {
  return openDatabaseSync(qaEnabled ? 'argent-qa-data.sqlite' : 'phone-data.sqlite');
}
