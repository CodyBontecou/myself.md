import { join } from 'node:path';
import { cloud } from './cloud.js';
import { SupportStore } from './support-store.js';
import { SupportDiscord } from './support-discord.js';
import { createSupportService } from './support-service.js';
export const { supportApi, registerSupportTools } = createSupportService({
  store: new SupportStore(join(process.env.DATA_DIR ?? '.local', 'support.sqlite'), cloud),
  discord: new SupportDiscord(process.env),
  cloud,
});
