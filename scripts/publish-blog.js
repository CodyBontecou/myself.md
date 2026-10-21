import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { sorted } from '../core/collections.js';
import { blogContentHash, blogPosts } from '../server/blog-content.js';
import { patchBlogContent } from './blog-worker-content.js';

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required.');
const base =
  'https://api.cloudflare.com/client/v4/accounts/e4265f322e6380ee832b83ad45e3e8c0/workers/scripts/myself-md';
/** @param {string} path @param {RequestInit} [options] */
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Cloudflare ${path.split('?')[0]}: HTTP ${response.status}`);
  return response;
}
/** @template T @param {string} path @param {z.ZodType<T>} schema @param {RequestInit} [options] */
async function read(path, schema, options = {}) {
  const data = await (await request(path, options)).json();
  return z.object({ success: z.literal(true), result: schema }).parse(data).result;
}
const bindingSchema = z.object({ name: z.string() }).passthrough();
const versionSchema = z.object({
  resources: z.object({ bindings: z.array(bindingSchema), script_runtime: z.unknown() }),
  annotations: z.object({ 'workers/message': z.string().optional() }).optional(),
});
const deploymentsSchema = z.object({
  deployments: z.array(
    z.object({ versions: z.array(z.object({ version_id: z.string(), percentage: z.number() })) }),
  ),
});
const settingsSchema = z
  .object({
    compatibility_date: z.string(),
    compatibility_flags: z.array(z.string()),
    bindings: z.array(bindingSchema),
    observability: z.unknown(),
  })
  .passthrough();
/** Compare without logging configuration values or source in assertion diagnostics.
 * @param {unknown} actual @param {unknown} expected @param {string} message */
function requireSame(actual, expected, message) {
  assert.ok(isDeepStrictEqual(actual, expected), message);
}
/** Upload annotations change when staging a version; configuration must stay identical.
 * @param {z.infer<typeof settingsSchema>} settings */
function configuration(settings) {
  const result = { ...settings };
  delete result.annotations;
  return result;
}
async function content() {
  const parts = await (await request('/content/v2')).formData();
  const modules = [];
  for (const [name, value] of parts) {
    assert.ok(typeof value !== 'string', 'Unexpected Worker content.');
    modules.push({ name, file: value });
  }
  assert.equal(modules.length, 1, 'Blog publisher requires one unminified Worker module.');
  const module = modules[0];
  assert.ok(module && module.name.endsWith('.js'), 'Unknown Worker entry point.');
  return { name: module.name, source: await module.file.text() };
}

const before = await content();
const deployments = await read('/deployments', deploymentsSchema);
const active = deployments.deployments[0]?.versions;
assert.ok(active?.[0], 'No active Worker version.');
assert.equal(
  active.length,
  1,
  'Finish gradual application deployments before publishing blog content.',
);
const currentVersion = await read(`/versions/${active[0].version_id}`, versionSchema);
const settings = await read('/settings', settingsSchema);
const versions = await read(
  '/versions',
  z.object({ items: z.array(z.object({ id: z.string() })) }),
);
/** @param {{resources: {bindings: Array<{name: string}>}}} version */
const bindings = (version) =>
  sorted(version.resources.bindings, (a, b) => a.name.localeCompare(b.name));
const latest = versions.items[0];
assert.ok(latest, 'No uploaded Worker version.');
if (latest.id !== active[0].version_id) {
  const staged = await read(`/versions/${latest.id}`, versionSchema);
  assert.ok(
    /^Publish blog [a-f0-9]{12}; preserve deployed application$/.test(
      staged.annotations?.['workers/message'] ?? '',
    ),
    'An unrelated undeployed Worker version exists; review it before publishing.',
  );
  requireSame(
    bindings(staged),
    bindings(currentVersion),
    'Staged blog upload changed bindings; review it before retrying.',
  );
  requireSame(
    staged.resources.script_runtime,
    currentVersion.resources.script_runtime,
    'Staged blog upload changed runtime; review it before retrying.',
  );
  console.log('Retrying a previous blog-only upload with unchanged bindings and runtime.');
}
const candidate = patchBlogContent(before.source, blogPosts, blogContentHash);
const metadata = {
  main_module: before.name,
  compatibility_date: settings.compatibility_date,
  compatibility_flags: settings.compatibility_flags,
  bindings: settings.bindings.map((/** @type {{name: string}} */ binding) => ({
    name: binding.name,
    type: 'inherit',
  })),
  keep_assets: true,
  observability: settings.observability,
  annotations: {
    'workers/message': `Publish blog ${blogContentHash.slice(0, 12)}; preserve deployed application`,
  },
};
const form = new FormData();
form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.set(
  before.name,
  new Blob([candidate], { type: 'application/javascript+module' }),
  before.name,
);
const upload = await read('/versions?bindings_inherit=strict', z.object({ id: z.string() }), {
  method: 'POST',
  body: form,
});
const id = upload.id;
console.log(`Staged blog Worker version ${id}.`);
const nextVersion = await read(`/versions/${id}`, versionSchema);
requireSame(bindings(nextVersion), bindings(currentVersion), 'Inherited bindings differ.');
requireSame(
  nextVersion.resources.script_runtime,
  currentVersion.resources.script_runtime,
  'Worker runtime differs.',
);
requireSame(
  configuration(await read('/settings', settingsSchema)),
  configuration(settings),
  'Worker settings changed during publication.',
);
requireSame(
  (await read('/deployments', deploymentsSchema)).deployments[0]?.versions,
  active,
  'Another deployment completed during publication.',
);
requireSame(await content(), before, 'Worker code changed during publication.');
requireSame(
  (await read('/versions', z.object({ items: z.array(z.object({ id: z.string() })) }))).items[0]
    ?.id,
  id,
  'Another Worker version was uploaded during publication.',
);
await read('/deployments', z.unknown(), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategy: 'percentage',
    versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': 'Publish current vault blog content only' },
  }),
});
console.log(`Published ${blogPosts.length} blog posts in Worker version ${id}.`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- Blog Worker version: \`${id}\`\n`);
