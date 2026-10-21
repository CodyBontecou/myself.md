import { billing, refreshEntitlement } from './billing.js';
import { devices } from './store.js';
import { cloud, history } from './cloud.js';
import { createDataService } from './data-service.js';
const service = createDataService({ cloud, billing, refreshEntitlement, devices, history });
const timer = setInterval(service.cleanup, 10000);
timer.unref();
export const { registerDataTools, phoneApi, cancelPhone, cancelAgent, revokeQueries } = service;
