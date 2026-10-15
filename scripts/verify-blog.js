import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { buildBlog } from './build-blog.js';
import { blogPosts } from '../server/blog-content.js';
import { publicResponse } from '../server/public-site.js';

/** Verify actual Node/workerd HTTP behavior. @param {string} origin */
export async function verifyBlogHTTP(origin) {
  const indexResponse = await fetch(`${origin}/blog`);
  assert.equal(indexResponse.status, 200);
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
    assert.match(snapshot, /Public note/);
    assert.doesNotMatch(
      snapshot,
      /coordinates|locations|Private draft|Hidden note|Future note|private comment/,
    );
    note('duplicate', '---\ndate: 2026-10-13\nslug: public\n---\nDuplicate');
    await assert.rejects(buildBlog(true), /Duplicate blog slugs/);
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
