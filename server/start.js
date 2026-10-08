import { mkdirSync, chownSync } from 'node:fs';
// Fly volumes mount over the image's directory permissions. Prepare the mount as root,
// then drop privileges before loading any network service or credentials.
const directory = process.env.DATA_DIR ?? '.local';
mkdirSync(directory, { recursive: true });
if (process.getuid?.() === 0) {
  chownSync(directory, 1000, 1000);
  if (!process.setgid || !process.setuid) throw new Error('Cannot drop container privileges.');
  process.setgid('node');
  process.setuid('node');
}
await import('./index.js');
