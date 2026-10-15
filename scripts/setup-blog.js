import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync('.local', { recursive: true });
mkdirSync('content', { recursive: true });
if (!existsSync('.local/blog-vault/.git')) {
  const clone = spawnSync(
    'git',
    ['clone', 'https://github.com/codybontecou/myself.md-vault.git', '.local/blog-vault'],
    { stdio: 'inherit' },
  );
  if (clone.status !== 0) throw new Error('Could not clone the blog vault.');
}
if (!existsSync('content/blog')) symlinkSync('../.local/blog-vault', 'content/blog');
console.log('Blog vault ready at content/blog. Open this folder in Obsidian.');
