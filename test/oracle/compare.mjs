// Compares the grammar's tokenization with what TiddlyWiki Classic's own
// wikifier does, character by character.

import { tokenize } from '../textmate.mjs';
import { wikifySpans } from './tw-oracle.mjs';

const K = (re, kind) => [re, kind];
const scopeKinds = [
  K(/^markup\.bold\.tiddlywiki$/, 'bold'),
  K(/^markup\.italic\.tiddlywiki$/, 'italic'),
  K(/^markup\.underline\.tiddlywiki$/, 'underline'),
  K(/^markup\.other\.superscript\.tiddlywiki$/, 'sup'),
  K(/^markup\.other\.subscript\.tiddlywiki$/, 'sub'),
  K(/^markup\.strikethrough\.tiddlywiki$/, 'strike'),
  K(/^markup\.inline\.raw\.tiddlywiki$/, 'code'),
  K(/^markup\.raw\.block\.(css|plain|javascript|html)\.tiddlywiki$/, (m) => `block-${m[1]}`),
  K(/^markup\.heading\.tiddlywiki$/, 'heading'),
  K(/^markup\.list\.unnumbered\.tiddlywiki$/, 'item-ul'),
  K(/^markup\.list\.numbered\.tiddlywiki$/, 'item-ol'),
  K(/^markup\.list\.definition\.term\.tiddlywiki$/, 'item-dt'),
  K(/^markup\.list\.definition\.description\.tiddlywiki$/, 'item-dd'),
  K(/^markup\.quote(\.block)?\.tiddlywiki$/, 'quote'),
  K(/^meta\.separator\.tiddlywiki$/, 'rule'),
  K(/^meta\.documentation\.tiddlywiki$/, 'doc'),
  K(/^meta\.macro\.tiddlywiki$/, 'macro'),
  K(/^meta\.link\.tiddlywiki$/, 'link'),
  K(/^markup\.underline\.link\.wikiword\.tiddlywiki$/, 'wikilink'),
  K(/^markup\.underline\.link\.url\.tiddlywiki$/, 'url'),
  K(/^meta\.image\.tiddlywiki$/, 'image'),
  K(/^meta\.html\.tiddlywiki$/, 'html'),
  K(/^comment\.block\.tiddlywiki$/, 'comment'),
  K(/^markup\.other\.styled\.tiddlywiki$/, 'styled'),
  K(/^markup\.highlight\.tiddlywiki$/, 'marked'),
  K(/^meta\.class-wrapper\.tiddlywiki$/, 'classwrap'),
  K(/^markup\.other\.nowiki\.tiddlywiki$/, 'nowiki'),
  K(/^markup\.math\.inline\.tiddlywiki$/, 'math-inline'),
  K(/^markup\.math\.display\.tiddlywiki$/, 'math-display'),
  K(/^meta\.table\.(row|caption|class-row)\.tiddlywiki$/, 'table'),
  K(/^meta\.table\.cell\.tiddlywiki$/, 'cell'),
  K(/^meta\.table\.caption\.tiddlywiki$/, 'caption'),
  K(/^invalid\.illegal\.[\w-]+\.tiddlywiki$/, 'dropped'),
];
// TiddlyWiki's container content excludes its own markers ("!", "*", "|",
// ">", "<<<"), so a marker token only drops the container it delimits.
const markers = [
  [/^punctuation\.definition\.list\./, ['item-ul', 'item-ol', 'item-dt', 'item-dd']],
  [/^punctuation\.definition\.heading\./, ['heading']],
  [/^punctuation\.definition\.quote\./, ['quote']],
  [/^(punctuation\.separator\.table|punctuation\.definition\.table|keyword\.other\.table-row-type|keyword\.operator\.table-span)\./, ['cell', 'caption']],
];
const cssScope = /\.css$/;

function kindsOfScopes(scopes) {
  const kinds = new Set();
  for (const s of scopes) {
    for (const part of s.split(' ')) {
      for (const [re, kind] of scopeKinds) {
        const m = re.exec(part);
        if (m) kinds.add(typeof kind === 'function' ? kind(m) : kind);
      }
    }
  }
  const parts = scopes.flatMap((s) => s.split(' '));
  for (const [re, drop] of markers) if (parts.some((p) => re.test(p))) drop.forEach((k) => kinds.delete(k));
  if (scopes.some((s) => cssScope.test(s)) && !kinds.has('styled')) kinds.delete('cell');
  return kinds;
}

export async function compare(source) {
  source = source.replace(/\r\n?/g, '\n');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);

  const grammarKinds = new Array(source.length).fill(null);
  for (const t of await tokenize(source)) {
    const kinds = kindsOfScopes(t.scopes);
    for (let c = t.startIndex; c < t.endIndex; c++) grammarKinds[lineStarts[t.line] + c] = kinds;
  }

  const twKinds = Array.from({ length: source.length }, () => new Set());
  for (const s of await wikifySpans(source)) {
    for (let i = s.start; i < s.end && i < source.length; i++) twKinds[i].add(s.kind);
  }

  const diffs = [];
  let open = null;
  for (let i = 0; i < source.length; i++) {
    if (/\s/.test(source[i])) continue;
    const g = [...(grammarKinds[i] ?? [])].sort().join(',');
    const w = [...twKinds[i]].sort().join(',');
    if (g !== w) {
      if (open && open.g === g && open.w === w && open.end >= i - 3) open.end = i + 1;
      else diffs.push((open = { start: i, end: i + 1, g, w }));
    }
  }
  return diffs.map((d) => {
    const line = lineStarts.findLastIndex((s) => s <= d.start);
    const lineText = source.slice(lineStarts[line], source.indexOf('\n', d.start) === -1 ? undefined : source.indexOf('\n', d.start));
    return { ...d, line: line + 1, text: source.slice(d.start, d.end), lineText };
  });
}
