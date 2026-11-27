// Race effects and track signage (race workstream): car-specific launch and burnout effects (smoke, gravel, light
// trails, exhaust pops, electric arcs), rubber marks left by wheelspin, speed streaks, and the readable course signs
// (braking boards, bend warnings with the speed this car can take the bend at, chevrons through it, straight boards).
//
// Everything lives in world metres so it stays put on the road as the camera moves and zooms. Drawing is flat fills
// and a few strokes per frame; particle counts are capped and halve when the race screen drops to reduced effects.
// Reduced motion keeps the static parts (rubber marks, signs) and skips every moving particle.
import { mph } from '../core/units';
import type { RaceSim, Racer } from '../core/race';
import type { Look } from './scene';
import { signText } from './scene';

type Kind = 'smoke' | 'chip' | 'spark' | 'pop';
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; grow: number; c: string; kind: Kind; lane: number }

/** How a car launches: tyre-smoke colour and amount, plus its signature (gravel, light trail, pops, turbo cloud, arcs). */
export interface LaunchFx {
  smoke: string;
  /** Smoke amount 0..1.5 (a big V8 burnout vs a light hypercar chirp). */
  amount: number;
  /** Signature effect. */
  sig: 'none' | 'gravel' | 'trail' | 'pops' | 'turbo' | 'arcs' | 'oil';
  /** Light-trail / spark colour for the signature. */
  accent?: string;
}

export const LAUNCH_FX: Record<string, LaunchFx> = {
  junker: { smoke: '#9b958e', amount: 0.8, sig: 'oil', accent: '#7f8fa8' }, // tired engine: a puff of blue oil smoke
  beater: { smoke: '#b9b4ad', amount: 0.6, sig: 'none' },
  hothatch: { smoke: '#d9d6d0', amount: 0.7, sig: 'pops', accent: '#ffb347' },
  muscle: { smoke: '#ecebe8', amount: 1.5, sig: 'none' }, // the big V8 burnout
  tourer: { smoke: '#d6d3cd', amount: 0.6, sig: 'none' },
  tuner: { smoke: '#e6e4df', amount: 0.7, sig: 'pops', accent: '#ffcf5a' },
  super: { smoke: '#d8d2e8', amount: 0.5, sig: 'trail', accent: '#b98cff' }, // Lumen: light-bar trails
  rally: { smoke: '#c9a77a', amount: 1, sig: 'gravel', accent: '#7a5a3a' }, // Corvo: AWD gravel spray
  gt: { smoke: '#e2e2e2', amount: 0.9, sig: 'pops', accent: '#ff7a2f' },
  proto: { smoke: '#d4e8f2', amount: 0.5, sig: 'trail', accent: '#8ff4ff' }, // Halcyon: light-blade trails
  vireo: { smoke: '#ece6dc', amount: 0.8, sig: 'pops', accent: '#ff6a2a' }, // screaming V10: flame pops
  mako: { smoke: '#b8c2cc', amount: 1.3, sig: 'turbo', accent: '#9fd4ff' }, // twin-turbo: a big blue-grey cloud
  sovereign: { smoke: '#dcd6f0', amount: 0.7, sig: 'arcs', accent: '#7fb8ff' }, // V12 hybrid: electric arcs
};
const fxOf = (car: string) => LAUNCH_FX[car] ?? LAUNCH_FX.beater;

export interface Lane { lane: number; depth: number; ground: number }

export class RaceFx {
  private parts: Part[] = [];
  /** Rubber marks per racer: world x range (rear wheel) of the launch wheelspin. */
  private marks = new Map<string, { x0: number; x1: number; dark: number }>();
  private emitAcc = new Map<string, number>();
  private lastGear = new Map<string, number>();
  private burnT = 0;

  constructor(private reduced: boolean, private look: Look | string) {}

  /** Rear-wheel world x of a racer drawn at `depth`. */
  static rearX(r: Racer, L: number, depth: number) { return r.x - L * depth * 0.8; }

  /**
   * Advance the effects one frame. `staging`: the countdown (the player's burnout). `quality` 0 halves particles.
   * `lenOf` gives each racer's car length (m) and `laneOf` its lane index and depth.
   */
  update(dt: number, sim: RaceSim, staging: number, quality: number, lenOf: (r: Racer) => number, laneOf: (r: Racer) => { lane: number; depth: number }) {
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.s += p.grow * dt;
      if (p.kind === 'chip' || p.kind === 'spark') p.vy -= 9 * dt; // gravity
      else p.vy *= 1 - 0.8 * dt;
      if (p.y < 0 && p.kind === 'chip') { p.y = 0; p.vy = -p.vy * 0.3; p.vx *= 0.6; }
    }
    if (this.parts.length) this.parts = this.parts.filter((p) => p.life > 0);
    const cap = quality ? 90 : 36;
    for (const r of sim.racers) {
      const L = lenOf(r);
      const { lane, depth } = laneOf(r);
      const fx = fxOf(r.car);
      const rx = RaceFx.rearX(r, L, depth);
      // rubber: the launch's wheelspin leaves a mark from the line (static: drawn even with reduced motion)
      const spin = staging > 0 && r.isPlayer ? 1 : r.slip;
      if (spin > 0.18 && r.finishTime === null && sim.track.segments[0] && r.x < sim.track.segments[0].length + 5) {
        const m = this.marks.get(r.id);
        if (!m) this.marks.set(r.id, { x0: rx - (staging > 0 ? 0.6 : 0), x1: rx, dark: Math.min(1, 0.4 + fx.amount * 0.4) });
        else m.x1 = Math.max(m.x1, rx);
      }
      if (this.reduced) continue;
      // emission rate: the player's burnout while staging; wheelspin off the line for everyone (rivals lighter)
      let rate = 0;
      if (staging > 0 && r.isPlayer) { this.burnT += dt; rate = 26 * fx.amount * Math.min(1, this.burnT / 0.6); }
      else if (r.finishTime === null && staging <= 0) {
        // off the line every car lights up its tyres a little (more with real wheelspin); in a bend only a car on the
        // grip limit lets go of a thin wisp
        const launching = !!sim.track.segments[0] && r.x < sim.track.segments[0].length && sim.t < 1.6;
        const s = launching ? Math.max(r.slip, 0.45 * (1 - sim.t / 1.6)) : r.slip > 0.5 ? (r.slip - 0.5) * 0.4 : 0;
        rate = (r.isPlayer ? 40 : 14) * fx.amount * s;
      }
      if (!quality) rate *= 0.4;
      const acc = (this.emitAcc.get(r.id) ?? 0) + rate * dt;
      let n = Math.floor(acc);
      this.emitAcc.set(r.id, acc - n);
      const gravelHere = fx.sig === 'gravel' || this.look === 'desert';
      while (n-- > 0 && this.parts.length < cap) {
        const life = 0.7 + Math.random() * 0.6;
        this.parts.push({ x: rx - Math.random() * 0.4, y: 0.15 + Math.random() * 0.2, vx: r.v * 0.15 - (staging > 0 ? 3 : 1) - Math.random() * 2, vy: 0.6 + Math.random() * 1.2, life, max: life, s: 0.35, grow: 1.1 * (fx.sig === 'turbo' ? 1.6 : 1), c: gravelHere && fx.sig !== 'gravel' ? '#c9a77a' : fx.smoke, kind: 'smoke', lane });
        if (gravelHere && Math.random() < 0.8 && this.parts.length < cap) {
          this.parts.push({ x: rx, y: 0.1, vx: r.v * 0.3 - 4 - Math.random() * 5, vy: 1.5 + Math.random() * 2.5, life: 0.6, max: 0.6, s: 0.1 + Math.random() * 0.1, grow: 0, c: fx.accent && fx.sig === 'gravel' ? fx.accent : '#6e5236', kind: 'chip', lane });
        }
        if (r.isPlayer && fx.sig === 'oil' && Math.random() < 0.3) this.parts.push({ x: r.x - L * depth, y: 0.35, vx: -1, vy: 0.4, life: 1.2, max: 1.2, s: 0.3, grow: 0.9, c: fx.accent!, kind: 'smoke', lane });
        if (fx.sig === 'arcs' && Math.random() < 0.6) this.parts.push({ x: rx + (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random() * 0.4, vx: r.v * 0.5, vy: 1 + Math.random() * 2, life: 0.18, max: 0.18, s: 0.06, grow: 0, c: fx.accent!, kind: 'spark', lane });
      }
      // exhaust pops on each upshift (and a burst at the launch) for the pop cars; a turbo flutter puff for the Mako
      const g = this.lastGear.get(r.id);
      this.lastGear.set(r.id, r.gear);
      if (g !== undefined && r.gear > g && (r.isPlayer || quality)) {
        const tail = r.x - L * depth;
        if (fx.sig === 'pops' || fx.sig === 'arcs') for (let k = 0; k < (r.isPlayer ? 6 : 2) && this.parts.length < cap; k++)
          this.parts.push({ x: tail, y: 0.35 + Math.random() * 0.1, vx: r.v * 0.6 - 2 - Math.random() * 3, vy: (Math.random() - 0.3) * 1.5, life: 0.16, max: 0.16, s: 0.12 + Math.random() * 0.1, grow: 0.3, c: fx.accent!, kind: 'pop', lane });
        if (fx.sig === 'turbo' && this.parts.length < cap) this.parts.push({ x: tail, y: 0.4, vx: r.v * 0.5, vy: 0.5, life: 0.5, max: 0.5, s: 0.3, grow: 1.4, c: '#cfd8e2', kind: 'smoke', lane });
      }
    }
  }

  /** Rubber marks on the road (under the cars). */
  drawMarks(ctx: CanvasRenderingContext2D, camX: number, ppm: number, dpr: number, laneOf: (id: string) => Lane | null) {
    for (const [id, m] of this.marks) {
      const ln = laneOf(id);
      if (!ln) continue;
      const x0 = (m.x0 - camX) * ppm, x1 = (m.x1 - camX) * ppm;
      if (x1 < 0 || x0 > ctx.canvas.width) continue;
      const w = Math.max(1, x1 - x0);
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, `rgba(12,10,10,${0.65 * m.dark})`); g.addColorStop(1, 'rgba(12,10,10,0)');
      ctx.fillStyle = g;
      const hgt = 4 * dpr * ln.depth;
      ctx.fillRect(x0, ln.ground - hgt * 0.6, w, hgt);
      ctx.fillRect(x0, ln.ground - hgt * 2.6, w, hgt * 0.8); // the far-side tyre
    }
  }

  /** Smoke, gravel, sparks and pops (over the road, between the cars of each lane order). */
  drawParticles(ctx: CanvasRenderingContext2D, camX: number, ppm: number, laneOf: (lane: number) => Lane, onlyLane: number) {
    if (!this.parts.length) return;
    for (const p of this.parts) {
      if (p.lane !== onlyLane) continue;
      const ln = laneOf(p.lane);
      const k = ppm * ln.depth;
      const x = (p.x - camX) * ppm, y = ln.ground - p.y * k;
      const a = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      if (p.kind === 'smoke') {
        // a soft puff: a faint wide disc around a denser core
        const rr = Math.max(1, p.s * k);
        ctx.globalAlpha = 0.16 * a;
        ctx.beginPath(); ctx.arc(x, y, rr * 1.35, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 0.3 * a;
        ctx.beginPath(); ctx.arc(x, y, rr * 0.8, 0, 6.283); ctx.fill();
      } else if (p.kind === 'pop') {
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, p.s * k), 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, p.s * k * 0.45), 0, 6.283); ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        const s = Math.max(1, p.s * k);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Light trails behind the light-bar cars off the line and while boosting (Lumen, Halcyon, Sovereign). */
  drawTrail(ctx: CanvasRenderingContext2D, r: Racer, sx: number, gy: number, len: number, dpr: number, launching: boolean) {
    const fx = fxOf(r.car);
    if (this.reduced || !(fx.sig === 'trail' || fx.sig === 'arcs') || r.v < 4 || !(launching || r.nitroLeft > 0)) return;
    const tl = Math.min(len * 2.2, r.v * 0.06 * len);
    const y0 = gy - len * 0.13;
    const g = ctx.createLinearGradient(sx - tl, 0, sx, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, fx.accent!);
    ctx.strokeStyle = g; ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85; ctx.lineWidth = 3 * dpr;
    ctx.beginPath(); ctx.moveTo(sx - tl, y0); ctx.lineTo(sx + len * 0.02, y0); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(sx - tl * 0.7, y0 - len * 0.06); ctx.lineTo(sx + len * 0.02, y0 - len * 0.06); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
}

// ---------------------------------------------------------------- course signs

/** The bend's name by radius, and the speed (mph) this car can take it at: the same grip limit the sim brakes to. */
export function bendInfo(radius: number, grip: number) {
  const kind = radius <= 30 ? 'HAIRPIN' : radius <= 60 ? 'BEND' : 'SWEEPER';
  return { kind, mph: mph(Math.sqrt(grip * 9.81 * radius)) };
}

/** A sign board sized to its text: the box grows with the measured label (never the other way round), so a label
 *  always fits inside its board at any DPR or fallback font. Returns the board width. */
function board(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, hgt: number, dpr: number, bg: string, fg: string, edge?: string): number {
  const px = Math.round(hgt * 0.62);
  ctx.font = `800 ${px}px Barlow, system-ui`;
  const w = Math.ceil(ctx.measureText(text).width) + 12 * dpr;
  const x = cx - w / 2;
  ctx.fillStyle = edge ?? 'rgba(0,0,0,0.45)'; ctx.fillRect(x - dpr, top - dpr, w + 2 * dpr, hgt + 2 * dpr);
  ctx.fillStyle = bg; ctx.fillRect(x, top, w, hgt);
  signText(ctx, text, x, top, w, hgt, 3 * dpr, fg, px, 800, 'Barlow, system-ui');
  return w;
}

/**
 * Course signs along the upper verge: braking boards (150 / 100 / 50 m) and a warning board ("HAIRPIN · 42 mph")
 * before each bend, chevrons through it, and a green straight board where a long straight opens up.
 */
export function drawCourseSigns(ctx: CanvasRenderingContext2D, sim: RaceSim, camX: number, ppm: number, roadTop: number, dpr: number, grip: number) {
  const W = ctx.canvas.width;
  const segs = sim.track.segments;
  const vis = (m: number, pad = 80 * dpr) => { const x = (m - camX) * ppm; return x > -pad && x < W + pad ? x : null; };
  const post = (x: number, top: number) => { ctx.fillStyle = '#4a4d55'; ctx.fillRect(x - 1.5 * dpr, top, 3 * dpr, roadTop - top - 2 * dpr); };
  for (let s0 = 0, i = 0; i < segs.length; s0 += segs[i].length, i++) {
    const sg = segs[i];
    const prev = segs[i - 1];
    if (sg.radius && !prev?.radius) {
      // braking boards on the run-up (only where the run-up is long enough to hold them)
      const run = prev ? prev.length : 0;
      for (const d of [150, 100, 50]) {
        if (d > run - 10) continue;
        const x = vis(s0 - d);
        if (x === null) continue;
        post(x, roadTop - 30 * dpr);
        board(ctx, String(d), x, roadTop - 44 * dpr, 16 * dpr, dpr, '#f4f4f0', '#1d1d22', '#c4362c');
      }
    }
    if (sg.radius) {
      const info = bendInfo(sg.radius, grip);
      const x = vis(s0 - 22);
      if (x !== null && !prev?.radius) {
        post(x, roadTop - 50 * dpr);
        board(ctx, `${info.kind} ›`, x, roadTop - 78 * dpr, 22 * dpr, dpr, info.kind === 'HAIRPIN' ? '#ff5a3c' : '#f2a33a', '#1d1208');
        board(ctx, `${info.mph} mph`, x, roadTop - 56 * dpr, 17 * dpr, dpr, '#1d1208', '#ffd27a');
      } else if (x !== null && prev?.radius) {
        // a bend straight into another: one board names the next one
        post(x, roadTop - 38 * dpr);
        board(ctx, `${info.kind} ${info.mph}`, x, roadTop - 56 * dpr, 18 * dpr, dpr, '#f2a33a', '#1d1208');
      }
      // chevrons through the bend
      const step = Math.max(10, Math.min(18, sg.length / 4));
      for (let m = s0 + 4; m < s0 + sg.length - 2; m += step) {
        const cx = vis(m, 30 * dpr);
        if (cx === null) continue;
        const cw = 14 * dpr, ch = 16 * dpr, top = roadTop - 26 * dpr;
        ctx.fillStyle = '#1d1d22'; ctx.fillRect(cx - cw / 2, top, cw, ch);
        ctx.fillStyle = info.kind === 'HAIRPIN' ? '#ff5a3c' : '#ffc457';
        ctx.beginPath(); ctx.moveTo(cx - cw * 0.28, top + ch * 0.18); ctx.lineTo(cx + cw * 0.3, top + ch * 0.5); ctx.lineTo(cx - cw * 0.28, top + ch * 0.82);
        ctx.lineTo(cx - cw * 0.05, top + ch * 0.5); ctx.closePath(); ctx.fill();
      }
    } else if ((sg.type === 'straight' || sg.type === 'highway') && sg.length >= 120 && i > 0) {
      const x = vis(s0 + 6);
      if (x === null) continue;
      post(x, roadTop - 34 * dpr);
      board(ctx, `STRAIGHT ${Math.round(sg.length / 10) * 10} m`, x, roadTop - 52 * dpr, 18 * dpr, dpr, '#1f8f47', '#f2fff5', '#0d3d20');
    }
  }
}
