import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { protocolMigrationSql } from '../server/protocol-migration.js';

process.umask(0o077);
const directory = '.local/protocol-migration';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/identity.sql`;
writeFileSync(path, protocolMigrationSql, { mode: 0o600 });
const apply = process.argv.includes('--apply');
if (apply && !process.argv.includes('--providers-ready'))
  throw new Error(
    'Update and verify Apple, GitHub and Google callbacks before using --apply --providers-ready.',
  );
/** @param {string[]} args */
function wrangler(args) {
  const result = spawnSync('node_modules/.bin/wrangler', args, { stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error('Identity migration stopped; inspect the Wrangler error.');
}
if (apply) {
  const backup = `${directory}/identity-before-${Date.now()}.sql`;
  wrangler(['d1', 'export', 'myself-md-identity', '--remote', '--output', backup]);
  chmodSync(backup, 0o600);
  wrangler(['d1', 'execute', 'myself-md-identity', '--remote', '--file', path]);
  console.log(
    'Hosted identity registrations migrated. Deploy the matching Worker and updated native apps.',
  );
} else {
  console.log(`Prepared ${path}; no hosted changes applied.`);
  for (const provider of ['apple', 'github', 'google'])
    console.log(`${provider}: https://myself.md/auth/realms/myselfmd/broker/${provider}/endpoint`);
}
