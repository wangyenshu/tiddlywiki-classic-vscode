// End-to-end check in a real VS Code (code-server): installs the packaged
// .vsix, opens a file, and reports the language mode, the outline, the colors
// VS Code actually renders, and saves screenshots.
//
//   CODE_SERVER=/path/to/code-server/out/node/entry.js \
//     node test/e2e/vscode-render.mjs ext.vsix file.twc out-dir [theme...]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { startVSCode } from './code-server.mjs';

const [vsix, file, outDir, ...themes] = process.argv.slice(2);
if (!vsix || !file || !outDir) {
  console.error('usage: CODE_SERVER=entry.js node vscode-render.mjs ext.vsix file.twc out-dir [theme...]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const vs = await startVSCode({ vsix, files: [file] });
const results = {};
const stemOf = (theme) => `${basename(file).replace(/\W+/g, '-')}-${theme.replace(/\W+/g, '-').toLowerCase()}`;
try {
  for (const theme of themes.length ? themes : ['Default Dark Modern']) {
    vs.writeSettings({ 'workbench.colorTheme': theme });
    const page = await vs.openPage();
    await vs.openFile(page, basename(file));
    await page.keyboard.press('Control+B'); // hide the side bar
    await page.waitForTimeout(800);

    const language = await page.locator('.statusbar-item[id="status.editor.mode"]').innerText().catch(() => '?');
    const tokens = await page.evaluate(() => {
      const out = [];
      for (const line of document.querySelectorAll('.monaco-editor .view-lines .view-line')) {
        const top = parseFloat(line.style.top);
        for (const span of line.querySelectorAll('span > span')) {
          const cs = getComputedStyle(span);
          out.push({ top, text: span.textContent, color: cs.color, style: cs.fontStyle, weight: cs.fontWeight, deco: cs.textDecorationLine });
        }
      }
      return out.sort((a, b) => a.top - b.top);
    });
    const shot = join(outDir, `${stemOf(theme)}.png`);
    await page.screenshot({ path: shot });

    const folds = await page.locator('.monaco-editor .margin .codicon-folding-expanded').count();

    await page.locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.press('Control+Shift+O');
    await page.waitForSelector('.quick-input-widget .monaco-list-row', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const symbols = await page.locator('.quick-input-widget .monaco-list-row .label-name').allInnerTexts();
    await page.screenshot({ path: join(outDir, `${stemOf(theme)}-symbols.png`) });
    await page.keyboard.press('Escape');

    results[theme] = { language, folds, symbols: symbols.map((s) => s.trim()), tokens, screenshot: shot };
    await page.close();
  }
} finally {
  await vs.close();
}
writeFileSync(join(outDir, `${basename(file).replace(/\W+/g, '-')}-tokens.json`), JSON.stringify(results, null, 2));
for (const [theme, r] of Object.entries(results)) {
  console.log(`${theme}: language mode "${r.language}", ${r.tokens.length} rendered tokens, ${r.folds} fold controls`);
  console.log(`  symbols: ${r.symbols.join(' | ')}`);
  console.log(`  screenshot: ${r.screenshot}`);
}
