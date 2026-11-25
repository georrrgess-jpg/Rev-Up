import type { CarId } from '../data/tables';

// Rev Up vehicle renderer.
//
// Each car is an original side profile built in metres from its wheelbase, ride height, overhangs, roofline
// and wheel arches. The profile is extruded along one fixed oblique depth vector, which gives every car real
// top planes (hood, roof, deck), a front fascia and a windshield plane under a single shared key light
// (above, slightly forward). Construction details — seams, glass, lamps, bumpers, wheels — are drawn per car.
// The same geometry is used in the Garage, Showroom, reveal and race; races use cached body layers with
// live wheels, lights and nitro.

type P = { x: number; y: number };
/** Profile vertex: x, y (metres, y up), corner radius, tag for the edge that starts here ('g' = glass). */
type V = [number, number, number?, string?];

interface WheelStyle { kind: 'steel' | 'cover' | 'sport' | 'dish' | 'center' | 'aero' | 'gravel' | 'race'; rim: number; tire: string; side?: string; caliper?: string; rimCol?: string }

/** What can be seen through the side glass: seat colour, an optional roll cage, the dash. */
interface Cabin { seat: string; cage?: boolean; single?: boolean }

interface CarDef {
  L: number; // length, metres
  width: number;
  rx: number; fx: number; r: number; // wheel centres and radius
  tireW: number; rearTireW: number; // tread width as a fraction of the car width
  sill: number; archGap: number; flare: number;
  profile: V[]; // rear-bottom → up the tail → roof → nose → front-bottom (bottom edge + arches are generated)
  glass: V[][]; // side windows
  belt: number; // beltline height
  wheel: WheelStyle;
  cabin?: Cabin;
  /** Race number worn as part of the car's own identity (GT racer). */
  number?: string;
}

const DEFS: Record<string, CarDef> = {
  // Tapeback 1.1 — short, upright scrapyard hatch on small steel wheels.
  junker: {
    L: 3.65, width: 1.6, rx: 0.66, fx: 3.0, r: 0.285, tireW: 0.105, rearTireW: 0.105, sill: 0.31, archGap: 0.065, flare: 0,
    profile: [[0.09, 0.3, 0.02], [0.03, 0.4, 0.04], [0.05, 0.82, 0.06], [0.13, 1.29, 0.1], [0.42, 1.41, 0.12], [1.95, 1.42, 0.1, 'g'],
      [2.5, 1.0, 0.03], [3.36, 0.88, 0.12], [3.61, 0.74, 0.05], [3.65, 0.41, 0.04], [3.56, 0.31, 0.02]],
    glass: [
      [[0.24, 1.03, 0.03], [0.33, 1.3, 0.05], [1.18, 1.34, 0.03], [1.18, 1.03, 0.02]],
      [[1.3, 1.03, 0.02], [1.3, 1.34, 0.03], [1.9, 1.34, 0.05], [2.4, 1.03, 0.02]],
    ],
    belt: 1.0, wheel: { kind: 'steel', rim: 0.58, tire: '#2a2724', side: '#3a3530' }, cabin: { seat: '#6a5a48' },
  },
  // Corsa Rojo — four-door compact sedan with a proper three-box stance.
  beater: {
    L: 4.15, width: 1.66, rx: 0.82, fx: 3.33, r: 0.295, tireW: 0.11, rearTireW: 0.11, sill: 0.27, archGap: 0.05, flare: 0,
    profile: [[0.07, 0.27, 0.02], [0, 0.37, 0.03], [0, 0.83, 0.04], [0.07, 0.91, 0.05], [0.94, 0.95, 0.07], [1.13, 0.98, 0.04],
      [1.6, 1.37, 0.12], [2.56, 1.39, 0.1, 'g'], [3.08, 0.98, 0.03], [3.99, 0.9, 0.05], [4.13, 0.84, 0.03], [4.15, 0.42, 0.03], [4.06, 0.27, 0.02]],
    glass: [
      [[1.27, 1.01, 0.02], [1.6, 1.32, 0.06], [2.08, 1.34, 0.03], [2.08, 1.01, 0.02]],
      [[2.18, 1.01, 0.02], [2.18, 1.34, 0.03], [2.52, 1.34, 0.05], [2.98, 1.01, 0.02]],
    ],
    belt: 0.99, wheel: { kind: 'cover', rim: 0.66, tire: '#1f1f21', side: '#2c2c2f' }, cabin: { seat: '#7a4a36' },
  },
  // Vexa GTi — lowered hot hatch, flared arches, tight glasshouse, big sport wheels.
  hothatch: {
    L: 3.95, width: 1.74, rx: 0.64, fx: 3.2, r: 0.315, tireW: 0.125, rearTireW: 0.125, sill: 0.21, archGap: 0.03, flare: 0.045,
    profile: [[0.09, 0.2, 0.02], [0, 0.3, 0.03], [0, 0.66, 0.05], [0.1, 0.96, 0.06], [0.36, 1.25, 0.08], [0.62, 1.31, 0.1], [1.82, 1.33, 0.12, 'g'],
      [2.58, 0.92, 0.03], [3.58, 0.79, 0.14], [3.93, 0.62, 0.07], [3.95, 0.3, 0.04], [3.86, 0.19, 0.02]],
    glass: [
      [[0.42, 0.97, 0.03], [0.62, 1.22, 0.05], [1.1, 1.26, 0.03], [1.18, 0.97, 0.02]],
      [[1.29, 0.97, 0.02], [1.29, 1.27, 0.03], [1.85, 1.27, 0.05], [2.45, 0.96, 0.02]],
    ],
    belt: 0.95, wheel: { kind: 'sport', rim: 0.74, tire: '#171718', side: '#232325', caliper: '#d8312a' }, cabin: { seat: '#b0262c' },
  },
  // Ironhorse 455 — long-hood muscle coupe, low cabin, fastback, broad rear haunches.
  muscle: {
    L: 4.85, width: 1.88, rx: 0.95, fx: 3.8, r: 0.345, tireW: 0.13, rearTireW: 0.16, sill: 0.25, archGap: 0.05, flare: 0.05,
    profile: [[0.08, 0.27, 0.02], [0, 0.4, 0.03], [0, 0.76, 0.03], [0.05, 0.87, 0.03], [0.82, 0.9, 0.1], [1.16, 0.93, 0.06],
      [1.95, 1.26, 0.18], [2.62, 1.27, 0.12, 'g'], [3.08, 0.95, 0.03], [4.58, 0.93, 0.05], [4.86, 0.91, 0.02], [4.87, 0.38, 0.03], [4.78, 0.26, 0.02]],
    glass: [
      [[1.34, 0.97, 0.02], [1.9, 1.2, 0.06], [2.0, 1.21, 0.02], [2.0, 0.97, 0.02]],
      [[2.09, 0.97, 0.02], [2.09, 1.22, 0.03], [2.58, 1.23, 0.06], [2.98, 0.97, 0.02]],
    ],
    belt: 0.95, wheel: { kind: 'dish', rim: 0.66, tire: '#151515', side: '#202020', caliper: '#3a3f44' }, cabin: { seat: '#3a2a1e' },
  },
  // Altamar GT — long-tailed coastal grand tourer: covered lamps, oval mouth, chrome beltline, centre-lock wheels.
  tourer: {
    L: 4.75, width: 1.9, rx: 0.98, fx: 3.82, r: 0.34, tireW: 0.13, rearTireW: 0.15, sill: 0.24, archGap: 0.04, flare: 0.03,
    profile: [[0.1, 0.27, 0.02], [0, 0.37, 0.03], [0.01, 0.68, 0.07], [0.28, 0.86, 0.2], [1.05, 1.0, 0.3], [1.95, 1.21, 0.28], [2.52, 1.23, 0.12, 'g'],
      [3.04, 0.92, 0.03], [4.42, 0.8, 0.2], [4.74, 0.62, 0.14], [4.75, 0.36, 0.04], [4.66, 0.25, 0.02]],
    glass: [
      [[1.27, 0.98, 0.02], [1.82, 1.15, 0.08], [1.9, 1.16, 0.02], [1.9, 0.98, 0.02]],
      [[1.98, 0.98, 0.02], [1.98, 1.18, 0.03], [2.48, 1.19, 0.06], [2.94, 0.97, 0.02]],
    ],
    belt: 0.96, wheel: { kind: 'center', rim: 0.74, tire: '#141414', side: '#1f1f1f', caliper: '#c9a14a' }, cabin: { seat: '#e8d5ae' },
  },
  // Kestrel 1600 — boxy, stripped lightweight coupe: short overhangs, box flares, a ducktail, square lamps.
  tuner: {
    L: 3.98, width: 1.66, rx: 0.72, fx: 3.08, r: 0.3, tireW: 0.125, rearTireW: 0.13, sill: 0.22, archGap: 0.03, flare: 0.055,
    profile: [[0.08, 0.22, 0.02], [0, 0.32, 0.03], [0, 0.72, 0.03], [0.03, 0.86, 0.02], [0.4, 0.88, 0.05], [1.0, 1.22, 0.08], [1.95, 1.25, 0.07, 'g'],
      [2.55, 0.89, 0.03], [3.7, 0.76, 0.05], [3.96, 0.62, 0.04], [3.98, 0.3, 0.03], [3.9, 0.21, 0.02]],
    glass: [
      [[1.06, 0.91, 0.02], [1.13, 1.17, 0.03], [1.5, 1.2, 0.02], [1.5, 0.91, 0.02]],
      [[1.6, 0.91, 0.02], [1.6, 1.2, 0.02], [1.93, 1.2, 0.04], [2.43, 0.91, 0.02]],
    ],
    belt: 0.9, wheel: { kind: 'sport', rim: 0.72, tire: '#151516', side: '#222224', caliper: '#f2b33d' }, cabin: { seat: '#1f2124', cage: true },
  },
  // Lumen RS — cab-forward hybrid hypercar: low nose, long tail, light-bar face, aero wheels.
  super: {
    L: 4.6, width: 1.98, rx: 0.98, fx: 3.66, r: 0.35, tireW: 0.14, rearTireW: 0.17, sill: 0.16, archGap: 0.03, flare: 0.04,
    profile: [[0.1, 0.18, 0.02], [0, 0.3, 0.03], [0, 0.7, 0.04], [0.14, 0.86, 0.06], [1.35, 0.98, 0.3], [2.05, 1.13, 0.22], [2.6, 1.1, 0.12, 'g'],
      [3.3, 0.76, 0.08], [4.35, 0.55, 0.14], [4.6, 0.42, 0.06], [4.6, 0.28, 0.03], [4.5, 0.17, 0.02]],
    glass: [
      [[1.55, 0.93, 0.02], [1.78, 1.04, 0.05], [1.96, 1.06, 0.02], [1.96, 0.93, 0.02]],
      [[2.04, 0.88, 0.02], [2.12, 1.07, 0.04], [2.55, 1.06, 0.06], [3.16, 0.8, 0.02]],
    ],
    belt: 0.88, wheel: { kind: 'aero', rim: 0.76, tire: '#121214', side: '#1c1c20', caliper: '#b9a6ff' },
    cabin: { seat: '#3b2b6e' },
  },
  // Corvo Rally — compact AWD rally coupe on raised suspension: roof scoop, light pod, mud flaps, gravel wheels.
  rally: {
    L: 4.15, width: 1.76, rx: 0.74, fx: 3.3, r: 0.33, tireW: 0.13, rearTireW: 0.13, sill: 0.33, archGap: 0.08, flare: 0.06,
    profile: [[0.08, 0.33, 0.02], [0, 0.43, 0.03], [0, 0.82, 0.04], [0.1, 1.02, 0.06], [0.46, 1.36, 0.1], [0.78, 1.44, 0.1], [1.95, 1.45, 0.1, 'g'],
      [2.62, 1.03, 0.03], [3.68, 0.92, 0.12], [4.1, 0.78, 0.07], [4.15, 0.45, 0.04], [4.05, 0.33, 0.02]],
    glass: [
      [[0.52, 1.07, 0.03], [0.8, 1.37, 0.05], [1.22, 1.39, 0.03], [1.26, 1.07, 0.02]],
      [[1.37, 1.07, 0.02], [1.37, 1.39, 0.03], [1.92, 1.39, 0.05], [2.5, 1.06, 0.02]],
    ],
    belt: 1.05, wheel: { kind: 'gravel', rim: 0.66, tire: '#1b1b1c', side: '#2a2a2c', caliper: '#e0a91f', rimCol: '#f1f2ee' },
    cabin: { seat: '#1d4f9e', cage: true },
  },
  // Strata GTR — wide front-engined endurance racer: splitter, swan-neck wing, louvred hood, race numbers.
  gt: {
    L: 4.78, width: 2.02, rx: 0.96, fx: 3.86, r: 0.35, tireW: 0.15, rearTireW: 0.17, sill: 0.15, archGap: 0.03, flare: 0.07,
    profile: [[0.06, 0.16, 0.02], [0, 0.28, 0.03], [0, 0.8, 0.04], [0.12, 0.92, 0.04], [0.95, 1.0, 0.3], [1.7, 1.2, 0.26], [2.36, 1.21, 0.12, 'g'],
      [3.02, 0.88, 0.05], [4.4, 0.74, 0.22], [4.74, 0.56, 0.1], [4.78, 0.3, 0.04], [4.68, 0.15, 0.02]],
    glass: [
      [[1.14, 0.96, 0.02], [1.62, 1.12, 0.06], [1.88, 1.14, 0.02], [1.88, 0.96, 0.02]],
      [[1.97, 0.96, 0.02], [1.97, 1.15, 0.03], [2.32, 1.16, 0.05], [2.9, 0.93, 0.02]],
    ],
    belt: 0.94, wheel: { kind: 'race', rim: 0.76, tire: '#121213', side: '#1d1d1f', caliper: '#e33b2e', rimCol: '#2a2d31' },
    cabin: { seat: '#c2202a', cage: true, single: true }, number: '27',
  },
  // Halcyon X — closed-cockpit endgame prototype: bubble canopy, shark fin, light blade, full-width wing.
  proto: {
    L: 4.9, width: 2.0, rx: 0.98, fx: 3.98, r: 0.34, tireW: 0.15, rearTireW: 0.17, sill: 0.11, archGap: 0.025, flare: 0.08,
    profile: [[0.05, 0.12, 0.02], [0, 0.24, 0.03], [0, 0.88, 0.03], [0.08, 0.94, 0.03], [1.35, 0.98, 0.25], [2.15, 1.12, 0.26], [2.9, 1.13, 0.16, 'g'],
      [3.44, 0.86, 0.1], [4.2, 0.82, 0.22], [4.62, 0.52, 0.16], [4.9, 0.3, 0.05], [4.9, 0.17, 0.02], [4.8, 0.1, 0.01]],
    glass: [
      [[2.25, 0.91, 0.03], [2.32, 1.06, 0.06], [2.86, 1.08, 0.06], [3.3, 0.88, 0.03]],
    ],
    belt: 0.88, wheel: { kind: 'aero', rim: 0.78, tire: '#111113', side: '#1b1b1f', caliper: '#36f0d0' },
    cabin: { seat: '#1e2a30', single: true },
  },
};
const defFor = (id: string): CarDef => DEFS[id] ?? DEFS.muscle;

/** Factory paint and trim the art was designed around (D copies these into CARS for the new cars). */
export const FACTORY_LOOKS: Record<string, { paint: string; trim: string }> = {
  rally: { paint: '#1f62c9', trim: '#f5c518' },
  gt: { paint: '#d5dade', trim: '#d6202a' },
  proto: { paint: '#1d4e6b', trim: '#36f0d0' },
};
/** Ids that have their own drawing (the rest fall back to the muscle body). */
export const ART_CARS = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'] as const;

/** Real length of each class, so the race can show the Muscle longer than the Tapeback. */
export const carLengthM = (id: CarId | string) => defFor(id).L;

/** Height of the headlamp centres on the front plane. */
const lampY = (id: string) => ({ hothatch: 0.54, junker: 0.59, beater: 0.65, muscle: 0.7, tourer: 0.63, tuner: 0.62, super: 0.5, rally: 0.66, gt: 0.6, proto: 0.5 } as Record<string, number>)[id] ?? 0.65;

// ---------------------------------------------------------------- colour helpers

function rgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return [105, 113, 123];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = ([r, g, b]: number[], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
function mix(a: string, b: string, t: number, alpha = 1) {
  const A = rgb(a), B = rgb(b);
  return css(A.map((v, i) => v + (B[i] - v) * t), alpha);
}
const lit = (c: string, t: number) => (t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t));
function hexOf(c: string): string { return /^#[a-f\d]{6}$/i.test(c) ? c : '#69717b'; }

// ---------------------------------------------------------------- geometry

function rounded(vs: V[]): { pts: P[]; tags: string[] } {
  const pts: P[] = [];
  const tags: string[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const [x, y, rad = 0, tag = ''] = vs[i];
    const prev = vs[(i - 1 + n) % n];
    const next = vs[(i + 1) % n];
    if (!rad) { pts.push({ x, y }); tags.push(tag); continue; }
    const d1x = prev[0] - x, d1y = prev[1] - y, l1 = Math.hypot(d1x, d1y);
    const d2x = next[0] - x, d2y = next[1] - y, l2 = Math.hypot(d2x, d2y);
    const r1 = Math.min(rad, l1 / 2), r2 = Math.min(rad, l2 / 2);
    const t1 = { x: x + (d1x / l1) * r1, y: y + (d1y / l1) * r1 };
    const t2 = { x: x + (d2x / l2) * r2, y: y + (d2y / l2) * r2 };
    const prevTag = (prev[3] ?? '') as string;
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      pts.push({ x: a * t1.x + b * x + c * t2.x, y: a * t1.y + b * y + c * t2.y });
      tags.push(k < 3 ? prevTag : tag);
    }
  }
  return { pts, tags };
}

interface Geo {
  out: P[]; tags: string[]; // full outline incl. arches, clockwise (y up)
  glass: P[][];
  top: { a: P; b: P }[]; // visible top-facing, non-glass edges (for stripes)
  front: P[]; // front-facing edge points, top → bottom
  D: P;
}
const geoCache = new Map<string, Geo>();

function geometry(id: string): Geo {
  const hit = geoCache.get(id);
  if (hit) return hit;
  const d = defFor(id);
  const prof = rounded(d.profile);
  // drop the closing edge front-bottom → rear-bottom: the bottom edge is generated with arches
  const out = prof.pts.slice();
  const tags = prof.tags.slice();
  const arch = (wx: number, ar: number) => {
    const cy = d.r + 0.01;
    const a0 = Math.asin(Math.max(-1, Math.min(1, (d.sill - cy) / ar)));
    const pts: P[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = a0 + ((Math.PI - 2 * a0) * k) / 16;
      pts.push({ x: wx + ar * Math.cos(a), y: cy + ar * Math.sin(a) });
    }
    return pts;
  };
  const arF = d.r + d.archGap, arR = d.r + d.archGap + d.flare * 0.5;
  tags[tags.length - 1] = 'b';
  for (const [wx, ar] of [[d.fx, arF], [d.rx, arR]] as const) {
    const a = arch(wx, ar);
    out.push({ x: a[0].x, y: d.sill }); tags.push('b');
    for (let k = 0; k < a.length; k++) { out.push(a[k]); tags.push(k < a.length - 1 ? 'w' : 'b'); }
    out.push({ x: a[a.length - 1].x, y: d.sill }); tags.push('b');
  }
  const D = { x: d.width * 0.2, y: d.width * 0.085 };
  const top: Geo['top'] = [];
  const front: P[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    const n = normal(a, b);
    if (tags[i] !== 'g' && tags[i] !== 'w' && n.y > 0.55 && n.x * D.x + n.y * D.y > 0) top.push({ a, b });
    if (n.x > 0.7 && tags[i] !== 'w') { front.push(a); front.push(b); }
  }
  front.sort((p, q) => q.y - p.y);
  const g: Geo = { out, tags, glass: d.glass.map((w) => rounded(w).pts), top, front, D };
  geoCache.set(id, g);
  return g;
}

function normal(a: P, b: P): P {
  const ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1;
  return { x: -ey / l, y: ex / l }; // outward for a clockwise (y-up) outline
}

function path(ctx: CanvasRenderingContext2D, pts: P[], dx = 0, dy = 0) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)));
  ctx.closePath();
}
function fillPts(ctx: CanvasRenderingContext2D, pts: P[], fill: string | CanvasGradient) {
  path(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
}
const pt = (x: number, y: number): P => ({ x, y });

/** x of the near-side front face at height y. */
function frontX(g: Geo, y: number): number {
  let best = g.front[0] ?? { x: 0, y: 0 };
  for (const p of g.front) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
  return best.x;
}
/** Point on the front fascia: u across the car (0 near side → 1 far side), at height y. */
function fp(g: Geo, u: number, y: number): P {
  return { x: frontX(g, y) + g.D.x * u, y: y + g.D.y * u };
}
function quadFP(g: Geo, u0: number, u1: number, y0: number, y1: number): P[] {
  return [fp(g, u0, y1), fp(g, u1, y1), fp(g, u1, y0), fp(g, u0, y0)];
}
function ellipseFP(g: Geo, uc: number, yc: number, ru: number, ry: number, n = 18): P[] {
  const pts: P[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    pts.push(fp(g, uc + Math.cos(a) * ru, yc + Math.sin(a) * ry));
  }
  return pts;
}

/** Extrude a closed outline along D, shading each visible face by its normal. */
function extrude(ctx: CanvasRenderingContext2D, pts: P[], tags: string[] | null, D: P, colour: (n: P, tag: string, a: P) => string | CanvasGradient | null) {
  ctx.lineJoin = 'round';
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  const flip = area > 0 ? -1 : 1; // counter-clockwise outlines get their normals flipped
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n0 = normal(a, b);
    const n = { x: n0.x * flip, y: n0.y * flip };
    if (n.x * D.x + n.y * D.y <= 0) continue;
    const c = colour(n, tags ? tags[i] : '', a);
    if (!c) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + D.x, b.y + D.y); ctx.lineTo(a.x + D.x, a.y + D.y);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 0.012;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- options

export interface CarDrawOpts {
  paint: string;
  trim?: string;
  wheelAngle?: number;
  headlights?: number; // 0..1 intensity
  cover?: number; // 0 = uncovered, 1 = fully covered
  silhouette?: boolean; // flat locked silhouette
  shadow?: boolean;
  nitro?: number; // 0..1 flame
  brake?: boolean;
  livery?: string | null; // signature-finish stripe colour
  detail?: boolean;
  /** 0..1 rotational motion blur for fast wheels (stops spokes aliasing). */
  blur?: number;
  /** Race mode: cache the body as bitmaps and draw only wheels, lights and nitro live. */
  cache?: boolean;
  /** Cosmetic choices from the Paint shop: wheel set, paint material, restoration. */
  style?: CarStyle;
}

export type WheelSetId = 'steel' | 'turbine' | 'fivespoke' | 'dish' | 'wire' | 'aero' | 'gravel' | 'race';
export type PaintMaterial = 'metallic' | 'pearl' | 'candy' | 'matte' | 'chrome' | 'flip';
/**
 * restore: Tapeback restoration stage — 1 rust and tape fixed, 2 straight panels and one colour, 3 brightwork.
 * livery: a graphic from LIVERIES drawn over the paint (stripes, numbers, flames …); fits every car.
 */
export interface CarStyle { wheel?: WheelSetId; material?: PaintMaterial; restore?: number; livery?: string }

/** Liveries: graphics drawn over any car's paint, coloured to contrast with it. Catalogue/prices live in STYLE_ITEMS. */
export const LIVERIES: readonly { id: string; name: string; blurb: string }[] = [
  { id: 'stripes', name: 'Twin stripes', blurb: 'Two bold stripes nose to tail over the hood, roof and deck.' },
  { id: 'sweep', name: 'Side sweep', blurb: 'One tapered stripe that kicks up over the rear wheel.' },
  { id: 'number', name: 'Race number', blurb: 'A white door roundel with your number and a sun strip.' },
  { id: 'rally', name: 'Rally slash', blurb: 'Diagonal slashes, a door number panel and a sun strip.' },
  { id: 'flames', name: 'Flames', blurb: 'Hot-rod flames licking back from the front wheel.' },
  { id: 'checker', name: 'Checker fade', blurb: 'A chequered flag that fades along the flank.' },
  { id: 'twotone', name: 'Two-tone', blurb: 'A contrasting lower body under a fine pinstripe.' },
  { id: 'neon', name: 'Neon line', blurb: 'Glowing lines along the shoulder and sill.' },
];
export const liveryName = (id?: string) => LIVERIES.find((l) => l.id === id)?.name ?? 'None';

/** Wheel sets any car can wear: shape and colours only; the tyre and size stay the car's own. */
const WHEEL_SETS: Record<WheelSetId, Partial<WheelStyle>> = {
  steel: { kind: 'steel', rim: 0.6 },
  turbine: { kind: 'cover', rim: 0.68 },
  fivespoke: { kind: 'sport', rim: 0.74, caliper: '#d8312a' },
  dish: { kind: 'dish', rim: 0.68, caliper: '#3a3f44' },
  wire: { kind: 'center', rim: 0.74, caliper: '#c9a14a' },
  aero: { kind: 'aero', rim: 0.76, caliper: '#b9a6ff' },
  gravel: { kind: 'gravel', rim: 0.66, caliper: '#e0a91f', rimCol: '#f1f2ee' },
  race: { kind: 'race', rim: 0.76, caliper: '#e33b2e', rimCol: '#2a2d31' },
};
const styledDefs = new Map<string, CarDef>();
function styledDef(id: string, st?: CarStyle): CarDef {
  const d = defFor(id);
  if (!st?.wheel || !WHEEL_SETS[st.wheel]) return d;
  const key = `${id}|${st.wheel}`;
  let v = styledDefs.get(key);
  if (!v) { v = { ...d, wheel: { ...d.wheel, ...WHEEL_SETS[st.wheel] } }; styledDefs.set(key, v); }
  return v;
}
const styleKey = (st?: CarStyle) => (st ? `${st.wheel ?? ''}.${st.material ?? ''}.${st.restore ?? 0}.${st.livery ?? ''}` : '');

// ---------------------------------------------------------------- wheels

function tireAt(ctx: CanvasRenderingContext2D, d: CarDef, cx: number, cy: number, D: P, wFrac: number, far: boolean) {
  const r = d.r;
  const ox = D.x * wFrac, oy = D.y * wFrac;
  const len = Math.hypot(ox, oy) || 1;
  const px = (-oy / len) * r, py = (ox / len) * r;
  // tread band between the inner and outer sidewall
  ctx.fillStyle = far ? '#0b0b0c' : '#121213';
  ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + px, cy + py); ctx.lineTo(cx + ox + px, cy + oy + py); ctx.lineTo(cx + ox - px, cy + oy - py); ctx.lineTo(cx - px, cy - py);
  ctx.closePath(); ctx.fill();
}

function wheel(ctx: CanvasRenderingContext2D, _id: string, d: CarDef, wx: number, rear: boolean, angle: number, detail: boolean, D: P, blur = 0) {
  const r = d.r;
  const cy = r;
  tireAt(ctx, d, wx, cy, D, rear ? d.rearTireW : d.tireW, false);
  // sidewall
  const sw = ctx.createRadialGradient(wx - r * 0.25, cy + r * 0.3, r * 0.2, wx, cy, r);
  sw.addColorStop(0, d.wheel.side ?? '#2a2a2a');
  sw.addColorStop(1, d.wheel.tire);
  ctx.fillStyle = sw;
  ctx.beginPath(); ctx.arc(wx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = r * 0.03;
  ctx.beginPath(); ctx.arc(wx, cy, r * 0.93, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  const R = r * d.wheel.rim;
  if (d.wheel.kind === 'gravel') {
    // chunky gravel tread blocks around the shoulder
    ctx.fillStyle = '#2c2c2e';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 - angle;
      ctx.beginPath(); ctx.arc(wx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (d.wheel.kind === 'dish' && detail) {
    // raised white letters ring on the restored muscle tyre
    ctx.strokeStyle = 'rgba(236,230,214,0.55)';
    ctx.lineWidth = r * 0.035;
    ctx.setLineDash([r * 0.08, r * 0.05]);
    ctx.beginPath(); ctx.arc(wx, cy, (R + r) / 2, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(wx, cy);
  const k = d.wheel.kind;
  if (!detail && blur >= 0.6) {
    // fully blurred at race speed: spokes cannot be seen, so draw only the smeared disc (cheaper than the rim)
    ctx.fillStyle = '#07080a';
    ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = k === 'steel' ? 'rgb(70,74,77)' : k === 'gravel' ? 'rgb(190,192,188)' : k === 'race' || k === 'aero' ? 'rgb(52,54,60)' : 'rgb(96,101,106)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = k === 'steel' ? 'rgb(120,124,126)' : k === 'gravel' ? 'rgb(232,233,228)' : k === 'race' || k === 'aero' ? (d.wheel.caliper ?? '#888') : 'rgb(170,176,182)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = R * 0.04;
    for (const q of [0.45, 0.72]) { ctx.beginPath(); ctx.arc(0, 0, R * q, angle % 6, (angle % 6) + 2.2); ctx.stroke(); }
    ctx.restore();
    return;
  }
  // wheel barrel: a dark inner well offset toward the car so the rim reads deep
  ctx.fillStyle = '#07080a';
  ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2); ctx.fill();
  const well = ctx.createRadialGradient(D.x * 0.08, D.y * 0.08, R * 0.2, 0, 0, R);
  well.addColorStop(0, '#2a2e33'); well.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = well;
  ctx.beginPath(); ctx.arc(D.x * 0.05, D.y * 0.05, R * 0.94, 0, Math.PI * 2); ctx.fill();
  if (k === 'sport' || k === 'dish' || k === 'center' || k === 'aero' || k === 'gravel' || k === 'race') {
    // brake disc (with a machined ring) and caliper sit behind the spokes and do not rotate
    const disc = ctx.createRadialGradient(-R * 0.2, R * 0.2, R * 0.1, 0, 0, R * 0.8);
    disc.addColorStop(0, '#9aa1a8'); disc.addColorStop(1, '#4d5258');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,33,36,0.6)'; ctx.lineWidth = R * 0.04;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.stroke();
    if (detail) {
      ctx.fillStyle = d.wheel.caliper ?? '#3a3f44';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.78, Math.PI * 0.52, Math.PI * 0.98); ctx.arc(0, 0, R * 0.5, Math.PI * 0.98, Math.PI * 0.52, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.76, Math.PI * 0.6, Math.PI * 0.75); ctx.arc(0, 0, R * 0.7, Math.PI * 0.75, Math.PI * 0.6, true); ctx.closePath(); ctx.fill();
    }
  } else if (k === 'steel' && detail) {
    // drum brake behind the steel wheel's holes
    ctx.fillStyle = '#3b3328';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.rotate(-angle);
  if (k === 'steel') {
    const g = ctx.createRadialGradient(-R * 0.3, R * 0.3, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#6d7275'); g.addColorStop(1, '#33383b');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#25292b'; ctx.lineWidth = R * 0.08;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#161819';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.13, R * 0.09, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#8a8f91';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.26, 0, Math.PI * 2); ctx.fill();
    if (detail) { ctx.fillStyle = 'rgba(120,58,26,0.55)'; ctx.beginPath(); ctx.arc(R * 0.2, -R * 0.55, R * 0.14, 0, Math.PI * 2); ctx.fill(); }
  } else if (k === 'cover') {
    const g = ctx.createRadialGradient(-R * 0.35, R * 0.35, R * 0.05, 0, 0, R);
    g.addColorStop(0, '#f2f4f5'); g.addColorStop(0.6, '#b9bec2'); g.addColorStop(1, '#7c8287');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a5055';
    for (let i = 0; i < 10; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 5);
      ctx.fillRect(R * 0.42, -R * 0.045, R * 0.42, R * 0.09);
      ctx.restore();
    }
    ctx.strokeStyle = '#9da3a8'; ctx.lineWidth = R * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#b5262b';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.13, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'sport') {
    ctx.strokeStyle = '#2a2e33'; ctx.lineWidth = R * 0.07;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.96, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate((i * Math.PI * 2) / 5);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(R * 0.18, s * R * 0.05); ctx.lineTo(R * 0.94, s * R * 0.16); ctx.lineTo(R * 0.94, s * R * 0.04); ctx.lineTo(R * 0.18, s * R * 0.01);
        ctx.closePath();
        ctx.fillStyle = s < 0 ? '#c9d0d6' : '#8e98a1';
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#30353a';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8312a';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'gravel') {
    // gravel rally wheel: white eight-spoke with a fat lip and big hub
    const col = d.wheel.rimCol ?? '#f1f2ee';
    ctx.strokeStyle = col; ctx.lineWidth = R * 0.16;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = col;
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath(); ctx.moveTo(R * 0.2, -R * 0.09); ctx.lineTo(R * 0.86, -R * 0.07); ctx.lineTo(R * 0.86, R * 0.07); ctx.lineTo(R * 0.2, R * 0.09); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, Math.PI * 0.1, Math.PI * 0.9); ctx.arc(0, 0, R * 0.7, Math.PI * 0.9, Math.PI * 0.1, true); ctx.fill();
    ctx.fillStyle = '#d7d9d4'; ctx.beginPath(); ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3c3f'; ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'race') {
    // centre-lock race wheel: dark ten-spoke with a machined lip and a coloured single nut
    ctx.strokeStyle = '#9aa1a8'; ctx.lineWidth = R * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = d.wheel.rimCol ?? '#2a2d31'; ctx.lineWidth = R * 0.09;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      ctx.strokeStyle = i % 2 ? '#3b3f45' : (d.wheel.rimCol ?? '#2a2d31'); ctx.lineWidth = R * 0.1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22); ctx.lineTo(Math.cos(a + 0.12) * R * 0.84, Math.sin(a + 0.12) * R * 0.84); ctx.stroke();
    }
    ctx.fillStyle = d.wheel.caliper ?? '#e33b2e';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.lineTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'aero') {
    // aero wheel: a dark smoked disc with seven curved turbine blades and a thin lit ring
    ctx.fillStyle = '#16151c';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate((i * Math.PI * 2) / 7);
      ctx.beginPath();
      ctx.moveTo(R * 0.22, -R * 0.06); ctx.quadraticCurveTo(R * 0.6, -R * 0.3, R * 0.9, -R * 0.1);
      ctx.lineTo(R * 0.9, R * 0.04); ctx.quadraticCurveTo(R * 0.6, -R * 0.14, R * 0.22, R * 0.06); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#3a3846' : '#55526a'; ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = d.wheel.caliper ?? '#b9a6ff'; ctx.lineWidth = R * 0.035;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0b0b10'; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = d.wheel.caliper ?? '#b9a6ff'; ctx.beginPath(); ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'center') {
    // centre-lock wire wheel: polished lip, cross-laced spokes, two-ear knock-off
    const lip = ctx.createLinearGradient(-R, R, R, -R);
    lip.addColorStop(0, '#fbfbfb'); lip.addColorStop(0.5, '#a9afb5'); lip.addColorStop(1, '#eef0f2');
    ctx.strokeStyle = lip; ctx.lineWidth = R * 0.14;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,220,226,0.85)'; ctx.lineWidth = R * 0.025;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI * 2) / 28;
      const b = a + (i % 2 ? 0.55 : -0.55);
      ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2);
      ctx.lineTo(Math.cos(b) * R * 0.86, Math.sin(b) * R * 0.86);
    }
    ctx.stroke();
    ctx.fillStyle = '#d9c07a';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8954a';
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.42, R * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#efe2b8';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2); ctx.fill();
  } else {
    // deep dish: polished lip, recessed dark dish, five slots, chrome centre
    const lip = ctx.createLinearGradient(-R, R, R, -R);
    lip.addColorStop(0, '#f5f6f7'); lip.addColorStop(0.45, '#9ea4a9'); lip.addColorStop(0.55, '#dfe3e6'); lip.addColorStop(1, '#7d848a');
    ctx.fillStyle = lip;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    const dish = ctx.createRadialGradient(R * 0.15, -R * 0.15, R * 0.1, 0, 0, R * 0.84);
    dish.addColorStop(0, '#3d4247'); dish.addColorStop(1, '#141618');
    ctx.fillStyle = dish;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.84, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate((i * Math.PI * 2) / 5);
      ctx.fillStyle = '#c3a46a';
      ctx.beginPath();
      ctx.moveTo(R * 0.2, -R * 0.08); ctx.lineTo(R * 0.8, -R * 0.13); ctx.lineTo(R * 0.8, R * 0.13); ctx.lineTo(R * 0.2, R * 0.08);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#e8eaec';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  if (blur > 0) {
    // spinning fast: spokes smear into a disc with soft concentric streaks
    ctx.globalAlpha = 0.75 * blur;
    // flat rings instead of a per-frame gradient: this runs for every wheel on every race frame
    ctx.fillStyle = 'rgb(78,82,86)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(150,156,162)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = R * 0.04;
    for (const k of [0.45, 0.7]) { ctx.beginPath(); ctx.arc(0, 0, R * k, angle % 6, (angle % 6) + 2.2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- body layers

interface Ctx { ctx: CanvasRenderingContext2D; id: string; d: CarDef; g: Geo; paint: string; trim: string; stripe: string | null; detail: boolean; mat?: PaintMaterial; restore: number; liv?: string }

/** Ground shadow, far wheels, extruded planes, wheel wells, near panel and its details (everything behind the near wheels). */
function backLayer(c: Ctx, shadow: boolean) {
  const { ctx, d, g, paint } = c;
  const D = g.D;
  if (shadow && c.id === 'super') {
    const ug = ctx.createRadialGradient(d.L / 2, 0.02, 0.1, d.L / 2, 0.02, d.L * 0.62);
    ug.addColorStop(0, 'rgba(170,120,255,0.55)'); ug.addColorStop(1, 'rgba(170,120,255,0)');
    ctx.fillStyle = ug; ctx.beginPath(); ctx.ellipse(d.L / 2 + g.D.x / 2, g.D.y / 2, d.L * 0.62, 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (shadow) {
    // soft footprint plus darker contact patches under every tyre
    ctx.save();
    const foot = [pt(0.05, 0), pt(d.L, 0), pt(d.L + D.x, D.y), pt(0.05 + D.x, D.y)];
    ctx.filter = 'none';
    for (const [grow, a] of [[0.28, 0.16], [0.12, 0.22]] as const) {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      path(ctx, foot.map((p, i) => pt(p.x + (i === 0 || i === 3 ? -grow : grow), p.y + (i < 2 ? -grow * 0.25 : grow * 0.25))));
      ctx.fill();
    }
    for (const wx of [d.rx, d.fx]) for (const [ox, oy] of [[0, 0], [D.x * 0.85, D.y * 0.85]]) {
      const sh = ctx.createRadialGradient(wx + ox, oy, 0, wx + ox, oy, d.r * 1.1);
      sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.ellipse(wx + ox, oy, d.r * 1.1, d.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // far-side wheels peek out below the body
  for (const [wx, rear] of [[d.rx, true], [d.fx, false]] as const) {
    const f = 1 - (rear ? d.rearTireW : d.tireW);
    ctx.fillStyle = '#0d0d0e';
    ctx.beginPath(); ctx.arc(wx + D.x * f, d.r + D.y * f, d.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d1f22';
    ctx.beginPath(); ctx.arc(wx + D.x * f, d.r + D.y * f, d.r * d.wheel.rim * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  // extruded planes: roof/hood/deck on top, fascia at the front, glass for the windshield
  const roofFade = c.id === 'beater';
  extrude(ctx, g.out, g.tags, D, (n, tag, a) => {
    if (tag === 'w') return '#0a0b0c';
    if (tag === 'b') return null;
    if (tag === 'g') return null; // drawn below with pillars
    const up = Math.max(0, n.y), fwd = Math.max(0, n.x);
    let col = lit(paint, 0.03 + up * 0.17 - fwd * 0.26);
    if (roofFade && up > 0.9 && a.y > 1.25) col = mix(col, '#d9b9a2', 0.42); // sun-faded roof
    return col;
  });
  windshield(c);
  // hood shut lines run along the top plane, following the body
  const cowlIdx = g.tags.lastIndexOf('g') + 1;
  const hood = g.top.filter((e) => e.a.x >= g.out[cowlIdx % g.out.length].x - 0.01);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.012;
  for (const f of [0.1, 0.9]) {
    ctx.beginPath();
    hood.forEach(({ a, b }, i) => { if (!i) ctx.moveTo(a.x + D.x * f, a.y + D.y * f); ctx.lineTo(b.x + D.x * f, b.y + D.y * f); });
    ctx.stroke();
  }
  // crisp highlight where the side meets the top planes
  ctx.strokeStyle = lit(paint, 0.55); ctx.lineWidth = 0.014; ctx.globalAlpha = 0.7;
  for (const { a, b } of g.top) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // wheel wells
  ctx.fillStyle = '#07080a';
  for (const [wx, gap] of [[d.fx, d.archGap], [d.rx, d.archGap + d.flare * 0.5]] as const) {
    ctx.beginPath(); ctx.arc(wx, d.r + 0.01, d.r + gap, 0, Math.PI); ctx.lineTo(wx - d.r - gap, d.sill - 0.02); ctx.lineTo(wx + d.r + gap, d.sill - 0.02); ctx.fill();
  }
  nearPanel(c);
}

function windshield(c: Ctx) {
  const { ctx, g } = c;
  const D = g.D;
  for (let i = 0; i < g.out.length; i++) {
    if (g.tags[i] !== 'g') continue;
    const a = g.out[i], b = g.out[(i + 1) % g.out.length];
    const n = normal(a, b);
    if (n.x * D.x + n.y * D.y <= 0) continue;
    const gr = ctx.createLinearGradient(a.x, a.y, a.x + D.x, a.y + D.y);
    gr.addColorStop(0, '#26394a'); gr.addColorStop(0.5, '#5d7a8e'); gr.addColorStop(1, '#22313f');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + D.x, b.y + D.y); ctx.lineTo(a.x + D.x, a.y + D.y); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#26394a'; ctx.lineWidth = 0.01; ctx.stroke();
  }
  // A-pillars, header and cowl frame the windshield plane
  const idx = g.tags.indexOf('g');
  const lastG = g.tags.lastIndexOf('g');
  if (idx < 0) return;
  const top = g.out[idx], cowl = g.out[(lastG + 1) % g.out.length];
  ctx.lineCap = 'round';
  ctx.strokeStyle = lit(c.paint, 0.1);
  ctx.lineWidth = 0.075;
  ctx.beginPath(); ctx.moveTo(top.x + D.x, top.y + D.y); ctx.lineTo(cowl.x + D.x, cowl.y + D.y); ctx.stroke();
  ctx.strokeStyle = '#0f151b'; ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(cowl.x, cowl.y); ctx.lineTo(cowl.x + D.x, cowl.y + D.y); ctx.stroke();
  // restrained sky reflection across the glass
  ctx.strokeStyle = 'rgba(220,236,248,0.22)'; ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(top.x + D.x * 0.25, top.y + D.y * 0.25 - 0.02);
  ctx.lineTo(cowl.x + D.x * 0.55, cowl.y + D.y * 0.55 + 0.03);
  ctx.stroke();
}

function nearPanel(c: Ctx) {
  const { ctx, id, d, g, paint, trim, detail } = c;
  // base paint: sky-lit shoulder, mid tone, darker rocker, with a soft horizon reflection under the beltline
  const grad = ctx.createLinearGradient(0, 1.45, 0, 0.15);
  grad.addColorStop(0, lit(paint, 0.22));
  grad.addColorStop(0.32, lit(paint, 0.12));
  grad.addColorStop(0.45, lit(paint, 0.02));
  grad.addColorStop(0.62, lit(paint, -0.08));
  grad.addColorStop(0.68, lit(paint, 0.06));
  grad.addColorStop(1, lit(paint, -0.42));
  path(ctx, g.out);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  path(ctx, g.out);
  ctx.clip();
  // clearcoat: a cool sky band above a crisp horizon line, darker ground bounce below it
  const sky = ctx.createLinearGradient(0, d.belt, 0, d.belt - 0.3);
  sky.addColorStop(0, 'rgba(215,232,255,0.16)'); sky.addColorStop(1, 'rgba(215,232,255,0)');
  ctx.fillStyle = sky; ctx.fillRect(0, d.belt - 0.3, d.L, 0.3);
  const hz = (d.belt + d.sill) / 2 + 0.04;
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, hz - 0.05, d.L, 0.05);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, hz - 0.065, d.L, 0.012);
  if (c.mat) paintMaterial(c);
  sideLivery(c);
  // a long specular streak from the stage light
  ctx.fillStyle = c.mat === 'matte' ? 'rgba(255,255,255,0.03)' : c.mat ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(d.L * 0.18, d.belt - 0.09); ctx.lineTo(d.L * 0.86, d.belt - 0.13); ctx.lineTo(d.L * 0.84, d.belt - 0.165); ctx.lineTo(d.L * 0.16, d.belt - 0.12); ctx.closePath(); ctx.fill();
  if (id === 'tourer') {
    // two-tone: cream lower body under a chrome divide
    ctx.fillStyle = trim; ctx.fillRect(0, 0, d.L, 0.5);
    const cg = ctx.createLinearGradient(0, 0.5, 0, 0.2);
    cg.addColorStop(0, 'rgba(255,255,255,0.15)'); cg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, d.L, 0.5);
  }
  if (id === 'junker' && c.restore < 2) {
    // mismatched front fender in primer, and a couple of dents catching the light
    ctx.fillStyle = '#7d817b';
    ctx.beginPath(); ctx.moveTo(2.46, 0.98); ctx.lineTo(3.4, 0.9); ctx.lineTo(3.7, 0.6); ctx.lineTo(3.7, 0.3); ctx.lineTo(2.46, 0.3); ctx.closePath(); ctx.fill();
    const pg = ctx.createLinearGradient(0, 0.98, 0, 0.3);
    pg.addColorStop(0, 'rgba(255,255,255,0.12)'); pg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = pg; ctx.fill();
    for (const [x, y, rx] of [[0.72, 0.62, 0.16], [1.95, 0.56, 0.12]]) {
      const dg = ctx.createRadialGradient(x - 0.03, y + 0.03, 0.01, x, y, rx);
      dg.addColorStop(0, 'rgba(0,0,0,0.28)'); dg.addColorStop(0.7, 'rgba(0,0,0,0.05)'); dg.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.6, 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // shoulder crease highlight following the body
  ctx.strokeStyle = lit(paint, 0.45);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.018;
  ctx.beginPath(); ctx.moveTo(0.02, d.belt - 0.06); ctx.lineTo(d.L - 0.12, d.belt - 0.1); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, d.belt - 0.08, d.L, -0.05);
  // arch shading follows each wheel opening
  for (const [wx, gap] of [[d.fx, d.archGap], [d.rx, d.archGap + d.flare * 0.5]] as const) {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.arc(wx, d.r + 0.01, d.r + gap + 0.03, 0.05, Math.PI - 0.05); ctx.stroke();
  }
  if (id === 'muscle') {
    // broad rear haunch: a lit swell above the rear wheel and a shadowed waist ahead of it
    const h = ctx.createRadialGradient(d.rx - 0.1, d.belt - 0.15, 0.05, d.rx, d.belt - 0.2, 0.9);
    h.addColorStop(0, 'rgba(255,255,255,0.28)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = h;
    ctx.beginPath(); ctx.ellipse(d.rx + 0.05, d.belt - 0.22, 0.8, 0.22, -0.05, 0, Math.PI * 2); ctx.fill();
    // the haunch rolls under into a shadowed lower flank
    const lf = ctx.createLinearGradient(0, 0.62, 0, 0.3);
    lf.addColorStop(0, 'rgba(0,0,0,0)'); lf.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = lf; ctx.beginPath(); ctx.moveTo(0, 0.3); ctx.lineTo(2.5, 0.3); ctx.quadraticCurveTo(1.8, 0.5, 1.2, 0.62); ctx.lineTo(0, 0.62); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = 'rgba(6,8,10,0.85)';
  path(ctx, g.out);
  ctx.stroke();
  if (detail || id === 'junker') panelDetails(c);
  sideGlass(c);
  if (c.stripe) signatureStripe(c);
  void trim;
}

/** Premium paint: metallic flake, a pearl colour shift, or deep candy over a bright base. Cosmetic only. */
function paintMaterial(c: Ctx) {
  const { ctx, d, paint } = c;
  if (c.mat === 'metallic') {
    // metallic: the paint brightens and cools along a broad lit band, with fine flake that only shows in the light
    const sh = ctx.createLinearGradient(0, d.belt + 0.05, 0, d.sill);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.7, 'rgba(0,0,0,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, d.L, 1.6);
    for (let k = 0; k < 420; k++) {
      const fx = ((k * 0.6180339) % 1) * d.L, fy = d.belt - 0.4 + ((k * 0.7548776) % 1) * 0.45;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + ((k * 0.37) % 1) * 0.3})`;
      ctx.fillRect(fx, fy, 0.008, 0.008);
    }
  } else if (c.mat === 'pearl') {
    // pearl: the colour flips toward rose at the tail and cyan at the nose, with a milky highlight band
    const pg = ctx.createLinearGradient(0, 0, d.L, 0);
    pg.addColorStop(0, 'rgba(255,140,210,0.34)'); pg.addColorStop(0.35, 'rgba(255,230,250,0.12)');
    pg.addColorStop(0.65, 'rgba(210,255,250,0.12)'); pg.addColorStop(1, 'rgba(90,225,255,0.36)');
    ctx.fillStyle = pg; ctx.fillRect(0, 0, d.L, 1.6);
    const milk = ctx.createLinearGradient(0, d.belt + 0.05, 0, d.belt - 0.35);
    milk.addColorStop(0, 'rgba(255,255,255,0.28)'); milk.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = milk; ctx.fillRect(0, d.belt - 0.35, d.L, 0.4);
  } else if (c.mat === 'matte') {
    // matte / satin wrap: reflections flattened out, a soft powdery sheen on the shoulder only
    ctx.fillStyle = mix(paint, '#808080', 0.12, 0.72); ctx.fillRect(0, 0, d.L, 1.6);
    const sh = ctx.createLinearGradient(0, d.belt, 0, d.sill);
    sh.addColorStop(0, 'rgba(255,255,255,0.1)'); sh.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, d.L, 1.6);
  } else if (c.mat === 'chrome') {
    // mirror chrome: a tinted sky above a hard horizon, dark ground below, bright edge between
    const hz = (d.belt + d.sill) / 2 + 0.02;
    const sky = ctx.createLinearGradient(0, d.belt + 0.4, 0, hz);
    sky.addColorStop(0, mix(paint, '#ffffff', 0.85)); sky.addColorStop(0.6, mix(paint, '#cfe3f2', 0.55)); sky.addColorStop(1, mix(paint, '#ffffff', 0.7));
    ctx.fillStyle = sky; ctx.fillRect(0, hz, d.L, 1.6);
    const gd = ctx.createLinearGradient(0, hz, 0, 0);
    gd.addColorStop(0, mix(paint, '#1a1d22', 0.7)); gd.addColorStop(0.5, mix(paint, '#3c4148', 0.5)); gd.addColorStop(1, mix(paint, '#0a0b0d', 0.6));
    ctx.fillStyle = gd; ctx.fillRect(0, 0, d.L, hz);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, hz - 0.006, d.L, 0.012);
  } else if (c.mat === 'flip') {
    // colour-flip: the paint shifts green → violet → gold along the body
    const fg = ctx.createLinearGradient(0, 0, d.L, 0.6);
    fg.addColorStop(0, 'rgba(255,190,60,0.5)'); fg.addColorStop(0.45, 'rgba(150,60,255,0.45)'); fg.addColorStop(1, 'rgba(40,220,180,0.5)');
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = fg; ctx.fillRect(0, 0, d.L, 1.6); ctx.restore();
    ctx.fillStyle = fg; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, d.L, 1.6); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(d.L * 0.15, d.belt - 0.08, d.L * 0.7, 0.014);
  } else if (c.mat === 'candy') {
    // candy: the colour is pushed deeper and more saturated (overlay), glows where the light lands, and has a wet highlight
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = paint; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, d.L, 1.6);
    ctx.restore();
    const core = ctx.createRadialGradient(d.L * 0.55, d.belt - 0.1, 0.05, d.L * 0.55, d.belt - 0.1, d.L * 0.45);
    core.addColorStop(0, lit(paint, 0.55)); core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55; ctx.fillStyle = core; ctx.fillRect(0, 0, d.L, 1.6); ctx.globalAlpha = 1;
    const cg = ctx.createLinearGradient(0, d.belt - 0.2, 0, d.sill);
    cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, d.L, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(d.L * 0.18, d.belt - 0.07, d.L * 0.64, 0.016);
  }
}

const lum = (hex: string) => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
/** A livery colour that reads against this paint: the signature stripe, else the trim, else white or ink. */
function liveryCol(c: Ctx): string {
  if (c.stripe) return c.stripe;
  if (Math.abs(lum(c.trim) - lum(c.paint)) > 0.3) return c.trim;
  return lum(c.paint) > 0.5 ? '#15171b' : '#f4f2ec';
}
/** Each car's race number when a livery calls for one. */
const NUMBERS: Record<string, string> = { junker: '11', beater: '4', hothatch: '16', muscle: '45', tourer: '7', tuner: '86', super: '1', rally: '5', gt: '27', proto: '01' };

function roundel(c: Ctx, x: number, y: number, r: number, num: string, square = false) {
  const { ctx } = c;
  ctx.fillStyle = '#f6f5f0';
  ctx.beginPath();
  if (square) ctx.roundRect(x - r * 1.1, y - r, r * 2.2, r * 2, r * 0.25); else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.012; ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.scale(r / 10, -r / 10);
  ctx.fillStyle = '#101216';
  ctx.font = `italic 900 ${num.length > 1 ? 12 : 14}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(num, 0, 0.6);
  ctx.restore();
}

/** Liveries on the near side panel (drawn inside the body clip, over the paint). */
function sideLivery(c: Ctx) {
  const { ctx, d, id } = c;
  const lv = c.liv;
  const col = liveryCol(c);
  const lo = d.sill + 0.04, hi = d.belt - 0.04;
  const doorX = (d.rx + d.fx) / 2 + 0.1, midY = (lo + hi) / 2;
  const rr = Math.min(0.2, (hi - lo) * 0.36);
  if (!lv && d.number) roundel(c, doorX, midY + 0.02, rr, d.number);
  if (!lv) return;
  if (lv === 'sweep') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(d.L, lo + 0.18); ctx.lineTo(d.rx + d.r + 0.25, lo + 0.14); ctx.quadraticCurveTo(d.rx, lo + 0.14, d.rx - d.r * 0.4, hi - 0.02);
    ctx.lineTo(d.rx - d.r * 0.55, hi - 0.06); ctx.quadraticCurveTo(d.rx - 0.05, lo + 0.06, d.rx + d.r + 0.25, lo + 0.06); ctx.lineTo(d.L, lo + 0.1);
    ctx.closePath(); ctx.fill();
  } else if (lv === 'number') {
    ctx.fillStyle = col; ctx.fillRect(0, midY - 0.015 - rr * 1.15, d.L, 0.03);
    roundel(c, doorX, midY, rr, NUMBERS[id] ?? '9');
    ctx.fillStyle = col; ctx.fillRect(d.fx - d.r - 0.05 - 0.35, lo + 0.02, 0.35, 0.05);
  } else if (lv === 'rally') {
    ctx.fillStyle = col;
    for (let k = 0; k < 3; k++) {
      const x0 = d.rx + d.r + 0.15 + k * 0.17;
      ctx.beginPath(); ctx.moveTo(x0, lo); ctx.lineTo(x0 + 0.09, lo); ctx.lineTo(x0 + 0.42, hi + 0.1); ctx.lineTo(x0 + 0.33, hi + 0.1); ctx.closePath(); ctx.fill();
    }
    roundel(c, doorX + 0.45, midY, rr * 0.95, NUMBERS[id] ?? '9', true);
  } else if (lv === 'flames') {
    const x0 = d.fx + d.r * 0.2, span = (d.fx - d.rx) * 0.75;
    const tips = [[0.55, 0.78], [0.9, 0.6], [0.7, 0.42], [1.0, 0.28], [0.6, 0.14]];
    for (const [ci, colr] of [[0, '#c8201a'], [1, '#f07a1a'], [2, '#ffd23a']] as const) {
      const shrink = ci * 0.12;
      ctx.fillStyle = colr;
      ctx.beginPath(); ctx.moveTo(x0, hi + 0.02);
      for (const [len, fy] of tips) {
        const y = lo + (hi - lo) * fy;
        ctx.quadraticCurveTo(x0 - span * (len - shrink) * 0.55, y + 0.08, x0 - span * (len - shrink), y + 0.02);
        ctx.quadraticCurveTo(x0 - span * (len - shrink) * 0.5, y - 0.02, x0 - span * 0.12, y - 0.04);
      }
      ctx.lineTo(x0, lo); ctx.closePath(); ctx.fill();
    }
  } else if (lv === 'checker') {
    const sq = 0.085;
    for (let i = 0; i * sq < d.L * 0.55; i++) for (let j = 0; j < 4; j++) {
      if ((i + j) % 2) continue;
      const fade = 1 - (i * sq) / (d.L * 0.55);
      ctx.fillStyle = col; ctx.globalAlpha = Math.max(0, fade) * (hash01(i * 7 + j) > fade * 0.8 + 0.1 ? 0.35 : 0.95);
      ctx.fillRect(d.L - (i + 1) * sq, lo + j * sq, sq, sq);
    }
    ctx.globalAlpha = 1;
  } else if (lv === 'twotone') {
    const hz = (d.belt + d.sill) / 2 + 0.04;
    ctx.fillStyle = lum(c.paint) > 0.45 ? lit(c.paint, -0.62) : col === '#f4f2ec' ? lit(c.paint, 0.55) : col;
    ctx.fillRect(0, 0, d.L, hz - 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, d.L, 0.12 + d.sill * 0.3);
    ctx.fillStyle = col === '#15171b' ? '#c9a14a' : '#f1d58a'; ctx.fillRect(0, hz - 0.055, d.L, 0.014);
  } else if (lv === 'neon') {
    const glowC = lum(c.paint) > 0.5 ? '#ff2f8c' : '#2ff3ff';
    for (const [y, w2] of [[hi - 0.02, 0.012], [lo + 0.04, 0.012]] as const) {
      ctx.fillStyle = glowC; ctx.globalAlpha = 0.25; ctx.fillRect(0, y - 0.03, d.L, 0.06 + w2);
      ctx.globalAlpha = 1; ctx.fillRect(0, y, d.L, w2 * 1.5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, y + w2 * 0.4, d.L, w2 * 0.6);
    }
  }
}
const hash01 = (n: number) => { const x = Math.sin(n * 91.7) * 4375.85; return x - Math.floor(x); };

function seam(ctx: CanvasRenderingContext2D, pts: [number, number][], w = 0.012) {
  ctx.strokeStyle = 'rgba(5,7,9,0.7)'; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = w * 0.6;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.012, y) : ctx.moveTo(x + 0.012, y))); ctx.stroke();
}
function handle(ctx: CanvasRenderingContext2D, x: number, y: number, chrome = false) {
  ctx.fillStyle = chrome ? '#d9dee2' : '#15191d';
  ctx.beginPath(); ctx.roundRect(x, y - 0.025, 0.17, 0.045, 0.02); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 0.02, y + 0.008, 0.13, 0.008);
}
function mirror(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  ctx.fillStyle = '#0f1317';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.08, y + 0.02); ctx.lineTo(x + 0.06, y + 0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(x - 0.06, y + 0.05, 0.2, 0.12, 0.04); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.01; ctx.stroke();
}

function panelDetails(c: Ctx) {
  const { ctx, id, d, paint, trim, detail } = c;
  const lo = d.sill + 0.05;
  if (id === 'junker' && c.restore >= 2) {
    // restored body: straight panels in one colour, true door seams; brightwork adds a chrome waist strip
    seam(ctx, [[1.24, 0.98], [1.24, 0.5], [1.3, lo]], 0.014);
    seam(ctx, [[2.42, 0.99], [2.44, 0.5], [2.3, lo]], 0.014);
    if (c.restore >= 3) { ctx.fillStyle = 'rgba(232,236,240,0.85)'; ctx.fillRect(0.1, 0.62, 3.45, 0.022); }
    if (detail) handle(ctx, 1.4, 0.86, c.restore >= 3);
    mirror(ctx, 2.34, 1.0, c.restore >= 3 ? '#d9dee2' : paint);
  } else if (id === 'junker') {
    // replacement door in a different colour, with seams that don't quite line up
    ctx.fillStyle = '#6f8584';
    ctx.beginPath();
    ctx.moveTo(1.24, 0.98); ctx.lineTo(2.42, 0.99); ctx.lineTo(2.44, 0.5); ctx.quadraticCurveTo(2.42, lo, 2.3, lo); ctx.lineTo(1.3, lo); ctx.lineTo(1.24, 0.5);
    ctx.closePath(); ctx.fill();
    const dg = ctx.createLinearGradient(0, 1, 0, 0.35);
    dg.addColorStop(0, 'rgba(255,255,255,0.18)'); dg.addColorStop(0.6, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = dg; ctx.fill();
    seam(ctx, [[1.24, 0.98], [1.24, 0.5], [1.3, lo]], 0.016);
    seam(ctx, [[2.42, 0.99], [2.44, 0.5], [2.3, lo]], 0.016);
    if (detail) handle(ctx, 1.4, 0.86);
    // rust along the sill seam and around both arches
    ctx.save();
    ctx.lineCap = 'round';
    const rust = (pts: [number, number][], w: number) => {
      ctx.strokeStyle = 'rgba(120,52,22,0.9)'; ctx.lineWidth = w;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.strokeStyle = 'rgba(196,104,44,0.75)'; ctx.lineWidth = w * 0.45;
      ctx.stroke();
    };
    for (const wx of c.restore >= 1 ? [] : [d.rx, d.fx]) {
      const R = d.r + d.archGap + 0.02;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 12; k++) {
        const a = 0.15 + (k / 12) * (Math.PI - 0.3);
        const wob = Math.sin(k * 2.3 + wx) * 0.012;
        pts.push([wx + Math.cos(a) * (R + wob), d.r + Math.sin(a) * (R + wob)]);
      }
      rust(pts, 0.05);
    }
    if (c.restore < 1) {
      rust([[0.25, lo - 0.01], [0.42, lo + 0.01], [0.6, lo - 0.005]], 0.04);
      rust([[1.45, lo], [1.7, lo + 0.015], [2.0, lo]], 0.03);
      rust([[2.95, 0.95], [3.1, 0.93]], 0.03);
    }
    ctx.restore();
    // duct tape over a crack on the rear quarter — big enough to read on a phone
    if (c.restore < 1) { tape(ctx, 0.5, 0.72, 0.36, -0.3); tape(ctx, 0.52, 0.66, 0.3, 0.35); }
    if (detail) { ctx.fillStyle = '#20262a'; ctx.beginPath(); ctx.arc(0.42, 0.88, 0.05, 0, Math.PI * 2); ctx.fill(); } // fuel cap
    mirror(ctx, 2.34, 1.0, '#2b2f31');
  } else if (id === 'beater') {
    // clear front and rear door breaks
    seam(ctx, [[1.17, 0.99], [1.22, 0.6], [1.3, lo]]);
    seam(ctx, [[2.13, 1.36], [2.13, lo]]);
    seam(ctx, [[3.02, 1.0], [3.05, 0.6], [2.97, lo]]);
    if (detail) { handle(ctx, 1.32, 0.86, true); handle(ctx, 2.25, 0.86, true); }
    // rubber side moulding with a thin chrome cap
    ctx.fillStyle = '#17191b';
    ctx.beginPath(); ctx.roundRect(0.05, 0.53, d.L - 0.1, 0.07, 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(230,232,235,0.55)'; ctx.fillRect(0.08, 0.585, d.L - 0.16, 0.01);
    // amber corner lamp wrapping round the front, rectangular tail lamp wrapping round the back
    ctx.fillStyle = '#e59a2c'; ctx.beginPath(); ctx.roundRect(3.97, 0.62, 0.17, 0.11, 0.02); ctx.fill();
    ctx.fillStyle = '#b1261e'; ctx.beginPath(); ctx.roundRect(0.0, 0.62, 0.14, 0.17, 0.02); ctx.fill();
    ctx.fillStyle = '#e8a03a'; ctx.fillRect(0.0, 0.62, 0.14, 0.04);
    mirror(ctx, 2.95, 0.99, paint);
  } else if (id === 'hothatch') {
    seam(ctx, [[1.22, 0.96], [1.24, 0.5], [1.32, d.sill + 0.03]]);
    seam(ctx, [[2.5, 0.95], [2.55, 0.5], [2.45, d.sill + 0.03]]);
    if (detail) handle(ctx, 1.36, 0.85);
    // side skirt and a vent behind the front wheel
    ctx.fillStyle = '#15181b';
    ctx.beginPath(); ctx.moveTo(1.02, 0.2); ctx.lineTo(2.83, 0.2); ctx.lineTo(2.8, 0.29); ctx.lineTo(1.05, 0.29); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2.62, 0.62); ctx.lineTo(2.78, 0.66); ctx.lineTo(2.76, 0.58); ctx.lineTo(2.62, 0.56); ctx.closePath(); ctx.fill();
    // signature split stripe: low along the doors, kicking up over the rear arch
    ctx.fillStyle = c.stripe ?? trim;
    ctx.beginPath();
    ctx.moveTo(3.0, 0.4); ctx.lineTo(1.25, 0.4); ctx.lineTo(0.98, 0.72); ctx.lineTo(0.3, 0.78); ctx.lineTo(0.3, 0.72); ctx.lineTo(0.92, 0.66); ctx.lineTo(1.18, 0.35); ctx.lineTo(3.05, 0.35);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.15, 0.44); ctx.lineTo(1.0, 0.62); ctx.lineTo(0.96, 0.58); ctx.lineTo(1.1, 0.44); ctx.fill();
    ctx.fillStyle = '#1b1e22'; ctx.beginPath(); ctx.roundRect(0.0, 0.66, 0.1, 0.14, 0.02); ctx.fill();
    ctx.fillStyle = '#c8241d'; ctx.beginPath(); ctx.roundRect(0.0, 0.68, 0.08, 0.1, 0.02); ctx.fill();
    mirror(ctx, 2.38, 0.95, paint);
  } else if (id === 'tuner') {
    seam(ctx, [[1.55, 0.9], [1.57, 0.5], [1.62, lo]]);
    seam(ctx, [[2.5, 0.88], [2.52, 0.5], [2.46, lo]]);
    if (detail) handle(ctx, 1.68, 0.8);
    // a contrast lower band with the model number, a fuel filler and a red tow hook at the back
    ctx.fillStyle = trim; ctx.fillRect(0.05, lo - 0.02, d.L - 0.12, 0.14);
    ctx.fillStyle = c.stripe ?? '#e8641c'; ctx.fillRect(0.05, lo + 0.12, d.L - 0.12, 0.03);
    if (detail) { ctx.save(); ctx.translate(2.62, lo + 0.03); ctx.scale(0.011, -0.011); ctx.fillStyle = '#f1efe9'; ctx.font = '900 11px sans-serif'; ctx.fillText('1600', 0, 0); ctx.restore(); }
    ctx.fillStyle = '#1b1d21'; ctx.beginPath(); ctx.arc(0.55, 0.78, 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d23a2a'; ctx.fillRect(-0.06, 0.26, 0.08, 0.05);
    ctx.fillStyle = '#a5201b'; ctx.beginPath(); ctx.roundRect(0.0, 0.6, 0.1, 0.16, 0.02); ctx.fill();
    mirror(ctx, 2.42, 0.92, paint);
  } else if (id === 'super') {
    seam(ctx, [[2.0, 0.92], [2.02, 0.4], [2.1, lo]]);
    seam(ctx, [[3.2, 0.82], [3.26, 0.45], [3.18, lo]]);
    // the side intake: a deep scoop behind the door that feeds the rear engine
    ctx.fillStyle = '#07070b';
    ctx.beginPath(); ctx.moveTo(1.95, 0.78); ctx.quadraticCurveTo(1.45, 0.74, 1.3, 0.42); ctx.lineTo(1.75, 0.4); ctx.quadraticCurveTo(1.85, 0.62, 1.98, 0.66); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lit(paint, 0.4); ctx.lineWidth = 0.015; ctx.stroke();
    // carbon sill and a lit violet accent line along it
    ctx.fillStyle = '#121218'; ctx.fillRect(d.rx + d.r + 0.05, lo - 0.03, d.fx - d.rx - 2 * d.r - 0.1, 0.08);
    ctx.fillStyle = c.stripe ?? '#b9a6ff'; ctx.fillRect(d.rx + d.r + 0.05, lo + 0.05, d.fx - d.rx - 2 * d.r - 0.1, 0.014);
    // rear light bar wraps the tail
    ctx.fillStyle = '#ff3b5c'; ctx.fillRect(0.0, 0.66, 0.08, 0.03);
    mirror(ctx, 3.05, 0.86, paint);
  } else if (id === 'tourer') {
    seam(ctx, [[1.95, 0.97], [1.97, 0.55], [2.02, lo]]);
    seam(ctx, [[2.96, 0.95], [3.0, 0.55], [2.94, lo]]);
    if (detail) handle(ctx, 2.08, 0.86, true);
    // chrome beltline and divide, fender vents behind the front wheel, slim lamps at each end
    ctx.fillStyle = '#e6eaee'; ctx.fillRect(0.3, 0.495, d.L - 0.55, 0.022);
    ctx.fillStyle = 'rgba(240,244,248,0.9)';
    ctx.beginPath(); ctx.moveTo(0.35, d.belt - 0.01); ctx.lineTo(d.L - 0.45, d.belt - 0.05); ctx.lineTo(d.L - 0.45, d.belt - 0.065); ctx.lineTo(0.35, d.belt - 0.025); ctx.closePath(); ctx.fill();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = '#0b0d10'; ctx.beginPath(); ctx.roundRect(3.22 + k * 0.07, 0.6, 0.045, 0.2, 0.02); ctx.fill();
      ctx.fillStyle = '#e6eaee'; ctx.fillRect(3.22 + k * 0.07, 0.6, 0.012, 0.2);
    }
    ctx.fillStyle = '#e59a2c'; ctx.beginPath(); ctx.roundRect(4.45, 0.56, 0.16, 0.045, 0.02); ctx.fill();
    ctx.fillStyle = '#b3241d'; ctx.beginPath(); ctx.roundRect(0.0, 0.58, 0.14, 0.07, 0.03); ctx.fill();
    mirror(ctx, 2.88, 0.96, paint);
  } else if (id === 'rally') {
    seam(ctx, [[1.32, 1.04], [1.34, 0.55], [1.42, lo]]);
    seam(ctx, [[2.58, 1.03], [2.62, 0.55], [2.52, lo]]);
    if (detail) handle(ctx, 1.48, 0.92);
    // gravel guard along the sill, a tow strap at the back and a fender vent behind the front wheel
    ctx.fillStyle = '#16181b';
    ctx.beginPath(); ctx.moveTo(d.rx + d.r + 0.1, d.sill - 0.01); ctx.lineTo(d.fx - d.r - 0.12, d.sill - 0.01); ctx.lineTo(d.fx - d.r - 0.15, d.sill + 0.1); ctx.lineTo(d.rx + d.r + 0.12, d.sill + 0.1); ctx.closePath(); ctx.fill();
    for (let k = 0; k < 3; k++) { ctx.fillStyle = '#0d0f11'; ctx.beginPath(); ctx.roundRect(2.7 + k * 0.07, 0.64, 0.04, 0.16, 0.02); ctx.fill(); }
    ctx.fillStyle = '#e8c21d'; ctx.fillRect(-0.04, 0.42, 0.06, 0.1);
    ctx.fillStyle = '#b8241c'; ctx.beginPath(); ctx.roundRect(0.0, 0.7, 0.1, 0.16, 0.02); ctx.fill();
    ctx.fillStyle = '#e7932b'; ctx.fillRect(0.0, 0.7, 0.1, 0.035);
    mirror(ctx, 2.48, 1.04, paint);
  } else if (id === 'gt') {
    seam(ctx, [[1.92, 0.95], [1.95, 0.5], [2.02, lo]]);
    seam(ctx, [[2.95, 0.92], [2.99, 0.5], [2.92, lo]]);
    // carbon side skirt, a side-exit exhaust ahead of the rear wheel, a deep vent behind the front wheel
    ctx.fillStyle = '#111316'; ctx.fillRect(d.rx + d.r + 0.08, d.sill - 0.02, d.fx - d.rx - 2 * d.r - 0.16, 0.1);
    ctx.fillStyle = '#2b2e33'; ctx.beginPath(); ctx.roundRect(d.rx + d.r + 0.12, d.sill + 0.02, 0.18, 0.07, 0.03); ctx.fill();
    ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.ellipse(d.rx + d.r + 0.2, d.sill + 0.055, 0.06, 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#07080b';
    ctx.beginPath(); ctx.moveTo(3.3, 0.78); ctx.lineTo(3.62, 0.76); ctx.lineTo(3.5, 0.5); ctx.lineTo(3.24, 0.52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lit(paint, 0.35); ctx.lineWidth = 0.012; ctx.stroke();
    // tail lamp strip, tow hooks, a door roundel with the race number
    ctx.fillStyle = '#d3141f'; ctx.fillRect(0.0, 0.7, 0.06, 0.09);
    ctx.fillStyle = '#f0c419'; ctx.fillRect(-0.05, 0.25, 0.07, 0.04); ctx.fillRect(4.74, 0.25, 0.07, 0.04);
    mirror(ctx, 2.86, 0.94, paint);
  } else if (id === 'proto') {
    // carbon floor and a deep sidepod scoop that feeds the radiators; the light blade runs along the flank
    ctx.fillStyle = '#0a0b0e'; ctx.fillRect(d.rx + d.r + 0.04, d.sill - 0.02, d.fx - d.rx - 2 * d.r - 0.08, 0.12);
    ctx.fillStyle = '#05060a';
    ctx.beginPath(); ctx.moveTo(3.4, 0.7); ctx.quadraticCurveTo(2.6, 0.7, 2.1, 0.34); ctx.lineTo(3.2, 0.3); ctx.quadraticCurveTo(3.32, 0.5, 3.48, 0.56); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lit(paint, 0.4); ctx.lineWidth = 0.014; ctx.stroke();
    ctx.fillStyle = c.stripe ?? trim; ctx.fillRect(3.48, 0.6, 1.1, 0.016);
    ctx.fillRect(0.0, 0.78, 0.6, 0.014);
    // canopy door seam and a number panel on the engine cover
    seam(ctx, [[3.36, 0.86], [3.2, 0.5], [3.1, lo]]);
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.beginPath(); ctx.roundRect(0.85, 0.55, 0.42, 0.28, 0.05); ctx.fill();
    ctx.save(); ctx.translate(0.9, 0.6); ctx.scale(0.022, -0.022); ctx.fillStyle = '#0b0d12'; ctx.font = 'italic 900 11px sans-serif'; ctx.fillText('01', 0, 0); ctx.restore();
  } else {
    seam(ctx, [[2.04, 0.96], [2.06, 0.5], [2.15, lo]]);
    seam(ctx, [[3.02, 0.94], [3.06, 0.55], [2.98, lo]]);
    if (detail) handle(ctx, 2.18, 0.84, true);
    // chrome rocker trim and a crisp side stripe along the shoulder
    ctx.fillStyle = '#cfd5da'; ctx.fillRect(0.98 + d.r, d.sill + 0.04, d.fx - d.rx - 2 * d.r - 0.2, 0.025);
    ctx.fillStyle = c.stripe ?? trim;
    ctx.beginPath(); ctx.moveTo(4.6, 0.8); ctx.lineTo(1.4, 0.82); ctx.quadraticCurveTo(1.05, 0.83, 0.92, 0.78); ctx.lineTo(0.92, 0.75); ctx.quadraticCurveTo(1.05, 0.79, 1.4, 0.78); ctx.lineTo(4.6, 0.76); ctx.closePath(); ctx.fill();
    // side marker lamps and a slim wraparound tail lamp
    ctx.fillStyle = '#e5932a'; ctx.beginPath(); ctx.roundRect(4.5, 0.55, 0.16, 0.05, 0.02); ctx.fill();
    ctx.fillStyle = '#a5201b'; ctx.beginPath(); ctx.roundRect(0.0, 0.6, 0.12, 0.14, 0.02); ctx.fill();
    // engine badge on the front fender
    if (detail) { ctx.save(); ctx.translate(3.02, 0.6); ctx.scale(0.01, -0.01); ctx.fillStyle = '#e3c27a'; ctx.font = 'italic 900 11px sans-serif'; ctx.fillText('455', 0, 0); ctx.restore(); }
    mirror(ctx, 2.94, 0.95, '#cfd5da');
  }
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#c4c7c3';
  ctx.beginPath(); ctx.moveTo(-len / 2, -0.045); ctx.lineTo(len / 2, -0.04); ctx.lineTo(len / 2 + 0.02, 0.0); ctx.lineTo(len / 2, 0.045); ctx.lineTo(-len / 2, 0.045); ctx.lineTo(-len / 2 - 0.015, 0.0); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.008; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.006;
  ctx.beginPath(); ctx.moveTo(-len / 2, 0.02); ctx.lineTo(len / 2, 0.022); ctx.stroke();
  ctx.restore();
}

function sideGlass(c: Ctx) {
  const { ctx, id, g, d } = c;
  const cab = d.cabin ?? { seat: '#2a2c30' };
  const chrome = id === 'muscle' || id === 'beater' || id === 'tourer';
  g.glass.forEach((w, wi) => {
    let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
    for (const p of w) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); }
    const front = wi === g.glass.length - 1;
    // window surround: chrome on the classics, black rubber elsewhere
    path(ctx, w);
    ctx.strokeStyle = chrome ? '#cfd5da' : '#0d1013';
    ctx.lineWidth = 0.05; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#0b0f14'; ctx.fill();
    ctx.save();
    path(ctx, w); ctx.clip();
    // the cabin seen through the glass: far door trim, seats with headrests, a steering wheel, a cage
    ctx.fillStyle = lit(cab.seat, -0.72); ctx.fillRect(xmin, ymin, xmax - xmin, (ymax - ymin) * 0.45);
    const seatAt = (sx: number, col: string) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sx, ymin - 0.02); ctx.lineTo(sx + 0.1, ymin + 0.24); ctx.lineTo(sx + 0.2, ymin + 0.24); ctx.lineTo(sx + 0.13, ymin - 0.02); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.roundRect(sx + 0.09, ymin + 0.25, 0.13, 0.12, 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx + 0.12, ymin + 0.27, 0.03, 0.08);
    };
    if (front) {
      seatAt(xmin + (xmax - xmin) * (cab.single ? 0.12 : 0.08), cab.seat);
      // steering wheel and dash top under the windshield
      ctx.strokeStyle = 'rgba(14,16,19,0.95)'; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.ellipse(xmin + (xmax - xmin) * 0.6, ymin + 0.17, 0.035, 0.13, 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#121519';
      ctx.beginPath(); ctx.moveTo(xmin + (xmax - xmin) * 0.62, ymin); ctx.lineTo(xmax, ymin); ctx.lineTo(xmax, ymin + 0.12); ctx.lineTo(xmin + (xmax - xmin) * 0.7, ymin + 0.1); ctx.closePath(); ctx.fill();
    } else if (!cab.single) seatAt(xmin + (xmax - xmin) * 0.25, lit(cab.seat, -0.15));
    if (cab.cage) {
      ctx.strokeStyle = id === 'gt' ? '#d8d2c4' : '#c8ccd0'; ctx.lineWidth = 0.028; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(xmin, ymax - 0.04); ctx.lineTo(xmax, ymin + 0.05);
      ctx.moveTo(front ? xmin + 0.02 : xmax - 0.04, ymax); ctx.lineTo(front ? xmin + 0.02 : xmax - 0.04, ymin); ctx.stroke();
    }
    // tinted glass over the cabin: sky at the top, darker toward the sill
    const gr = ctx.createLinearGradient(0, ymax, 0, ymin);
    gr.addColorStop(0, 'rgba(126,164,190,0.55)'); gr.addColorStop(0.4, 'rgba(46,70,92,0.32)'); gr.addColorStop(1, 'rgba(10,16,22,0.35)');
    ctx.fillStyle = gr; ctx.fillRect(xmin, ymin, xmax - xmin, ymax - ymin);
    // two crisp reflection bands from the stage light
    ctx.fillStyle = 'rgba(232,242,250,0.2)';
    ctx.beginPath(); ctx.moveTo(xmin + 0.1, ymax); ctx.lineTo(xmin + 0.3, ymax); ctx.lineTo(xmin + 0.14, ymin); ctx.lineTo(xmin - 0.06, ymin); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(232,242,250,0.1)';
    ctx.beginPath(); ctx.moveTo(xmin + 0.36, ymax); ctx.lineTo(xmin + 0.42, ymax); ctx.lineTo(xmin + 0.26, ymin); ctx.lineTo(xmin + 0.2, ymin); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

function signatureStripe(c: Ctx) {
  // earned signature finishes add a contrasting accent line under the beltline (hot hatch uses its own stripe)
  const { ctx, d, id } = c;
  if (id === 'hothatch' || id === 'muscle' || id === 'tourer' || id === 'tuner' || id === 'super') return;
  ctx.fillStyle = c.stripe!;
  ctx.beginPath(); ctx.moveTo(0.06, d.belt - 0.13); ctx.lineTo(d.L - 0.15, d.belt - 0.18); ctx.lineTo(d.L - 0.15, d.belt - 0.22); ctx.lineTo(0.06, d.belt - 0.17); ctx.closePath(); ctx.fill();
}

/** Height of the visible top plane (hood, roof, deck) at x. */
function topAt(g: Geo, x: number): number {
  let best = 0;
  for (const { a, b } of g.top) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    if (x >= x0 && x <= x1 && x1 > x0) { const t = (x - a.x) / (b.x - a.x); best = Math.max(best, a.y + (b.y - a.y) * t); }
  }
  return best;
}

/** A dark band across the top of the windshield with a white strip of lettering. */
function sunStrip(c: Ctx) {
  const { ctx, g } = c;
  const D = g.D;
  const idx = g.tags.indexOf('g'), last = g.tags.lastIndexOf('g');
  if (idx < 0) return;
  const top = g.out[idx], cowl = g.out[(last + 1) % g.out.length];
  const q = (t: number) => pt(top.x + (cowl.x - top.x) * t, top.y + (cowl.y - top.y) * t);
  const p0 = q(0.02), p1 = q(0.2);
  fillPts(ctx, [p0, pt(p0.x + D.x, p0.y + D.y), pt(p1.x + D.x, p1.y + D.y), p1], '#14161a');
  const m0 = q(0.08), m1 = q(0.14);
  fillPts(ctx, [pt(m0.x + D.x * 0.2, m0.y + D.y * 0.2), pt(m0.x + D.x * 0.8, m0.y + D.y * 0.8), pt(m1.x + D.x * 0.8, m1.y + D.y * 0.8), pt(m1.x + D.x * 0.2, m1.y + D.y * 0.2)], 'rgba(245,245,240,0.85)');
}

/** Details on the extruded planes and in front of the near wheels: stripes, scoop, spoiler, bumpers, fascia, flares. */
function frontLayer(c: Ctx, glow: number, brake: boolean) {
  const { ctx, id, d, g, paint, trim } = c;
  const D = g.D;
  // flared arch lips over the tyres
  if (d.flare > 0) {
    ctx.lineCap = 'round';
    for (const [wx, gap] of [[d.fx, d.archGap], [d.rx, d.archGap + d.flare * 0.5]] as const) {
      ctx.strokeStyle = id === 'hothatch' ? '#1b1e22' : lit(paint, 0.05);
      ctx.lineWidth = d.flare * 1.6;
      ctx.beginPath(); ctx.arc(wx, d.r + 0.01, d.r + gap + d.flare * 0.3, 0.12, Math.PI - 0.12); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.01;
      ctx.beginPath(); ctx.arc(wx, d.r + 0.01, d.r + gap + d.flare, 0.5, Math.PI - 0.5); ctx.stroke();
    }
  }
  // top-plane stripes (hood, roof, deck)
  const stripes = (bands: [number, number][], col: string) => {
    ctx.fillStyle = col;
    for (const { a, b } of g.top) for (const [f0, f1] of bands) {
      ctx.beginPath();
      ctx.moveTo(a.x + D.x * f0, a.y + D.y * f0); ctx.lineTo(b.x + D.x * f0, b.y + D.y * f0);
      ctx.lineTo(b.x + D.x * f1, b.y + D.y * f1); ctx.lineTo(a.x + D.x * f1, a.y + D.y * f1);
      ctx.closePath(); ctx.fill();
    }
  };
  if (id === 'muscle') stripes([[0.34, 0.44], [0.56, 0.66]], c.stripe ?? trim);
  if (id === 'muscle') {
    // sculpted hood scoop on the hood plane, with its dark intake facing forward
    const y0 = 0.915;
    const base = (x: number, u: number) => pt(x + D.x * u, y0 - (x - 3.1) * 0.033 + D.y * u);
    const hgt = 0.11;
    const up = (p: P, k = 1) => pt(p.x, p.y + hgt * k);
    const a = base(3.25, 0.33), m1 = base(3.55, 0.33), b = base(4.05, 0.33), e = base(4.05, 0.67), m2 = base(3.55, 0.67), f = base(3.25, 0.67);
    // near flank of the scoop, then its lit top, then the dark forward intake
    fillPts(ctx, [a, up(m1), up(b), b], lit(paint, -0.12));
    fillPts(ctx, [up(m1), up(b), up(e), up(m2), f, a], lit(paint, 0.22));
    fillPts(ctx, [b, up(b), up(e), e], '#05070a');
    ctx.fillStyle = 'rgba(200,205,210,0.6)';
    for (const k of [0.3, 0.6]) { const p0 = up(b, k), p1 = up(e, k); ctx.fillRect(Math.min(p0.x, p1.x), p0.y, Math.abs(p1.x - p0.x) + 0.01, 0.01); }
    ctx.strokeStyle = lit(paint, 0.55); ctx.lineWidth = 0.014;
    ctx.beginPath(); ctx.moveTo(up(m1).x, up(m1).y); ctx.lineTo(up(b).x, up(b).y); ctx.stroke();
  }
  if (id === 'hothatch') {
    // roof spoiler, extruded across the full width
    const sp: P[] = [pt(0.12, 1.2), pt(0.66, 1.315), pt(0.7, 1.35), pt(0.18, 1.29)];
    extrude(ctx, sp, null, D, (n) => (n.y > 0.4 ? '#2b3036' : '#1a1d21'));
    fillPts(ctx, sp, '#14171a');
  }
  if (id === 'tuner') {
    // ducktail: a short upturned lip on the trunk, extruded across the width; a roll cage through the glass
    const dt: P[] = [pt(0.02, 0.86), pt(0.32, 0.88), pt(0.3, 0.95), pt(0.04, 0.93)];
    extrude(ctx, dt, null, D, (n) => (n.y > 0.4 ? lit(paint, 0.12) : lit(paint, -0.2)));
    fillPts(ctx, dt, lit(paint, -0.05));
  }
  if (id === 'super') {
    // active rear wing on two slim pylons, raised above the tail
    for (const u of [0.25, 0.75]) fillPts(ctx, [pt(0.35 + D.x * u, 0.86 + D.y * u), pt(0.42 + D.x * u, 0.86 + D.y * u), pt(0.4 + D.x * u, 1.06 + D.y * u), pt(0.33 + D.x * u, 1.06 + D.y * u)], '#121218');
    const wing: P[] = [pt(0.05, 1.04), pt(0.62, 1.08), pt(0.62, 1.12), pt(0.08, 1.11)];
    extrude(ctx, wing, null, D, (n) => (n.y > 0.4 ? '#2a2836' : '#121218'));
    fillPts(ctx, wing, '#1a1924');
    ctx.fillStyle = c.stripe ?? '#b9a6ff'; ctx.fillRect(0.08, 1.105, 0.52, 0.01);
  }
  if (id === 'beater') {
    // faded roof: sun-chalked lacquer along the near roof edge
    const lo = d.profile[6], hi = d.profile[7];
    ctx.strokeStyle = 'rgba(240,226,210,0.35)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(lo[0] + 0.12, lo[1] - 0.02); ctx.lineTo(hi[0] - 0.05, hi[1] - 0.03); ctx.stroke();
  }

  // liveries on the top planes
  const lv = c.liv;
  if (lv === 'stripes') stripes([[0.33, 0.44], [0.56, 0.67]], liveryCol(c));
  if (lv === 'rally' || lv === 'number') sunStrip(c);
  const ty = (x: number) => topAt(g, x);
  if (id === 'rally') {
    // roof scoop feeding the cabin, extruded on the roof plane with its intake facing forward
    const y0 = ty(1.3), hgt = 0.08;
    const b0 = (x: number, u: number, k = 0) => pt(x + D.x * u, y0 + hgt * k + D.y * u);
    fillPts(ctx, [b0(1.05, 0.36), b0(1.25, 0.36, 1), b0(1.6, 0.36, 1), b0(1.6, 0.36)], lit(paint, -0.1));
    fillPts(ctx, [b0(1.05, 0.36), b0(1.25, 0.36, 1), b0(1.6, 0.36, 1), b0(1.6, 0.64, 1), b0(1.25, 0.64, 1), b0(1.05, 0.64)], lit(paint, 0.2));
    fillPts(ctx, [b0(1.6, 0.36), b0(1.6, 0.36, 1), b0(1.6, 0.64, 1), b0(1.6, 0.64)], '#06080a');
    // mud flaps behind every wheel
    for (const wx of [d.rx, d.fx]) {
      const x1 = wx - d.r * 0.72;
      ctx.fillStyle = '#d8d9d4'; ctx.beginPath(); ctx.moveTo(x1, d.sill + 0.02); ctx.lineTo(x1 - 0.14, d.sill + 0.02); ctx.lineTo(x1 - 0.15, 0.07); ctx.lineTo(x1 - 0.01, 0.06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c4231d'; ctx.fillRect(x1 - 0.135, 0.11, 0.12, 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x1 - 0.15, 0.06, 0.14, 0.02);
    }
    // the light pod: four spot lamps on a bar across the nose
    fillPts(ctx, [fp(g, 0.04, 0.95), fp(g, 0.96, 0.95), fp(g, 0.96, 0.82), fp(g, 0.04, 0.82)].map((p) => pt(p.x - 0.12, p.y)), '#111316');
    for (const u of [0.14, 0.38, 0.62, 0.86]) {
      const pc = fp(g, u, 0.885);
      ctx.fillStyle = '#d5d9dc'; ctx.beginPath(); ctx.ellipse(pc.x - 0.11, pc.y, 0.05, 0.062, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = glow > 0 ? '#fffbe6' : '#f0e7c2'; ctx.beginPath(); ctx.ellipse(pc.x - 0.11, pc.y, 0.038, 0.05, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (id === 'gt') {
    // louvres on the hood plane over the front wheel
    ctx.strokeStyle = 'rgba(5,6,8,0.85)'; ctx.lineWidth = 0.022;
    for (let k = 0; k < 5; k++) {
      const x = 3.55 + k * 0.1, y = ty(x);
      ctx.beginPath(); ctx.moveTo(x + D.x * 0.18, y + D.y * 0.18); ctx.lineTo(x + D.x * 0.42, y + D.y * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + D.x * 0.58, y + D.y * 0.58); ctx.lineTo(x + D.x * 0.82, y + D.y * 0.82); ctx.stroke();
    }
    // front splitter, extruded full width
    const sp: P[] = [pt(4.5, 0.12), pt(4.94, 0.1), pt(4.94, 0.135), pt(4.5, 0.17)];
    extrude(ctx, sp, null, D, (n) => (n.y > 0.4 ? '#33363b' : '#121316'));
    fillPts(ctx, sp, '#16181b');
    // swan-neck wing: the element hangs from two curved pylons that rise off the deck
    ctx.lineCap = 'round';
    for (const u of [0.72, 0.28]) {
      ctx.strokeStyle = u > 0.5 ? '#0d0e11' : '#1d1f23'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(0.5 + D.x * u, 0.95 + D.y * u); ctx.quadraticCurveTo(0.62 + D.x * u, 1.38 + D.y * u, 0.36 + D.x * u, 1.36 + D.y * u); ctx.stroke();
    }
    const wing: P[] = [pt(-0.1, 1.24), pt(0.62, 1.29), pt(0.6, 1.34), pt(-0.08, 1.32)];
    extrude(ctx, wing, null, D, (n) => (n.y > 0.4 ? '#2d3035' : '#0f1013'));
    fillPts(ctx, wing, '#17191c');
    // near endplate
    fillPts(ctx, [pt(-0.14, 1.16), pt(0.66, 1.22), pt(0.62, 1.4), pt(-0.12, 1.4)], '#1a1c20');
    ctx.fillStyle = c.stripe ?? trim; ctx.fillRect(-0.12, 1.36, 0.76, 0.03);
  }
  if (id === 'proto') {
    // shark fin along the centreline from the roof to the tail
    const u = 0.5;
    const fin: P[] = [pt(2.2, 1.12), pt(0.55, 1.33), pt(0.2, 1.33), pt(0.2, 0.96), pt(1.4, 0.99)].map((p) => pt(p.x + D.x * u, p.y + D.y * u));
    fillPts(ctx, fin, lit(paint, -0.08));
    ctx.strokeStyle = lit(paint, 0.45); ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(fin[0].x, fin[0].y); ctx.lineTo(fin[1].x, fin[1].y); ctx.stroke();
    // full-width wing with tall endplates
    const wing: P[] = [pt(-0.1, 1.2), pt(0.56, 1.24), pt(0.54, 1.29), pt(-0.08, 1.27)];
    extrude(ctx, wing, null, D, (n) => (n.y > 0.4 ? '#2a2e34' : '#0c0d10'));
    fillPts(ctx, wing, '#14161a');
    ctx.fillStyle = lit(paint, -0.2);
    ctx.beginPath(); ctx.moveTo(-0.14, 0.92); ctx.lineTo(0.5, 0.96); ctx.quadraticCurveTo(0.66, 1.1, 0.62, 1.34); ctx.lineTo(-0.14, 1.34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.stripe ?? trim; ctx.fillRect(-0.12, 1.3, 0.72, 0.022);
    // diffuser fins under the tail
    ctx.fillStyle = '#0b0c0f';
    for (let k = 0; k < 4; k++) ctx.fillRect(-0.04 + k * 0.06, 0.04, 0.02, 0.14);
  }
  // ---- bumpers: a short extruded lip beyond each end, plus the wrap on the near side
  const bumper = (end: 'front' | 'rear', y0: number, y1: number, wrap: number, face: string | CanvasGradient, top: string, frontFace: string, sag = 0) => {
    const e = end === 'front' ? d.L : 0;
    const out = end === 'front' ? 0.07 : -0.06;
    const lip = end === 'front'
      ? [pt(e - 0.02, y0), pt(e + out, y0 + 0.01), pt(e + out, y1 - 0.01), pt(e - 0.02, y1)]
      : [pt(e + 0.02, y0 + sag), pt(e + out, y0 + 0.01 + sag), pt(e + out, y1 - 0.01), pt(e + 0.02, y1)];
    extrude(ctx, lip, null, D, (n) => (n.y > 0.5 ? top : n.x > 0.5 ? frontFace : null));
    const side = end === 'front'
      ? [pt(e - wrap, y0 + 0.02), pt(e + out, y0 + 0.01), pt(e + out, y1 - 0.01), pt(e - wrap, y1 - 0.01)]
      : [pt(e + out, y0 + 0.01 + sag), pt(e + wrap, y0 + 0.02 + sag * 0.3), pt(e + wrap, y1 - 0.01), pt(e + out, y1 - 0.01)];
    fillPts(ctx, side, face);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.01; path(ctx, side); ctx.stroke();
  };
  if (id === 'junker' && c.restore >= 3) {
    const gr = ctx.createLinearGradient(0, 0.49, 0, 0.34);
    gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(0.5, '#8f969c'); gr.addColorStop(1, '#dde1e4');
    bumper('rear', 0.34, 0.48, 0.45, gr, '#f1f3f5', '#a3aab0');
    bumper('front', 0.34, 0.48, 0.42, gr, '#f1f3f5', '#b9c0c6');
  } else if (id === 'junker') {
    // uneven, mismatched black bumpers — the rear one sags on one side, the front is taped on
    bumper('rear', 0.33, 0.49, 0.45, '#27292b', '#3c3f42', '#1d1f21', -0.04);
    bumper('front', 0.34, 0.5, 0.42, '#2e2c29', '#4a4743', '#24221f');
    if (c.restore < 1) { tape(ctx, 3.5, 0.43, 0.26, 0.45); tape(ctx, 3.53, 0.42, 0.22, -0.35); }
  } else if (id === 'beater') {
    bumper('rear', 0.36, 0.47, 0.5, '#2a2c2e', '#45484b', '#202224');
    bumper('front', 0.36, 0.47, 0.55, '#2a2c2e', '#45484b', '#202224');
    ctx.fillStyle = 'rgba(220,225,228,0.75)'; ctx.fillRect(-0.06, 0.43, 0.56, 0.012); ctx.fillRect(3.6, 0.43, 0.62, 0.012);
  } else if (id === 'muscle') {
    const gr = ctx.createLinearGradient(0, 0.5, 0, 0.38);
    gr.addColorStop(0, '#f7f8f9'); gr.addColorStop(0.45, '#8d949a'); gr.addColorStop(0.55, '#c3c9ce'); gr.addColorStop(1, '#e5e8ea');
    bumper('rear', 0.4, 0.5, 0.6, gr, '#f1f3f5', '#a3aab0');
    bumper('front', 0.37, 0.49, 0.55, gr, '#f1f3f5', '#b9c0c6');
  } else if (id === 'tourer') {
    const gr = ctx.createLinearGradient(0, 0.44, 0, 0.36);
    gr.addColorStop(0, '#fafbfc'); gr.addColorStop(0.5, '#9299a0'); gr.addColorStop(1, '#e3e6e9');
    bumper('rear', 0.37, 0.43, 0.28, gr, '#f1f3f5', '#a3aab0');
    bumper('front', 0.36, 0.42, 0.4, gr, '#f1f3f5', '#b9c0c6');
  }

  // fascia: grille, lamps and badge on the front plane
  const fy0 = id === 'hothatch' ? 0.3 : 0.42, fy1 = id === 'hothatch' ? 0.62 : id === 'junker' ? 0.74 : 0.84;
  const lampOn = glow > 0;
  const lens = (warm: boolean) => (lampOn ? (warm ? '#fff3c9' : '#f2fbff') : warm ? '#e8dcb8' : '#d9e6ea');
  if (id === 'junker') {
    fillPts(ctx, quadFP(g, 0.3, 0.7, 0.5, 0.64), '#1a1c1e');
    for (let k = 0; k < 3; k++) fillPts(ctx, quadFP(g, 0.32, 0.68, 0.53 + k * 0.035, 0.545 + k * 0.035), '#3d4144');
    // mismatched headlights: one clear, one yellowed and cracked
    fillPts(ctx, quadFP(g, 0.08, 0.27, 0.52, 0.66), lens(true));
    if (c.restore >= 3) fillPts(ctx, quadFP(g, 0.73, 0.92, 0.52, 0.66), lens(true));
    else {
      fillPts(ctx, quadFP(g, 0.73, 0.92, 0.52, 0.66), lampOn ? '#ffd27a' : '#c9a54a');
      ctx.strokeStyle = 'rgba(40,30,10,0.7)'; ctx.lineWidth = 0.008;
      const a = fp(g, 0.76, 0.64), b = fp(g, 0.85, 0.55), e = fp(g, 0.9, 0.6);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  } else if (id === 'beater') {
    fillPts(ctx, quadFP(g, 0.27, 0.73, 0.55, 0.73), '#16181a');
    for (let k = 0; k < 4; k++) fillPts(ctx, quadFP(g, 0.29, 0.71, 0.575 + k * 0.04, 0.59 + k * 0.04), '#9aa0a5');
    // distinct rectangular headlamps with amber corner indicators
    fillPts(ctx, quadFP(g, 0.04, 0.24, 0.58, 0.72), lens(true));
    fillPts(ctx, quadFP(g, 0.76, 0.96, 0.58, 0.72), lens(true));
    fillPts(ctx, quadFP(g, 0.0, 0.05, 0.6, 0.71), '#e59a2c');
    fillPts(ctx, quadFP(g, 0.95, 1.0, 0.6, 0.71), '#e59a2c');
    fillPts(ctx, quadFP(g, 0.46, 0.54, 0.6, 0.67), '#b5262b');
  } else if (id === 'hothatch') {
    // purposeful lower intake, slim upper grille with the red signature line, LED eyebrows
    fillPts(ctx, quadFP(g, 0.12, 0.88, 0.32, 0.47), '#101214');
    for (let k = 0; k < 3; k++) fillPts(ctx, quadFP(g, 0.14, 0.86, 0.35 + k * 0.04, 0.36 + k * 0.04), '#2a2e33');
    fillPts(ctx, quadFP(g, 0.25, 0.75, 0.5, 0.58), '#14171a');
    fillPts(ctx, quadFP(g, 0.05, 0.95, 0.545, 0.56), trim);
    fillPts(ctx, quadFP(g, 0.03, 0.25, 0.5, 0.58), lens(false));
    fillPts(ctx, quadFP(g, 0.75, 0.97, 0.5, 0.58), lens(false));
    fillPts(ctx, quadFP(g, 0.03, 0.25, 0.585, 0.6), lampOn ? '#e8fbff' : '#a9e8ff');
    fillPts(ctx, quadFP(g, 0.75, 0.97, 0.585, 0.6), lampOn ? '#e8fbff' : '#a9e8ff');
  } else if (id === 'tuner') {
    // black mesh grille panel with square lamps and a lower splitter
    fillPts(ctx, quadFP(g, 0.02, 0.98, 0.52, 0.72), '#121315');
    for (let k = 0; k < 4; k++) fillPts(ctx, quadFP(g, 0.3, 0.7, 0.56 + k * 0.035, 0.57 + k * 0.035), '#2e3236');
    fillPts(ctx, quadFP(g, 0.04, 0.26, 0.55, 0.69), lens(true));
    fillPts(ctx, quadFP(g, 0.74, 0.96, 0.55, 0.69), lens(true));
    fillPts(ctx, quadFP(g, 0.0, 1.0, 0.24, 0.3), '#0c0d0f');
    fillPts(ctx, quadFP(g, 0.42, 0.58, 0.36, 0.44), '#d23a2a');
  } else if (id === 'super') {
    // the light bar: one thin white-violet line across the nose, a dark mouth below it
    fillPts(ctx, quadFP(g, 0.08, 0.92, 0.26, 0.42), '#08080c');
    for (let k = 0; k < 3; k++) fillPts(ctx, quadFP(g, 0.12, 0.88, 0.29 + k * 0.035, 0.3 + k * 0.035), '#1d1c26');
    fillPts(ctx, quadFP(g, 0.02, 0.98, 0.49, 0.515), lampOn ? '#ffffff' : '#e8e2ff');
    fillPts(ctx, quadFP(g, 0.02, 0.98, 0.475, 0.49), lampOn ? 'rgba(200,170,255,0.9)' : 'rgba(185,166,255,0.6)');
    fillPts(ctx, quadFP(g, 0.04, 0.2, 0.52, 0.58), '#14141c');
    fillPts(ctx, quadFP(g, 0.8, 0.96, 0.52, 0.58), '#14141c');
  } else if (id === 'tourer') {
    // oval mouth with a chrome surround and egg-crate grille; covered headlamps under glass domes
    fillPts(ctx, ellipseFP(g, 0.5, 0.5, 0.3, 0.085, 24), '#d9dee3');
    fillPts(ctx, ellipseFP(g, 0.5, 0.5, 0.27, 0.068, 24), '#0a0c0e');
    for (let k = -2; k <= 2; k++) fillPts(ctx, quadFP(g, 0.5 + k * 0.09 - 0.006, 0.5 + k * 0.09 + 0.006, 0.44, 0.56), '#3a4046');
    fillPts(ctx, quadFP(g, 0.25, 0.75, 0.497, 0.505), '#3a4046');
    for (const uc of [0.14, 0.86]) {
      fillPts(ctx, ellipseFP(g, uc, 0.64, 0.12, 0.07, 22), '#1a2026');
      fillPts(ctx, ellipseFP(g, uc, 0.64, 0.055, 0.05), lens(true));
      fillPts(ctx, ellipseFP(g, uc, 0.645, 0.11, 0.06, 22), lampOn ? 'rgba(255,244,214,0.45)' : 'rgba(190,220,240,0.32)');
    }
    fillPts(ctx, ellipseFP(g, 0.5, 0.66, 0.04, 0.04), '#c9a14a');
  } else if (id === 'rally') {
    // aluminium skid plate, a dark grille, round lamps and a tow hook
    fillPts(ctx, quadFP(g, 0.08, 0.92, 0.34, 0.44), '#a9b0b6');
    for (let k = 0; k < 3; k++) fillPts(ctx, quadFP(g, 0.12 + k * 0.28, 0.2 + k * 0.28, 0.36, 0.42), '#6c737a');
    fillPts(ctx, quadFP(g, 0.26, 0.74, 0.56, 0.72), '#121417');
    for (let k = 0; k < 3; k++) fillPts(ctx, quadFP(g, 0.28, 0.72, 0.585 + k * 0.04, 0.595 + k * 0.04), '#34393e');
    for (const uc of [0.12, 0.88]) {
      fillPts(ctx, ellipseFP(g, uc, 0.66, 0.085, 0.07), '#1a1d20');
      fillPts(ctx, ellipseFP(g, uc, 0.66, 0.06, 0.05), lens(true));
    }
    fillPts(ctx, quadFP(g, 0.46, 0.54, 0.47, 0.52), '#e8c21d');
  } else if (id === 'gt') {
    // big lower mouth with mesh, slim angled LED lamps, a canard at each corner
    fillPts(ctx, quadFP(g, 0.08, 0.92, 0.2, 0.44), '#08090b');
    for (let k = 0; k < 4; k++) fillPts(ctx, quadFP(g, 0.1, 0.9, 0.23 + k * 0.05, 0.24 + k * 0.05), '#24272b');
    for (const [u0, u1] of [[0.02, 0.27], [0.73, 0.98]] as const) {
      fillPts(ctx, quadFP(g, u0, u1, 0.55, 0.63), '#101215');
      fillPts(ctx, quadFP(g, u0 + 0.02, u1 - 0.02, 0.575, 0.6), lampOn ? '#ffffff' : '#dff3ff');
    }
    fillPts(ctx, quadFP(g, -0.02, 0.1, 0.36, 0.38), '#16181b');
    fillPts(ctx, quadFP(g, 0.4, 0.6, 0.49, 0.53), c.stripe ?? trim);
  } else if (id === 'proto') {
    // the light blade across the nose, intakes either side, a dark splitter lip
    fillPts(ctx, quadFP(g, 0.06, 0.38, 0.22, 0.42), '#050608');
    fillPts(ctx, quadFP(g, 0.62, 0.94, 0.22, 0.42), '#050608');
    fillPts(ctx, quadFP(g, 0.0, 1.0, 0.1, 0.15), '#0b0c0f');
    fillPts(ctx, quadFP(g, 0.0, 1.0, 0.475, 0.5), lampOn ? '#ffffff' : '#e9fffb');
    fillPts(ctx, quadFP(g, 0.0, 1.0, 0.455, 0.475), lampOn ? 'rgba(80,255,225,0.95)' : 'rgba(54,240,208,0.7)');
  } else {
    // full-width dark grille with quad round headlights inset in chrome bezels and amber parking lamps
    fillPts(ctx, quadFP(g, 0.0, 1.0, 0.5, 0.86), '#d3d8dc');
    fillPts(ctx, quadFP(g, 0.02, 0.98, 0.52, 0.84), '#0c0f12');
    for (let k = 0; k < 7; k++) fillPts(ctx, quadFP(g, 0.3, 0.7, 0.55 + k * 0.04, 0.562 + k * 0.04), k % 2 ? '#2f353b' : '#454c53');
    for (const uc of [0.1, 0.22, 0.78, 0.9]) {
      fillPts(ctx, ellipseFP(g, uc, 0.7, 0.068, 0.09), '#d4d9dd');
      fillPts(ctx, ellipseFP(g, uc, 0.7, 0.05, 0.07), lens(true));
    }
    fillPts(ctx, quadFP(g, 0.34, 0.4, 0.6, 0.64), '#e59a2c');
    fillPts(ctx, quadFP(g, 0.6, 0.66, 0.6, 0.64), '#e59a2c');
    fillPts(ctx, ellipseFP(g, 0.5, 0.72, 0.05, 0.05), '#d9b46a');
  }
  // lens glints: a small specular dot on every lamp so they read as glass
  for (const u of [0.12, 0.88]) {
    const p = fp(g, u, lampY(id) + 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(p.x - 0.01, p.y, 0.012, 0.01, 0, 0, Math.PI * 2); ctx.fill();
  }
  void fy0; void fy1;

  // headlight bloom
  if (lampOn) {
    const ly = lampY(id);
    for (const u of [0.15, 0.85]) {
      const p = fp(g, u, ly);
      const bl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 0.28);
      bl.addColorStop(0, `rgba(255,248,220,${0.75 * glow})`); bl.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = bl;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.28, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (brake) {
    const bl = ctx.createRadialGradient(0.04, 0.68, 0, 0.04, 0.68, 0.22);
    bl.addColorStop(0, 'rgba(255,60,40,0.8)'); bl.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(0.04, 0.68, 0.22, 0, Math.PI * 2); ctx.fill();
  }
}

function beam(c: Ctx, k: number) {
  const { ctx, g, id } = c;
  const p = fp(g, 0.5, lampY(id));
  const gr = ctx.createLinearGradient(p.x, 0, p.x + 4.5, 0);
  gr.addColorStop(0, `rgba(255,240,200,${0.4 * k})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(p.x, p.y + 0.12); ctx.lineTo(p.x + 4.5, p.y + 0.5); ctx.lineTo(p.x + 4.5, -0.1); ctx.lineTo(p.x, p.y - 0.15); ctx.closePath(); ctx.fill();
}

function flame(c: Ctx, k: number, phase: number) {
  const { ctx } = c;
  const surge = c.id === 'super' || c.id === 'proto'; // light trails instead of flames: violet Surge, cyan plasma
  const len = (0.9 + 0.5 * k + 0.08 * Math.sin(phase * 5)) * (surge ? 2.2 : 1);
  const y = 0.3;
  const gr = ctx.createLinearGradient(0, 0, -len, 0);
  if (c.id === 'proto') { gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.2, 'rgba(90,255,230,0.9)'); gr.addColorStop(0.6, 'rgba(60,140,255,0.45)'); gr.addColorStop(1, 'rgba(40,90,255,0)'); }
  else if (surge) { gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.2, 'rgba(190,140,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,80,190,0.45)'); gr.addColorStop(1, 'rgba(120,60,255,0)'); }
  else { gr.addColorStop(0, 'rgba(255,255,240,0.95)'); gr.addColorStop(0.25, k > 1 ? 'rgba(255,214,94,0.9)' : 'rgba(120,205,255,0.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); }
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(0.02, y + 0.07); ctx.quadraticCurveTo(-len * 0.5, y + 0.12, -len, y); ctx.quadraticCurveTo(-len * 0.5, y - 0.1, 0.02, y - 0.06); ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- cover & silhouette

function hull(c: { ctx: CanvasRenderingContext2D; g: Geo }, fill: string) {
  const { ctx, g } = c;
  extrude(ctx, g.out, g.tags, g.D, (_n, tag) => (tag === 'b' ? null : fill));
  path(ctx, g.out);
  ctx.fillStyle = fill; ctx.fill();
  path(ctx, g.out, g.D.x, g.D.y); ctx.fill();
}

function drawCover(ctx: CanvasRenderingContext2D, id: string, amount: number) {
  const g = geometry(id);
  const d = defFor(id);
  const off = (1 - amount) * d.L * 1.3;
  ctx.save();
  ctx.translate(-off, 0.03);
  ctx.globalAlpha = Math.min(1, amount * 1.4);
  const gr = ctx.createLinearGradient(0, 1.5, d.L, 0);
  gr.addColorStop(0, '#7b6a56'); gr.addColorStop(0.5, '#55483a'); gr.addColorStop(1, '#2f271f');
  hull({ ctx, g }, '#4d4134');
  ctx.save();
  path(ctx, g.out); ctx.clip();
  ctx.fillStyle = gr; ctx.fillRect(-0.2, 0, d.L + 0.6, 1.6);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.05;
  for (let k = 1; k < 7; k++) {
    const fx = (k / 7) * d.L;
    ctx.beginPath(); ctx.moveTo(fx, 1.45); ctx.quadraticCurveTo(fx + 0.15, 0.8, fx - 0.05, 0); ctx.stroke();
  }
  ctx.restore();
  // hem drapes to the ground over the wheels
  ctx.fillStyle = '#3d3329';
  ctx.beginPath(); ctx.moveTo(-0.05, 0.02); ctx.lineTo(d.L + 0.05, 0.02); ctx.lineTo(d.L, d.sill + 0.1); ctx.lineTo(0, d.sill + 0.1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- public API

const spriteCache = new Map<string, { back: HTMLCanvasElement; front: HTMLCanvasElement; pad: number; k: number }>();

function setupCtx(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, id: string) {
  const k = w / defFor(id).L;
  ctx.translate(x, y);
  ctx.scale(k, -k);
  return k;
}

/** Paint a consistent car at garage, showroom, reveal, and live race scales. (x, y) is the rear of the car at ground level; w is the car length in px. */
export function drawCar(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, o: CarDrawOpts) {
  if (w < 2) return;
  const d = styledDef(id, o.style);
  const g = geometry(id);
  const paint = hexOf(o.paint);
  const trim = hexOf(o.trim ?? lit(paint, -0.4));
  const detail = o.detail ?? w >= 140;
  if (o.cache && !o.silhouette && !o.cover) return drawCached(ctx, id, x, y, w, o, paint, trim);
  ctx.save();
  setupCtx(ctx, x, y, w, id);
  const c: Ctx = { ctx, id, d, g, paint, trim, stripe: o.livery ?? null, detail, mat: o.style?.material, restore: o.style?.restore ?? 0, liv: o.style?.livery };
  if (o.silhouette) {
    if (o.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(d.L / 2, 0.02, d.L * 0.55, 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    hull(c, '#0f141b');
    for (const wx of [d.rx, d.fx]) { ctx.fillStyle = '#0f141b'; ctx.beginPath(); ctx.arc(wx, d.r, d.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }
  if (o.headlights) beam(c, o.headlights);
  if (o.nitro) flame(c, o.nitro, o.wheelAngle ?? 0);
  backLayer(c, o.shadow !== false);
  for (const [wx, rear] of [[d.rx, true], [d.fx, false]] as const) wheel(ctx, id, d, wx, rear, o.wheelAngle ?? 0, detail, g.D);
  frontLayer(c, o.headlights ?? 0, !!o.brake);
  if (o.cover && o.cover > 0) drawCover(ctx, id, o.cover);
  ctx.restore();
}

function drawCached(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, o: CarDrawOpts, paint: string, trim: string) {
  const d = styledDef(id, o.style);
  const g = geometry(id);
  // Sprites are rendered at coarse size steps (~12%, rounded up) and drawn scaled down to the exact size,
  // so a zooming race camera reuses a handful of bitmaps instead of rebuilding every car each frame or two.
  const W = Math.max(8, Math.round(2 ** (Math.ceil(Math.log2(Math.max(8, w)) * 6) / 6)));
  const f = w / W;
  const key = [id, paint, trim, o.livery ?? '', W, styleKey(o.style)].join('|');
  let s = spriteCache.get(key);
  if (!s) {
    if (spriteCache.size > 48) spriteCache.clear();
    const k = W / d.L;
    const pad = Math.ceil(k * 0.6);
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(W + k * g.D.x + pad * 2);
      cv.height = Math.ceil(k * (1.5 + g.D.y) + pad * 2);
      return cv;
    };
    const back = mk(), front = mk();
    const oy = back.height - pad;
    const draw = (cv: HTMLCanvasElement, fn: (c: Ctx) => void) => {
      const cx = cv.getContext('2d')!;
      cx.save(); setupCtx(cx, pad, oy, W, id);
      fn({ ctx: cx, id, d, g, paint, trim, stripe: o.livery ?? null, detail: false, mat: o.style?.material, restore: o.style?.restore ?? 0, liv: o.style?.livery });
      cx.restore();
    };
    draw(back, (c) => backLayer(c, o.shadow !== false));
    draw(front, (c) => frontLayer(c, 0, false));
    s = { back, front, pad, k };
    spriteCache.set(key, s);
  }
  const oy = s.back.height - s.pad;
  const blit = (cv: HTMLCanvasElement) => ctx.drawImage(cv, x - s!.pad * f, y - oy * f, cv.width * f, cv.height * f);
  if (o.headlights || o.nitro) {
    ctx.save(); setupCtx(ctx, x, y, w, id);
    const c: Ctx = { ctx, id, d, g, paint, trim, stripe: null, detail: false, restore: 0 };
    if (o.headlights) beam(c, o.headlights);
    if (o.nitro) flame(c, o.nitro, o.wheelAngle ?? 0);
    ctx.restore();
  }
  blit(s.back);
  ctx.save(); setupCtx(ctx, x, y, w, id);
  for (const [wx, rear] of [[d.rx, true], [d.fx, false]] as const) wheel(ctx, id, d, wx, rear, o.wheelAngle ?? 0, false, g.D, o.blur ?? 0);
  ctx.restore();
  blit(s.front);
  if (o.headlights || o.brake) {
    ctx.save(); setupCtx(ctx, x, y, w, id);
    const c: Ctx = { ctx, id, d, g, paint, trim, stripe: null, detail: false, restore: 0 };
    frontLayerLightsOnly(c, o.headlights ?? 0, !!o.brake);
    ctx.restore();
  }
}

function frontLayerLightsOnly(c: Ctx, glow: number, brake: boolean) {
  const { ctx, g, id } = c;
  if (glow > 0) {
    const ly = lampY(id);
    for (const u of [0.15, 0.85]) {
      const p = fp(g, u, ly);
      ctx.fillStyle = `rgba(255,248,220,${0.6 * glow})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.09, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (brake) { ctx.fillStyle = 'rgba(255,60,40,0.85)'; ctx.beginPath(); ctx.arc(0.04, 0.68, 0.09, 0, Math.PI * 2); ctx.fill(); }
}

export function drawCarCover(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, amount: number) {
  if (amount <= 0) return;
  ctx.save(); setupCtx(ctx, x, y, w, id);
  drawCover(ctx, id, amount);
  ctx.restore();
}

export function drawHeadlightBeam(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, k: number) {
  if (k <= 0) return;
  ctx.save(); setupCtx(ctx, x, y, w, id);
  beam({ ctx, id, d: defFor(id), g: geometry(id), paint: '#888888', trim: '#888888', stripe: null, detail: false, restore: 0 }, k);
  ctx.restore();
}

/** Trace the near-side body outline (for clipping showroom light sweeps to the paint). */
export function carBodyPath(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number) {
  const g = geometry(id);
  const k = w / defFor(id).L;
  ctx.beginPath();
  g.out.forEach((p, i) => (i ? ctx.lineTo(x + p.x * k, y - p.y * k) : ctx.moveTo(x + p.x * k, y - p.y * k)));
  ctx.closePath();
}

/** Simple helper to size a canvas to its CSS box with a capped pixel ratio. */
export function fitCanvas(c: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return { w, h, dpr };
}
