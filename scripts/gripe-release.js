import { inboxClient } from './gripe-mac.js';
import { z } from 'zod';

// Release/archive automation supplies the exact uploaded build's source commit, never current HEAD.
const schema = z.object({
  app: z.string().regex(/^\d+$/),
  versionId: z.string().regex(/^[A-Za-z0-9-]{1,100}$/),
  buildId: z.string().regex(/^[A-Za-z0-9-]{1,100}$/),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
});
const [app, versionId, buildId, commit] = process.argv.slice(2);
const release = schema.parse({ app, versionId, buildId, commit });
const token = process.env.GRIPE_MAC_TOKEN;
if (!token) throw new Error('Configure GRIPE_MAC_TOKEN.');
await inboxClient(process.env.GRIPE_ORIGIN ?? 'https://gripe.isolated.tech', token)(
  '/releases',
  release,
);
console.log(
  'Release build registered. Notification waits for verified App Store availability and commit ancestry.',
);
