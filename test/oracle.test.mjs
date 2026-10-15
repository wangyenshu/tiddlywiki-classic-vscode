// Runs TiddlyWiki Classic's own wikifier (plus the MathJax plugin formatter)
// on every corpus file and requires the grammar to agree with it on every
// non-blank character. See test/oracle/ for how the comparison works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from './oracle/compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const corpus = join(here, 'corpus');

for (const file of walk(corpus).filter((f) => f.endsWith('.twc'))) {
  test(`matches TiddlyWiki: ${relative(corpus, file)}`, async () => {
    const diffs = await compare(readFileSync(file, 'utf8'));
    const report = diffs
      .slice(0, 5)
      .map((d) => `line ${d.line} ${JSON.stringify(d.text.slice(0, 50))}: grammar=[${d.g}] tiddlywiki=[${d.w}]`)
      .join('\n');
    assert.equal(diffs.length, 0, report);
  });
}

test('known limitation: an opener with no closer anywhere colors the rest of the text', async () => {
  // TiddlyWiki leaves "\(" as plain text when no "\)" follows anywhere; a
  // TextMate grammar cannot look ahead past the current line, so it keeps the
  // formula open. This test pins the behavior so a change is noticed.
  const text = readFileSync(join(here, 'known-limitations', 'unclosed-delimiters.twc'), 'utf8');
  const diffs = await compare(text);
  assert.ok(diffs.length > 0);
  assert.ok(diffs.every((d) => d.g === 'math-inline' && d.w === ''), JSON.stringify(diffs));
});
