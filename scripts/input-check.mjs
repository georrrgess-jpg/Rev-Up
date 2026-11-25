// Interaction checks against the dev server (npm run dev): keyboard-only merge, scrap press via keyboard,
// two tabs on one save, mute/reduced-motion toggles, and layout at narrow/modern/desktop sizes.
// Usage: npx vite --port 5173 & node scripts/input-check.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const URL0 = process.env.URL ?? 'http://localhost:5173/';
const res = [];
const ok = (n, p, d = '') => { res.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };
const browser = await chromium.launch();

{ // keyboard path
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForSelector('.board .cell .part');
  await page.focus('[data-zone=board][data-i="0"]');
  // engines at r2c1 (i=11) and r2c2 (i=12): move focus Down×2, Right×1 → i=11
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight']) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  ok('keyboard: arrows + Enter select and merge', (await page.locator('[data-zone=board][data-i="12"] .tier').textContent()) === '2');
  const scrap0 = await page.locator('.chip.scrap .v').textContent();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp'); // i=6 → empty? use x on a part instead
  await page.focus('[data-zone=board][data-i="5"]'); // r1c0 tire
  await page.keyboard.press('x');
  await page.waitForTimeout(200);
  if (await page.locator('.sheet').count()) {
    const txt = await page.locator('.sheet').innerText();
    ok('scrapping an equipped part warns about the stat loss and names the next part', /equipped/.test(txt) && /(equips next|left to equip)/.test(txt), txt.split('\n')[1]);
    await page.click('.sheet .btn.danger');
    await page.waitForTimeout(200);
  }
  const scrap1 = await page.locator('.chip.scrap .v').textContent();
  ok('keyboard: x scraps the focused part', Number(scrap1) > Number(scrap0), `${scrap0} → ${scrap1}`);
  // invalid drop returns cleanly (different families)
  const before = await page.evaluate(() => [...document.querySelectorAll('[data-zone=board]')].map((c) => c.getAttribute('aria-label')).join('|'));
  await page.click('[data-zone=board][data-i="12"]');
  await page.click('[data-zone=board][data-i="8"]'); // tire at r1c3
  await page.click('[data-zone=board][data-i="8"]'); // deselect
  const after = await page.evaluate(() => [...document.querySelectorAll('[data-zone=board]')].map((c) => c.getAttribute('aria-label')).join('|'));
  ok('tapping a non-matching part changes selection without mutating the board', before === after);
  // settings toggles
  await page.click('[aria-label=Settings]');
  await page.click('[aria-label="Reduced motion"]');
  await page.click('[aria-label="Sound"]');
  const st = await page.evaluate(() => ({ reduced: document.documentElement.classList.contains('reduced') }));
  ok('reduced motion toggle applies', st.reduced);
  await page.keyboard.press('Escape');
  // page should not scroll during drag
  const scrollY = await page.evaluate(() => document.scrollingElement.scrollTop);
  ok('no page scroll', scrollY === 0);
  await ctx.close();
}

{ // two tabs on one save
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctx.newPage();
  await a.goto(URL0);
  await a.waitForSelector('.board .cell .part');
  const b = await ctx.newPage();
  await b.goto(URL0);
  await b.waitForSelector('.block >> text=open in another tab', { timeout: 5000 });
  ok('second tab is asked before taking over', true);
  await b.click('.block .btn');
  await b.waitForSelector('.board .cell .part');
  await a.waitForSelector('.block >> text=Playing in another tab', { timeout: 5000 });
  ok('first tab freezes when the second takes over', true);
  await ctx.close();
}

const SIZES = [[320, 568, 'small'], [360, 640, 'narrow'], [390, 844, 'modern'], [430, 932, 'large'], [1280, 800, 'desktop']];
for (const [w, h, name] of SIZES) {
  for (const preset of ['', 'full', 'fullx']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(URL0 + (preset ? `?dev=${preset}` : ''));
    await page.waitForTimeout(preset ? 1200 : 300);
    await page.waitForSelector('.board .cell .part');
    const m = await page.evaluate(() => {
      const vis = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= 0 && r.left >= 0 && r.width > 0; };
      const cell = document.querySelector('.board .cell').getBoundingClientRect().width;
      return { race: vis('.btn.race'), board: vis('.board'), tray: vis('.tray'), scrap: vis('.press'), nav: vis('.nav'), cell: Math.round(cell), overflowX: document.documentElement.scrollWidth > innerWidth };
    });
    const pass = m.race && m.board && m.tray && m.scrap && m.nav && !m.overflowX && m.cell >= 36;
    ok(`${name} ${w}×${h}${preset === 'fullx' ? ' full 6×7 board' : preset ? ' full board' : ''}: board, overflow, scrap, Race and nav on screen`, pass, JSON.stringify(m));
    await ctx.close();
  }
}

{ // very large balances and long names must not push controls off screen
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await ctx.newPage();
  await page.goto(URL0 + '?dev=late');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const g = window.revup.game; g.transact((s) => { s.cash = 98765432; s.rep = 1234567; s.scrap = 99999; return [{ type: 'cash', amount: 1, reason: 'test' }]; }); });
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth, settings: document.querySelector('[aria-label=Settings]').getBoundingClientRect().right <= innerWidth }));
  ok('large balances keep the top bar inside 320 px', !m.overflowX && m.settings, JSON.stringify(m));
  await ctx.close();
}
await browser.close();
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
process.exit(res.every(Boolean) ? 0 : 1);
