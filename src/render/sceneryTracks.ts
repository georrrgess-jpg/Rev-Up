// Per-track scenery recipes (visuals only: nothing here touches the race). Each track gets its own palette refinement,
// landmarks and props across four parallax layers — far (skyline / ridges), mid (landmarks), near (the ground band
// above the road) and verge (right behind the kerb) — plus a calm foreground band under the road, where the race
// controls sit. Moving parts are bounded emitters baked into the tiles (drawn live with flat fills) and a few movers.
//
// Layer rates (fraction of the camera's travel): far 0.03, mid 0.1, near 0.22, verge 0.42, foreground 1.1.
// Detail goes where the race camera shows it: the band between the HUD and the road (about 110 CSS px above the
// horizon to the kerb). The top of the sky stays plain behind the standings and toasts.
import type { Look, Pal } from './scene';
import {
  bannerArch, barn, box3, bunting, bush, carStack, church, container, coolingTower, crusher, cypress, dark, disc, drum, ell,
  excavator, foot, forklift, peak, hash, hoodoo, house, lattice, lighthouse, line, magnetCrane, mesa, mix, palm, pallets, pine, poly, pylon,
  rect, roundTree, sailboat, silo, stack, stonePine, tent, tower, tyre, tyrePile, tyreWall, villa, waterTower, windows, yacht,
  type C2, type Kit,
} from './sceneryKit';

// ---------------------------------------------------------------- recipe API

/** A live element baked into a tile at (x, y): drawn each frame by drawEmitter. */
export interface Emit { x: number; y: number; k: string; a?: number; b?: number; col?: string; reach?: number }

export interface Paint {
  c: C2; k: Kit; w: number;
  place: (n: number, fn: (x: number, r: number, k: number) => void, seed?: number) => void;
  /** One landmark at a fixed fraction of the tile width (wrapping across the tile edge). */
  at: (frac: number, fn: (x: number) => void) => void;
  emit: (e: Emit) => void;
  text: (t: string, x: number, y: number, w: number, h: number, col: string, maxPx: number, weight?: number) => void;
}

export interface RecipeBuilder {
  W: number; H: number; u: number; hz: number; rt: number; rb: number; span: number; trackId: string; look: Look; pal: Pal;
  /** density: scales `place` counts (the recipes were composed at a reference tile width; this keeps their spacing). */
  layer: (par: number, top: number, bottom: number, paint: (P: Paint) => void, widthMul?: number, density?: number) => void;
  fore: (paint: (P: Paint) => void) => void;
  /** A mover drawn after the most recently added layer (before any layer: behind everything but the sky). */
  live: (draw: (L: LiveCtx) => void) => void;
}

export interface LiveCtx {
  ctx: C2; W: number; u: number; hz: number; rt: number; rb: number; span: number;
  t: number; scroll: number; light: boolean; still: boolean; pal: Pal;
}

export interface Recipe { pal?: Partial<Pal>; clouds?: number; build: (B: RecipeBuilder) => void }

const FAR = 0.03, MID = 0.1, NEAR = 0.22, VERGE = 0.42;
/** Tile widths (× screen width): wider tiles repeat less often on long races but cost more to paint at the start. */
const MID_W = 2.0, NEAR_W = 2.0, VERGE_W = 1.8;

// ---------------------------------------------------------------- shared helpers

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const drift = (x: number, span: number) => ((x % span) + span) % span;

/** Aerial perspective: tint everything already painted in this tile toward the haze colour, stronger lower down. */
function haze(P: Paint, top: number, bottom: number, col: string, aTop: number, aBot: number) {
  const { c, w } = P;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, rgba(col, aTop)); g.addColorStop(1, rgba(col, aBot));
  c.fillStyle = g; c.fillRect(0, top, w, bottom - top);
  c.restore();
}

/** A periodic ridge silhouette from `base` up to a noisy skyline (tiles seamlessly). */
function ridge(c: C2, w: number, base: number, amp: number, step: number, seed: number, fill: string, sharp = false) {
  c.fillStyle = fill; c.beginPath(); c.moveTo(0, base);
  const n = Math.max(2, Math.round(w / step));
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
/** Paint `fn` scaled by s about the point (x, y) (props drawn at their base size, then enlarged for a nearer band). */
function scaled(c: C2, x: number, y: number, s: number, fn: () => void) {
  c.save(); c.translate(x, y); c.scale(s, s); c.translate(-x, -y); fn(); c.restore();
}

/** A band of water with glints. */
function water(P: Paint, top: number, bottom: number, colA: string, colB: string, glint: string, n: number, seed: number) {
  const { c, w, k } = P;
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, colA); g.addColorStop(1, colB);
  c.fillStyle = g; c.fillRect(0, top, w, bottom - top);
  c.fillStyle = glint;
  for (let i = 0; i < n; i++) {
    const y = top + hash(i * 3.3 + seed) * (bottom - top);
    const len = (6 + hash(i * 7 + seed) * 22) * k.u * (0.5 + (y - top) / Math.max(1, bottom - top));
    c.fillRect(hash(i + seed * 1.7) * w, y, len, 1.2 * k.u);
  }
}

/** A city skyline of lit towers in one colour. */
function skyline(P: Paint, base: number, n: number, minH: number, maxH: number, body: string, lit: string[], odds: number, seed: number, beacons = false) {
  const { k, place, emit } = P;
  place(n, (x, r, i) => {
    const bw = (22 + r * 30) * k.u, hh = minH + hash(i * 5 + seed) * (maxH - minH);
    const top = tower(k, x, base, bw, hh, body, i * 13 + seed, lit, odds);
    if (beacons && r > 0.6) { rect(k.c, top.x - 1 * k.u, top.y - 6 * k.u, 2 * k.u, 6 * k.u, body); emit({ x: top.x, y: top.y - 6 * k.u, k: 'beacon' }); }
  }, seed);
}

// ---------------------------------------------------------------- live movers

function gulls(L: LiveCtx, n: number, y0: number, col = 'rgba(20,24,40,0.55)') {
  const { ctx, W, u, t, scroll } = L;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  for (let k = 0; k < (L.light ? Math.min(n, 2) : n); k++) {
    const x = drift(W * 0.2 + k * 53 * u + t * (18 + k * 3) * u - scroll * 0.05, W * 1.4) - W * 0.2;
    const y = y0 + k * 7 * u + Math.sin(t * 1.3 + k) * 6 * u;
    const f = Math.sin(t * 7 + k * 2) * 3 * u;
    ctx.moveTo(x - 6 * u, y - f); ctx.lineTo(x, y); ctx.lineTo(x + 6 * u, y - f);
  }
  ctx.stroke(); // one stroke for the flock
}

/** A boat crossing the water band at its own speed, moving with the layer `par`. */
function boatMover(L: LiveCtx, seed: number, y: number, speed: number, par: number, draw: (c: C2, x: number, y: number) => void) {
  const { W, u, t, scroll } = L;
  const span = W * 1.8;
  const x = drift(hash(seed) * span + t * speed * u - scroll * par, span) - W * 0.4;
  draw(L.ctx, x, y);
}

function snowfall(L: LiveCtx, n: number, top: number, bottom: number) {
  const { ctx, W, u, t, scroll } = L;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const count = L.light ? Math.round(n * 0.4) : n;
  for (let i = 0; i < count; i++) {
    const x = drift(hash(i) * W * 1.2 - scroll * 0.3 + Math.sin(t * 1.1 + i) * 8 * u - t * 14 * u, W * 1.2) - W * 0.1;
    const y = top + drift(hash(i * 3.7) * (bottom - top) + t * (24 + hash(i * 5) * 20) * u, bottom - top);
    const s = (1.2 + hash(i * 9) * 1.6) * u;
    ctx.fillRect(x, y, s, s);
  }
}

function leaves(L: LiveCtx, n: number, top: number, bottom: number, cols: string[]) {
  const { ctx, W, u, t, scroll } = L;
  const count = L.light ? Math.round(n / 2) : n;
  for (let i = 0; i < count; i++) {
    const x = drift(hash(i * 2.1) * W * 1.4 - scroll * 0.35 - t * 20 * u + Math.sin(t * 2 + i) * 10 * u, W * 1.4) - W * 0.2;
    const y = top + drift(hash(i * 5.3) * (bottom - top) + t * 18 * u, bottom - top);
    ctx.fillStyle = cols[i % cols.length];
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillRect(-2.5 * u, -1.5 * u, 5 * u, 3 * u); ctx.restore();
  }
}

/** A train of wagons running along a track line, moving with layer `par` plus its own speed. */
function train(L: LiveCtx, y: number, par: number, speed: number, cars: number, loco: string, wagons: string[], s: number) {
  const { ctx, W, u, t, scroll } = L;
  const len = cars * 30 * s * u + 36 * s * u;
  const span = W * 2.2 + len;
  const x0 = drift(t * speed * u - scroll * par, span) - len - W * 0.3;
  if (x0 > W || x0 + len < 0) return;
  for (let i = 0; i < cars; i++) {
    const x = x0 + i * 30 * s * u;
    ctx.fillStyle = wagons[i % wagons.length]; ctx.fillRect(x, y - 12 * s * u, 28 * s * u, 10 * s * u);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y - 4 * s * u, 28 * s * u, 2 * s * u);
  }
  const lx = x0 + cars * 30 * s * u;
  ctx.fillStyle = loco; ctx.fillRect(lx, y - 15 * s * u, 34 * s * u, 13 * s * u);
  ctx.fillStyle = '#ffe6a8'; ctx.fillRect(lx + 30 * s * u, y - 11 * s * u, 3 * s * u, 3 * s * u);
  ctx.fillStyle = '#2a2a2e'; ctx.fillRect(x0, y - 2 * s * u, len, 2 * s * u);
}

// ---------------------------------------------------------------- emitters

/** Emitter kinds that are pure motion: dropped under reduced motion (the rest are machinery drawn at rest). */
export const PARTICLE_KINDS = new Set(['smoke', 'steam', 'sparks', 'beacon', 'blink', 'neon', 'flare', 'pour', 'beam', 'search', 'chase', 'surf', 'heat']);

export function drawEmitter(L: LiveCtx, e: Emit, x: number) {
  const { ctx: c, u, t } = L;
  const y = e.y;
  switch (e.k) {
    case 'smoke': case 'steam': {
      const steam = e.k === 'steam';
      c.fillStyle = e.col ?? (steam ? 'rgba(235,235,245,0.32)' : 'rgba(150,140,170,0.28)');
      const n = L.light ? 2 : 4, s = e.a ?? 1;
      for (let i = 0; i < n; i++) {
        const ph = drift(t * (steam ? 0.22 : 0.35) + i / n + e.x * 0.001, 1);
        c.beginPath(); c.arc(x + ph * 26 * u * s, y - ph * 40 * u * s, (4 + ph * (steam ? 18 : 12)) * u * s, 0, 7); c.fill();
      }
      break;
    }
    case 'beacon': case 'blink':
      if (Math.sin(t * (e.a ?? 3) + e.x) > 0.2) { c.fillStyle = e.col ?? '#ff3b3b'; c.fillRect(x - 1.5 * u, y - 1.5 * u, 3 * u, 3 * u); }
      break;
    case 'neon':
      if (Math.sin(t * 9 + e.x * 0.3) > -0.85) { c.fillStyle = e.col ?? '#ff2fb4'; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + e.x); c.fillRect(x, y, (e.a ?? 50) * u, (e.b ?? 4) * u); c.globalAlpha = 1; }
      break;
    case 'flare': {
      const f = 0.7 + 0.3 * Math.sin(t * 13 + e.x) * Math.sin(t * 7.3);
      c.fillStyle = 'rgba(255,140,40,0.85)'; c.beginPath(); c.moveTo(x - 3 * u, y); c.quadraticCurveTo(x, y - 18 * u * f, x + 3 * u, y); c.fill();
      c.fillStyle = 'rgba(255,230,140,0.95)'; c.beginPath(); c.moveTo(x - 1.5 * u, y); c.quadraticCurveTo(x, y - 9 * u * f, x + 1.5 * u, y); c.fill();
      break;
    }
    case 'pour': {
      const f = 0.75 + 0.25 * Math.sin(t * 11 + e.x);
      c.fillStyle = `rgba(255,${Math.round(150 + 60 * f)},60,0.95)`; c.fillRect(x - 1.5 * u, y, 3 * u, (e.a ?? 20) * u);
      c.fillStyle = `rgba(255,170,60,${0.25 * f})`; c.beginPath(); c.ellipse(x, y + (e.a ?? 20) * u, 12 * u, 4 * u, 0, 0, 7); c.fill();
      break;
    }
    case 'sparks': {
      const n = L.light ? 3 : 7;
      for (let i = 0; i < n; i++) {
        const ph = drift(t * 1.4 + i / n + e.x * 0.01, 1);
        const vx = (hash(i * 3 + e.x) - 0.4) * 30 * u, vy = (14 + hash(i * 7) * 14) * u;
        c.fillStyle = ph < 0.5 ? '#fff2a8' : '#ff9a3c'; c.globalAlpha = 1 - ph;
        c.fillRect(x + vx * ph, y - vy * ph + 40 * u * ph * ph, 2 * u, 2 * u);
      }
      c.globalAlpha = 1;
      break;
    }
    case 'magnet': {
      // a car hanging from the crane's magnet, swinging gently
      const len = (e.a ?? 40) * u, th = 0.14 * Math.sin(t * 0.9 + e.x * 0.01);
      const ex = x + Math.sin(th) * len, ey = y + Math.cos(th) * len;
      c.strokeStyle = '#1e1b1e'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
      c.save(); c.translate(ex, ey); c.rotate(th);
      c.fillStyle = '#2b2b30'; c.fillRect(-9 * u, 0, 18 * u, 5 * u); c.fillStyle = '#4b4b52'; c.fillRect(-9 * u, 0, 18 * u, 1.4 * u);
      // the car: a little hatchback hanging by its roof
      const col = e.col ?? '#3f8d8c';
      c.fillStyle = col; c.beginPath(); c.moveTo(-15 * u, 13 * u); c.lineTo(-11 * u, 6 * u); c.lineTo(7 * u, 6 * u); c.lineTo(13 * u, 11 * u); c.lineTo(15 * u, 16 * u); c.lineTo(-15 * u, 16 * u); c.closePath(); c.fill();
      c.fillStyle = 'rgba(30,40,55,0.8)'; c.fillRect(-9 * u, 7.5 * u, 14 * u, 3.5 * u);
      c.fillStyle = '#1b1716'; c.beginPath(); c.arc(-9 * u, 16 * u, 3 * u, 0, 7); c.arc(9 * u, 16 * u, 3 * u, 0, 7); c.fill();
      c.restore();
      break;
    }
    case 'press': {
      // the crusher ram: e.y = underside of the crown, e.b = drop to the bed, e.a = ram width
      const w = (e.a ?? 40) * u, bed = y + (e.b ?? 40) * u;
      const cyc = drift(t / 2.6 + e.x * 0.001, 1);
      const p = cyc < 0.15 ? cyc / 0.15 : cyc < 0.35 ? 1 : cyc < 0.85 ? 1 - (cyc - 0.35) / 0.5 : 0; // slam, hold, rise, rest
      const carH = 14 * u, squash = 5 * u;
      const ramBot = y + 8 * u + (bed - squash - y - 8 * u) * p;
      const carTop = Math.max(ramBot, bed - carH);
      c.fillStyle = '#bdbdc2'; c.fillRect(x - 3 * u, y, 6 * u, ramBot - 6 * u - y);
      c.fillStyle = e.col ?? '#c2563a'; c.fillRect(x - w * 0.36, carTop, w * 0.72, bed - carTop);
      c.fillStyle = 'rgba(30,40,55,0.7)'; c.fillRect(x - w * 0.26, carTop + (bed - carTop) * 0.2, w * 0.4, (bed - carTop) * 0.25);
      c.fillStyle = '#2a2a2e'; c.fillRect(x - w / 2, ramBot - 6 * u, w, 6 * u);
      c.fillStyle = '#ffc61a'; c.fillRect(x - w / 2, ramBot - 1.6 * u, w, 1.6 * u);
      if (p === 1 && cyc < 0.22 && !L.light) {
        c.fillStyle = '#fff2a8';
        for (let i = 0; i < 5; i++) c.fillRect(x + (hash(i + Math.floor(t * 20)) - 0.5) * w * 1.2, bed - (2 + hash(i * 3 + Math.floor(t * 20)) * 8) * u, 2 * u, 2 * u);
      }
      break;
    }
    case 'trolley': {
      // a gantry crane's trolley running along the boom, lowering a container
      const span = (e.a ?? 60) * u;
      const px = x + span * (0.5 + 0.5 * Math.sin(t * 0.32 + e.x * 0.01));
      const drop = (e.b ?? 40) * u * (0.45 + 0.4 * Math.sin(t * 0.64 + e.x * 0.02));
      c.fillStyle = '#2a2a2e'; c.fillRect(px - 5 * u, y - 3 * u, 10 * u, 5 * u);
      c.strokeStyle = '#2a2a2e'; c.lineWidth = 1 * u; c.beginPath(); c.moveTo(px - 3 * u, y); c.lineTo(px - 3 * u, y + drop); c.moveTo(px + 3 * u, y); c.lineTo(px + 3 * u, y + drop); c.stroke();
      c.fillStyle = e.col ?? '#2f6fb5'; c.fillRect(px - 14 * u, y + drop, 28 * u, 7 * u);
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(px - 14 * u, y + drop + 5 * u, 28 * u, 2 * u);
      break;
    }
    case 'wheel': {
      // a turning observation wheel: spokes and cabins (the rim and legs are in the tile)
      const R = (e.a ?? 50) * u, a0 = t * 0.12;
      c.strokeStyle = 'rgba(243,239,230,0.9)'; c.lineWidth = 1 * u; c.beginPath();
      for (let i = 0; i < 12; i++) { const a = a0 + (i / 12) * Math.PI * 2; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); }
      c.stroke();
      const cab = ['#e2589f', '#ffd23f', '#38a8e1', '#ff7a2f'];
      for (let i = 0; i < 12; i++) { const a = a0 + (i / 12) * Math.PI * 2; c.fillStyle = cab[i % 4]; c.fillRect(x + Math.cos(a) * R - 4 * u, y + Math.sin(a) * R, 8 * u, 7 * u); }
      disc(c, x, y, 4 * u, '#f3efe6');
      break;
    }
    case 'beam': {
      // a lighthouse beam sweeping round: a translucent wedge, longest when side-on
      const a = t * 1.1 + e.x * 0.01, side = Math.cos(a), len = Math.abs(side) * (e.a ?? 90) * u;
      if (len < 6 * u) break;
      c.fillStyle = 'rgba(255,244,190,0.28)';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sign(side) * len, y - 7 * u); c.lineTo(x + Math.sign(side) * len, y + 7 * u); c.closePath(); c.fill();
      disc(c, x, y, 4 * u, 'rgba(255,250,210,0.9)');
      break;
    }
    case 'search': {
      const a = -Math.PI / 2 + 0.45 * Math.sin(t * 0.5 + e.x * 0.02), len = (e.a ?? 160) * u;
      c.fillStyle = e.col ?? 'rgba(200,220,255,0.1)';
      c.beginPath(); c.moveTo(x - 2 * u, y); c.lineTo(x + Math.cos(a - 0.06) * len, y + Math.sin(a - 0.06) * len); c.lineTo(x + Math.cos(a + 0.06) * len, y + Math.sin(a + 0.06) * len); c.lineTo(x + 2 * u, y); c.closePath(); c.fill();
      break;
    }
    case 'chase': {
      // marquee bulbs chasing along a strip
      const w = (e.a ?? 60) * u, step = 5 * u, ph = Math.floor(t * 8);
      for (let i = 0, bx = x; bx < x + w; i++, bx += step) { c.fillStyle = (i + ph) % 3 === 0 ? '#fff6c8' : 'rgba(255,190,90,0.35)'; c.fillRect(bx, y, 2.2 * u, 2.2 * u); }
      break;
    }
    case 'surf': {
      const p = 0.5 + 0.5 * Math.sin(t * 1.4 + e.x * 0.05);
      c.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * p})`;
      c.beginPath(); c.ellipse(x, y, (e.a ?? 30) * u * (0.7 + 0.3 * p), 2.5 * u, 0, 0, 7); c.fill();
      break;
    }
    case 'flag': {
      const fw = (e.a ?? 14) * u, fh = fw * 0.6, strips = 5;
      for (let i = 0; i < strips; i++) {
        const dy = Math.sin(t * 7 - i * 0.9 + e.x) * 1.8 * u * (i / strips);
        c.fillStyle = i % 2 ? (e.col ?? '#d6202a') : dark(e.col ?? '#d6202a', 0.12);
        c.fillRect(x + (i * fw) / strips, y + dy, fw / strips + 0.5, fh);
      }
      break;
    }
    case 'rotor': {
      const R = (e.a ?? 14) * u, a0 = t * 2.2;
      c.strokeStyle = e.col ?? '#5b3a24'; c.lineWidth = 1.6 * u; c.beginPath();
      for (let i = 0; i < (e.b ?? 12); i++) { const a = a0 + (i / (e.b ?? 12)) * Math.PI * 2; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); }
      c.stroke();
      break;
    }
    case 'heat': {
      // heat shimmer on the flats: a few pale bands that slide and breathe
      const w = (e.a ?? 120) * u;
      for (let i = 0; i < 3; i++) {
        c.fillStyle = `rgba(255,255,255,${0.08 + 0.06 * Math.sin(t * 2 + i * 2 + e.x)})`;
        c.fillRect(x + Math.sin(t * 0.7 + i) * 10 * u, y + i * 4 * u, w, 1.5 * u);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- the recipes

type Build = (B: RecipeBuilder) => void;
const R = (build: Build, pal?: Partial<Pal>, clouds?: number): Recipe => ({ build, pal, clouds });

const CAR_COLS = ['#2f9e9b', '#e0533a', '#f2c12e', '#4f6fd0', '#a24d8f', '#6fb04a', '#e8e2d4'];
const BOX_COLS = ['#d9472b', '#1f7fbf', '#f2a91c', '#2f9a6a', '#7a4ab0', '#e2702a'];

// ---- Scrapyard Strip: Ray's Yard at sunset — magnet crane, crusher, excavator, forklift, car stacks and tyre walls
const scrapyard: Build = (B) => {
  const { u, hz, rt, span, pal } = B;
  B.layer(FAR, hz - 66 * u, hz + 2, (P) => {
    const { c, w, k } = P;
    ridge(c, w, hz + 2, 56 * u, 90 * u, 1, '#6a2f55');
    // a line of pylons striding across the hills
    P.place(4, (x) => pylon(k, x, hz + 2, 62 * u, '#4f2346'), 3);
    c.strokeStyle = 'rgba(60,25,55,0.6)'; c.lineWidth = 0.8 * u;
    c.beginPath(); for (let x = 0; x <= w; x += w / 4) c.lineTo(x, hz - 48 * u + Math.sin((x / w) * Math.PI * 8) * 2 * u); c.stroke();
    haze(P, hz - 110 * u, hz + 2, pal.sky[2], 0.12, 0.35);
  });
  const g = hz + span * 0.42; // the yard floor line for the landmark layer
  B.layer(MID, hz - 88 * u, hz + span * 0.55, (P) => {
    const { c, w, k, emit } = P;
    // heaps of crushed cars behind the yard: pyramids of cubes, faded by distance
    P.place(9, (x, r, i) => {
      const base = 4 + Math.floor(r * 3), cw = 22 * u, chh = 7 * u;
      for (let row = 0; row < base; row++) for (let j = 0; j < base - row; j++) {
        const cx = x + (j - (base - row) / 2) * cw + (hash(i * 7 + row * 3 + j) - 0.5) * 4 * u;
        // distant cubes: paint, a glass band and a lit top edge are enough at this size
        const col = mix(CAR_COLS[(i + row * 2 + j) % CAR_COLS.length], '#5a2a40', 0.45), y = g + 3 * u - row * chh;
        rect(c, cx, y - chh + 0.5 * u, cw - 1 * u, chh - 0.5 * u, col);
        rect(c, cx + cw * 0.18, y - chh * 0.75, cw * 0.55, chh * 0.3, 'rgba(28,38,52,0.7)');
        rect(c, cx, y - chh + 0.5 * u, cw - 1 * u, 0.8 * u, 'rgba(255,200,150,0.35)');
      }
    }, 9);
    rect(c, 0, g, w, hz + span * 0.55 - g, '#5c3426');
    // container stacks in bold colours
    P.place(3, (x, _r, i) => {
      for (let j = 0; j < 2 + (i % 2); j++) container(k, x - 26 * u + (j % 2) * 6 * u, g + 4 * u - j * 12 * u, 54 * u, 12 * u, BOX_COLS[(i * 2 + j) % BOX_COLS.length], 'x');
    }, 11);
    // landmark 1: the magnet crane with a car on its magnet (swinging live)
    P.at(0.191, (x) => {
      const tip = magnetCrane(k, x, g + 6 * u, 0.95 * u);
      emit({ x: tip.x, y: tip.y, k: 'magnet', a: 46, col: '#3f8d8c', reach: 40 });
      emit({ x: x + 6 * u, y: g - 26 * u, k: 'blink', col: '#ffb020', a: 5 });
    });
    // landmark 2: the crusher with its ram (live) and a car waiting on the conveyor
    P.at(0.532, (x) => {
      crusher(k, x, g + 8 * u, 0.9 * u);
      emit({ x, y: g + 8 * u - 56 * 0.9 * u, k: 'press', a: 36, b: 44 * 0.9, col: '#c2563a', reach: 40 });
      // conveyor ramp feeding it
      poly(c, [x - 30 * u, g - 6 * u, x - 80 * u, g + 6 * u, x - 76 * u, g + 9 * u, x - 28 * u, g - 2 * u], '#3a3434');
      carStack(k, x - 60 * u, g + 6 * u, 0.7 * u, 1, ['#d9b23c'], 3);
    });
    // landmark 3: RAY'S YARD, a bulb-lit billboard on stilts
    P.at(0.841, (x) => {
      rect(c, x - 30 * u, g - 46 * u, 3 * u, 48 * u, '#2b1426'); rect(c, x + 27 * u, g - 46 * u, 3 * u, 48 * u, '#2b1426');
      rect(c, x - 40 * u, g - 74 * u, 80 * u, 30 * u, '#ffcf3a');
      rect(c, x - 40 * u, g - 74 * u, 80 * u, 4 * u, '#e2581f'); rect(c, x - 40 * u, g - 48 * u, 80 * u, 4 * u, '#e2581f');
      P.text("RAY'S YARD", x - 38 * u, g - 71 * u, 76 * u, 22 * u, '#2b1426', 14 * u);
      emit({ x: x - 38 * u, y: g - 76 * u, k: 'chase', a: 76 });
    });
    haze(P, hz - 150 * u, hz + span * 0.55, pal.sky[2], 0.06, 0.14);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.35, w, rt - hz, pal.ground);
    // gravel texture streaks
    c.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 60; i++) c.fillRect(hash(i * 1.3) * w, hz + span * (0.4 + hash(i * 2.7) * 0.55), (6 + hash(i) * 14) * u, 1.2 * u);
    const y1 = hz + span * 0.66;
    // a back row of two-high containers, then towering stacks of crushed cars in bold paint
    P.place(4, (x, _r, i) => { for (let j = 0; j < 2; j++) container(k, x - 30 * u, y1 - j * 15 * u, 62 * u, 15 * u, BOX_COLS[(i * 3 + j) % BOX_COLS.length], 'x'); }, 25);
    P.place(8, (x, r, i) => carStack(k, x, rt - 14 * u - r * 8 * u, 1.35 * u, 3 + Math.floor(r * 3), CAR_COLS, i * 3 + 1), 5);
    P.at(0.27, (x) => excavator(k, x, rt - 8 * u, 1.35 * u, '#f4b30f', 0.4));
    P.at(0.71, (x) => forklift(k, x, rt - 8 * u, 1.35 * u, '#e2581f', 0.5));
    P.place(4, (x, r) => { pallets(k, x, rt - 8 * u, 26 * u, 2 + Math.floor(r * 4)); }, 23);
    P.place(4, (x) => tyrePile(k, x, rt - 9 * u, 1.3 * u, 5), 26);
    P.place(5, (x, _r, i) => { drum(k, x, rt - 6 * u, 1.4 * u, ['#2f6fb5', '#d6202a', '#2f9a4a'][i % 3]); drum(k, x + 12 * u, rt - 6 * u, 1.4 * u, '#d6202a'); }, 24);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 30 * u, rt + 1, (P) => {
    const { c, w, k } = P;
    // the tyre wall along the kerb, banded red and white, with hazard blocks and tyre piles
    tyreWall(k, 0, w, rt, 5 * u, 3, '#f4f1ea', '#d6202a');
    P.place(5, (x) => {
      rect(c, x - 10 * u, rt - 18 * u, 20 * u, 18 * u, '#ffc61a');
      for (let i = 0; i < 4; i++) poly(c, [x - 10 * u + i * 6 * u, rt, x - 6 * u + i * 6 * u, rt, x - 2 * u + i * 6 * u, rt - 18 * u, x - 6 * u + i * 6 * u, rt - 18 * u], '#1b1716');
    }, 31);
    P.place(3, (x) => tyrePile(k, x, rt - 12 * u, 1 * u, 4), 32);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w, k } = P;
    const { rb } = B;
    rect(c, 0, rb + 4 * u, w, 3 * u, 'rgba(255,198,26,0.35)');
    P.place(5, (x) => { rect(c, x, rb + 10 * u, 6 * u, 34 * u, '#3a2418'); for (let i = 0; i < 3; i++) rect(c, x, rb + (12 + i * 10) * u, 6 * u, 4 * u, 'rgba(242,194,48,0.6)'); });
    P.place(3, (x) => { for (let i = 0; i < 2; i++) tyre(c, x + i * 16 * u, rb + 20 * u, 7 * u, '#120c0a', '#2a201c'); }, 4);
    void k;
  });
};

// ---- Maple Highway: a bright autumn afternoon — the water tower, a red barn and silo, the church, maples
const maple: Build = (B) => {
  const { u, hz, rt, span, pal } = B;
  B.layer(FAR, hz - 40 * u, hz + 2, (P) => {
    const { c, w } = P;
    ridge(c, w, hz + 2, 44 * u, 130 * u, 2, '#7fb48e');
    // patchwork fields on the far hills
    for (let i = 0; i < 14; i++) { c.fillStyle = ['rgba(230,200,90,0.45)', 'rgba(150,190,90,0.4)', 'rgba(200,140,70,0.35)'][i % 3]; c.fillRect(hash(i * 3) * w, hz - (4 + hash(i) * 10) * u, (30 + hash(i * 5) * 50) * u, 4 * u); }
    haze(P, hz - 60 * u, hz + 2, pal.sky[2], 0.15, 0.35);
  });
  const g = hz + span * 0.4;
  B.layer(MID, hz - 64 * u, hz + span * 0.55, (P) => {
    const { c, w, k } = P;
    ridge(c, w, g, 28 * u, 80 * u, 5, '#55984f');
    rect(c, 0, g - 1, w, hz + span * 0.55 - g + 1, '#55984f');
    // rows of corn stubble and hay rolls on the hill
    P.place(12, (x, r) => { ell(c, x, g - 2 * u - r * 6 * u, 5 * u, 4 * u, '#d9b45a'); ell(c, x + 1 * u, g - 3 * u - r * 6 * u, 2 * u, 2 * u, '#b8913e'); }, 14);
    P.at(0.135, (x) => {
      waterTower(k, x, g + 2 * u, 1.05 * u, '#eef2f4', '#c8432f');
      P.text('MAPLE', x - 17 * u, g - 69 * u, 34 * u, 18 * u, '#c8432f', 11 * u);
    });
    P.at(0.476, (x) => { barn(k, x - 30 * u, g + 2 * u, 46 * u, 38 * u); silo(k, x + 20 * u, g + 2 * u, 14 * u, 50 * u); silo(k, x + 36 * u, g + 2 * u, 11 * u, 40 * u, '#b9c0c8'); });
    P.at(0.873, (x) => church(k, x, g + 2 * u, 1 * u));
    P.place(9, (x, r, i) => roundTree(k, x, g + 2 * u, (0.6 + r * 0.3) * u, ['#e2572a', '#f2a12c', '#c93a2a', '#f5c33a', '#7aa63a'][i % 5]), 12);
    haze(P, hz - 110 * u, hz + span * 0.55, pal.sky[2], 0.04, 0.12);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.45, w, rt - hz, pal.ground);
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < w; x += 26 * u) c.fillRect(x, hz + span * 0.45, 13 * u, rt - hz);
    const y = hz + span * 0.86;
    const roofs = ['#c8432f', '#2f8f8a', '#e3a63a', '#5a63b8', '#8d3f6b'];
    const walls = ['#f4ead6', '#dfe8ee', '#f2d8c2', '#e8e1f2', '#fff4d6'];
    P.place(7, (x, r, i) => house(k, x - 22 * u, y, (42 + r * 10) * u, (24 + r * 6) * u, walls[i % walls.length], roofs[i % roofs.length], i), 3);
    P.place(10, (x, r, i) => roundTree(k, x, y + 2 * u, (0.95 + r * 0.4) * u, ['#e2572a', '#f2a12c', '#c93a2a', '#f5c33a'][i % 4]), 9);
    // a school bus parked by the church
    P.at(0.540, (x) => {
      rect(c, x, y - 15 * u, 50 * u, 13 * u, '#f2b21c'); rect(c, x + 44 * u, y - 10 * u, 8 * u, 8 * u, '#f2b21c');
      windows(c, x + 3 * u, y - 13 * u, 40 * u, 5 * u, 7, 1, 1, ['#2c3e55'], '#2c3e55', 1, 0.8);
      rect(c, x, y - 6 * u, 52 * u, 1.4 * u, '#1b1b1f');
      tyre(c, x + 10 * u, y - 2 * u, 3.5 * u); tyre(c, x + 40 * u, y - 2 * u, 3.5 * u);
    });
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 28 * u, rt + 1, (P) => {
    const { c, w, k } = P;
    // a clipped hedge, a white picket fence, mailboxes and pumpkins
    ell(c, w / 2, rt - 3 * u, w, 4 * u, '#2f6b2a');
    c.fillStyle = '#f2efe6';
    for (let x = 0; x < w; x += 9 * u) poly(c, [x, rt - 2 * u, x + 5 * u, rt - 2 * u, x + 5 * u, rt - 16 * u, x + 2.5 * u, rt - 19 * u, x, rt - 16 * u], '#f2efe6');
    rect(c, 0, rt - 13 * u, w, 2 * u, '#f2efe6'); rect(c, 0, rt - 7 * u, w, 2 * u, '#dcd6c8');
    P.place(4, (x) => { rect(c, x, rt - 22 * u, 2 * u, 20 * u, '#5a3a26'); rect(c, x - 4 * u, rt - 28 * u, 10 * u, 7 * u, '#2b6fd0'); rect(c, x + 5 * u, rt - 30 * u, 1.5 * u, 4 * u, '#d6202a'); }, 41);
    P.place(6, (x) => { ell(c, x, rt - 4 * u, 5 * u, 4 * u, '#f07b1c'); ell(c, x + 7 * u, rt - 3 * u, 3.5 * u, 3 * u, '#f59a2a'); rect(c, x - 0.5 * u, rt - 9 * u, 1.5 * u, 2 * u, '#3f6b2a'); }, 42);
    P.place(5, (x) => { ell(c, x, rt - 2 * u, 14 * u, 3 * u, '#c9532a'); ell(c, x + 4 * u, rt - 3 * u, 8 * u, 2 * u, '#e8892a'); }, 43);
    void k;
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 10 * u, '#2f5a2a');
    P.place(14, (x, r) => ell(c, x, rb + 10 * u, 4 * u, 2 * u, ['#c9532a', '#e8892a', '#b8402a'][Math.floor(r * 3)]), 2);
    P.place(4, (x) => { rect(c, x, rb + 6 * u, 4 * u, 36 * u, '#e9e5d9'); rect(c, x - 10 * u, rb + 6 * u, 24 * u, 12 * u, '#2b6fd0'); });
  });
  // a hot-air balloon above the fields, and leaves blowing across the road
  B.live((L) => {
    const { ctx, W, u: uu, t, scroll } = L;
    const x = drift(W * 0.6 + t * 5 * uu - scroll * 0.01, W * 1.5) - W * 0.2, y = L.hz * 0.55 + Math.sin(t * 0.6) * 5 * uu;
    ctx.fillStyle = '#e2572a'; ctx.beginPath(); ctx.arc(x, y, 13 * uu, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 4 * uu, y - 12 * uu, 8 * uu, 24 * uu);
    ctx.fillStyle = '#6b3d2a'; ctx.fillRect(x - 3 * uu, y + 16 * uu, 6 * uu, 5 * uu);
  });
  B.live((L) => leaves(L, 10, L.hz + L.span * 0.2, L.rt + 20 * L.u, ['#e2572a', '#f2a12c', '#c93a2a', '#f5c33a']));
};

// ---- Foundry Circuit: steel-blue dusk lit by the furnaces — cooling towers, a blast furnace, ladle crane, coils
const foundry: Build = (B) => {
  const { u, hz, rt, span, pal } = B;
  B.layer(FAR, hz - 74 * u, hz + 2, (P) => {
    const { c, w, k, emit } = P;
    ridge(c, w, hz + 2, 36 * u, 70 * u, 3, '#3c3a63', true);
    P.place(2, (x, r) => {
      coolingTower(k, x, hz + 2, 52 * u, 70 * u, '#4a4870'); coolingTower(k, x + 46 * u, hz + 2, 44 * u, 58 * u, '#43416a');
      emit({ x, y: hz - 70 * u, k: 'steam', a: 0.9 }); emit({ x: x + 46 * u, y: hz - 58 * u, k: 'steam', a: 0.75 }); void r;
    }, 6);
    haze(P, hz - 110 * u, hz + 2, '#ff8a3d', 0.05, 0.3);
  });
  const g = hz + span * 0.4;
  B.layer(MID, hz - 104 * u, hz + span * 0.55, (P) => {
    const { c, w, k, emit } = P;
    rect(c, 0, hz - 10 * u, w, span * 0.55 + 10 * u, '#1e2240');
    // a run of mill sheds along the horizon
    P.place(6, (x, r) => { const bw = (60 + r * 40) * u, bh = (18 + r * 10) * u; rect(c, x, g - bh, bw, bh, '#232849'); poly(c, [x, g - bh, x + bw / 2, g - bh - 8 * u, x + bw, g - bh], '#232849'); }, 2);
    P.place(5, (x, r) => {
      const top = stack(k, x, g, 10 * u, (70 + r * 40) * u, '#262b4e');
      emit({ x: top.x, y: top.y, k: 'smoke' }); if (r > 0.5) emit({ x: top.x, y: top.y + 4 * u, k: 'beacon' });
    }, 4);
    // landmark: the blast furnace — a tapering shell, downcomers, a glowing tap hole and a flare stack
    P.at(0.476, (x) => {
      poly(c, [x - 30 * u, g + 4 * u, x + 30 * u, g + 4 * u, x + 20 * u, g - 92 * u, x - 20 * u, g - 92 * u], '#2b3058');
      rect(c, x + 14 * u, g - 92 * u, 3 * u, 96 * u, 'rgba(255,170,90,0.35)');
      c.fillStyle = '#ff9a3c'; c.fillRect(x - 14 * u, g - 40 * u, 28 * u, 5 * u); c.fillRect(x - 10 * u, g - 70 * u, 20 * u, 3 * u);
      disc(c, x, g - 8 * u, 8 * u, '#ffcf5a'); disc(c, x, g - 8 * u, 13 * u, 'rgba(255,160,60,0.25)');
      line(c, x - 18 * u, g - 92 * u, x - 40 * u, g - 120 * u, 4 * u, '#2b3058'); line(c, x + 18 * u, g - 92 * u, x + 40 * u, g - 116 * u, 4 * u, '#2b3058');
      rect(c, x - 44 * u, g - 124 * u, 8 * u, 124 * u, '#262b4e');
      const fl = stack(k, x + 60 * u, g, 6 * u, 128 * u, '#262b4e', '#ff9a3c');
      emit({ x: fl.x, y: fl.y, k: 'flare' });
      emit({ x, y: g - 4 * u, k: 'sparks', reach: 40 });
      // the ladle crane: a gantry with a glowing ladle pouring into a mould car
      lattice(k, x + 80 * u, g - 72 * u, x + 190 * u, g - 72 * u, 6 * u, '#3a4168', 12);
      rect(c, x + 80 * u, g - 72 * u, 5 * u, 76 * u, '#3a4168'); rect(c, x + 186 * u, g - 72 * u, 5 * u, 76 * u, '#3a4168');
      line(c, x + 140 * u, g - 66 * u, x + 140 * u, g - 46 * u, 1.2 * u, '#141730');
      poly(c, [x + 128 * u, g - 46 * u, x + 152 * u, g - 46 * u, x + 148 * u, g - 28 * u, x + 132 * u, g - 28 * u], '#3a3f5c');
      rect(c, x + 128 * u, g - 47 * u, 24 * u, 3 * u, '#ff9a3c');
      emit({ x: x + 150 * u, y: g - 30 * u, k: 'pour', a: 22 });
      rect(c, x + 134 * u, g - 8 * u, 32 * u, 8 * u, '#3a3f5c'); rect(c, x + 136 * u, g - 9 * u, 28 * u, 2 * u, '#ffb24a');
    });
    haze(P, hz - 150 * u, hz + span * 0.55, '#ff8a3d', 0.02, 0.12);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.42, w, rt - hz, pal.ground);
    const y = hz + span * 0.84;
    P.place(5, (x, r) => {
      const bw = (70 + r * 40) * u, bh = (30 + r * 14) * u;
      box3(k, x, y, bw, bh, 6 * u, '#2d3352');
      c.fillStyle = '#ff9a3c'; c.fillRect(x + bw * 0.08, y - bh * 0.6, bw * 0.84, 4 * u);
      c.fillStyle = 'rgba(255,154,60,0.35)'; c.fillRect(x + bw * 0.08, y - bh * 0.6 + 4 * u, bw * 0.84, 6 * u);
      c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < bw; i += 6 * u) c.fillRect(x + i, y - bh, 1 * u, bh * 0.4);
    }, 7);
    // steel coils and stacked I-beams in the yard
    P.place(6, (x, r) => {
      for (let i = 0; i < 2 + Math.floor(r * 2); i++) { const cx = x + i * 13 * u; disc(c, cx, rt - 14 * u, 7 * u, '#8a93a6'); disc(c, cx, rt - 14 * u, 3 * u, '#2a2f42'); disc(c, cx + 2 * u, rt - 16 * u, 2 * u, 'rgba(255,200,150,0.5)'); }
    }, 8);
    P.place(4, (x) => { for (let i = 0; i < 4; i++) { rect(c, x, rt - 8 * u - i * 4 * u, 40 * u, 3 * u, '#5a6178'); rect(c, x, rt - 8 * u - i * 4 * u, 40 * u, 0.8 * u, '#ffb24a'); } }, 9);
    // a slag wagon with a glowing load
    P.at(0.516, (x) => { rect(c, x, rt - 18 * u, 36 * u, 10 * u, '#3a3f5c'); ell(c, x + 18 * u, rt - 18 * u, 16 * u, 5 * u, '#ff7a2a'); ell(c, x + 18 * u, rt - 19 * u, 9 * u, 2.5 * u, '#ffd27a'); tyre(c, x + 8 * u, rt - 7 * u, 3 * u); tyre(c, x + 28 * u, rt - 7 * u, 3 * u); });
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 26 * u, rt + 1, (P) => {
    const { c, w } = P;
    // girder fence with hazard tops and a lit safety line
    rect(c, 0, rt - 12 * u, w, 3 * u, '#4a5268'); rect(c, 0, rt - 20 * u, w, 2 * u, '#4a5268');
    for (let x = 0; x < w; x += 30 * u) { rect(c, x, rt - 22 * u, 3 * u, 22 * u, '#4a5268'); rect(c, x, rt - 22 * u, 3 * u, 3 * u, '#f2c230'); }
    c.save(); c.beginPath(); c.rect(0, rt - 5 * u, w, 4 * u); c.clip();
    for (let x = 0; x < w; x += 8 * u) poly(c, [x, rt - 1 * u, x + 4 * u, rt - 1 * u, x + 8 * u, rt - 5 * u, x + 4 * u, rt - 5 * u], '#f2c230');
    c.restore();
    P.place(3, (x) => { rect(c, x, rt - 30 * u, 26 * u, 14 * u, '#f2c230'); P.text('HOT METAL', x + 1 * u, rt - 30 * u, 24 * u, 14 * u, '#1b1716', 8 * u); rect(c, x + 12 * u, rt - 16 * u, 2 * u, 16 * u, '#4a5268'); }, 51);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(6, (x) => { rect(c, x, rb + 8 * u, 8 * u, 46 * u, pal.post); rect(c, x, rb + 8 * u, 8 * u, 3 * u, '#ff9a3c'); });
  });
  B.live((L) => {
    // the furnace glow breathes along the horizon (a flat band, no per-frame gradient)
    L.ctx.fillStyle = `rgba(255,120,40,${0.06 + 0.05 * Math.sin(L.t * 1.7)})`;
    L.ctx.fillRect(0, L.hz - 40 * L.u, L.W, 40 * L.u);
  });
};

// ---- Harbor Launch: the container port — ship-to-shore cranes, a container ship, straddle carriers, bollards
const harbor: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 45 * u, rt, (P) => {
    const { c, w } = P;
    water(P, hz - 2 * u, rt, '#1c7fb0', '#2aa3bf', 'rgba(255,255,255,0.35)', 50, 2);
    // the city across the bay, pale with distance
    P.place(12, (x, r) => rect(c, x, hz - (10 + r * 34) * u, (12 + r * 16) * u, (10 + r * 34) * u + 2 * u, '#8fb3c9'), 4);
    rect(c, 0, hz - 1 * u, w, 2 * u, '#7fa6bf');
  });
  const q = hz + span * 0.3; // the quay edge
  B.layer(MID, hz - 125 * u, hz + span * 0.6, (P) => {
    const { c, w, k, emit } = P;
    rect(c, 0, q, w, hz + span * 0.6 - q, '#b9b2a2'); rect(c, 0, q, w, 2 * u, '#f2c230');
    // a container ship at the berth
    P.at(0.468, (x) => {
      poly(c, [x - 160 * u, q - 2 * u, x + 120 * u, q - 2 * u, x + 140 * u, q - 22 * u, x - 170 * u, q - 22 * u], '#22344f');
      rect(c, x - 170 * u, q - 22 * u, 310 * u, 3 * u, '#c8432f');
      for (let i = 0; i < 20; i++) for (let j = 0; j < 3; j++) container(k, x - 150 * u + i * 13 * u, q - 22 * u - j * 7 * u, 12.5 * u, 7 * u, BOX_COLS[(i * 3 + j * 5) % BOX_COLS.length]);
      rect(c, x + 100 * u, q - 52 * u, 26 * u, 30 * u, '#eef0f2'); windows(c, x + 102 * u, q - 50 * u, 22 * u, 20 * u, 4, 3, 3, ['#36506a'], '#36506a', 1, 0.6);
      rect(c, x + 116 * u, q - 62 * u, 6 * u, 10 * u, '#c8432f');
    });
    // ship-to-shore gantry cranes, red and blue, with live trolleys
    P.place(3, (x, _r, i) => {
      const col = i % 2 ? '#d6452a' : '#2f6fb5';
      const top = q - 118 * u;
      rect(c, x - 22 * u, top, 5 * u, q - top, col); rect(c, x + 18 * u, top, 5 * u, q - top, col);
      line(c, x - 20 * u, q - 40 * u, x + 20 * u, q - 80 * u, 2 * u, col);
      rect(c, x - 90 * u, top + 10 * u, 160 * u, 6 * u, col);
      rect(c, x - 90 * u, top + 10 * u, 160 * u, 1.2 * u, 'rgba(255,230,200,0.6)');
      line(c, x, top - 18 * u, x - 88 * u, top + 10 * u, 1.2 * u, dark(col, 0.2)); line(c, x, top - 18 * u, x + 68 * u, top + 10 * u, 1.2 * u, dark(col, 0.2));
      rect(c, x - 3 * u, top - 20 * u, 6 * u, 30 * u, col);
      rect(c, x + 22 * u, top + 2 * u, 14 * u, 10 * u, '#eef0f2');
      emit({ x: x - 80 * u, y: top + 18 * u, k: 'trolley', a: 110, b: 70, col: BOX_COLS[(i * 2 + 1) % BOX_COLS.length], reach: 120 });
      emit({ x, y: top - 20 * u, k: 'beacon' });
    }, 11);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.5, w, rt - hz, '#a59e8f');
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < w; x += 40 * u) c.fillRect(x, hz + span * 0.62, 20 * u, 1.5 * u);
    const y = rt - 8 * u;
    // container stacks in blocks, staggered heights
    P.place(5, (x, r, i) => {
      const cols = 2 + Math.floor(r * 2);
      for (let a = 0; a < cols; a++) for (let b = 0; b < 1 + ((a + i) % 3); b++) container(k, x + a * 46 * u, y - b * 13 * u, 45 * u, 13 * u, BOX_COLS[(i + a * 2 + b * 3) % BOX_COLS.length], b === 0 ? 'x' : undefined);
    }, 6);
    // a straddle carrier over a container
    P.at(0.492, (x) => {
      rect(c, x, y - 44 * u, 4 * u, 44 * u, '#e2b31c'); rect(c, x + 46 * u, y - 44 * u, 4 * u, 44 * u, '#e2b31c');
      rect(c, x - 2 * u, y - 48 * u, 54 * u, 6 * u, '#e2b31c'); rect(c, x + 34 * u, y - 58 * u, 14 * u, 10 * u, '#eef0f2');
      container(k, x + 4 * u, y - 16 * u, 42 * u, 13 * u, '#2f9a6a');
      tyre(c, x + 2 * u, y - 2 * u, 4 * u); tyre(c, x + 48 * u, y - 2 * u, 4 * u);
    });
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 24 * u, rt + 1, (P) => {
    const { c, w } = P;
    rect(c, 0, rt - 6 * u, w, 6 * u, '#cfc7b4');
    c.save(); c.beginPath(); c.rect(0, rt - 6 * u, w, 3 * u); c.clip();
    for (let x = 0; x < w; x += 10 * u) poly(c, [x, rt - 3 * u, x + 5 * u, rt - 3 * u, x + 10 * u, rt - 6 * u, x + 5 * u, rt - 6 * u], '#1b1716');
    c.restore();
    P.place(8, (x) => { rect(c, x - 4 * u, rt - 14 * u, 8 * u, 8 * u, '#f2c230'); ell(c, x, rt - 14 * u, 6 * u, 2 * u, '#ffd75a'); }, 61);
    P.place(3, (x) => { rect(c, x, rt - 20 * u, 18 * u, 14 * u, '#a5763f'); rect(c, x, rt - 20 * u, 18 * u, 1.4 * u, '#d6a466'); line(c, x, rt - 20 * u, x + 18 * u, rt - 6 * u, 1 * u, '#7a5530'); }, 62);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 8 * u, w, 5 * u, '#6b6658');
    P.place(5, (x) => { rect(c, x, rb + 8 * u, 6 * u, 26 * u, '#3a3833'); rect(c, x, rb + 8 * u, 6 * u, 3 * u, 'rgba(242,194,48,0.6)'); });
  });
  // a tug pushing out across the harbour, and gulls over the quay
  B.live((L) => {
    gulls(L, 4, L.hz - 64 * L.u);
    boatMover(L, 3, L.hz + L.span * 0.18, -10, 0.03, (c, x, y) => {
      poly(c, [x, y, x + 24 * L.u, y, x + 28 * L.u, y - 6 * L.u, x - 2 * L.u, y - 6 * L.u], '#d6452a');
      c.fillStyle = '#f4f1ea'; c.fillRect(x + 6 * L.u, y - 13 * L.u, 10 * L.u, 7 * L.u);
      c.fillStyle = '#26334a'; c.fillRect(x + 8 * L.u, y - 11 * L.u, 6 * L.u, 2 * L.u);
    });
  });
};

// ---- Cliffside Esses: white chalk cliffs, the striped lighthouse, sea stacks, gorse and sheep on the clifftop
const cliffs: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 26 * u, rt, (P) => {
    const { c } = P;
    water(P, hz - 2 * u, rt, '#1d78b2', '#24a9c4', 'rgba(255,255,255,0.4)', 60, 7);
    P.place(2, (x, r) => { c.fillStyle = '#7fa3b8'; c.beginPath(); c.ellipse(x, hz, (60 + r * 40) * u, (12 + r * 6) * u, 0, Math.PI, 0); c.fill(); }, 2);
  });
  B.layer(MID, hz - 150 * u, rt, (P) => {
    const { c, k, emit } = P;
    // headlands of chalk dropping into the sea, a lighthouse on the tallest, sea stacks off the point
    P.place(2, (x, r, i) => {
      const hh = (38 + r * 18) * u, x0 = x - 100 * u, x1 = x + 110 * u;
      c.fillStyle = '#efe7d3'; c.beginPath(); c.moveTo(x0, hz + span * 0.3); c.lineTo(x0 + 20 * u, hz - hh); c.quadraticCurveTo(x, hz - hh - 14 * u, x1 - 26 * u, hz - hh + 4 * u); c.lineTo(x1, hz + span * 0.3); c.closePath(); c.fill();
      c.fillStyle = 'rgba(120,110,90,0.18)'; for (let j = 0; j < 6; j++) c.fillRect(x0 + 24 * u + j * 30 * u, hz - hh + 10 * u, 3 * u, hh + span * 0.3 - 10 * u);
      c.fillStyle = '#4f8a3a'; c.beginPath(); c.moveTo(x0 + 18 * u, hz - hh + 2 * u); c.quadraticCurveTo(x, hz - hh - 16 * u, x1 - 24 * u, hz - hh + 2 * u); c.lineTo(x1 - 24 * u, hz - hh + 8 * u); c.quadraticCurveTo(x, hz - hh - 8 * u, x0 + 18 * u, hz - hh + 8 * u); c.fill();
      // sea stacks and surf at the foot
      poly(c, [x1 + 10 * u, hz + span * 0.3, x1 + 14 * u, hz - 20 * u, x1 + 24 * u, hz - 24 * u, x1 + 28 * u, hz + span * 0.3], '#e4dcc6');
      emit({ x: x1 + 18 * u, y: hz + span * 0.3, k: 'surf', a: 22 }); emit({ x: x0 + 10 * u, y: hz + span * 0.3, k: 'surf', a: 30 });
      if (i === 0) {
        const lamp = lighthouse(k, x + 10 * u, hz - hh - 6 * u, 0.9 * u);
        emit({ x: lamp.x, y: lamp.y, k: 'beam', a: 110, reach: 120 });
        // the keeper's cottages
        house(k, x - 40 * u, hz - hh - 2 * u, 26 * u, 12 * u, '#f6f3ea', '#3a4a5a', 3);
        house(k, x - 70 * u, hz - hh + 1 * u, 22 * u, 10 * u, '#f6f3ea', '#3a4a5a', 4);
      }
    }, 12);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // the clifftop meadow: green, with gorse in bloom, wind-bent hawthorns, a dry-stone wall and grazing sheep
    c.fillStyle = '#5c9a48'; c.beginPath(); c.moveTo(0, rt);
    for (let i = 0, n = Math.ceil(w / (30 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, hz + span * (0.42 + 0.08 * Math.sin((x / w) * Math.PI * 6))); }
    c.lineTo(w, rt); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 40; i++) c.fillRect(hash(i * 2.2) * w, hz + span * (0.55 + hash(i) * 0.4), 18 * u, 1.2 * u);
    P.place(12, (x, r) => {
      const y = rt - (8 + r * 22) * u, s2 = (1.6 + r * 0.8) * u;
      bush(k, x, y, s2, '#3d7a32');
      for (let i = 0; i < 6; i++) disc(c, x + (hash(i + r * 9) - 0.4) * 14 * s2 / u * u * 0.9, y - (2 + hash(i * 3 + r) * 6) * s2 / u * u * 0.7, 1.6 * u, '#ffd23f');
    }, 4);
    P.at(0.55, (x) => {
      // a whitewashed stone cottage with a slate roof and a chimney
      const y = rt - 22 * u;
      foot(k, x + 20 * u, y, 50 * u);
      rect(c, x, y - 20 * u, 44 * u, 20 * u, '#f2efe6'); rect(c, x + 40 * u, y - 20 * u, 4 * u, 20 * u, '#ffffff');
      poly(c, [x - 3 * u, y - 20 * u, x + 47 * u, y - 20 * u, x + 40 * u, y - 32 * u, x + 4 * u, y - 32 * u], '#4a5462');
      rect(c, x + 34 * u, y - 38 * u, 5 * u, 8 * u, '#8a8580');
      rect(c, x + 6 * u, y - 14 * u, 7 * u, 7 * u, '#36506a'); rect(c, x + 30 * u, y - 14 * u, 7 * u, 7 * u, '#36506a'); rect(c, x + 18 * u, y - 13 * u, 7 * u, 13 * u, '#c8432f');
    });
    P.place(3, (x) => {
      // a wind-bent tree leaning away from the sea
      line(c, x, rt - 8 * u, x + 14 * u, rt - 46 * u, 4 * u, '#5a4030');
      line(c, x + 8 * u, rt - 30 * u, x + 24 * u, rt - 40 * u, 2.4 * u, '#5a4030');
      ell(c, x + 26 * u, rt - 50 * u, 28 * u, 10 * u, '#3a6e32'); ell(c, x + 34 * u, rt - 53 * u, 16 * u, 5 * u, '#4f8a3a');
    }, 5);
    P.place(6, (x, r) => {
      // sheep
      for (let i = 0; i < 1 + Math.floor(r * 3); i++) {
        const sx = x + i * 22 * u, sy = rt - (14 + r * 16) * u;
        rect(c, sx - 5 * u, sy + 3 * u, 1.8 * u, 6 * u, '#2a2a2e'); rect(c, sx + 4 * u, sy + 3 * u, 1.8 * u, 6 * u, '#2a2a2e');
        ell(c, sx, sy, 10 * u, 6.5 * u, '#f6f3ea'); ell(c, sx + 2 * u, sy - 3 * u, 6 * u, 2.4 * u, '#ffffff');
        ell(c, sx + 10 * u, sy - 2 * u, 3.4 * u, 2.6 * u, '#2a2a2e');
      }
    }, 6);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 22 * u, rt + 1, (P) => {
    const { c, w } = P;
    // a dry-stone wall and a white guard rail
    ['#9a958a', '#b5afa2', '#86817a'].forEach((col, ci) => {
      c.fillStyle = col; c.beginPath();
      for (let x = 0, i = 0; x < w; x += 7 * u, i++) for (let j = 0; j < 2; j++) if ((i + j) % 3 === ci) c.roundRect(x + (j % 2) * 3 * u, rt - 6 * u - j * 5 * u, 6.5 * u, 5 * u, 2 * u);
      c.fill();
    });
    rect(c, 0, rt - 18 * u, w, 3 * u, '#e9e4d8'); rect(c, 0, rt - 18 * u, w, 1 * u, '#ffffff');
    for (let x = 0; x < w; x += 24 * u) rect(c, x, rt - 18 * u, 3 * u, 12 * u, '#c9c4b8');
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#2f5a2a');
    P.place(5, (x) => ell(c, x, rb + 16 * u, 16 * u, 6 * u, '#3a3a36'), 3);
  });
  B.live((L) => gulls(L, 4, L.hz - 64 * L.u));
};

// ---- Coast Road: a clear noon on the beach highway — beach huts, the pier, lifeguard tower, umbrellas and palms
const coast: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 30 * u, rt, (P) => {
    const { c } = P;
    water(P, hz - 2 * u, rt, '#1690c8', '#27c2c9', 'rgba(255,255,255,0.45)', 70, 3);
    P.at(0.524, (x) => { c.fillStyle = '#4f8a7a'; c.beginPath(); c.ellipse(x, hz, 70 * u, 14 * u, 0, Math.PI, 0); c.fill(); rect(c, x - 4 * u, hz - 20 * u, 8 * u, 10 * u, '#f6f3ea'); poly(c, [x - 5 * u, hz - 20 * u, x + 5 * u, hz - 20 * u, x, hz - 26 * u], '#2f6fb5'); });
  });
  B.layer(MID, hz - 52 * u, rt, (P) => {
    const { c, k, emit } = P;
    // the pier on stilts with a café at its end
    P.at(0.468, (x) => {
      const y = hz + span * 0.12;
      rect(c, x - 120 * u, y - 6 * u, 200 * u, 4 * u, '#8a6a4a');
      for (let i = 0; i < 14; i++) rect(c, x - 118 * u + i * 14 * u, y - 2 * u, 2.5 * u, 10 * u, '#6a4a32');
      rect(c, x + 60 * u, y - 24 * u, 30 * u, 18 * u, '#f6f3ea'); poly(c, [x + 56 * u, y - 24 * u, x + 94 * u, y - 24 * u, x + 75 * u, y - 36 * u], '#2f8fd0');
      for (let i = 0; i < 4; i++) rect(c, x + 63 * u + i * 7 * u, y - 18 * u, 4 * u, 6 * u, '#36506a');
      rect(c, x + 74 * u, y - 48 * u, 1.4 * u, 12 * u, '#5b4a3a'); emit({ x: x + 75.4 * u, y: y - 48 * u, k: 'flag', a: 10, col: '#ff7a2f' });
    });
    P.place(2, (x, r) => sailboat(k, x, hz + span * (0.08 + r * 0.1), (0.7 + r * 0.3) * u, r > 0.5 ? '#c8432f' : '#2b4d7a'), 8);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w } = P;
    // the beach: sand, a wet strip with surf, huts, umbrellas, towels, surfboards and the lifeguard tower
    rect(c, 0, hz + span * 0.42, w, rt - hz, '#f0d9a0');
    rect(c, 0, hz + span * 0.42, w, 3 * u, 'rgba(255,255,255,0.75)'); rect(c, 0, hz + span * 0.42 + 3 * u, w, 4 * u, '#d9bd84');
    const y = hz + span * 0.82;
    P.place(9, (x, r, i) => {
      const cols = [['#e2337a', '#ffffff'], ['#2f8fd0', '#ffffff'], ['#ffd23f', '#ff7a2f'], ['#2fb58a', '#ffffff'], ['#ff5a3c', '#ffd23f']][i % 5];
      scaled(c, x, y, 1.45, () => {
      rect(c, x - 9 * u, y - 22 * u, 18 * u, 18 * u, cols[1]);
      for (let j = 0; j < 4; j++) rect(c, x - 9 * u + j * 4.5 * u, y - 22 * u, 2.2 * u, 18 * u, cols[0]);
      poly(c, [x - 11 * u, y - 22 * u, x + 11 * u, y - 22 * u, x, y - 30 * u], dark(cols[0], 0.1));
      rect(c, x - 3 * u, y - 13 * u, 6 * u, 9 * u, 'rgba(40,40,60,0.6)');
      rect(c, x - 11 * u, y - 4 * u, 22 * u, 2 * u, '#c9a46a');
      });
      void r;
    }, 3);
    P.place(8, (x, r, i) => {
      const uy = rt - (8 + r * 14) * u;
      scaled(c, x, uy, 1.5, () => {
      line(c, x, uy, x + 2 * u, uy - 22 * u, 1.2 * u, '#7a6a5a');
      const cl = ['#ff5a3c', '#2f8fd0', '#ffd23f', '#e2337a'][i % 4];
      c.fillStyle = cl; c.beginPath(); c.moveTo(x - 14 * u, uy - 16 * u); c.quadraticCurveTo(x + 2 * u, uy - 30 * u, x + 18 * u, uy - 18 * u); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x - 4 * u, uy - 20 * u); c.quadraticCurveTo(x + 2 * u, uy - 26 * u, x + 8 * u, uy - 21 * u); c.closePath(); c.fill();
      rect(c, x - 10 * u, uy + 1 * u, 18 * u, 4 * u, ['#2fb58a', '#ffffff', '#ff7a2f'][i % 3]);
      });
    }, 4);
    P.at(0.532, (x) => scaled(c, x, rt - 6 * u, 1.3, () => {
      // the lifeguard tower
      line(c, x - 10 * u, rt - 6 * u, x - 6 * u, rt - 36 * u, 2 * u, '#c9c0b0'); line(c, x + 10 * u, rt - 6 * u, x + 6 * u, rt - 36 * u, 2 * u, '#c9c0b0');
      rect(c, x - 14 * u, rt - 52 * u, 28 * u, 16 * u, '#d6202a'); rect(c, x - 10 * u, rt - 49 * u, 20 * u, 7 * u, '#36506a');
      poly(c, [x - 17 * u, rt - 52 * u, x + 17 * u, rt - 52 * u, x, rt - 60 * u], '#f6f3ea');
      P.text('LIFEGUARD', x - 13 * u, rt - 42 * u, 26 * u, 6 * u, '#ffffff', 6 * u);
    }));
    P.place(5, (x, r) => { const cl = ['#ff7a2f', '#2fb58a', '#ffd23f'][Math.floor(r * 3)]; c.fillStyle = cl; c.beginPath(); c.ellipse(x, rt - 26 * u, 4.5 * u, 18 * u, 0.15, 0, 7); c.fill(); rect(c, x - 0.6 * u, rt - 44 * u, 1.2 * u, 36 * u, 'rgba(255,255,255,0.6)'); }, 6);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 70 * u, rt + 1, (P) => {
    const { c, w, k } = P;
    // the sea wall and palms along the highway, with dune grass
    rect(c, 0, rt - 8 * u, w, 8 * u, '#e9e4d8'); rect(c, 0, rt - 8 * u, w, 1.4 * u, '#ffffff');
    P.place(5, (x, r) => palm(k, x, rt - 6 * u, (50 + r * 16) * u, 0.4 + r * 0.3), 13);
    P.place(12, (x) => { c.strokeStyle = '#8aa05a'; c.lineWidth = 1.2 * u; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(x, rt - 8 * u); c.lineTo(x + i * 3 * u, rt - 16 * u); } c.stroke(); }, 14);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 8 * u, w, 5 * u, '#cfc4ae');
    P.place(7, (x) => rect(c, x, rb + 8 * u, 5 * u, 22 * u, '#cfc4ae'));
  });
  B.live((L) => {
    gulls(L, 3, L.hz - 64 * L.u);
    for (let i = 0; i < 2; i++) boatMover(L, i * 7 + 1, L.hz + L.span * (0.16 + i * 0.12), 6 + i * 4, 0.03, (c, x, y) => sailboat({ c, u: L.u, rim: '', shadow: '' }, x, y, 0.8 * L.u, i ? '#e0532f' : '#2b4d7a'));
    // a kite flying over the beach
    const kx = drift(L.W * 0.3 - L.scroll * 0.22 + Math.sin(L.t * 0.4) * 30 * L.u, L.W * 2.6 * 0.5) - L.W * 0.2, ky = L.hz - 30 * L.u + Math.sin(L.t * 1.3) * 8 * L.u;
    poly(L.ctx, [kx, ky - 8 * L.u, kx + 6 * L.u, ky, kx, ky + 9 * L.u, kx - 6 * L.u, ky], '#e2337a');
    line(L.ctx, kx, ky + 9 * L.u, kx - 20 * L.u, L.hz + L.span * 0.7, 0.6 * L.u, 'rgba(40,40,40,0.5)');
  });
};

// ---- Neon Mile: the downtown street circuit at night — the Spire, the theatre marquee, neon signs, searchlights
const downtown: Build = (B) => {
  const { u, hz, rt, span, pal } = B;
  B.layer(FAR, hz - 118 * u, hz + 4, (P) => {
    skyline(P, hz + 4, 16, 40 * u, 110 * u, '#1a1438', ['rgba(255,226,170,0.5)', 'rgba(80,230,255,0.6)', 'rgba(255,80,170,0.7)'], 0.4, 21, true);
    haze(P, hz - 170 * u, hz + 4, '#6a1f6e', 0.05, 0.3);
  });
  B.layer(MID, hz - 150 * u, hz + span * 0.6, (P) => {
    const { c, k, emit } = P;
    // landmark: the Spire with its lit crown
    P.at(0.183, (x) => {
      poly(c, [x - 18 * u, hz + 4 * u, x + 18 * u, hz + 4 * u, x + 8 * u, hz - 130 * u, x - 8 * u, hz - 130 * u], '#241a4d');
      c.fillStyle = '#38e1ff'; for (let i = 0; i < 7; i++) c.fillRect(x - 6 * u + i * 0.5 * u, hz - 120 * u + i * 16 * u, 12 * u - i * u, 2 * u);
      rect(c, x - 0.8 * u, hz - 150 * u, 1.6 * u, 20 * u, '#241a4d');
      emit({ x, y: hz - 150 * u, k: 'beacon' });
      emit({ x: x - 60 * u, y: hz, k: 'search', a: 200, reach: 160 });
      emit({ x: x + 70 * u, y: hz, k: 'search', a: 200, col: 'rgba(255,160,230,0.09)', reach: 160 });
    });
    // the hotel with a vertical neon sign
    P.at(0.460, (x) => {
      tower(k, x, hz + 4 * u, 46 * u, 96 * u, '#1d1640', 77, ['rgba(255,226,170,0.6)'], 0.5);
      rect(c, x - 10 * u, hz - 80 * u, 10 * u, 52 * u, '#0a0818');
      for (let i = 0; i < 5; i++) P.text('HOTEL'[i], x - 10 * u, hz - 80 * u + i * 10 * u, 10 * u, 10 * u, '#ff3fa4', 9 * u);
      emit({ x: x - 10 * u, y: hz - 82 * u, k: 'neon', a: 10, b: 2, col: '#ff3fa4' });
    });
    // the theatre with its marquee and chasing bulbs
    P.at(0.825, (x) => {
      rect(c, x, hz - 50 * u, 110 * u, 54 * u, '#2a1d4a');
      rect(c, x + 10 * u, hz - 34 * u, 90 * u, 22 * u, '#ffd23f');
      rect(c, x + 12 * u, hz - 32 * u, 86 * u, 18 * u, '#141024');
      P.text('NEON MILE GP', x + 14 * u, hz - 32 * u, 82 * u, 18 * u, '#ffd23f', 12 * u);
      emit({ x: x + 10 * u, y: hz - 37 * u, k: 'chase', a: 90 });
      emit({ x: x + 10 * u, y: hz - 11 * u, k: 'chase', a: 90 });
      poly(c, [x + 40 * u, hz - 50 * u, x + 70 * u, hz - 50 * u, x + 55 * u, hz - 78 * u], '#2a1d4a');
      rect(c, x + 52 * u, hz - 74 * u, 6 * u, 20 * u, '#ff3fa4');
    });
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k, emit } = P;
    rect(c, 0, hz + span * 0.3, w, rt - hz, pal.ground);
    const neon = ['#ff3fa4', '#38e1ff', '#ffd23f', '#9b7bff'];
    const words = ['DINER', 'ARCADE', 'TACOS', 'RECORDS', 'NOODLES', 'CLUB', 'PIZZA', 'GARAGE'];
    P.place(8, (x, r, i) => {
      const bw = 70 * u, bh = (40 + r * 30) * u, y = rt - 2 * u;
      rect(c, x, y - bh, bw, bh, '#2a2050'); rect(c, x + bw - 2 * u, y - bh, 2 * u, bh, '#3a2e6a');
      windows(c, x + 4 * u, y - bh + 24 * u, bw - 8 * u, Math.max(6 * u, bh - 48 * u), 5, 2, i, ['rgba(255,226,170,0.75)', 'rgba(120,220,255,0.6)'], '#1a1434', 0.55);
      rect(c, x + 6 * u, y - bh * 0.42, bw - 12 * u, bh * 0.36, 'rgba(120,200,255,0.18)');
      const col = neon[i % 4];
      rect(c, x + 6 * u, y - bh + 4 * u, bw - 12 * u, 16 * u, '#07060f');
      c.strokeStyle = col; c.lineWidth = 1.2 * u; c.strokeRect(x + 7 * u, y - bh + 5 * u, bw - 14 * u, 14 * u);
      P.text(words[i % words.length], x + 8 * u, y - bh + 5 * u, bw - 16 * u, 14 * u, col, 11 * u);
      // a striped awning
      for (let j = 0; j < 8; j++) rect(c, x + 4 * u + j * ((bw - 8 * u) / 8), y - bh * 0.46, (bw - 8 * u) / 8, 5 * u, j % 2 ? col : '#f4f1ea');
      emit({ x: x + 10 * u, y: y - bh + 21 * u, k: 'neon', a: 50, b: 2, col });
    }, 22);
    P.place(6, (x) => { rect(c, x, rt - 56 * u, 2.5 * u, 54 * u, '#2c2f38'); ell(c, x + 6 * u, rt - 54 * u, 6 * u, 2 * u, '#ffe6a8'); ell(c, x + 6 * u, rt - 4 * u, 24 * u, 4 * u, 'rgba(255,214,140,0.18)'); }, 23);
    void k;
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 30 * u, rt + 1, (P) => {
    const { c, w } = P;
    // the street circuit's concrete barriers with sponsor boards, and a catch fence above
    rect(c, 0, rt - 12 * u, w, 12 * u, '#cfd2da'); rect(c, 0, rt - 12 * u, w, 1.4 * u, '#ffffff');
    const boards = [['#ff3fa4', '#ffffff'], ['#141024', '#38e1ff'], ['#ffd23f', '#141024']];
    for (let x = 0, i = 0; x < w; x += 60 * u, i++) { const b2 = boards[i % 3]; rect(c, x + 4 * u, rt - 10 * u, 52 * u, 8 * u, b2[0]); P.text(['NIGHT RUN', 'MILE 1', 'VOLT OIL'][i % 3], x + 4 * u, rt - 10 * u, 52 * u, 8 * u, b2[1], 7 * u); }
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(5, (x) => { rect(c, x, rb + 8 * u, 5 * u, 50 * u, pal.post); ell(c, x + 3 * u, rb + 4 * u, 40 * u, 8 * u, 'rgba(255,214,140,0.12)'); });
  });
};

// ---- Harbor Bridge: the suspension bridge at night — lit cables, a city across the dark water, tug lights
const bridge: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 90 * u, rt, (P) => {
    const { c, w } = P;
    water(P, hz, rt, '#0b1638', '#13244f', 'rgba(255,210,140,0.22)', 60, 5);
    skyline(P, hz + 2 * u, 22, 20 * u, 86 * u, '#141a3a', ['rgba(255,226,170,0.6)', 'rgba(120,200,255,0.6)'], 0.45, 9, true);
    // the city's lights reflected in the water
    c.fillStyle = 'rgba(255,210,140,0.18)'; for (let i = 0; i < 40; i++) c.fillRect(hash(i * 1.9) * w, hz + 3 * u + hash(i * 4.3) * span * 0.25, 2 * u, (4 + hash(i) * 10) * u);
  });
  B.layer(MID, hz - 150 * u, hz + span * 0.6, (P) => {
    const { c, w, emit } = P;
    // the twin-tower suspension bridge: towers, the deck, the main cables with lights and the hangers
    const y = hz + 4 * u, deck = hz - 8 * u;
    rect(c, 0, deck, w, 5 * u, '#2a2f55'); rect(c, 0, deck + 5 * u, w, 2 * u, '#ffd68c');
    const towers = [w * 0.25, w * 0.75];
    for (const tx of towers) {
      rect(c, tx - 9 * u, hz - 140 * u, 5 * u, y - hz + 140 * u, '#2f3566'); rect(c, tx + 4 * u, hz - 140 * u, 5 * u, y - hz + 140 * u, '#2f3566');
      for (const d of [136, 96, 50]) rect(c, tx - 9 * u, hz - d * u, 18 * u, 4 * u, '#2f3566');
      emit({ x: tx, y: hz - 142 * u, k: 'beacon' });
    }
    c.strokeStyle = '#ffd68c'; c.lineWidth = 1.6 * u; c.beginPath();
    const sag = (x0: number, x1: number, y0: number, y1: number) => { c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, deck + 20 * u, x1, y1); };
    sag(towers[0], towers[1], hz - 136 * u, hz - 136 * u);
    sag(towers[1], towers[0] + w, hz - 136 * u, hz - 136 * u);
    c.stroke();
    c.strokeStyle = 'rgba(255,214,140,0.45)'; c.lineWidth = 0.7 * u; c.beginPath();
    for (let x = 0; x < w; x += 10 * u) {
      // hanger from the cable down to the deck (cable height by position between the towers)
      const seg = x < towers[0] ? x + w - towers[1] : x - (x < towers[1] ? towers[0] : towers[1]);
      const p = seg / (towers[1] - towers[0]);
      const cy = (1 - p) * (1 - p) * (hz - 136 * u) + 2 * (1 - p) * p * (deck + 20 * u) + p * p * (hz - 136 * u);
      c.moveTo(x, cy); c.lineTo(x, deck);
    }
    c.stroke();
    c.fillStyle = '#fff2c0'; for (let x = 0; x < w; x += 18 * u) c.fillRect(x, deck - 1 * u, 1.6 * u, 1.6 * u);
    rect(c, 0, y - 2 * u, w, span * 0.6, '#0e1a40');
    c.fillStyle = 'rgba(255,214,140,0.25)'; for (let x = 0; x < w; x += 18 * u) c.fillRect(x, y + 2 * u, 1.6 * u, (6 + hash(x) * 10) * u);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // dark water far below the deck, with a moored ferry and a harbour light
    rect(c, 0, hz + span * 0.5, w, rt - hz, '#0a1430');
    c.fillStyle = 'rgba(120,170,255,0.12)'; for (let i = 0; i < 30; i++) c.fillRect(hash(i * 3.1) * w, hz + span * (0.55 + hash(i) * 0.4), (10 + hash(i * 2) * 24) * u, 1.2 * u);
    // wharves on pilings with lit warehouses, their lights trembling on the water
    P.place(4, (x, r, i) => {
      const y = hz + span * 0.62, bw = (70 + r * 50) * u;
      for (let px = x; px < x + bw; px += 8 * u) rect(c, px, y, 2 * u, 10 * u, '#1a2148');
      rect(c, x - 4 * u, y - 3 * u, bw + 8 * u, 4 * u, '#2a2f55');
      rect(c, x, y - 24 * u, bw * 0.6, 21 * u, '#1d2350'); poly(c, [x, y - 24 * u, x + bw * 0.3, y - 32 * u, x + bw * 0.6, y - 24 * u], '#1d2350');
      windows(c, x + 3 * u, y - 20 * u, bw * 0.6 - 6 * u, 12 * u, 6, 2, i * 5, ['#ffd98a', '#ffb86a'], '#141a3a', 0.5, 0.55);
      c.fillStyle = 'rgba(255,214,140,0.22)'; for (let j = 0; j < 5; j++) c.fillRect(x + hash(i * 7 + j) * bw * 0.6, y + 12 * u, 1.6 * u, (6 + hash(j + i) * 10) * u);
      rect(c, x + bw * 0.75, y - 30 * u, 2 * u, 27 * u, '#2a2f55'); disc(c, x + bw * 0.75 + 1 * u, y - 31 * u, 2.4 * u, '#7dff9a');
    }, 9);
    P.at(0.500, (x) => { rect(c, x, rt - 26 * u, 60 * u, 10 * u, '#e8e2d4'); rect(c, x + 6 * u, rt - 34 * u, 40 * u, 8 * u, '#e8e2d4'); windows(c, x + 8 * u, rt - 33 * u, 36 * u, 6 * u, 8, 1, 3, ['#ffd98a'], '#2a2f55', 0.8, 0.6); rect(c, x - 4 * u, rt - 18 * u, 68 * u, 4 * u, '#2a2f55'); });
    void k;
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 40 * u, rt + 1, (P) => {
    const { c, w, k } = P;
    // the bridge's own railing and lamp posts
    rect(c, 0, rt - 4 * u, w, 4 * u, '#3a4170');
    rect(c, 0, rt - 16 * u, w, 2.4 * u, '#5a63a0'); rect(c, 0, rt - 16 * u, w, 0.8 * u, '#9aa6e0');
    for (let x = 0; x < w; x += 6 * u) rect(c, x, rt - 14 * u, 1.2 * u, 10 * u, '#3a4170');
    P.place(5, (x) => { streetLamp(k, x, rt - 4 * u, 36 * u, '#3a4170', '#fff2c0'); ell(c, x + 8 * u, rt - 6 * u, 20 * u, 3 * u, 'rgba(255,214,140,0.25)'); }, 3);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 8 * u, w, 3 * u, '#2a2f55');
    P.place(5, (x) => rect(c, x, rb + 8 * u, 5 * u, 40 * u, '#1a1d3a'));
  });
  B.live((L) => {
    // tug and ferry lights moving on the water below
    for (let i = 0; i < 3; i++) boatMover(L, i * 3 + 2, L.hz + L.span * (0.22 + i * 0.1), (i % 2 ? -8 : 10), 0.1, (c, x, y) => {
      c.fillStyle = '#1a2148'; c.fillRect(x, y - 4 * L.u, 22 * L.u, 4 * L.u);
      c.fillStyle = i % 2 ? '#ff4a4a' : '#7dff9a'; c.fillRect(x + 20 * L.u, y - 6 * L.u, 2 * L.u, 2 * L.u);
      c.fillStyle = 'rgba(255,214,140,0.3)'; c.fillRect(x + 2 * L.u, y, 18 * L.u, 1.2 * L.u);
    });
  });
};
function streetLamp(k: Kit, x: number, yb: number, h: number, col: string, glow: string) {
  const { c, u } = k;
  rect(c, x - 1.2 * u, yb - h, 2.4 * u, h, col);
  rect(c, x, yb - h, 9 * u, 1.8 * u, col);
  ell(c, x + 8 * u, yb - h + 2.5 * u, 3 * u, 1.6 * u, glow);
}

// ---- Skyline Run (the Neon Skyline look): glass towers, the Halo Tower, a monorail, holo billboards, sound walls
const skylineRun: Build = (B) => {
  const { u, hz, rt, span, pal } = B;
  B.layer(FAR, hz - 190 * u, hz + 4, (P) => {
    const { c, k, emit } = P;
    P.place(14, (x, r, i) => {
      const bw = (30 + r * 34) * u, hh = (90 + hash(i * 7) * 100) * u;
      rect(c, x, hz - hh, bw, hh + 4, '#0d1630');
      c.fillStyle = 'rgba(120,200,255,0.10)'; for (let yy = hz - hh + 6 * u; yy < hz; yy += 7 * u) c.fillRect(x + 3 * u, yy, bw - 6 * u, 2 * u);
      const col = ['#ff2fb4', '#2ff3ff', '#b07bff', '#ffe14a'][i % 4];
      rect(c, x + (i % 2 ? 2 * u : bw - 4 * u), hz - hh, 2 * u, hh, col);
      if (r > 0.55) emit({ x: x + bw / 2, y: hz - hh - 4 * u, k: 'beacon' });
    }, 51);
    haze(P, hz - 190 * u, hz + 4, '#a0237a', 0.04, 0.3);
    void k;
  });
  B.layer(MID, hz - 150 * u, hz + span * 0.6, (P) => {
    const { c, w, k, emit } = P;
    P.at(0.540, (x) => {
      poly(c, [x - 16 * u, hz + 4 * u, x + 16 * u, hz + 4 * u, x + 6 * u, hz - 140 * u, x - 6 * u, hz - 140 * u], '#151a3a');
      c.strokeStyle = '#2ff3ff'; c.lineWidth = 3 * u; c.beginPath(); c.ellipse(x, hz - 110 * u, 26 * u, 7 * u, 0, 0, 7); c.stroke();
      c.strokeStyle = '#ff2fb4'; c.lineWidth = 2 * u; c.beginPath(); c.ellipse(x, hz - 80 * u, 20 * u, 5 * u, 0, 0, 7); c.stroke();
      emit({ x, y: hz - 144 * u, k: 'beacon' });
      emit({ x: x + 40 * u, y: hz, k: 'search', a: 220, col: 'rgba(47,243,255,0.08)', reach: 180 });
    });
    // glass mid-rise towers with lit grids
    P.place(6, (x, r, i) => { tower(k, x, hz + 4 * u, (34 + r * 20) * u, (50 + r * 50) * u, '#101a3a', i * 3 + 5, ['rgba(47,243,255,0.5)', 'rgba(255,47,180,0.5)', 'rgba(255,225,74,0.5)'], 0.35); }, 56);
    // the monorail beam on pylons
    rect(c, 0, hz - 32 * u, w, 5 * u, '#1b1f45'); rect(c, 0, hz - 32 * u, w, 1 * u, '#2ff3ff');
    for (let x = 0; x < w; x += 60 * u) poly(c, [x - 3 * u, hz + 4 * u, x + 3 * u, hz + 4 * u, x + 2 * u, hz - 27 * u, x - 2 * u, hz - 27 * u], '#1b1f45');
    // holo billboards
    P.place(4, (x, r, i) => {
      const col = ['#ff2fb4', '#2ff3ff', '#ffe14a', '#b07bff'][i % 4];
      const y = hz - (66 + r * 40) * u;
      rect(c, x, y, 54 * u, 26 * u, '#0a0a18');
      c.strokeStyle = col; c.lineWidth = 2 * u; c.strokeRect(x + 2 * u, y + 2 * u, 50 * u, 22 * u);
      P.text(['VOLT', 'HYPER', 'NOVA', 'ZEN'][i % 4], x + 4 * u, y + 4 * u, 46 * u, 18 * u, col, 14 * u);
      rect(c, x + 26 * u, y + 26 * u, 2 * u, 10 * u, '#1b1f45');
      emit({ x: x + 6 * u, y: y + 21 * u, k: 'neon', a: 42, b: 2, col });
    }, 53);
  }, MID_W, MID_W / 2.4);
  // the monorail train glides along its beam
  B.live((L) => {
    const { ctx, W, u: uu, t, scroll, hz: h } = L;
    const len = 150 * uu, span2 = W * 2.4;
    const x = drift(t * 60 * uu - scroll * MID, span2) - len - W * 0.2;
    if (x > W || x + len < 0) return;
    ctx.fillStyle = '#d8e6f2'; ctx.beginPath(); ctx.roundRect(x, h - 44 * uu, len, 12 * uu, 5 * uu); ctx.fill();
    ctx.fillStyle = '#20304a'; for (let i = 0; i < 12; i++) ctx.fillRect(x + 8 * uu + i * 11.5 * uu, h - 42 * uu, 7 * uu, 4 * uu);
    ctx.fillStyle = '#2ff3ff'; ctx.fillRect(x, h - 35 * uu, len, 1.4 * uu);
  });
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, emit } = P;
    rect(c, 0, hz + span * 0.3, w, rt - hz, pal.ground);
    c.strokeStyle = 'rgba(255,47,180,0.22)'; c.lineWidth = 1 * u;
    for (let x = 0; x < w; x += 24 * u) { c.beginPath(); c.moveTo(x, hz + span * 0.3); c.lineTo(x - 30 * u, rt); c.stroke(); }
    const neon = ['#ff2fb4', '#2ff3ff', '#ffe14a', '#b07bff'];
    P.place(7, (x, r, i) => {
      const bw = 64 * u, bh = (34 + r * 26) * u, y = rt - 2 * u;
      rect(c, x, y - bh, bw, bh, '#16183a');
      windows(c, x + 4 * u, y - bh + 14 * u, bw - 8 * u, bh * 0.4, 6, 3, i * 7, ['rgba(47,243,255,0.55)', 'rgba(255,47,180,0.5)'], '#0e0f26', 0.45, 0.55);
      rect(c, x + 5 * u, y - bh * 0.42, bw - 10 * u, bh * 0.34, 'rgba(47,243,255,0.18)');
      const col = neon[i % 4];
      rect(c, x + 8 * u, y - bh + 8 * u, bw - 16 * u, 3 * u, col);
      emit({ x: x + 8 * u, y: y - bh + 8 * u, k: 'neon', a: 48, b: 3, col });
    }, 54);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 30 * u, rt + 1, (P) => {
    const { c, w } = P;
    // the expressway's sound wall with a neon strip and reflective markers
    rect(c, 0, rt - 14 * u, w, 14 * u, '#1a1c30');
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < w; x += 20 * u) c.fillRect(x, rt - 14 * u, 1.4 * u, 14 * u);
    rect(c, 0, rt - 14 * u, w, 2 * u, '#ff2fb4');
    for (let x = 0; x < w; x += 30 * u) rect(c, x, rt - 9 * u, 4 * u, 2 * u, '#ffe14a');
    rect(c, 0, rt - 3 * u, w, 1.5 * u, '#2ff3ff');
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 8 * u, w, 2 * u, '#ff2fb4');
    P.place(6, (x) => { rect(c, x, rb + 8 * u, 5 * u, 44 * u, pal.post); rect(c, x, rb + 8 * u, 5 * u, 4 * u, '#2ff3ff'); });
  });
};

// ---- Desert: shared ground and props
function desertVerge(B: RecipeBuilder, P: Paint, post: string, tape: string) {
  const { c, w } = P;
  const { u, rt } = B;
  for (let x = 0; x < w; x += 40 * u) rect(c, x, rt - 14 * u, 3 * u, 14 * u, post);
  rect(c, 0, rt - 11 * u, w, 1.5 * u, tape);
  rect(c, 0, rt - 6 * u, w, 1.5 * u, tape);
}

// ---- Dune Wash: golden dunes and a rally camp — service tents, the start arch, spectators on the crests
const dunes: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 42 * u, hz + 2, (P) => {
    const { c, w } = P;
    ridge(c, w, hz + 2, 50 * u, 150 * u, 6, '#e3a868');
    ridge(c, w, hz + 2, 30 * u, 110 * u, 2, '#d0905a');
    haze(P, hz - 70 * u, hz + 2, '#ffe2a8', 0.15, 0.4);
  });
  const g = hz + span * 0.4;
  B.layer(MID, hz - 52 * u, hz + span * 0.6, (P) => {
    const { c, w, k, emit } = P;
    // big dunes with a sharp crest: lit windward side, shaded lee
    P.place(4, (x, r) => {
      const hw = (90 + r * 60) * u, hh = (34 + r * 24) * u;
      poly(c, [x - hw, g, x + hw * 0.1, g - hh, x + hw, g], '#e9b06a');
      poly(c, [x + hw * 0.1, g - hh, x + hw, g, x + hw * 0.3, g], '#c98648');
      c.strokeStyle = 'rgba(255,240,200,0.5)'; c.lineWidth = 1 * u; c.beginPath(); c.moveTo(x - hw * 0.6, g - hh * 0.3); c.lineTo(x + hw * 0.1, g - hh); c.stroke();
    }, 3);
    rect(c, 0, g - 1, w, hz + span * 0.6 - g + 1, '#e2a564');
    // the rally camp: service tents, a support truck, team flags
    P.at(0.250, (x) => {
      tent(k, x - 60 * u, g + 2 * u, 40 * u, 26 * u, '#d6202a', '#f4f1ea');
      tent(k, x - 14 * u, g + 2 * u, 36 * u, 24 * u, '#2f6fb5', '#f4f1ea');
      // the support truck
      rect(c, x + 30 * u, g - 22 * u, 46 * u, 20 * u, '#f4f1ea'); rect(c, x + 76 * u, g - 16 * u, 16 * u, 14 * u, '#d6202a'); rect(c, x + 80 * u, g - 14 * u, 9 * u, 6 * u, '#36506a');
      rect(c, x + 32 * u, g - 16 * u, 42 * u, 5 * u, '#d6202a');
      tyre(c, x + 40 * u, g - 2 * u, 4.5 * u); tyre(c, x + 84 * u, g - 2 * u, 4.5 * u);
      for (const [fx, col] of [[-80, '#ffd23f'], [100, '#2f6fb5'], [116, '#d6202a']] as const) { rect(c, x + fx * u, g - 40 * u, 1.4 * u, 40 * u, '#4a3a2a'); emit({ x: x + fx * u + 1.4 * u, y: g - 40 * u, k: 'flag', a: 12, col }); }
    });
    // the stage start arch
    P.at(0.790, (x) => bannerArch(k, x, g + 2 * u, 120 * u, 56 * u, '#d6202a', 'DUNE WASH RALLY', '#ffffff', (t, tx, ty, tw, th, col) => P.text(t, tx, ty, tw, th, col, 11 * u)));
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // sand with ripples, spectators on a crest, hay bales and tufts
    c.fillStyle = '#f0bd78'; c.beginPath(); c.moveTo(0, rt);
    for (let i = 0, n = Math.ceil(w / (24 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, hz + span * (0.5 + 0.12 * Math.sin((x / w) * Math.PI * 10))); }
    c.lineTo(w, rt); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(180,110,50,0.25)'; c.lineWidth = 1 * u;
    for (let i = 0; i < 30; i++) { const y = hz + span * (0.62 + hash(i) * 0.34), x = hash(i * 3) * w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10 * u, y - 2 * u, x + 22 * u, y); c.stroke(); }
    P.place(5, (x) => {
      // spectators in team colours on a sand crest
      for (let i = 0; i < 9; i++) { const sx = x + i * 5 * u, sy = hz + span * 0.62 + (i % 3) * 2 * u; rect(c, sx, sy - 6 * u, 3.6 * u, 6 * u, ['#d6202a', '#2f6fb5', '#ffd23f', '#f4f1ea', '#2fb58a'][i % 5]); rect(c, sx + 0.6 * u, sy - 9 * u, 2.4 * u, 2.4 * u, '#f0d2b0'); }
    }, 5);
    P.place(6, (x, r) => bush(k, x, rt - (8 + r * 12) * u, (0.9 + r * 0.5) * u, '#8a8a3a'), 6);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 20 * u, rt + 1, (P) => {
    const { c } = P;
    desertVerge(B, P, '#8a5a34', '#ff7a1a');
    P.place(5, (x) => { for (let i = 0; i < 3; i++) { rect(c, x + i * 13 * u, rt - 10 * u, 12 * u, 9 * u, '#e8c25a'); rect(c, x + i * 13 * u, rt - 7 * u, 12 * u, 1 * u, '#c9a03a'); } rect(c, x + 6 * u, rt - 19 * u, 12 * u, 9 * u, '#e8c25a'); }, 71);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(8, (x, r) => ell(c, x, rb + 22 * u, (14 + r * 16) * u, (6 + r * 6) * u, '#a8643a'));
  });
  B.live((L) => {
    // the TV helicopter hovering over the stage
    if (L.light) return;
    const { ctx, W, u: uu, t, scroll } = L;
    const x = drift(W * 0.7 - scroll * 0.06 + Math.sin(t * 0.3) * 40 * uu, W * 1.6) - W * 0.3, y = L.hz - 70 * uu + Math.sin(t * 0.8) * 6 * uu;
    ctx.fillStyle = '#26334a'; ctx.beginPath(); ctx.ellipse(x, y, 11 * uu, 6 * uu, 0, 0, 7); ctx.fill();
    ctx.fillRect(x + 8 * uu, y - 2 * uu, 18 * uu, 2.4 * uu); ctx.fillRect(x + 24 * uu, y - 6 * uu, 2 * uu, 6 * uu);
    ctx.fillStyle = '#9fd0ff'; ctx.fillRect(x - 8 * uu, y - 3 * uu, 6 * uu, 3 * uu);
    const s = Math.abs(Math.sin(t * 30)) * 20 * uu;
    ctx.fillStyle = 'rgba(30,30,40,0.6)'; ctx.fillRect(x - s, y - 9 * uu, s * 2, 1.4 * uu);
    ctx.fillRect(x - 6 * uu, y + 6 * uu, 14 * uu, 1.2 * uu);
  });
};

// ---- Red Canyon Stage: towering striped canyon walls, the rock arch, hoodoos and juniper scrub
const canyon: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 82 * u, hz + 2, (P) => {
    const { c, w } = P;
    ridge(c, w, hz + 2, 80 * u, 120 * u, 9, '#b56a6a', true);
    c.fillStyle = 'rgba(80,30,40,0.18)'; for (let i = 1; i < 5; i++) c.fillRect(0, hz - i * 16 * u, w, 3 * u);
    haze(P, hz - 100 * u, hz + 2, '#ffc98f', 0.2, 0.4);
  });
  B.layer(MID, hz - 108 * u, hz + span * 0.5, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz - 2 * u, w, span * 0.5 + 2 * u, '#b04a28');
    // canyon walls: stepped red cliffs with bright strata, cut by a deep shadowed gorge
    P.place(3, (x, r) => {
      const bw = (110 + r * 90) * u, hh = (70 + r * 50) * u;
      mesa(k, x, hz + 2 * u, bw, hh, '#a8401f', '#e0703a');
      c.fillStyle = 'rgba(255,220,170,0.25)'; for (let i = 1; i < 6; i++) c.fillRect(x - bw / 2 - i * 2 * u, hz - hh + i * hh * 0.16, bw + i * 4 * u, 1.6 * u);
      c.fillStyle = 'rgba(60,20,20,0.35)'; c.fillRect(x - bw * 0.2, hz - hh * 0.8, 6 * u, hh * 0.8);
    }, 14);
    // landmark: the natural rock arch
    P.at(0.500, (x) => {
      c.fillStyle = '#d9663a';
      c.beginPath(); c.moveTo(x - 60 * u, hz + 2 * u); c.lineTo(x - 52 * u, hz - 70 * u); c.quadraticCurveTo(x, hz - 100 * u, x + 54 * u, hz - 66 * u); c.lineTo(x + 62 * u, hz + 2 * u);
      c.lineTo(x + 36 * u, hz + 2 * u); c.quadraticCurveTo(x + 32 * u, hz - 50 * u, x, hz - 54 * u); c.quadraticCurveTo(x - 30 * u, hz - 50 * u, x - 34 * u, hz + 2 * u); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,220,170,0.35)'; c.fillRect(x - 52 * u, hz - 72 * u, 50 * u, 3 * u);
      c.fillStyle = 'rgba(90,30,20,0.3)'; c.fillRect(x + 36 * u, hz - 60 * u, 18 * u, 62 * u);
    });
    P.place(5, (x, r) => hoodoo(k, x, hz + span * 0.3, (1 + r * 0.6) * u, '#c9582e'), 16);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.4, w, rt - hz, '#c4602f');
    c.fillStyle = 'rgba(255,220,170,0.22)'; for (let i = 0; i < 30; i++) c.fillRect(hash(i * 2.1) * w, hz + span * (0.45 + hash(i) * 0.5), 20 * u, 1.5 * u);
    // tumbled boulders with lit tops, juniper and sage, a stage marker
    P.place(9, (x, r) => { const s = (8 + r * 12) * u; ell(c, x, rt - s * 0.5 - 4 * u, s, s * 0.6, '#9a3e22'); ell(c, x + s * 0.2, rt - s * 0.75 - 4 * u, s * 0.6, s * 0.25, '#e0804a'); }, 17);
    P.place(8, (x, r) => bush(k, x, rt - (12 + r * 18) * u, (1.1 + r * 0.5) * u, '#5a7a3a'), 18);
    P.place(4, (x, r) => hoodoo(k, x, rt - 10 * u, (1.3 + r * 0.6) * u, '#b8502a'), 19);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 22 * u, rt + 1, (P) => {
    const { c } = P;
    desertVerge(B, P, '#6a4024', '#e8e2d4');
    P.place(6, (x, r) => { ell(c, x, rt - 4 * u, (8 + r * 8) * u, (4 + r * 3) * u, '#8a3a1e'); ell(c, x + 2 * u, rt - 6 * u, (4 + r * 4) * u, 1.5 * u, '#d9703a'); }, 72);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(8, (x, r) => ell(c, x, rb + 22 * u, (14 + r * 16) * u, (6 + r * 6) * u, '#7a2e18'));
  });
  B.live((L) => {
    // a hawk circling over the canyon, and a dust devil on the flats
    const { ctx, W, u: uu, t, scroll } = L;
    const cx = drift(W * 0.4 - scroll * 0.05, W * 1.4) - W * 0.2 + Math.cos(t * 0.5) * 40 * uu, cy = L.hz - 90 * uu + Math.sin(t * 0.5) * 14 * uu;
    ctx.strokeStyle = 'rgba(40,20,20,0.75)'; ctx.lineWidth = 1.8 * uu;
    ctx.beginPath(); ctx.moveTo(cx - 9 * uu, cy - 2 * uu); ctx.quadraticCurveTo(cx - 4 * uu, cy - 4 * uu, cx, cy); ctx.quadraticCurveTo(cx + 4 * uu, cy - 4 * uu, cx + 9 * uu, cy - 2 * uu); ctx.stroke();
    const x = drift(W * 0.3 + t * 10 * uu - scroll * 0.3, W * 1.6) - W * 0.3, y = L.hz + L.span * 0.7;
    ctx.fillStyle = 'rgba(240,180,130,0.22)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 3 + i) * 4 * uu, y - i * 9 * uu, (5 + i * 4) * uu, 3 * uu, 0, 0, 7); ctx.fill(); }
  });
};

// ---- Mesa Speed Trap: a white salt flat at noon — the timing tower, distant mesas in the mirage, a freight train
const mesaFlats: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 55 * u, hz + 6 * u, (P) => {
    const { c, w, k } = P;
    P.place(5, (x, r) => mesa(k, x, hz + 2 * u, (70 + r * 80) * u, (24 + r * 30) * u, '#a77a8a', '#c99aa0'), 3);
    // the mirage: a pale band that swallows the mesas' feet
    const g = c.createLinearGradient(0, hz - 10 * u, 0, hz + 6 * u);
    g.addColorStop(0, 'rgba(244,234,216,0)'); g.addColorStop(1, 'rgba(244,234,216,1)');
    c.fillStyle = g; c.fillRect(0, hz - 10 * u, w, 16 * u);
    haze(P, hz - 70 * u, hz + 6 * u, '#f4ead8', 0.3, 0.5);
  });
  B.layer(MID, hz - 130 * u, hz + span * 0.5, (P) => {
    const { c, w, emit } = P;
    rect(c, 0, hz, w, span * 0.5, '#efe6d6');
    // a railway embankment along the far side of the flat
    rect(c, 0, hz + 2 * u, w, 3 * u, '#bfae96'); rect(c, 0, hz + 1 * u, w, 1 * u, '#6a5a4a');
    // landmark: the speed-trap timing tower with a radar dish and a big board
    P.at(0.250, (x) => {
      rect(c, x - 4 * u, hz - 86 * u, 8 * u, 92 * u, '#e8e2d4'); rect(c, x + 2 * u, hz - 86 * u, 2 * u, 92 * u, '#ffffff');
      rect(c, x - 16 * u, hz - 104 * u, 32 * u, 18 * u, '#2f3a4a'); rect(c, x - 14 * u, hz - 101 * u, 28 * u, 8 * u, '#7fd0ff');
      c.strokeStyle = '#e8e2d4'; c.lineWidth = 2 * u; c.beginPath(); c.arc(x + 12 * u, hz - 112 * u, 9 * u, Math.PI * 0.9, Math.PI * 1.9); c.stroke();
      emit({ x, y: hz - 106 * u, k: 'beacon', a: 4 });
      rect(c, x + 20 * u, hz - 56 * u, 70 * u, 26 * u, '#d6202a'); rect(c, x + 22 * u, hz - 54 * u, 66 * u, 22 * u, '#f4f1ea');
      P.text('SPEED TRAP', x + 24 * u, hz - 54 * u, 62 * u, 22 * u, '#d6202a', 12 * u);
      rect(c, x + 30 * u, hz - 30 * u, 2 * u, 34 * u, '#5a5048'); rect(c, x + 78 * u, hz - 30 * u, 2 * u, 34 * u, '#5a5048');
    });
    // an old windmill pump and a water tank
    P.at(0.734, (x) => {
      line(c, x - 8 * u, hz + 2 * u, x, hz - 60 * u, 1.6 * u, '#6a5a4a'); line(c, x + 8 * u, hz + 2 * u, x, hz - 60 * u, 1.6 * u, '#6a5a4a');
      emit({ x, y: hz - 60 * u, k: 'rotor', a: 13, b: 12, col: '#6a5a4a' });
      rect(c, x + 16 * u, hz - 20 * u, 22 * u, 16 * u, '#a5a9ad'); rect(c, x + 16 * u, hz - 20 * u, 22 * u, 2 * u, '#d6dadd');
      line(c, x + 18 * u, hz - 4 * u, x + 18 * u, hz + 2 * u, 1.6 * u, '#6a5a4a'); line(c, x + 36 * u, hz - 4 * u, x + 36 * u, hz + 2 * u, 1.6 * u, '#6a5a4a');
    });
    emit({ x: w * 0.2, y: hz + 6 * u, k: 'heat', a: 140 }); emit({ x: w * 0.65, y: hz + 9 * u, k: 'heat', a: 160 });
  }, MID_W, MID_W / 2.4);
  B.live((L) => train(L, L.hz + 2 * L.u, MID, 28, 9, '#d6452a', ['#4f6f9c', '#b8862e', '#8a4d3a', '#5a7a5a'], 0.55));
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // the salt crust: white with hexagonal crack lines, timing cones and a parked support truck
    rect(c, 0, hz + span * 0.4, w, rt - hz, '#f4ede0');
    c.strokeStyle = 'rgba(170,150,120,0.35)'; c.lineWidth = 0.8 * u; c.beginPath();
    for (let row = 0; row < 6; row++) {
      const y = hz + span * (0.45 + row * 0.1), cw = (16 + row * 6) * u;
      for (let x = (row % 2) * cw * 0.5; x < w; x += cw) { c.moveTo(x, y); c.lineTo(x + cw * 0.5, y + 3 * u); c.lineTo(x + cw, y); c.moveTo(x + cw * 0.5, y + 3 * u); c.lineTo(x + cw * 0.5, y + span * 0.1); }
    }
    c.stroke();
    P.at(0.532, (x) => scaled(c, x, rt - 6 * u, 1.45, () => {
      rect(c, x, rt - 26 * u, 40 * u, 16 * u, '#2f6fb5'); rect(c, x + 40 * u, rt - 22 * u, 14 * u, 12 * u, '#2f6fb5'); rect(c, x + 43 * u, rt - 20 * u, 8 * u, 5 * u, '#9fd0ff');
      rect(c, x + 2 * u, rt - 22 * u, 36 * u, 3 * u, '#f4f1ea'); tyre(c, x + 10 * u, rt - 9 * u, 4 * u); tyre(c, x + 46 * u, rt - 9 * u, 4 * u);
      tent(k, x - 40 * u, rt - 8 * u, 28 * u, 20 * u, '#d6202a', '#f4f1ea');
    }));
    P.place(10, (x, r) => scaled(c, x, rt - (8 + r * 20) * u, 2, () => { poly(c, [x - 3 * u, rt - (8 + r * 20) * u, x + 3 * u, rt - (8 + r * 20) * u, x, rt - (18 + r * 20) * u], '#ff6a1a'); rect(c, x - 1.6 * u, rt - (13 + r * 20) * u, 3.2 * u, 1.4 * u, '#ffffff'); }), 6);
    // chequered timing flags on poles
    P.place(4, (x) => { rect(c, x, rt - 50 * u, 1.6 * u, 44 * u, '#5a5048'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rect(c, x + 1.6 * u + i * 4 * u, rt - 50 * u + j * 4 * u, 4 * u, 4 * u, (i + j) % 2 ? '#111111' : '#f4f1ea'); }, 7);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 22 * u, rt + 1, (P) => {
    const { c } = P;
    // kilometre posts and timing beacons along the salt
    P.place(6, (x, r, i) => { rect(c, x, rt - 18 * u, 3 * u, 18 * u, '#f4f1ea'); rect(c, x, rt - 18 * u, 3 * u, 5 * u, i % 2 ? '#d6202a' : '#2f6fb5'); void r; }, 73);
    P.place(3, (x) => { rect(c, x - 6 * u, rt - 14 * u, 12 * u, 14 * u, '#2f3a4a'); rect(c, x - 4 * u, rt - 12 * u, 8 * u, 4 * u, '#ff3b3b'); }, 74);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(8, (x, r) => ell(c, x, rb + 22 * u, (14 + r * 16) * u, (4 + r * 4) * u, '#cfc4ae'));
  });
};

// ---- Airfield Sprint: hangars, the control tower, parked aircraft, runway lights, and a plane taking off
const airstrip: Build = (B) => {
  const { u, hz, rt, span } = B;
  B.layer(FAR, hz - 34 * u, hz + 2, (P) => {
    ridge(P.c, P.w, hz + 2, 40 * u, 160 * u, 6, '#c9a08a');
    haze(P, hz - 60 * u, hz + 2, '#f3e2c0', 0.2, 0.4);
  });
  B.layer(MID, hz - 124 * u, hz + span * 0.5, (P) => {
    const { c, w, emit } = P;
    rect(c, 0, hz - 2 * u, w, span * 0.5 + 2 * u, '#b9a886');
    P.at(0.290, (x) => {
      for (const [dx, hw] of [[-70, 54], [20, 44]] as const) {
        c.fillStyle = '#c9c2b4'; c.beginPath(); c.moveTo(x + (dx - hw) * u, hz + 2 * u); c.quadraticCurveTo(x + dx * u, hz - hw * 1.3 * u, x + (dx + hw) * u, hz + 2 * u); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,240,210,0.5)'; c.beginPath(); c.moveTo(x + dx * u, hz - hw * 0.65 * u); c.quadraticCurveTo(x + (dx + hw * 0.6) * u, hz - hw * 0.5 * u, x + (dx + hw) * u, hz + 2 * u); c.lineTo(x + (dx + hw - 4) * u, hz + 2 * u); c.quadraticCurveTo(x + (dx + hw * 0.5) * u, hz - hw * 0.45 * u, x + dx * u, hz - hw * 0.58 * u); c.fill();
        c.fillStyle = '#3b3a40'; c.fillRect(x + (dx - hw * 0.45) * u, hz - hw * 0.42 * u, hw * 0.9 * u, hw * 0.44 * u);
        c.fillStyle = '#9a9286'; for (let i = -2; i <= 2; i++) c.fillRect(x + (dx + i * hw * 0.3) * u, hz - hw * 0.62 * u, 1.5 * u, hw * 0.2 * u);
      }
      // a plane nosed into the open hangar
      rect(c, x - 90 * u, hz - 10 * u, 40 * u, 5 * u, '#e8e4dc'); poly(c, [x - 52 * u, hz - 10 * u, x - 46 * u, hz - 22 * u, x - 44 * u, hz - 10 * u], '#d6202a');
      rect(c, x - 150 * u, hz - 30 * u, 2 * u, 32 * u, '#5b5348'); rect(c, x - 92 * u, hz - 30 * u, 2 * u, 32 * u, '#5b5348');
      rect(c, x - 156 * u, hz - 44 * u, 72 * u, 16 * u, '#1b1b1f'); P.text('RUNWAY 27', x - 154 * u, hz - 44 * u, 68 * u, 16 * u, '#ffd23f', 11 * u);
    });
    P.at(0.734, (x) => {
      c.fillStyle = '#e8e2d4'; c.fillRect(x - 7 * u, hz - 92 * u, 14 * u, 94 * u);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x + 4 * u, hz - 92 * u, 3 * u, 94 * u);
      c.fillStyle = '#d6cfbf'; c.fillRect(x - 16 * u, hz - 104 * u, 32 * u, 12 * u);
      c.fillStyle = '#2f7a6a'; c.fillRect(x - 15 * u, hz - 103 * u, 30 * u, 8 * u);
      c.fillStyle = '#5b5348'; c.fillRect(x - 18 * u, hz - 107 * u, 36 * u, 3 * u); c.fillRect(x - 1 * u, hz - 116 * u, 2 * u, 9 * u);
      emit({ x, y: hz - 117 * u, k: 'beacon', a: 4, col: '#3dff7a' });
      // fuel tanks
      for (let i = 0; i < 2; i++) { rect(c, x + 30 * u + i * 26 * u, hz - 18 * u, 22 * u, 20 * u, '#e8e2d4'); ell(c, x + 41 * u + i * 26 * u, hz - 18 * u, 11 * u, 3 * u, '#f6f3ea'); rect(c, x + 30 * u + i * 26 * u, hz - 10 * u, 22 * u, 3 * u, '#d6202a'); }
    });
  }, MID_W, MID_W / 2.4);
  B.live((L) => {
    // a light aircraft climbing out over the field
    if (L.light) return;
    const { ctx, W, u: uu, t } = L;
    const p = drift(t / 14, 1), x = -60 * uu + p * (W + 120 * uu), y = L.hz - 10 * uu - p * 120 * uu;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(0, 0, 16 * uu, 3.2 * uu, 0, 0, 7); ctx.fill();
    ctx.fillRect(-4 * uu, -6 * uu, 10 * uu, 2 * uu);
    ctx.fillStyle = '#d6202a'; ctx.beginPath(); ctx.moveTo(-14 * uu, -1 * uu); ctx.lineTo(-18 * uu, -8 * uu); ctx.lineTo(-11 * uu, -1 * uu); ctx.fill();
    ctx.restore();
  });
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k, emit } = P;
    // the apron: concrete with taxi lines, parked prop planes, a fuel truck and edge lights
    rect(c, 0, hz + span * 0.4, w, rt - hz, '#a59f92');
    rect(c, 0, hz + span * 0.4, w, 3 * u, '#7a9a5a');
    rect(c, 0, hz + span * 0.7, w, 2 * u, '#ffd23f');
    const plane = (x: number, y: number, s: number, body: string, stripe: string) => {
      ell(c, x, y, 30 * s, 6 * s, body); rect(c, x - 34 * s, y - 12 * s, 56 * s, 3 * s, body);
      poly(c, [x + 22 * s, y - 2 * s, x + 34 * s, y - 16 * s, x + 36 * s, y - 2 * s], stripe);
      rect(c, x - 26 * s, y - 1 * s, 50 * s, 1.6 * s, stripe);
      rect(c, x - 20 * s, y - 4 * s, 12 * s, 3 * s, '#26334a');
      disc(c, x - 10 * s, y + 8 * s, 3 * s, '#2c2f38'); disc(c, x + 8 * s, y + 8 * s, 3 * s, '#2c2f38');
      rect(c, x - 31 * s, y - 2 * s, 2 * s, 8 * s, '#3a3a3a');
    };
    P.place(3, (x, r, i) => plane(x, rt - 22 * u - r * 8 * u, (0.9 + r * 0.3) * u, '#f4f1ea', ['#d6202a', '#2f6fb5', '#ffd23f'][i % 3]), 157);
    P.at(0.500, (x) => {
      // the windsock and a fuel bowser
      rect(c, x, rt - 74 * u, 2 * u, 62 * u, '#6a6d75');
      poly(c, [x + 2 * u, rt - 74 * u, x + 34 * u, rt - 70 * u, x + 34 * u, rt - 64 * u, x + 2 * u, rt - 66 * u], '#ff7a2f');
      rect(c, x + 12 * u, rt - 72.5 * u, 6 * u, 7 * u, '#ffffff');
      rect(c, x + 60 * u, rt - 22 * u, 40 * u, 14 * u, '#e8e2d4'); rect(c, x + 100 * u, rt - 18 * u, 12 * u, 10 * u, '#d6202a'); rect(c, x + 62 * u, rt - 18 * u, 36 * u, 3 * u, '#d6202a');
      tyre(c, x + 70 * u, rt - 7 * u, 3.5 * u); tyre(c, x + 104 * u, rt - 7 * u, 3.5 * u);
    });
    P.place(8, (x) => { rect(c, x - 1 * u, rt - 16 * u, 2 * u, 6 * u, '#4a4d55'); disc(c, x, rt - 17 * u, 2.4 * u, '#2f7aff'); emit({ x, y: rt - 17 * u, k: 'blink', col: '#9fd0ff', a: 6 }); }, 156);
    void k;
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 20 * u, rt + 1, (P) => {
    const { c } = P;
    desertVerge(B, P, '#6a6d75', '#ffd23f');
    P.place(3, (x) => { rect(c, x, rt - 20 * u, 26 * u, 12 * u, '#1b1b1f'); P.text('27 ›', x, rt - 20 * u, 26 * u, 12 * u, '#ffd23f', 9 * u); rect(c, x + 12 * u, rt - 8 * u, 2 * u, 8 * u, '#4a4d55'); }, 75);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c } = P;
    const { rb } = B;
    P.place(5, (x) => { rect(c, x, rb + 6 * u, 4 * u, 30 * u, '#4a4d55'); rect(c, x, rb + 6 * u, 4 * u, 6 * u, '#e63b2e'); });
  });
};

// ---- Summit: shared alpine pieces
function alpsFar(B: RecipeBuilder, back: string, front: string, snow: string, seed: number, hazeCol: string) {
  const { u, hz } = B;
  B.layer(FAR, hz - 144 * u, hz + 2, (P) => {
    const { k } = P;
    // two rows of peaks: a pale back range and a bolder front range, each with lit faces and snow caps
    P.place(5, (x, r) => peak(k, x, hz + 2, (150 + r * 90) * u, (100 + r * 40) * u, back, snow, 0.42), seed);
    P.place(4, (x, r) => peak(k, x, hz + 2, (130 + r * 70) * u, (60 + r * 40) * u, front, snow, 0.3), seed + 5);
    haze(P, hz - 150 * u, hz + 2, hazeCol, 0.16, 0.42);
  });
}

// ---- Glacier Pass: an icy morning — jagged peaks, a glacier tongue with crevasses, a stone refuge, snow galleries
const pass: Build = (B) => {
  const { u, hz, rt, span } = B;
  alpsFar(B, '#8fa8d0', '#6f8cbc', '#f4f8ff', 3, '#e8f7ff');
  const g = hz + span * 0.45;
  B.layer(MID, hz - 92 * u, hz + span * 0.6, (P) => {
    const { c, w, k, emit } = P;
    // a nearer range of dark rock peaks
    P.place(5, (x, r) => peak(k, x, g, (110 + r * 60) * u, (60 + r * 30) * u, '#4f6a98', '#eef5ff', 0.34), 13);
    // landmark: the glacier — two dark horns with an ice tongue spilling from the saddle between them
    P.at(0.508, (x) => {
      peak(k, x - 70 * u, g, 120 * u, 104 * u, '#44597f', '#f4f8ff', 0.3);
      peak(k, x + 74 * u, g, 130 * u, 96 * u, '#4a6088', '#f4f8ff', 0.32);
      c.fillStyle = '#cfeaf8'; c.beginPath();
      c.moveTo(x - 12 * u, g - 66 * u); c.quadraticCurveTo(x - 34 * u, g - 30 * u, x - 64 * u, g + 1 * u); c.lineTo(x + 66 * u, g + 1 * u); c.quadraticCurveTo(x + 30 * u, g - 30 * u, x + 14 * u, g - 66 * u); c.closePath(); c.fill();
      c.fillStyle = '#a6d6ee'; c.beginPath();
      c.moveTo(x + 4 * u, g - 66 * u); c.quadraticCurveTo(x + 22 * u, g - 30 * u, x + 66 * u, g + 1 * u); c.lineTo(x + 30 * u, g + 1 * u); c.quadraticCurveTo(x + 10 * u, g - 30 * u, x + 4 * u, g - 66 * u); c.fill();
      // crevasses and the dark moraine stripe down its middle
      c.strokeStyle = 'rgba(40,100,150,0.5)'; c.lineWidth = 1 * u; c.beginPath();
      for (let i = 0; i < 8; i++) { const yy = g - 56 * u + i * 7 * u, ww = (12 + i * 6) * u; c.moveTo(x - ww * 0.8, yy); c.quadraticCurveTo(x, yy + 4 * u, x + ww * 0.8, yy); }
      c.stroke();
      line(c, x + 2 * u, g - 60 * u, x + 4 * u, g, 1.6 * u, 'rgba(90,90,110,0.45)');
      // the stone refuge on the moraine with its flag
      const rx = x + 150 * u, ry = g + 1 * u;
      rect(c, rx, ry - 16 * u, 30 * u, 16 * u, '#8a8a90'); poly(c, [rx - 3 * u, ry - 16 * u, rx + 33 * u, ry - 16 * u, rx + 15 * u, ry - 26 * u], '#b8402a');
      rect(c, rx + 4 * u, ry - 11 * u, 5 * u, 5 * u, '#ffd98a'); rect(c, rx + 20 * u, ry - 11 * u, 5 * u, 5 * u, '#ffd98a');
      rect(c, rx + 34 * u, ry - 34 * u, 1.4 * u, 34 * u, '#5a5a60'); emit({ x: rx + 35.4 * u, y: ry - 34 * u, k: 'flag', a: 12, col: '#d6202a' });
    });
    rect(c, 0, g - 1, w, hz + span * 0.6 - g + 1, '#dbeaf5');
    haze(P, hz - 120 * u, hz + span * 0.6, '#e8f7ff', 0.05, 0.15);
    void k;
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    rect(c, 0, hz + span * 0.5, w, rt - hz, '#e4eff8');
    c.fillStyle = 'rgba(120,160,200,0.18)'; for (let i = 0; i < 30; i++) c.fillRect(hash(i * 2.3) * w, hz + span * (0.55 + hash(i) * 0.4), (14 + hash(i * 3) * 30) * u, 1.6 * u);
    P.place(12, (x, r) => pine(k, x, hz + span * (0.6 + r * 0.32), (0.9 + r * 0.6) * u, '#1f4a3f', '#f4f8ff'), 19);
    P.place(5, (x, r) => { const s = (8 + r * 10) * u; ell(c, x, rt - s * 0.4 - 4 * u, s, s * 0.6, '#6a7486'); ell(c, x - s * 0.1, rt - s * 0.8 - 4 * u, s * 0.8, s * 0.3, '#f4f8ff'); }, 20);
    // an avalanche gallery: a concrete roof over the old road on stout pillars
    P.at(0.516, (x) => {
      rect(c, x, rt - 40 * u, 160 * u, 8 * u, '#9aa3b0'); rect(c, x, rt - 42 * u, 160 * u, 3 * u, '#f4f8ff');
      for (let i = 0; i < 6; i++) rect(c, x + 4 * u + i * 30 * u, rt - 32 * u, 8 * u, 26 * u, '#8a93a0');
      rect(c, x, rt - 32 * u, 160 * u, 26 * u, 'rgba(30,40,60,0.25)');
    });
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 34 * u, rt + 1, (P) => {
    const { c, w } = P;
    // snow banks, a guard rail and orange-tipped snow poles
    c.fillStyle = '#f4f8ff'; c.beginPath(); c.moveTo(0, rt);
    for (let i = 0, n = Math.ceil(w / (20 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, rt - (6 + 4 * Math.sin((x / w) * Math.PI * 2 * Math.round(w * 0.011))) * u); }
    c.lineTo(w, rt); c.closePath(); c.fill();
    rect(c, 0, rt - 14 * u, w, 3 * u, '#aeb6c2');
    for (let x = 0; x < w; x += 26 * u) rect(c, x, rt - 14 * u, 2.4 * u, 10 * u, '#8a93a0');
    P.place(6, (x) => { rect(c, x, rt - 32 * u, 2.2 * u, 30 * u, '#2a2a2e'); for (let i = 0; i < 3; i++) rect(c, x, rt - 32 * u + i * 6 * u, 2.2 * u, 3 * u, '#ff6a1a'); }, 76);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    c.fillStyle = '#e8f1f8'; c.beginPath(); c.moveTo(0, rb + 4 * u);
    for (let x = 0; x <= w; x += 30 * u) c.quadraticCurveTo(x + 15 * u, rb + (hash(x) * 8 + 4) * u, x + 30 * u, rb + 4 * u);
    c.lineTo(w, rb + 26 * u); c.lineTo(0, rb + 26 * u); c.fill();
  });
  B.live((L) => snowfall(L, 36, 0, L.rt));
};

// ---- Summit Circuit: the Summit Gala — the observatory, a chalet village, the gala grandstand, a cable car
const summit: Build = (B) => {
  const { u, hz, rt, span } = B;
  alpsFar(B, '#8aa3cc', '#6a88ba', '#f6faff', 8, '#dff0ff');
  B.layer(MID, hz - 78 * u, hz + span * 0.5, (P) => {
    const { c, w, k, emit } = P;
    P.place(6, (x, r) => peak(k, x, hz + span * 0.5, (100 + r * 70) * u, (50 + r * 34) * u, '#4f6f9e', '#eef5ff', 0.34), 11);
    rect(c, 0, hz + span * 0.2, w, span * 0.3, '#dfe9f3');
    P.at(0.258, (x) => {
      // the observatory dome on its ridge, with a slit and a lit window
      rect(c, x - 18 * u, hz - 40 * u, 36 * u, 22 * u, '#e6ebf2');
      c.fillStyle = '#f4f7fb'; c.beginPath(); c.arc(x, hz - 40 * u, 18 * u, Math.PI, 0); c.fill();
      rect(c, x - 2 * u, hz - 58 * u, 4 * u, 16 * u, '#2b3b55');
      rect(c, x - 12 * u, hz - 30 * u, 6 * u, 5 * u, '#ffd98a');
      emit({ x: x + 22 * u, y: hz - 30 * u, k: 'blink', col: '#ff3b3b', a: 2 });
    });
    // the cable car's valley station (the car rides live) and a pylon
    P.at(0.710, (x) => { rect(c, x, hz - 14 * u, 30 * u, 16 * u, '#b8402a'); rect(c, x + 2 * u, hz - 12 * u, 26 * u, 6 * u, '#ffd98a'); pylon(k, x + 120 * u, hz + 2 * u, 60 * u, '#3a4a60'); });
  }, MID_W, MID_W / 2.4);
  B.live((L) => {
    // a cable car riding its line across the valley
    const { ctx, W, u: uu, t, hz: h } = L;
    const y0 = h - 80 * uu, y1 = h + 6 * uu;
    ctx.strokeStyle = 'rgba(30,40,60,0.6)'; ctx.lineWidth = 1 * uu;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y1); ctx.stroke();
    const p = drift(t * 0.04, 1), x = p * W, y = y0 + (y1 - y0) * p;
    ctx.fillStyle = '#d6202a'; ctx.fillRect(x - 7 * uu, y + 6 * uu, 14 * uu, 10 * uu);
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(x - 5 * uu, y + 8 * uu, 10 * uu, 4 * uu);
    ctx.fillStyle = '#2a3346'; ctx.fillRect(x - 0.5 * uu, y, 1 * uu, 6 * uu);
  });
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k, emit } = P;
    rect(c, 0, hz + span * 0.3, w, rt - hz, '#e8f1f8');
    // chalets with dark timber, snowy roofs and lit windows
    P.place(5, (x, r, i) => {
      const y = hz + span * (0.6 + r * 0.15), bw = (30 + r * 12) * u, bh = (18 + r * 6) * u;
      rect(c, x, y - bh, bw, bh, '#6b4a32'); rect(c, x, y - bh * 0.45, bw, 2 * u, '#4a3220');
      poly(c, [x - 5 * u, y - bh, x + bw + 5 * u, y - bh, x + bw / 2, y - bh - bh * 0.7], '#f4f8ff');
      poly(c, [x - 5 * u, y - bh, x + bw + 5 * u, y - bh, x + bw + 5 * u, y - bh + 2 * u, x - 5 * u, y - bh + 2 * u], '#c9d6e6');
      rect(c, x + bw * 0.15, y - bh * 0.8, 6 * u, 6 * u, '#ffd98a'); rect(c, x + bw * 0.6, y - bh * 0.8, 6 * u, 6 * u, '#ffd98a');
      rect(c, x + bw * 0.4, y - bh * 0.35, 7 * u, bh * 0.35, '#3a2618');
      void i;
    }, 23);
    P.place(14, (x, r) => pine(k, x, hz + span * (0.5 + r * 0.42), (0.8 + r * 0.7) * u, '#1f4a3f', '#f4f8ff'), 19);
    // landmark: the Summit Gala finish grandstand with banners and a name board
    P.at(0.484, (x) => {
      const y = rt - 4 * u;
      rect(c, x - 70 * u, y - 30 * u, 140 * u, 30 * u, '#2a3346');
      const crowd = ['#e2337a', '#ffd23f', '#38e1ff', '#ffffff', '#ff7a2f'];
      for (let i = 0; i < 46; i++) disc(c, x - 66 * u + (i % 23) * 6 * u, y - 24 * u + Math.floor(i / 23) * 9 * u, 2.2 * u, crowd[i % 5]);
      rect(c, x - 70 * u, y - 36 * u, 140 * u, 6 * u, '#d6202a');
      rect(c, x - 42 * u, y - 49 * u, 84 * u, 14 * u, '#d6202a');
      P.text('SUMMIT GALA', x - 42 * u, y - 49 * u, 84 * u, 14 * u, '#ffffff', 10 * u);
      for (const fx of [-74, 72]) { rect(c, x + fx * u, y - 64 * u, 1.6 * u, 64 * u, '#5a5a60'); emit({ x: x + fx * u + 1.6 * u, y: y - 64 * u, k: 'flag', a: 14, col: fx < 0 ? '#d6202a' : '#2f6fb5' }); }
    });
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 26 * u, rt + 1, (P) => {
    const { c, w } = P;
    c.fillStyle = '#f4f8ff'; c.beginPath(); c.moveTo(0, rt);
    for (let i = 0, n = Math.ceil(w / (20 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, rt - (6 + 3 * Math.sin((x / w) * Math.PI * 2 * Math.round(w * 0.014))) * u); }
    c.lineTo(w, rt); c.closePath(); c.fill();
    // the gala's advertising boards along the kerb
    for (let x = 0, i = 0; x < w; x += 70 * u, i++) { const col = ['#d6202a', '#2f6fb5', '#1b1b1f'][i % 3]; rect(c, x + 4 * u, rt - 16 * u, 62 * u, 11 * u, col); P.text(['SUMMIT 1000', 'ALPINE', 'GALA'][i % 3], x + 4 * u, rt - 16 * u, 62 * u, 11 * u, '#ffffff', 8 * u); }
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    c.fillStyle = '#e8f1f8'; c.beginPath(); c.moveTo(0, rb + 4 * u);
    for (let x = 0; x <= w; x += 30 * u) c.quadraticCurveTo(x + 15 * u, rb + (hash(x) * 8 + 4) * u, x + 30 * u, rb + 4 * u);
    c.lineTo(w, rb + 26 * u); c.lineTo(0, rb + 26 * u); c.fill();
    P.place(5, (x) => rect(c, x, rb + 4 * u, 4 * u, 50 * u, '#c8d4e2'));
  });
  B.live((L) => snowfall(L, 14, 0, L.hz + L.span));
};

// ---- Azure Riviera: shared sea and hillside
function rivieraSea(B: RecipeBuilder, colA: string, colB: string, glint: string, islands: string) {
  const { u, hz, rt, span } = B;
  B.layer(0.02, hz - 24 * u, rt, (P) => {
    const { c } = P;
    water(P, hz - 2 * u, rt, colA, colB, glint, 70, 4);
    P.place(2, (x, r) => { c.fillStyle = islands; c.beginPath(); c.ellipse(x, hz, (50 + r * 50) * u, (10 + r * 10) * u, 0, Math.PI, 0); c.fill(); }, 41);
    void span;
  });
}
function rivieraHill(P: Paint, B: RecipeBuilder, hill: string, villas: number, seed: number) {
  const { c, w, k } = P;
  const { u, hz, span } = B;
  c.fillStyle = hill;
  c.beginPath(); c.moveTo(0, hz + span * 0.55);
  for (let i = 0, n = Math.ceil(w / (20 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, hz - (34 + 24 * Math.sin((x / w) * Math.PI * 4 + seed) + 10 * Math.sin((x / w) * Math.PI * 10)) * u); }
  c.lineTo(w, hz + span * 0.55); c.closePath(); c.fill();
  const walls = ['#f6d8b8', '#f3e6c8', '#f2c3b0', '#e9d1e6', '#fbe9a8', '#d9e8f0'];
  P.place(villas, (x, r, i) => villa(k, x, hz - (4 + r * 30) * u, (14 + hash(i * 3) * 12) * u, (10 + hash(i * 5) * 8) * u, walls[i % walls.length], i), 42 + seed);
  P.place(14, (x, r) => cypress(k, x, hz - r * 26 * u, (0.8 + r * 0.6) * u), 43 + seed);
}

const corniche: Build = (B) => {
  const { u, hz, rt, span } = B;
  rivieraSea(B, '#1d4fa0', '#1f7fb8', 'rgba(255,226,170,0.5)', '#6a7fb4');
  B.layer(MID, hz - 88 * u, hz + span * 0.55, (P) => {
    const { c, k } = P;
    rivieraHill(P, B, '#5d8a4e', 26, 0);
    // landmark: the stone viaduct and the tunnel mouth cut into the headland
    P.at(0.460, (x) => {
      c.fillStyle = '#d8c6a2'; c.fillRect(x - 120 * u, hz - 46 * u, 240 * u, 8 * u);
      for (let i = 0; i < 6; i++) { const ax = x - 110 * u + i * 44 * u; c.fillRect(ax, hz - 38 * u, 8 * u, 44 * u); c.beginPath(); c.arc(ax + 26 * u, hz - 38 * u, 18 * u, 0, Math.PI); c.fill(); }
      rect(c, x - 120 * u, hz - 47 * u, 240 * u, 1.4 * u, 'rgba(255,240,210,0.7)');
      c.fillStyle = '#b8a27a'; c.beginPath(); c.arc(x + 150 * u, hz - 30 * u, 22 * u, Math.PI, 0); c.fill(); c.fillRect(x + 128 * u, hz - 30 * u, 44 * u, 34 * u);
      c.fillStyle = '#20202a'; c.beginPath(); c.arc(x + 150 * u, hz - 22 * u, 14 * u, Math.PI, 0); c.fill(); c.fillRect(x + 136 * u, hz - 22 * u, 28 * u, 26 * u);
    });
    void k;
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // the cliff below the road: warm limestone with agaves, prickly pears and stone pines
    c.fillStyle = '#c9a878'; c.beginPath(); c.moveTo(0, rt);
    for (let i = 0, n = Math.ceil(w / (26 * u)); i <= n; i++) { const x = (i / n) * w; c.lineTo(x, hz + span * (0.35 + 0.15 * Math.abs(Math.sin((x / w) * Math.PI * 7)))); }
    c.lineTo(w, rt); c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,80,50,0.25)'; for (let i = 0; i < 30; i++) c.fillRect(hash(i * 1.7) * w, hz + span * (0.5 + hash(i) * 0.45), (16 + hash(i * 3) * 30) * u, 2 * u);
    P.place(4, (x, r) => stonePine(k, x, rt - (4 + r * 10) * u, (1 + r * 0.3) * u), 48);
    P.place(9, (x, r) => {
      // an agave: a fan of pointed blue-green leaves
      const y = rt - (6 + r * 16) * u;
      for (let i = -3; i <= 3; i++) poly(c, [x - 2 * u, y, x + 2 * u, y, x + i * 5 * u, y - (10 - Math.abs(i)) * u], i % 2 ? '#5f8f80' : '#79a898');
    }, 49);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 30 * u, rt + 1, (P) => {
    const { c, w } = P;
    // a stone balustrade spilling with bougainvillea
    rect(c, 0, rt - 15 * u, w, 3 * u, '#efe6d2'); rect(c, 0, rt - 4 * u, w, 4 * u, '#efe6d2');
    c.fillStyle = '#e3d8c0'; for (let x = 0; x < w; x += 7 * u) { c.beginPath(); c.ellipse(x + 3.5 * u, rt - 8 * u, 2 * u, 4 * u, 0, 0, 7); c.fill(); }
    P.place(8, (x, r) => { disc(c, x, rt - 18 * u, (6 + r * 5) * u, '#d23a8e'); disc(c, x + 8 * u, rt - 15 * u, 5 * u, '#f07ab8'); disc(c, x - 6 * u, rt - 16 * u, 4 * u, '#3e7a3e'); }, 49);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#d9cdb2');
    P.place(6, (x) => { rect(c, x - 7 * u, rb + 14 * u, 14 * u, 12 * u, '#b5552f'); disc(c, x, rb + 12 * u, 9 * u, '#3e7a3e'); disc(c, x - 3 * u, rb + 9 * u, 3 * u, '#e2589f'); });
  });
  B.live((L) => {
    gulls(L, 3, L.hz - 64 * L.u);
    // a paraglider drifting off the headland
    const { ctx, W, u: uu, t, scroll } = L;
    const x = drift(W * 0.5 + t * 6 * uu - scroll * 0.04, W * 1.5) - W * 0.25, y = L.hz - 80 * uu + Math.sin(t * 0.5) * 6 * uu;
    ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.ellipse(x, y, 16 * uu, 5 * uu, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 0.6 * uu; ctx.beginPath(); ctx.moveTo(x - 14 * uu, y); ctx.lineTo(x, y + 16 * uu); ctx.lineTo(x + 14 * uu, y); ctx.stroke();
    ctx.fillStyle = '#26334a'; ctx.fillRect(x - 1.5 * uu, y + 15 * uu, 3 * uu, 4 * uu);
  });
};

const port: Build = (B) => {
  const { u, hz, rt, span } = B;
  rivieraSea(B, '#1a5fb0', '#1f8cc0', 'rgba(255,255,255,0.45)', '#7a8fc0');
  B.layer(MID, hz - 86 * u, hz + span * 0.55, (P) => {
    const { c, w, k, emit } = P;
    // the harbour front: a row of tall pastel houses with green shutters along the quay
    rect(c, 0, hz - 4 * u, w, span * 0.55 + 4 * u, '#e8e2d4');
    const walls = ['#f2c36b', '#e9876a', '#f6e3c3', '#e6a9a0', '#9fc4d6', '#f0d080'];
    for (let x = 0, i = 0; x < w; i++) {
      const bw = (18 + hash(i * 3) * 14) * u, bh = (30 + hash(i * 5) * 30) * u;
      villa(k, x, hz - 4 * u, bw, bh, walls[i % walls.length], i);
      x += bw;
    }
    // landmark: the harbour lighthouse on its breakwater, and a superyacht at the quay
    P.at(0.492, (x) => {
      rect(c, x - 90 * u, hz - 4 * u, 180 * u, 8 * u, '#cfc4ae');
      const lamp = lighthouse(k, x + 77 * u, hz - 4 * u, 0.8 * u, '#2f7a4a', '#f6f3ea');
      emit({ x: lamp.x, y: lamp.y, k: 'beam', a: 80, reach: 90 });
      yacht(k, x - 80 * u, hz + 6 * u, 1.05 * u);
    });
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k } = P;
    // the marina: a forest of masts over moored yachts, pontoons and the water
    rect(c, 0, hz + span * 0.35, w, rt - hz, '#1f6fa8');
    c.fillStyle = 'rgba(255,255,255,0.3)'; for (let i = 0; i < 40; i++) c.fillRect(hash(i * 3.3) * w, hz + span * (0.4 + hash(i * 1.9) * 0.55), (8 + hash(i) * 16) * u, 1.2 * u);
    rect(c, 0, rt - 18 * u, w, 3 * u, '#cfc4ae');
    P.place(9, (x, r, i) => {
      const y = rt - 16 * u, L2 = (36 + r * 28) * u;
      poly(c, [x, y, x + L2, y, x + L2 + 8 * u, y - 8 * u, x - 4 * u, y - 8 * u], '#ffffff');
      rect(c, x - 4 * u, y - 4 * u, L2 + 12 * u, 1.4 * u, ['#26334a', '#c8432f', '#2f8fd0'][i % 3]);
      rect(c, x + L2 * 0.2, y - 14 * u, L2 * 0.5, 6 * u, '#c9d6e6');
      rect(c, x + L2 * 0.45, y - 56 * u, 1.5 * u, 48 * u, '#7a5a3a');
      line(c, x + L2 * 0.45, y - 56 * u, x + L2 + 4 * u, y - 8 * u, 0.6 * u, 'rgba(60,60,60,0.5)');
    }, 47);
    void k;
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 20 * u, rt + 1, (P) => {
    const { c, w } = P;
    // the quayside: stone kerb, iron bollards and a sagging chain
    rect(c, 0, rt - 6 * u, w, 6 * u, '#d8cfbf'); rect(c, 0, rt - 6 * u, w, 1.2 * u, '#f4efe4');
    c.strokeStyle = '#3a3a40'; c.lineWidth = 1.2 * u; c.beginPath();
    for (let x = 0; x < w; x += 30 * u) { c.moveTo(x, rt - 14 * u); c.quadraticCurveTo(x + 15 * u, rt - 8 * u, x + 30 * u, rt - 14 * u); }
    c.stroke();
    for (let x = 0; x < w; x += 30 * u) { rect(c, x - 3 * u, rt - 16 * u, 6 * u, 10 * u, '#2a2a30'); ell(c, x, rt - 16 * u, 4 * u, 1.6 * u, '#4a4a52'); }
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#cfc4ae');
    P.place(5, (x) => rect(c, x, rb + 10 * u, 6 * u, 30 * u, '#3a3a40'));
  });
  B.live((L) => { gulls(L, 4, L.hz - 64 * L.u); boatMover(L, 5, L.hz + L.span * 0.1, 12, 0.02, (c, x, y) => sailboat({ c, u: L.u, rim: '', shadow: '' }, x, y, 0.8 * L.u, '#2f8fd0')); });
};

const grand: Build = (B) => {
  const { u, hz, rt, span } = B;
  rivieraSea(B, '#3a4fa0', '#6a6fb8', 'rgba(255,190,150,0.5)', '#8a7fb4');
  B.layer(MID, hz - 116 * u, hz + span * 0.55, (P) => {
    const { c, emit } = P;
    rivieraHill(P, B, '#5a7f4e', 20, 2);
    // landmark: the Grand Casino — a cream palace with a green copper dome, flags and lit arcades
    P.at(0.524, (x) => {
      rect(c, x - 70 * u, hz - 54 * u, 140 * u, 58 * u, '#f1e4c8');
      rect(c, x + 62 * u, hz - 54 * u, 8 * u, 58 * u, '#fff4dc');
      c.fillStyle = '#e4d2ac'; c.fillRect(x - 76 * u, hz - 58 * u, 152 * u, 6 * u);
      c.fillStyle = 'rgba(255,214,140,0.85)'; for (let i = 0; i < 8; i++) { c.fillRect(x - 62 * u + i * 16 * u, hz - 44 * u, 7 * u, 12 * u); }
      c.fillStyle = 'rgba(70,80,110,0.55)'; for (let i = 0; i < 8; i++) c.fillRect(x - 62 * u + i * 16 * u, hz - 24 * u, 7 * u, 12 * u);
      c.fillStyle = '#f1e4c8'; c.fillRect(x - 24 * u, hz - 74 * u, 48 * u, 18 * u);
      c.fillStyle = '#4f9a84'; c.beginPath(); c.arc(x, hz - 74 * u, 24 * u, Math.PI, 0); c.fill();
      c.fillStyle = '#6fbaa2'; c.beginPath(); c.arc(x, hz - 74 * u, 24 * u, Math.PI * 1.5, 0); c.lineTo(x, hz - 74 * u); c.fill();
      c.fillStyle = '#e0b84a'; c.fillRect(x - 1.5 * u, hz - 108 * u, 3 * u, 12 * u);
      for (const fx of [-66, 66]) { c.fillStyle = '#6b5a44'; c.fillRect(x + fx * u, hz - 84 * u, 1.5 * u, 28 * u); emit({ x: x + fx * u + 1.5 * u, y: hz - 84 * u, k: 'flag', a: 12, col: fx < 0 ? '#d6202a' : '#ffffff' }); }
      // the hotel beside it
      rect(c, x + 90 * u, hz - 70 * u, 60 * u, 74 * u, '#f3d6c0'); windows(c, x + 94 * u, hz - 66 * u, 52 * u, 64 * u, 6, 7, 9, ['rgba(255,214,140,0.85)'], 'rgba(70,80,110,0.5)', 0.4);
      rect(c, x + 88 * u, hz - 74 * u, 64 * u, 5 * u, '#c8603a');
    });
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k, emit } = P;
    // the boulevard gardens: a fountain, date palms, flower beds and ornate lamps
    rect(c, 0, hz + span * 0.42, w, rt - hz, '#c9b48a');
    rect(c, 0, hz + span * 0.55, w, 5 * u, '#5a8a4a');
    P.at(0.468, (x) => {
      ell(c, x, rt - 8 * u, 34 * u, 6 * u, '#e8dcc0'); ell(c, x, rt - 10 * u, 28 * u, 4 * u, '#5fb0d8');
      rect(c, x - 3 * u, rt - 30 * u, 6 * u, 20 * u, '#e8dcc0'); ell(c, x, rt - 30 * u, 12 * u, 3 * u, '#e8dcc0');
      c.strokeStyle = 'rgba(200,235,255,0.8)'; c.lineWidth = 1.2 * u; c.beginPath();
      for (const d of [-1, 1]) { c.moveTo(x, rt - 34 * u); c.quadraticCurveTo(x + d * 10 * u, rt - 44 * u, x + d * 18 * u, rt - 12 * u); }
      c.stroke();
    });
    P.place(6, (x, r) => palm(k, x, rt - 8 * u, (46 + r * 18) * u, 0.2 + r * 0.2, '#2f7a42'), 4);
    P.place(8, (x, r) => { ell(c, x, rt - 6 * u, 14 * u, 4 * u, '#2f6b32'); for (let i = 0; i < 5; i++) disc(c, x - 10 * u + i * 5 * u, rt - 8 * u, 2 * u, ['#e2337a', '#ffd23f', '#ff7a2f'][(i + Math.floor(r * 3)) % 3]); }, 5);
    P.place(5, (x) => { rect(c, x, rt - 52 * u, 2.5 * u, 50 * u, '#2c2f38'); rect(c, x - 6 * u, rt - 52 * u, 14 * u, 2.5 * u, '#2c2f38'); disc(c, x - 6 * u, rt - 48 * u, 3 * u, '#ffe6a8'); disc(c, x + 8 * u, rt - 48 * u, 3 * u, '#ffe6a8'); emit({ x: x + 1 * u, y: rt - 48 * u, k: 'blink', col: 'rgba(255,230,168,0.25)', a: 0.7 }); }, 50);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 26 * u, rt + 1, (P) => {
    const { c, w } = P;
    rect(c, 0, rt - 15 * u, w, 3 * u, '#efe6d2'); rect(c, 0, rt - 4 * u, w, 4 * u, '#efe6d2');
    c.fillStyle = '#e3d8c0'; for (let x = 0; x < w; x += 7 * u) { c.beginPath(); c.ellipse(x + 3.5 * u, rt - 8 * u, 2 * u, 4 * u, 0, 0, 7); c.fill(); }
    for (let x = 0; x < w; x += 56 * u) { rect(c, x, rt - 22 * u, 8 * u, 22 * u, '#e8dcc0'); ell(c, x + 4 * u, rt - 22 * u, 6 * u, 3 * u, '#d23a8e'); }
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#d9cdb2');
    P.place(6, (x) => { rect(c, x - 7 * u, rb + 14 * u, 14 * u, 12 * u, '#b5552f'); disc(c, x, rb + 12 * u, 9 * u, '#3e7a3e'); disc(c, x - 3 * u, rb + 9 * u, 3 * u, '#e2589f'); });
  });
  B.live((L) => {
    for (let i = 0; i < 2; i++) boatMover(L, i * 5 + 3, L.hz + L.span * (0.08 + i * 0.1), 5 + i * 3, 0.02, (c, x, y) => sailboat({ c, u: L.u, rim: '', shadow: '' }, x, y, 0.7 * L.u, i ? '#e0532f' : '#2b4d7a', '#fff4e8'));
    gulls(L, 3, L.hz - 64 * L.u, 'rgba(40,20,40,0.5)');
  });
};

const esplanade: Build = (B) => {
  const { u, hz, rt, span } = B;
  rivieraSea(B, '#1d55a8', '#2a8ac0', 'rgba(255,236,190,0.5)', '#7084b8');
  B.layer(MID, hz - 124 * u, hz + span * 0.55, (P) => {
    const { c, k, emit } = P;
    rivieraHill(P, B, '#609050', 22, 4);
    // landmark: the harbour wheel (turning live) and the clock tower on the quay
    P.at(0.540, (x) => {
      const cx = x - 40 * u, cy = hz - 62 * u, Rr = 52 * u;
      c.strokeStyle = '#f3efe6'; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(cx, cy, Rr, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1 * u; c.beginPath(); c.arc(cx, cy, Rr * 0.92, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#d6cfbf'; c.lineWidth = 3 * u;
      c.beginPath(); c.moveTo(cx - 24 * u, hz + 2 * u); c.lineTo(cx, cy); c.lineTo(cx + 24 * u, hz + 2 * u); c.stroke();
      emit({ x: cx, y: cy, k: 'wheel', a: 52, reach: 70 });
      rect(c, x + 50 * u, hz - 86 * u, 18 * u, 90 * u, '#e9d6b0'); rect(c, x + 64 * u, hz - 86 * u, 4 * u, 90 * u, '#f6e8c8');
      poly(c, [x + 47 * u, hz - 86 * u, x + 71 * u, hz - 86 * u, x + 59 * u, hz - 104 * u], '#c8603a');
      disc(c, x + 59 * u, hz - 72 * u, 6 * u, '#fbf6ea');
      c.fillStyle = '#2c2f38'; c.fillRect(x + 58.5 * u, hz - 77 * u, 1 * u, 5 * u); c.fillRect(x + 59 * u, hz - 72.5 * u, 4 * u, 1 * u);
    });
    void k;
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c, w, k, emit } = P;
    // the promenade: cafés with striped awnings, bunting between lamp posts, flower boxes
    rect(c, 0, hz + span * 0.35, w, rt - hz, '#e0d4b8');
    rect(c, 0, hz + span * 0.35, w, 3 * u, '#f4efe4');
    const stripes = [['#e2337a', '#fff4e8'], ['#2f8fd0', '#fff4e8'], ['#ff7a2f', '#fff4e8'], ['#2fb58a', '#fff4e8']];
    P.place(5, (x, r, i) => {
      const y = rt - 10 * u, bw = (50 + r * 20) * u;
      rect(c, x, y - 34 * u, bw, 34 * u, ['#f6d8b8', '#f2c3b0', '#fbe9a8', '#d9e8f0'][i % 4]);
      windows(c, x + 4 * u, y - 30 * u, bw - 8 * u, 10 * u, 4, 1, i, ['#3a6a5a'], '#3a6a5a', 1, 0.6);
      const s = stripes[i % 4];
      for (let j = 0; j < 8; j++) poly(c, [x - 2 * u + j * (bw + 4 * u) / 8, y - 18 * u, x - 2 * u + (j + 1) * (bw + 4 * u) / 8, y - 18 * u, x - 2 * u + (j + 1) * (bw + 4 * u) / 8, y - 12 * u, x - 2 * u + j * (bw + 4 * u) / 8, y - 12 * u], j % 2 ? s[0] : s[1]);
      rect(c, x + 4 * u, y - 12 * u, bw - 8 * u, 12 * u, 'rgba(60,40,30,0.4)');
      for (let j = 0; j < 3; j++) { disc(c, x + 10 * u + j * (bw - 20 * u) / 2, y - 4 * u, 3 * u, '#f4f1ea'); rect(c, x + 9.5 * u + j * (bw - 20 * u) / 2, y - 4 * u, 1 * u, 4 * u, '#2c2f38'); }
    }, 6);
    const posts: number[] = [];
    for (let x = 0; x < w; x += 70 * u) { posts.push(x); rect(c, x, rt - 48 * u, 2.4 * u, 46 * u, '#2c2f38'); disc(c, x + 1.2 * u, rt - 49 * u, 3 * u, '#ffe6a8'); }
    for (let i = 0; i < posts.length - 1; i++) bunting(k, posts[i] + 1.2 * u, rt - 44 * u, posts[i + 1] + 1.2 * u, rt - 44 * u, ['#d6202a', '#ffd23f', '#2f8fd0', '#ffffff', '#2fb58a']);
    P.place(3, (x, r, i) => { rect(c, x, rt - 60 * u, 1.4 * u, 58 * u, '#5a5048'); emit({ x: x + 1.4 * u, y: rt - 60 * u, k: 'flag', a: 14, col: ['#ff5a1f', '#2f8fd0', '#ffd23f'][i % 3] }); void r; }, 7);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 20 * u, rt + 1, (P) => {
    const { c, w } = P;
    // promenade railings with flower boxes
    rect(c, 0, rt - 14 * u, w, 2 * u, '#2c4a5a');
    for (let x = 0; x < w; x += 5 * u) rect(c, x, rt - 13 * u, 1 * u, 10 * u, '#2c4a5a');
    rect(c, 0, rt - 4 * u, w, 4 * u, '#e8dcc0');
    P.place(8, (x) => { rect(c, x, rt - 10 * u, 22 * u, 6 * u, '#b5552f'); for (let i = 0; i < 5; i++) disc(c, x + 2 * u + i * 4.5 * u, rt - 11 * u, 2.6 * u, ['#e2337a', '#ffd23f', '#ff7a2f', '#ffffff'][i % 4]); }, 81);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#d9cdb2');
    P.place(6, (x) => { rect(c, x - 7 * u, rb + 14 * u, 14 * u, 12 * u, '#b5552f'); disc(c, x, rb + 12 * u, 9 * u, '#3e7a3e'); disc(c, x - 3 * u, rb + 9 * u, 3 * u, '#ffd23f'); });
  });
  B.live((L) => { gulls(L, 3, L.hz - 64 * L.u); boatMover(L, 9, L.hz + L.span * 0.14, 9, 0.02, (c, x, y) => sailboat({ c, u: L.u, rim: '', shadow: '' }, x, y, 0.8 * L.u, '#ff5a1f')); });
};

const causeway: Build = (B) => {
  const { u, hz, rt, span } = B;
  rivieraSea(B, '#4a6aa8', '#7fa6c8', 'rgba(255,214,200,0.55)', '#8a8fb8');
  B.layer(MID, hz - 84 * u, hz + span * 0.5, (P) => {
    const { c, k, emit } = P;
    // a far viaduct of arches running out across the lagoon, and the lighthouse on its islet
    P.at(0.484, (x) => {
      c.fillStyle = '#d8c6a2'; c.fillRect(x - 160 * u, hz - 22 * u, 240 * u, 5 * u);
      for (let i = 0; i < 10; i++) { const ax = x - 156 * u + i * 24 * u; c.fillRect(ax, hz - 17 * u, 4 * u, 19 * u); c.beginPath(); c.arc(ax + 14 * u, hz - 17 * u, 10 * u, 0, Math.PI); c.fill(); }
      c.fillStyle = '#6a7f9a'; c.beginPath(); c.ellipse(x + 130 * u, hz + 1 * u, 34 * u, 8 * u, 0, Math.PI, 0); c.fill();
      const lamp = lighthouse(k, x + 130 * u, hz - 4 * u, 0.8 * u, '#d6202a');
      emit({ x: lamp.x, y: lamp.y, k: 'beam', a: 90, reach: 100 });
    });
    // stilt fishing huts with nets
    P.place(3, (x) => {
      for (let i = 0; i < 4; i++) rect(c, x + i * 8 * u, hz + 2 * u, 1.4 * u, 12 * u, '#5a4a3a');
      rect(c, x - 2 * u, hz - 10 * u, 30 * u, 12 * u, '#c9a87a'); poly(c, [x - 4 * u, hz - 10 * u, x + 30 * u, hz - 10 * u, x + 13 * u, hz - 18 * u], '#8a5a3a');
      line(c, x + 28 * u, hz - 4 * u, x + 60 * u, hz - 30 * u, 1 * u, '#5a4a3a');
      c.strokeStyle = 'rgba(60,50,40,0.45)'; c.lineWidth = 0.6 * u; c.beginPath(); for (let i = 0; i < 6; i++) { c.moveTo(x + 44 * u + i * 3 * u, hz - 16 * u - i * 2 * u); c.lineTo(x + 40 * u + i * 4 * u, hz + 4 * u); } c.stroke();
    }, 58);
  }, MID_W, MID_W / 2.4);
  B.layer(NEAR, hz - 40 * u, rt, (P) => {
    const { c } = P;
    // open lagoon water up to the parapet: fishing boats, channel buoys and wading flamingos on a sandbar
    water(P, hz + span * 0.3, rt, '#5f8ec0', '#3f78b0', 'rgba(255,220,210,0.45)', 40, 6);
    P.place(4, (x, r) => {
      const y = hz + span * (0.55 + r * 0.3), L2 = (22 + r * 14) * u;
      poly(c, [x, y, x + L2, y, x + L2 + 5 * u, y - 6 * u, x - 3 * u, y - 6 * u], r > 0.5 ? '#c8503a' : '#2f5a8a');
      c.fillStyle = '#f4f1ea'; c.fillRect(x + L2 * 0.55, y - 13 * u, 8 * u, 7 * u);
      c.fillStyle = '#5b4a3a'; c.fillRect(x + L2 * 0.25, y - 26 * u, 1.2 * u, 20 * u);
    }, 54);
    P.place(7, (x, r) => { const y = hz + span * (0.45 + r * 0.4); c.fillStyle = r > 0.5 ? '#d6202a' : '#2f9a4a'; c.fillRect(x - 2 * u, y - 9 * u, 4 * u, 9 * u); disc(c, x, y - 10 * u, 2.5 * u, c.fillStyle as string); }, 55);
    P.place(2, (x) => {
      ell(c, x + 30 * u, rt - 18 * u, 46 * u, 4 * u, '#e8d6b0');
      for (let i = 0; i < 5; i++) {
        const fx = x + i * 14 * u, fy = rt - 20 * u;
        line(c, fx, fy, fx, fy - 10 * u, 0.8 * u, '#e07a8a');
        ell(c, fx + 1 * u, fy - 12 * u, 5 * u, 3 * u, '#f08aa0');
        c.strokeStyle = '#f08aa0'; c.lineWidth = 1 * u; c.beginPath(); c.moveTo(fx + 4 * u, fy - 13 * u); c.quadraticCurveTo(fx + 8 * u, fy - 22 * u, fx + 6 * u, fy - 21 * u); c.stroke();
        disc(c, fx + 6.5 * u, fy - 21 * u, 1.4 * u, '#f08aa0');
      }
    }, 56);
  }, NEAR_W, NEAR_W / 2.6);
  B.layer(VERGE, rt - 18 * u, rt + 1, (P) => {
    const { c, w } = P;
    rect(c, 0, rt - 9 * u, w, 9 * u, '#cfc4ae'); rect(c, 0, rt - 9 * u, w, 1.4 * u, '#ece4d2');
    c.fillStyle = '#b8ab92'; for (let x = 0; x < w; x += 18 * u) c.fillRect(x, rt - 9 * u, 1.5 * u, 9 * u);
    P.place(6, (x) => { rect(c, x, rt - 16 * u, 2 * u, 7 * u, '#5a5048'); ell(c, x + 1 * u, rt - 17 * u, 3 * u, 1.6 * u, '#ffe6a8'); }, 82);
  }, VERGE_W, VERGE_W / 2.2);
  B.fore((P) => {
    const { c, w } = P;
    const { rb } = B;
    rect(c, 0, rb + 6 * u, w, 8 * u, '#b8ab92');
    P.place(5, (x) => rect(c, x, rb + 10 * u, 6 * u, 26 * u, '#5a5048'));
  });
  B.live((L) => {
    gulls(L, 3, L.hz - 64 * L.u, 'rgba(60,40,70,0.5)');
    boatMover(L, 11, L.hz + L.span * 0.2, -7, 0.03, (c, x, y) => { poly(c, [x, y, x + 20 * L.u, y, x + 24 * L.u, y - 5 * L.u, x - 2 * L.u, y - 5 * L.u], '#c8503a'); c.fillStyle = '#5b4a3a'; c.fillRect(x + 8 * L.u, y - 22 * L.u, 1 * L.u, 17 * L.u); poly(c, [x + 9 * L.u, y - 22 * L.u, x + 9 * L.u, y - 6 * L.u, x + 18 * L.u, y - 6 * L.u], '#f4e6c8'); });
  });
};

// ---------------------------------------------------------------- registry

const RECIPES: Record<string, Recipe> = {
  scrapyard: R(scrapyard, { haze: '#ffb04a', rim: 'rgba(255,200,120,0.55)' }),
  maple: R(maple, { sunX: 0.72, rim: 'rgba(255,244,210,0.5)' }),
  foundry: R(foundry, { rim: 'rgba(255,150,80,0.45)' }, 3),
  harbor: R(harbor, { sky: ['#1f6bb8', '#79c6ee', '#ffe0b0'], sunX: 0.82, sunY: 0.5, ground: '#a59e8f', rim: 'rgba(255,236,200,0.55)' }),
  cliffs: R(cliffs, { sky: ['#2a6fb5', '#8fcff2', '#fff0c8'], sunX: 0.22, sunY: 0.42, ground: '#5c9a48', rim: 'rgba(255,250,220,0.5)' }),
  coast: R(coast, { sky: ['#1468c8', '#5ec2f5', '#d9f3ff'], sunY: 0.22, sunR: 0.045, ground: '#f0d9a0', rim: 'rgba(255,255,240,0.55)' }),
  downtown: R(downtown, { rim: 'rgba(255,120,220,0.35)' }, 3),
  bridge: R(bridge, { sky: ['#050b1f', '#14285a', '#3d4f8a'], sunX: 0.2, cloud: 'rgba(90,110,170,0.25)', ground: '#0a1430', rim: 'rgba(255,214,140,0.35)' }, 2),
  skyline: R(skylineRun, { rim: 'rgba(47,243,255,0.35)' }, 2),
  dunes: R(dunes, { sky: ['#2d6fc2', '#8cc8ee', '#ffe2a8'], sunX: 0.28, sunY: 0.4, ground: '#e8b36a', rim: 'rgba(255,240,200,0.6)' }, 3),
  canyon: R(canyon, { sky: ['#1b4e9a', '#5aa7df', '#ffc98f'], sunY: 0.5, ground: '#c4602f', rim: 'rgba(255,214,160,0.55)' }, 3),
  mesa: R(mesaFlats, { sky: ['#2a6cc0', '#86c4ea', '#f4ead8'], sunY: 0.18, sunR: 0.05, ground: '#f4ede0', rim: 'rgba(255,255,240,0.6)' }, 2),
  airstrip: R(airstrip, { sky: ['#2462b8', '#7ab9e8', '#f3e2c0'], sunX: 0.85, ground: '#a59f92', rim: 'rgba(255,244,220,0.55)' }),
  pass: R(pass, { sky: ['#0f3a6e', '#5fa8d8', '#e8f7ff'], sunX: 0.3, sunY: 0.3, cloud: 'rgba(240,248,255,0.75)', ground: '#e4eff8', rim: 'rgba(255,255,255,0.6)' }, 3),
  summit: R(summit, { rim: 'rgba(255,255,255,0.55)' }),
  corniche: R(corniche, { rim: 'rgba(255,220,170,0.55)' }),
  port: R(port, { sky: ['#1f5fb8', '#7cc0ee', '#fff0d0'], sunY: 0.3, ground: '#1f6fa8', rim: 'rgba(255,250,230,0.55)' }),
  grand: R(grand, { sky: ['#2b3c8a', '#c07aa8', '#ffc09a'], sunX: 0.7, sunY: 0.78, sunGlow: 'rgba(255,150,120,0.6)', cloud: 'rgba(255,200,200,0.6)', rim: 'rgba(255,190,150,0.6)' }),
  esplanade: R(esplanade, { sunX: 0.82, sunY: 0.45, rim: 'rgba(255,236,200,0.55)' }),
  causeway: R(causeway, { sky: ['#3a4f8f', '#c6a6c8', '#ffd6b0'], sunX: 0.24, sunY: 0.85, sunGlow: 'rgba(255,190,170,0.6)', cloud: 'rgba(255,220,220,0.6)', ground: '#5f8ec0', rim: 'rgba(255,210,190,0.55)' }),
};

/** A look's stand-in when a track has no recipe of its own (a new track still gets its area's scenery). */
const LOOK_DEFAULT: Record<string, string> = {
  scrap: 'scrapyard', suburb: 'maple', foundry: 'foundry', coast: 'coast', night: 'downtown', desert: 'dunes', summit: 'summit', riviera: 'grand', neon: 'skyline',
};

export function recipeFor(trackId: string, look: Look | string): Recipe {
  return RECIPES[trackId] ?? RECIPES[LOOK_DEFAULT[look] ?? 'maple'] ?? RECIPES.maple;
}

/** Every track id with its own scenery recipe (tests and the art sheet). */
export const SCENERY_TRACKS = Object.keys(RECIPES);

