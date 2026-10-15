import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';

const repository = 'CodyBontecou/myself.md-vault';
const path = '.github/workflows/publish-blog.yml';
const content = readFileSync(new URL('../distribution/blog/publish-blog.yml', import.meta.url));
const endpoint = `repos/${repository}/contents/${path}`;
const current = spawnSync('gh', ['api', `${endpoint}?ref=main`], { encoding: 'utf8' });
if (current.status !== 0 && !current.stdout.includes('"Not Found"'))
  throw new Error(
    'Could not inspect the vault workflow. Check gh authentication and repository access.',
  );
const existing = current.status === 0 ? JSON.parse(current.stdout) : null;
if (existing && Buffer.from(existing.content, 'base64').equals(content)) {
  console.log('Vault deployment workflow already matches.');
} else {
  const result = execFileSync('gh', ['api', '--method', 'PUT', endpoint, '--input', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({
      message: 'Automate blog deployment when vault notes change',
      branch: 'main',
      content: content.toString('base64'),
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
  console.log(`Installed ${JSON.parse(result).content.html_url}`);
}
