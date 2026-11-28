// Rev Up — Test & Compare (race workstream, 1.10 Redline): what an upgrade actually does, measured. The player picks
// a candidate part for a car — one they own, or one they could craft or order (fitted "virtually") — and drives the
// same short course twice, current build then candidate: a fixed slice of a real track, no rivals, the same seed, no
// nitro, no rewards and no charges spent. The two runs are measured the same way (launch split, exit speed at a named
// bend, top speed, finish time, clean shifts) and compared; a headless estimate with the player's usual shifting is
// there for anyone who would rather not drive twice. Pure rules over GameState (no DOM); writing the result back
// (s.testRuns) runs inside Game.transact.
import { ACTIVE_FAMILIES, CARS, CarId, EVENTS, FAMILIES, Family, Segment, TRACKS, Track, carById } from '../data/tables';
import { allParts, orderMaxTier, orderPrice } from './board';
import { loadoutWith } from './loadout';
import { RaceSetup, RaceSim, ShiftPolicy } from './race';
import type { GameState, Part } from './state';
import { mph } from './units';

// ---------------------------------------------------------------- the courses

/** A fixed test course: a slice of a real track (its scenery, signs and bends) ending after a named bend's exit. */
export interface TestCourse {
  id: string;
  name: string;
  /** The real track it is cut from. */
  base: Track['id'];
  /** Segments kept from the start of the track; the last one may be shortened (`lastLength`). */
  take: number;
  lastLength?: number;
  /** Index (within the slice) of the bend whose exit speed is measured, and its name on the card. */
  bend: number;
  bendName: string;
  /** The launch split's distance (m). */
  launchM: number;
}

/** One course per district: every car tests where it races first, so a result is comparable across visits. */
export const TEST_COURSES: Record<string, TestCourse> = {
  scrapyard: { id: 'yard', name: 'Scrapyard test strip', base: 'scrapyard', take: 4, lastLength: 60, bend: 2, bendName: 'Crusher Bend', launchM: 100 },
  suburbs: { id: 'foundry', name: 'Foundry test loop', base: 'foundry', take: 3, lastLength: 110, bend: 1, bendName: 'Furnace Corner', launchM: 100 },
  coastal: { id: 'cliffs', name: 'Cliffside test run', base: 'cliffs', take: 4, lastLength: 70, bend: 3, bendName: 'Gull Hairpin', launchM: 60 },
  downtown: { id: 'downtown', name: 'Downtown test block', base: 'downtown', take: 4, lastLength: 90, bend: 3, bendName: 'Neon Hairpin', launchM: 70 },
  desert: { id: 'dunes', name: 'Dune test track', base: 'dunes', take: 4, lastLength: 120, bend: 2, bendName: 'Mesa Turn', launchM: 100 },
  summit: { id: 'summit', name: 'Summit test run', base: 'summit', take: 4, lastLength: 120, bend: 2, bendName: 'Summit Sweeper', launchM: 100 },
  riviera: { id: 'esplanade', name: 'Esplanade test lap', base: 'esplanade' as Track['id'], take: 4, lastLength: 95, bend: 3, bendName: 'Casino Hairpin', launchM: 70 },
};

/** The fixed seed every test run uses (no rivals, so it only fixes the run's tiny variance). */
export const TEST_SEED = 0x7e57;

export function courseFor(car: CarId): TestCourse {
  const d = carById(car).district as string;
  return TEST_COURSES[d] ?? TEST_COURSES.scrapyard;
}

/** The course's track: the real track's first segments (nitro windows removed — the test isolates the part). */
export function courseTrack(c: TestCourse): Track {
  const base = TRACKS[c.base] ?? TRACKS.scrapyard;
  const segs: Segment[] = base.segments.slice(0, c.take).map((sg) => { const x = { ...sg }; delete x.window; return x; });
  if (c.lastLength && segs.length) segs[segs.length - 1].length = Math.min(segs[segs.length - 1].length, c.lastLength);
  return { ...base, segments: segs, name: c.name };
}

/** An event on the course's real track (it names the scenery; its rivals and purse are never used). */
export function courseEvent(c: TestCourse): string {
  return (EVENTS.find((e) => e.track === c.base && !e.heatOf) ?? EVENTS[0]).id;
}

// ---------------------------------------------------------------- candidates

/** Where a candidate part comes from: owned (on the bench, the spare rack or the shelf), or virtual (to craft or
 *  to order) — a virtual part is fitted for the test only. */
export type CandidateSource = 'bench' | 'shelf' | 'craft' | 'order';
export interface Candidate {
  family: Family;
  tier: number;
  quality: Part['q'];
  source: CandidateSource;
  /** Owned parts: the part's id. */
  partId?: number;
  /** Craft: a pair of the tier below is on the bench; order: the Shop price. */
  pairReady?: boolean;
  price?: number;
  /** Short label: "T4 Tires (on the bench)", "T5 Tires · craft", "T5 Tires · order $1,200". */
  label: string;
}

const qualityRank = (q: Part['q']) => (q === 'mint' ? 2 : q === 'polished' ? 1 : 0);
const famName = (f: Family) => FAMILIES[f].name;

/** Candidate parts for one family of a car: every owned part of that family that differs from the fitted one (best
 *  first), then the next tiers up to the car's cap as virtual fits (craft when a pair of the tier below is on the
 *  bench, order when the Shop sells that tier). */
export function candidatesFor(s: GameState, car: CarId, family: Family): Candidate[] {
  const cap = carById(car).cap;
  const fittedPart = s.installed?.[car]?.[family];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const owned: { p: Part; src: CandidateSource }[] = [
    ...allParts(s).filter((p) => p.f === family).map((p) => ({ p, src: 'bench' as const })),
    ...((s.shelf ?? []).filter((p): p is Part => !!p && p.f === family).map((p) => ({ p, src: 'shelf' as const }))),
  ];
  owned.sort((a, b) => b.p.t - a.p.t || qualityRank(b.p.q) - qualityRank(a.p.q));
  for (const { p, src } of owned) {
    const key = `${Math.min(p.t, cap)}:${p.q}`;
    if (fittedPart && Math.min(fittedPart.t, cap) === Math.min(p.t, cap) && fittedPart.q === p.q) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ family, tier: p.t, quality: p.q, source: src, partId: p.id, label: `T${p.t} ${famName(family)}${p.q !== 'std' ? ` (${p.q === 'mint' ? 'Mint' : 'Polished'})` : ''} · ${src === 'shelf' ? 'on the shelf' : 'on the bench'}` });
  }
  const have = Math.max(fittedPart ? Math.min(fittedPart.t, cap) : 0, ...owned.map((o) => Math.min(o.p.t, cap)));
  const maxOrder = orderMaxTier(s);
  for (let t = Math.max(1, have + 1); t <= cap && t <= have + 2; t++) {
    const pair = allParts(s).filter((p) => p.f === family && p.t === t - 1).length >= 2;
    if (pair) out.push({ family, tier: t, quality: 'std', source: 'craft', pairReady: true, label: `T${t} ${famName(family)} · craft it` });
    else if (t <= maxOrder) { const price = orderPrice(s, t); out.push({ family, tier: t, quality: 'std', source: 'order', price, label: `T${t} ${famName(family)} · order $${price.toLocaleString('en-US')}` }); }
    else out.push({ family, tier: t, quality: 'std', source: 'craft', pairReady: false, label: `T${t} ${famName(family)} · merge two T${t - 1}s` });
  }
  return out;
}

/** The default candidate: the biggest owned improvement over what is fitted, else the next tier to craft or order. */
export function defaultCandidate(s: GameState, car: CarId, family?: Family): Candidate | null {
  const fams = family ? [family] : ACTIVE_FAMILIES;
  let best: { c: Candidate; gain: number } | null = null;
  for (const f of fams) for (const c of candidatesFor(s, car, f)) {
    const gain = statGain(s, car, c);
    const bonus = c.source === 'bench' || c.source === 'shelf' ? 1 : 0; // a part you own (and can fit now) comes first
    if (gain > 0 && (!best || gain + bonus > best.gain)) best = { c, gain: gain + bonus };
  }
  return best?.c ?? null;
}

/** The candidate's part, as it would sit in the car's slot (an owned part as it is; a virtual one as a new part). */
export function candidatePart(s: GameState, c: Candidate): Part {
  const own = c.partId !== undefined ? [...allParts(s), ...(s.shelf ?? [])].find((p) => p?.id === c.partId) : undefined;
  return own ?? { id: -1, f: c.family, t: c.tier, q: c.quality };
}

/** Relative change in the stat the candidate's family drives (0.05 = +5%). */
export function statGain(s: GameState, car: CarId, c: Candidate): number {
  const stat = FAMILIES[c.family].stat as 'top' | 'accel' | 'grip';
  const a = loadoutWith(s, car, {}).stats[stat];
  const b = loadoutWith(s, car, { [c.family]: candidatePart(s, c) }).stats[stat];
  return a > 0 ? b / a - 1 : 0;
}

// ---------------------------------------------------------------- the runs

export type BuildSide = 'current' | 'candidate';

/** The race setup for one test run: the course, no rivals, the fixed seed, no nitro; the candidate build swaps one
 *  part virtually (nothing in the save moves). */
export function testSetup(s: GameState, car: CarId, side: BuildSide, c: Candidate | null, shift: ShiftPolicy = 'manual'): RaceSetup {
  const course = courseFor(car);
  const over = side === 'candidate' && c ? { [c.family]: candidatePart(s, c) } : {};
  const lo = loadoutWith(s, car, over);
  const cls = carById(car);
  return {
    eventId: courseEvent(course), seed: TEST_SEED, track: courseTrack(course), solo: true,
    player: { name: 'You', car, stats: lo.stats, paint: s.paints[car] ?? cls.paint, perfectMul: cls.perfectMul },
    nitroCharges: 0, shift, rivalShift: 'clean', windowScale: 1, practice: false, analysis: false,
  };
}

/** What a test run measured. Times in s, speeds in mph (the one conversion). */
export interface TestMetrics {
  /** Seconds from GO to the launch split (`launchM` metres). */
  launch: number;
  /** mph leaving the named bend. */
  exit: number;
  /** Highest mph before the line. */
  top: number;
  /** Finish time. */
  time: number;
  /** Upshifts in the green, of all upshifts the driver made. */
  clean: number;
  shifts: number;
}

/** Measures a run step by step (the live screen and the headless runs use the same probe). */
export class TestProbe {
  private launch = -1;
  private exit = -1;
  private top = 0;
  private bendEnd: number;
  constructor(readonly course: TestCourse, track: Track) {
    this.bendEnd = track.segments.slice(0, course.bend + 1).reduce((a, sg) => a + sg.length, 0);
  }
  /** Call after every sim step. */
  observe(sim: RaceSim) {
    const p = sim.player;
    if (p.finishTime !== null && this.launch >= 0 && this.exit >= 0) return;
    if (this.launch < 0 && p.x >= this.course.launchM) this.launch = sim.t - (p.x - this.course.launchM) / Math.max(1e-6, p.v);
    if (this.exit < 0 && p.x >= this.bendEnd) this.exit = mph(p.v);
    if (p.finishTime === null) this.top = Math.max(this.top, mph(p.v));
  }
  result(sim: RaceSim): TestMetrics {
    const counted = sim.shiftLog.filter((x) => x.grade !== 'assist');
    return {
      launch: +Math.max(0, this.launch).toFixed(3), exit: Math.max(0, this.exit), top: this.top,
      time: +(sim.player.finishTime ?? sim.t).toFixed(3), clean: counted.filter((x) => x.grade === 'clean').length, shifts: counted.length,
    };
  }
}

/** A headless run of one side with a shifting policy (the estimate, and the "same shifting" check of a live pair). */
export function simulateSide(s: GameState, car: CarId, side: BuildSide, c: Candidate | null, shift: ShiftPolicy): TestMetrics {
  const setup = testSetup(s, car, side, c, shift);
  const sim = new RaceSim(setup);
  const probe = new TestProbe(courseFor(car), sim.track);
  while (!sim.done && sim.player.finishTime === null) { sim.step(); probe.observe(sim); }
  return probe.result(sim);
}

/** The player's usual shifting on this car, from their record (clean share of their live upshifts). */
export function usualShift(s: GameState, car: CarId): { policy: ShiftPolicy; label: string } {
  const m = s.mastery?.[car] ?? Object.values(s.mastery ?? {}).sort((a, b) => (b?.shifts ?? 0) - (a?.shifts ?? 0))[0];
  const rate = m && m.shifts >= 4 ? m.shiftsClean / m.shifts : null;
  if (rate === null) return { policy: 'ordinary', label: 'ordinary shifting (no record yet)' };
  const pct = Math.round(rate * 100);
  if (rate >= 0.8) return { policy: 'clean', label: `your shifting: ${pct}% clean` };
  if (rate >= 0.45) return { policy: 'ordinary', label: `your shifting: ${pct}% clean` };
  return { policy: 'missed', label: `your shifting: ${pct}% clean` };
}

/** Both sides headless with the player's usual shifting. */
export function estimate(s: GameState, car: CarId, c: Candidate): { a: TestMetrics; b: TestMetrics; shift: string } {
  const u = usualShift(s, car);
  return { a: simulateSide(s, car, 'current', null, u.policy), b: simulateSide(s, car, 'candidate', c, u.policy), shift: u.label };
}

// ---------------------------------------------------------------- the comparison

export interface CompareRow { key: keyof TestMetrics | 'cleanShifts'; label: string; a: string; b: string; delta: string; better: boolean | null }

const f2 = (x: number) => x.toFixed(2);
const sgn = (x: number, d = 2) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)}`;

/** The compare card's rows: launch split, exit speed at the named bend, top speed, finish time, clean shifts. */
export function compareRows(course: TestCourse, a: TestMetrics, b: TestMetrics): CompareRow[] {
  const row = (key: CompareRow['key'], label: string, va: number, vb: number, fmt: (x: number) => string, lowerBetter: boolean, d = 2, eps = 0.005): CompareRow => {
    const diff = vb - va;
    return { key, label, a: fmt(va), b: fmt(vb), delta: Math.abs(diff) < eps ? '—' : `${sgn(diff, d)}${key === 'top' || key === 'exit' ? ' mph' : ' s'}`, better: Math.abs(diff) < eps ? null : lowerBetter ? diff < 0 : diff > 0 };
  };
  return [
    row('launch', `Launch 0–${course.launchM} m`, a.launch, b.launch, (x) => `${f2(x)} s`, true),
    row('exit', `Exit speed · ${course.bendName}`, a.exit, b.exit, (x) => `${Math.round(x)} mph`, false, 0, 0.5),
    row('top', 'Top speed', a.top, b.top, (x) => `${Math.round(x)} mph`, false, 0, 0.5),
    row('time', 'Finish time', a.time, b.time, (x) => `${f2(x)} s`, true),
    { key: 'cleanShifts', label: 'Clean shifts', a: `${a.clean}/${a.shifts}`, b: `${b.clean}/${b.shifts}`, delta: '', better: null },
  ];
}

/** One plain sentence on what the part did, from the same-shifting comparison (so the driving does not hide it). */
export function verdict(c: Candidate, part: { a: TestMetrics; b: TestMetrics }, course: TestCourse): string {
  const dt = part.b.time - part.a.time;
  const name = `T${c.tier} ${famName(c.family)}`;
  if (Math.abs(dt) < 0.005) return `With the ${name}: no measurable change on this course.`;
  const where: string[] = [];
  if (Math.abs(part.b.launch - part.a.launch) >= 0.01) where.push(`${sgn(part.b.launch - part.a.launch)} s off the line`);
  if (Math.abs(part.b.exit - part.a.exit) >= 0.5) where.push(`${sgn(part.b.exit - part.a.exit, 0)} mph out of ${course.bendName}`);
  if (Math.abs(part.b.top - part.a.top) >= 0.5) where.push(`${sgn(part.b.top - part.a.top, 0)} mph at the top`);
  return dt < 0
    ? `With the ${name}: ${Math.abs(dt).toFixed(2)} s quicker over the test${where.length ? ` (${where.join(', ')})` : ''}.`
    : `With the ${name}: ${dt.toFixed(2)} s slower here${where.length ? ` (${where.join(', ')})` : ''} — keep what you have.`;
}

/** Save a comparison (inside Game.transact): the last one per car. */
export function saveTestRun(s: GameState, car: CarId, course: TestCourse, a: TestMetrics, b: TestMetrics, c: Candidate, now: number) {
  const pack = (m: TestMetrics): Record<string, number> => ({ ...m });
  (s.testRuns ??= {})[car] = { at: now, event: course.id, a: pack(a), b: pack(b), parts: `${c.family}:T${c.tier}:${c.quality}:${c.source}` };
}

/** Every car has a course whose track exists and whose named bend is a bend. */
export function checkCourses(): string[] {
  const bad: string[] = [];
  for (const car of CARS.filter((x) => x.enabled)) {
    const c = courseFor(car.id);
    const t = courseTrack(c);
    if (!t.segments[c.bend]?.radius) bad.push(`${car.id}: ${c.id} bend ${c.bend}`);
  }
  return bad;
}
