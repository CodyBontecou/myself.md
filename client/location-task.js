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
let collectionGeneration = 0;
let trackingOperation = Promise.resolve();
/** @param {()=>Promise<void>} action */
function changeTracking(action) {
  const next = trackingOperation.then(action);
  trackingOperation = next.catch(() => {});
  return next;
}
/** A durable deletion intent also blocks work resumed after a runtime restart.
 * @param {string} owner */
function deletingAccount(owner) {
  return Boolean(
    db.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='account_cleanup'",
    ) && db.getFirstSync('SELECT 1 FROM account_cleanup WHERE id=1 AND owner=?', owner),
  );
}
/** @param {string} owner @param {number} generation */
function currentCollection(owner, generation) {
  if (generation !== collectionGeneration || deletingAccount(owner))
    throw new Error('Location collection was stopped or account deletion is pending.');
}
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
db.execSync(
  'CREATE TABLE IF NOT EXISTS location_capture_receipts (owner TEXT,device TEXT,request TEXT,state TEXT,captured TEXT,acknowledged INTEGER DEFAULT 0,PRIMARY KEY(owner,device,request))',
);
const activeCaptures = new Set();
/** @typedef {{requestId:string,deviceId:string,valid:()=>boolean|Promise<boolean>}} CaptureOperation */
/** @typedef {{request:string,state:'running'|'completed'|'failed'|'cancelled',captured:string|null}} CaptureReceipt */
/** Receipts contain only operation state and time, never native coordinates.
 * @param {{owner:string,deviceId:string}} session */
export function pendingLocationCaptureReceipts(session) {
  return /** @type {CaptureReceipt[]} */ (
    db.getAllSync(
      'SELECT request,state,captured FROM location_capture_receipts WHERE owner=? AND device=? AND acknowledged=0',
      session.owner,
      session.deviceId,
    )
  ).filter((receipt) => !activeCaptures.has(receipt.request));
}
/** @param {{owner:string,deviceId:string}} session @param {string} requestId */
export function acknowledgeLocationCapture(session, requestId) {
  db.runSync(
    'UPDATE location_capture_receipts SET acknowledged=1 WHERE owner=? AND device=? AND request=?',
    session.owner,
    session.deviceId,
    requestId,
  );
}
/** Persist a declined owner review so a temporary connection failure can be retried safely.
 * @param {{owner:string,deviceId:string}} session @param {string} requestId */
export function declineLocationCapture(session, requestId) {
  db.runSync(
    'INSERT OR IGNORE INTO location_capture_receipts(owner,device,request,state) VALUES(?,?,?,?)',
    session.owner,
    session.deviceId,
    requestId,
    'cancelled',
  );
}
/** @param {string|null} owner */
function setTrackingOwner(owner) {
  db.runSync('INSERT OR REPLACE INTO tracking VALUES (1,?)', owner);
}
TaskManager.defineTask(locationTask, async ({ data, error }) => {
  if (error || !data) return;
  const owner = db.getFirstSync('SELECT owner FROM tracking WHERE id=1');
  const id = /** @type {{owner:string|null}|null} */ (owner)?.owner;
  if (!id || deletingAccount(id)) return;
  const points = /** @type {{locations:Location.LocationObject[]}} */ (data).locations;
  for (const point of points) saveRecord(id, record('location', 'points', 'expo-location', point));
});
export async function stopTracking() {
  collectionGeneration++;
  pendingDisclosureOwner = null;
  setTrackingOwner(null);
  await changeTracking(stopUpdates);
}
async function stopUpdates() {
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
  const generation = collectionGeneration;
  currentCollection(owner, generation);
  if (Platform.OS === 'android' && pendingDisclosureOwner !== owner) {
    if (!(await confirmRecording())) return null;
    currentCollection(owner, generation);
    pendingDisclosureOwner = owner;
  }
  try {
    await requireRecordingNotifications();
    currentCollection(owner, generation);
    const foreground = await Location.requestForegroundPermissionsAsync();
    currentCollection(owner, generation);
    if (!foreground.granted) throw new Error('Location permission was not granted.');
    let background = await Location.getBackgroundPermissionsAsync();
    currentCollection(owner, generation);
    if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
    currentCollection(owner, generation);
    // iOS Allow Once and denied Always access require a trip to Settings.
    if (!background.granted) return false;
    await changeTracking(async () => {
      currentCollection(owner, generation);
      setTrackingOwner(owner);
      try {
        await startUpdates();
        currentCollection(owner, generation);
      } catch (error) {
        if (generation === collectionGeneration) setTrackingOwner(null);
        if (generation !== collectionGeneration || deletingAccount(owner)) await stopUpdates();
        throw error;
      }
    });
    currentCollection(owner, generation);
    pendingDisclosureOwner = null;
    return true;
  } catch (error) {
    if (generation === collectionGeneration) pendingDisclosureOwner = null;
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
/** Save through the same native path for direct UI and owner-approved agent requests.
 * @param {string} owner @param {CaptureOperation} [operation] */
export async function captureLocation(owner, operation) {
  const generation = collectionGeneration;
  currentCollection(owner, generation);
  if (operation) {
    const prior = /** @type {CaptureReceipt|null} */ (
      db.getFirstSync(
        'SELECT request,state,captured FROM location_capture_receipts WHERE owner=? AND device=? AND request=?',
        owner,
        operation.deviceId,
        operation.requestId,
      )
    );
    if (prior?.state === 'completed' && prior.captured)
      return { capturedAt: prior.captured, recordCount: /** @type {const} */ (1) };
    if (prior)
      throw new Error(
        'A previous capture attempt was interrupted. Check the phone before approving another request.',
      );
    db.runSync(
      'INSERT INTO location_capture_receipts(owner,device,request,state) VALUES(?,?,?,?)',
      owner,
      operation.deviceId,
      operation.requestId,
      'running',
    );
    activeCaptures.add(operation.requestId);
  }
  try {
    if (operation && !(await operation.valid()))
      throw new Error('The Location capture account, request or connection changed.');
    currentCollection(owner, generation);
    if (!(await Location.requestForegroundPermissionsAsync()).granted)
      throw new Error('Location permission was not granted.');
    if (operation && !(await operation.valid()))
      throw new Error('The Location capture account, request or connection changed.');
    currentCollection(owner, generation);
    const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (operation && !(await operation.valid()))
      throw new Error('The Location capture account, request or connection changed.');
    currentCollection(owner, generation);
    const saved = record('location', 'points', 'expo-location', point);
    const capturedAt = saved.start ?? new Date(point.timestamp).toISOString();
    db.withTransactionSync(() => {
      saveRecord(owner, saved);
      if (operation)
        db.runSync(
          'UPDATE location_capture_receipts SET state=?,captured=? WHERE owner=? AND device=? AND request=?',
          'completed',
          capturedAt,
          owner,
          operation.deviceId,
          operation.requestId,
        );
    });
    return { capturedAt, recordCount: /** @type {const} */ (1) };
  } catch (error) {
    if (operation)
      db.runSync(
        'UPDATE location_capture_receipts SET state=? WHERE owner=? AND device=? AND request=?',
        'failed',
        owner,
        operation.deviceId,
        operation.requestId,
      );
    throw error;
  } finally {
    if (operation) activeCaptures.delete(operation.requestId);
  }
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
  const generation = collectionGeneration;
  await changeTracking(async () => {
    if (generation !== collectionGeneration) return;
    if (!(await Location.hasStartedLocationUpdatesAsync(legacyLocationTask))) return;
    const row = /** @type {{owner:string|null}|null} */ (
      db.getFirstSync('SELECT owner FROM tracking WHERE id=1')
    );
    await Location.stopLocationUpdatesAsync(legacyLocationTask);
    if (!row?.owner || generation !== collectionGeneration || deletingAccount(row.owner)) return;
    if (!(await Location.hasStartedLocationUpdatesAsync(locationTask))) {
      if (generation !== collectionGeneration || deletingAccount(row.owner)) return;
      await startUpdates();
      if (generation !== collectionGeneration || deletingAccount(row.owner)) await stopUpdates();
    }
  });
}
