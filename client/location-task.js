import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { record } from '../core/data.js';
import { saveRecord } from './library.js';
const locationTask = 'qr-connect-location';
const db = SQLite.openDatabaseSync('phone-data.sqlite');
db.execSync('CREATE TABLE IF NOT EXISTS tracking (id INTEGER PRIMARY KEY, owner TEXT)');
/** @param {string|null} owner */
function setTrackingOwner(owner) {
  db.runSync('INSERT OR REPLACE INTO tracking VALUES (1,?)', owner);
}
TaskManager.defineTask(locationTask, async ({ data, error }) => {
  if (error || !data) return;
  const owner = db.getFirstSync('SELECT owner FROM tracking WHERE id=1');
  const id = /** @type {{owner:string|null}|null} */ (owner)?.owner;
  if (!id) return;
  const points = /** @type {{locations:Location.LocationObject[]}} */ (data).locations;
  for (const point of points) saveRecord(id, record('location', 'points', 'expo-location', point));
});
export async function stopTracking() {
  setTrackingOwner(null);
  if (await Location.hasStartedLocationUpdatesAsync(locationTask))
    await Location.stopLocationUpdatesAsync(locationTask);
}
/** @param {string} owner @returns {Promise<boolean>} */
export async function startTracking(owner) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Location permission was not granted.');
  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
  // iOS Allow Once and denied Always access require a trip to Settings.
  if (!background.granted) return false;
  setTrackingOwner(owner);
  try {
    await Location.startLocationUpdatesAsync(locationTask, {
      accuracy: Location.Accuracy.Highest,
      distanceInterval: 5,
      timeInterval: 10000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'myself.md is recording location',
        notificationBody: 'Stop recording in myself.md.',
      },
    });
    return true;
  } catch (error) {
    setTrackingOwner(null);
    throw error;
  }
}
/** @param {string} owner */
async function tracking(owner) {
  const row = db.getFirstSync('SELECT owner FROM tracking WHERE id=1');
  return (
    /** @type {{owner:string|null}|null} */ (row)?.owner === owner &&
    (await Location.hasStartedLocationUpdatesAsync(locationTask))
  );
}
/** @param {string} owner */
export async function captureLocation(owner) {
  if (!(await Location.requestForegroundPermissionsAsync()).granted)
    throw new Error('Location permission was not granted.');
  const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  saveRecord(owner, record('location', 'points', 'expo-location', point));
}

/** @param {string} owner */
export async function locationStatus(owner) {
  const background = await Location.getBackgroundPermissionsAsync();
  const foreground = await Location.getForegroundPermissionsAsync();
  const summary = /** @type {{count:number,last:string|null}} */ (
    db.getFirstSync(
      "SELECT COUNT(*) AS count,MAX(start) AS last FROM records WHERE owner=? AND domain='location' AND source='expo-location'",
      owner,
    )
  );
  return {
    backgroundGranted: background.granted,
    permission: background.granted
      ? 'Always allowed'
      : foreground.granted
        ? 'While using the app only'
        : 'Location access is off',
    tracking: await tracking(owner),
    count: summary.count,
    last: summary.last,
  };
}
