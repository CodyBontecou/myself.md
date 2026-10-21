import { openDatabaseSync } from 'expo-sqlite';
import { qaEnabled } from './qa-runtime.js';

/** @type {import('expo-sqlite').SQLiteDatabase|undefined} */
let database;

// Even module initialization and background callbacks must stay in the fixture partition.
export function phoneDatabase() {
  // Retain one wrapper. Reopening Expo's cached native handle can leave existing
  // callers using a released SharedRef after another wrapper is collected.
  database ??= openDatabaseSync(qaEnabled ? 'argent-qa-data.sqlite' : 'phone-data.sqlite', {
    useNewConnection: true,
  });
  return database;
}
