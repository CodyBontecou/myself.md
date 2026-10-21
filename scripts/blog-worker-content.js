import assert from 'node:assert/strict';
import ts from 'typescript';
import { sorted } from '../core/collections.js';

/** Replace only public blog data and its freshness header in a deployed, unminified bundle.
 * Unknown bundle shapes fail closed rather than replacing application code.
 * @param {string} source @param {unknown[]} posts @param {string} hash */
export function patchBlogContent(source, posts, hash) {
  const file = ts.createSourceFile(
    'worker.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  let postCount = 0;
  let hashCount = 0;
  let headerCount = 0;
  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (node.name.text === 'blogPosts') {
        assert.ok(ts.isArrayLiteralExpression(node.initializer), 'Unknown blog data declaration.');
        postCount++;
        edits.push({
          start: node.initializer.getStart(file),
          end: node.initializer.end,
          text: JSON.stringify(posts),
        });
      }
      if (node.name.text === 'blogContentHash') {
        hashCount++;
        edits.push({
          start: node.initializer.getStart(file),
          end: node.initializer.end,
          text: JSON.stringify(hash),
        });
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'blogResponse') {
      /** @param {ts.Node} child */
      function findHeaders(child) {
        if (
          ts.isVariableDeclaration(child) &&
          child.name.getText(file) === 'headers' &&
          child.initializer &&
          ts.isObjectLiteralExpression(child.initializer)
        ) {
          headerCount++;
          const headers = child.initializer;
          const existing = headers.properties.find(
            (property) =>
              property.name?.getText(file).replaceAll(/["']/g, '') === 'X-Blog-Content-SHA256',
          );
          if (existing) {
            assert.ok(ts.isPropertyAssignment(existing), 'Unknown blog hash header.');
            edits.push({
              start: existing.initializer.getStart(file),
              end: existing.initializer.end,
              text: 'blogContentHash',
            });
          } else
            edits.push({
              start: headers.getStart(file) + 1,
              end: headers.getStart(file) + 1,
              text: '"X-Blog-Content-SHA256": blogContentHash,',
            });
        }
        ts.forEachChild(child, findHeaders);
      }
      ts.forEachChild(node, findHeaders);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(postCount, 1, 'Expected exactly one public blog data declaration.');
  assert.equal(headerCount, 1, 'Expected exactly one blog response header object.');
  assert.ok(hashCount <= 1, 'Ambiguous blog hash declaration.');
  let result = source;
  for (const edit of sorted(edits, (a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  if (!hashCount) result = `var blogContentHash = ${JSON.stringify(hash)};\n${result}`;
  return result;
}
