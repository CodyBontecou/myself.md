import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import { buildBlog } from './build-blog.js';
import { blogContentHash, blogPosts } from '../server/blog-content.js';
import { needsBlogPublication } from './check-blog-publication.js';
import { patchBlogContent } from './blog-worker-content.js';
import { publicResponse } from '../server/public-site.js';

/** Verify actual Node/workerd HTTP behavior. @param {string} origin */
export async function verifyBlogHTTP(origin) {
  const indexResponse = await fetch(`${origin}/blog`);
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get('X-Blog-Content-SHA256'), blogContentHash);
  const html = await indexResponse.text();
  if (blogPosts.length) {
    assert.match(html, /id="latest"/);
    assert.match(html, /id="writing"/);
  } else assert.match(html, /Writing is on its way/);
  assert.doesNotMatch(html, /id="topics"/);
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  const guidance = await (await fetch(`${origin}/llms.txt`)).text();
  const feed = await fetch(`${origin}/blog/feed.xml`);
  assert.match(feed.headers.get('content-type') ?? '', /application\/rss\+xml/);
  const rss = await feed.text();
  await Promise.all(
    blogPosts.map(async (post, index) => {
      const path = `/blog/${post.slug}`;
      const page = await fetch(origin + path);
      assert.equal(page.status, 200);
      const content = await page.text();
      assert.match(content, /"@type":"BlogPosting"/);
      assert.match(content, /<article>/);
      const previous = blogPosts[index + 1];
      const next = index > 0 ? blogPosts[index - 1] : undefined;
      for (const { relation, neighbor } of [
        { relation: 'prev', neighbor: previous },
        { relation: 'next', neighbor: next },
      ]) {
        if (neighbor)
          assert.ok(content.includes(`rel="${relation}" href="/blog/${neighbor.slug}"`));
        else assert.ok(!content.includes(`rel="${relation}"`));
      }
      assert.ok(content.includes(`href="https://myself.md${path}"`));
      assert.doesNotMatch(content, /coordinates|appleMapsURL|locations:/);
      assert.ok(html.includes(`href="${path}"`));
      assert.ok(sitemap.includes(`https://myself.md${path}</loc>`));
      assert.ok(guidance.includes(`https://myself.md${path}`));
      assert.ok(rss.includes(`https://myself.md${path}</link>`));
      const raw = await fetch(origin + path, { headers: { Accept: 'text/markdown' } });
      assert.match(raw.headers.get('content-type') ?? '', /text\/markdown/);
      assert.equal(raw.headers.get('vary'), 'Accept');
      const text = await raw.text();
      assert.ok(text.includes(post.markdown));
      assert.equal(await (await fetch(`${origin}${path}.md`)).text(), text);
      const head = await fetch(origin + path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }),
  );
  assert.equal((await fetch(`${origin}/blog/missing-post`)).status, 404);
  assert.equal((await fetch(`${origin}/blog/missing-post.md`)).status, 404);
  assert.equal((await fetch(`${origin}/dashboard/blog.css`)).status, 200);
}

/** Verify emitted SDK tool behavior in the existing authenticated fixtures.
 * @param {import('@modelcontextprotocol/client').Client} client */
export async function verifyBlogMCP(client) {
  const listing = await client.callTool({ name: 'read_public_blog', arguments: {} });
  const result = z
    .object({ posts: z.array(z.object({ slug: z.string() })), total: z.number() })
    .parse(listing.structuredContent);
  assert.equal(result.total, blogPosts.length);
  await Promise.all(
    result.posts.map(async ({ slug }) => {
      const read = await client.callTool({ name: 'read_public_blog', arguments: { slug } });
      assert.equal(read.isError, false);
      const post = z
        .object({
          post: z.object({
            markdown: z.string(),
            previousPost: z.object({ slug: z.string() }).nullable(),
            nextPost: z.object({ slug: z.string() }).nullable(),
          }),
        })
        .parse(read.structuredContent);
      const index = blogPosts.findIndex((entry) => entry.slug === slug);
      assert.equal(post.post.previousPost?.slug, blogPosts[index + 1]?.slug);
      assert.equal(post.post.nextPost?.slug, index > 0 ? blogPosts[index - 1]?.slug : undefined);
      const http = publicResponse(`/blog/${slug}`, 'text/markdown', 'https://myself.md/auth');
      assert.equal(post.post.markdown, http?.body);
      assert.doesNotMatch(post.post.markdown, /coordinates|appleMapsURL|locations:/);
    }),
  );
  assert.equal(
    (await client.callTool({ name: 'read_public_blog', arguments: { slug: 'missing-post' } }))
      .isError,
    true,
  );
  assert.equal(
    (await client.callTool({ name: 'read_public_blog', arguments: { slug: '../private' } }))
      .isError,
    true,
  );
}

if (process.argv[1]?.endsWith('/verify-blog.js')) {
  const bundle =
    'const applicationRelease = "preserve-me";\nvar blogPosts = [];\nfunction blogResponse() { const headers = { Vary: "Accept" }; return { headers, posts: blogPosts, applicationRelease }; }\nexport { blogResponse };';
  const candidate = patchBlogContent(bundle, [{ title: 'New post' }], 'new-hash');
  const loaded = await import(`data:text/javascript,${encodeURIComponent(candidate)}`);
  assert.deepEqual(loaded.blogResponse(), {
    headers: { Vary: 'Accept', 'X-Blog-Content-SHA256': 'new-hash' },
    posts: [{ title: 'New post' }],
    applicationRelease: 'preserve-me',
  });
  assert.equal(patchBlogContent(candidate, [{ title: 'New post' }], 'new-hash'), candidate);
  const updated = patchBlogContent(candidate, [], 'second-hash');
  assert.equal(
    (await import(`data:text/javascript,${encodeURIComponent(updated)}`)).blogResponse().headers[
      'X-Blog-Content-SHA256'
    ],
    'second-hash',
  );
  assert.throws(() => patchBlogContent('const unknown = [];', [], 'hash'), /blog data declaration/);
  const index = publicResponse('/blog', '', 'https://myself.md/auth');
  assert.ok(index);
  assert.ok('X-Blog-Content-SHA256' in index.headers);
  let publishedHash = index.headers['X-Blog-Content-SHA256'];
  assert.equal(publishedHash, blogContentHash);
  let status = 200;
  const server = createServer((_request, response) => {
    if (publishedHash) response.setHeader('X-Blog-Content-SHA256', publishedHash);
    response.writeHead(status);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    assert.equal(await needsBlogPublication(origin), false);
    publishedHash = 'older-content';
    assert.equal(await needsBlogPublication(origin), true);
    publishedHash = '';
    assert.equal(await needsBlogPublication(origin), true);
    status = 503;
    await assert.rejects(needsBlogPublication(origin), /HTTP 503/);
  } finally {
    server.close();
    await once(server, 'close');
  }
  const directory = mkdtempSync(join(tmpdir(), 'blog-fixture-'));
  const cwd = process.cwd();
  try {
    mkdirSync(join(directory, 'content/blog'), { recursive: true });
    mkdirSync(join(directory, 'server'));
    process.chdir(directory);
    execFileSync('git', ['init', '-q', 'content/blog']);
    const note = (/** @type {string} */ name, /** @type {string} */ text) =>
      writeFileSync(join(directory, `content/blog/${name}.md`), text);
    note(
      'public',
      '---\ndate: 2026-10-13\nlocations:\n  - coordinates: [40, -8]\n---\n# Public note\n\nHello %%private comment%% world.',
    );
    note('draft', '---\ndate: 2026-10-13\ndraft: true\n---\nPrivate draft');
    note('hidden', '---\ndate: 2026-10-13\npublish: false\n---\nHidden note');
    note('future', '---\ndate: 2099-01-01\n---\nFuture note');
    note('empty', '');
    await buildBlog(true);
    const snapshot = readFileSync('server/blog-content.js', 'utf8');
    await buildBlog(true);
    assert.equal(readFileSync('server/blog-content.js', 'utf8'), snapshot);
    assert.match(snapshot, /Public note/);
    assert.doesNotMatch(
      snapshot,
      /coordinates|locations|Private draft|Hidden note|Future note|private comment/,
    );
    note('duplicate', '---\ndate: 2026-10-13\nslug: public\n---\nDuplicate');
    await assert.rejects(buildBlog(true), /Duplicate blog slugs/);
    // A later app release must refuse an older vault even when that vault is clean.
    const git = (/** @type {string[]} */ args) =>
      execFileSync('git', ['-C', join(directory, 'content/blog'), ...args], {
        encoding: 'utf8',
      }).trim();
    git(['config', 'user.name', 'Blog fixture']);
    git(['config', 'user.email', 'blog@example.test']);
    git(['add', '.']);
    git(['commit', '-qm', 'Initial notes']);
    git(['branch', '-M', 'main']);
    const initial = git(['rev-parse', 'HEAD']);
    execFileSync('git', ['init', '--bare', '-q', 'remote.git']);
    git(['remote', 'add', 'origin', join(directory, 'remote.git')]);
    git(['push', '-q', 'origin', 'main']);
    const checkSource = () =>
      execFileSync(process.execPath, [join(cwd, 'scripts/check-blog-source.js')], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    assert.match(checkSource(), /matches published main/);
    note('new-post', 'A newer published post.');
    assert.throws(checkSource, /unpublished changes/);
    git(['add', '.']);
    git(['commit', '-qm', 'New post']);
    git(['push', '-q', 'origin', 'main']);
    git(['checkout', '-q', '--detach', initial]);
    assert.throws(checkSource, /Blog vault is stale/);
    git(['checkout', '-q', 'main']);
    assert.match(checkSource(), /matches published main/);
  } finally {
    process.chdir(cwd);
    rmSync(directory, { recursive: true, force: true });
  }
  const injected = blogPosts.length === 0;
  if (injected)
    blogPosts.push({
      slug: 'render-fixture',
      title: 'Rendering fixture',
      date: '2026-10-13',
      updated: '2026-10-13',
      description: 'Rendering fixture.',
      author: 'Fictional Author',
      markdown: '',
      source: 'render-fixture.md',
      minutes: 1,
    });
  const post = blogPosts[0];
  assert.ok(post);
  const previous = post.markdown;
  try {
    post.markdown = `## A heading\n\n[[${post.slug}|Read post]]\n\n[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n\`[[${post.slug}]]\``;
    const page = publicResponse(`/blog/${post.slug}`, '', 'https://myself.md/auth');
    assert.ok(page);
    assert.match(page.body, /id="a-heading"/);
    assert.ok(page.body.includes(`href="/blog/${post.slug}"`));
    assert.doesNotMatch(page.body, /href="javascript:|<script>alert/);
    assert.ok(page.body.includes(`<code>[[${post.slug}]]</code>`));
  } finally {
    post.markdown = previous;
    if (injected) blogPosts.pop();
  }
  console.log('Blog publication, privacy, links and rendering checks passed.');
}
