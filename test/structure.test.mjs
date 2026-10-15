import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { symbolTree, foldingRanges, plainText } = require('../src/structure.js');

const doc = `!! Lubin–Tate formal group law
''Definition 1.3.2'' A Frobenius power series

''Proposition 1.3.12.'' //For any//
!!! Tilting
''Lemma 1.4.6'' //The map//
\\[
x
\\]
!! Witt vectors
/***
doc
***/
{{{
code
}}}
/%multi
line%/
`.split('\n');

test('outline nests labels under headings', () => {
  const tree = symbolTree(doc);
  const names = (nodes) => nodes.map((n) => [n.name, names(n.children)]);
  assert.deepEqual(names(tree), [
    ['Lubin–Tate formal group law', [
      ['Definition 1.3.2', []],
      ['Proposition 1.3.12', []],
      ['Tilting', [['Lemma 1.4.6', []]]],
    ]],
    ['Witt vectors', []],
  ]);
  assert.equal(tree[0].endLine, 8); // up to the line before "!! Witt vectors"
});

test('outline label pattern can be turned off', () => {
  const tree = symbolTree(doc, '');
  assert.deepEqual(tree.map((n) => n.name), ['Lubin–Tate formal group law', 'Witt vectors']);
});

test('heading text is shown without markup', () => {
  assert.equal(plainText("''Bold'' [[Link|Target]] ~WikiWord //it//"), 'Bold Link WikiWord it');
  assert.equal(
    plainText(String.raw`3.2.1 Étale \(\boldsymbol{\varphi}\)-modules over \(\boldsymbol{\mathcal{E}}\)`),
    '3.2.1 Étale φ-modules over E'
  );
  assert.equal(plainText(String.raw`The tilt \(K^{\flat}\) and \(\mathbb{C}_p\)`), 'The tilt K^{♭} and C_p');
});

test('folding: headings, blocks, display math and comments', () => {
  const ranges = foldingRanges(doc).map((r) => `${r.start}-${r.end}:${r.kind}`).sort();
  assert.deepEqual(ranges, ['0-8:region', '10-12:comment', '13-15:region', '16-17:comment', '4-8:region', '6-8:region', '9-17:region'].sort());
});
