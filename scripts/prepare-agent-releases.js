import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const releases = new URL('../.local/releases/', import.meta.url);
mkdirSync(releases, { recursive: true });
for (const kind of ['cli', 'sdk']) {
  const name = `myself-md-${kind}`;
  const directory = new URL(`${name}/`, releases);
  mkdirSync(directory, { recursive: true });
  copyFileSync(
    new URL(`../dashboard/dist/${kind === 'cli' ? 'myself' : 'myself-sdk'}.mjs`, import.meta.url),
    new URL('myself.mjs', directory),
  );
  if (kind === 'cli')
    copyFileSync(
      new URL('../dashboard/dist/cli-notices.txt', import.meta.url),
      new URL('THIRD-PARTY-NOTICES.txt', directory),
    );
  writeFileSync(
    new URL('package.json', directory),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        description: `Official myself.md ${kind === 'cli' ? 'discovery and authorized MCP command-line client' : 'JavaScript public discovery and authorized asynchronous query SDK'}`,
        type: 'module',
        ...(kind === 'cli'
          ? { bin: { myself: './myself.mjs' }, engines: { node: '>=22.13.0' } }
          : { exports: './myself.mjs', sideEffects: false }),
        files: ['myself.mjs', 'README.md', ...(kind === 'cli' ? ['THIRD-PARTY-NOTICES.txt'] : [])],
        homepage: 'https://myself.md/docs',
        repository: { type: 'git', url: 'git+https://github.com/CodyBontecou/myself.md.git' },
        license: 'UNLICENSED',
      },
      null,
      2,
    ),
  );
  writeFileSync(
    new URL('README.md', directory),
    `# ${name}\n\nOfficial myself.md ${kind.toUpperCase()} distribution. Documentation: https://myself.md/docs\n\n${kind === 'cli' ? 'Run `myself help` for public reads and authorized MCP calls. MYSELF_TOKEN supplies an existing OAuth token; no token is stored.' : 'Import createMyselfClient. Public methods: health(), config(), docs(), datasets({limit, cursor}). Pass an existing agent OAuth token to use query(input, idempotencyKey) and request(requestId). A queued query is not a completed phone read.'}\n\nOwner-approved profiles, data grants and OS permissions remain required. Never embed credentials in public source.\n`,
  );
  const result = spawnSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', releases.pathname],
    {
      cwd: directory,
      stdio: 'inherit',
      env: { ...process.env, npm_config_cache: new URL('npm-cache/', releases).pathname },
    },
  );
  if (result.status !== 0) throw new Error(`Could not pack ${name}.`);
}
