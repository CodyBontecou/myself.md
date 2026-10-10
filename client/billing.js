import { phoneDatabase } from './phone-database.js';
import * as SecureStore from 'expo-secure-store';
import { exportAllowance, freeExports } from '../core/billing.js';
import { api, loadSession } from './session.js';
const db = phoneDatabase();
// Build-only local preview; never persist a purchase or grant server access.
const previewLifetime = process.env.EXPO_PUBLIC_PREVIEW_LIFETIME === '1';
db.execSync(`CREATE TABLE IF NOT EXISTS export_allowance (id TEXT PRIMARY KEY, state TEXT, offline INTEGER);
CREATE TABLE IF NOT EXISTS billing_cache (id INTEGER PRIMARY KEY, value TEXT);`);
const stored = /** @type {{value:string}|null} */ (
  db.getFirstSync('SELECT value FROM billing_cache WHERE id=1')
);
let remote = stored
  ? /** @type {import('../core/billing.js').ExportAllowance} */ (JSON.parse(stored.value))
  : exportAllowance(0, 0, false);
let nativeUnlocked = Boolean(
  db.getFirstSync('SELECT value FROM billing_cache WHERE id=2')?.value === 'true',
);
let blocked = false;
let promptVersion = 0;
/** @type {Set<()=>void>} */ const listeners = new Set();
function notify() {
  for (const listener of listeners) listener();
}
/** @param {()=>void} listener */
export function subscribeBilling(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function allowance() {
  const row = db.getFirstSync(
    "SELECT COALESCE(SUM(state='complete'),0) used, COALESCE(SUM(state='reserved'),0) reserved FROM export_allowance",
  );
  return {
    ...exportAllowance(
      Math.max(Number(row?.used ?? 0), remote.used),
      Math.max(Number(row?.reserved ?? 0), remote.reserved),
      previewLifetime || nativeUnlocked || remote.unlocked,
    ),
    promptVersion,
    previewLifetime,
  };
}
/** @param {import('../core/billing.js').ExportAllowance} value */
export function acceptAllowance(value) {
  remote = value;
  db.runSync('INSERT OR REPLACE INTO billing_cache VALUES (1,?)', JSON.stringify(value));
  notify();
}
/** @param {boolean} value */
function setNativeUnlocked(value) {
  nativeUnlocked = value;
  db.runSync('INSERT OR REPLACE INTO billing_cache VALUES (2,?)', String(value));
  notify();
}
/** @param {number} version */
export function takeBlockedPaywall(version) {
  if (version !== promptVersion) return false;
  const value = blocked;
  blocked = false;
  return value;
}
/** @param {import('./export-context.js').ExportContext} context */
async function billingSession(context) {
  if (previewLifetime && context.deviceId === 'local-device') return null;
  const session = await loadSession();
  if (context.deviceId === 'local-device') return session?.owner ? session : null;
  if (!session || session.deviceId !== context.deviceId || session.owner !== context.owner)
    throw new Error('Sign in to check your shared export allowance.');
  return session;
}
/** @typedef {{profileId:string,days:string[],formats:string[]}} ExportScope */
/** @param {import('./session.js').Session} session @param {string} action @param {string} [id] @param {{store:'ios'|'android',proof:string}} [purchase] @param {ExportScope} [scope] */
async function send(session, action, id, purchase, scope) {
  const offlineUses = /** @type {{id:string}[]} */ (
    db.getAllSync("SELECT id FROM export_allowance WHERE state='complete' LIMIT 5")
  ).map((row) => row.id);
  const result = /** @type {import('../core/billing.js').ExportAllowance} */ (
    await api(session, '/api/billing', {
      method: 'POST',
      body: JSON.stringify({ action, id, purchase, offlineUses, scope }),
    })
  );
  db.runSync('INSERT OR REPLACE INTO billing_cache VALUES (3,?)', session.owner);
  acceptAllowance(result);
  return result;
}
/** @param {import('./session.js').Session|null} session */
export async function syncBilling(session) {
  if (!session?.owner) {
    clearAccountAllowance();
    return;
  }
  const storedProof = await SecureStore.getItemAsync('lifetime-purchase-proof');
  if (storedProof) await send(session, 'purchase', undefined, JSON.parse(storedProof));
  else await send(session, 'sync');
}
/** @param {{store:'ios'|'android',proof:string}} proof */
export async function savePurchase(proof) {
  await SecureStore.setItemAsync('lifetime-purchase-proof', JSON.stringify(proof), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  const session = await loadSession();
  if (session?.owner) await send(session, 'purchase', undefined, proof);
  setNativeUnlocked(true);
}
/** @param {import('./export-context.js').ExportContext} context @param {string} id @param {ExportScope} [scope] */
export async function reserveExport(context, id, scope) {
  const existing = db.getFirstSync('SELECT id FROM export_allowance WHERE id=?', id);
  const session = await billingSession(context);
  if (session) {
    await syncBilling(session);
    try {
      await send(session, 'reserve', id, undefined, scope);
    } catch (error) {
      if (!remote.remaining && !remote.unlocked) {
        blocked = true;
        promptVersion++;
        notify();
      }
      throw error;
    }
  } else {
    if (existing) return;
    if (db.getFirstSync('SELECT value FROM billing_cache WHERE id=3') && !allowance().unlocked)
      throw new Error('Reconnect your account to use its shared free exports.');
    const current = allowance();
    if (!current.unlocked && !current.remaining) {
      blocked = true;
      promptVersion++;
      notify();
      throw new Error(
        `Your ${freeExports} free exports have been used. Unlock forever for $19.99.`,
      );
    }
  }
  db.runSync("INSERT OR IGNORE INTO export_allowance VALUES (?,'reserved',?)", id, session ? 0 : 1);
  notify();
}
/** @param {import('./export-context.js').ExportContext} context @param {string} id @param {boolean} used */
export async function settleExport(context, id, used) {
  if (used) db.runSync("UPDATE export_allowance SET state='complete' WHERE id=?", id);
  else db.runSync("DELETE FROM export_allowance WHERE id=? AND state='reserved'", id);
  notify();
  const session = await billingSession(context);
  if (session) await send(session, used ? 'complete' : 'release', id);
}
/** @param {2|5} milestone */
export function markPaywallSeen(milestone) {
  db.execSync(`CREATE TABLE IF NOT EXISTS billing_notices (milestone INTEGER PRIMARY KEY)`);
  db.runSync('INSERT OR IGNORE INTO billing_notices VALUES (?)', milestone);
}
/** @param {2|5} milestone */
export function paywallSeen(milestone) {
  db.execSync(`CREATE TABLE IF NOT EXISTS billing_notices (milestone INTEGER PRIMARY KEY)`);
  return Boolean(
    db.getFirstSync('SELECT milestone FROM billing_notices WHERE milestone=?', milestone),
  );
}

export async function clearNativePurchase() {
  const proof = await SecureStore.getItemAsync('lifetime-purchase-proof');
  if (proof) {
    await SecureStore.deleteItemAsync('lifetime-purchase-proof');
    acceptAllowance({ ...remote, unlocked: Boolean(remote.complimentary) });
  }
  setNativeUnlocked(false);
}

/** Drop account access on sign-out; an independent native purchase remains valid. */
export function clearAccountAllowance() {
  remote = exportAllowance(0, 0, false);
  db.runSync('DELETE FROM billing_cache WHERE id=1');
  notify();
}
