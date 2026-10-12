import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { uploadCloudFile } from './destinations.js';
import {
  sandboxPurchaseDelivery,
  buyLifetime,
  restoreLifetime,
  lifetimeProduct,
} from './store-purchases.js';
const origin = 'https://cloud-qa.myself.md';
/** @typedef {{id:string,bytes:number}} QaFile */
/** @type {{account:string,purchaseRequired:boolean,profile:import('../core/profiles.js').ExportProfile,uploadToken:string}|null} */
let account = null;
let code = '';
/** @type {import('../core/cloud-allowance.js').CloudAllowance|null} */
let usage = null;
/** @type {QaFile[]} */
let files = [];
let transactionId = '';
/** @param {string} path @param {string} [method] @param {unknown} [body] */
async function request(path, method = 'GET', body = undefined) {
  if (!__DEV__ || !code) throw new Error('Connect the isolated test account first.');
  if (body !== undefined && method === 'GET') throw new Error('GET cannot carry purchase proof.');
  const response = await fetch(origin + path, {
    method,
    headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
  });
  const output = await response.json();
  if (!response.ok)
    throw new Error(`${response.status}: ${output.error ?? 'Cloud request failed.'}`);
  return output;
}
export function liveCloudState() {
  return {
    realCloud: true,
    isolated: true,
    account: account?.account ?? null,
    purchaseRequired: account?.purchaseRequired ?? false,
    transactionId,
    usage,
    files: [...files],
  };
}
/** @param {()=>void} completed */
export function connectSandboxPurchases(completed) {
  if (!account?.purchaseRequired) throw new Error('Connect the isolated sandbox account first.');
  return sandboxPurchaseDelivery(async (purchase) => {
    const output = await request('/qa/purchase', 'POST', {
      action: 'purchase',
      purchase: { store: Platform.OS === 'ios' ? 'ios' : 'android', proof: purchase.purchaseToken },
    });
    if (!output.unlocked || !output.transactionId) throw new Error('Sandbox verification failed.');
    transactionId = output.transactionId;
    await refreshLiveCloud();
  }, completed);
}
export async function buySandboxLifetime() {
  if (!account?.purchaseRequired) throw new Error('Connect the isolated sandbox account first.');
  const product = await lifetimeProduct();
  await buyLifetime();
  return { outcome: 'awaiting-store', price: product.displayPrice };
}
export async function restoreSandboxLifetime() {
  if (!account?.purchaseRequired) throw new Error('Connect the isolated sandbox account first.');
  await restoreLifetime(true);
  return liveCloudState();
}
export async function refreshLiveCloud() {
  usage = await request('/api/cloud/status');
  files = (await request('/api/cloud/exports')).map((/** @type {QaFile} */ file) => ({
    id: file.id,
    bytes: file.bytes,
  }));
  return liveCloudState();
}
/** @param {unknown} value */
export async function connectLiveCloud(value) {
  if (!__DEV__ || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error('Use the operator-provided cloud QA access code.');
  code = value;
  try {
    account = await request('/qa/connect', 'POST');
    return await refreshLiveCloud();
  } catch (error) {
    code = '';
    account = null;
    throw error;
  }
}
/** @param {unknown} value */
export async function uploadLiveCloud(value) {
  if (!__DEV__ || !account) throw new Error('Connect the isolated test account first.');
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1000 ||
    value > 16 * 1024 * 1024
  )
    throw new Error('Choose 1,000 bytes to 16 MiB.');
  await refreshLiveCloud();
  const day = new Date(Date.now() - files.length * 86400000).toISOString().slice(0, 10);
  const record = {
    domain: 'health',
    type: 'sleep',
    source: 'native',
    start: null,
    end: null,
    native: { generatedCloudQa: true, padding: '' },
  };
  const base = JSON.stringify(record) + '\n';
  record.native.padding = 'q'.repeat(value - base.length);
  const file = new File(Paths.cache, `cloud-qa-${Date.now()}.jsonl`);
  file.create();
  try {
    file.write(JSON.stringify(record) + '\n');
    if (file.size !== value) throw new Error('Generated file size mismatch.');
    const result = await uploadCloudFile(
      { server: origin, token: account.uploadToken },
      account.profile,
      file,
      'jsonl',
      {
        schema: account.profile.export.schema,
        profileId: account.profile.id,
        recordCount: 1,
        interval: { day },
      },
      () => Boolean(account && __DEV__),
    );
    await refreshLiveCloud();
    return { outcome: 'completed', id: result.id, ...liveCloudState() };
  } catch (error) {
    await refreshLiveCloud();
    throw error;
  } finally {
    file.delete();
  }
}
/** @param {(value:ReturnType<typeof liveCloudState>)=>void} progress */
export async function fillLiveCloud(progress) {
  await refreshLiveCloud();
  let used = usage?.usedBytes ?? 0;
  while (used < 99_000_000) {
    const bytes = Math.min(8_000_000, 99_000_000 - used);
    // Each verified commit determines the remaining size; retain observable progress.
    // oxlint-disable-next-line no-await-in-loop
    const uploaded = await uploadLiveCloud(bytes);
    used = uploaded.usage?.usedBytes ?? used;
    progress(liveCloudState());
  }
  return liveCloudState();
}
export async function deleteLiveCloud() {
  await refreshLiveCloud();
  const last = files[0];
  if (!last) throw new Error('No test files to delete.');
  await request(`/api/cloud/exports/${last.id}`, 'DELETE');
  return refreshLiveCloud();
}
export async function verifyLiveCloud() {
  return request('/qa/verify');
}
export async function cleanupLiveCloud() {
  await request('/qa/cleanup', 'POST');
  return refreshLiveCloud();
}
export function disconnectLiveCloud() {
  transactionId = '';
  account = null;
  code = '';
  usage = null;
  files = [];
}
