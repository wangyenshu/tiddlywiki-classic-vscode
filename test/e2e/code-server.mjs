// Starts code-server (VS Code in the browser) with the extension installed in a
// throw-away profile, and opens it in headless Chromium.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function startVSCode({ vsix, files = [], settings = {} }) {
  const entry = process.env.CODE_SERVER;
  if (!entry) throw new Error('Set CODE_SERVER to code-server/out/node/entry.js');
  const work = mkdtempSync(join(tmpdir(), 'twc-e2e-'));
  const userData = join(work, 'user');
  const extDir = join(work, 'extensions');
  const folder = join(work, 'workspace');
  mkdirSync(join(userData, 'User'), { recursive: true });
  mkdirSync(folder);
  for (const f of files) {
    if (typeof f === 'string') copyFileSync(f, join(folder, basename(f)));
    else writeFileSync(join(folder, f.name), f.text);
  }
  execFileSync('node', [entry, '--install-extension', resolve(vsix), '--extensions-dir', extDir, '--user-data-dir', userData], { stdio: 'ignore' });

  const writeSettings = (extra) =>
    writeFileSync(
      join(userData, 'User', 'settings.json'),
      JSON.stringify(
        {
          'workbench.startupEditor': 'none',
          'security.workspace.trust.enabled': false,
          'editor.minimap.enabled': false,
          'editor.fontSize': 15,
          'editor.lineHeight': 22,
          'workbench.tips.enabled': false,
          'chat.disableAIFeatures': true,
          'workbench.secondarySideBar.defaultVisibility': 'hidden',
          ...settings,
          ...extra,
        },
        null,
        2
      )
    );
  writeSettings({});

  const port = 18000 + Math.floor(Math.random() * 1000);
  const server = spawn(
    'node',
    [entry, '--auth', 'none', '--bind-addr', `127.0.0.1:${port}`, '--extensions-dir', extDir, '--user-data-dir', userData, '--disable-telemetry', '--disable-workspace-trust', folder],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  server.stderr.on('data', () => {});
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('code-server did not start')), 60000);
    server.stdout.on('data', (d) => {
      if (/HTTP server listening/.test(d.toString())) {
        clearTimeout(t);
        ok();
      }
    });
  });
  const browser = await chromium.launch({ executablePath: CHROMIUM });

  async function openPage() {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(`http://127.0.0.1:${port}/?folder=${encodeURIComponent(folder)}`);
    await page.waitForSelector('.monaco-workbench', { timeout: 60000 });
    await page.waitForTimeout(3000);
    return page;
  }

  async function openFile(page, name) {
    await page.keyboard.press('Control+P');
    await page.waitForSelector('.quick-input-widget input', { timeout: 20000 });
    await page.keyboard.type(name);
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.monaco-editor .view-lines', { timeout: 20000 });
    await page.waitForTimeout(3000);
  }

  async function close() {
    await browser.close();
    server.kill();
  }

  return { openPage, openFile, writeSettings, close, folder };
}
