import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { phoneDatabase } from './phone-database.js';
import { record } from '../core/data.js';
import { saveRecord } from './library.js';
const locationTask = 'myselfmd-location';
const legacyLocationTask = 'qr-connect-location';
const db = phoneDatabase();
let pendingDisclosureOwner = /** @type {string|null} */ (null);
const recordingDisclosure =
  'myself.md collects precise location data to build your personal location history, even when the app is closed or not in use. Points are stored on this phone. Your export profiles and separate sharing approvals control whether points are sent to your chosen cloud, HTTPS destination or agent. Recording uses battery. You can stop it here or revoke location access in Android Settings. Notifications must be allowed so the recording notice stays visible.';

/** @returns {Promise<boolean>} */
function confirmRecording() {
  return new Promise((resolve) => {
    Alert.alert(
      'Record location in the background?',
      recordingDisclosure,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function requireRecordingNotifications() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('location-recording', {
    name: 'Location recording',
    importance: Notifications.AndroidImportance.LOW,
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      'Allow notifications in Android Settings before starting background recording.',
    );
  const channels = await Notifications.getNotificationChannelsAsync();
  if (
    channels.some(
      (channel) =>
        channel.id.endsWith(`:${locationTask}`) &&
        channel.importance === Notifications.AndroidImportance.NONE,
    )
  )
    throw new Error(
      'Enable the location recording notification channel in Android Settings, then retry.',
    );
}
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
  pendingDisclosureOwner = null;
  setTrackingOwner(null);
  await Promise.all(
    [locationTask, legacyLocationTask].map(async (task) => {
      if (await Location.hasStartedLocationUpdatesAsync(task))
        await Location.stopLocationUpdatesAsync(task);
    }),
  );
}
/** Returns null on cancelled disclosure, false while awaiting background permission.
 * @param {string} owner @returns {Promise<boolean|null>} */
export async function startTracking(owner) {
  if (Platform.OS === 'android' && pendingDisclosureOwner !== owner) {
    if (!(await confirmRecording())) return null;
    pendingDisclosureOwner = owner;
  }
  try {
    await requireRecordingNotifications();
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) throw new Error('Location permission was not granted.');
    let background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
    // iOS Allow Once and denied Always access require a trip to Settings.
    if (!background.granted) return false;
    setTrackingOwner(owner);
    try {
      await startUpdates();
      pendingDisclosureOwner = null;
      return true;
    } catch (error) {
      setTrackingOwner(null);
      throw error;
    }
  } catch (error) {
    pendingDisclosureOwner = null;
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
  const notificationPermission =
    Platform.OS === 'android'
      ? (await Notifications.getPermissionsAsync()).granted
        ? (await Notifications.getNotificationChannelsAsync()).some(
            (channel) =>
              channel.id.endsWith(`:${locationTask}`) &&
              channel.importance === Notifications.AndroidImportance.NONE,
          )
          ? 'blocked'
          : 'allowed'
        : 'required'
      : 'not-required';
  const summary = /** @type {{count:number,last:string|null}} */ (
    db.getFirstSync(
      "SELECT COUNT(*) AS count,MAX(start) AS last FROM records WHERE owner=? AND domain='location' AND source='expo-location'",
      owner,
    )
  );
  return {
    notificationPermission,
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

async function startUpdates() {
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
}
/** Move an already-authorized recording to the renamed native task on foreground upgrade. */
export async function migrateLocationTask() {
  if (!(await Location.hasStartedLocationUpdatesAsync(legacyLocationTask))) return;
  const row = /** @type {{owner:string|null}|null} */ (
    db.getFirstSync('SELECT owner FROM tracking WHERE id=1')
  );
  await Location.stopLocationUpdatesAsync(legacyLocationTask);
  if (!row?.owner) return;
  if (!(await Location.hasStartedLocationUpdatesAsync(locationTask))) await startUpdates();
}
