// Scope assertions: for each snippet, the token at a given substring must (or
// must not) carry the listed scopes. Uses the same TextMate engine as VS Code,
// with VS Code's own LaTeX, JavaScript, CSS and HTML grammars embedded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from './textmate.mjs';

// Scopes of the token covering the n-th occurrence of `needle` (searched in
// the whole text, which may span lines).
async function scopesAt(text, needle, occurrence = 1) {
  let index = -1;
  for (let i = 0; i < occurrence; i++) index = text.indexOf(needle, index + 1);
  assert.ok(index >= 0, `"${needle}" not found`);
  const before = text.slice(0, index);
  const line = before.split('\n').length - 1;
  const col = index - (before.lastIndexOf('\n') + 1);
  const tok = (await tokenize(text)).find((t) => t.line === line && t.startIndex <= col && col < t.endIndex);
  return tok.scopes.join(' ');
}

async function expectScopes(text, needle, has = [], hasNot = [], occurrence = 1) {
  const scopes = await scopesAt(text, needle, occurrence);
  for (const s of has) assert.ok(scopes.includes(s), `"${needle}" should have ${s}\n  got: ${scopes}`);
  for (const s of hasNot) assert.ok(!scopes.includes(s), `"${needle}" should not have ${s}\n  got: ${scopes}`);
}

test('character formatting', async () => {
  const t = "''bold'' //italic// __under__ ^^sup^^ ~~sub~~ --strike-- {{{code}}} a -- b";
  await expectScopes(t, 'bold', ['markup.bold.tiddlywiki']);
  await expectScopes(t, 'italic', ['markup.italic.tiddlywiki']);
  await expectScopes(t, 'under', ['markup.underline.tiddlywiki']);
  await expectScopes(t, 'sup', ['markup.other.superscript.tiddlywiki']);
  await expectScopes(t, 'sub', ['markup.other.subscript.tiddlywiki']);
  await expectScopes(t, 'strike', ['markup.strikethrough.tiddlywiki']);
  await expectScopes(t, 'code', ['markup.inline.raw.tiddlywiki']);
  await expectScopes(t, ' -- ', [], ['markup.strikethrough']); // "--" before a space is an mdash
});

test('headings, lists and quotes', async () => {
  const t = "!!Heading with ''bold''\n* item\n## numbered\n; term\n: definition\n> quote\n<<<\nblock quote\n<<<";
  await expectScopes(t, 'Heading', ['markup.heading.tiddlywiki', 'entity.name.section.tiddlywiki']);
  await expectScopes(t, 'bold', ['markup.heading.tiddlywiki', 'markup.bold.tiddlywiki']);
  await expectScopes(t, '!!', ['punctuation.definition.heading.tiddlywiki']);
  await expectScopes(t, 'item', ['markup.list.unnumbered.tiddlywiki']);
  await expectScopes(t, 'numbered', ['markup.list.numbered.tiddlywiki']);
  await expectScopes(t, 'term', ['markup.list.definition.term.tiddlywiki']);
  await expectScopes(t, 'definition', ['markup.list.definition.description.tiddlywiki']);
  await expectScopes(t, 'quote', ['markup.quote.tiddlywiki']);
  await expectScopes(t, 'block quote', ['markup.quote.block.tiddlywiki']);
});

test('MathJax: inline, display and $$ formulas use the LaTeX grammar', async () => {
  const t = String.raw`Let \(\varphi : M \to M\) and \[\dim_E M_\varphi = \dim_E M.\] or $$e=mc^2$$.`;
  await expectScopes(t, String.raw`\(`, ['markup.math.inline.tiddlywiki', 'punctuation.definition.math.begin.tiddlywiki']);
  await expectScopes(t, 'varphi', ['markup.math.content.tiddlywiki', 'constant.character.math.tex']);
  await expectScopes(t, String.raw`\dim`, ['markup.math.display.tiddlywiki']);
  await expectScopes(t, 'mc', ['markup.math.display.tiddlywiki']);
  await expectScopes(t, ' and ', [], ['markup.math']);
});

test('MathJax: multi-line display math', async () => {
  const t = String.raw`\[
\begin{array}{rcl}
\alpha & \longmapsto & \alpha^{\sharp}
\end{array}
\tag{1.4.19}
\]
after`;
  await expectScopes(t, 'longmapsto', ['markup.math.display.tiddlywiki', 'markup.math.content.tiddlywiki']);
  await expectScopes(t, 'tag', ['markup.math.display.tiddlywiki']);
  await expectScopes(t, 'after', [], ['markup.math']);
});

test('MathJax: formulas end at the first closer, like the plugin', async () => {
  // A % comment or an unbalanced \begin must not swallow the closing delimiter.
  const t = String.raw`\[x % comment
+ y\] after1 \[\begin{aligned} a &= b \] after2`;
  await expectScopes(t, '+ y', ['markup.math.display.tiddlywiki']);
  await expectScopes(t, 'after1', [], ['markup.math']);
  await expectScopes(t, 'after2', [], ['markup.math']);
});

test('MathJax: math is recognized inside formatting, lists and table cells', async () => {
  const t = String.raw`//over \(E\) is// and
* \(\mathcal{O}_{\mathcal{E}}\) ring
|\(a // b\)|x|`;
  await expectScopes(t, 'E\\)', ['markup.italic.tiddlywiki', 'markup.math.inline.tiddlywiki']);
  await expectScopes(t, 'mathcal', ['markup.list.unnumbered.tiddlywiki', 'markup.math.inline.tiddlywiki']);
  await expectScopes(t, 'a // b', ['meta.table.cell.tiddlywiki', 'markup.math.inline.tiddlywiki'], ['markup.italic']);
});

test('single dollars are not math for this plugin', async () => {
  await expectScopes('price $x$ here', 'x', [], ['markup.math']);
});

test('links, WikiWords, URLs and images', async () => {
  const t = 'See [[Simple]] [[text|Target]] WikiWord ~NotLink aWikiWord http://x.org/a [<img[tip|pic.png][Target]]';
  await expectScopes(t, 'Simple', ['meta.link.tiddlywiki', 'markup.underline.link.tiddlywiki']);
  await expectScopes(t, 'text', ['string.other.link.title.tiddlywiki']);
  await expectScopes(t, 'Target', ['markup.underline.link.tiddlywiki']);
  await expectScopes(t, 'WikiWord', ['markup.underline.link.wikiword.tiddlywiki']);
  await expectScopes(t, 'NotLink', [], ['markup.underline.link']);
  await expectScopes(t, 'WikiWord', [], ['markup.underline.link'], 2); // preceded by a letter
  await expectScopes(t, 'http', ['markup.underline.link.url.tiddlywiki']);
  await expectScopes(t, 'pic.png', ['meta.image.tiddlywiki', 'markup.underline.link.image.tiddlywiki']);
  await expectScopes(t, '<', ['keyword.operator.float.tiddlywiki']);
});

test('TiddlyWiki quirk: a URL or WikiWord cannot run past the closing marker', async () => {
  // TiddlyWiki ends the italics at the "//" inside "http://".
  const t = 'A //see http://example.com/page// b';
  await expectScopes(t, 'see', ['markup.italic.tiddlywiki']);
  await expectScopes(t, 'http', ['markup.italic.tiddlywiki'], ['markup.underline.link.url']);
  await expectScopes(t, 'example', [], ['markup.italic.tiddlywiki ']);
  const u = '__see ~Hello__There__';
  await expectScopes(u, 'There', [], ['markup.underline.tiddlywiki']);
});

test('macros', async () => {
  const t = `<<tiddler [[Some Title]] with:"a b" 'c'>> <<slider chk T "label" "tool
tip">> << not`;
  await expectScopes(t, 'tiddler', ['entity.name.function.macro.tiddlywiki']);
  await expectScopes(t, 'Some', ['string.quoted.other.brackets.tiddlywiki']);
  await expectScopes(t, 'with', ['variable.parameter.tiddlywiki']);
  await expectScopes(t, 'a b', ['string.quoted.double.tiddlywiki']);
  await expectScopes(t, 'tip', ['meta.macro.tiddlywiki', 'string.quoted.double.tiddlywiki']);
  await expectScopes(t, '<< not', ['invalid.illegal.macro.tiddlywiki']);
});

test('tables', async () => {
  const t = `|Caption|c
|cls|k
|!Header|plain|
|A|B|h
| right|bgcolor(#fdd): styled|>|~|
|Footer|f`;
  await expectScopes(t, 'Caption', ['meta.table.caption.tiddlywiki']);
  await expectScopes(t, 'cls', ['entity.other.attribute-name.class.tiddlywiki']);
  await expectScopes(t, 'Header', ['meta.table.cell.tiddlywiki', 'markup.bold.table-header.tiddlywiki']);
  await expectScopes(t, 'plain', ['meta.table.cell.tiddlywiki'], ['table-header']);
  await expectScopes(t, 'A', ['markup.bold.table-header.tiddlywiki']); // every cell of an |h row
  await expectScopes(t, 'bgcolor', ['support.type.property-name.css']);
  await expectScopes(t, '>', ['keyword.operator.table-span.tiddlywiki']);
  await expectScopes(t, 'f', ['keyword.other.table-row-type.tiddlywiki'], [], 2);
});

test('code blocks embed VS Code JavaScript, CSS and HTML grammars', async () => {
  const t = `{{{
no ''format'' here
}}}
//{{{
var x = /re/;
//}}}
/*{{{*/
.viewer span.marked { color: #c00; }
/*}}}*/
<!--{{{-->
<div class='toolbar'></div>
<!--}}}-->`;
  await expectScopes(t, 'format', ['markup.raw.block.plain.tiddlywiki'], ['markup.bold']);
  await expectScopes(t, 'var', ['meta.embedded.block.javascript', 'storage.type.js']);
  await expectScopes(t, 'marked', ['meta.embedded.block.css', 'entity.other.attribute-name.class.css']);
  await expectScopes(t, 'color', ['support.type.property-name.css']);
  await expectScopes(t, 'div', ['meta.embedded.block.html', 'entity.name.tag']);
});

test('plugin documentation comments are wikified', async () => {
  const t = `/***
|''Name:''|MathJaxPlugin|
!! How to Use
***/
//{{{
config.extensions.MathJax = {};
//}}}`;
  await expectScopes(t, '/***', ['comment.block.documentation.tiddlywiki']);
  await expectScopes(t, 'Name', ['meta.documentation.tiddlywiki', 'markup.bold.tiddlywiki']);
  await expectScopes(t, 'How to Use', ['markup.heading.tiddlywiki']);
  await expectScopes(t, 'config', ['meta.embedded.block.javascript'], ['meta.documentation']);
});

test('TiddlyWiki quirk: after a list, "***/" is a list item and does not end the comment', async () => {
  const t = `/***
* item
***/
//{{{
x();
//}}}
!!Heading
***/`;
  await expectScopes(t, '***/', ['markup.list.unnumbered.tiddlywiki']);
  await expectScopes(t, 'x()', ['meta.documentation.tiddlywiki', 'meta.embedded.block.javascript']);
  await expectScopes(t, '***/', ['comment.block.documentation.tiddlywiki'], ['markup.list'], 2);
});

test('comments, HTML, raw text, entities and custom formatting', async () => {
  const t = `/%hidden ''x''%/ <html><b>raw</b></html> """no ''bold''""" <nowiki>//no//</nowiki> &mdash; <br>
@@marked@@ @@color:red;red@@ {{cls{wrapped}}}`;
  await expectScopes(t, 'hidden', ['comment.block.tiddlywiki'], ['markup.bold']);
  await expectScopes(t, '<b>', ['meta.html.tiddlywiki', 'meta.embedded.block.html']);
  await expectScopes(t, "no ''bold", ['markup.other.nowiki.tiddlywiki'], ['markup.bold']);
  await expectScopes(t, '//no//', ['markup.other.nowiki.tiddlywiki'], ['markup.italic']);
  await expectScopes(t, '&mdash;', ['constant.character.entity.tiddlywiki']);
  await expectScopes(t, 'br', ['entity.name.tag.tiddlywiki']);
  await expectScopes(t, 'marked', ['markup.highlight.tiddlywiki']);
  await expectScopes(t, 'color', ['support.type.property-name.css']);
  await expectScopes(t, 'red@@', ['markup.other.styled.tiddlywiki']);
  await expectScopes(t, 'cls', ['entity.other.attribute-name.class.tiddlywiki']);
  await expectScopes(t, 'wrapped', ['meta.class-wrapper.tiddlywiki']);
});

test('the grammar loads on its own if the embedded grammars are missing', async () => {
  const tokens = await tokenize(String.raw`''b'' \(x\)`, { withEmbedded: false });
  assert.ok(tokens.some((t) => t.scopes.includes('markup.math.inline.tiddlywiki')));
});
