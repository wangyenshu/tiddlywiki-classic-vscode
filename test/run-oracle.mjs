// Checks the grammar against TiddlyWiki Classic's real wikifier on every file
// in test/corpus. Prints each place where they disagree.
//
//   node test/run-oracle.mjs            all corpus files
//   node test/run-oracle.mjs FILE...    selected files

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from './oracle/compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'corpus');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = process.argv.length > 2 ? process.argv.slice(2) : walk(corpus).filter((f) => f.endsWith('.twc'));

let total = 0;
let bad = 0;
for (const file of files) {
  const diffs = await compare(readFileSync(file, 'utf8'));
  total++;
  if (!diffs.length) continue;
  bad++;
  console.log(`\n${relative(corpus, file)}: ${diffs.length} difference(s)`);
  for (const d of diffs.slice(0, 8)) {
    console.log(`  line ${d.line}: ${JSON.stringify(d.text.slice(0, 60))}  grammar=[${d.g}] tiddlywiki=[${d.w}]`);
    console.log(`    | ${d.lineText.slice(0, 140)}`);
  }
}
console.log(`\n${total - bad}/${total} files match TiddlyWiki Classic's wikifier`);
process.exitCode = bad ? 1 : 0;
