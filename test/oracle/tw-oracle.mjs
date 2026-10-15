// Runs the real TiddlyWiki Classic wikifier (test-only copies of its source in
// ./tiddlywiki-classic) plus the MathJax plugin's formatter in a jsdom window,
// and reports which part of the source each formatter consumed.
//
// Every formatter handler and every subWikifyTerm call is instrumented, so the
// result is a list of {kind, start, end} source ranges:
//   - "inline" kinds (bold, math-inline, link, ...) cover the whole construct,
//     delimiters included, like a TextMate region does;
//   - "container" kinds (heading, item-ul, cell, quote, ...) cover only the
//     wikified content, without markers such as "!", "*", "|" or ">".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const here = dirname(fileURLToPath(import.meta.url));
const twFile = (name) => readFileSync(join(here, 'tiddlywiki-classic', name), 'utf8');

// The formatter from the MathJaxPlugin tiddler, verbatim.
const mathJaxPluginFormatter = String.raw`
config.formatters.push({
	name: "mathJaxFormula",
	match: "\\\\\\[|\\$\\$|\\\\\\(",
	handler: function(w)
	{
		switch(w.matchText) {
		case "\\[": // displayed equations
			this.lookaheadRegExp = /\\\[((?:.|\n)*?)(\\\])/mg;
			break;
		case "$$": // inline equations
			this.lookaheadRegExp = /\$\$((?:.|\n)*?)(\$\$)/mg;
			break;
		case "\\(": // inline equations
			this.lookaheadRegExp = /\\\(((?:.|\n)*?)(\\\))/mg;
			break;
		default:
			break;
		}
		this.lookaheadRegExp.lastIndex = w.matchStart;
		var lookaheadMatch = this.lookaheadRegExp.exec(w.source);
		if(lookaheadMatch && lookaheadMatch.index == w.matchStart) {
			createTiddlyElement(w.output,"span",null,null,lookaheadMatch[0]);
			w.nextMatch = this.lookaheadRegExp.lastIndex;
		}
	}
});
`;

const stubs = String.raw`
var config = { browser: { isIE: false } };
var isBadSafari = false;
var store = { isShadowTiddler: function() { return false; }, tiddlerExists: function() { return false; } };
function createTiddlyText(parent, text) { return parent.appendChild(document.createTextNode(text)); }
function createTiddlyElement(parent, element, id, className, text, attribs) {
	var n, e = document.createElement(element);
	if(className != null) e.className = className;
	if(id != null) e.setAttribute('id', id);
	if(text != null) createTiddlyText(e, text);
	if(attribs) { for(n in attribs) e.setAttribute(n, attribs[n]); }
	if(parent != null) parent.appendChild(e);
	return e;
}
function createTiddlyLink(place, title) { return createTiddlyElement(place, "a", null, "tiddlyLink"); }
function createExternalLink(place, url) { return createTiddlyElement(place, "a", null, "externalLink"); }
function invokeMacro(place, macro, params) { createTiddlyElement(place, "span", null, "macro"); }
function showException(e) { throw e; }
function jQuery(e) { return { addClass: function(c) { e.className += " " + c; } }; }
`;

let windowPromise;
function getWindow() {
  windowPromise ??= (async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(stubs);
    w.eval(twFile('TextPrimitives.js'));
    w.eval(twFile('FormatterHelpers.js'));
    w.eval(twFile('Formatter.js'));
    w.eval(twFile('Wikifier.js'));
    w.eval(mathJaxPluginFormatter);
    w.eval('var __formatter = new Formatter(config.formatters);');
    return w;
  })();
  return windowPromise;
}

const charFormatKinds = { "''": 'bold', '//': 'italic', __: 'underline', '^^': 'sup', '~~': 'sub', '--': 'strike', '{{{': 'code' };
const blockKinds = { '/*{{{*/\n': 'block-css', '{{{\n': 'block-plain', '//{{{\n': 'block-javascript', '<!--{{{-->\n': 'block-html' };
const mathKinds = { '\\(': 'math-inline', '\\[': 'math-display', '$$': 'math-display' };

export async function wikifySpans(source) {
  const win = await getWindow();
  const spans = [];
  const { Wikifier } = win;
  const formatters = win.__formatter.formatters;

  const originals = formatters.map((f) => f.handler);
  formatters.forEach((f, i) => {
    f.handler = function (w) {
      const matchText = w.matchText;
      const start = w.matchStart;
      const out = w.output;
      const before = out.childNodes.length;
      originals[i].call(this, w);
      const created = out.childNodes.length > before ? out.childNodes[before] : null;
      const end = w.nextMatch;
      const consumedMore = end > start + matchText.length;
      let kind = null;
      switch (f.name) {
        case 'table': kind = 'table'; break;
        case 'quoteByBlock': kind = null; break; // content recorded by subWikifyTerm
        case 'rule': kind = 'rule'; break;
        case 'monospacedByLine': kind = consumedMore ? blockKinds[matchText] : null; break;
        case 'wikifyComment': kind = 'doc'; break;
        case 'macro': kind = consumedMore ? 'macro' : 'dropped'; break;
        case 'prettyLink': kind = consumedMore ? 'link' : 'dropped'; break;
        case 'wikiLink': kind = created && created.nodeType === 1 ? 'wikilink' : null; break;
        case 'urlLink': kind = 'url'; break;
        case 'image': kind = consumedMore ? 'image' : null; break;
        case 'html': kind = consumedMore ? 'html' : null; break;
        case 'commentByBlock': kind = consumedMore ? 'comment' : null; break;
        case 'characterFormat': kind = matchText === '{{{' && !consumedMore ? null : charFormatKinds[matchText]; break;
        case 'customFormat':
          if (matchText === '@@') kind = created && created.className === 'marked' ? 'marked' : 'styled';
          else kind = created ? 'classwrap' : null;
          break;
        case 'rawText': kind = consumedMore ? 'nowiki' : null; break;
        case 'mathJaxFormula': kind = consumedMore ? mathKinds[matchText] : null; break;
        default: kind = null; // heading, list, quoteByLine (containers), mdash, lineBreak, entities
      }
      if (kind) spans.push({ kind, start, end });
    };
  });

  const containerKind = (el) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'li') return el.parentNode.tagName.toLowerCase() === 'ol' ? 'item-ol' : 'item-ul';
    if (tag === 'dt') return 'item-dt';
    if (tag === 'dd') return 'item-dd';
    if (tag === 'td' || tag === 'th') return 'cell';
    if (tag === 'caption') return 'caption';
    if (tag === 'blockquote') return 'quote';
    return null;
  };
  const origTerm = Wikifier.prototype.subWikifyTerm;
  Wikifier.prototype.subWikifyTerm = function (output, terminatorRegExp) {
    const start = this.nextMatch;
    origTerm.call(this, output, terminatorRegExp);
    // Did it stop at a terminator? Then the content ends where the terminator starts.
    terminatorRegExp.lastIndex = this.matchStart;
    const m = terminatorRegExp.exec(this.source);
    const terminated = m && m.index === this.matchStart && this.matchStart + m[0].length === this.nextMatch;
    const end = terminated ? this.matchStart : this.nextMatch;
    const kind = output.nodeType === 1 ? containerKind(output) : null;
    if (kind) spans.push({ kind, start, end });
  };

  try {
    const w = new Wikifier(source, win.__formatter, null, null);
    const root = win.document.createElement('div');
    w.subWikify(root);
  } finally {
    formatters.forEach((f, i) => (f.handler = originals[i]));
    Wikifier.prototype.subWikifyTerm = origTerm;
  }
  return spans;
}
