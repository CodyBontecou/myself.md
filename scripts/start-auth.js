import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
const version = '26.8.0';
const directory = resolve('.local/keycloak');
if (!existsSync('.local/realm/myselfmd.json')) throw new Error('Run npm run auth:setup first.');
if (!existsSync(`${directory}/bin/kc.sh`)) {
  mkdirSync(directory, { recursive: true });
  console.log(`Downloading official Keycloak ${version} (Java 21+ required)…`);
  const response = await fetch(
    `https://github.com/keycloak/keycloak/releases/download/${version}/keycloak-${version}.tar.gz`,
  );
  if (!response.ok) throw new Error('Keycloak download failed.');
  writeFileSync('.local/keycloak.tar.gz', Buffer.from(await response.arrayBuffer()));
  const extraction = spawnSync(
    'tar',
    ['-xzf', '.local/keycloak.tar.gz', '-C', directory, '--strip-components=1'],
    { stdio: 'inherit' },
  );
  if (extraction.status !== 0) throw new Error('Keycloak extraction failed.');
}
mkdirSync(`${directory}/data/import`, { recursive: true });
copyFileSync('.local/realm/myselfmd.json', `${directory}/data/import/myselfmd.json`);
const child = spawn(
  `${directory}/bin/kc.sh`,
  [
    'start-dev',
    `--http-host=${process.env.DEV_HOST ?? '127.0.0.1'}`,
    '--http-port=8080',
    ...(process.env.AUTH_PROXY === '1'
      ? ['--http-relative-path=/auth', '--proxy-headers=xforwarded']
      : []),
    `--hostname=${process.env.KEYCLOAK_URL ?? 'http://localhost:8080'}`,
    '--import-realm',
  ],
  { stdio: 'inherit' },
);
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM']))
  process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
