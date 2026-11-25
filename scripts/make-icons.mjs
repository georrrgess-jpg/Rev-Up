// Renders the original Rev Up app icon (SVG) to PNGs with the pre-installed Playwright Chromium.
// Usage: npm run icons  → public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally; not a project dependency

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#4a321e"/><stop offset="1" stop-color="#160f0a"/></radialGradient>
    <linearGradient id="amb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#f2a33a"/></linearGradient>
    <linearGradient id="car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a5f8f"/><stop offset="1" stop-color="#14243a"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#bg)"/>
  <g transform="${maskable ? 'translate(56 56) scale(0.78)' : ''}">
    <!-- gauge arc -->
    <path d="M86 300 A170 170 0 0 1 426 300" fill="none" stroke="#3a2a1c" stroke-width="34" stroke-linecap="round"/>
    <path d="M86 300 A170 170 0 0 1 380 180" fill="none" stroke="url(#amb)" stroke-width="34" stroke-linecap="round"/>
    <line x1="256" y1="300" x2="372" y2="196" stroke="#fff2d8" stroke-width="14" stroke-linecap="round"/>
    <circle cx="256" cy="300" r="20" fill="#fff2d8"/>
    <!-- coupe silhouette -->
    <path d="M96 404 L96 372 Q100 360 120 358 L170 356 L230 318 L318 316 L356 352 L420 362 Q438 366 440 384 L440 404 Z" fill="url(#car)" stroke="#0b0907" stroke-width="6"/>
    <path d="M238 328 L314 327 L340 352 L214 352 Z" fill="#1b2633"/>
    <rect x="96" y="380" width="344" height="7" fill="#f2b33d"/>
    <circle cx="164" cy="408" r="30" fill="#141110" stroke="#0b0907" stroke-width="6"/><circle cx="164" cy="408" r="13" fill="#c9b07a"/>
    <circle cx="376" cy="408" r="30" fill="#141110" stroke="#0b0907" stroke-width="6"/><circle cx="376" cy="408" r="13" fill="#c9b07a"/>
    <ellipse cx="432" cy="376" rx="8" ry="6" fill="#fff6d8"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', svg(false));
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], // iOS rounds corners itself; use full-bleed art
];
for (const [name, size, mask] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(mask).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: !mask, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
