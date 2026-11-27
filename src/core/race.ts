import { RACE, RIVALS, STAT_SCALE, Segment, TIER_STAT, Track, TRACKS, carById, eventById, trackLength, CarId } from '../data/tables';
import { Drivetrain, drivetrainFor } from '../data/drivetrain';
import { makeRng } from './rng';
import type { LeanOutcome } from './state';
import { mph } from './units';

export interface RacerStats { top: number; accel: number; grip: number }

/**
 * Who shifts, and how well.
 * - `manual`: the player's SHIFT input (live races). Without a tap the box shifts itself on the limiter (`missed`).
 * - `clean`: always in the green band. `ordinary`: a beat late, on the limiter (Quick Race, bots, the default).
 * - `early`: short-shifts below the band. `missed`: never taps; every shift is the automatic fallback.
 */
export type ShiftPolicy = 'manual' | 'clean' | 'ordinary' | 'early' | 'missed';
/** How one upshift landed. `assist`: the practice race shifted for you inside a boost zone (not counted). */
export type ShiftGrade = 'clean' | 'early' | 'late' | 'missed' | 'assist';

export interface RaceSetup {
  eventId: string;
  seed: number;
  player: { name: string; car: CarId; stats: RacerStats; paint: string; perfectMul?: number };
  nitroCharges: number;
  /** Practice runs widen each nitro window (1 = normal). */
  windowScale?: number;
  /** Player shifting (default `ordinary`: Quick Race and the simulation bot). The live race screen uses `manual`. */
  shift?: ShiftPolicy;
  /** Rival shifting (default `clean`, the reference acceleration). Tuning hook for stage 2. */
  rivalShift?: ShiftPolicy;
  /** The first (tutorial) race: shift cues never overlap a boost zone. Defaults to windowScale > 1. */
  practice?: boolean;
  /** Internal: counterfactual runs skip their own analysis. */
  analysis?: boolean;
}

export interface Racer {
  id: string;
  name: string;
  car: CarId;
  paint: string;
  isPlayer: boolean;
  stats: RacerStats;
  x: number;
  v: number;
  finishTime: number | null;
  nitroLeft: number; // seconds
  nitroMul: number;
  splits: number[]; // time at end of each segment
  /** Gear index (0 = first). */
  gear: number;
  /** Seconds of torque cut left from the current shift. */
  cut: number;
  /** Seconds spent on the rev limiter waiting for a shift. */
  limiterT: number;
  policy: ShiftPolicy;
  /** Fastest speed before the line (m/s). */
  peak: number;
  /** Braking for a bend this step: actually slowing (not cruising at a bend's limit). Only this can drop a gear. */
  braking: boolean;
  /** Sim time of the last gear change, up or down (no automatic downshift soon after one). */
  gearT: number;
  /** Sim time this racer last braked; a braking zone ends after SHIFT.zoneGapS without braking. */
  brakeT: number;
  /** Gears dropped in this braking zone (at most SHIFT.downPerZone). */
  zoneDown: number;
}

/** An automatic downshift of the player's (the HUD flashes it: "↓3"). A new object each time. */
export interface DownshiftRecord { t: number; from: number; into: number }

/**
 * One shift attempt: the single state both the HUD cue and the SHIFT tap are judged from. It is refreshed once per
 * sim step (never by the renderer), so the screen and the judgment always see the same numbers, and its window stays
 * fixed for as long as the attempt lasts. A new attempt (new `id`) opens after every gear change, after braking, and
 * when nitro fires before the window opened (the needle will climb faster, so the window is re-measured).
 * - `hold`: braking for a bend (with no green showing), or just after an automatic downshift: no cue, and a tap is
 *   not a shift. A green that braking catches stays green, and clean to tap, for SHIFT.brakeGraceS.
 */
export interface ShiftAttempt {
  id: number;
  /** Gear the attempt shifts out of (0 = first). */
  gear: number;
  /** Green window as fractions of the redline (fixed for the attempt). */
  band: [number, number];
  /** Engine speed at the last sim step (what the tach shows and what a tap is judged on). */
  f: number;
  cue: 'off' | 'hold' | 'soon' | 'green' | 'late';
  /** While braking: sim time until which a green caught by the braking stays green (-1: none). */
  graceUntil: number;
  /** The window was measured for a possible Perfect boost (a fresh boost zone was close). */
  boost: boolean;
}

export interface ShiftRecord { t: number; into: number; grade: ShiftGrade; rpm: number; cost: number }

export interface Coach { kind: 'shift' | 'boost' | 'build'; text: string; lost: number }

export interface RaceOutcome {
  place: number; // 1..4
  standings: Racer[];
  playerTime: number | null;
  gapText: string;
  perfects: number;
  nitroUsed: number;
  /** Charges still unused at the finish. */
  nitroLeft: number;
  /** Player speed (m/s) crossing the line — the speed trap's score. */
  trapSpeed: number | null;
  cutoff: boolean;
  advice: { family: 'engine' | 'tires' | 'turbo'; segment: string; lost: number } | null;
  /** Timed shifting: upshifts the player made (assists excluded), clean ones, and the log. */
  // (optional so hand-built outcomes in older tests still type-check; the sim always fills them)
  shifts?: number;
  shiftsClean?: number;
  shiftLog?: ShiftRecord[];
  /** Player's top speed before the line (m/s). */
  topSpeed?: number;
  /** Seconds lost to shifting against the same run with clean shifts, and to boost timing against Perfect boosts. */
  shiftLoss?: number | null;
  boostLoss?: number | null;
  /** The single most useful reason for this result: a missed shift, a late boost, or the build. */
  coach?: Coach | null;
}

export function segmentAt(track: Track, x: number): { seg: Segment; index: number; start: number } {
  let start = 0;
  for (let i = 0; i < track.segments.length; i++) {
    const seg = track.segments[i];
    if (x < start + seg.length || i === track.segments.length - 1) return { seg, index: i, start };
    start += seg.length;
  }
  throw new Error('unreachable');
}

export interface NitroWindow { start: number; end: number; segIndex: number }

export function nitroWindows(track: Track, scale = 1): NitroWindow[] {
  const out: NitroWindow[] = [];
  let start = 0;
  track.segments.forEach((s, i) => {
    if (s.window) out.push({ start: start + s.length * s.window[0], end: Math.min(start + s.length, start + s.length * (s.window[0] + (s.window[1] - s.window[0]) * scale)), segIndex: i });
    start += s.length;
  });
  return out;
}

const bendCap = (grip: number, radius: number) => Math.sqrt(grip * 9.81 * radius);

/** A car's top-speed stat with a cap-tier engine fitted (what its gearbox is built around). */
const fullTopCache = new Map<CarId, number>();
export function fullTop(car: CarId): number {
  let v = fullTopCache.get(car);
  if (v === undefined) {
    const c = carById(car);
    v = c.base.top + TIER_STAT[Math.min(c.cap, TIER_STAT.length - 1)] * STAT_SCALE.top;
    fullTopCache.set(car, v);
  }
  return v;
}

/** Shift tuning (race workstream). */
export const SHIFT = {
  /** Extra torque-cut seconds by grade, on top of the car's clean shift time. */
  cutExtra: { clean: 0, early: 0.16, late: 0.18, missed: 0.13, assist: 0 } as Record<ShiftGrade, number>,
  /** Seconds on the limiter (no pull, needle red) before the box shifts itself: the forgiving fallback, slow on purpose. */
  autoDelay: 0.43,
  /** `ordinary` shifting: this long on the limiter, then a late shift. */
  ordinaryDelay: 0.09,
  /** Taps below this fraction of the redline are ignored (too early to mean a shift). */
  minTap: 0.45,
  /** No second shift within this many seconds. */
  debounce: 0.25,
  /** After an automatic downshift the cue stays off this long (the "↓3" notice shows), then the new gear's attempt. */
  settleS: 0.25,
  /** Practice race: the green band opens this much lower. */
  practiceWiden: 0.08,
  /** Auto downshift (rev-matched, free): only while actually braking for a bend, once the revs fall below this... */
  downshiftBelow: 0.6,
  /** ...and only when the lower gear lands at least this far below its green window (so the window opens in full,
   *  and the next upshift is a real one, never an instant green). */
  downLand: 0.02,
  /** No automatic downshift within this long of any gear change (no flicker, never a quick double)... */
  downGapS: 0.5,
  /** ...and at most this many in one braking zone (each one flashed on the HUD). */
  downPerZone: 2,
  /** A braking zone ends after this long without braking. */
  zoneGapS: 0.3,
  /** A green window that braking catches stays green (and a tap clean) this long. */
  brakeGraceS: 0.4,
  /** The judged window reaches this share of the way from the band top to the limiter. */
  topLift: 0.5,
  /** Seconds the green window stays open when the car sets none (drivetrain `windowS`). */
  windowS: 0.45,
  /** The window never opens below this fraction of the redline. */
  floorLo: 0.55,
};

/** Engine pull at a fraction of the redline: lugs low, full in the power band, nothing on the limiter. */
export function torqueAt(f: number, bandTop = 0.95): number {
  if (f >= 1) return 0;
  if (f > bandTop) return 1 - (0.4 * (f - bandTop)) / (1 - bandTop); // past peak power: the pull fades toward the limiter
  if (f >= 0.55) return 1;
  if (f >= 0.25) return 0.72 + (0.28 * (f - 0.25)) / 0.3;
  return 0.72;
}

export class RaceSim {
  readonly track: Track;
  readonly length: number;
  readonly racers: Racer[];
  readonly windows: NitroWindow[];
  readonly practice: boolean;
  t = 0;
  steps = 0;
  charges: number;
  nitroUsed = 0;
  perfects = 0;
  usedWindows = new Set<number>();
  done = false;
  cutoff = false;
  /** Player's upshifts in order. */
  shiftLog: ShiftRecord[] = [];
  /** Step indices of the player's nitro taps (replayed by the counterfactual runs). */
  nitroTaps: number[] = [];
  private pendingCost = 0;
  private lastShiftT = -1;
  /** Sim time of the player's last braking downshift. */
  private lastDownT = -1;
  private attemptSeq = 0;
  /** The current shift attempt (see ShiftAttempt). */
  attempt: ShiftAttempt = { id: 0, gear: 0, band: [0, 0], f: 0, cue: 'off', graceUntil: -1, boost: false };
  /** The player's most recent automatic downshift (for the HUD notice); a new object each time. */
  lastDown: DownshiftRecord | null = null;
  /** Automatic downshifts of the player's this race (gear changes the player did not tap for). */
  autoDowns = 0;
  private nitroStart: number;

  constructor(readonly setup: RaceSetup) {
    const ev = eventById(setup.eventId);
    this.track = TRACKS[ev.track];
    this.length = trackLength(this.track);
    this.windows = nitroWindows(this.track, setup.windowScale ?? 1);
    this.charges = setup.nitroCharges;
    this.nitroStart = setup.nitroCharges;
    this.practice = setup.practice ?? (setup.windowScale ?? 1) > 1;
    this.perfectMul = setup.player.perfectMul ?? RACE.perfectMul;
    const rng = makeRng(setup.seed);
    const mk = (id: string, name: string, car: CarId, paint: string, stats: RacerStats, isPlayer: boolean, policy: ShiftPolicy): Racer => ({
      id, name, car, paint, isPlayer, stats, x: 0, v: 0, finishTime: null, nitroLeft: 0, nitroMul: 1, splits: [], gear: 0, cut: 0, limiterT: 0, policy, peak: 0, braking: false,
      gearT: -9, brakeT: -9, zoneDown: 0,
    });
    this.racers = [mk('player', setup.player.name, setup.player.car, setup.player.paint, { ...setup.player.stats }, true, setup.shift ?? 'ordinary')];
    for (const rid of ev.rivals) {
      const r = RIVALS[rid];
      const vary = () => 1 + (rng() * 2 - 1) * RACE.rivalVariance;
      this.racers.push(mk(r.id, r.name, r.car, r.paint, { top: r.stats.top * vary(), accel: r.stats.accel * vary(), grip: r.stats.grip * vary() }, false, setup.rivalShift ?? 'ordinary'));
    }
    // A no-nitro twin of the player: it never boosts, so each boost's real gain can be measured. It shifts clean.
    this.ghost = mk('ghost', 'ghost', setup.player.car, '#000000', { ...setup.player.stats }, false, 'clean');
    this.refreshAttempt();
  }

  ghost!: Racer;
  perfectMul: number;
  trapSpeed: number | null = null;
  /** Seconds gained by the most recent boost, measured against the no-nitro ghost (set when it ends). */
  lastBoostGain: { seconds: number; perfect: boolean } | null = null;
  /** The player's most recent shift (for the HUD); a new object each time. */
  lastShift: ShiftRecord | null = null;
  private boostStart: { gap: number; perfect: boolean } | null = null;

  /** Independent copy (for finishing the race off-screen while the visible one keeps running). */
  clone(): RaceSim {
    const c = Object.create(RaceSim.prototype) as RaceSim;
    Object.assign(c, this);
    const cp = (r: Racer): Racer => ({ ...r, stats: { ...r.stats }, splits: [...r.splits] });
    (c as unknown as { racers: Racer[] }).racers = this.racers.map(cp);
    (c as unknown as { ghost: Racer }).ghost = cp(this.ghost);
    c.usedWindows = new Set(this.usedWindows);
    c.shiftLog = this.shiftLog.map((s) => ({ ...s }));
    c.nitroTaps = [...this.nitroTaps];
    c.attempt = { ...this.attempt, band: [...this.attempt.band] as [number, number] };
    c.lastDown = this.lastDown ? { ...this.lastDown } : null;
    return c;
  }

  get player() { return this.racers[0]; }

  /** The player's drivetrain. */
  get drivetrain(): Drivetrain { return drivetrainFor(this.player.car); }

  /** Calibrated physical top speed of a racer (m/s, before highway and nitro). */
  vTop(r: Racer) { return r.stats.top * drivetrainFor(r.car).topScale; }

  /** Speed (m/s) the gearing is cut for: the car's full-build top speed (or this racer's, if higher), so an engine
   *  upgrade adds pull without stretching the gears. */
  gearTop(r: Racer) { return drivetrainFor(r.car).topScale * Math.max(r.stats.top, fullTop(r.car)); }

  /** Engine speed as a fraction of the redline (clutch slip holds it up off the line). */
  rpmFrac(r: Racer): number {
    const d = drivetrainFor(r.car);
    const f = r.v / (this.gearTop(r) * d.gears[r.gear]);
    return Math.max(r.gear === 0 ? 0.62 : 0.2, f);
  }

  /** Engine rpm for the tach and the sound. */
  rpm(r: Racer = this.player): number {
    const d = drivetrainFor(r.car);
    return Math.round(Math.max(d.idle, Math.min(1.02, this.rpmFrac(r)) * d.redline));
  }

  /** The green band, widened in the practice race. */
  band(r: Racer = this.player): [number, number] {
    const b = drivetrainFor(r.car).band;
    return this.practice && r.isPlayer ? [b[0] - SHIFT.practiceWiden, b[1]] : b;
  }

  /** Acceleration (m/s²) the engine could give at speed v with full pull (an upper bound: the window is measured
   *  against the fastest the needle can climb here, so it is never shorter than promised). */
  private maxAccel(r: Racer, v: number): number {
    const d = drivetrainFor(r.car);
    const st = r.stats;
    let top = this.vTop(r) * RACE.highwayTopMul;
    let accel = st.accel * d.accelScale;
    // boosting, or a fresh boost zone close enough that a Perfect boost could fire inside this window
    const mul = r.nitroLeft > 0 ? r.nitroMul : r.isPlayer && this.boostLikely() ? this.perfectMul : 0;
    if (mul > 0) { accel += RACE.nitroAccel * mul; top *= 1 + RACE.nitroTopMul * mul; }
    const normal = accel * Math.max(0, 1 - (v / top) ** (d.pullExp ?? 2));
    if (segmentAt(this.track, r.x).seg.type !== 'launch') return normal;
    const raw = accel * RACE.launchTurboMul;
    const traction = st.grip * RACE.tractionG * d.accelScale;
    return Math.max(normal, (raw > traction ? traction + (raw - traction) * RACE.wheelspinKeep : raw) * Math.max(0, 1 - (v / top) ** 4));
  }

  /** The player's green window for an upshift out of the current gear: from the band's low edge (or lower, when the
   *  needle climbs fast in this gear) to just short of the limiter, so it stays open at least the car's windowS. */
  shiftWindow(r: Racer = this.player, gear = r.gear): [number, number] {
    const d = drivetrainFor(r.car);
    const b = this.band(r);
    const hi = b[1] + (1 - b[1]) * SHIFT.topLift;
    const T = d.windowS ?? SHIFT.windowS;
    const vr = this.gearTop(r) * d.gears[gear];
    const rate = (fr: number) => this.maxAccel(r, fr * vr) / vr; // needle speed, fractions of the redline per second
    let lo = hi;
    for (let k = 0; k < 4; k++) lo = hi - T * Math.max(rate(lo), rate(hi));
    return [Math.max(SHIFT.floorLo, Math.min(b[0], lo)), hi];
  }

  topGear(r: Racer = this.player) { return r.gear >= drivetrainFor(r.car).gears.length - 1; }

  /** Upcoming or current nitro window relative to the player. */
  windowState(): { active: NitroWindow | null; next: NitroWindow | null } {
    const x = this.player.x;
    let active: NitroWindow | null = null;
    let next: NitroWindow | null = null;
    for (const w of this.windows) {
      if (x >= w.start && x <= w.end) active = w;
      else if (x < w.start && !next) next = w;
    }
    return { active, next };
  }

  /** The player could fire nitro within the next ~1.5 s: a charge left, and a fresh boost zone here or about to start. */
  private boostLikely(): boolean {
    const p = this.player;
    if (this.charges <= 0 || p.nitroLeft > 0) return false;
    const { active, next } = this.windowState();
    if (active && !this.usedWindows.has(active.segIndex)) return true;
    return !!next && !this.usedWindows.has(next.segIndex) && (next.start - p.x) / Math.max(1, p.v) < 1.5;
  }

  /** Practice race: a fresh boost zone is here or under ~1.4 s away, so shift cues stay out of its way. */
  boostZoneNear(): boolean {
    if (!this.practice || this.charges <= 0) return false;
    const p = this.player;
    const { active, next } = this.windowState();
    if (active && !this.usedWindows.has(active.segIndex)) return true;
    return !!next && !this.usedWindows.has(next.segIndex) && p.v > 1 && (next.start - p.x) / p.v < 1.4;
  }

  /** Shift light state for the HUD: off, approaching the band, in the green, or past it (from the shift attempt). */
  shiftCue(): 'off' | 'soon' | 'green' | 'late' {
    const c = this.attempt.cue;
    return c === 'hold' ? 'off' : c;
  }

  /** Recompute the shift attempt from the player's state after a step. The window is only (re)read when a new attempt
   *  opens; within one attempt only the engine speed and the cue move. */
  private refreshAttempt() {
    const p = this.player;
    const a = this.attempt;
    const f = this.rpmFrac(p);
    const settling = this.lastDownT >= 0 && this.t - this.lastDownT < SHIFT.settleS;
    const live = !this.topGear(p) && p.finishTime === null;
    // braking that catches a green leaves it green (and clean to tap) for a short grace — the full grace even if the
    // braking ends first — and for as long after as the revs stay inside the window; then it holds
    if (p.braking && a.cue === 'green' && a.graceUntil < 0 && p.gear === a.gear) a.graceUntil = this.t + SHIFT.brakeGraceS;
    if (!p.braking && a.graceUntil >= 0 && this.t > a.graceUntil) a.graceUntil = -1;
    const grace = live && a.graceUntil >= 0 && p.gear === a.gear && p.cut <= 0 && f >= SHIFT.minTap
      && (this.t <= a.graceUntil || (f >= a.band[0] && f <= a.band[1]));
    const hold = live && !grace && (p.braking || settling);
    // (a boost zone coming up before the window opened: measure it again for the faster needle)
    const remeasure = (a.cue === 'off' || a.cue === 'soon') && !hold && a.boost !== this.boostLikely();
    if (p.gear !== a.gear || (a.cue === 'hold' && !hold) || a.id === 0 || remeasure) this.openAttempt();
    a.f = f;
    const [lo, hi] = a.band;
    if (grace) a.cue = 'green';
    else if (hold) a.cue = 'hold';
    else if (this.topGear(p) || p.cut > 0 || p.finishTime !== null || p.v < 2 || this.boostZoneNear()) a.cue = 'off';
    else a.cue = f > hi ? 'late' : f >= lo ? 'green' : f >= lo - 0.12 ? 'soon' : 'off';
  }

  private openAttempt() {
    const a = this.attempt;
    this.attemptSeq++;
    a.id = this.attemptSeq;
    a.gear = this.player.gear;
    a.band = this.shiftWindow(this.player);
    a.graceUntil = -1;
    a.boost = this.boostLikely();
  }

  tapNitro(): 'perfect' | 'boost' | 'empty' | 'busy' {
    const p = this.player;
    if (this.done || p.finishTime !== null) return 'busy';
    if (this.charges <= 0) return 'empty';
    if (p.nitroLeft > 0) return 'busy';
    this.charges--;
    this.nitroUsed++;
    this.nitroTaps.push(this.steps);
    const { active } = this.windowState();
    const perfect = !!active && !this.usedWindows.has(active.segIndex);
    if (active) this.usedWindows.add(active.segIndex);
    p.nitroLeft = RACE.nitroDurationS;
    p.nitroMul = perfect ? this.perfectMul : 1;
    if (perfect) this.perfects++;
    // the needle will climb faster: a window that has not opened yet is measured again (a new attempt)
    if (this.attempt.cue === 'off' || this.attempt.cue === 'soon') { this.openAttempt(); this.refreshAttempt(); }
    this.boostStart = { gap: p.x - this.ghost.x, perfect };
    this.lastBoostGain = null;
    return perfect ? 'perfect' : 'boost';
  }

  /** The player's SHIFT input, judged on the current shift attempt: exactly the window and engine speed the HUD shows.
   *  Ignored when it cannot mean a shift (top gear, mid-shift, revs far too low, braking for a bend, or a second tap
   *  on an attempt that already shifted). */
  tapShift(): ShiftGrade | 'top' | 'busy' | 'wait' | 'hold' {
    const p = this.player;
    const a = this.attempt;
    if (this.done || p.finishTime !== null || p.cut > 0 || p.v < 1 || this.t - this.lastShiftT < SHIFT.debounce) return 'busy';
    if (this.topGear(p)) return 'top';
    if (a.cue === 'hold') return 'hold';
    const f = a.f;
    if (f < SHIFT.minTap) return 'wait';
    const [lo, hi] = a.band;
    // the green the player sees is clean to tap (including a green caught by braking, inside its grace)
    const grade: ShiftGrade = a.cue === 'green' || (f >= lo && f <= hi) ? 'clean' : f < lo ? 'early' : 'late';
    this.upshift(p, grade);
    return grade;
  }

  private upshift(r: Racer, grade: ShiftGrade) {
    const d = drivetrainFor(r.car);
    const f = this.rpmFrac(r);
    r.gear = Math.min(d.gears.length - 1, r.gear + 1);
    r.cut = d.shiftS + SHIFT.cutExtra[grade];
    r.limiterT = 0;
    r.gearT = this.t;
    if (!r.isPlayer) return;
    this.lastShiftT = this.t;
    const rec: ShiftRecord = { t: this.t, into: r.gear, grade, rpm: f, cost: this.pendingCost + r.cut - d.shiftS };
    this.pendingCost = 0;
    this.shiftLog.push(rec);
    this.lastShift = rec;
  }

  /** Automatic shifting for bots, tests, Quick Race, and the fallback when a live player misses the shift. */
  private autoShift(r: Racer) {
    if (r.cut > 0 || this.topGear(r)) return;
    const d = drivetrainFor(r.car);
    const f = this.rpmFrac(r);
    // braking hard for a bend dragged the revs down: the box blips down one gear for free. Only while actually braking
    // (never accelerating, cruising a bend or boosting), at most downPerZone per braking zone, never within downGapS of
    // another gear change, and only when the lower gear lands below its green window, so the next upshift gets its
    // whole window (the HUD flashes each one).
    if (r.gear > 0 && r.braking && r.zoneDown < SHIFT.downPerZone && r.nitroLeft <= 0 && f < SHIFT.downshiftBelow && this.t - r.gearT >= SHIFT.downGapS
      && r.v / (this.gearTop(r) * d.gears[r.gear - 1]) <= this.shiftWindow(r, r.gear - 1)[0] - SHIFT.downLand) {
      r.gear--;
      r.gearT = this.t;
      r.zoneDown++;
      if (r.isPlayer) { this.lastDownT = this.t; this.autoDowns++; this.lastDown = { t: this.t, from: r.gear + 1, into: r.gear }; }
      return;
    }
    const [lo, hi] = this.band(r);
    // (never while braking: an upshift there would only be blipped straight back down)
    if (r.isPlayer && this.practice && r.policy === 'manual' && !r.braking && this.boostZoneNear() && f >= (lo + hi) / 2) return this.upshift(r, 'assist');
    switch (r.policy) {
      case 'clean': if (f >= lo + (hi - lo) * 0.8) this.upshift(r, 'clean'); break;
      case 'early': if (f >= lo - 0.1) this.upshift(r, 'early'); break;
      case 'ordinary': if (r.limiterT >= SHIFT.ordinaryDelay) this.upshift(r, 'late'); break;
      default: if (r.limiterT >= SHIFT.autoDelay) this.upshift(r, 'missed');
    }
  }

  private stepRacer(r: Racer, dt: number) {
    if (r.finishTime !== null) {
      r.x += r.v * dt; // coast past the line for rendering
      r.v = Math.max(0, r.v - 6 * dt);
      return;
    }
    this.autoShift(r);
    const { seg, index, start } = segmentAt(this.track, r.x);
    const st = r.stats;
    const d = drivetrainFor(r.car);
    let top = this.vTop(r) * (seg.type === 'highway' || seg.type === 'hwbend' ? RACE.highwayTopMul : 1);
    const engine = st.accel * d.accelScale;
    let accel = engine;
    if (r.nitroLeft > 0) {
      accel += RACE.nitroAccel * r.nitroMul;
      top *= 1 + RACE.nitroTopMul * r.nitroMul;
      r.nitroLeft = Math.max(0, r.nitroLeft - dt);
    }
    let a: number;
    if (seg.type === 'launch') {
      const raw = accel * RACE.launchTurboMul;
      const traction = st.grip * RACE.tractionG * d.accelScale; // the calibration scales the whole launch, so grip still matters off the line
      a = raw > traction ? traction + (raw - traction) * RACE.wheelspinKeep : raw;
    } else a = accel;
    a *= Math.max(0, 1 - (r.v / top) ** (seg.type === 'launch' ? 4 : d.pullExp ?? 2)); // launch is traction- and turbo-bound
    // the gearbox: no engine pull while the clutch is in, lugging below the power band, nothing on the limiter
    // (nitro thrust keeps pushing through a shift, so a boost is never wasted by one)
    const share = engine / accel;
    const f = this.rpmFrac(r);
    let pull: number;
    if (r.cut > 0) { pull = 0; r.cut = Math.max(0, r.cut - dt); }
    else pull = torqueAt(f, d.band[1]);
    if (f >= 0.999 && !this.topGear(r)) r.limiterT += dt;
    else r.limiterT = 0;
    if (r.isPlayer && pull < 1 && a > 0) {
      // seconds of lost pull, charged to the shift that caused it (limiter time goes to the shift that ends it)
      const lost = (1 - pull) * share * dt;
      if (r.limiterT > 0) this.pendingCost += lost;
      else if (r.cut <= 0 && this.shiftLog.length) this.shiftLog[this.shiftLog.length - 1].cost += lost;
    }
    a *= share * pull + (1 - share);
    const brake = st.grip * 9.81 * 0.9;
    let cap = Infinity;
    if (seg.radius) cap = bendCap(st.grip, seg.radius);
    // look ahead to the next bend
    const nextSeg = this.track.segments[index + 1];
    if (nextSeg?.radius) {
      const dd = start + seg.length - r.x;
      const vc = bendCap(st.grip, nextSeg.radius);
      cap = Math.min(cap, Math.sqrt(vc * vc + 2 * brake * Math.max(0, dd)));
    }
    r.braking = r.v > cap + 1e-9; // slowing for a bend (cruising at a bend's limit is not braking)
    if (r.braking) r.brakeT = this.t;
    else if (r.zoneDown && this.t - r.brakeT > SHIFT.zoneGapS) r.zoneDown = 0;
    if (r.v > cap) r.v = Math.max(cap, r.v - brake * dt);
    else r.v = Math.min(cap, r.v + a * dt);
    const prevX = r.x;
    r.x += r.v * dt;
    // splits
    let edge = 0;
    for (let i = 0; i < this.track.segments.length; i++) {
      edge += this.track.segments[i].length;
      if (prevX < edge && r.x >= edge && r.splits.length === i) {
        const frac = r.v > 0 ? (edge - prevX) / (r.x - prevX) : 1;
        r.splits.push(this.t + dt * frac);
      }
    }
    if (r.x >= this.length) {
      const frac = (this.length - prevX) / Math.max(1e-9, r.x - prevX);
      r.finishTime = this.t + dt * frac;
    } else r.peak = Math.max(r.peak, r.v);
  }

  step(dt = RACE.dt) {
    if (this.done) return;
    const boosting = this.player.nitroLeft > 0;
    for (const r of this.racers) this.stepRacer(r, dt);
    if (this.ghost.finishTime === null) this.stepRacer(this.ghost, dt);
    if (this.trapSpeed === null && this.player.x >= this.length - 4) this.trapSpeed = this.player.v;
    if (boosting && this.player.nitroLeft <= 0 && this.boostStart) {
      const p = this.player;
      const metres = p.x - this.ghost.x - this.boostStart.gap;
      this.lastBoostGain = { seconds: p.v > 1 ? metres / p.v : 0, perfect: this.boostStart.perfect };
      this.boostStart = null;
    }
    this.t += dt;
    this.steps++;
    this.refreshAttempt();
    if (this.racers.every((r) => r.finishTime !== null)) this.done = true;
    else if (this.t >= RACE.safetyCutoffS) {
      this.done = true;
      this.cutoff = true;
    }
  }

  /** Fast-forward to completion (player already finished, or quick race). */
  finish(): RaceOutcome {
    while (!this.done) this.step();
    return this.outcome();
  }

  standings(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.x - a.x;
    });
  }

  outcome(): RaceOutcome {
    const st = this.standings();
    const p = this.player;
    const place = st.indexOf(p) + 1;
    let gapText = '';
    if (st.length === 1) {
      gapText = p.finishTime !== null ? `${p.finishTime.toFixed(2)} s` : '';
    } else if (place === 1) {
      const second = st[1];
      if (p.finishTime !== null && second.finishTime !== null) gapText = `${(second.finishTime - p.finishTime).toFixed(second.finishTime - p.finishTime < 0.1 ? 2 : 1)} s ahead of ${second.name}`;
      else gapText = `${Math.round(p.x - second.x)} m ahead of ${second.name}`;
    } else {
      const first = st[0];
      if (p.finishTime !== null && first.finishTime !== null) gapText = `${(p.finishTime - first.finishTime).toFixed(p.finishTime - first.finishTime < 0.1 ? 2 : 1)} s behind first`;
      else gapText = `${Math.round(first.x - p.x)} m behind first`;
    }
    const counted = this.shiftLog.filter((s) => s.grade !== 'assist');
    const advice = place === 1 ? null : this.advice(st[place - 2]);
    const out: RaceOutcome = {
      place, standings: st, playerTime: p.finishTime, gapText, perfects: this.perfects, nitroUsed: this.nitroUsed, nitroLeft: this.charges, trapSpeed: this.trapSpeed,
      cutoff: this.cutoff, advice,
      shifts: counted.length, shiftsClean: counted.filter((s) => s.grade === 'clean').length, shiftLog: this.shiftLog.map((s) => ({ ...s })),
      topSpeed: p.peak, shiftLoss: null, boostLoss: null, coach: null,
    };
    if (this.setup.analysis !== false && p.finishTime !== null) this.analyse(out, place > 1 ? st[place - 2] : null);
    return out;
  }

  /** Re-run the same race (same seed, rivals and build) with clean shifts, then also with Perfect boosts. */
  private counterfactual(nitro: 'replay' | 'perfect'): number | null {
    const sim = new RaceSim({ ...this.setup, shift: 'clean', analysis: false });
    let k = 0;
    while (!sim.done && sim.player.finishTime === null) {
      if (nitro === 'replay') { while (k < this.nitroTaps.length && this.nitroTaps[k] <= sim.steps) { sim.tapNitro(); k++; } }
      else if (sim.charges > 0 && sim.player.nitroLeft <= 0) {
        const { active } = sim.windowState();
        if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
      }
      sim.step();
    }
    return sim.player.finishTime;
  }

  private analyse(out: RaceOutcome, ahead: Racer | null) {
    const pt = out.playerTime!;
    const tClean = this.counterfactual('replay');
    const tBest = this.nitroStart > 0 ? this.counterfactual('perfect') : tClean;
    out.shiftLoss = tClean === null ? null : Math.max(0, pt - tClean);
    out.boostLoss = tClean === null || tBest === null ? null : Math.max(0, tClean - tBest);
    // spread the measured shift loss over the shifts in proportion to their extra cost, to name the worst one
    const log = out.shiftLog ?? [];
    const extra = log.filter((s) => s.grade !== 'assist').map((s) => Math.max(0, s.cost));
    const sum = extra.reduce((a, b) => a + b, 0);
    let worst: ShiftRecord | null = null;
    log.forEach((s) => { if (s.grade !== 'assist' && (!worst || s.cost > worst.cost)) worst = s; });
    if (sum > 0 && out.shiftLoss !== null) for (const s of log) s.cost = s.grade === 'assist' ? 0 : (Math.max(0, s.cost) / sum) * out.shiftLoss;
    out.coach = coachFor(out, ahead && ahead.finishTime !== null ? pt - ahead.finishTime : null, worst);
  }

  /** Where did the player lose the most time to the racer directly ahead? */
  private advice(ahead: Racer): RaceOutcome['advice'] {
    const p = this.player;
    let best: RaceOutcome['advice'] = null;
    let prevP = 0;
    let prevA = 0;
    this.track.segments.forEach((seg, i) => {
      const tp = p.splits[i];
      const ta = ahead.splits[i];
      if (tp === undefined || ta === undefined) return;
      const lost = (tp - prevP) - (ta - prevA);
      prevP = tp;
      prevA = ta;
      const family = seg.type === 'launch' ? 'turbo' : seg.radius ? 'tires' : 'engine';
      const label = seg.type === 'launch' ? 'launch' : seg.radius ? 'bend' : seg.type === 'highway' ? 'highway' : 'straight';
      if (!best || lost > best.lost) best = { family, segment: label, lost };
    });
    return best;
  }
}

const GEAR_NAME = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const PART_NAME = { engine: 'Engine', tires: 'Tires', turbo: 'Turbo' } as const;

/** One actionable reason: the biggest of shifting, boost timing, or the build (when skill would not have closed it). */
export function coachFor(o: RaceOutcome, behind: number | null, worst: ShiftRecord | null): Coach | null {
  const shift = o.shiftLoss ?? 0;
  const boost = o.boostLoss ?? 0;
  const shiftText = () => {
    const w = worst as ShiftRecord | null;
    const gear = w ? GEAR_NAME[w.into] ?? `gear ${w.into + 1}` : '';
    const how = !w ? '' : w.grade === 'missed' ? `you missed the shift into ${gear} and the box shifted on the limiter` : w.grade === 'early' ? `the shift into ${gear} came early and bogged` : w.grade === 'late' ? `the shift into ${gear} came late, on the limiter` : '';
    return `Shifting cost ${shift.toFixed(1)} s${how ? ` — ${how}` : ''}. Tap SHIFT when the light turns green.`;
  };
  const boostText = () => o.perfects === 0 && o.nitroUsed === 0 ? `Unused nitro cost ${boost.toFixed(1)} s. Fire it inside a boost zone for a Perfect boost.`
    : `Boost timing cost ${boost.toFixed(1)} s. Fire nitro inside the boost zone, once per zone, for a Perfect boost.`;
  const buildText = () => o.advice ? `Lost most time on the ${o.advice.segment}: a better ${PART_NAME[o.advice.family]} part helps there.` : 'A stronger build closes this gap.';
  if (o.place === 1) {
    // a win: point at the bigger skill gain if there is a real one
    if (shift >= 0.2 && shift >= boost) return { kind: 'shift', text: shiftText(), lost: shift };
    if (boost >= 0.2) return { kind: 'boost', text: boostText(), lost: boost };
    return null;
  }
  const skill = shift + boost;
  // when clean shifts and Perfect boosts together would not have caught the car ahead, the build is the reason
  if (behind !== null && skill < behind * 0.6 && o.advice) return { kind: 'build', text: buildText(), lost: o.advice.lost };
  if (shift >= 0.12 && shift >= boost) return { kind: 'shift', text: shiftText(), lost: shift };
  if (boost >= 0.12) return { kind: 'boost', text: boostText(), lost: boost };
  return o.advice ? { kind: 'build', text: buildText(), lost: o.advice.lost } : null;
}

/** The speedometer reading for a racer: simulated velocity converted once to mph (the HUD shows exactly this). */
export const speedMph = (r: Racer) => mph(r.v);

/** Quick Race / tests: run with an optional nitro policy and shift policy. */
export type NitroPolicy = 'none' | 'perfect' | 'early' | 'late';
export function runRace(setup: RaceSetup, policy: NitroPolicy = 'none', shift?: ShiftPolicy): RaceOutcome {
  const sim = new RaceSim(shift ? { ...setup, shift } : setup);
  while (!sim.done) {
    if (policy !== 'none' && sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
      const { active } = sim.windowState();
      if (policy === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
      if (policy === 'early' && !active && sim.t > 0.3) sim.tapNitro();
      if (policy === 'late' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
    }
    sim.step();
  }
  return sim.outcome();
}

export function leanOutcome(o: RaceOutcome): LeanOutcome {
  return {
    place: o.place, playerTime: o.playerTime, gapText: o.gapText, perfects: o.perfects, nitroUsed: o.nitroUsed, nitroLeft: o.nitroLeft, trapSpeed: o.trapSpeed ?? undefined,
    shifts: o.shifts, shiftsClean: o.shiftsClean, topSpeed: o.topSpeed, coach: o.coach ?? null,
    standings: o.standings.map((r) => ({ name: r.name, time: r.finishTime, isPlayer: r.isPlayer })), advice: o.advice,
  };
}
