// Fast end-to-end smoke test of the Windows Electron app, synthetic data only.
// Run: npm run test:e2e   (needs ffmpeg on PATH; screenshots in tests/e2e/out/)
import { _electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIN = path.join(ROOT, 'windows');
const OUT = path.join(ROOT, 'tests', 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });

// ---------- synthetic environment ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-e2e-'));
const HOME = path.join(TMP, 'home');
const PROJ = path.join(TMP, 'Proje');
const claudeProjects = path.join(HOME, '.claude', 'projects', 'C--fake-proje');
fs.mkdirSync(claudeProjects, { recursive: true });
fs.mkdirSync(path.join(PROJ, 'Render'), { recursive: true });
const now = Date.now();
for (const [i, id] of ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].entries()) {
  const ts = new Date(now - (i + 1) * 60000).toISOString();
  const lines = [
    { type: 'user', sessionId: id, cwd: PROJ, timestamp: ts, message: { role: 'user', content: `Sahte oturum ${i + 1}` } },
    { type: 'assistant', sessionId: id, cwd: PROJ, timestamp: ts, message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: 'Tamam.' }], usage: { input_tokens: 10, output_tokens: 5 } } },
  ];
  fs.writeFileSync(path.join(claudeProjects, id + '.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(PROJ, 'Render', 'x.mp4')]);

// ---------- runner ----------
const results = [];
const errors = [];
let page;
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  ${name} (${Date.now() - t} ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`); }
  const shot = path.join(OUT, name.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.png');
  try { await page.screenshot({ path: shot }); } catch {}
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const env = { ...process.env, DT_E2E: '1', DT_E2E_USERDATA: path.join(TMP, 'userdata'),CLAUDE_CONFIG_DIR: path.join(HOME, '.claude'), CODEX_HOME: path.join(HOME, '.codex') };

const electronPath = (await import('file://' + path.join(WIN, 'node_modules', 'electron', 'index.js').replace(/\\/g, '/'))).default;
const app = await _electron.launch({ executablePath: electronPath, args: [WIN, `--user-data-dir=${path.join(TMP, 'userdata')}`], env, timeout: 30000 });
const deadline = setTimeout(() => { console.error('timeout'); app.close().catch(() => {}); process.exit(2); }, 170000);
app.on('window', (w) => { w.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${w.url()} ${m.text()}`)); w.on('pageerror', (e) => errors.push(`[pageerror] ${w.url()} ${e.message}`)); });

try {
  // the dashboard is the window whose page has #studio tabs
  const t0 = Date.now();
  while (!page && Date.now() - t0 < 25000) {
    for (const w of [...app.windows(), ...app.context().pages()]) { try { if (await w.$('.studio-tabs')) { page = w; break; } } catch {} }
    if (!page) await new Promise((r) => setTimeout(r, 300));
  }
  if (!page) throw new Error('dashboard page not found; pages: ' + app.context().pages().map((p) => p.url()).join(', '));
  for (const w of app.windows()) if (w !== page) { w.on('console', () => {}); }
  page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  await step('01 window titled Derin Terminal', async () => {
    await page.waitForLoadState('domcontentloaded');
    const titles = await app.evaluate(({ BrowserWindow, BaseWindow }) => (BaseWindow || BrowserWindow).getAllWindows().map((w) => w.getTitle()));
    assert(titles.some((t) => /Derin Terminal/.test(t)) || /Derin Terminal/.test(await page.title()), 'titles: ' + JSON.stringify(titles));
  });

  await step('02 top bar Turkish', async () => {
    const txt = await page.locator('#newvideo').innerText();
    assert(/yeni video/.test(txt), 'newvideo: ' + txt);
    assert((await page.locator('#settings').getAttribute('title')) === 'Ayarlar', 'settings title');
    const bar = await page.evaluate(() => (document.querySelector('#newvideo').parentElement.innerText || ''));
    assert(!/\b(Settings|New video|Sessions|Loading)\b/.test(bar), 'English in top bar: ' + bar);
  });

  await step('03 studio tabs switch', async () => {
    for (const [label, mount] of [['Efektler', 'presets'], ["Skill'ler", 'skills'], ['Önizleme', 'video']]) {
      await page.locator('.st-tab', { hasText: label }).click();
      await page.waitForFunction((m) => document.getElementById(m + '-mount').classList.contains('on'), mount, { timeout: 3000 });
    }
  });

  await step('04 Efektler cards drawer prompt', async () => {
    await page.locator('.st-tab', { hasText: 'Efektler' }).click();
    await page.waitForSelector('#presets-mount .pz-card', { timeout: 5000 });
    const n = await page.locator('#presets-mount .pz-card').count();
    assert(n >= 19, 'cards: ' + n);
    await page.locator('#presets-mount .pz-card').first().click();
    await page.waitForSelector('.pz-drawer.open', { timeout: 3000 });
    await page.locator('.pz-drawer .pz-metin').fill('SMOKE METNİ');
    const out = await page.locator('.pz-drawer .pz-out').inputValue();
    assert(out.includes('SMOKE METNİ'), 'prompt lacks text');
    await page.keyboard.press('Escape');
  });

  await step('05 Ayarlar sections and accent', async () => {
    await page.locator('#settings').click();
    await page.waitForSelector('.st-head', { timeout: 5000 });
    const heads = await page.$$eval('.st-head b', (bs) => bs.map((b) => b.textContent.trim()));
    for (const h of ['Profil', 'Görünüm', 'Claude']) assert(heads.includes(h), `missing section ${h}: ${heads}`);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    const other = before.toLowerCase() === '#d4ff00' ? 'cyberpunk' : 'derin';
    await page.evaluate((id) => document.querySelector(`.st-sw[data-accent="${id}"]`).click(), other);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert(after && after !== before, `--accent ${before} -> ${after}`);
    await page.keyboard.press('Escape');
  });

  await step('06 video panel lists x.mp4 Final', async () => {
    await page.evaluate((d) => localStorage.setItem('video.dir', d), PROJ);
    await page.reload();
    await page.waitForSelector('.studio-tabs', { timeout: 10000 });
    await page.locator('.st-tab', { hasText: 'Önizleme' }).click();
    const item = page.locator('.dtv-item', { hasText: 'x.mp4' });
    await item.first().waitFor({ timeout: 8000 });
    assert(await item.first().locator('.dtv-grp.g-final').count(), 'no Final badge');
  });

  await step('07 studio fullscreen toggles', async () => {
    await page.locator('[data-sz="full"]').first().click();
    await page.waitForSelector('.studio-full', { timeout: 2000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.studio-full'), null, { timeout: 2000 });
  });

  await step('08 yeni video modal open close', async () => {
    await page.locator('#newvideo').click();
    const cancel = page.locator('.pj-btn', { hasText: 'Vazgeç' });
    await cancel.waitFor({ state: 'visible', timeout: 3000 });
    await cancel.click();
    await cancel.waitFor({ state: 'hidden', timeout: 3000 });
  });

  await step('09 no console errors', async () => {
    assert(errors.length === 0, errors.length + ' error(s):\n' + errors.join('\n'));
  });
} finally {
  clearTimeout(deadline);
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  try { execFileSync('taskkill', ['/PID', String(app.process().pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`\n--- ${f.name}\n${f.err}`);
process.exit(failed.length ? 1 : 0);
