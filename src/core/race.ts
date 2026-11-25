import { RACE, RIVALS, Segment, Track, TRACKS, eventById, trackLength, CarId } from '../data/tables';
import { makeRng } from './rng';
import type { LeanOutcome } from './state';

export interface RacerStats { top: number; accel: number; grip: number }

export interface RaceSetup {
  eventId: string;
  seed: number;
  player: { name: string; car: CarId; stats: RacerStats; paint: string };
  nitroCharges: number;
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
}

export interface RaceOutcome {
  place: number; // 1..4
  standings: Racer[];
  playerTime: number | null;
  gapText: string;
  perfects: number;
  nitroUsed: number;
  cutoff: boolean;
  advice: { family: 'engine' | 'tires' | 'turbo'; segment: string; lost: number } | null;
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

export function nitroWindows(track: Track): NitroWindow[] {
  const out: NitroWindow[] = [];
  let start = 0;
  track.segments.forEach((s, i) => {
    if (s.window) out.push({ start: start + s.length * s.window[0], end: start + s.length * s.window[1], segIndex: i });
    start += s.length;
  });
  return out;
}

const bendCap = (grip: number, radius: number) => Math.sqrt(grip * 9.81 * radius);

export class RaceSim {
  readonly track: Track;
  readonly length: number;
  readonly racers: Racer[];
  readonly windows: NitroWindow[];
  t = 0;
  charges: number;
  nitroUsed = 0;
  perfects = 0;
  usedWindows = new Set<number>();
  done = false;
  cutoff = false;

  constructor(setup: RaceSetup) {
    const ev = eventById(setup.eventId);
    this.track = TRACKS[ev.track];
    this.length = trackLength(this.track);
    this.windows = nitroWindows(this.track);
    this.charges = setup.nitroCharges;
    const rng = makeRng(setup.seed);
    const mk = (id: string, name: string, car: CarId, paint: string, stats: RacerStats, isPlayer: boolean): Racer => ({
      id, name, car, paint, isPlayer, stats, x: 0, v: 0, finishTime: null, nitroLeft: 0, nitroMul: 1, splits: [],
    });
    this.racers = [mk('player', setup.player.name, setup.player.car, setup.player.paint, { ...setup.player.stats }, true)];
    for (const rid of ev.rivals) {
      const r = RIVALS[rid];
      const vary = () => 1 + (rng() * 2 - 1) * RACE.rivalVariance;
      this.racers.push(mk(r.id, r.name, r.car, r.paint, { top: r.stats.top * vary(), accel: r.stats.accel * vary(), grip: r.stats.grip * vary() }, false));
    }
  }

  get player() { return this.racers[0]; }

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

  tapNitro(): 'perfect' | 'boost' | 'empty' | 'busy' {
    const p = this.player;
    if (this.done || p.finishTime !== null) return 'busy';
    if (this.charges <= 0) return 'empty';
    if (p.nitroLeft > 0) return 'busy';
    this.charges--;
    this.nitroUsed++;
    const { active } = this.windowState();
    const perfect = !!active && !this.usedWindows.has(active.segIndex);
    if (active) this.usedWindows.add(active.segIndex);
    p.nitroLeft = RACE.nitroDurationS;
    p.nitroMul = perfect ? RACE.perfectMul : 1;
    if (perfect) this.perfects++;
    return perfect ? 'perfect' : 'boost';
  }

  private stepRacer(r: Racer, dt: number) {
    if (r.finishTime !== null) {
      r.x += r.v * dt; // coast past the line for rendering
      r.v = Math.max(0, r.v - 6 * dt);
      return;
    }
    const { seg, index, start } = segmentAt(this.track, r.x);
    const st = r.stats;
    let top = st.top * (seg.type === 'highway' || seg.type === 'hwbend' ? RACE.highwayTopMul : 1);
    let accel = st.accel;
    if (r.nitroLeft > 0) {
      accel += RACE.nitroAccel * r.nitroMul;
      top *= 1 + RACE.nitroTopMul * r.nitroMul;
      r.nitroLeft = Math.max(0, r.nitroLeft - dt);
    }
    let a: number;
    if (seg.type === 'launch') {
      const raw = accel * RACE.launchTurboMul;
      const traction = st.grip * RACE.tractionG;
      a = raw > traction ? traction + (raw - traction) * RACE.wheelspinKeep : raw;
    } else a = accel;
    a *= Math.max(0, 1 - (r.v / top) ** (seg.type === 'launch' ? 4 : 2)); // launch is traction- and turbo-bound
    const brake = st.grip * 9.81 * 0.9;
    let cap = Infinity;
    if (seg.radius) cap = bendCap(st.grip, seg.radius);
    // look ahead to the next bend
    const nextSeg = this.track.segments[index + 1];
    if (nextSeg?.radius) {
      const d = start + seg.length - r.x;
      const vc = bendCap(st.grip, nextSeg.radius);
      cap = Math.min(cap, Math.sqrt(vc * vc + 2 * brake * Math.max(0, d)));
    }
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
    }
  }

  step(dt = RACE.dt) {
    if (this.done) return;
    for (const r of this.racers) this.stepRacer(r, dt);
    this.t += dt;
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
    if (place === 1) {
      const second = st[1];
      if (p.finishTime !== null && second.finishTime !== null) gapText = `${(second.finishTime - p.finishTime).toFixed(1)} s ahead of ${second.name}`;
      else gapText = `${Math.round(p.x - second.x)} m ahead of ${second.name}`;
    } else {
      const first = st[0];
      if (p.finishTime !== null && first.finishTime !== null) gapText = `${(p.finishTime - first.finishTime).toFixed(1)} s behind first`;
      else gapText = `${Math.round(first.x - p.x)} m behind first`;
    }
    return {
      place, standings: st, playerTime: p.finishTime, gapText, perfects: this.perfects, nitroUsed: this.nitroUsed,
      cutoff: this.cutoff, advice: place === 1 ? null : this.advice(st[place - 2]),
    };
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

/** Quick Race / tests: run with an optional nitro policy. */
export type NitroPolicy = 'none' | 'perfect' | 'early' | 'late';
export function runRace(setup: RaceSetup, policy: NitroPolicy = 'none'): RaceOutcome {
  const sim = new RaceSim(setup);
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
    place: o.place, playerTime: o.playerTime, gapText: o.gapText, perfects: o.perfects, nitroUsed: o.nitroUsed,
    standings: o.standings.map((r) => ({ name: r.name, time: r.finishTime, isPlayer: r.isPlayer })), advice: o.advice,
  };
}
