// Loads the TiddlyWiki Classic grammar together with the grammars it embeds
// (copies of the ones that ship with VS Code) and tokenizes text the way the
// editor does.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'test', 'vendor-grammars');
const grammarFiles = {
  'text.tiddlywiki.classic': join(root, 'syntaxes', 'tiddlywiki-classic.tmLanguage.json'),
  'text.tex': join(vendor, 'TeX.tmLanguage.json'),
  'text.tex.latex': join(vendor, 'LaTeX.tmLanguage.json'),
  'source.js': join(vendor, 'JavaScript.tmLanguage.json'),
  'source.css': join(vendor, 'css.tmLanguage.json'),
  'text.html.basic': join(vendor, 'html.tmLanguage.json'),
};

let registryPromise;
export function getRegistry({ withEmbedded = true } = {}) {
  const key = withEmbedded ? 'full' : 'bare';
  registryPromise ??= {};
  registryPromise[key] ??= (async () => {
    const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
    await oniguruma.loadWASM(wasm).catch(() => {});
    return new vsctm.Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (p) => new oniguruma.OnigScanner(p),
        createOnigString: (s) => new oniguruma.OnigString(s),
      }),
      loadGrammar: async (scopeName) => {
        const file = grammarFiles[scopeName];
        if (!file || (!withEmbedded && scopeName !== 'text.tiddlywiki.classic')) return null;
        return vsctm.parseRawGrammar(readFileSync(file, 'utf8'), file);
      },
    });
  })();
  return registryPromise[key];
}

export async function loadGrammar(opts) {
  const registry = await getRegistry(opts);
  return registry.loadGrammar('text.tiddlywiki.classic');
}

// Returns [{line, startIndex, endIndex, text, scopes}] for the whole document.
export async function tokenize(text, opts) {
  const grammar = await loadGrammar(opts);
  const lines = text.split(/\r?\n/);
  let state = vsctm.INITIAL;
  const out = [];
  lines.forEach((line, i) => {
    const r = grammar.tokenizeLine(line, state);
    for (const t of r.tokens) {
      out.push({ line: i, startIndex: t.startIndex, endIndex: t.endIndex, text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });
    }
    state = r.ruleStack;
  });
  return out;
}

export function show(tokens) {
  return tokens
    .filter((t) => t.text.length)
    .map((t) => `${t.line}:${t.startIndex} ${JSON.stringify(t.text)}  ${t.scopes.slice(1).join(' ')}`)
    .join('\n');
}
