// Checks the editing behavior promised in the README inside a real VS Code
// (code-server): auto-closing, LaTeX behavior inside formulas, wrapping a
// selection, and block comments.
//
//   CODE_SERVER=/path/to/code-server/out/node/entry.js node test/e2e/vscode-editing.mjs ext.vsix

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVSCode } from './code-server.mjs';

const [vsix] = process.argv.slice(2);
const vs = await startVSCode({
  vsix,
  files: [{ name: 'edit.twc', text: '' }],
  settings: { 'files.autoSave': 'off', 'editor.acceptSuggestionOnEnter': 'off', 'editor.quickSuggestions': { other: false, comments: false, strings: false } },
});

const checks = [];
try {
  const page = await vs.openPage();
  await vs.openFile(page, 'edit.twc');
  await page.locator('.monaco-editor .view-lines').first().click();

  const save = async () => {
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(800);
    return readFileSync(join(vs.folder, 'edit.twc'), 'utf8');
  };
  const clear = async () => {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
  };
  const check = async (name, expected) => {
    const got = await save();
    checks.push({ name, ok: got === expected, got, expected });
    await clear();
  };

  await page.keyboard.type('a \\(');
  await check('typing \\( inserts \\)', 'a \\(\\)');

  await page.keyboard.type('x <<');
  await check('typing << inserts >>', 'x <<>>');

  await page.keyboard.type('\\[ x ');
  await page.keyboard.type('\\left(');
  await check('inside math, \\left( inserts \\right)', '\\[ x \\left(\\right)\\]');

  await page.keyboard.type('word');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type("'");
  await page.keyboard.type("'");
  await check("selecting text and typing ' twice makes it bold", "''word''");

  await page.keyboard.type('word');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('/');
  await page.keyboard.type('/');
  await check('selecting text and typing / twice makes it italic', '//word//');

  await page.keyboard.type('hide me');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+Shift+A');
  await check('Toggle Block Comment uses /% %/', '/% hide me %/');
} finally {
  await vs.close();
}

for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n     expected ${JSON.stringify(c.expected)}\n     got      ${JSON.stringify(c.got)}`}`);
assert.ok(checks.length === 6 && checks.every((c) => c.ok), 'some editing checks failed');
