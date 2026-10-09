import { billing, billingApi, refreshEntitlement } from './billing.js';
import { verifyMigrationPurchase } from './migration-purchases.js';
import { createServer } from 'node:http';
import { registerDataTools, phoneApi, cancelPhone } from './data.js';
import { cloud, history, registerCloudTools, ownCloudDevice } from './cloud.js';
import { dashboardAsset, dashboardApi } from './dashboard.js';
import { proxyAuth } from './auth-proxy.js';
import { claim, createPairing, devices, disconnect, pending, status } from './store.js';
import QRCode from 'qrcode';
import { createApplication } from './application.js';
createServer(
  { requestTimeout: 60000, headersTimeout: 15000 },
  createApplication(process.env, {
    qrPng: (value, options) => QRCode.toBuffer(value, options),
    billing,
    billingApi,
    refreshEntitlement,
    verifyMigrationPurchase,
    createMigrationClaim: (proof) => billing.createClaim(proof),
    claimMigration: (subject, ticket) => billing.claim(subject, ticket),
    registerTicket: async () => {},
    registerDataTools,
    phoneApi,
    cancelPhone,
    cloud,
    history,
    registerCloudTools,
    ownCloudDevice,
    dashboardAsset,
    dashboardApi,
    proxyAuth,
    createPairing,
    claim,
    devices,
    disconnect,
    pending,
    status,
  }),
).listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? process.env.DEV_HOST ?? '127.0.0.1',
  () => console.log(`myself.md: ${process.env.PUBLIC_URL}/mcp`),
);
