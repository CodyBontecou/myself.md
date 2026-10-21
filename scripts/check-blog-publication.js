import { appendFileSync } from 'node:fs';
import { blogContentHash } from '../server/blog-content.js';

/** Compare content, including scheduled posts becoming eligible, rather than just Git revisions.
 * @param {string} [origin] @returns {Promise<boolean>} */
export async function needsBlogPublication(origin = 'https://myself.md') {
  const response = await fetch(`${origin}/blog`, {
    method: 'HEAD',
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Could not inspect published blog: HTTP ${response.status}`);
  return response.headers.get('X-Blog-Content-SHA256') !== blogContentHash;
}

if (process.argv[1]?.endsWith('/check-blog-publication.js')) {
  const changed = process.env.FORCE_PUBLISH === 'true' || (await needsBlogPublication());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(
    changed ? 'Blog publication required.' : 'Public blog is current; skipping deployment.',
  );
}
