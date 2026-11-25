// Emulated performance check on the production build (headless Chromium via CDP):
// - load: "Fast 3G"-style throttling (1.6 Mbps down, 150 ms RTT) + 4× CPU slowdown, time to a usable garage
// - frames: rAF frame pacing while dragging on a full board, during a race, and during the reveal
// These are emulation numbers, not a physical phone. Usage: npm run build && node scripts/perf.mjs
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PREFIX = '/Rev-Up/';
const PORT = 4322;
const URL0 = `http://localhost:${PORT}${PREFIX}`;
const server = await serve({ dir: 'dist' }, PREFIX, PORT);
const browser = await chromium.launch();

async function session(cpu = Number(process.env.CPU ?? 4)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return { ctx, page };
}

const frameStats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { frames: arr.length, avgMs: +avg.toFixed(1), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(1), fps: +(1000 / avg).toFixed(0), over33: arr.filter((x) => x > 33.4).length };
};
const startFrames = (page) => page.evaluate(() => { window.__ft = []; let l = performance.now(); const f = (t) => { window.__ft.push(t - l); l = t; if (window.__ft.length < 100000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const takeFrames = (page) => page.evaluate(() => { const a = window.__ft.slice(5); window.__ft = []; return a; });

const out = {};
{
  const { ctx, page } = await session(4);
  const t0 = Date.now();
  await page.goto(URL0);
  await page.waitForSelector('.board .cell .part');
  out.loadToGarageMs = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), transferKB: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), n.transferSize || 0) / 1024) }; });
  Object.assign(out, nav);

  // full board drag
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':save'));
    const env = JSON.parse(localStorage.getItem(k));
    const s = JSON.parse(env.data);
    const fams = ['engine', 'tires', 'turbo'];
    s.board = s.board.map((_, i) => ({ id: 1000 + i, f: fams[i % 3], t: (i % 4) + 1, q: 'std' }));
    s.tray = s.tray.map((_, i) => ({ id: 2000 + i, f: fams[i % 3], t: 2, q: 'std' }));
    s.nextPartId = 3000; s.stats.milestones.firstMerge = 1; s.stats.races = 1; s.nitro = 3; s.rev += 10;
    let h = 2166136261; const d = JSON.stringify(s); for (let i = 0; i < d.length; i++) { h ^= d.charCodeAt(i); h = Math.imul(h, 16777619); }
    localStorage.setItem(k, JSON.stringify({ app: 'rev-up', v: 1, sum: h >>> 0, data: d }));
  });
  await page.reload();
  await page.waitForSelector('.board .cell .part');
  await page.waitForTimeout(500);
  await startFrames(page);
  const a = await page.locator('[data-zone=board][data-i="0"]').boundingBox();
  await page.mouse.move(a.x + 20, a.y + 20);
  await page.mouse.down();
  for (let k = 0; k < 120; k++) await page.mouse.move(a.x + 20 + (k % 40) * 6, a.y + 20 + Math.floor(k / 40) * 60, { steps: 1 });
  await page.mouse.up();
  out.fullBoardDrag = frameStats(await takeFrames(page));

  // race
  await page.click('.btn.race');
  await page.waitForTimeout(3000);
  await startFrames(page);
  await page.waitForTimeout(8000);
  out.race = frameStats(await takeFrames(page));
  await ctx.close();
}
{
  // reveal (fresh context, pending reveal)
  const { ctx, page } = await session(4);
  await page.goto(URL0);
  await page.waitForSelector('.board .cell .part');
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':save'));
    const s = JSON.parse(JSON.parse(localStorage.getItem(k)).data);
    s.owned.push('muscle'); s.pendingReveal = 'muscle'; s.rev += 10;
    let h = 2166136261; const d = JSON.stringify(s); for (let i = 0; i < d.length; i++) { h ^= d.charCodeAt(i); h = Math.imul(h, 16777619); }
    localStorage.setItem(k, JSON.stringify({ app: 'rev-up', v: 1, sum: h >>> 0, data: d }));
  });
  await page.reload();
  await page.waitForSelector('.reveal');
  await page.waitForTimeout(400);
  await page.click('.reveal');
  await startFrames(page);
  await page.waitForTimeout(3500);
  out.reveal = frameStats(await takeFrames(page));
  await ctx.close();
}
await browser.close();
server.close();
console.log(JSON.stringify(out, null, 2));
