// The nitro sequence (Redline): one signature boost in three readable beats, every one read from the simulation's own
// boost state (RaceSim: player.nitroLeft / nitroMul, charges, windowState) — never a fixed-length animation.
//
//   1. Ready  — a charge is banked and a boost zone is coming (or open, unused): a steady pilot glow at the car's own
//               exhaust grows as the zone nears. It sits at the tail, round and in the car's nitro colour, so it never
//               competes with the shift light (left thumb, green/amber/red) and it never flashes.
//   2. Fire   — the sim accepted the tap (nitroLeft jumped from 0): ignition bloom at each real exhaust exit, a light
//               pool on the road and a rim light on the car's rear, per-car exhaust (flames, twin jets, light trails,
//               electric arcs on the Tempest), a camera surge and speed streaks. A Perfect boost (nitroMul > 1) turns
//               gold-white, blooms bigger, adds shock diamonds and its own sound sting (see audio-race.ts).
//   3. Settle — the envelope follows nitroLeft down over its last SETTLE_S, so the flame, glow, streaks, camera and
//               sound all end on the sim step the boost ends. Crossing the line lifts the throttle (the sim freezes
//               nitroLeft there), so the boost settles over 0.25 s at the line instead of hanging on.
//
// Lighter effects (settings.lightFx, the race's own quality drop, or reduced motion) keep the flame and the road glow
// (they are the readout) and drop embers, arcs, additive bloom, streaks and — with reduced motion — the camera surge.
// Pause hides every transient effect; a new race builds a new NitroFx, so nothing carries over a retry.
import type { RaceSim, Racer } from '../core/race';
import { carLengthM, nitroExits, nitroFlameLen } from './car';
import { hash } from './scene';
import { FINISH_SETTLE_S, PERFECT_GLOW, nitroEnvelope, nitroIgnition, nitroReadiness, nitroStyleOf } from '../ui/nitroSequence';

export { nitroEnvelope, nitroStyleOf } from '../ui/nitroSequence';

interface Ember { dx: number; dy: number; vx: number; vy: number; life: number; max: number; exit: number }

const glowCache = new Map<string, HTMLCanvasElement>();
/** A soft round glow sprite (rendered once per colour, then only scaled and blitted). */
function glowSprite(c: [number, number, number], core = false): HTMLCanvasElement {
  const key = c.join(',') + (core ? 'c' : '');
  let cv = glowCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (core) gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(core ? 0.18 : 0, `rgba(${c.join(',')},${core ? 0.95 : 0.85})`);
  gr.addColorStop(0.55, `rgba(${c.join(',')},0.28)`);
  gr.addColorStop(1, `rgba(${c.join(',')},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(key, cv);
  return cv;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export class NitroFx {
  /** 0..1 boost strength this frame (the same envelope the sound follows). */
  level = 0;
  /** The boost in progress is a Perfect boost (the sim's nitroMul > 1). */
  perfect = false;
  /** 1 → 0 over the boost's first IGNITE_S. */
  ignite = 0;
  /** 0..1 eased readiness (the Ready beat's pilot glow). */
  ready = 0;
  /** 0..1 eased camera surge (the race camera lags by up to 5% of the width, so the car surges forward). */
  surge = 0;
  /** Metres of road the camera keeps clear behind the player's tail while boosting (eased), so the exhaust is seen. */
  room = 0;
  paused = false;
  /** How many boosts this effect has seen start (tests and the dev trace read it). */
  fired = 0;
  private embers: Ember[] = [];
  private finFade = 0;
  private finished = false;
  private lastUsed = 0;
  private arcT = 0;
  private arcSeed = 0;
  private emitAcc = 0;
  private quality = 1;
  private car = '';

  constructor(private reduced: boolean, private lightSetting = false) {}

  /** Lighter effects this frame: the setting, the race's own quality drop, or reduced motion. */
  get light() { return this.lightSetting || this.reduced || !this.quality; }

  setPaused(p: boolean) { this.paused = p; if (p) this.embers = []; }

  /** Drop every transient effect (a new race, a retry, or leaving). */
  reset() {
    this.level = 0; this.perfect = false; this.ignite = 0; this.ready = 0; this.surge = 0; this.room = 0; this.finFade = 0;
    this.embers = []; this.emitAcc = 0;
  }

  /** Advance one frame from the sim's boost state. */
  update(dt: number, sim: RaceSim, quality: number) {
    this.quality = quality;
    const p = sim.player;
    this.car = p.car;
    if (sim.nitroUsed !== this.lastUsed) { this.lastUsed = sim.nitroUsed; if (p.nitroLeft > 0) this.fired++; }
    if (p.finishTime !== null) {
      // the line lifts the throttle: whatever boost was left settles over FINISH_SETTLE_S, then nothing glows
      if (!this.finished) { this.finished = true; this.finFade = this.level; this.embers = []; }
      this.finFade = Math.max(0, this.finFade - dt / FINISH_SETTLE_S);
      this.level = this.finFade;
      this.ignite = 0;
      if (this.level <= 0) this.perfect = false;
    } else {
      this.level = nitroEnvelope(p.nitroLeft);
      this.ignite = nitroIgnition(p.nitroLeft);
      this.perfect = p.nitroLeft > 0 && p.nitroMul > 1;
    }
    const rt = nitroReadiness(sim);
    this.ready += (rt - this.ready) * Math.min(1, dt / 0.15);
    if (rt === 0 && this.ready < 0.02) this.ready = 0;
    const st = this.reduced ? 0 : this.level * (this.perfect ? 1 : 0.6);
    this.surge += (st - this.surge) * Math.min(1, dt / 0.12);
    if (st === 0 && this.surge < 0.01) this.surge = 0;
    const rm = this.level > 0 ? nitroFlameLen(p.car, 1, this.perfect) * 0.8 : 0;
    this.room += (rm - this.room) * Math.min(1, dt / (rm > this.room ? 0.18 : 0.35));
    if (rm === 0 && this.room < 0.02) this.room = 0;
    // embers: bounded, relative to the exhaust (the camera follows the player), none in lighter effects
    for (const e of this.embers) { e.dx += e.vx * dt; e.dy += e.vy * dt; e.vy -= 3 * dt; e.life -= dt; }
    if (this.embers.length) this.embers = this.embers.filter((e) => e.life > 0);
    if (!this.light && this.level > 0 && p.finishTime === null) {
      const fam = nitroStyleOf(p.car).family;
      const rate = (fam === 'arcs' ? 0 : fam === 'trail' ? 18 : 34) * this.level * (this.perfect ? 1.5 : 1);
      this.emitAcc += rate * dt;
      const exits = nitroExits(p.car, 0, 0, 1).length;
      while (this.emitAcc >= 1 && this.embers.length < 24) {
        this.emitAcc -= 1;
        const life = 0.18 + Math.random() * 0.2;
        this.embers.push({ dx: 0.2 + Math.random() * 0.4, dy: (Math.random() - 0.5) * 0.12, vx: 3 + Math.random() * 5, vy: (Math.random() - 0.2) * 0.8, life, max: life, exit: Math.floor(Math.random() * exits) });
      }
      if (this.emitAcc >= 1) this.emitAcc = 0;
    } else this.emitAcc = 0;
    this.arcT -= dt;
    if (this.arcT <= 0) { this.arcT = 0.05; this.arcSeed = (this.arcSeed + 7.31) % 1000; }
  }

  /** Flame intensity 0..1 for drawCar's `nitro` (0 while paused). Only the player boosts. */
  flame(r: Racer): number {
    if (this.paused) return 0;
    if (r.isPlayer) return this.level;
    return r.nitroLeft > 0 && r.finishTime === null ? nitroEnvelope(r.nitroLeft) : 0;
  }
  perfectOf(r: Racer): boolean { return r.isPlayer ? this.perfect : r.nitroMul > 1; }

  private colour(): [number, number, number] { return this.perfect ? PERFECT_GLOW : nitroStyleOf(this.car).glow; }

  /** Under the player's car: the boost's light pool on the road, and the Ready beat's pilot glow at the exhaust. */
  drawUnder(ctx: CanvasRenderingContext2D, r: Racer, sx: number, gy: number, len: number, dpr: number) {
    if (!r.isPlayer || this.paused) return;
    const exits = nitroExits(r.car, sx, gy, len);
    const k = len / carLengthM(r.car);
    if (this.level > 0.01) {
      const c = this.colour();
      const spr = glowSprite(c);
      const w = len * (this.perfect ? 2 : 1.55) * (0.7 + 0.3 * this.level);
      const hgt = Math.max(8 * dpr, k * (this.perfect ? 1.0 : 0.75));
      ctx.globalAlpha = Math.min(1, this.level * (this.perfect ? 0.95 : 0.7) + this.ignite * 0.3);
      ctx.drawImage(spr, sx - w * 0.6, gy - hgt * 0.55, w, hgt);
      ctx.globalAlpha = 1;
    } else if (this.ready > 0.01) {
      // Ready: a steady pilot light at each exhaust exit, growing as the zone nears (never blinks)
      const spr = glowSprite(nitroStyleOf(r.car).glow);
      const s = k * (0.3 + 0.25 * this.ready);
      ctx.globalAlpha = 0.3 + 0.5 * this.ready;
      for (const e of exits) ctx.drawImage(spr, e.x - s, e.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
  }

  /** Over the player's car: ignition bloom at the exits, a rim light on the rear, embers, arcs, shock diamonds. */
  drawOver(ctx: CanvasRenderingContext2D, r: Racer, sx: number, gy: number, len: number, dpr: number) {
    if (!r.isPlayer || this.paused || this.level <= 0.01) return;
    const st = nitroStyleOf(r.car);
    const c = this.colour();
    const k = len / carLengthM(r.car);
    const exits = nitroExits(r.car, sx, gy, len);
    const light = this.light;
    const prevOp = ctx.globalCompositeOperation;
    if (!light) ctx.globalCompositeOperation = 'lighter';
    // ignition bloom (big at the start, a hot core through the boost); Perfect blooms ~1.6× bigger
    const core = glowSprite(c, true);
    const big = this.perfect ? 1.6 : 1;
    for (const e of exits) {
      const s = k * big * (0.32 + 0.25 * this.level + (light ? 0.5 : 1.3) * this.ignite);
      ctx.globalAlpha = Math.min(1, 0.35 + 0.5 * this.level + 0.4 * this.ignite) * (light ? 0.7 : 1);
      ctx.drawImage(core, e.x - s, e.y - s, s * 2, s * 2);
    }
    if (!light) {
      // the boost lights the car's rear quarter
      const rim = glowSprite(c);
      const rw = len * 0.55 * big, rh = k * 1.1;
      ctx.globalAlpha = 0.35 * this.level + 0.25 * this.ignite;
      ctx.drawImage(rim, sx - rw * 0.35, gy - rh * 0.95, rw, rh);
    }
    ctx.globalCompositeOperation = prevOp;
    // shock diamonds: a Perfect boost's flame carries bright beads along it (combustion and light trails alike)
    if (this.perfect && st.family !== 'arcs') {
      ctx.fillStyle = 'rgba(255,250,225,0.9)';
      for (const e of exits) for (let i = 1; i <= 3; i++) {
        const d = k * (0.22 + i * 0.24) * (st.family === 'trail' ? 1.6 : 1);
        const rr = Math.max(1.2 * dpr, k * 0.05 * (1 - i * 0.2));
        ctx.globalAlpha = this.level * (1 - i * 0.22);
        ctx.beginPath(); ctx.ellipse(e.x - d, e.y, rr * 1.8, rr, 0, 0, 6.283); ctx.fill();
      }
    }
    if (!light) {
      // electric arcs (Tempest): a few jagged discharges along the trail, re-struck every 50 ms (not every frame)
      if (st.family === 'arcs') {
        ctx.strokeStyle = this.perfect ? 'rgba(255,240,170,0.95)' : rgba(st.glow, 0.95);
        ctx.lineWidth = Math.max(1, 1.4 * dpr);
        ctx.globalAlpha = this.level;
        ctx.beginPath();
        const n = this.perfect ? 3 : 2;
        for (const e of exits) for (let a = 0; a < n; a++) {
          let x = e.x, y = e.y;
          ctx.moveTo(x, y);
          for (let j = 1; j <= 5; j++) {
            x = e.x - k * (0.25 + 0.3 * j) * (0.8 + 0.4 * hash(this.arcSeed + a * 3.7 + j));
            y = e.y + k * (hash(this.arcSeed * 1.3 + a * 11 + j * 5.1) - 0.5) * 0.36;
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      // embers / glints streaming back from the exits
      if (this.embers.length) {
        ctx.fillStyle = this.perfect ? '#fff1b8' : st.family === 'trail' ? '#ffffff' : '#ffb35c';
        for (const em of this.embers) {
          const e = exits[em.exit] ?? exits[0];
          const s = Math.max(1, 0.05 * k);
          ctx.globalAlpha = Math.max(0, em.life / em.max) * this.level;
          ctx.fillRect(e.x - em.dx * k - s, e.y - em.dy * k - s * 0.5, s * 2.4, s);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Speed streaks over the scene: the race's ordinary speed lines above 18 m/s, tinted and lengthened by the boost
   * envelope (gold for a Perfect). Inside the road band they are half as strong, so rivals stay readable.
   * None with reduced motion or lighter effects.
   */
  drawStreaks(ctx: CanvasRenderingContext2D, player: Racer, camX: number, ppm: number, W: number, horizon: number, roadTop: number, roadBot: number, dpr: number) {
    if (this.reduced || this.light || player.v <= 18) return;
    const lvl = this.paused ? 0 : this.level;
    const base = Math.min(0.22, (player.v - 18) / 80);
    const c: [number, number, number] = lvl > 0 ? this.colour() : [255, 255, 255];
    const a = base + lvl * (this.perfect ? 0.3 : 0.14);
    const n = 10 + Math.round(lvl * (this.perfect ? 6 : 3));
    const L = (60 + lvl * (this.perfect ? 40 : 15)) * dpr;
    ctx.lineWidth = (2 + lvl * (this.perfect ? 1.2 : 0.4)) * dpr;
    const cell = W / 3;
    const out = new Path2D(), inRoad = new Path2D();
    for (let k = 0; k < n; k++) {
      const world = camX * ppm * 1.6 + k * cell * 0.37;
      const slot = Math.floor(world / cell);
      const y = horizon * 0.3 + hash(slot * 13.1 + k) * (roadBot - horizon * 0.3);
      const x = ((k * cell * 0.37 - camX * ppm * 1.6) % (W + cell) + W + cell) % (W + cell) - cell * 0.5;
      const p = y > roadTop && y < roadBot ? inRoad : out;
      p.moveTo(x, y); p.lineTo(x + L, y);
    }
    ctx.strokeStyle = rgba(c, a);
    ctx.stroke(out);
    ctx.strokeStyle = rgba(c, a * 0.5);
    ctx.stroke(inRoad);
  }
}
