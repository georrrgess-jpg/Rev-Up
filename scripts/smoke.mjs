// Production smoke test at a nested Pages-style path, in headless Chromium:
// manifest/icons/SW resolve under the path, first load, a drag merge, offline relaunch with a
// merge and a full race, then an upgrade to a second build that keeps the save without a reload loop.
// Usage: npm run smoke     (builds twice into .smoke/, serves at /nested/path/Rev-Up/)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PREFIX = process.env.SMOKE_PREFIX ?? '/nested/path/Rev-Up/';
const PORT = 4321;
const ORIGIN = `http://localhost:${PORT}`;
const URL0 = `${ORIGIN}${PREFIX}`;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

function build(out) {
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, { stdio: 'pipe', env: { ...process.env, REVUP_BASE: PREFIX } });
}

rmSync('.smoke', { recursive: true, force: true });
mkdirSync('.smoke', { recursive: true });
build('.smoke/v1');
await new Promise((r) => setTimeout(r, 1100)); // new build timestamp → new hashes
build('.smoke/v2');
const site = { dir: '.smoke/site' };
cpSync('.smoke/v1', site.dir, { recursive: true });
const server = await serve(site, PREFIX, PORT);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });

try {
  // --- resources under the project path
  for (const p of ['', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) {
    const r = await fetch(URL0 + p);
    ok(`GET ${PREFIX}${p}`, r.status === 200, String(r.status));
  }
  const man = await (await fetch(URL0 + 'manifest.webmanifest')).json();
  ok('manifest scope/start_url/id use the project path', man.scope === PREFIX && man.start_url.startsWith(PREFIX) && man.id === PREFIX && man.display === 'standalone');

  // --- first load
  const t0 = Date.now();
  await page.goto(URL0);
  await page.waitForSelector('.board .cell .part');
  const loadMs = Date.now() - t0;
  ok('garage usable on first load', true, `${loadMs} ms (localhost, no throttling)`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 });
  const cacheKeys = await page.evaluate(() => caches.keys());
  ok('service worker controls the page with a scoped, revisioned cache', cacheKeys.some((k) => k.startsWith(`revup:${PREFIX}:`)), cacheKeys.join(', '));
  await page.waitForSelector('.toast >> text=Offline play is ready', { timeout: 10000 }).then(() => ok('player is told offline play is ready', true), () => ok('player is told offline play is ready', false));

  // --- drag merge
  const a = await page.locator('[data-zone=board][data-i="11"]').boundingBox();
  const b = await page.locator('[data-zone=board][data-i="12"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 30, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const tier2 = await page.locator('[data-zone=board][data-i="12"] .tier').textContent();
  ok('drag merge creates a T2 part in the destination', tier2 === '2', `tier ${tier2}`);
  const saveKey = `revup:${PREFIX}:save`;
  const saved = await page.evaluate((k) => !!localStorage.getItem(k), saveKey);
  ok('save is namespaced to the project path', saved, saveKey);

  // --- offline relaunch, merge and a race
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.board .cell .part', { timeout: 10000 });
  ok('relaunches offline from the cache', true);
  const tierAfter = await page.locator('[data-zone=board][data-i="12"] .tier').textContent();
  ok('progress persisted across relaunch', tierAfter === '2');
  // tap-to-select merge offline: find a matching pair through the game data in the DOM labels
  const merged = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-zone=board]')];
    const labels = cells.map((c) => c.getAttribute('aria-label'));
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      if (labels[i] && labels[i] !== 'Empty slot' && labels[i] === labels[j] && !labels[i].includes('T5')) {
        cells[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        cells[j].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return labels[i];
      }
    }
    return null;
  });
  ok('tap-to-select merge works offline', !!merged, merged ?? 'no pair found');
  await page.click('.btn.race');
  await page.waitForSelector('.racescreen', { timeout: 5000 });
  await page.waitForTimeout(6000);
  await page.keyboard.press('Space');
  await page.waitForSelector('.result .card', { timeout: 45000 });
  const place = await page.locator('.result .place').textContent();
  const gap = await page.locator('.result .gap').textContent();
  ok('completes a race offline with a measured result', true, `${place} · ${gap}`);
  await page.click('.result .btn:not(.primary)');
  const cashOffline = await page.locator('.chip.cash .v').textContent();
  await ctx.setOffline(false);

  // --- upgrade to v2 while keeping the save
  cpSync('.smoke/v2', site.dir, { recursive: true, force: true });
  const v1 = JSON.parse(readFileSync('.smoke/v1/version.json', 'utf8')).version;
  const v2 = JSON.parse(readFileSync('.smoke/v2/version.json', 'utf8')).version;
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r?.update(); });
  await page.waitForSelector('.toast >> text=An update is ready', { timeout: 20000 });
  ok('update is staged and offered on a safe screen', true);
  navs = 0;
  await page.click('.toast .btn');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.board .cell .part');
  const keys2 = await page.evaluate(() => caches.keys());
  ok('new revision serves after reload, old Rev Up cache removed', keys2.length === 1 && keys2[0].endsWith(v2) && v1 !== v2, keys2.join(', '));
  ok('no reload loop after update', navs <= 2, `${navs} navigations`);
  const cashAfter = await page.locator('.chip.cash .v').textContent();
  ok('save survives the asset update', cashAfter === cashOffline, `cash ${cashOffline} → ${cashAfter}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('smoke run', false, String(e) + ' ' + String(e?.cause ?? ''));
  await page.screenshot({ path: '.smoke/failure.png' });
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
