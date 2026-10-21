import { execFileSync } from 'node:child_process';

// Deployments must not replace newer vault posts with a stale local snapshot.
const root = 'content/blog';
/** @param {string[]} args */
const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const latest = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s+/)[0];
if (git(['rev-parse', 'HEAD']) !== latest)
  throw new Error(
    'Blog vault is stale. Review local changes, then git -C content/blog pull --ff-only before deploying.',
  );
if (git(['status', '--porcelain']))
  throw new Error(
    'Blog vault has unpublished changes. Commit and push the intended notes before deploying.',
  );
console.log('Blog vault matches published main.');
