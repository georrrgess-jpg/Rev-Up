// Race scenery: each area's sky, landmarks, ground, road dressing and foreground. Owned by the art workstream.
// The race screen owns the camera, the road surface, nitro zones and the cars; it calls these in order:
// drawBackdrop → (road) → drawRoadDressing → (zones, cars, effects) → drawForeground.
//
// Performance: the sky and every parallax layer (with its landmarks) are painted once into offscreen tiles per
// screen size and scrolled with two drawImage calls each. Only small flat-colour shapes move live (clouds, birds,
// boats, smoke, flags, blinking lights), so race frames stay cheap on phones. Reduced motion keeps the tiles and
// drops the live motion.
import { TRACKS, type Track } from '../data/tables';

export interface SceneView {
  ctx: CanvasRenderingContext2D;
  W: number; H: number; dpr: number;
  /** Screen rows (device px): horizon line, road top and bottom edges. */
  horizon: number; roadTop: number; roadBot: number;
  /** Camera: world x (m) at the left edge and pixels per metre. */
  camX: number; ppm: number;
  /** Race clock (s) for gentle scenic motion. */
  t: number;
  /** The area look (a track theme, or a district look such as 'riviera' / 'neon': see sceneLook). */
  theme: Track['theme'] | Look;
  trackId: Track['id'] | string;
  reduced: boolean;
}

type Theme = Track['theme'];
/** District looks that reuse a track theme's physics but get their own scenery. */
export type Look = Theme | 'riviera' | 'neon';
export const THEMES: readonly Look[] = ['scrap', 'suburb', 'foundry', 'coast', 'night', 'desert', 'summit', 'riviera', 'neon'];

/** The scenery for a track: its district's own look when it has one (the Azure Riviera's coast tracks, the Neon
 *  Skyline), else the track theme. Unknown themes fall back to a daytime palette, so a new track always draws. */
export function sceneLook(theme: string, trackId?: string): Look {
  const district = trackId ? (TRACKS as Record<string, Track | undefined>)[trackId]?.district as string | undefined : undefined;
  if (theme === 'riviera' || district === 'riviera') return 'riviera';
  if (theme === 'neon' || district === 'neon') return 'neon';
  return theme as Look;
}

interface Pal {
  sky: [string, string, string]; // top, middle, horizon
  sun: string; sunGlow: string; sunY: number; sunR: number; moon?: boolean; stars?: boolean;
  cloud: string; ground: string; road: string; highway: string; fore: string; post: string; lights: number;
}

/** Each area's palette: sky, stage light, ground, road and foreground — carried through the race scene. */
export const PALETTES: Record<Look, Pal> = {
  // Scrapyard Strip: a blazing violet-and-tangerine sunset over the yard
  scrap: { sky: ['#2a1640', '#a63d52', '#ffb04a'], sun: '#ffe08a', sunGlow: 'rgba(255,170,80,0.55)', sunY: 0.86, sunR: 0.075, cloud: 'rgba(255,150,120,0.35)', ground: '#5a3424', road: '#4a3f3a', highway: '#3d3f45', fore: '#24140e', post: '#3a2418', lights: 0.25 },
  // Maple Highway: a bright autumn afternoon
  suburb: { sky: ['#1f63c4', '#5fb0ee', '#ffe2a6'], sun: '#fff4c8', sunGlow: 'rgba(255,240,190,0.5)', sunY: 0.4, sunR: 0.05, cloud: 'rgba(255,255,255,0.85)', ground: '#4f8f3a', road: '#3f4147', highway: '#383b42', fore: '#20381c', post: '#f2efe6', lights: 0.35 },
  // Foundry Circuit: steel-blue dusk lit orange by the furnaces
  foundry: { sky: ['#0b1430', '#2f3f73', '#ff8a3d'], sun: '#ffd7a8', sunGlow: 'rgba(255,120,50,0.5)', sunY: 0.92, sunR: 0.06, cloud: 'rgba(120,110,150,0.45)', ground: '#262a36', road: '#34373e', highway: '#2f3238', fore: '#0d1017', post: '#38404e', lights: 0.85 },
  // Coastal Highway: turquoise sea, white cliffs, a warm late sun
  coast: { sky: ['#1b6fc0', '#6cc4f2', '#ffd8a0'], sun: '#fff2c2', sunGlow: 'rgba(255,230,170,0.55)', sunY: 0.72, sunR: 0.055, cloud: 'rgba(255,255,255,0.8)', ground: '#e2c487', road: '#45434a', highway: '#3c3f46', fore: '#1d3a2a', post: '#e9e4d8', lights: 0.3 },
  // Downtown Nights: violet sky, moon, neon
  night: { sky: ['#070718', '#25124a', '#6a1f6e'], sun: '#eef0ff', sunGlow: 'rgba(200,190,255,0.35)', sunY: 0.3, sunR: 0.032, moon: true, stars: true, cloud: 'rgba(120,80,170,0.35)', ground: '#140f24', road: '#1f1f2a', highway: '#25252f', fore: '#08070f', post: '#1d1a2c', lights: 1 },
  // Desert Proving Ground: cobalt sky over red mesas
  desert: { sky: ['#1857b8', '#5fb4ea', '#ffd59a'], sun: '#fff7d6', sunGlow: 'rgba(255,236,180,0.6)', sunY: 0.32, sunR: 0.06, cloud: 'rgba(255,255,255,0.6)', ground: '#d98a4e', road: '#5a4a40', highway: '#4d4440', fore: '#7a3a1e', post: '#5b3a24', lights: 0.2 },
  // Summit Gala: alpine blue, snowy peaks, the grand-finale gantry
  summit: { sky: ['#0d2f78', '#4b97e0', '#dff0ff'], sun: '#ffffff', sunGlow: 'rgba(255,255,255,0.55)', sunY: 0.35, sunR: 0.045, cloud: 'rgba(255,255,255,0.9)', ground: '#e8f1f8', road: '#363b47', highway: '#30353f', fore: '#1d3346', post: '#2d3b4c', lights: 0.4 },
  // Azure Riviera: a golden-hour Mediterranean — ultramarine sea, pastel villas, cypress and stone balustrades
  riviera: { sky: ['#2b4fa8', '#7fb6ea', '#ffd2a8'], sun: '#fff1c9', sunGlow: 'rgba(255,200,150,0.6)', sunY: 0.62, sunR: 0.06, cloud: 'rgba(255,236,228,0.8)', ground: '#c9b48a', road: '#44424b', highway: '#3b3c46', fore: '#2d4a32', post: '#efe6d2', lights: 0.35 },
  // Neon Skyline: a teal-to-magenta night above glass towers and holo billboards
  neon: { sky: ['#03101f', '#0f2f52', '#a0237a'], sun: '#ffd6f5', sunGlow: 'rgba(255,80,200,0.35)', sunY: 0.5, sunR: 0.03, moon: true, stars: true, cloud: 'rgba(80,40,120,0.3)', ground: '#0b0b1c', road: '#191a26', highway: '#1d1f2c', fore: '#05050c', post: '#141428', lights: 1 },
};
const palOf = (theme: string): Pal => PALETTES[theme as Look] ?? PALETTES.suburb;

export function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Headlight strength for this area (night areas run full beams). */
export const sceneLights = (theme: string) => palOf(theme).lights;
/** Road surface colours for this area. */
export const roadColors = (theme: string) => { const p = palOf(theme); return { road: p.road, highway: p.highway }; };

// ---------------------------------------------------------------- tiles

type C2 = CanvasRenderingContext2D;

/** The largest font size (px) at which `text` fits a box of inner size maxW × maxH, capped at maxPx. Measured with
 *  the real font (canvas measureText, ascent + descent), so a wide fallback font or a different DPR never spills the
 *  text over its sign. */
export function fitFontPx(c: C2, text: string, maxW: number, maxH: number, maxPx: number, weight = 900, family = 'system-ui, sans-serif'): number {
  c.font = `${weight} ${maxPx}px ${family}`;
  const m = c.measureText(text);
  const w = Math.max(1e-6, m.width);
  const asc = m.actualBoundingBoxAscent || maxPx * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const h = Math.max(1e-6, asc + desc);
  return Math.max(1, Math.min(maxPx, (maxPx * maxW) / w, (maxPx * maxH) / h));
}

/** Draw `text` centred in a sign box (x, y, w, h) with `pad` on every side, at the largest size that fits (≤ maxPx). */
export function signText(c: C2, text: string, x: number, y: number, w: number, h: number, pad: number, color: string, maxPx: number, weight = 900, family = 'system-ui, sans-serif') {
  const px = fitFontPx(c, text, w - 2 * pad, h - 2 * pad, maxPx, weight, family);
  c.font = `${weight} ${px}px ${family}`;
  const m = c.measureText(text);
  const asc = m.actualBoundingBoxAscent || px * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const align = c.textAlign, base = c.textBaseline;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillStyle = color;
  // optical centre: put the ink box (ascent + descent) in the middle of the sign
  c.fillText(text, x + w / 2, y + h / 2 + (asc - desc) / 2);
  c.textAlign = align;
  c.textBaseline = base;
}
interface Layer { cv: HTMLCanvasElement; par: number; top: number; w: number; emit: { x: number; y: number; k: string }[] }
interface Built { key: string; sky: HTMLCanvasElement; layers: Layer[]; fore: Layer | null }
let built: Built | null = null;

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

/**
 * Paint a seamlessly repeating layer. `paint` receives a draw context translated so y=0 is the screen top and
 * `place(n, fn)` which calls fn for n evenly spread, jittered items, wrapping across the tile edge.
 */
function layer(w: number, top: number, bottom: number, par: number, paint: (c: C2, place: (n: number, fn: (x: number, r: number, k: number) => void, seed?: number) => void, emit: Layer['emit']) => void): Layer {
  const cv = canvas(w, bottom - top);
  const c = cv.getContext('2d')!;
  c.translate(0, -top);
  const emit: Layer['emit'] = [];
  const place = (n: number, fn: (x: number, r: number, k: number) => void, seed = 0) => {
    for (let k = 0; k < n; k++) {
      const r = hash(k * 7.3 + seed * 13.7 + 1);
      const x = ((k + 0.5 + (r - 0.5) * 0.6) / n) * w;
      for (const o of [-w, 0, w]) fn(x + o, r, k);
    }
  };
  paint(c, place, emit);
  return { cv, par, top, w, emit };
}

function blitLayer(ctx: C2, L: Layer, scroll: number) {
  // whole device pixels: an integer offset is a straight copy (no resampling of a screen-sized bitmap)
  const off = Math.round(((scroll * L.par) % L.w + L.w) % L.w);
  const top = Math.round(L.top);
  ctx.drawImage(L.cv, -off, top);
  if (L.w - off < ctx.canvas.width) ctx.drawImage(L.cv, L.w - off, top);
}

const poly = (c: C2, pts: number[], fill: string) => {
  c.fillStyle = fill; c.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]));
  c.closePath(); c.fill();
};
const disc = (c: C2, x: number, y: number, r: number, fill: string) => { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };

/** A ridge line: a filled silhouette from `base` up to a noisy skyline. */
function ridge(c: C2, w: number, base: number, amp: number, step: number, seed: number, fill: string, sharp = false) {
  c.fillStyle = fill; c.beginPath(); c.moveTo(0, base);
  const n = Math.max(2, Math.round(w / step));
  // periodic noise so the ridge tiles seamlessly
  const h = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    return 0.5 + 0.28 * Math.sin(a * 2 + seed) + 0.16 * Math.sin(a * 5 + seed * 3) + 0.08 * Math.sin(a * 11 + seed * 7);
  };
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w, y = base - amp * h(i);
    if (sharp || i === 0) c.lineTo(x, y);
    else { const px = ((i - 0.5) / n) * w; c.quadraticCurveTo(px, base - amp * h(i - 0.5) - amp * 0.05, x, y); }
  }
  c.lineTo(w, base); c.closePath(); c.fill();
}

function buildSky(v: SceneView, pal: Pal): HTMLCanvasElement {
  const { W, horizon, dpr } = v;
  const cv = canvas(W, horizon + 2);
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, horizon + 2);
  // a gentle darkening at the very top keeps the race HUD text readable on bright skies
  const hud = c.createLinearGradient(0, 0, 0, horizon * 0.35);
  hud.addColorStop(0, 'rgba(0,0,20,0.32)'); hud.addColorStop(1, 'rgba(0,0,20,0)');
  c.fillStyle = hud; c.fillRect(0, 0, W, horizon * 0.35);
  if (pal.stars) {
    for (let k = 0; k < 90; k++) {
      const x = hash(k + 3) * W, y = hash(k * 3.1 + 9) * horizon * 0.75;
      c.fillStyle = `rgba(255,255,255,${0.25 + hash(k * 5.7) * 0.6})`;
      const s = (hash(k * 1.9) > 0.9 ? 2 : 1) * dpr;
      c.fillRect(x, y, s, s);
    }
  }
  const sx = W * 0.76, sy = horizon * pal.sunY, sr = Math.min(W, horizon * 3) * pal.sunR;
  const glow = c.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 5);
  glow.addColorStop(0, pal.sunGlow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, horizon + 2);
  disc(c, sx, sy, sr, pal.sun);
  if (pal.moon) disc(c, sx + sr * 0.35, sy - sr * 0.2, sr * 0.85, pal.sky[1]);
  if (v.theme === 'scrap') {
    // sunset bands across the sun
    c.fillStyle = pal.sky[2];
    for (let k = 0; k < 4; k++) c.fillRect(sx - sr * 1.2, sy + sr * (0.1 + k * 0.22), sr * 2.4, sr * (0.05 + k * 0.025));
  }
  return cv;
}

// ---------------------------------------------------------------- per-theme layers

function buildLayers(v: SceneView, pal: Pal): { layers: Layer[]; fore: Layer | null } {
  const { W, H, horizon: hz, roadTop: rt, roadBot: rb, dpr: u, theme, trackId } = v;
  const tw = Math.ceil(W * 1.6);
  const L: Layer[] = [];
  const add = (par: number, top: number, bottom: number, paint: Parameters<typeof layer>[4]) => L.push(layer(tw, Math.max(0, top), bottom, par, paint));
  const span = rt - hz; // ground band height
  if (theme === 'scrap') {
    add(0.04, hz - 70 * u, hz + 2, (c) => ridge(c, tw, hz + 2, 60 * u, 90 * u, 1, '#6a2f55'));
    add(0.12, hz - 110 * u, hz + span * 0.5, (c, place) => {
      ridge(c, tw, hz + span * 0.5, 40 * u, 60 * u, 4, '#4a2238', true);
      // landmark: the yard crane with a car hanging from its magnet, and the RAY'S YARD sign
      place(1, (x) => {
        poly(c, [x, hz + 4 * u, x + 10 * u, hz + 4 * u, x + 7 * u, hz - 100 * u, x + 3 * u, hz - 100 * u], '#2b1426');
        poly(c, [x - 70 * u, hz - 100 * u, x + 50 * u, hz - 104 * u, x + 50 * u, hz - 96 * u, x - 70 * u, hz - 94 * u], '#2b1426');
        c.fillStyle = '#2b1426'; c.fillRect(x - 58 * u, hz - 96 * u, 1.5 * u, 34 * u);
        c.fillStyle = '#e0a12a'; c.fillRect(x - 70 * u, hz - 62 * u, 26 * u, 10 * u);
        c.fillStyle = '#ffcf3a'; c.fillRect(x + 14 * u, hz - 60 * u, 64 * u, 20 * u);
        signText(c, "RAY'S YARD", x + 14 * u, hz - 60 * u, 64 * u, 20 * u, 3.5 * u, '#2b1426', 11 * u);
      }, 2);
    });
    add(0.3, hz - 40 * u, rt, (c, place) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.35, tw, rt - hz);
      // crushed-car stacks in faded paint colours
      place(9, (x, r, k) => {
        const cols = ['#3f8d8c', '#c2563a', '#d9b23c', '#5d6f9c', '#8a4d77'];
        const n = 2 + Math.floor(r * 3);
        for (let i = 0; i < n; i++) {
          const bw = (30 + hash(k + i) * 14) * u, bh = 9 * u;
          c.fillStyle = cols[(k + i) % cols.length];
          c.fillRect(x - bw / 2 + (hash(k * 3 + i) - 0.5) * 6 * u, hz + span * 0.5 - (i + 1) * bh, bw, bh - 1.5 * u);
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - bw / 2, hz + span * 0.5 - (i + 1) * bh + bh * 0.55, bw, 2 * u);
        }
      }, 5);
      // corrugated fence and tyre piles along the road
      c.fillStyle = '#6b4a3a'; c.fillRect(0, rt - 16 * u, tw, 16 * u);
      c.fillStyle = 'rgba(0,0,0,0.2)'; for (let x = 0; x < tw; x += 6 * u) c.fillRect(x, rt - 16 * u, 2 * u, 16 * u);
      place(7, (x) => { for (let i = 0; i < 3; i++) { c.fillStyle = '#1a1414'; c.beginPath(); c.ellipse(x, rt - 6 * u - i * 7 * u, 12 * u, 4 * u, 0, 0, 7); c.fill(); c.fillStyle = '#3b2d2a'; c.beginPath(); c.ellipse(x, rt - 6 * u - i * 7 * u, 5 * u, 1.6 * u, 0, 0, 7); c.fill(); } }, 8);
    });
  } else if (theme === 'suburb') {
    add(0.04, hz - 50 * u, hz + 2, (c) => ridge(c, tw, hz + 2, 40 * u, 120 * u, 2, '#6fae8a'));
    add(0.12, hz - 90 * u, hz + span * 0.4, (c, place) => {
      ridge(c, tw, hz + span * 0.4, 26 * u, 80 * u, 5, '#4d9152');
      // landmark: the MAPLE water tower on stilts
      place(1, (x) => {
        c.fillStyle = '#6c7a86';
        for (const dx of [-14, -5, 5, 14]) c.fillRect(x + dx * u, hz - 40 * u, 2 * u, 50 * u);
        poly(c, [x - 22 * u, hz - 40 * u, x + 22 * u, hz - 40 * u, x + 18 * u, hz - 70 * u, x - 18 * u, hz - 70 * u], '#eef2f4');
        poly(c, [x - 20 * u, hz - 70 * u, x + 20 * u, hz - 70 * u, x, hz - 84 * u], '#c8432f');
        signText(c, 'MAPLE', x - 17 * u, hz - 64 * u, 34 * u, 18 * u, 2 * u, '#c8432f', 10 * u); // inside the tank's narrow top
      }, 3);
    });
    add(0.3, hz - 40 * u, rt, (c, place) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.3, tw, rt - hz);
      const roofs = ['#c8432f', '#2f8f8a', '#e3a63a', '#5a63b8', '#8d3f6b'];
      const walls = ['#f4ead6', '#dfe8ee', '#f2d8c2', '#e8e1f2'];
      place(8, (x, r, k) => {
        const bw = 44 * u, bh = 26 * u, y = hz + span * 0.55;
        c.fillStyle = walls[k % walls.length]; c.fillRect(x - bw / 2, y - bh, bw, bh);
        poly(c, [x - bw / 2 - 4 * u, y - bh, x + bw / 2 + 4 * u, y - bh, x, y - bh - 18 * u], roofs[k % roofs.length]);
        c.fillStyle = '#3d5b7a'; c.fillRect(x - bw * 0.32, y - bh * 0.7, 8 * u, 8 * u); c.fillRect(x + bw * 0.15, y - bh * 0.7, 8 * u, 8 * u);
        c.fillStyle = '#6b3d2a'; c.fillRect(x - 4 * u, y - 13 * u, 8 * u, 13 * u);
        void r;
      }, 3);
      // autumn maples between the houses
      place(11, (x, r, k) => {
        const y = hz + span * 0.62, s = (0.8 + r * 0.5) * u;
        c.fillStyle = '#5a3a26'; c.fillRect(x - 2 * s, y - 20 * s, 4 * s, 20 * s);
        const leaf = ['#e2572a', '#f2a12c', '#c93a2a', '#f5c33a'][k % 4];
        disc(c, x, y - 28 * s, 14 * s, leaf); disc(c, x - 10 * s, y - 22 * s, 9 * s, leaf); disc(c, x + 10 * s, y - 22 * s, 9 * s, leaf);
        disc(c, x - 4 * s, y - 32 * s, 6 * s, 'rgba(255,255,255,0.18)');
      }, 9);
      // white picket fence along the verge
      c.fillStyle = pal.post;
      for (let x = 0; x < tw; x += 9 * u) poly(c, [x, rt - 2 * u, x + 5 * u, rt - 2 * u, x + 5 * u, rt - 14 * u, x + 2.5 * u, rt - 17 * u, x, rt - 14 * u], pal.post);
      c.fillRect(0, rt - 11 * u, tw, 2 * u);
    });
  } else if (theme === 'foundry') {
    add(0.04, hz - 60 * u, hz + 2, (c) => ridge(c, tw, hz + 2, 40 * u, 70 * u, 3, '#3c3a63', true));
    add(0.12, hz - 150 * u, hz + span * 0.5, (c, place, emit) => {
      c.fillStyle = '#1e2240'; c.fillRect(0, hz - 10 * u, tw, span * 0.5 + 10 * u);
      place(6, (x, r, k) => {
        const hh = (70 + r * 50) * u;
        c.fillStyle = '#1e2240'; c.fillRect(x, hz - hh, 9 * u, hh);
        c.fillStyle = '#d9413a'; c.fillRect(x, hz - hh + 6 * u, 9 * u, 4 * u); c.fillRect(x, hz - hh + 16 * u, 9 * u, 4 * u);
        if (x >= 0 && x < tw) emit.push({ x: x + 4.5 * u, y: hz - hh, k: 'smoke' });
        void k;
      }, 4);
      // landmark: the blast furnace with a glowing tap hole and a gantry crane
      place(1, (x) => {
        poly(c, [x - 30 * u, hz + 4 * u, x + 30 * u, hz + 4 * u, x + 20 * u, hz - 90 * u, x - 20 * u, hz - 90 * u], '#262b4e');
        c.fillStyle = '#ff9a3c'; c.fillRect(x - 14 * u, hz - 40 * u, 28 * u, 6 * u); c.fillRect(x - 10 * u, hz - 70 * u, 20 * u, 4 * u);
        disc(c, x, hz - 8 * u, 8 * u, '#ffcf5a');
        c.fillStyle = '#262b4e'; c.fillRect(x + 30 * u, hz - 70 * u, 90 * u, 5 * u); c.fillRect(x + 112 * u, hz - 70 * u, 5 * u, 74 * u);
        c.strokeStyle = '#ffb24a'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(x + 30 * u, hz - 120 * u); c.lineTo(x + 30 * u, hz - 90 * u); c.stroke();
        poly(c, [x - 6 * u, hz - 90 * u, x + 6 * u, hz - 90 * u, x + 4 * u, hz - 130 * u, x - 4 * u, hz - 130 * u], '#262b4e');
      }, 6);
    });
    add(0.3, hz - 30 * u, rt, (c, place) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.35, tw, rt - hz);
      place(7, (x, r) => {
        const bw = (60 + r * 40) * u, bh = (24 + r * 16) * u, y = hz + span * 0.6;
        c.fillStyle = '#2d3352'; c.fillRect(x, y - bh, bw, bh);
        poly(c, [x, y - bh, x + bw * 0.5, y - bh - 10 * u, x + bw, y - bh], '#2d3352');
        c.fillStyle = '#ff9a3c'; c.fillRect(x + bw * 0.1, y - bh * 0.55, bw * 0.8, 4 * u);
      }, 7);
      // girder fence with hazard tops
      c.fillStyle = '#4a5268'; c.fillRect(0, rt - 12 * u, tw, 3 * u);
      for (let x = 0; x < tw; x += 30 * u) { c.fillStyle = '#4a5268'; c.fillRect(x, rt - 18 * u, 3 * u, 18 * u); c.fillStyle = '#f2c230'; c.fillRect(x, rt - 18 * u, 3 * u, 3 * u); }
    });
  } else if (theme === 'coast') {
    // the sea fills the ground band; an island on the horizon; cliffs with the lighthouse (or harbour cranes)
    add(0.02, hz - 30 * u, rt, (c, place) => {
      const sea = c.createLinearGradient(0, hz, 0, rt);
      sea.addColorStop(0, '#1c86b8'); sea.addColorStop(1, '#22b5c2');
      c.fillStyle = sea; c.fillRect(0, hz - 2 * u, tw, rt - hz + 2 * u);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 60; k++) c.fillRect(hash(k) * tw, hz + hash(k * 3.3) * span * 0.8, (8 + hash(k * 7) * 26) * u, 1.2 * u);
      place(1, (x) => { c.fillStyle = '#3f7c8c'; c.beginPath(); c.ellipse(x, hz, 70 * u, 14 * u, 0, Math.PI, 0); c.fill(); }, 2);
    });
    add(0.14, hz - 110 * u, rt, (c, place) => {
      if (trackId === 'harbor') {
        place(3, (x, r) => {
          c.fillStyle = r > 0.5 ? '#e0532f' : '#2f6fb5';
          c.fillRect(x, hz - 80 * u, 6 * u, 84 * u); c.fillRect(x - 30 * u, hz - 80 * u, 70 * u, 6 * u); c.fillRect(x - 24 * u, hz - 74 * u, 2 * u, 30 * u);
          const cols = ['#d9472b', '#2f8f8a', '#e3a63a', '#3d5fb0'];
          for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % 4]; c.fillRect(x + 14 * u + (i % 3) * 18 * u, hz - 8 * u - Math.floor(i / 3) * 8 * u, 17 * u, 7 * u); }
        }, 11);
      } else {
        place(1, (x) => {
          // white cliff headland and the red-striped lighthouse
          c.fillStyle = '#e8e0cc';
          c.beginPath(); c.moveTo(x - 110 * u, rt); c.lineTo(x - 80 * u, hz - 20 * u); c.quadraticCurveTo(x, hz - 34 * u, x + 70 * u, hz - 22 * u); c.lineTo(x + 120 * u, rt); c.fill();
          c.fillStyle = '#4f8a3a'; c.beginPath(); c.moveTo(x - 82 * u, hz - 18 * u); c.quadraticCurveTo(x, hz - 34 * u, x + 72 * u, hz - 20 * u); c.lineTo(x + 70 * u, hz - 14 * u); c.quadraticCurveTo(x, hz - 26 * u, x - 80 * u, hz - 12 * u); c.fill();
          const lx = x + 10 * u, ly = hz - 28 * u;
          poly(c, [lx - 9 * u, ly, lx + 9 * u, ly, lx + 6 * u, ly - 70 * u, lx - 6 * u, ly - 70 * u], '#f6f3ea');
          c.fillStyle = '#d23a2e'; for (let k = 0; k < 3; k++) c.fillRect(lx - 8 * u + k * 0.6 * u, ly - (14 + k * 20) * u, (16 - k * 1.2) * u, 9 * u);
          c.fillStyle = '#2d3138'; c.fillRect(lx - 8 * u, ly - 80 * u, 16 * u, 10 * u);
          c.fillStyle = '#fff1a8'; c.fillRect(lx - 5 * u, ly - 78 * u, 10 * u, 6 * u);
          poly(c, [lx - 8 * u, ly - 80 * u, lx + 8 * u, ly - 80 * u, lx, ly - 90 * u], '#d23a2e');
        }, 12);
      }
    });
    add(0.32, hz - 50 * u, rt, (c, place) => {
      // beach and palms along the road
      c.fillStyle = pal.ground; c.fillRect(0, rt - 12 * u, tw, 12 * u);
      c.fillStyle = '#f3dfae'; c.fillRect(0, rt - 12 * u, tw, 2 * u);
      place(7, (x, r) => {
        const hgt = (46 + r * 20) * u;
        c.strokeStyle = '#7a5a3a'; c.lineWidth = 4 * u; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, rt - 6 * u); c.quadraticCurveTo(x + 10 * u, rt - hgt * 0.6, x + 4 * u, rt - hgt); c.stroke();
        c.fillStyle = '#2f8a4a';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          c.beginPath(); c.moveTo(x + 4 * u, rt - hgt);
          c.quadraticCurveTo(x + 4 * u + Math.cos(a) * 16 * u, rt - hgt - 10 * u, x + 4 * u + Math.cos(a) * 26 * u, rt - hgt + Math.abs(Math.sin(a)) * 12 * u + 4 * u);
          c.quadraticCurveTo(x + 4 * u + Math.cos(a) * 12 * u, rt - hgt - 2 * u, x + 4 * u, rt - hgt + 2 * u); c.fill();
        }
      }, 13);
    });
  } else if (theme === 'night') {
    add(0.04, hz - 170 * u, hz + 4, (c, place, emit) => {
      place(16, (x, r, k) => {
        const bw = (26 + r * 30) * u, hh = (60 + hash(k * 5) * 110) * u;
        c.fillStyle = '#1a1438'; c.fillRect(x, hz - hh, bw, hh + 4);
        for (let a = 0; a < 3; a++) for (let b = 1; b * 9 * u < hh - 4 * u; b++) {
          const h2 = hash(k * 31 + a * 7 + b);
          if (h2 > 0.55) { c.fillStyle = h2 > 0.93 ? 'rgba(255,80,170,0.8)' : h2 > 0.85 ? 'rgba(80,230,255,0.7)' : 'rgba(255,226,170,0.45)'; c.fillRect(x + bw * (0.14 + a * 0.28), hz - hh + b * 9 * u, bw * 0.14, 3 * u); }
        }
        if (r > 0.6 && x >= 0 && x < tw) emit.push({ x: x + bw / 2, y: hz - hh - 6 * u, k: 'beacon' });
        if (r > 0.6) { c.fillStyle = '#1a1438'; c.fillRect(x + bw / 2 - 1 * u, hz - hh - 6 * u, 2 * u, 6 * u); }
      }, 21);
    });
    add(0.12, hz - 120 * u, hz + span * 0.6, (c, place, emit) => {
      if (trackId === 'bridge') {
        // landmark: the suspension bridge with strings of lights
        const y = hz + 2 * u;
        c.fillStyle = '#2a1f55'; c.fillRect(0, y - 6 * u, tw, 5 * u);
        place(2, (x) => {
          c.fillStyle = '#2a1f55'; c.fillRect(x - 5 * u, y - 100 * u, 10 * u, 100 * u);
          c.strokeStyle = 'rgba(255,214,140,0.9)'; c.lineWidth = 1.6 * u;
          c.beginPath(); c.moveTo(x - tw / 4, y - 10 * u); c.quadraticCurveTo(x - tw / 8, y - 20 * u, x, y - 100 * u); c.quadraticCurveTo(x + tw / 8, y - 20 * u, x + tw / 4, y - 10 * u); c.stroke();
          if (x >= 0 && x < tw) emit.push({ x, y: y - 104 * u, k: 'beacon' });
        }, 31);
      } else {
        // landmark: the Spire, with a lit crown
        place(1, (x) => {
          poly(c, [x - 18 * u, hz + 4 * u, x + 18 * u, hz + 4 * u, x + 8 * u, hz - 120 * u, x - 8 * u, hz - 120 * u], '#241a4d');
          c.fillStyle = '#38e1ff'; for (let k = 0; k < 6; k++) c.fillRect(x - 6 * u + k * 0.5 * u, hz - 110 * u + k * 16 * u, 12 * u - k * u, 2 * u);
          if (x >= 0 && x < tw) emit.push({ x, y: hz - 124 * u, k: 'beacon' });
        }, 32);
      }
    });
    add(0.32, hz - 70 * u, rt, (c, place, emit) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.3, tw, rt - hz);
      const neon = ['#ff3fa4', '#38e1ff', '#ffd23f', '#9b7bff'];
      place(8, (x, r, k) => {
        const bw = 70 * u, bh = (40 + r * 30) * u, y = rt - 2 * u;
        c.fillStyle = '#120e24'; c.fillRect(x, y - bh, bw, bh);
        c.fillStyle = 'rgba(120,200,255,0.2)'; c.fillRect(x + 6 * u, y - bh * 0.45, bw - 12 * u, bh * 0.38);
        const col = neon[k % 4];
        c.fillStyle = col; c.globalAlpha = 0.3; c.fillRect(x + 6 * u, y - bh + 4 * u, bw - 12 * u, 14 * u); c.globalAlpha = 1;
        c.fillRect(x + 10 * u, y - bh + 9 * u, bw - 20 * u, 4 * u);
        if (x >= 0 && x < tw) emit.push({ x: x + 10 * u, y: y - bh + 9 * u, k: 'neon:' + col });
      }, 22);
    });
  } else if (theme === 'desert') {
    add(0.03, hz - 70 * u, hz + 2, (c) => ridge(c, tw, hz + 2, 50 * u, 160 * u, 6, '#c98b8a'));
    add(0.1, hz - 110 * u, hz + span * 0.4, (c, place) => {
      c.fillStyle = '#c4562f'; c.fillRect(0, hz - 2 * u, tw, span * 0.4 + 2 * u);
      // flat-topped mesas and buttes with lit faces and strata
      place(4, (x, r) => {
        const bw = (80 + r * 90) * u, hh = (50 + r * 50) * u;
        poly(c, [x - bw / 2 - 20 * u, hz + 2 * u, x - bw / 2, hz - hh, x + bw / 2, hz - hh, x + bw / 2 + 24 * u, hz + 2 * u], '#b8482a');
        poly(c, [x + bw * 0.1, hz - hh, x + bw / 2, hz - hh, x + bw / 2 + 24 * u, hz + 2 * u, x + bw * 0.2, hz + 2 * u], '#e07a3f');
        c.fillStyle = 'rgba(90,30,20,0.35)'; for (let k = 1; k < 4; k++) c.fillRect(x - bw / 2 - k * 4 * u, hz - hh + k * hh * 0.24, bw + k * 8 * u, 3 * u);
      }, 14);
      // landmark: the natural rock arch
      place(1, (x) => {
        c.fillStyle = '#d9663a';
        c.beginPath(); c.moveTo(x - 60 * u, hz + 2 * u); c.lineTo(x - 52 * u, hz - 70 * u); c.quadraticCurveTo(x, hz - 100 * u, x + 54 * u, hz - 66 * u); c.lineTo(x + 62 * u, hz + 2 * u);
        c.lineTo(x + 36 * u, hz + 2 * u); c.quadraticCurveTo(x + 32 * u, hz - 50 * u, x, hz - 54 * u); c.quadraticCurveTo(x - 30 * u, hz - 50 * u, x - 34 * u, hz + 2 * u); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,220,170,0.35)'; c.fillRect(x - 52 * u, hz - 72 * u, 50 * u, 3 * u);
      }, 15);
    });
    add(0.3, hz - 40 * u, rt, (c, place) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.35, tw, rt - hz);
      c.fillStyle = 'rgba(255,230,180,0.35)'; for (let k = 0; k < 30; k++) c.fillRect(hash(k * 2.1) * tw, hz + span * (0.4 + hash(k) * 0.5), 20 * u, 1.5 * u);
      // saguaro cacti and a windmill water pump
      place(9, (x, r) => {
        const s = (0.8 + r * 0.6) * u, y = hz + span * (0.6 + r * 0.3);
        c.fillStyle = '#3f7a3a'; c.beginPath(); c.roundRect(x - 3 * s, y - 34 * s, 6 * s, 34 * s, 3 * s); c.fill();
        c.beginPath(); c.roundRect(x - 13 * s, y - 24 * s, 5 * s, 14 * s, 2.5 * s); c.fill(); c.fillRect(x - 13 * s, y - 13 * s, 12 * s, 4 * s);
        c.beginPath(); c.roundRect(x + 8 * s, y - 28 * s, 5 * s, 12 * s, 2.5 * s); c.fill(); c.fillRect(x + 2 * s, y - 19 * s, 10 * s, 4 * s);
      }, 16);
      place(1, (x) => {
        c.strokeStyle = '#5b3a24'; c.lineWidth = 2 * u;
        c.beginPath(); c.moveTo(x - 10 * u, rt - 10 * u); c.lineTo(x, rt - 70 * u); c.lineTo(x + 10 * u, rt - 10 * u); c.stroke();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(x, rt - 70 * u); c.lineTo(x + Math.cos(a) * 16 * u, rt - 70 * u + Math.sin(a) * 16 * u); c.stroke(); }
      }, 17);
      c.fillStyle = '#8a5a34'; for (let x = 0; x < tw; x += 40 * u) c.fillRect(x, rt - 14 * u, 3 * u, 14 * u);
      c.fillRect(0, rt - 11 * u, tw, 1.5 * u);
    });
  } else if (theme === 'riviera') {
    // the sea fills the ground band, with sun glitter and far islands
    add(0.02, hz - 40 * u, rt, (c, place) => {
      const sea = c.createLinearGradient(0, hz, 0, rt);
      sea.addColorStop(0, '#1d4fa0'); sea.addColorStop(1, '#1f7fb8');
      c.fillStyle = sea; c.fillRect(0, hz - 2 * u, tw, rt - hz + 2 * u);
      c.fillStyle = 'rgba(255,226,170,0.5)';
      for (let k = 0; k < 70; k++) c.fillRect(hash(k * 1.7) * tw, hz + hash(k * 4.1) * span * 0.7, (6 + hash(k * 9) * 20) * u, 1.2 * u);
      place(2, (x, r) => { c.fillStyle = '#6a7fb4'; c.beginPath(); c.ellipse(x, hz, (50 + r * 50) * u, (10 + r * 10) * u, 0, Math.PI, 0); c.fill(); }, 41);
    });
    add(0.13, hz - 130 * u, hz + span * 0.55, (c, place) => {
      // the headland: a green hillside of stacked pastel villas with terracotta roofs and dark cypress
      c.fillStyle = '#5d8a4e';
      c.beginPath(); c.moveTo(0, hz + span * 0.55);
      for (let x = 0; x <= tw; x += 20 * u) c.lineTo(x, hz - (34 + 24 * Math.sin((x / tw) * Math.PI * 4) + 10 * Math.sin((x / tw) * Math.PI * 10)) * u);
      c.lineTo(tw, hz + span * 0.55); c.closePath(); c.fill();
      const walls = ['#f6d8b8', '#f3e6c8', '#f2c3b0', '#e9d1e6', '#fbe9a8', '#d9e8f0'];
      place(26, (x, r, k) => {
        const y = hz - (4 + r * 30) * u, bw = (14 + hash(k * 3) * 12) * u, bh = (10 + hash(k * 5) * 8) * u;
        c.fillStyle = walls[k % walls.length]; c.fillRect(x, y - bh, bw, bh);
        c.fillStyle = '#c8603a'; c.fillRect(x - 1.5 * u, y - bh - 3 * u, bw + 3 * u, 3.5 * u);
        c.fillStyle = 'rgba(60,70,90,0.55)'; c.fillRect(x + bw * 0.2, y - bh * 0.62, 2.5 * u, 3.5 * u); c.fillRect(x + bw * 0.62, y - bh * 0.62, 2.5 * u, 3.5 * u);
      }, 42);
      place(14, (x, r) => { const s2 = (0.8 + r * 0.6) * u, y = hz - r * 26 * u; c.fillStyle = '#20402a'; c.beginPath(); c.ellipse(x, y - 14 * s2, 3.2 * s2, 14 * s2, 0, 0, 7); c.fill(); }, 43);
      // landmark per track: the corniche viaduct and tunnel, the harbour lighthouse, or the domed grand casino
      if (trackId === 'corniche') {
        place(1, (x) => {
          c.fillStyle = '#d8c6a2'; c.fillRect(x - 120 * u, hz - 46 * u, 240 * u, 8 * u);
          for (let i = 0; i < 6; i++) { const ax = x - 110 * u + i * 44 * u; c.fillRect(ax, hz - 38 * u, 8 * u, 44 * u); c.beginPath(); c.arc(ax + 26 * u, hz - 38 * u, 18 * u, 0, Math.PI); c.fill(); }
          c.fillStyle = '#b8a27a'; c.beginPath(); c.arc(x + 150 * u, hz - 30 * u, 22 * u, Math.PI, 0); c.fill(); c.fillRect(x + 128 * u, hz - 30 * u, 44 * u, 34 * u);
          c.fillStyle = '#20202a'; c.beginPath(); c.arc(x + 150 * u, hz - 22 * u, 14 * u, Math.PI, 0); c.fill(); c.fillRect(x + 136 * u, hz - 22 * u, 28 * u, 26 * u);
        }, 44);
      } else if (trackId === 'port') {
        place(1, (x) => {
          c.fillStyle = '#e8e2d4'; c.fillRect(x - 90 * u, hz - 4 * u, 180 * u, 8 * u);
          poly(c, [x + 70 * u, hz - 4 * u, x + 84 * u, hz - 4 * u, x + 81 * u, hz - 74 * u, x + 73 * u, hz - 74 * u], '#f6f3ea');
          c.fillStyle = '#2f7a4a'; c.fillRect(x + 70 * u, hz - 84 * u, 14 * u, 10 * u);
          c.fillStyle = '#fff1a8'; c.fillRect(x + 73 * u, hz - 82 * u, 8 * u, 6 * u);
          poly(c, [x + 70 * u, hz - 84 * u, x + 84 * u, hz - 84 * u, x + 77 * u, hz - 92 * u], '#2f7a4a');
          // a superyacht at the quay
          poly(c, [x - 80 * u, hz - 2 * u, x + 30 * u, hz - 2 * u, x + 44 * u, hz - 14 * u, x - 86 * u, hz - 14 * u], '#f4f6fa');
          c.fillStyle = '#f4f6fa'; c.fillRect(x - 60 * u, hz - 24 * u, 70 * u, 10 * u); c.fillRect(x - 44 * u, hz - 32 * u, 40 * u, 8 * u);
          c.fillStyle = '#26334a'; c.fillRect(x - 56 * u, hz - 21 * u, 62 * u, 3 * u); c.fillRect(x - 40 * u, hz - 29 * u, 32 * u, 2.5 * u);
        }, 45);
      } else {
        place(1, (x) => {
          // the Grand Casino: a cream palace with a green copper dome and flags
          c.fillStyle = '#f1e4c8'; c.fillRect(x - 70 * u, hz - 54 * u, 140 * u, 54 * u);
          c.fillStyle = '#e4d2ac'; c.fillRect(x - 76 * u, hz - 58 * u, 152 * u, 6 * u);
          c.fillStyle = 'rgba(70,80,110,0.55)'; for (let i = 0; i < 8; i++) { c.fillRect(x - 62 * u + i * 16 * u, hz - 44 * u, 7 * u, 12 * u); c.fillRect(x - 62 * u + i * 16 * u, hz - 24 * u, 7 * u, 12 * u); }
          c.fillStyle = '#f1e4c8'; c.fillRect(x - 24 * u, hz - 74 * u, 48 * u, 18 * u);
          c.fillStyle = '#4f9a84'; c.beginPath(); c.arc(x, hz - 74 * u, 24 * u, Math.PI, 0); c.fill();
          c.fillStyle = '#e0b84a'; c.fillRect(x - 1.5 * u, hz - 108 * u, 3 * u, 12 * u);
          for (const fx of [-66, 66]) { c.fillStyle = '#6b5a44'; c.fillRect(x + fx * u, hz - 84 * u, 1.5 * u, 28 * u); c.fillStyle = fx < 0 ? '#d6202a' : '#ffffff'; c.fillRect(x + fx * u + 1.5 * u, hz - 84 * u, 12 * u, 7 * u); }
        }, 46);
      }
    });
    add(0.32, hz - 60 * u, rt, (c, place) => {
      // the corniche: a stone balustrade on the sea side, lamp posts, umbrella pines and bougainvillea
      if (trackId === 'port') {
        c.fillStyle = '#1f6fa8'; c.fillRect(0, hz + span * 0.4, tw, rt - hz);
        place(6, (x, r) => {
          const y = rt - 14 * u, L2 = (40 + r * 30) * u;
          poly(c, [x, y, x + L2, y, x + L2 + 8 * u, y - 8 * u, x - 4 * u, y - 8 * u], '#ffffff');
          c.fillStyle = '#c9d6e6'; c.fillRect(x + L2 * 0.2, y - 14 * u, L2 * 0.5, 6 * u);
          c.fillStyle = '#7a5a3a'; c.fillRect(x + L2 * 0.45, y - 50 * u, 1.5 * u, 42 * u);
        }, 47);
        c.fillStyle = '#d8cfbf'; c.fillRect(0, rt - 6 * u, tw, 6 * u);
      } else {
        c.fillStyle = pal.ground; c.fillRect(0, rt - 18 * u, tw, 18 * u);
        place(6, (x, r) => {
          const hgt = (40 + r * 18) * u;
          c.fillStyle = '#6a4a32'; c.fillRect(x - 2 * u, rt - hgt, 4 * u, hgt);
          c.fillStyle = '#2f5a34'; c.beginPath(); c.ellipse(x, rt - hgt, 26 * u, 9 * u, 0, 0, 7); c.fill();
          c.fillStyle = '#3e7040'; c.beginPath(); c.ellipse(x - 6 * u, rt - hgt - 4 * u, 16 * u, 5 * u, 0, 0, 7); c.fill();
        }, 48);
        place(10, (x, r) => { c.fillStyle = r > 0.5 ? '#d23a8e' : '#e2589f'; disc(c, x, rt - 20 * u, (6 + r * 4) * u, c.fillStyle as string); disc(c, x + 8 * u, rt - 16 * u, 5 * u, '#f07ab8'); }, 49);
        // balustrade
        c.fillStyle = '#efe6d2'; c.fillRect(0, rt - 15 * u, tw, 3 * u); c.fillRect(0, rt - 4 * u, tw, 4 * u);
        for (let x = 0; x < tw; x += 7 * u) { c.beginPath(); c.ellipse(x + 3.5 * u, rt - 8 * u, 2 * u, 4 * u, 0, 0, 7); c.fill(); }
        place(5, (x) => { c.fillStyle = '#2c2f38'; c.fillRect(x, rt - 52 * u, 2.5 * u, 50 * u); c.fillRect(x - 6 * u, rt - 52 * u, 14 * u, 2.5 * u); disc(c, x - 6 * u, rt - 48 * u, 3 * u, '#ffe6a8'); disc(c, x + 8 * u, rt - 48 * u, 3 * u, '#ffe6a8'); }, 50);
      }
    });
  } else if (theme === 'neon') {
    add(0.04, hz - 190 * u, hz + 4, (c, place, emit) => {
      // far glass towers with vertical neon strips
      place(14, (x, r, k) => {
        const bw = (30 + r * 34) * u, hh = (90 + hash(k * 7) * 100) * u;
        c.fillStyle = '#0d1630'; c.fillRect(x, hz - hh, bw, hh + 4);
        c.fillStyle = 'rgba(120,200,255,0.10)'; for (let yy = hz - hh + 6 * u; yy < hz; yy += 7 * u) c.fillRect(x + 3 * u, yy, bw - 6 * u, 2 * u);
        const col = ['#ff2fb4', '#2ff3ff', '#b07bff', '#ffe14a'][k % 4];
        c.fillStyle = col; c.fillRect(x + (k % 2 ? 2 : bw - 4 * u), hz - hh, 2 * u, hh);
        if (r > 0.55 && x >= 0 && x < tw) emit.push({ x: x + bw / 2, y: hz - hh - 4 * u, k: 'beacon' });
      }, 51);
    });
    add(0.12, hz - 150 * u, hz + span * 0.6, (c, place, emit) => {
      // landmark: the Halo Tower with its glowing ring, and a monorail on stilts
      place(1, (x) => {
        poly(c, [x - 16 * u, hz + 4 * u, x + 16 * u, hz + 4 * u, x + 6 * u, hz - 140 * u, x - 6 * u, hz - 140 * u], '#151a3a');
        c.strokeStyle = '#2ff3ff'; c.lineWidth = 3 * u; c.beginPath(); c.ellipse(x, hz - 110 * u, 26 * u, 7 * u, 0, 0, 7); c.stroke();
        c.strokeStyle = '#ff2fb4'; c.lineWidth = 2 * u; c.beginPath(); c.ellipse(x, hz - 80 * u, 20 * u, 5 * u, 0, 0, 7); c.stroke();
        if (x >= 0 && x < tw) emit.push({ x, y: hz - 144 * u, k: 'beacon' });
      }, 52);
      c.fillStyle = '#1b1f45'; c.fillRect(0, hz - 30 * u, tw, 4 * u);
      for (let x = 0; x < tw; x += 60 * u) c.fillRect(x, hz - 26 * u, 4 * u, 30 * u);
      // holo billboards
      place(4, (x, r, k) => {
        const col = ['#ff2fb4', '#2ff3ff', '#ffe14a', '#b07bff'][k % 4];
        const y = hz - (60 + r * 40) * u;
        c.fillStyle = '#0a0a18'; c.fillRect(x, y, 54 * u, 26 * u);
        c.strokeStyle = col; c.lineWidth = 2 * u; c.strokeRect(x + 2 * u, y + 2 * u, 50 * u, 22 * u);
        c.fillStyle = col; c.globalAlpha = 0.35; c.fillRect(x + 6 * u, y + 6 * u, 42 * u, 14 * u); c.globalAlpha = 1;
        if (x >= 0 && x < tw) emit.push({ x: x + 6 * u, y: y + 12 * u, k: 'neon:' + col });
      }, 53);
    });
    add(0.32, hz - 70 * u, rt, (c, place, emit) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.3, tw, rt - hz);
      // a magenta grid on the plaza and lit shop fronts
      c.strokeStyle = 'rgba(255,47,180,0.25)'; c.lineWidth = 1 * u;
      for (let x = 0; x < tw; x += 24 * u) { c.beginPath(); c.moveTo(x, hz + span * 0.3); c.lineTo(x - 30 * u, rt); c.stroke(); }
      const neon = ['#ff2fb4', '#2ff3ff', '#ffe14a', '#b07bff'];
      place(7, (x, r, k) => {
        const bw = 64 * u, bh = (34 + r * 26) * u, y = rt - 2 * u;
        c.fillStyle = '#0c0c1e'; c.fillRect(x, y - bh, bw, bh);
        c.fillStyle = 'rgba(47,243,255,0.18)'; c.fillRect(x + 5 * u, y - bh * 0.5, bw - 10 * u, bh * 0.42);
        const col = neon[k % 4];
        c.fillStyle = col; c.fillRect(x + 8 * u, y - bh + 8 * u, bw - 16 * u, 3 * u);
        if (x >= 0 && x < tw) emit.push({ x: x + 8 * u, y: y - bh + 8 * u, k: 'neon:' + col });
      }, 54);
      c.fillStyle = '#2ff3ff'; c.fillRect(0, rt - 3 * u, tw, 1.5 * u);
    });
  } else {
    // summit
    add(0.03, hz - 150 * u, hz + 2, (c) => {
      ridge(c, tw, hz + 2, 140 * u, 140 * u, 8, '#7f9cc8', true);
      // snow caps: the same ridge, clipped to its top part
      c.save(); c.beginPath(); c.rect(0, 0, tw, hz - 70 * u); c.clip();
      ridge(c, tw, hz + 2, 140 * u, 140 * u, 8, '#f4f8ff', true);
      c.restore();
    });
    add(0.1, hz - 90 * u, hz + span * 0.5, (c, place) => {
      ridge(c, tw, hz + span * 0.5, 70 * u, 90 * u, 11, '#4f6f9e', true);
      c.save(); c.beginPath(); c.rect(0, 0, tw, hz - 30 * u); c.clip();
      ridge(c, tw, hz + span * 0.5, 70 * u, 90 * u, 11, '#e9f2ff', true);
      c.restore();
      // landmark: the observatory dome on its ridge
      place(1, (x) => {
        c.fillStyle = '#e6ebf2'; c.fillRect(x - 16 * u, hz - 40 * u, 32 * u, 22 * u);
        c.beginPath(); c.arc(x, hz - 40 * u, 16 * u, Math.PI, 0); c.fill();
        c.fillStyle = '#2b3b55'; c.fillRect(x - 2 * u, hz - 56 * u, 4 * u, 14 * u);
      }, 18);
    });
    add(0.3, hz - 110 * u, rt, (c, place) => {
      c.fillStyle = pal.ground; c.fillRect(0, hz + span * 0.3, tw, rt - hz);
      place(16, (x, r) => {
        const s = (0.8 + r * 0.7) * u, y = hz + span * (0.45 + r * 0.4);
        poly(c, [x - 12 * s, y, x + 12 * s, y, x, y - 40 * s], '#1f4a3f');
        poly(c, [x - 7 * s, y - 18 * s, x + 7 * s, y - 18 * s, x, y - 40 * s], '#2b5f50');
        poly(c, [x - 5 * s, y - 28 * s, x + 5 * s, y - 28 * s, x, y - 40 * s], '#f4f8ff');
      }, 19);
      // landmark: the Summit Gala finish gantry with banners and a grandstand
      place(1, (x) => {
        const y = rt - 4 * u;
        c.fillStyle = '#2a3346'; c.fillRect(x - 70 * u, y - 30 * u, 140 * u, 30 * u);
        const crowd = ['#e2337a', '#ffd23f', '#38e1ff', '#ffffff', '#ff7a2f'];
        for (let i = 0; i < 46; i++) disc(c, x - 66 * u + (i % 23) * 6 * u, y - 24 * u + Math.floor(i / 23) * 9 * u, 2.2 * u, crowd[i % 5]);
        c.fillStyle = '#d6202a'; c.fillRect(x - 70 * u, y - 36 * u, 140 * u, 6 * u);
        c.fillRect(x - 42 * u, y - 49 * u, 84 * u, 14 * u); // the name board above the banner, sized for its text
        signText(c, 'SUMMIT GALA', x - 42 * u, y - 49 * u, 84 * u, 14 * u, 2.5 * u, '#ffffff', 10 * u);
      }, 20);
    });
  }

  // foreground band below the road (moves faster than the road for depth)
  let fore: Layer | null = null;
  const fh = H - rb + 8 * u;
  if (fh > 2) {
    fore = layer(Math.ceil(W * 1.2), rb, rb + fh, 1.25, (c, place) => {
      c.fillStyle = pal.fore; c.fillRect(0, rb, W * 1.2 + 2, fh);
      const fw = Math.ceil(W * 1.2);
      if (theme === 'scrap') {
        place(6, (x) => { c.fillStyle = pal.post; c.fillRect(x, rb + 8 * u, 6 * u, 40 * u); c.fillStyle = '#f2c230'; for (let k = 0; k < 4; k++) c.fillRect(x, rb + (10 + k * 10) * u, 6 * u, 5 * u); });
      } else if (theme === 'suburb') {
        c.fillStyle = '#2f5a2a'; c.fillRect(0, rb + 6 * u, fw, 10 * u);
        place(5, (x) => { c.fillStyle = '#e9e5d9'; c.fillRect(x, rb + 6 * u, 4 * u, 36 * u); c.fillStyle = '#2b6fd0'; c.fillRect(x - 10 * u, rb + 6 * u, 24 * u, 12 * u); });
      } else if (theme === 'foundry') {
        place(6, (x) => { c.fillStyle = pal.post; c.fillRect(x, rb + 8 * u, 8 * u, 46 * u); c.fillStyle = '#ff9a3c'; c.fillRect(x, rb + 8 * u, 8 * u, 3 * u); });
      } else if (theme === 'coast') {
        c.fillStyle = '#e9e4d8'; c.fillRect(0, rb + 8 * u, fw, 5 * u);
        place(7, (x) => { c.fillStyle = '#e9e4d8'; c.fillRect(x, rb + 8 * u, 5 * u, 22 * u); });
      } else if (theme === 'night') {
        place(5, (x) => { c.fillStyle = pal.post; c.fillRect(x, rb + 8 * u, 5 * u, 50 * u); c.fillStyle = 'rgba(255,214,140,0.14)'; c.beginPath(); c.ellipse(x + 3 * u, rb + 4 * u, 40 * u, 8 * u, 0, 0, 7); c.fill(); });
      } else if (theme === 'riviera') {
        c.fillStyle = '#d9cdb2'; c.fillRect(0, rb + 6 * u, fw, 8 * u);
        place(6, (x) => { c.fillStyle = '#b5552f'; c.fillRect(x - 7 * u, rb + 14 * u, 14 * u, 12 * u); disc(c, x, rb + 12 * u, 9 * u, '#3e7a3e'); disc(c, x - 3 * u, rb + 9 * u, 3 * u, '#e2589f'); });
      } else if (theme === 'neon') {
        c.fillStyle = '#ff2fb4'; c.fillRect(0, rb + 8 * u, fw, 2 * u);
        place(6, (x) => { c.fillStyle = pal.post; c.fillRect(x, rb + 8 * u, 5 * u, 44 * u); c.fillStyle = '#2ff3ff'; c.fillRect(x, rb + 8 * u, 5 * u, 4 * u); });
      } else if (theme === 'desert') {
        place(8, (x, r) => { c.fillStyle = '#9a4a26'; c.beginPath(); c.ellipse(x, rb + 22 * u, (14 + r * 16) * u, (6 + r * 6) * u, 0, 0, 7); c.fill(); });
        place(5, (x) => { c.fillStyle = pal.post; c.fillRect(x, rb + 6 * u, 4 * u, 30 * u); c.fillStyle = '#e63b2e'; c.fillRect(x, rb + 6 * u, 4 * u, 6 * u); });
      } else {
        c.fillStyle = '#e8f1f8'; c.beginPath(); c.moveTo(0, rb + 4 * u);
        for (let x = 0; x <= fw; x += 30 * u) c.quadraticCurveTo(x + 15 * u, rb + (hash(x) * 8 + 4) * u, x + 30 * u, rb + 4 * u);
        c.lineTo(fw, rb + 26 * u); c.lineTo(0, rb + 26 * u); c.fill();
        place(5, (x) => { c.fillStyle = '#c8d4e2'; c.fillRect(x, rb + 4 * u, 4 * u, 50 * u); });
      }
    });
  }
  return { layers: L, fore };
}

function ensure(v: SceneView): Built {
  const key = [v.theme, v.trackId, v.W, v.H, Math.round(v.horizon), Math.round(v.roadTop), Math.round(v.roadBot), v.dpr].join('|');
  if (built?.key === key) return built;
  const pal = palOf(v.theme);
  const sky = buildSky(v, pal);
  const { layers, fore } = buildLayers(v, pal);
  built = { key, sky, layers, fore };
  return built;
}

// ---------------------------------------------------------------- live motion (flat fills only)

function drift(x: number, span: number) { return ((x % span) + span) % span; }

function motion(v: SceneView, b: Built, scroll: number) {
  const { ctx, W, horizon: hz, roadTop: rt, dpr: u, t, theme } = v;
  const pal = palOf(theme);
  // clouds drifting against the camera
  ctx.fillStyle = pal.cloud;
  const n = theme === 'night' || theme === 'foundry' ? 3 : 4;
  for (let k = 0; k < n; k++) {
    const span = W * 1.6;
    const x = drift(k * span / n - scroll * 0.02 - t * 8 * u, span) - W * 0.3;
    const y = hz * (0.18 + 0.14 * (k % 3));
    const s = (0.8 + hash(k) * 0.6) * u;
    ctx.beginPath(); ctx.ellipse(x, y, 46 * s, 9 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 16 * s, y - 8 * s, 24 * s, 11 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 14 * s, y - 5 * s, 18 * s, 8 * s, 0, 0, 7); ctx.fill();
  }
  // birds (or vultures) on the day themes
  if (theme === 'suburb' || theme === 'coast' || theme === 'scrap' || theme === 'desert' || theme === 'summit' || theme === 'riviera') {
    ctx.strokeStyle = theme === 'desert' ? 'rgba(40,20,20,0.7)' : 'rgba(20,24,40,0.55)'; ctx.lineWidth = 1.5 * u;
    for (let k = 0; k < 3; k++) {
      const x = drift(W * 0.2 + k * 50 * u + t * 22 * u - scroll * 0.05, W * 1.4) - W * 0.2;
      const y = hz * (0.35 + 0.05 * k) + Math.sin(t * 1.3 + k) * 6 * u;
      const f = Math.sin(t * 8 + k * 2) * 3 * u;
      ctx.beginPath(); ctx.moveTo(x - 6 * u, y - f); ctx.lineTo(x, y); ctx.lineTo(x + 6 * u, y - f); ctx.stroke();
    }
  }
  if (theme === 'coast' || theme === 'riviera') {
    // sailboats crossing the bay
    for (let k = 0; k < 2; k++) {
      const x = drift(k * W * 0.7 + t * (6 + k * 4) * u - scroll * 0.02, W * 1.4) - W * 0.2;
      const y = hz + (rt - hz) * (0.3 + k * 0.25);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - 2 * u); ctx.lineTo(x, y - 22 * u); ctx.lineTo(x + 12 * u, y - 2 * u); ctx.fill();
      ctx.fillStyle = k ? '#e0532f' : '#2b4d7a'; ctx.fillRect(x - 8 * u, y - 2 * u, 22 * u, 4 * u);
    }
  }
  if (theme === 'suburb') {
    // a hot-air balloon drifting high above the houses
    const x = drift(W * 0.6 + t * 5 * u - scroll * 0.01, W * 1.5) - W * 0.2, y = hz * 0.42 + Math.sin(t * 0.6) * 5 * u;
    ctx.fillStyle = '#e2572a'; ctx.beginPath(); ctx.arc(x, y, 13 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 4 * u, y - 12 * u, 8 * u, 24 * u);
    ctx.fillStyle = '#6b3d2a'; ctx.fillRect(x - 3 * u, y + 16 * u, 6 * u, 5 * u);
  }
  if (theme === 'summit') {
    // a cable car riding its line across the valley; flags flutter on the gantry
    const y0 = hz - 80 * u, y1 = hz + 10 * u;
    ctx.strokeStyle = 'rgba(30,40,60,0.6)'; ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y1); ctx.stroke();
    const k = drift(t * 0.04, 1);
    const x = k * W, y = y0 + (y1 - y0) * k;
    ctx.fillStyle = '#d6202a'; ctx.fillRect(x - 7 * u, y + 6 * u, 14 * u, 10 * u);
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(x - 5 * u, y + 8 * u, 10 * u, 4 * u);
    ctx.fillStyle = '#2a3346'; ctx.fillRect(x - 0.5 * u, y, 1 * u, 6 * u);
  }
  if (theme === 'desert') {
    // a dust devil wandering across the flats
    const x = drift(W * 0.3 + t * 10 * u - scroll * 0.3, W * 1.6) - W * 0.3, y = hz + (rt - hz) * 0.7;
    ctx.fillStyle = 'rgba(240,200,150,0.22)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 3 + i) * 4 * u, y - i * 9 * u, (5 + i * 4) * u, 3 * u, 0, 0, 7); ctx.fill(); }
  }
  // emitters baked into the tiles: smoke, beacons, flickering neon
  for (const L of b.layers) {
    if (!L.emit.length) continue;
    const off = ((scroll * L.par) % L.w + L.w) % L.w;
    for (const e of L.emit) for (const base of [-off, L.w - off]) {
      const x = e.x + base;
      if (x < -60 * u || x > W + 60 * u) continue;
      if (e.k === 'smoke') {
        ctx.fillStyle = 'rgba(150,140,170,0.28)';
        for (let i = 0; i < 4; i++) {
          const ph = drift(t * 0.35 + i * 0.25 + e.x * 0.001, 1);
          ctx.beginPath(); ctx.arc(x + ph * 26 * u, e.y - ph * 40 * u, (4 + ph * 12) * u, 0, 7); ctx.fill();
        }
      } else if (e.k === 'beacon') {
        if (Math.sin(t * 3 + e.x) > 0.2) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - 1.5 * u, e.y - 1.5 * u, 3 * u, 3 * u); }
      } else if (e.k.startsWith('neon:')) {
        if (Math.sin(t * 9 + e.x * 0.3) > -0.85) { ctx.fillStyle = e.k.slice(5); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + e.x); ctx.fillRect(x, e.y, 50 * u, 4 * u); ctx.globalAlpha = 1; }
      }
    }
  }
  if (theme === 'foundry') {
    // the furnace glow breathes along the horizon (a flat band, no per-frame gradient)
    ctx.fillStyle = `rgba(255,120,40,${0.07 + 0.05 * Math.sin(t * 1.7)})`;
    ctx.fillRect(0, hz - 40 * u, W, 40 * u);
  }
}

// ---------------------------------------------------------------- public draw calls

/** Sky, sun or moon, clouds, area glow, far landmarks and the ground strip up to the road. */
export function drawBackdrop(v: SceneView) {
  const b = ensure(v);
  const { ctx, camX, ppm } = v;
  const scroll = camX * ppm;
  ctx.drawImage(b.sky, 0, 0);
  // the ground band under every layer (the canvas is not cleared between frames)
  ctx.fillStyle = palOf(v.theme).ground;
  ctx.fillRect(0, v.horizon, v.W, v.roadTop - v.horizon + 1);
  // far layers first; live motion sits between the sky layers and the near ground
  const nearIdx = b.layers.length - 1;
  for (let i = 0; i < b.layers.length; i++) {
    if (i === nearIdx && !v.reduced) motion(v, b, scroll);
    blitLayer(ctx, b.layers[i], scroll);
  }
}

/** Drawn on top of the road surface, under the cars (e.g. wet-street reflections). */
export function drawRoadDressing(v: SceneView) {
  const { ctx, W, roadTop, roadBot, camX, ppm, theme, dpr: u, reduced } = v;
  const scroll = camX * ppm;
  if ((theme === 'night' || theme === 'neon') && !reduced) {
    // wet street: long smeared reflections of the neon signs, moving with the near layer
    for (let k = 0; k < 6; k++) {
      const x = drift(k * 233 * u - scroll * 0.32, W + 200 * u) - 100 * u;
      ctx.fillStyle = theme === 'neon' ? ['rgba(255,47,180,0.16)', 'rgba(47,243,255,0.14)', 'rgba(176,123,255,0.12)'][k % 3] : ['rgba(255,63,164,0.12)', 'rgba(56,225,255,0.1)', 'rgba(255,210,63,0.09)'][k % 3];
      ctx.fillRect(x, roadTop + 4 * u, 14 * u, roadBot - roadTop - 8 * u);
    }
  } else if (theme === 'desert' || theme === 'summit' || theme === 'coast') {
    // drifted sand or snow along the road edges
    ctx.fillStyle = theme === 'summit' ? 'rgba(240,246,252,0.55)' : theme === 'coast' ? 'rgba(240,220,170,0.35)' : 'rgba(230,160,100,0.4)';
    for (let k = 0; k < 8; k++) {
      const x = drift(k * 157 * u - scroll, W + 160 * u) - 80 * u;
      ctx.beginPath(); ctx.ellipse(x, roadTop + 2 * u, 40 * u, 4 * u, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 60 * u, roadBot - 2 * u, 30 * u, 3 * u, 0, 0, 7); ctx.fill();
    }
  } else if (theme === 'scrap') {
    ctx.fillStyle = 'rgba(10,8,8,0.25)';
    for (let k = 0; k < 5; k++) {
      const x = drift(k * 211 * u - scroll, W + 200 * u) - 100 * u;
      ctx.beginPath(); ctx.ellipse(x, roadTop + (roadBot - roadTop) * (0.2 + hash(k) * 0.6), 18 * u, 5 * u, 0, 0, 7); ctx.fill();
    }
  }
}

/** The band below the road: verge, posts, lamps. */
export function drawForeground(v: SceneView) {
  const b = ensure(v);
  if (b.fore) blitLayer(v.ctx, b.fore, v.camX * v.ppm);
}
