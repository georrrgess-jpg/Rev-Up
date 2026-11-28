// Rev Up — opponent-only car designs (drawn by src/render/car.ts, which imports this file; this file imports only
// types back, so there is no import cycle).
//
// Twenty original bodies that only rivals drive, spread over the whole ladder so the grid stops being repaints of
// the player's own roster: Scrapyard work vehicles and microcars, suburban coupés and sedans, downtown drift and
// wedge coupés, desert trucks and buggies, and the Summit / Riviera racers and hypercars. Each one is the same kind of
// side profile as the roster cars (metres, rear at x = 0, y up, extruded along the shared depth vector) plus four
// small drawing hooks: `body` (inside the near-panel clip: two-tones, woodgrain, signs), `side` (seams, handles,
// lamps, mirrors on the near panel, behind the near wheels), `top` (planes and anything standing on them, drawn in
// front of the near wheels: beds, racks, wings, cages, spats) and `face` (lamps and grille on the front plane).
// The race caches all of it as bitmaps like the roster cars; only wheels, lamps and nitro are drawn live.
import type { CarDef, P, RivalKit } from './car';

export interface RivalArt {
  def: CarDef;
  /** Near-side tail lamp centre (metres from the tail, height) and its length along the body. */
  tail: { x: number; y: number; len: number };
  /** Height of the headlamp centres on the front plane. */
  lampY: number;
  /** Chrome window surrounds (the classics). */
  chromeGlass?: boolean;
  /** Nitro trail (default: the plain flame). */
  trail?: { ys: number[]; len: number; cols: [string, string, string, string]; x0?: number };
  body?(k: RivalKit): void;
  side?(k: RivalKit): void;
  top?(k: RivalKit): void;
  face(k: RivalKit): void;
}

const TIRE = { tire: '#1c1c1d', side: '#2a2a2c' };

// ---------------------------------------------------------------- shared pieces

/** A box standing on the car: its near face, top and forward face (u across the car, y absolute height). */
function box(k: RivalKit, x0: number, x1: number, u0: number, u1: number, y0: number, h: number, top: string, near: string, front: string, frontY0 = y0) {
  const { P3 } = k;
  k.fill([P3(x1, u0, frontY0), P3(x1, u1, frontY0), P3(x1, u1, y0 + h), P3(x1, u0, y0 + h)], front);
  k.fill([P3(x0, u0, y0 + h), P3(x1, u0, y0 + h), P3(x1, u1, y0 + h), P3(x0, u1, y0 + h)], top);
  k.fill([P3(x0, u0, y0), P3(x1, u0, frontY0), P3(x1, u0, y0 + h), P3(x0, u0, y0 + h)], near);
}
/** A tube along points (a roll cage, a nerf bar). */
function tube(k: RivalKit, pts: P[], w: number, col: string, hi = 'rgba(255,255,255,0.35)') {
  const { ctx } = k;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.strokeStyle = hi; ctx.lineWidth = w * 0.3;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + w * 0.2) : ctx.moveTo(p.x, p.y + w * 0.2))); ctx.stroke();
}
/** A seated driver seen over the door: shoulders, a helmet (or a head) and a visor. */
function driver(k: RivalKit, x: number, u: number, y: number, helmet: string, visor = '#141a22') {
  const { ctx, P3 } = k;
  const c = P3(x, u, y);
  ctx.fillStyle = '#1d2026';
  ctx.beginPath(); ctx.ellipse(c.x - 0.03, c.y - 0.13, 0.15, 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = helmet;
  ctx.beginPath(); ctx.ellipse(c.x, c.y, 0.11, 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = visor;
  ctx.beginPath(); ctx.ellipse(c.x + 0.05, c.y + 0.01, 0.055, 0.045, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(c.x - 0.03, c.y + 0.06, 0.04, 0.025, -0.4, 0, Math.PI * 2); ctx.fill();
}
/** Round headlamps on the front plane, in a bezel. */
function roundLamps(k: RivalKit, us: number[], y: number, ru: number, ry: number, bezel = '#d4d9dd', warm = true) {
  for (const u of us) {
    k.fill(k.ellipse(u, y, ru * 1.3, ry * 1.25), bezel);
    k.fill(k.ellipse(u, y, ru, ry), k.lens(warm));
  }
}
/** A rectangular lamp pair, mirrored across the face. */
function rectLamps(k: RivalKit, u0: number, u1: number, y0: number, y1: number, frame = '#16181b', warm = false) {
  for (const [a, b] of [[u0, u1], [1 - u1, 1 - u0]]) {
    k.fill(k.quad(a - 0.015, b + 0.015, y0 - 0.015, y1 + 0.015), frame);
    k.fill(k.quad(a, b, y0, y1), k.lens(warm));
  }
}
/** A grille: dark panel with n horizontal bars. */
function grille(k: RivalKit, u0: number, u1: number, y0: number, y1: number, n: number, bg = '#101214', bar = '#3a4046', frame?: string) {
  if (frame) k.fill(k.quad(u0 - 0.02, u1 + 0.02, y0 - 0.02, y1 + 0.02), frame);
  k.fill(k.quad(u0, u1, y0, y1), bg);
  const h = (y1 - y0) / (n + 1);
  for (let i = 1; i <= n; i++) k.fill(k.quad(u0 + 0.01, u1 - 0.01, y0 + h * i - 0.006, y0 + h * i + 0.006), bar);
}
/** A rectangular tail lamp on the near-side tail, with an amber or clear strip. */
function tailLamp(k: RivalKit, y: number, h: number, w = 0.08, strip = '#e8a03a') {
  k.rect(-0.005, y, w, h, '#a5201b', 0.02);
  k.rect(-0.005, y + h - Math.min(0.04, h * 0.3), w, Math.min(0.04, h * 0.3), strip, 0.015);
  k.rect(0.005, y + 0.01, w * 0.35, h - 0.02, 'rgba(255,255,255,0.18)', 0.01);
}
const lower = (k: RivalKit) => k.d.sill + 0.05;
/** A soft rust bloom (Scrapyard bodies). */
function rust(k: RivalKit, x: number, y: number, r: number) {
  const { ctx } = k;
  const g = ctx.createRadialGradient(x, y, 0.005, x, y, r);
  g.addColorStop(0, 'rgba(120,58,24,0.85)'); g.addColorStop(0.6, 'rgba(150,78,34,0.45)'); g.addColorStop(1, 'rgba(150,78,34,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, 0.3, 0, Math.PI * 2); ctx.fill();
}
/** Chrome gradient for bumpers between y0 and y1. */
function chrome(k: RivalKit, y0: number, y1: number) {
  const g = k.ctx.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, '#f6f7f8'); g.addColorStop(0.45, '#8d949a'); g.addColorStop(0.55, '#c3c9ce'); g.addColorStop(1, '#e5e8ea');
  return g;
}
function chromeBumpers(k: RivalKit, y0: number, y1: number, wrapF: number, wrapR: number) {
  k.bumper('rear', y0, y1, wrapR, chrome(k, y0, y1), '#f1f3f5', '#a3aab0');
  k.bumper('front', y0, y1, wrapF, chrome(k, y0, y1), '#f1f3f5', '#b9c0c6');
}
function blackBumpers(k: RivalKit, y0: number, y1: number, wrapF: number, wrapR: number, col = '#25272a') {
  k.bumper('rear', y0, y1, wrapR, col, k.lit(col, 0.18), k.lit(col, -0.2));
  k.bumper('front', y0, y1, wrapF, col, k.lit(col, 0.18), k.lit(col, -0.2));
}
/** The dark interior of an open cockpit / bed between x0..x1 on the top planes. */
function tub(k: RivalKit, x0: number, x1: number, u0 = 0.07, u1 = 0.93, col = '#121315') {
  k.fill(k.topPatch(x0, x1, u0, u1, 0.002, 6), col);
  k.fill(k.topPatch(x0, x1, u1 - 0.05, u1, 0.003, 6), k.lit(k.paint, -0.35));
}
/** An extruded aerofoil (a wing element or a spoiler lip) in the given colours. */
function foil(k: RivalKit, pts: P[], top: string, face: string, edge?: string) {
  k.extrude(pts, (n) => (n.y > 0.4 ? top : k.lit(face, -0.15)));
  k.fill(pts, face);
  if (edge) { k.ctx.strokeStyle = edge; k.ctx.lineWidth = 0.014; k.ctx.beginPath(); k.ctx.moveTo(pts[3].x, pts[3].y); k.ctx.lineTo(pts[2].x, pts[2].y); k.ctx.stroke(); }
}

// ---------------------------------------------------------------- the cars

export const RIVAL_ART: Record<string, RivalArt> = {
  // ======== Scrapyard ========
  // Pellet K-Van — a cab-over kei microvan: no hood at all, a flat face, tiny wheels pushed to the corners, a tall
  // glass box with a sliding door and a roof rack.
  'rv-kvan': {
    def: {
      L: 3.4, width: 1.48, rx: 0.55, fx: 2.92, r: 0.25, tireW: 0.11, rearTireW: 0.11, sill: 0.27, archGap: 0.05, flare: 0,
      profile: [[0.04, 0.27, 0.02], [0, 0.36, 0.03], [0, 1.74, 0.05], [0.08, 1.86, 0.08], [2.72, 1.87, 0.12, 'g'], [3.27, 1.12, 0.04], [3.36, 0.92, 0.06], [3.4, 0.42, 0.04], [3.32, 0.27, 0.02]],
      glass: [
        [[0.12, 1.12, 0.02], [0.12, 1.72, 0.04], [1.05, 1.74, 0.03], [1.05, 1.12, 0.02]],
        [[1.18, 1.12, 0.02], [1.18, 1.74, 0.03], [2.06, 1.74, 0.03], [2.06, 1.12, 0.02]],
        [[2.2, 1.12, 0.02], [2.2, 1.76, 0.03], [2.76, 1.76, 0.04], [3.17, 1.18, 0.02]],
      ],
      belt: 1.1, wheel: { kind: 'steel', rim: 0.56, ...TIRE }, cabin: { seat: '#5d6b74' },
    },
    tail: { x: 0.03, y: 0.8, len: 0.06 }, lampY: 0.72,
    body(k) {
      // two-tone: the trim colour below a crease, a pinstripe on it
      k.rect(0, 0, k.d.L, 0.66, k.trim);
      k.rect(0, 0.655, k.d.L, 0.018, 'rgba(255,255,255,0.55)');
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.12, 1.82], [1.12, lo]]); k.seam([[2.13, 1.82], [2.13, lo]]);
      k.seam([[3.2, 1.12], [3.24, 0.62]]);
      // the sliding door's rail and its handle, the front door handle
      k.rect(0.25, 1.06, 1.95, 0.025, 'rgba(8,10,12,0.75)');
      if (k.detail) { k.handle(1.9, 0.98); k.handle(2.3, 1.0); }
      // tall tail lamp strip on the rear corner, a side indicator by the front wheel
      tailLamp(k, 0.62, 0.36, 0.05);
      k.rect(3.25, 0.78, 0.1, 0.05, '#e59a2c', 0.02);
      k.mirror(3.08, 1.16, '#151719');
    },
    top(k) {
      // roof rack: two rails and five bars across the flat roof
      k.ctx.strokeStyle = '#1b1e21'; k.ctx.lineWidth = 0.03;
      for (let x = 0.35; x <= 2.45; x += 0.52) k.across(x, 0.06, 0.94, 0.07);
      for (const u of [0.94, 0.06]) tube(k, [k.P3(0.25, u, 1.94), k.P3(2.55, u, 1.94)], 0.035, '#24282c');
      for (const x of [0.3, 2.5]) tube(k, [k.P3(x, 0.06, 1.87), k.P3(x, 0.06, 1.94)], 0.03, '#24282c');
    },
    face(k) {
      grille(k, 0.32, 0.68, 0.6, 0.82, 3, '#14161a', '#3a3f44');
      roundLamps(k, [0.15, 0.85], 0.72, 0.075, 0.065, '#cfd4d8');
      k.fill(k.quad(0.05, 0.25, 0.56, 0.6), '#e59a2c');
      k.fill(k.quad(0.75, 0.95, 0.56, 0.6), '#e59a2c');
      k.fill(k.ellipse(0.5, 0.9, 0.05, 0.04), k.trim);
      blackBumpers(k, 0.3, 0.48, 0.32, 0.3);
    },
  },

  // Mote 660 — a tall-boy kei hatch: barely three metres, wheels at the very corners, a huge glasshouse on thin
  // pillars, a contrast roof, big round eyes on a stubby nose.
  'rv-mote': {
    def: {
      L: 3.16, width: 1.46, rx: 0.5, fx: 2.68, r: 0.26, tireW: 0.105, rearTireW: 0.105, sill: 0.28, archGap: 0.05, flare: 0,
      profile: [[0.05, 0.28, 0.02], [0, 0.38, 0.03], [0.01, 1.46, 0.08], [0.1, 1.6, 0.08], [1.95, 1.62, 0.12, 'g'], [2.55, 1.02, 0.05], [3.02, 0.92, 0.12], [3.15, 0.74, 0.06], [3.16, 0.4, 0.04], [3.08, 0.28, 0.02]],
      glass: [
        [[0.12, 1.06, 0.02], [0.13, 1.52, 0.04], [0.88, 1.54, 0.03], [0.88, 1.06, 0.02]],
        [[1.0, 1.06, 0.02], [1.0, 1.55, 0.03], [1.98, 1.55, 0.04], [2.46, 1.07, 0.02]],
      ],
      belt: 1.02, wheel: { kind: 'cover', rim: 0.6, ...TIRE }, cabin: { seat: '#c8b48a' },
    },
    tail: { x: 0.03, y: 0.9, len: 0.07 }, lampY: 0.7,
    side(k) {
      const lo = lower(k);
      k.seam([[0.95, 1.6], [0.95, lo]]);
      k.seam([[2.42, 1.02], [2.45, 0.62], [2.36, lo]]);
      if (k.detail) k.handle(1.08, 0.92);
      // rubber rubbing strip with a bright cap, tall tail lamp, round side marker
      k.rect(0.03, 0.52, k.d.L - 0.08, 0.06, '#1c1e21', 0.025);
      k.rect(0.05, 0.565, k.d.L - 0.12, 0.01, 'rgba(230,232,235,0.5)');
      tailLamp(k, 0.74, 0.32, 0.06, '#f2f2ee');
      k.fill(k.ellipse0(2.95, 0.7, 0.035, 0.03), '#e59a2c');
      k.mirror(2.38, 1.04, k.paint);
    },
    top(k) {
      // the contrast roof, edged by a drip rail, and a stubby antenna
      // drawn at the roof's own height (the flat roof has no top plane for topPatch to follow)
      const roof = [k.P3(0.3, 0.02, 1.603), k.P3(1.9, 0.02, 1.623), k.P3(1.9, 0.98, 1.623), k.P3(0.3, 0.98, 1.603)];
      k.fill(roof, k.trim);
      k.ctx.strokeStyle = k.lit(k.trim, -0.3); k.ctx.lineWidth = 0.014;
      k.path(roof); k.ctx.stroke();
      tube(k, [k.P3(0.4, 0.8, 1.62), k.P3(0.32, 0.8, 1.9)], 0.012, '#15171a');
    },
    face(k) {
      // a small oval grille between big round eyes, a smiling lower intake
      k.fill(k.ellipse(0.5, 0.62, 0.16, 0.05), '#16181b');
      for (const y of [0.6, 0.64]) k.fill(k.quad(0.38, 0.62, y - 0.005, y + 0.005), '#4a5056');
      roundLamps(k, [0.16, 0.84], 0.7, 0.1, 0.085, '#dfe3e6');
      k.fill(k.quad(0.22, 0.78, 0.44, 0.5), '#121416');
      blackBumpers(k, 0.3, 0.5, 0.35, 0.3, '#3b3e42');
    },
  },

  // Brava 850 — a little 1970s two-door notchback saloon: upright glasshouse on thin pillars, a short boot, chrome
  // bumpers and round lamps, a primer bonnet and a roof rack with a strapped-down crate.
  'rv-brava': {
    def: {
      L: 3.75, width: 1.56, rx: 0.7, fx: 3.06, r: 0.28, tireW: 0.1, rearTireW: 0.1, sill: 0.3, archGap: 0.055, flare: 0,
      profile: [[0.07, 0.3, 0.02], [0, 0.4, 0.03], [0, 0.8, 0.03], [0.05, 0.87, 0.03], [0.62, 0.89, 0.04], [1.0, 1.31, 0.06], [2.0, 1.34, 0.06, 'g'],
        [2.52, 0.93, 0.03], [3.6, 0.86, 0.06], [3.74, 0.79, 0.03], [3.75, 0.42, 0.03], [3.67, 0.3, 0.02]],
      glass: [
        [[0.98, 0.95, 0.02], [1.08, 1.26, 0.03], [1.42, 1.28, 0.02], [1.42, 0.95, 0.02]],
        [[1.5, 0.95, 0.02], [1.5, 1.28, 0.02], [2.0, 1.28, 0.03], [2.42, 0.95, 0.02]],
      ],
      belt: 0.93, wheel: { kind: 'steel', rim: 0.6, ...TIRE }, cabin: { seat: '#7a3a2a' },
    },
    tail: { x: 0.035, y: 0.66, len: 0.09 }, lampY: 0.66, chromeGlass: true,
    body(k) {
      for (const [x, y, r] of [[0.32, 0.42, 0.12], [3.42, 0.4, 0.1], [1.25, 0.36, 0.08]]) rust(k, x, y, r);
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.45, 1.3], [1.47, lo]]);
      k.seam([[2.48, 0.93], [2.5, 0.6], [2.42, lo]]);
      if (k.detail) k.handle(1.55, 0.86, true);
      k.rect(0.06, 0.6, k.d.L - 0.12, 0.022, 'rgba(232,236,240,0.85)');
      tailLamp(k, 0.6, 0.13, 0.07);
      k.fill(k.ellipse0(3.62, 0.66, 0.03, 0.03), '#e59a2c');
      k.mirror(2.36, 0.95, '#d9dee2');
    },
    top(k) {
      // primer bonnet, a roof rack and a crate strapped to it
      k.fill(k.topPatch(2.56, 3.62, 0.04, 0.96, 0.002, 6), '#858a83');
      k.ctx.strokeStyle = '#2a2c2e'; k.ctx.lineWidth = 0.025;
      for (const x of [1.15, 1.85]) k.across(x, 0.08, 0.92, 0.05);
      for (const u of [0.92, 0.08]) tube(k, [k.P3(1.05, u, 1.39), k.P3(1.95, u, 1.39)], 0.03, '#2e3134');
      box(k, 1.2, 1.8, 0.22, 0.78, 1.39, 0.17, '#9a7a4e', '#7d6140', '#6b5236');
      k.ctx.strokeStyle = '#d23a2a'; k.ctx.lineWidth = 0.02; k.ctx.beginPath();
      const a = k.P3(1.5, 0.22, 1.39), b = k.P3(1.5, 0.22, 1.56), c = k.P3(1.5, 0.78, 1.56);
      k.ctx.moveTo(a.x, a.y); k.ctx.lineTo(b.x, b.y); k.ctx.lineTo(c.x, c.y); k.ctx.stroke();
    },
    face(k) {
      grille(k, 0.27, 0.73, 0.56, 0.74, 3, '#111315', '#9aa0a5', '#d9dee3');
      roundLamps(k, [0.13, 0.87], 0.66, 0.08, 0.075);
      k.fill(k.ellipse(0.5, 0.78, 0.035, 0.03), '#c9a14a');
      chromeBumpers(k, 0.36, 0.47, 0.42, 0.4);
    },
  },

  // Haulmark 2500 — a tall rusty work pickup: square cab, long open bed, chrome grille the size of a door, steel
  // wheels, a side step and an amber beacon on the cab roof.
  'rv-haulmark': {
    def: {
      L: 5.05, width: 1.86, rx: 0.98, fx: 4.05, r: 0.37, tireW: 0.12, rearTireW: 0.12, sill: 0.5, archGap: 0.07, flare: 0.03,
      profile: [[0.03, 0.48, 0.02], [0, 0.56, 0.02], [0, 1.1, 0.02], [0.04, 1.14, 0.02], [1.9, 1.14, 0.02], [1.93, 1.78, 0.06], [2.02, 1.82, 0.06], [2.85, 1.83, 0.08, 'g'],
        [3.32, 1.33, 0.03], [4.82, 1.22, 0.08], [5.03, 1.1, 0.04], [5.05, 0.58, 0.04], [4.96, 0.48, 0.02]],
      glass: [[[2.06, 1.36, 0.02], [2.06, 1.76, 0.03], [2.88, 1.76, 0.04], [3.22, 1.38, 0.02]]],
      belt: 1.32, wheel: { kind: 'steel', rim: 0.62, tire: '#222120', side: '#34302c' }, cabin: { seat: '#6a5a48' },
    },
    tail: { x: 0.03, y: 0.98, len: 0.08 }, lampY: 1.0,
    body(k) {
      for (const [x, y, r] of [[0.5, 0.62, 0.16], [1.65, 0.6, 0.12], [3.7, 1.0, 0.1], [4.7, 0.62, 0.14]]) rust(k, x, y, r);
      // a lighter band along the bed side
      k.rect(0.04, 0.98, 1.86, 0.04, 'rgba(255,255,255,0.1)');
    },
    side(k) {
      const lo = lower(k);
      k.seam([[0.06, 1.12], [0.06, 0.52]]);
      k.seam([[1.97, 1.8], [1.97, lo]], 0.02);
      k.seam([[3.3, 1.32], [3.32, lo]]);
      if (k.detail) k.handle(2.15, 1.24, true);
      tailLamp(k, 0.8, 0.3, 0.06);
      // a side step under the cab, a fuel door on the bed
      k.rect(2.0, 0.4, 1.25, 0.06, '#1b1d20', 0.02);
      k.rect(2.02, 0.455, 1.21, 0.012, 'rgba(255,255,255,0.25)');
      k.rect(1.45, 0.96, 0.16, 0.12, k.lit(k.paint, -0.12), 0.02);
      k.rect(4.88, 0.98, 0.12, 0.06, '#e59a2c', 0.02);
      k.mirror(3.18, 1.36, '#15171a');
      k.rect(3.08, 1.46, 0.3, 0.2, '#15171a', 0.03);
    },
    top(k) {
      // the open bed: a dark ribbed floor, the far wall lit, the near rail bright
      tub(k, 0.07, 1.88, 0.07, 0.93, '#1c1d1f');
      k.ctx.strokeStyle = 'rgba(255,255,255,0.08)'; k.ctx.lineWidth = 0.02;
      for (let u = 0.2; u < 0.9; u += 0.14) { const a = k.P3(0.12, u, 1.142), b = k.P3(1.84, u, 1.142); k.ctx.beginPath(); k.ctx.moveTo(a.x, a.y); k.ctx.lineTo(b.x, b.y); k.ctx.stroke(); }
      // amber beacon on the cab roof
      box(k, 2.32, 2.52, 0.38, 0.62, 1.83, 0.09, '#ffb02e', '#d9821a', '#f0a02a');
      if (k.glow > 0 || k.fine) k.fill(k.ellipse0(k.P3(2.42, 0.5, 1.93).x, k.P3(2.42, 0.5, 1.93).y, 0.09, 0.05), 'rgba(255,190,60,0.35)');
      // hitch
      k.rect(-0.12, 0.47, 0.13, 0.06, '#141517', 0.01);
    },
    face(k) {
      grille(k, 0.24, 0.76, 0.78, 1.1, 5, '#0f1113', '#c9cfd4', '#e3e7ea');
      rectLamps(k, 0.03, 0.2, 0.9, 1.05, '#d4d9dd', true);
      k.fill(k.quad(0.03, 0.2, 0.82, 0.87), '#e59a2c');
      k.fill(k.quad(0.8, 0.97, 0.82, 0.87), '#e59a2c');
      chromeBumpers(k, 0.52, 0.72, 0.55, 0.4);
    },
  },

  // Dray Courier — a high-roof delivery van: a short sloped nose, one small cab window, a vast blank flank with the
  // owner's sign, a sliding door on its rail and a ladder on the roof rack.
  'rv-dray': {
    def: {
      L: 4.7, width: 1.8, rx: 0.82, fx: 3.85, r: 0.32, tireW: 0.115, rearTireW: 0.115, sill: 0.34, archGap: 0.05, flare: 0,
      profile: [[0.04, 0.34, 0.02], [0, 0.42, 0.02], [0, 1.84, 0.05], [0.06, 1.93, 0.06], [3.18, 1.94, 0.14, 'g'], [3.7, 1.22, 0.05], [4.48, 1.02, 0.14], [4.68, 0.86, 0.06], [4.7, 0.46, 0.04], [4.62, 0.34, 0.02]],
      glass: [[[3.02, 1.22, 0.02], [3.02, 1.82, 0.03], [3.23, 1.83, 0.03], [3.62, 1.27, 0.02]]],
      belt: 1.2, wheel: { kind: 'cover', rim: 0.58, ...TIRE }, cabin: { seat: '#41474d' },
    },
    tail: { x: 0.03, y: 0.82, len: 0.07 }, lampY: 0.84,
    body(k) {
      // the sign board: a light panel with a spark and a name on it
      const { ctx } = k;
      k.rect(0.3, 1.0, 2.45, 0.62, '#f3f1ea', 0.06);
      k.rect(0.3, 1.0, 2.45, 0.1, k.trim, 0.03);
      ctx.fillStyle = k.trim;
      ctx.beginPath(); // the spark
      const sx = 0.62, sy = 1.38;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? 0.07 : 0.2; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      if (k.detail) k.label('SPARKS', 0.9, 1.3, 0.24, '#1d2a33', '900');
      else { k.rect(0.92, 1.3, 1.6, 0.13, '#25323b', 0.02); k.rect(0.92, 1.18, 1.1, 0.06, '#5c6870', 0.02); }
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.9, 1.88], [1.9, lo]]); k.seam([[2.96, 1.9], [2.96, lo]]);
      k.seam([[0.05, 1.86], [0.05, 0.42]]);
      k.rect(0.35, 1.9, 2.65, 0.02, 'rgba(8,10,12,0.6)');
      k.rect(0.05, 0.5, k.d.L - 0.1, 0.07, '#1b1d20', 0.03);
      if (k.detail) { k.handle(2.7, 0.95); k.handle(3.1, 1.08); }
      tailLamp(k, 0.6, 0.42, 0.05);
      k.mirror(3.5, 1.3, '#15171a');
      k.rect(3.4, 1.38, 0.28, 0.24, '#15171a', 0.03);
    },
    top(k) {
      // roof rack and a ladder on it
      k.ctx.strokeStyle = '#25292d'; k.ctx.lineWidth = 0.03;
      for (const x of [0.4, 1.4, 2.4]) k.across(x, 0.08, 0.92, 0.06);
      for (const u of [0.78, 0.58]) tube(k, [k.P3(0.15, u, 2.02), k.P3(2.95, u, 2.02)], 0.035, '#b9c0c6');
      k.ctx.strokeStyle = '#a3aab0'; k.ctx.lineWidth = 0.022;
      for (let x = 0.3; x < 2.9; x += 0.3) { const a = k.P3(x, 0.58, 2.02), b = k.P3(x, 0.78, 2.02); k.ctx.beginPath(); k.ctx.moveTo(a.x, a.y); k.ctx.lineTo(b.x, b.y); k.ctx.stroke(); }
      box(k, 1.2, 1.5, 0.3, 0.5, 1.94, 0.05, '#2b2f33', '#1a1d20', '#202326');
    },
    face(k) {
      grille(k, 0.3, 0.7, 0.62, 0.88, 3, '#111315', '#2e3337');
      rectLamps(k, 0.03, 0.27, 0.78, 0.94, '#16181b', true);
      k.fill(k.quad(0.03, 0.27, 0.72, 0.76), '#e59a2c');
      k.fill(k.quad(0.73, 0.97, 0.72, 0.76), '#e59a2c');
      blackBumpers(k, 0.36, 0.6, 0.5, 0.35);
    },
  },

  // Ostler Estate — a long, low 1970s estate wagon: a roof that runs to the tail, three side windows, woodgrain
  // flanks in a bright frame, roof rails, a primer bonnet and rust breaking through.
  'rv-ostler': {
    def: {
      L: 4.95, width: 1.78, rx: 1.0, fx: 3.97, r: 0.31, tireW: 0.11, rearTireW: 0.11, sill: 0.3, archGap: 0.055, flare: 0,
      profile: [[0.06, 0.3, 0.02], [0, 0.4, 0.03], [0.01, 0.86, 0.04], [0.06, 1.36, 0.06], [0.18, 1.42, 0.06], [2.95, 1.43, 0.1, 'g'],
        [3.52, 0.98, 0.04], [4.76, 0.9, 0.08], [4.93, 0.82, 0.04], [4.95, 0.44, 0.04], [4.86, 0.3, 0.02]],
      glass: [
        [[0.2, 1.0, 0.02], [0.24, 1.36, 0.03], [1.25, 1.37, 0.02], [1.25, 1.0, 0.02]],
        [[1.35, 1.0, 0.02], [1.35, 1.37, 0.02], [2.15, 1.37, 0.02], [2.15, 1.0, 0.02]],
        [[2.25, 1.0, 0.02], [2.25, 1.37, 0.02], [3.0, 1.37, 0.04], [3.42, 1.01, 0.02]],
      ],
      belt: 0.98, wheel: { kind: 'steel', rim: 0.6, ...TIRE }, cabin: { seat: '#8a5a3a' },
    },
    tail: { x: 0.04, y: 0.72, len: 0.1 }, lampY: 0.7, chromeGlass: true,
    body(k) {
      const { ctx } = k;
      // woodgrain flank in a bright frame
      const x0 = 0.12, x1 = 4.72, y0 = 0.47, y1 = 0.9;
      ctx.fillStyle = '#6e4526'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = 'rgba(40,22,10,0.45)'; ctx.lineWidth = 0.012;
      for (let i = 0; i < 6; i++) { const y = y0 + 0.05 + i * 0.065; ctx.beginPath(); ctx.moveTo(x0, y); for (let x = x0; x < x1; x += 0.4) ctx.quadraticCurveTo(x + 0.2, y + (i % 2 ? 0.02 : -0.02), x + 0.4, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(x0, y1 - 0.12, x1 - x0, 0.08);
      ctx.strokeStyle = '#d9cfb8'; ctx.lineWidth = 0.025; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      for (const [x, y, r] of [[0.6, 0.38, 0.14], [3.75, 0.42, 0.11], [2.3, 0.36, 0.09], [4.6, 0.95, 0.07]]) rust(k, x, y, r);
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.3, 1.4], [1.32, lo]]); k.seam([[2.2, 1.41], [2.2, lo]]);
      k.seam([[3.42, 0.98], [3.46, 0.6], [3.38, lo]]);
      if (k.detail) { k.handle(1.45, 0.94, true); k.handle(2.35, 0.94, true); }
      tailLamp(k, 0.6, 0.24, 0.08);
      k.mirror(3.3, 1.0, '#d9dee2');
    },
    top(k) {
      k.fill(k.topPatch(3.56, 4.74, 0.04, 0.96, 0.002, 6), '#8a8e86');
      for (const u of [0.92, 0.08]) tube(k, [k.P3(0.2, u, 1.47), k.P3(2.85, u, 1.47)], 0.035, '#c9ced3');
      k.ctx.strokeStyle = '#8d949a'; k.ctx.lineWidth = 0.025;
      for (const x of [0.6, 2.4]) k.across(x, 0.08, 0.92, 0.04);
    },
    face(k) {
      grille(k, 0.25, 0.75, 0.6, 0.8, 0, '#0d0f11', '#000', '#d9dee3');
      for (let i = 1; i < 9; i++) k.fill(k.quad(0.25 + i * 0.0555 - 0.005, 0.25 + i * 0.0555 + 0.005, 0.6, 0.8), '#5a6066');
      rectLamps(k, 0.03, 0.22, 0.62, 0.78, '#d4d9dd', true);
      k.fill(k.ellipse(0.5, 0.7, 0.04, 0.04), '#c9a14a');
      chromeBumpers(k, 0.36, 0.5, 0.5, 0.45);
    },
  },

  // ======== Suburbs ========
  // Lark Roadster — a small open two-seater: a framed windscreen, two tan seats, the driver's head over the door,
  // a folded hood behind, an oval mouth and faired lamps.
  'rv-lark': {
    def: {
      L: 3.95, width: 1.7, rx: 0.72, fx: 3.08, r: 0.3, tireW: 0.125, rearTireW: 0.125, sill: 0.24, archGap: 0.035, flare: 0.02,
      profile: [[0.08, 0.24, 0.02], [0, 0.34, 0.03], [0, 0.74, 0.04], [0.06, 0.86, 0.04], [0.95, 0.9, 0.06], [1.28, 0.9, 0.03], [1.32, 0.83, 0.02], [2.12, 0.83, 0.02],
        [2.18, 1.16, 0.02, 'g'], [2.55, 0.9, 0.04], [3.75, 0.78, 0.14], [3.93, 0.62, 0.07], [3.95, 0.34, 0.04], [3.86, 0.24, 0.02]],
      glass: [],
      belt: 0.82, wheel: { kind: 'split', rim: 0.72, ...TIRE, caliper: '#e03a2e', rimCol: '#c9ced3' }, cabin: { seat: '#b98a5a' },
    },
    tail: { x: 0.04, y: 0.66, len: 0.08 }, lampY: 0.62,
    side(k) {
      const lo = lower(k);
      k.seam([[1.36, 0.84], [1.38, lo]]); k.seam([[2.36, 0.88], [2.4, lo]]);
      if (k.detail) k.handle(2.0, 0.76, true);
      // a chrome gill behind the front wheel
      for (let i = 0; i < 3; i++) k.rect(2.55 + i * 0.07, 0.48, 0.035, 0.18, '#0d0f11', 0.015);
      k.rect(2.52, 0.47, 0.24, 0.012, '#d9dee2');
      tailLamp(k, 0.6, 0.12, 0.07);
      k.mirror(2.22, 0.86, k.paint);
    },
    top(k) {
      tub(k, 1.33, 2.11);
      // seat backs, the driver, the folded hood and the windscreen frame
      for (const u of [0.72, 0.3]) box(k, 1.34, 1.46, u - 0.13, u + 0.13, 0.83, 0.32, k.lit('#b98a5a', 0.15), '#8a6440', '#a07450');
      driver(k, 1.6, 0.3, 1.13, k.trim);
      box(k, 0.95, 1.27, 0.05, 0.95, 0.9, 0.08, '#2e2a26', '#22201c', '#272420');
      tube(k, [k.P3(2.18, 0, 1.16), k.P3(2.18, 1, 1.16)], 0.03, '#d9dee2');
      tube(k, [k.P3(2.12, 0.02, 0.84), k.P3(2.18, 0.02, 1.16)], 0.025, '#d9dee2');
    },
    face(k) {
      k.fill(k.ellipse(0.5, 0.42, 0.22, 0.075), '#d9dee3');
      k.fill(k.ellipse(0.5, 0.42, 0.19, 0.058), '#0c0e10');
      for (let i = -2; i <= 2; i++) k.fill(k.quad(0.5 + i * 0.06 - 0.005, 0.5 + i * 0.06 + 0.005, 0.37, 0.47), '#4a5056');
      for (const u of [0.15, 0.85]) {
        k.fill(k.ellipse(u, 0.62, 0.11, 0.06), '#1a2026');
        k.fill(k.ellipse(u, 0.62, 0.07, 0.045), k.lens(true));
        k.fill(k.ellipse(u, 0.625, 0.1, 0.055), k.glow > 0 ? 'rgba(255,244,214,0.45)' : 'rgba(190,220,240,0.3)');
      }
    },
  },

  // Vanta Coupé — a compact front-drive hatch coupé: a long rounded fastback, a hatch spoiler, slim slit lamps over a
  // big lower intake, forged wheels and a contrast lower body.
  'rv-vanta': {
    def: {
      L: 4.1, width: 1.72, rx: 0.76, fx: 3.24, r: 0.3, tireW: 0.125, rearTireW: 0.125, sill: 0.23, archGap: 0.035, flare: 0.03,
      profile: [[0.08, 0.23, 0.02], [0, 0.33, 0.03], [0, 0.72, 0.05], [0.1, 0.95, 0.08], [0.5, 1.15, 0.25], [1.3, 1.29, 0.25], [1.95, 1.28, 0.12, 'g'],
        [2.7, 0.92, 0.04], [3.82, 0.76, 0.18], [4.08, 0.58, 0.08], [4.1, 0.32, 0.04], [4.0, 0.23, 0.02]],
      glass: [
        [[0.62, 0.97, 0.02], [0.95, 1.17, 0.06], [1.35, 1.22, 0.03], [1.4, 0.97, 0.02]],
        [[1.5, 0.97, 0.02], [1.5, 1.23, 0.03], [1.96, 1.22, 0.05], [2.6, 0.95, 0.02]],
      ],
      belt: 0.94, wheel: { kind: 'forged', rim: 0.74, ...TIRE, caliper: '#f2b33d', rimCol: '#25272b' }, cabin: { seat: '#202226' },
    },
    tail: { x: 0.03, y: 0.8, len: 0.08 }, lampY: 0.58,
    body(k) {
      k.rect(0, 0, k.d.L, 0.4, '#1d1f23');
      k.rect(0, 0.395, k.d.L, 0.014, k.trim);
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.45, 1.22], [1.47, lo]]);
      k.seam([[2.62, 0.93], [2.66, 0.5], [2.56, lo]]);
      if (k.detail) k.handle(1.58, 0.86);
      k.rect(0, 0.76, 0.13, 0.06, '#c8241d', 0.02);
      k.rect(0, 0.82, 0.1, 0.012, '#f2f2ee');
      k.mirror(2.5, 0.95, k.paint);
    },
    top(k) {
      foil(k, [k.pt(0.02, 0.96), k.pt(0.3, 1.06), k.pt(0.27, 1.1), k.pt(-0.04, 1.01)], k.lit(k.paint, 0.15), k.lit(k.paint, -0.1), k.trim);
    },
    face(k) {
      k.fill(k.quad(0.14, 0.86, 0.25, 0.44), '#0d0f11');
      for (let i = 0; i < 3; i++) k.fill(k.quad(0.16, 0.84, 0.29 + i * 0.045, 0.3 + i * 0.045), '#2a2e33');
      rectLamps(k, 0.03, 0.28, 0.55, 0.61, '#101215', false);
      k.fill(k.quad(0.03, 0.28, 0.62, 0.635), k.glow > 0 ? '#e8fbff' : '#bfe8ff');
      k.fill(k.quad(0.72, 0.97, 0.62, 0.635), k.glow > 0 ? '#e8fbff' : '#bfe8ff');
      k.fill(k.quad(0.4, 0.6, 0.5, 0.56), '#14171a');
      k.fill(k.quad(-0.01, 1.01, 0.2, 0.23), '#121417');
    },
  },

  // Cordell Six — the sleeper: a plain, square four-door family sedan with flat lamps, a one-bar grille and grey
  // wheels. Only the fat rear tyres and the twin pipes give it away.
  'rv-cordell': {
    def: {
      L: 4.9, width: 1.82, rx: 0.98, fx: 3.88, r: 0.33, tireW: 0.13, rearTireW: 0.145, sill: 0.27, archGap: 0.04, flare: 0,
      profile: [[0.07, 0.27, 0.02], [0, 0.37, 0.03], [0, 0.88, 0.03], [0.05, 0.95, 0.03], [0.95, 0.98, 0.05], [1.32, 1.4, 0.08], [2.82, 1.42, 0.08, 'g'],
        [3.4, 1.0, 0.03], [4.72, 0.94, 0.05], [4.89, 0.86, 0.03], [4.9, 0.42, 0.03], [4.82, 0.27, 0.02]],
      glass: [
        [[1.32, 1.03, 0.02], [1.46, 1.34, 0.03], [2.05, 1.36, 0.02], [2.05, 1.03, 0.02]],
        [[2.15, 1.03, 0.02], [2.15, 1.36, 0.02], [2.84, 1.36, 0.03], [3.3, 1.03, 0.02]],
      ],
      belt: 1.0, wheel: { kind: 'split', rim: 0.7, ...TIRE, caliper: '#2a2d31', rimCol: '#7e858c' }, cabin: { seat: '#4b4f55' },
    },
    tail: { x: 0.04, y: 0.76, len: 0.14 }, lampY: 0.76, chromeGlass: true,
    side(k) {
      const lo = lower(k);
      k.seam([[2.1, 1.38], [2.1, lo]]);
      k.seam([[1.3, 1.0], [1.32, 0.62], [1.4, lo]]);
      k.seam([[3.32, 1.0], [3.36, 0.6], [3.3, lo]]);
      if (k.detail) { k.handle(1.48, 0.9, true); k.handle(2.26, 0.9, true); }
      k.rect(0.05, 0.56, k.d.L - 0.1, 0.07, '#17191b', 0.03);
      k.rect(0.08, 0.61, k.d.L - 0.16, 0.01, 'rgba(230,232,235,0.55)');
      tailLamp(k, 0.68, 0.17, 0.12);
      if (k.detail) k.label('SIX', 3.95, 0.66, 0.08, '#d9dee2', '800');
      // twin pipes under the bumper: the only tell
      for (const y of [0.24, 0.3]) { k.rect(-0.12, y, 0.16, 0.045, '#9aa1a8', 0.02); k.fill(k.ellipse0(-0.12, y + 0.022, 0.012, 0.02), '#0b0c0e'); }
      k.mirror(3.25, 1.02, k.paint);
    },
    top(k) {
      tube(k, [k.P3(0.3, 0.8, 0.98), k.P3(0.22, 0.8, 1.32)], 0.01, '#15171a');
    },
    face(k) {
      rectLamps(k, 0.02, 0.25, 0.68, 0.84, '#16181b', true);
      k.fill(k.quad(0.27, 0.73, 0.7, 0.82), '#101214');
      k.fill(k.quad(0.27, 0.73, 0.755, 0.77), '#c9cfd4');
      k.fill(k.ellipse(0.5, 0.762, 0.035, 0.03), k.lit(k.paint, 0.3));
      k.fill(k.quad(0.0, 0.03, 0.68, 0.84), '#e59a2c');
      k.fill(k.quad(0.97, 1.0, 0.68, 0.84), '#e59a2c');
      k.bumper('rear', 0.36, 0.52, 0.5, k.lit(k.paint, -0.08), k.lit(k.paint, 0.12), k.lit(k.paint, -0.25));
      k.bumper('front', 0.36, 0.52, 0.5, k.lit(k.paint, -0.08), k.lit(k.paint, 0.12), k.lit(k.paint, -0.25));
      k.rect(-0.06, 0.43, 0.5, 0.03, '#17191b'); k.rect(4.45, 0.43, 0.52, 0.03, '#17191b');
    },
  },

  // ======== Downtown and the coast ========
  // Prism 88 — a razor-edged 1980s wedge: a nose barely off the ground, flat planes and sharp creases, louvres over
  // the rear glass, pop-up lamp lids, a charcoal lower body under a pinstripe.
  'rv-prism': {
    def: {
      L: 4.55, width: 1.86, rx: 0.9, fx: 3.72, r: 0.33, tireW: 0.13, rearTireW: 0.15, sill: 0.22, archGap: 0.035, flare: 0.02,
      profile: [[0.07, 0.22, 0.01], [0, 0.32, 0.02], [0, 0.86, 0.02], [0.04, 0.92, 0.02], [0.72, 0.95, 0.02], [1.55, 1.16, 0.04], [2.25, 1.17, 0.04, 'g'],
        [2.85, 0.86, 0.02], [4.45, 0.66, 0.03], [4.55, 0.58, 0.02], [4.55, 0.3, 0.02], [4.46, 0.22, 0.01]],
      glass: [
        [[1.05, 0.9, 0.01], [1.55, 1.1, 0.02], [1.85, 1.11, 0.01], [1.85, 0.9, 0.01]],
        [[1.94, 0.9, 0.01], [1.94, 1.11, 0.01], [2.25, 1.11, 0.02], [2.75, 0.88, 0.01]],
      ],
      belt: 0.88, wheel: { kind: 'mag', rim: 0.74, ...TIRE, caliper: '#e8e2d0', rimCol: '#b9bfc5' }, cabin: { seat: '#2a2a2e' },
    },
    tail: { x: 0.03, y: 0.77, len: 0.08 }, lampY: 0.5,
    body(k) {
      k.rect(0, 0, k.d.L, 0.5, '#24262a');
      k.rect(0, 0.5, k.d.L, 0.016, k.trim);
      // a crisp crease along the flank
      k.ctx.fillStyle = 'rgba(255,255,255,0.2)';
      k.ctx.beginPath(); k.ctx.moveTo(0.05, 0.74); k.ctx.lineTo(4.4, 0.62); k.ctx.lineTo(4.4, 0.6); k.ctx.lineTo(0.05, 0.72); k.ctx.closePath(); k.ctx.fill();
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.9, 1.1], [1.92, lo]]);
      k.seam([[2.8, 0.86], [2.84, 0.52], [2.76, lo]]);
      // an intake slot ahead of the rear wheel
      k.fill([k.pt(1.32, 0.78), k.pt(1.8, 0.8), k.pt(1.8, 0.7), k.pt(1.42, 0.66)], '#07080a');
      k.rect(0, 0.66, 0.06, 0.2, '#a5201b', 0.01);
      k.rect(0, 0.7, 0.06, 0.02, '#1a0a0a');
      k.mirror(2.65, 0.9, k.paint);
    },
    top(k) {
      // louvres over the rear glass, pop-up lamp lids on the hood, a lip on the tail
      k.ctx.strokeStyle = '#0b0c0e'; k.ctx.lineWidth = 0.03;
      for (let x = 0.82; x <= 1.45; x += 0.08) k.across(x, 0.12, 0.88, 0.012);
      k.ctx.strokeStyle = 'rgba(0,0,0,0.5)'; k.ctx.lineWidth = 0.01;
      for (const [u0, u1] of [[0.08, 0.32], [0.68, 0.92]] as const) { k.path(k.topPatch(3.9, 4.32, u0, u1, 0.002, 3)); k.ctx.stroke(); }
      foil(k, [k.pt(0.0, 0.92), k.pt(0.34, 0.94), k.pt(0.33, 0.98), k.pt(0.01, 0.98)], k.lit(k.paint, 0.12), k.lit(k.paint, -0.1));
    },
    face(k) {
      k.fill(k.quad(0.0, 1.0, 0.43, 0.53), '#0c0d0f');
      rectLamps(k, 0.05, 0.3, 0.46, 0.51, '#0c0d0f', false);
      for (let i = 0; i < 3; i++) k.fill(k.quad(0.36, 0.64, 0.45 + i * 0.025, 0.46 + i * 0.025), '#30343a');
      k.bumper('front', 0.24, 0.42, 0.5, '#1f2124', '#33363a', '#16181a');
      k.bumper('rear', 0.24, 0.42, 0.4, '#1f2124', '#33363a', '#16181a');
    },
  },

  // Aldermoor Regent — the longest saloon in the city: an upright formal roof under padded vinyl, a long hood with a
  // stand-up ornament, chrome on every edge, a wide grille of fine bars and polished multi-spoke wheels.
  'rv-regent': {
    def: {
      L: 5.35, width: 1.95, rx: 1.15, fx: 4.2, r: 0.35, tireW: 0.13, rearTireW: 0.13, sill: 0.3, archGap: 0.05, flare: 0,
      profile: [[0.08, 0.3, 0.02], [0, 0.4, 0.03], [0, 0.92, 0.03], [0.06, 1.0, 0.03], [1.05, 1.02, 0.05], [1.55, 1.46, 0.1], [3.05, 1.48, 0.1, 'g'],
        [3.58, 1.06, 0.03], [5.18, 1.0, 0.04], [5.33, 0.94, 0.03], [5.35, 0.42, 0.03], [5.26, 0.3, 0.02]],
      glass: [
        [[1.65, 1.06, 0.02], [1.72, 1.38, 0.03], [2.25, 1.41, 0.02], [2.25, 1.06, 0.02]],
        [[2.35, 1.06, 0.02], [2.35, 1.41, 0.02], [3.08, 1.41, 0.03], [3.5, 1.07, 0.02]],
      ],
      belt: 1.05, wheel: { kind: 'blade', rim: 0.72, ...TIRE, caliper: '#2a2d31', rimCol: '#dcdfe2' }, cabin: { seat: '#d9c7a8' },
    },
    tail: { x: 0.04, y: 0.78, len: 0.16 }, lampY: 0.76, chromeGlass: true,
    body(k) {
      // the vinyl roof wraps down the wide rear pillar; a gold coachline under the shoulder
      const { ctx } = k;
      ctx.fillStyle = '#1c1a19';
      ctx.beginPath(); ctx.moveTo(1.05, 1.02); ctx.lineTo(1.55, 1.46); ctx.lineTo(2.3, 1.48); ctx.lineTo(2.3, 1.42); ctx.lineTo(1.62, 1.42); ctx.lineTo(1.58, 1.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(1.1, 1.06, 0.4, 0.3);
      k.rect(0.1, k.d.belt - 0.11, k.d.L - 0.3, 0.012, '#d8b867');
    },
    side(k) {
      const lo = lower(k);
      k.seam([[2.3, 1.44], [2.3, lo]]);
      k.seam([[1.58, 1.04], [1.62, lo]]);
      k.seam([[3.52, 1.05], [3.56, 0.6], [3.46, lo]]);
      if (k.detail) { k.handle(1.72, 0.95, true); k.handle(2.45, 0.95, true); }
      k.rect(0.2, k.d.belt - 0.02, k.d.L - 0.4, 0.02, '#e9edf0');
      k.rect(1.6, 0.34, 2.45, 0.025, '#d9dee2');
      tailLamp(k, 0.6, 0.32, 0.08, '#f2f2ee');
      k.mirror(3.42, 1.06, '#d9dee2');
    },
    top(k) {
      k.fill(k.topPatch(1.58, 2.3, 0.0, 1.0, 0.003, 6), '#1c1a19');
      // the ornament on the hood's nose
      const b = k.P3(5.1, 0.5, k.ty(5.1));
      k.fill([k.pt(b.x - 0.03, b.y), k.pt(b.x + 0.03, b.y), k.pt(b.x + 0.015, b.y + 0.09), k.pt(b.x - 0.02, b.y + 0.09)], '#e3e7ea');
      k.fill(k.ellipse0(b.x, b.y + 0.12, 0.035, 0.035), '#f4f6f8');
    },
    face(k) {
      grille(k, 0.28, 0.72, 0.58, 0.92, 0, '#0c0d0f', '#000', '#e3e7ea');
      for (let i = 1; i < 12; i++) k.fill(k.quad(0.28 + i * 0.0367 - 0.004, 0.28 + i * 0.0367 + 0.004, 0.58, 0.92), '#b9c0c6');
      rectLamps(k, 0.03, 0.25, 0.7, 0.86, '#d4d9dd', true);
      k.fill(k.ellipse(0.5, 0.95, 0.03, 0.025), '#d8b867');
      chromeBumpers(k, 0.38, 0.56, 0.55, 0.55);
    },
  },

  // Tessera DR — a drift coupé: low notchback on stretched tyres in deep-dish wheels, bolted-on overfenders, a big
  // wing on stands, a roll cage, a red tow strap on the nose.
  'rv-tessera': {
    def: {
      L: 4.5, width: 1.8, rx: 0.9, fx: 3.5, r: 0.31, tireW: 0.14, rearTireW: 0.15, sill: 0.19, archGap: 0.025, flare: 0.07,
      profile: [[0.07, 0.2, 0.02], [0, 0.3, 0.03], [0, 0.78, 0.03], [0.05, 0.86, 0.03], [0.7, 0.88, 0.04], [1.15, 1.24, 0.08], [2.25, 1.27, 0.08, 'g'],
        [2.82, 0.91, 0.03], [4.3, 0.78, 0.07], [4.48, 0.66, 0.04], [4.5, 0.3, 0.04], [4.4, 0.2, 0.02]],
      glass: [
        [[1.16, 0.93, 0.02], [1.22, 1.18, 0.03], [1.6, 1.21, 0.02], [1.6, 0.93, 0.02]],
        [[1.68, 0.93, 0.02], [1.68, 1.21, 0.02], [2.25, 1.21, 0.04], [2.72, 0.92, 0.02]],
      ],
      belt: 0.9, wheel: { kind: 'dish', rim: 0.74, ...TIRE, caliper: '#d8312a' }, cabin: { seat: '#1d1f22', cage: true },
    },
    tail: { x: 0.03, y: 0.72, len: 0.1 }, lampY: 0.62,
    body(k) {
      // a sticker strip along the rocker and a windscreen-high slash in the trim colour
      k.rect(0, 0.2, k.d.L, 0.1, '#111214');
      k.ctx.fillStyle = k.trim;
      k.ctx.beginPath(); k.ctx.moveTo(1.0, 0.36); k.ctx.lineTo(2.9, 0.62); k.ctx.lineTo(3.1, 0.62); k.ctx.lineTo(1.2, 0.36); k.ctx.closePath(); k.ctx.fill();
    },
    side(k) {
      const lo = lower(k);
      k.seam([[1.64, 1.2], [1.66, lo]]);
      k.seam([[2.75, 0.9], [2.78, 0.5], [2.7, lo]]);
      if (k.detail) k.handle(1.78, 0.82);
      tailLamp(k, 0.64, 0.14, 0.1);
      k.rect(-0.08, 0.26, 0.1, 0.05, '#d23a2a');
      k.mirror(2.62, 0.93, k.paint);
    },
    top(k) {
      // overfender bolts round both arches
      const d = k.d;
      k.ctx.fillStyle = '#c9ced3';
      for (const [wx, gap] of [[d.fx, d.archGap], [d.rx, d.archGap + d.flare * 0.5]] as const) {
        const ar = d.r + gap + d.flare * 0.55;
        for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; k.ctx.beginPath(); k.ctx.arc(wx + Math.cos(a) * ar, d.r + 0.01 + Math.sin(a) * ar, 0.014, 0, Math.PI * 2); k.ctx.fill(); }
      }
      // the wing on two stands
      for (const u of [0.78, 0.22]) k.fill([k.P3(0.3, u, 0.88), k.P3(0.36, u, 0.88), k.P3(0.3, u, 1.14), k.P3(0.24, u, 1.14)], '#16181b');
      foil(k, [k.pt(-0.12, 1.13), k.pt(0.5, 1.16), k.pt(0.48, 1.21), k.pt(-0.1, 1.2)], '#2d3035', '#17191c', k.trim);
      k.fill([k.pt(-0.15, 1.06), k.pt(0.18, 1.08), k.pt(0.18, 1.26), k.pt(-0.15, 1.26)], '#1a1c20');
      // a front lip and the tow strap
      foil(k, [k.pt(4.2, 0.17), k.pt(4.6, 0.16), k.pt(4.6, 0.2), k.pt(4.2, 0.22)], '#2a2d31', '#141517');
    },
    face(k) {
      k.fill(k.quad(0.1, 0.9, 0.22, 0.44), '#0b0c0e');
      for (let i = 0; i < 4; i++) k.fill(k.quad(0.12, 0.88, 0.25 + i * 0.045, 0.26 + i * 0.045), '#24272b');
      rectLamps(k, 0.04, 0.27, 0.56, 0.66, '#0f1012', false);
      k.fill(k.quad(0.36, 0.64, 0.58, 0.64), '#111315');
      k.fill(k.quad(0.74, 0.8, 0.22, 0.38), '#d23a2a');
    },
  },

  // ======== Desert ========
  // Dunerunner T8 — a desert trophy truck: huge wheels hanging out of wide arches on long travel, a short bed with a
  // spare tyre and a cage over it, a light bar on the roof, a skid plate and a tube bumper.
  'rv-dunerunner': {
    def: {
      L: 5.4, width: 2.1, rx: 1.0, fx: 4.2, r: 0.45, tireW: 0.14, rearTireW: 0.14, sill: 0.74, archGap: 0.12, flare: 0.04,
      profile: [[0.1, 0.74, 0.03], [0, 0.8, 0.03], [0, 1.12, 0.03], [0.1, 1.18, 0.02], [1.95, 1.2, 0.03], [2.0, 1.78, 0.06], [2.1, 1.84, 0.06], [2.88, 1.84, 0.08, 'g'],
        [3.38, 1.36, 0.04], [4.95, 1.22, 0.1], [5.35, 1.02, 0.08], [5.4, 0.84, 0.04], [5.3, 0.74, 0.02]],
      glass: [[[2.1, 1.4, 0.02], [2.12, 1.78, 0.03], [2.92, 1.78, 0.04], [3.28, 1.42, 0.02]]],
      belt: 1.36, wheel: { kind: 'gravel', rim: 0.6, tire: '#1b1b1c', side: '#2a2a2c', caliper: '#e0a91f', rimCol: '#2b2d31' }, cabin: { seat: '#1b1d20', cage: true },
    },
    tail: { x: 0.05, y: 1.0, len: 0.08 }, lampY: 1.04,
    body(k) {
      k.rect(0, 0.74, k.d.L, 0.12, '#17191c');
      k.ctx.fillStyle = k.trim;
      k.ctx.beginPath(); k.ctx.moveTo(2.2, 1.3); k.ctx.lineTo(5.2, 1.12); k.ctx.lineTo(5.25, 1.05); k.ctx.lineTo(2.2, 1.2); k.ctx.closePath(); k.ctx.fill();
    },
    side(k) {
      k.seam([[3.3, 1.36], [3.34, 0.8]], 0.016);
      k.seam([[2.04, 1.78], [2.04, 0.8]], 0.016);
      // door number board
      k.rect(2.3, 0.92, 0.55, 0.34, '#f6f5f0', 0.04);
      k.label('8', 2.45, 0.98, 0.26, '#101216', 'italic 900');
      // shocks inside the arches and a small round tail lamp
      for (const wx of [k.d.rx, k.d.fx]) {
        k.ctx.strokeStyle = '#d9a51f'; k.ctx.lineWidth = 0.05; k.ctx.lineCap = 'round';
        k.ctx.beginPath(); k.ctx.moveTo(wx - 0.16, 0.56); k.ctx.lineTo(wx - 0.3, 1.0); k.ctx.stroke();
        k.ctx.strokeStyle = '#9aa1a8'; k.ctx.lineWidth = 0.025;
        k.ctx.beginPath(); k.ctx.moveTo(wx - 0.12, 0.5); k.ctx.lineTo(wx - 0.18, 0.7); k.ctx.stroke();
      }
      k.fill(k.ellipse0(0.02, 1.02, 0.035, 0.045), '#c3241d');
      k.mirror(3.22, 1.44, '#15171a');
    },
    top(k) {
      tub(k, 0.12, 1.92, 0.08, 0.92, '#1a1b1d');
      // the spare tyre lying in the bed
      const ring = (r: number) => { const pts: P[] = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; pts.push(k.P3(1.0 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 1.9, 1.2)); } return pts; };
      k.fill(ring(0.42), '#141415'); k.fill(ring(0.24), '#2b2d31'); k.fill(ring(0.1), '#0c0c0d');
      // the cage over the bed, far side first
      for (const u of [0.9, 0.1]) tube(k, [k.P3(2.02, u, 1.84), k.P3(0.35, u, 1.5), k.P3(0.12, u, 1.2)], 0.05, u > 0.5 ? '#2a2d31' : '#3a3e44');
      tube(k, [k.P3(0.35, 0.1, 1.5), k.P3(0.35, 0.9, 1.5)], 0.045, '#2a2d31');
      // the light bar across the roof's front edge
      box(k, 2.62, 2.8, 0.04, 0.96, 1.87, 0.09, '#1c1e21', '#121316', '#15171a');
      for (const u of [0.14, 0.32, 0.5, 0.68, 0.86]) { const p = k.P3(2.8, u, 1.915); k.fill(k.ellipse0(p.x, p.y, 0.022, 0.035), k.lens(true)); }
      tube(k, [k.P3(5.0, 0.05, 0.82), k.P3(5.48, 0.05, 0.86), k.P3(5.48, 0.95, 0.86)], 0.045, '#1d1f22');
    },
    face(k) {
      k.fill(k.quad(0.05, 0.95, 0.78, 0.9), '#a9b0b6');
      grille(k, 0.22, 0.78, 0.94, 1.14, 3, '#0d0f11', '#2e3337');
      for (const u of [0.08, 0.92]) { k.fill(k.ellipse(u, 1.04, 0.06, 0.05), '#1a1d20'); k.fill(k.ellipse(u, 1.04, 0.045, 0.038), k.lens(true)); }
    },
  },

  // Sandpiper Buggy — an open dune buggy: a short fibreglass tub, fat wheels standing proud, a tall roll cage with
  // lamps on its brow, the driver in a helmet, an exposed engine and pipes at the back.
  'rv-sandpiper': {
    def: {
      L: 3.55, width: 1.75, rx: 0.62, fx: 2.92, r: 0.36, tireW: 0.15, rearTireW: 0.17, sill: 0.44, archGap: 0.07, flare: 0,
      profile: [[0.1, 0.44, 0.02], [0, 0.52, 0.03], [0.02, 0.92, 0.06], [0.5, 0.96, 0.05], [0.62, 0.86, 0.02], [1.82, 0.86, 0.02], [1.98, 0.98, 0.04],
        [3.2, 0.94, 0.25], [3.55, 0.7, 0.1], [3.55, 0.52, 0.03], [3.45, 0.44, 0.02]],
      glass: [],
      belt: 0.86, wheel: { kind: 'dish', rim: 0.66, ...TIRE, caliper: '#3a3f44' }, cabin: { seat: '#2a2c30' },
    },
    tail: { x: 0.04, y: 0.8, len: 0.06 }, lampY: 0.78,
    side(k) {
      tube(k, [k.pt(0.95, 0.47), k.pt(2.5, 0.47)], 0.05, '#1d1f22');
      k.rect(1.0, 0.56, 0.42, 0.26, '#f6f5f0', 0.06);
      k.label('3', 1.11, 0.6, 0.2, '#101216', 'italic 900');
      k.fill(k.ellipse0(0.03, 0.8, 0.03, 0.035), '#c3241d');
    },
    top(k) {
      tub(k, 0.66, 1.8);
      box(k, 0.7, 0.84, 0.15, 0.45, 0.86, 0.3, '#2b2d31', '#1c1e21', '#222428');
      driver(k, 1.02, 0.3, 1.12, k.trim);
      // the exposed engine: block, chrome air filter, pipes
      box(k, 0.06, 0.44, 0.25, 0.75, 0.94, 0.16, '#3a3e44', '#25282c', '#2e3237');
      box(k, 0.16, 0.34, 0.38, 0.62, 1.1, 0.07, '#e3e7ea', '#b9c0c6', '#cfd5da');
      for (const u of [0.3, 0.7]) tube(k, [k.P3(0.12, u, 1.0), k.P3(-0.05, u, 1.08), k.P3(-0.1, u, 1.2)], 0.035, '#9aa1a8');
      // the cage, far side first, and its lamps
      const cage = (u: number, col: string) => tube(k, [k.P3(0.5, u, 0.95), k.P3(0.82, u, 1.62), k.P3(1.72, u, 1.58), k.P3(2.08, u, 0.98)], 0.045, col);
      cage(0.88, '#2a2d31');
      tube(k, [k.P3(0.82, 0.1, 1.62), k.P3(0.82, 0.88, 1.62)], 0.04, '#2a2d31');
      tube(k, [k.P3(1.72, 0.1, 1.58), k.P3(1.72, 0.88, 1.58)], 0.04, '#2a2d31');
      cage(0.1, '#3c4046');
      tube(k, [k.P3(0.82, 0.1, 1.62), k.P3(1.4, 0.1, 0.9)], 0.035, '#3c4046');
      for (const u of [0.32, 0.66]) { const p = k.P3(1.76, u, 1.62); k.fill(k.ellipse0(p.x, p.y, 0.05, 0.06), '#1a1c1f'); k.fill(k.ellipse0(p.x + 0.015, p.y, 0.03, 0.045), k.lens(true)); }
      tube(k, [k.P3(3.5, 0.08, 0.5), k.P3(3.68, 0.08, 0.55), k.P3(3.68, 0.92, 0.55)], 0.04, '#1d1f22');
      tube(k, [k.P3(0.05, 0.1, 0.5), k.P3(-0.12, 0.1, 0.55), k.P3(-0.12, 0.9, 0.55)], 0.04, '#1d1f22');
    },
    face(k) {
      for (const u of [0.2, 0.8]) { k.fill(k.ellipse(u, 0.78, 0.08, 0.06), '#1a1d20'); k.fill(k.ellipse(u, 0.78, 0.06, 0.045), k.lens(true)); }
      k.fill(k.quad(0.36, 0.64, 0.56, 0.66), '#121416');
    },
  },

  // ======== The Summit ========
  // Aster GT1 — a long-tail endurance racer: a mid-engined body that runs far behind the rear wheels, a dorsal roof
  // intake, lamp pods under clear covers, a wing on tall plates past the tail and a white race roundel.
  'rv-aster': {
    def: {
      L: 5.1, width: 2.0, rx: 1.05, fx: 3.95, r: 0.35, tireW: 0.15, rearTireW: 0.17, sill: 0.12, archGap: 0.03, flare: 0.06,
      profile: [[0.04, 0.14, 0.02], [0, 0.26, 0.03], [0, 0.78, 0.04], [0.1, 0.84, 0.04], [1.4, 0.9, 0.25], [2.2, 1.1, 0.25], [2.85, 1.12, 0.14, 'g'],
        [3.45, 0.82, 0.08], [4.6, 0.68, 0.2], [5.05, 0.44, 0.12], [5.1, 0.26, 0.03], [5.0, 0.13, 0.02]],
      glass: [[[2.25, 0.9, 0.03], [2.32, 1.05, 0.06], [2.82, 1.07, 0.05], [3.3, 0.86, 0.03]]],
      belt: 0.86, wheel: { kind: 'race', rim: 0.76, ...TIRE, caliper: '#f2b33d', rimCol: '#d0d3d6' }, cabin: { seat: '#1a1c20', cage: true, single: true }, number: '61',
    },
    tail: { x: 0.08, y: 0.66, len: 0.14 }, lampY: 0.52,
    trail: { ys: [0.3], len: 1.2, cols: ['rgba(255,255,240,0.95)', 'rgba(255,200,90,0.9)', 'rgba(255,120,40,0.45)', 'rgba(255,90,30,0)'] },
    side(k) {
      const lo = lower(k);
      k.seam([[3.32, 0.84], [3.36, 0.45], [3.28, lo]]);
      k.seam([[2.15, 1.04], [2.18, 0.45], [2.24, lo]]);
      // side intake ahead of the rear wheel, carbon sill, slim tail lamp
      k.fill([k.pt(2.1, 0.78), k.pt(1.55, 0.72), k.pt(1.45, 0.4), k.pt(1.95, 0.42)], '#060709');
      k.ctx.strokeStyle = k.lit(k.paint, 0.4); k.ctx.lineWidth = 0.015; k.ctx.stroke();
      k.carbon([k.pt(1.45, 0.1), k.pt(3.6, 0.1), k.pt(3.58, 0.2), k.pt(1.48, 0.2)]);
      k.rect(0, 0.6, 0.16, 0.06, '#d1202c', 0.02);
      tube(k, [k.pt(3.2, 0.86), k.pt(3.32, 0.98)], 0.02, '#111316');
      k.rect(3.22, 0.96, 0.2, 0.08, k.paint, 0.03);
    },
    top(k) {
      // the dorsal intake on the roof
      const y = k.ty(2.5);
      box(k, 1.7, 2.55, 0.36, 0.64, y - 0.02, 0.12, k.lit(k.paint, 0.15), k.lit(k.paint, -0.1), '#06070a', y - 0.02);
      // lamp pods under clear covers on the front fenders
      for (const [u0, u1] of [[0.08, 0.3], [0.7, 0.92]] as const) {
        k.fill(k.topPatch(4.45, 4.88, u0, u1, 0.004, 4), '#0d1116');
        k.fill(k.topPatch(4.6, 4.8, u0 + 0.04, u1 - 0.04, 0.008, 3), k.lens(false));
        k.fill(k.topPatch(4.45, 4.88, u0, u1, 0.012, 4), 'rgba(200,225,245,0.25)');
      }
      // the wing on tall plates past the tail, and the splitter
      for (const u of [0.78, 0.22]) k.fill([k.P3(0.35, u, 0.86), k.P3(0.45, u, 0.88), k.P3(0.2, u, 1.2), k.P3(0.12, u, 1.2)], '#15171a');
      foil(k, [k.pt(-0.38, 1.16), k.pt(0.38, 1.2), k.pt(0.36, 1.26), k.pt(-0.36, 1.24)], '#2d3035', '#16181b');
      k.fill([k.pt(-0.42, 0.95), k.pt(0.12, 0.98), k.pt(0.12, 1.3), k.pt(-0.42, 1.3)], '#1a1c20');
      k.rect(-0.4, 1.26, 0.5, 0.025, k.trim);
      foil(k, [k.pt(4.75, 0.11), k.pt(5.2, 0.1), k.pt(5.2, 0.135), k.pt(4.75, 0.16)], '#33363b', '#121316');
    },
    face(k) {
      k.fill(k.quad(0.1, 0.9, 0.16, 0.38), '#07080a');
      for (let i = 0; i < 3; i++) k.fill(k.quad(0.12, 0.88, 0.2 + i * 0.05, 0.21 + i * 0.05), '#23262a');
      for (const u of [0.13, 0.87]) { k.fill(k.ellipse(u, 0.52, 0.09, 0.06), '#101318'); k.fill(k.ellipse(u, 0.52, 0.06, 0.042), k.lens(false)); }
      k.fill(k.quad(0.44, 0.56, 0.42, 0.46), '#f2c230');
    },
  },

  // Halden Aero LM — a low-drag streamliner built by an aero engineer: a teardrop body, a bubble canopy, a centre fin
  // down the long tail and a spat that hides the rear wheel.
  'rv-halden': {
    def: {
      L: 5.2, width: 1.95, rx: 1.0, fx: 4.12, r: 0.34, tireW: 0.14, rearTireW: 0.15, sill: 0.15, archGap: 0.03, flare: 0,
      profile: [[0.05, 0.2, 0.02], [0, 0.32, 0.04], [0.05, 0.62, 0.15], [0.6, 0.84, 0.4], [1.8, 1.04, 0.4], [2.7, 1.1, 0.2, 'g'],
        [3.4, 0.8, 0.15], [4.7, 0.58, 0.3], [5.18, 0.36, 0.1], [5.2, 0.24, 0.03], [5.1, 0.15, 0.02]],
      glass: [[[2.0, 0.86, 0.04], [2.35, 1.02, 0.08], [2.7, 1.04, 0.05], [3.28, 0.82, 0.03]]],
      belt: 0.84, wheel: { kind: 'aero', rim: 0.76, ...TIRE, caliper: '#e8e2d0' }, cabin: { seat: '#2b2f36', single: true },
    },
    tail: { x: 0.1, y: 0.55, len: 0.14 }, lampY: 0.48,
    side(k) {
      const lo = lower(k);
      k.seam([[3.3, 0.8], [3.34, 0.45], [3.26, lo]]);
      k.seam([[1.95, 0.98], [1.98, lo]]);
      // three gills behind the front wheel and a polished strip along the waist
      for (let i = 0; i < 3; i++) k.fill([k.pt(3.5 + i * 0.09, 0.62), k.pt(3.55 + i * 0.09, 0.62), k.pt(3.5 + i * 0.09, 0.36), k.pt(3.45 + i * 0.09, 0.36)], '#07080a');
      k.rect(0.3, 0.7, 4.6, 0.014, '#e3e7ea');
      k.rect(0, 0.52, 0.18, 0.05, '#d1202c', 0.02);
    },
    top(k) {
      const d = k.d;
      // the spat over the rear wheel, then its seam and highlight
      const ar = d.r + d.archGap;
      const sp: P[] = [k.pt(d.rx - ar - 0.04, d.sill), k.pt(d.rx - ar - 0.04, 0.12)];
      sp.push(k.pt(d.rx + ar + 0.04, 0.12), k.pt(d.rx + ar + 0.04, d.sill));
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; sp.push(k.pt(d.rx + Math.cos(a) * (ar + 0.04), d.r + 0.01 + Math.sin(a) * (ar + 0.04))); }
      const g = k.ctx.createLinearGradient(0, d.belt, 0, 0.1);
      g.addColorStop(0, k.lit(k.paint, 0.08)); g.addColorStop(0.6, k.lit(k.paint, -0.08)); g.addColorStop(1, k.lit(k.paint, -0.4));
      k.fill(sp, g);
      k.ctx.strokeStyle = 'rgba(0,0,0,0.5)'; k.ctx.lineWidth = 0.012; k.path(sp); k.ctx.stroke();
      k.ctx.strokeStyle = 'rgba(255,255,255,0.25)'; k.ctx.beginPath(); k.ctx.arc(d.rx, d.r + 0.01, ar - 0.04, 0.4, Math.PI - 0.4); k.ctx.stroke();
      // the centre fin down the tail
      const fin = [k.P3(1.55, 0.5, 0.98), k.P3(0.45, 0.5, 1.12), k.P3(0.2, 0.5, 1.1), k.P3(0.16, 0.5, 0.64)];
      k.fill(fin, k.lit(k.paint, -0.06));
      k.ctx.strokeStyle = k.lit(k.paint, 0.45); k.ctx.lineWidth = 0.012;
      k.ctx.beginPath(); k.ctx.moveTo(fin[0].x, fin[0].y); k.ctx.lineTo(fin[1].x, fin[1].y); k.ctx.lineTo(fin[2].x, fin[2].y); k.ctx.stroke();
      k.rect(fin[2].x - 0.02, 1.08, 0.2, 0.03, k.trim);
    },
    face(k) {
      k.fill(k.ellipse(0.5, 0.3, 0.32, 0.075, 24), '#d9dee3');
      k.fill(k.ellipse(0.5, 0.3, 0.29, 0.06, 24), '#07080a');
      for (const u of [0.14, 0.86]) {
        k.fill(k.ellipse(u, 0.48, 0.11, 0.06, 20), '#131820');
        k.fill(k.ellipse(u, 0.48, 0.06, 0.045), k.lens(false));
        k.fill(k.ellipse(u, 0.485, 0.1, 0.055, 20), k.glow > 0 ? 'rgba(255,244,214,0.45)' : 'rgba(190,220,240,0.3)');
      }
    },
  },

  // ======== Azure Riviera ========
  // Corsair Targa — a mid-engined targa: a brushed targa bar over a black roof panel, a deep side intake split by a
  // blade, a slatted engine deck and a light bar across the tail.
  'rv-corsair': {
    def: {
      L: 4.45, width: 1.95, rx: 0.92, fx: 3.6, r: 0.34, tireW: 0.14, rearTireW: 0.165, sill: 0.15, archGap: 0.03, flare: 0.05,
      profile: [[0.06, 0.17, 0.02], [0, 0.3, 0.03], [0, 0.82, 0.03], [0.06, 0.9, 0.03], [0.9, 0.92, 0.06], [1.5, 1.12, 0.08], [2.45, 1.14, 0.1, 'g'],
        [3.15, 0.82, 0.05], [4.2, 0.68, 0.12], [4.43, 0.52, 0.06], [4.45, 0.3, 0.03], [4.35, 0.16, 0.02]],
      glass: [[[1.76, 0.88, 0.02], [1.8, 1.06, 0.04], [2.45, 1.08, 0.04], [3.02, 0.84, 0.02]]],
      belt: 0.86, wheel: { kind: 'forged', rim: 0.76, ...TIRE, caliper: '#f2c230', rimCol: '#c9ced3' }, cabin: { seat: '#2a1e1a' },
    },
    tail: { x: 0.05, y: 0.72, len: 0.24 }, lampY: 0.5,
    side(k) {
      const lo = lower(k);
      k.seam([[3.05, 0.84], [3.1, 0.45], [3.02, lo]]);
      // the brushed targa bar's side face
      k.fill([k.pt(1.28, 1.04), k.pt(1.5, 1.12), k.pt(1.74, 1.12), k.pt(1.7, 0.86), k.pt(1.32, 0.86)], '#b9bfc5');
      k.fill([k.pt(1.3, 1.02), k.pt(1.5, 1.1), k.pt(1.72, 1.1), k.pt(1.71, 1.08), k.pt(1.5, 1.08)], 'rgba(255,255,255,0.5)');
      // the side intake with its blade
      k.fill([k.pt(1.32, 0.78), k.pt(2.05, 0.72), k.pt(1.98, 0.36), k.pt(1.42, 0.36)], '#060709');
      k.fill([k.pt(1.38, 0.58), k.pt(2.02, 0.56), k.pt(2.02, 0.52), k.pt(1.4, 0.54)], k.lit(k.paint, 0.1));
      k.rect(0, 0.7, 0.3, 0.035, '#e0202e', 0.01);
      k.mirror(2.9, 0.86, k.paint);
    },
    top(k) {
      k.fill(k.topPatch(1.74, 2.42, 0.05, 0.95, 0.003, 6), '#0d0e10');
      k.fill(k.topPatch(1.85, 2.3, 0.15, 0.4, 0.005, 4), 'rgba(255,255,255,0.12)');
      k.fill(k.topPatch(1.5, 1.74, 0.0, 1.0, 0.004, 4), '#c9ced3');
      k.ctx.strokeStyle = '#0a0b0d'; k.ctx.lineWidth = 0.022;
      for (let x = 0.3; x <= 0.85; x += 0.08) k.across(x, 0.15, 0.85, 0.004);
      for (const [u0, u1] of [[0.18, 0.4], [0.6, 0.82]] as const) k.fill(k.topPatch(3.6, 3.9, u0, u1, 0.002, 3), '#08090b');
      foil(k, [k.pt(0.0, 0.88), k.pt(0.32, 0.9), k.pt(0.3, 0.95), k.pt(0.01, 0.95)], k.lit(k.paint, 0.15), k.lit(k.paint, -0.1));
    },
    face(k) {
      for (const [u0, u1] of [[0.04, 0.32], [0.38, 0.62], [0.68, 0.96]] as const) k.fill(k.quad(u0, u1, 0.18, 0.36), '#050607');
      rectLamps(k, 0.04, 0.3, 0.47, 0.52, '#0c0d10', false);
      k.fill(k.quad(0.0, 1.0, 0.13, 0.16), k.trim);
    },
  },

  // Varga Twin-T — a twin-turbo shooting brake: a supercar's wide, low stance under a long flat roof that runs to a
  // near-vertical tail, twin hood scoops for the turbos and twin side pipes along the sills.
  'rv-varga': {
    def: {
      L: 4.75, width: 2.02, rx: 0.95, fx: 3.78, r: 0.355, tireW: 0.15, rearTireW: 0.175, sill: 0.17, archGap: 0.03, flare: 0.07,
      profile: [[0.06, 0.19, 0.02], [0, 0.32, 0.03], [0, 0.88, 0.04], [0.08, 1.17, 0.1], [0.4, 1.24, 0.12], [1.95, 1.26, 0.15, 'g'],
        [2.62, 0.92, 0.04], [4.3, 0.79, 0.18], [4.72, 0.56, 0.1], [4.75, 0.34, 0.04], [4.65, 0.19, 0.02]],
      glass: [
        [[0.18, 0.92, 0.03], [0.3, 1.16, 0.05], [1.2, 1.2, 0.03], [1.2, 0.92, 0.02]],
        [[1.3, 0.92, 0.02], [1.3, 1.2, 0.03], [1.98, 1.2, 0.05], [2.52, 0.93, 0.02]],
      ],
      belt: 0.9, wheel: { kind: 'race', rim: 0.76, ...TIRE, caliper: '#ff5a1f', rimCol: '#b08a3e' }, cabin: { seat: '#2a2420' },
    },
    tail: { x: 0.04, y: 0.8, len: 0.1 }, lampY: 0.56,
    trail: { ys: [0.26, 0.31], len: 1.0, x0: 0.0, cols: ['rgba(255,250,220,0.98)', 'rgba(255,170,60,0.92)', 'rgba(255,90,30,0.5)', 'rgba(200,40,10,0)'] },
    side(k) {
      const lo = lower(k);
      k.seam([[1.25, 1.22], [1.27, lo]]);
      k.seam([[2.55, 0.92], [2.6, 0.5], [2.5, lo]]);
      if (k.detail) k.handle(1.4, 0.84, true);
      // vents behind the front wheel and the twin side pipes with a heat shield
      for (let i = 0; i < 4; i++) k.rect(3.28 + i * 0.07, 0.45, 0.035, 0.22, '#08090b', 0.015);
      k.rect(1.32, 0.22, 2.05, 0.09, '#2a2d31', 0.04);
      for (const y of [0.2, 0.27]) { tube(k, [k.pt(1.3, y), k.pt(3.36, y)], 0.045, '#c9ced3', 'rgba(255,255,255,0.7)'); k.fill(k.ellipse0(1.29, y, 0.012, 0.022), '#0b0c0e'); }
      k.rect(0, 0.76, 0.14, 0.05, '#d1202c', 0.02);
      k.mirror(2.45, 0.95, k.paint);
    },
    top(k) {
      // twin hood scoops for the turbos, a roof spoiler over the tail
      for (const [u0, u1] of [[0.62, 0.8], [0.2, 0.38]] as const) {
        const y = k.ty(3.3);
        box(k, 2.95, 3.55, u0, u1, y - 0.01, 0.07, k.lit(k.paint, 0.2), k.lit(k.paint, -0.12), '#050607');
      }
      foil(k, [k.pt(0.02, 1.2), k.pt(0.4, 1.25), k.pt(0.38, 1.29), k.pt(-0.02, 1.26)], k.lit(k.paint, 0.12), k.lit(k.paint, -0.15), k.trim);
      foil(k, [k.pt(4.4, 0.16), k.pt(4.85, 0.15), k.pt(4.85, 0.19), k.pt(4.4, 0.21)], '#2a2d31', '#141517');
    },
    face(k) {
      grille(k, 0.2, 0.8, 0.26, 0.5, 0, '#090a0c', '#000', '#c9ced3');
      for (let i = 1; i < 6; i++) for (let j = 1; j < 4; j++) k.fill(k.quad(0.2 + i * 0.1 - 0.004, 0.2 + i * 0.1 + 0.004, 0.26, 0.5), '#2a2e33');
      for (let j = 1; j < 3; j++) k.fill(k.quad(0.21, 0.79, 0.26 + j * 0.08 - 0.004, 0.26 + j * 0.08 + 0.004), '#2a2e33');
      for (const u of [0.09, 0.91]) { k.fill(k.ellipse(u, 0.56, 0.08, 0.06), '#0e1013'); k.fill(k.ellipse(u, 0.56, 0.055, 0.042), k.lens(false)); }
    },
  },

  // Wisp Clubman — a vintage-style club racer: a round barchetta body, one small aero screen, a headrest fairing,
  // faired lamps, a centre stripe, wire wheels and a door roundel.
  'rv-wisp': {
    def: {
      L: 3.9, width: 1.72, rx: 0.75, fx: 3.08, r: 0.31, tireW: 0.13, rearTireW: 0.14, sill: 0.2, archGap: 0.03, flare: 0.03,
      profile: [[0.08, 0.2, 0.02], [0, 0.32, 0.04], [0.02, 0.66, 0.12], [0.3, 0.84, 0.2], [0.95, 0.86, 0.1], [1.2, 0.84, 0.03], [1.25, 0.78, 0.02], [2.05, 0.78, 0.02],
        [2.1, 0.96, 0.02, 'g'], [2.32, 0.84, 0.04], [3.4, 0.8, 0.3], [3.85, 0.56, 0.15], [3.9, 0.34, 0.05], [3.8, 0.2, 0.02]],
      glass: [],
      belt: 0.78, wheel: { kind: 'center', rim: 0.74, ...TIRE, caliper: '#c9a14a' }, cabin: { seat: '#5a2a20', single: true }, number: '23',
    },
    tail: { x: 0.05, y: 0.6, len: 0.06 }, lampY: 0.58,
    side(k) {
      const lo = lower(k);
      k.seam([[1.3, 0.78], [1.34, lo]]);
      k.seam([[2.1, 0.8], [2.14, lo]]);
      tube(k, [k.pt(2.65, 0.26), k.pt(1.25, 0.24)], 0.04, '#b9c0c6', 'rgba(255,255,255,0.6)');
      k.fill(k.ellipse0(0.04, 0.6, 0.035, 0.035), '#c3241d');
      k.fill(k.ellipse0(3.8, 0.5, 0.03, 0.03), '#e59a2c');
    },
    top(k) {
      k.stripes([[0.43, 0.57]], k.trim);
      tub(k, 1.27, 2.04);
      driver(k, 1.5, 0.3, 1.06, '#f2efe6', '#2a3a48');
      // the headrest fairing behind the driver
      const fair = [k.P3(1.24, 0.3, 0.8), k.P3(1.24, 0.3, 1.0), k.P3(0.95, 0.3, 0.98), k.P3(0.35, 0.3, 0.86)];
      k.fill(fair, k.lit(k.paint, 0.05));
      k.ctx.strokeStyle = k.lit(k.paint, 0.45); k.ctx.lineWidth = 0.012;
      k.ctx.beginPath(); k.ctx.moveTo(fair[1].x, fair[1].y); k.ctx.lineTo(fair[2].x, fair[2].y); k.ctx.lineTo(fair[3].x, fair[3].y); k.ctx.stroke();
      // faired lamps on the nose, a chrome filler cap on the tail
      for (const [u0, u1] of [[0.1, 0.3], [0.7, 0.9]] as const) {
        k.fill(k.topPatch(3.45, 3.72, u0, u1, 0.004, 3), '#141a20');
        k.fill(k.topPatch(3.52, 3.68, u0 + 0.04, u1 - 0.04, 0.008, 3), k.lens(true));
        k.fill(k.topPatch(3.45, 3.72, u0, u1, 0.012, 3), 'rgba(210,230,245,0.28)');
      }
      const f = k.P3(0.55, 0.7, k.ty(0.55));
      k.fill(k.ellipse0(f.x, f.y + 0.01, 0.06, 0.03), '#d9dee2');
    },
    face(k) {
      k.fill(k.ellipse(0.5, 0.4, 0.27, 0.08, 24), '#d9dee3');
      k.fill(k.ellipse(0.5, 0.4, 0.24, 0.064, 24), '#0a0c0e');
      for (let i = -3; i <= 3; i++) k.fill(k.quad(0.5 + i * 0.055 - 0.004, 0.5 + i * 0.055 + 0.004, 0.35, 0.45), '#8d949a');
      for (const u of [0.12, 0.88]) { k.fill(k.ellipse(u, 0.58, 0.07, 0.05), '#141a20'); k.fill(k.ellipse(u, 0.58, 0.05, 0.038), k.lens(true)); }
    },
  },

  // Kade Q4 — Vesna Kade's four-motor launch car, built in a shed: a cab set far back on a high square tail, a long
  // low hood, fat rear tyres, a wheelie bar behind, a tall wing and magenta light lines (no grille, no exhaust).
  'rv-kade': {
    def: {
      L: 4.8, width: 2.05, rx: 0.95, fx: 3.95, r: 0.36, tireW: 0.14, rearTireW: 0.2, sill: 0.13, archGap: 0.03, flare: 0.07,
      profile: [[0.05, 0.16, 0.02], [0, 0.3, 0.03], [0, 0.96, 0.04], [0.1, 1.02, 0.04], [0.7, 1.02, 0.08], [1.45, 1.2, 0.2], [1.95, 1.21, 0.12, 'g'],
        [2.75, 0.9, 0.1], [4.35, 0.8, 0.28], [4.78, 0.42, 0.1], [4.8, 0.24, 0.03], [4.7, 0.14, 0.02]],
      glass: [[[1.42, 0.98, 0.03], [1.6, 1.14, 0.06], [1.95, 1.16, 0.04], [2.62, 0.92, 0.03]]],
      belt: 0.92, wheel: { kind: 'split', rim: 0.76, ...TIRE, caliper: '#ff3df2', rimCol: '#1b1d21' }, cabin: { seat: '#1c1e22', single: true, cage: true },
    },
    tail: { x: 0.04, y: 0.86, len: 0.12 }, lampY: 0.58,
    trail: { ys: [0.6], len: 2.6, cols: ['rgba(255,255,255,0.98)', 'rgba(255,80,240,0.92)', 'rgba(140,70,255,0.45)', 'rgba(100,60,255,0)'] },
    side(k) {
      const lo = lower(k);
      const glowC = '#ff3df2';
      k.seam([[2.62, 0.9], [2.66, 0.45], [2.58, lo]]);
      k.seam([[1.35, 1.0], [1.38, lo]]);
      k.carbon([k.pt(1.35, 0.1), k.pt(3.5, 0.1), k.pt(3.46, 0.21), k.pt(1.38, 0.19)]);
      k.rect(1.4, 0.22, 2.0, 0.014, glowC);
      // a magenta line from the nose along the shoulder, the tail lamp, a badge
      k.rect(2.7, 0.72, 2.0, 0.012, k.mix(glowC, '#ffffff', 0.3, 0.7));
      k.rect(0, 0.82, 0.2, 0.06, '#0a0607');
      k.rect(0, 0.84, 0.18, 0.02, '#ff2433');
      k.rect(0, 0.87, 0.16, 0.008, glowC);
      if (k.detail) k.label('Q4', 3.0, 0.5, 0.11, glowC, 'italic 900');
    },
    top(k) {
      const glowC = '#ff3df2';
      // the wheelie bar behind, far arm first
      for (const u of [0.8, 0.2]) {
        tube(k, [k.P3(0.1, u, 0.3), k.P3(-0.85, u, 0.16)], 0.035, u > 0.5 ? '#26292d' : '#3a3e44');
        const w = k.P3(-0.85, u, 0.075);
        k.fill(k.ellipse0(w.x, w.y, 0.075, 0.075), '#111213'); k.fill(k.ellipse0(w.x, w.y, 0.035, 0.035), '#9aa1a8');
      }
      tube(k, [k.P3(-0.6, 0.2, 0.19), k.P3(-0.6, 0.8, 0.19)], 0.03, '#26292d');
      // the tall wing on a single central post
      k.fill([k.P3(0.32, 0.5, 1.02), k.P3(0.42, 0.5, 1.02), k.P3(0.32, 0.5, 1.4), k.P3(0.22, 0.5, 1.4)], '#111214');
      foil(k, [k.pt(-0.2, 1.36), k.pt(0.5, 1.4), k.pt(0.48, 1.45), k.pt(-0.18, 1.44)], '#2a2d33', '#141518', glowC);
      k.fill([k.pt(-0.24, 1.24), k.pt(0.14, 1.26), k.pt(0.14, 1.5), k.pt(-0.24, 1.5)], '#1a1c20');
      // a glass hatch over the motors
      k.fill(k.topPatch(0.15, 0.68, 0.15, 0.85, 0.003, 4), '#0b0d10');
      k.ctx.strokeStyle = glowC; k.ctx.lineWidth = 0.012;
      for (const x of [0.28, 0.42, 0.56]) k.across(x, 0.2, 0.8, 0.005);
    },
    face(k) {
      const glowC = '#ff3df2';
      k.fill(k.quad(0.03, 0.97, 0.22, 0.56), '#06070a');
      k.fill(k.quad(-0.01, 1.01, 0.56, 0.61), k.mix(glowC, '#000000', 0.3, k.glow > 0 ? 0.6 : 0.35));
      k.fill(k.quad(0.0, 1.0, 0.575, 0.592), k.glow > 0 ? '#ffffff' : glowC);
      for (const u of [0.1, 0.17, 0.83, 0.9]) k.fill(k.ellipse(u, 0.5, 0.018, 0.018, 10), k.lens(false));
      k.carbon(k.quad(-0.01, 1.01, 0.12, 0.16));
    },
  },
};
