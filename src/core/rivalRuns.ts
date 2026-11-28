// Rival Runs rules (Pit Stop update): eligibility, the race setup with the run's constraint applied, the objective
// judged on the full sim outcome, best results, a one-time prize, and an evidence-based suggestion.
// Every function that changes state runs inside Game.transact (all-or-nothing, persisted once).
// Owned by the Pit Setup & Rival Runs workstream.
import { CarId, FAMILIES, Family, RIVALS, TRACKS, TUNE_STAGES, carById, eventById, styleItem, tunePrice } from '../data/tables';
import { RIVAL_RUNS, RivalPrize, RivalRun, rivalRunById } from '../data/rivalRuns';
import { firstFree, placeNew } from './board';
import type { GameEvent } from './events';
import { fillEmptyFromBench, fitCandidates, fitRecommended, fitted } from './install';
import { computeLoadout, loadoutWith } from './loadout';
import type { RaceOutcome, RaceSetup } from './race';
import type { GameState, LastResult, RivalRunRecord } from './state';

export { RIVAL_RUNS, rivalRunById };
export type { RivalRun };

const EMPTY: RivalRunRecord = { tries: 0, best: null, bestGap: null, done: false, claimed: false };

/** The saved record for a run (a fresh one when the save has none, e.g. a save from before Rival Runs). */
export function runRecord(s: GameState, id: string): RivalRunRecord {
  const r = s.rivalRuns?.[id];
  if (!r || typeof r !== 'object') return { ...EMPTY };
  return {
    tries: Number.isFinite(r.tries) ? r.tries : 0,
    best: typeof r.best === 'number' && Number.isFinite(r.best) ? r.best : null,
    bestGap: typeof r.bestGap === 'number' && Number.isFinite(r.bestGap) ? r.bestGap : null,
    done: !!r.done,
    claimed: !!r.claimed,
  };
}

/** Open: its car is owned and, for a chain step (1.10 Redline), the previous step's prize is won. */
export const runOpen = (s: GameState, run: RivalRun) => s.owned.includes(run.opens) && (!run.after || runRecord(s, run.after).claimed);
export const lockedText = (run: RivalRun, s?: GameState) =>
  s && s.owned.includes(run.opens) && run.after ? `Finish ${rivalRunById(run.after)?.name ?? run.after} first` : `Opens with the ${carById(run.opens).model}`;
/** Owned cars this run accepts. */
export const eligibleCars = (s: GameState, run: RivalRun): CarId[] => run.cars.filter((c) => s.owned.includes(c));
/** The car to bring by default: the active car if it is allowed, else the first allowed car owned. */
export const defaultCar = (s: GameState, run: RivalRun): CarId | null =>
  eligibleCars(s, run).includes(s.activeCar) ? s.activeCar : eligibleCars(s, run)[0] ?? null;

/** The field's racer id for the run's named rival (events suffix rival ids per event). */
export function rivalRacerId(run: RivalRun): string {
  const ev = eventById(run.event);
  return ev.rivals.find((id) => id === run.rival || id.startsWith(`${run.rival}@`)) ?? run.rival;
}
export const runName = (id: string) => rivalRunById(id)?.name ?? id;
export const rivalName = (run: RivalRun) => RIVALS[run.rival]?.name ?? run.rival;
/** Seconds for a small margin: "0.42", or "under 0.01" when the cars were level to the eye. */
export const secs = (x: number) => (Math.abs(x) < 0.005 ? 'under 0.01' : Math.abs(x).toFixed(2));

export function prizeText(p: RivalPrize): string {
  if (p.kind === 'part') return `T${p.tier} ${FAMILIES[p.family].name} part`;
  if (p.kind === 'paint') return `${p.name} paint`;
  if (p.kind === 'tune') return 'Free Tune-up stage';
  if (p.kind === 'car') return `The ${carById(p.car).model}`;
  return `${styleItem(p.id)?.name ?? p.id} livery`;
}
export function prizeDetail(p: RivalPrize): string {
  if (p.kind === 'part') return `Lands on your bench (or waits in a crate if it's full) — ${p.why}. Crafting still needs your own merge.`;
  if (p.kind === 'paint') return 'A rival paint any car can wear — apply it in the Showroom.';
  if (p.kind === 'tune') return 'For the car you raced (+2% top speed, acceleration and grip); its cash price instead if that car is fully tuned.';
  if (p.kind === 'car') { const c = carById(p.car); return `${c.blurb} ${c.handling ?? ''} T${c.cap} parts fit.`.trim(); }
  const it = styleItem(p.id);
  return `${it ? `Worth $${it.price} in the Paint shop. ` : ''}Fits every car — apply it in the Showroom.`;
}

/**
 * Reserve a Rival Run and build its race: the chosen car's fitted build with the run's part cap, the run's nitro
 * (banked nitro is never spent), and the rival shift quality. Nothing is paid until the finish is committed.
 */
export function startRivalRun(s: GameState, runId: string, car: CarId, now: number): { ok: true; setup: RaceSetup } | { ok: false; why: string } {
  const run = rivalRunById(runId);
  if (!run) return { ok: false, why: 'Unknown Rival Run' };
  if (!runOpen(s, run)) return { ok: false, why: lockedText(run) };
  if (!run.cars.includes(car)) return { ok: false, why: `${run.name} takes the ${run.cars.map((c) => carById(c).model).join(' or ')} only` };
  if (!s.owned.includes(car)) return { ok: false, why: 'Not your car' };
  s.raceSeed = (Math.imul(s.raceSeed, 1664525) + 1013904223) >>> 0;
  s.pendingRace = { id: s.raceSeed, eventId: run.event, car, seed: s.raceSeed, startedAt: now };
  const cls = carById(car);
  const lo = computeLoadout(s, car, undefined, run.partCap);
  return {
    ok: true,
    setup: {
      eventId: run.event,
      seed: s.raceSeed,
      player: { name: 'You', car, stats: lo.stats, paint: s.paints[car] ?? cls.paint, perfectMul: cls.perfectMul },
      nitroCharges: run.nitro,
      rivalShift: run.rivalShift ?? 'ordinary',
    },
  };
}

export interface RunJudgement {
  met: boolean;
  ahead: boolean;
  /** Rival's time minus yours (positive: you were ahead), seconds. */
  gap: number | null;
  /** Rival's launch split minus yours (positive: you led out of the launch; within the run's margin counts as level). */
  launchGap: number | null;
  clean: number;
  shifts: number;
  missed: number;
  time: number | null;
}

/** Judge the run's objective on the full outcome (splits, shifts) of the race just driven. */
export function judge(run: RivalRun, o: RaceOutcome): RunJudgement {
  const me = o.standings.find((r) => r.isPlayer);
  const rv = o.standings.find((r) => r.id === rivalRacerId(run));
  const mt = me?.finishTime ?? null;
  const rt = rv?.finishTime ?? null;
  const ahead = mt !== null && (rt === null || mt < rt);
  const gap = mt !== null && rt !== null ? rt - mt : null;
  const ml = me?.splits?.[0];
  const rl = rv?.splits?.[0];
  const launchGap = typeof ml === 'number' && typeof rl === 'number' ? rl - ml : null;
  const log = (o.shiftLog ?? []).filter((x) => x.grade !== 'assist');
  const missed = (o.shiftLog ?? []).filter((x) => x.grade === 'missed').length;
  const clean = o.shiftsClean ?? log.filter((x) => x.grade === 'clean').length;
  const shifts = o.shifts ?? log.length;
  let met = ahead;
  if (run.objective.kind === 'launch') met = ahead && launchGap !== null && launchGap > -run.objective.within;
  if (run.objective.kind === 'shift') met = ahead && clean >= run.objective.clean && missed === 0;
  if (run.objective.kind === 'boost') met = ahead && o.perfects >= run.objective.perfects;
  return { met, ahead, gap, launchGap, clean, shifts, missed, time: mt };
}

/** One specific next step, only when the race data supports it: a technique, or an exact part change. */
export function suggestFor(s: GameState, run: RivalRun, car: CarId, o: RaceOutcome, j: RunJudgement): string | null {
  const shiftLoss = o.shiftLoss ?? 0;
  const boostLoss = o.boostLoss ?? 0;
  const worst = (o.shiftLog ?? []).filter((x) => x.grade !== 'clean' && x.grade !== 'assist').sort((a, b) => b.cost - a.cost)[0];
  const gear = (n: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] ?? `gear ${n + 1}`;
  if (run.objective.kind === 'shift' && j.ahead && !j.met) {
    return `You beat ${rivalName(run).split(' ')[0]}, but the run needs ${run.objective.clean} clean shifts and none missed (you had ${j.clean} clean${j.missed ? `, ${j.missed} missed` : ''}). Tap SHIFT the moment the light turns green${worst ? ` — the shift into ${gear(worst.into)} was ${worst.grade}` : ''}.`;
  }
  if (run.objective.kind === 'boost' && j.ahead && !j.met) {
    return `You won, but the run needs ${run.objective.perfects} Perfect boosts (you had ${o.perfects}). Fire nitro inside the boost zone — the ring on the button counts down to each one.`;
  }
  if (run.objective.kind === 'launch' && j.ahead && !j.met) {
    return `You won the race but not the launch (${secs(j.launchGap ?? 0)} s behind ${rivalName(run).split(' ')[0]} out of the start). Shift into 2nd right on the green light — a late first shift costs the launch.`;
  }
  if (shiftLoss >= 0.15 && shiftLoss >= boostLoss) {
    return `Shifting cost ${shiftLoss.toFixed(1)} s${worst ? ` — the shift into ${gear(worst.into)} came ${worst.grade === 'missed' ? 'too late and the box shifted on the limiter' : worst.grade}` : ''}. Tap SHIFT when the light turns green.`;
  }
  if (run.nitro > 0 && boostLoss >= 0.15) {
    return `Boost timing cost ${boostLoss.toFixed(1)} s. Fire nitro inside each boost zone for a Perfect boost${run.nitro >= 3 ? ' — this run gives you one for every straight' : ''}.`;
  }
  // The build: the segment type where the rival gained most, and the exact owned part that would help there.
  const me = o.standings.find((r) => r.isPlayer);
  const rv = o.standings.find((r) => r.id === rivalRacerId(run));
  if (!me || !rv || j.met) return null;
  const segs = TRACKS[eventById(run.event).track].segments;
  const lossBy: Partial<Record<Family, { lost: number; where: string }>> = {};
  segs.forEach((sg, i) => {
    const t0 = i ? me.splits[i - 1] : 0, r0 = i ? rv.splits[i - 1] : 0;
    if (me.splits[i] === undefined || rv.splits[i] === undefined) return;
    const lost = (me.splits[i] - t0) - (rv.splits[i] - r0);
    const f: Family = sg.type === 'launch' ? 'turbo' : sg.type === 'bend' || sg.type === 'hwbend' ? 'tires' : 'engine';
    const where = sg.type === 'launch' ? 'the launch' : sg.type === 'bend' || sg.type === 'hwbend' ? 'the bends' : 'the straights';
    const cur = lossBy[f];
    lossBy[f] = { lost: (cur?.lost ?? 0) + lost, where };
  });
  const [fam, loss] = (Object.entries(lossBy) as [Family, { lost: number; where: string }][]).sort((a, b) => b[1].lost - a[1].lost)[0] ?? [];
  if (!fam || !loss || loss.lost < 0.1) return null;
  const better = bestOwnedUpgrade(s, car, fam, run.partCap);
  if (better) return `${rivalName(run)} gained ${loss.lost.toFixed(1)} s on you in ${loss.where}. Fit the ${better.text} — ${better.gain}.`;
  const cap = Math.min(carById(car).cap, run.partCap ?? 99);
  const have = fitted(s, car)[fam];
  if (!have || have.t < cap) return `${rivalName(run)} gained ${loss.lost.toFixed(1)} s on you in ${loss.where}. A T${cap} ${FAMILIES[fam].name} is the most this run allows — merge or order one.`;
  return `${rivalName(run)} gained ${loss.lost.toFixed(1)} s on you in ${loss.where}, and your ${FAMILIES[fam].name} is already at the run's limit — ${run.nitro ? 'Perfect boosts out of each bend close it' : 'clean shifts close it'}.`;
}

/** The strongest part you own (bench, spare rack or another car) that would improve this car's slot, with its gain. */
export function bestOwnedUpgrade(s: GameState, car: CarId, family: Family, partCap?: number): { text: string; gain: string } | null {
  const before = computeLoadout(s, car, undefined, partCap).stats;
  const stat = FAMILIES[family].stat as 'top' | 'accel' | 'grip';
  for (const src of fitCandidates(s, car, family)) {
    const after = loadoutWith(s, car, { [family]: src.part }, partCap).stats;
    if (after[stat] > before[stat] + 1e-9) {
      const where = 'at' in src ? (src.at.zone === 'tray' ? 'from your spare rack' : 'from your bench') : `from the ${carById(src.car).model}`;
      const pct = Math.round(((after[stat] - before[stat]) / before[stat]) * 100);
      const gain = stat === 'top' ? `+${Math.max(1, Math.round((after.top - before.top) * 2.23694))} mph top speed` : `+${Math.max(1, pct)}% ${stat === 'accel' ? 'acceleration' : 'grip'}`;
      return { text: `T${src.part.t} ${FAMILIES[family].name} ${where}`, gain };
    }
  }
  return null;
}

/** Grant a prize. Parts land on the bench, or wait as a crate when the bench and spare rack are full. */
export function grantPrize(s: GameState, p: RivalPrize, events: GameEvent[], car: CarId = s.activeCar) {
  if (p.kind === 'tune') {
    const st = s.tune?.[car] ?? 0;
    if (st < TUNE_STAGES) (s.tune ??= {})[car] = st + 1;
    else { const c = tunePrice(car, TUNE_STAGES - 1); s.cash += c; s.stats.earned = (s.stats.earned ?? 0) + c; events.push({ type: 'cash', amount: c, reason: 'rival-run' }); }
    return;
  }
  if (p.kind === 'car') { grantCar(s, p.car, events); return; }
  if (p.kind === 'part') {
    if (!firstFree(s) || !placeNew(s, p.family, p.tier, 'rival', events)) s.crates.push({ kind: 'targeted', family: p.family, tier: p.tier, source: 'boss' });
  } else if (p.kind === 'paint') {
    if (!s.blueprints.includes(p.name)) s.blueprints.push(p.name);
  } else if (!(s.owns ??= []).includes(p.id)) s.owns.push(p.id);
}

export interface RivalRunResult {
  raceId: number;
  runId: string;
  car: CarId;
  judgement: RunJudgement;
  newBest: boolean;
  /** The prize was granted by this run (it can only happen once). */
  prized: boolean;
  firstTry: boolean;
  suggestion: string | null;
}

/** Commit a finished Rival Run once: records, best time and gap, and the prize the first time the objective is met. */
export function commitRivalRun(s: GameState, raceId: number, runId: string, o: RaceOutcome, events: GameEvent[]): { result: RivalRunResult; last: LastResult } | null {
  const run = rivalRunById(runId);
  const pr = s.pendingRace;
  if (!run || !pr || pr.id !== raceId) return null;
  s.pendingRace = null;
  const j = judge(run, o);
  const rec = runRecord(s, run.id);
  const firstTry = rec.tries === 0;
  rec.tries++;
  const newBest = j.time !== null && (rec.best === null || j.time < rec.best - 1e-9);
  if (newBest) rec.best = j.time;
  if (j.gap !== null && (rec.bestGap === null || j.gap > rec.bestGap)) rec.bestGap = j.gap;
  let prized = false;
  if (j.met) {
    rec.done = true;
    if (!rec.claimed) {
      rec.claimed = true;
      prized = true;
      grantPrize(s, run.prize, events, pr.car);
    }
  }
  (s.rivalRuns ??= {})[run.id] = rec;
  const suggestion = suggestFor(s, run, pr.car, o, j);
  const last: LastResult = {
    raceId, eventId: run.event, place: o.place, mode: 'live', time: o.playerTime, gapText: o.gapText,
    cash: 0, rep: 0, crates: 0, precision: 0, firstClear: false, boss: false,
    perfects: o.perfects, nitroUsed: o.nitroUsed, advice: suggestion ?? '',
    standings: o.standings.map((r) => ({ name: r.name, time: r.finishTime, isPlayer: r.isPlayer })),
  };
  return { result: { raceId, runId: run.id, car: pr.car, judgement: j, newBest, prized, firstTry, suggestion }, last };
}

/** Runs to show in the Race menu: open ones first (unfinished before done), then the next locked one. */
export function runsToShow(s: GameState): { run: RivalRun; open: boolean }[] {
  const solo = RIVAL_RUNS.filter((r) => !r.series); // chain steps show on their own series card (redlineView)
  const open = solo.filter((r) => runOpen(s, r));
  const locked = solo.filter((r) => !runOpen(s, r));
  return [
    ...open.filter((r) => !runRecord(s, r.id).claimed).map((run) => ({ run, open: true })),
    ...open.filter((r) => runRecord(s, r.id).claimed).map((run) => ({ run, open: true })),
    ...locked.slice(0, 1).map((run) => ({ run, open: false })),
  ];
}

// ---------------- 1.10 Redline Series ----------------

/** Hand over an earned car (a chain's last prize), exactly like a ladder unlock: ownership first, then the reveal;
 *  it arrives with your best parts fitted and becomes the active car. Owning it already changes nothing. */
export function grantCar(s: GameState, car: CarId, events: GameEvent[]) {
  if (s.owned.includes(car)) return;
  s.owned.push(car);
  s.activeCar = car;
  s.pendingReveal ??= car;
  s.stats.milestones[car] = Math.round(s.activeS);
  events.push({ type: 'unlock', car });
  events.push(...fitRecommended(s, car));
  for (const other of s.owned) if (other !== car) events.push(...fillEmptyFromBench(s, other));
}

export const REDLINE_RUNS: RivalRun[] = RIVAL_RUNS.filter((r) => r.series?.id === 'redline').sort((a, b) => a.series!.step - b.series!.step);

export interface SeriesStepView {
  run: RivalRun;
  step: number;
  open: boolean;
  /** Prize won (the step is done). */
  done: boolean;
  /** The next step to race (the first open step not done). */
  current: boolean;
  prize: string;
  why: string | null;
  tries: number;
}
export interface SeriesView {
  name: string;
  /** Visible at all: the series is listed (with what opens it) once you own the car before its first step's car. */
  visible: boolean;
  open: boolean;
  done: number;
  of: number;
  car: CarId;
  /** The finished series' reward and why it is worth driving. */
  reward: { model: string; role: string; cap: number; owned: boolean };
  steps: SeriesStepView[];
  /** The next step to race, or null when every step is done (or none is open). */
  next: RivalRun | null;
  lockedWhy: string | null;
}

/** The Redline Series in one view: every step with its prize up front, what is done, the next step and the reward. */
export function redlineView(s: GameState): SeriesView {
  const steps = REDLINE_RUNS.map((run) => {
    const rec = runRecord(s, run.id);
    return { run, step: run.series!.step, open: runOpen(s, run), done: rec.claimed, current: false, prize: prizeText(run.prize), why: runOpen(s, run) ? null : lockedText(run, s), tries: rec.tries };
  });
  const cur = steps.find((x) => x.open && !x.done);
  if (cur) cur.current = true;
  const last = REDLINE_RUNS[REDLINE_RUNS.length - 1];
  const car = (last.prize.kind === 'car' ? last.prize.car : 'kestrelr') as CarId;
  const c = carById(car);
  const first = REDLINE_RUNS[0];
  return {
    name: 'Redline Series',
    // listed from the Corvo Rally on (one car before it opens), so the reward is in view before you can start
    visible: s.owned.includes(first.opens) || s.owned.includes('rally'),
    open: runOpen(s, first),
    done: steps.filter((x) => x.done).length,
    of: steps.length,
    car,
    reward: { model: c.model, role: c.handling ?? c.blurb, cap: c.cap, owned: s.owned.includes(car) },
    steps,
    next: cur?.run ?? null,
    lockedWhy: runOpen(s, first) ? null : lockedText(first, s),
  };
}
