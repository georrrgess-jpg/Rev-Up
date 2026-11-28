// Rev Up — Circuit competition rules (Racing and competition workstream): personal-best ghosts, the rival ladder,
// the Heritage Cup class series, skill milestones that pay once, the Race menu's competition summary, and the
// evidence-based explanation of a finish. Pure rules over GameState / RaceOutcome (no DOM); every function that
// changes state is meant to run inside Game.transact.
import { rivalCarModel } from '../data/rivalCars';
import {
  BLUEPRINT_FINISHES, CarId, EVENTS, FAMILIES, Family, RIVALS, RaceEvent, TRACKS, carById, eventById, roundCash,
} from '../data/tables';
import { drivetrainFor } from '../data/drivetrain';
import {
  CIRCUIT_FINISHES, CircuitPrize, HERITAGE, LADDER, LadderRung, MILESTONES, MilestoneId, RIVAL_PROFILES, SERIES_POINTS,
} from '../data/circuit';
import type { GameEvent } from './events';
import { fitted } from './install';
import { GHOST_STEPS, RaceOutcome, Racer, ShiftRecord } from './race';
import { bestOwnedUpgrade, grantPrize } from './rivalRuns';
import type { GameState } from './state';
import { mph } from './units';
import { RACE } from '../data/tables';
import { LAUNCH_CONTROL } from '../data/circuit';

// Rival and series paints join the Showroom's blueprint finishes (additive, like the Rival Runs paint).
for (const f of [...Object.values(CIRCUIT_FINISHES), { name: 'Giant Killer Red', paint: '#b3122e' }]) {
  if (!BLUEPRINT_FINISHES.some((b) => b.name === f.name)) BLUEPRINT_FINISHES.push(f);
}

// ---------------------------------------------------------------- ghosts

/** A personal-best ghost: finish time, the car, and distance (decimetres) every GHOST_DT seconds. */
export interface Ghost { t: number; car: CarId; d: number[] }
/** Seconds between ghost samples. */
export const GHOST_DT = GHOST_STEPS * RACE.dt;
/** Samples kept at most (45 s, the race cutoff). */
const GHOST_MAX = Math.ceil(RACE.safetyCutoffS / GHOST_DT) + 2;

const isGhost = (g: unknown): g is Ghost => {
  if (!g || typeof g !== 'object') return false;
  const x = g as Ghost;
  return typeof x.t === 'number' && Number.isFinite(x.t) && x.t > 0 && x.t < RACE.safetyCutoffS + 1
    && typeof x.car === 'string' && !!drivetrainFor(x.car) && Array.isArray(x.d) && x.d.length >= 2 && x.d.length <= GHOST_MAX
    && x.d.every((v, i) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && (i === 0 || v >= x.d[i - 1]));
};

/** The saved ghost for an event, or null (a malformed one reads as none). */
export function readGhost(s: GameState, eventId: string): Ghost | null {
  const g = s.ghosts?.[eventId];
  return isGhost(g) ? g : null;
}

/** Drop malformed ghosts and ghosts for events that no longer exist (call on load or before writing). */
export function cleanGhosts(s: GameState): void {
  if (!s.ghosts) return;
  if (typeof s.ghosts !== 'object' || Array.isArray(s.ghosts)) { delete s.ghosts; return; }
  for (const [id, g] of Object.entries(s.ghosts)) if (!isGhost(g) || !EVENTS.some((e) => e.id === id)) delete s.ghosts[id];
}

/** Ghost distance (m) at race time t: linear between samples, then on at its finishing pace to the line. */
export function ghostX(g: Ghost, t: number): number {
  const k = t / GHOST_DT - 1; // sample i is at (i + 1) × GHOST_DT
  if (k <= 0) return Math.max(0, (g.d[0] / 10) * Math.max(0, t / GHOST_DT) ** 2); // launch: from rest
  const i = Math.floor(k);
  if (i >= g.d.length - 1) {
    const n = g.d.length;
    const v = (g.d[n - 1] - g.d[n - 2]) / 10 / GHOST_DT;
    return g.d[n - 1] / 10 + v * (t - n * GHOST_DT);
  }
  return (g.d[i] + (g.d[i + 1] - g.d[i]) * (k - i)) / 10;
}

/** Race time at which the ghost passed distance x (m): the inverse of ghostX. */
export function ghostTimeAt(g: Ghost, x: number): number {
  const dm = x * 10;
  if (dm <= g.d[0]) return Math.sqrt(Math.max(0, dm / Math.max(1e-6, g.d[0]))) * GHOST_DT;
  let lo = 0, hi = g.d.length - 1;
  if (dm >= g.d[hi]) {
    const v = (g.d[hi] - g.d[hi - 1]) / GHOST_DT;
    return (hi + 1) * GHOST_DT + (dm - g.d[hi]) / Math.max(1e-6, v);
  }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.d[m] <= dm) lo = m; else hi = m; }
  return (lo + 1 + (dm - g.d[lo]) / Math.max(1e-6, g.d[hi] - g.d[lo])) * GHOST_DT;
}

/** Live delta against the ghost at the player's position: negative = ahead of your best. */
export const ghostDelta = (g: Ghost, x: number, t: number) => t - ghostTimeAt(g, x);

/** Events that keep a personal-best ghost: the time trials (a run with no rivals and medal times). */
export const keepsGhost = (e: RaceEvent) => !!e.timeAttack;

// ---------------------------------------------------------------- milestones & prizes

const MS = (k: string) => `cx:${k}`;
const done = (s: GameState, k: string) => !!s.stats.milestones[MS(k)];
const mark = (s: GameState, k: string) => { s.stats.milestones[MS(k)] = Math.max(1, Math.round(s.activeS)); };

export function prizeText(p: CircuitPrize): string {
  if (p.kind === 'part') return `T${p.tier} ${FAMILIES[p.family].name} part`;
  if (p.kind === 'paint') return `${p.name} paint`;
  if (p.kind === 'badge') return `“${p.name}” badge${p.cash ? ` and $${p.cash.toLocaleString('en-US')}` : ''}`;
  return `$${p.cash.toLocaleString('en-US')}${p.crates ? ` and ${p.crates} crate${p.crates > 1 ? 's' : ''}` : ''}`;
}

/** Grant a Circuit prize (cash on the usual steps; crates wait to be opened like any race crate). */
export function grantCircuitPrize(s: GameState, p: CircuitPrize, events: GameEvent[]): number {
  let cash = 0;
  if (p.kind === 'part' || p.kind === 'paint') grantPrize(s, p, events);
  else {
    cash = roundCash(p.cash ?? 0);
    if (p.kind === 'badge' && !s.badges.includes(p.name)) s.badges.push(p.name);
    if (p.kind === 'cash') for (let k = 0; k < (p.crates ?? 0); k++) s.crates.push({ kind: 'std', source: 'race' });
  }
  s.cash += cash;
  s.stats.earned = (s.stats.earned ?? 0) + cash;
  return cash;
}

// ---------------------------------------------------------------- the rival ladder

export const rungEvent = (r: LadderRung) => eventById(r.event);
/** A rung is beaten when its rival is (a boss: on the boss list; otherwise you finished ahead of them in its event). */
export function rungBeaten(s: GameState, r: LadderRung): boolean {
  const e = rungEvent(r);
  if (e.boss?.rival === r.rival) return s.bosses.includes(r.rival);
  return done(s, `beat:${r.rival}`) || (s.events[e.id]?.wins ?? 0) > 0;
}
const rungOpen = (s: GameState, r: LadderRung) => {
  const e = rungEvent(r);
  const req = e.requires;
  return (!req.car || s.owned.includes(req.car)) && (!req.afterWin || (s.events[req.afterWin]?.wins ?? 0) > 0)
    && (!req.beatBoss || s.bosses.includes(req.beatBoss));
};
function rungPrizeText(r: LadderRung): string {
  if (r.prize) return prizeText(r.prize);
  const b = rungEvent(r).boss;
  return b ? `${b.reward.blueprint} paint, “${b.reward.badge}” and $${b.reward.cash.toLocaleString('en-US')}` : 'the win purse';
}

// ---------------------------------------------------------------- Heritage Cup

const seriesRounds = () => HERITAGE.rounds.filter((id) => EVENTS.some((e) => e.id === id)).map(eventById);
function seriesWins(s: GameState) { return seriesRounds().filter((e) => (s.events[e.id]?.wins ?? 0) > 0).length; }

// ---------------------------------------------------------------- commit (inside the race's transaction)

export interface CircuitResult {
  raceId: number;
  eventId: string;
  /** Time trial: the ghost raced (its time), the new time's delta to it (negative = faster), a new ghost saved. */
  ghostT: number | null;
  ghostDelta: number | null;
  newGhost: boolean;
  /** Milestones and prizes earned by this race (each pays once). */
  earned: { name: string; prize: string }[];
  cash: number;
  /** The ladder rung this race beat for the first time. */
  rung: string | null;
  ladder: { position: number; of: number };
}

/**
 * Apply the Circuit side of a finished live race exactly once (keyed by raceId): save a faster ghost, mark beaten
 * ladder rivals, pay first-time ladder and series prizes and skill milestones. Call right after the race's own commit
 * (Progression's commitRace) with the full outcome; a stale or repeated raceId changes nothing and returns null.
 */
export function commitCircuit(s: GameState, raceId: number, car: CarId, o: RaceOutcome, events: GameEvent[]): CircuitResult | null {
  const eventId = o.eventId;
  if (!eventId || !EVENTS.some((e) => e.id === eventId)) return null;
  if (s.stats.milestones[MS('last')] === raceId) return null;
  s.stats.milestones[MS('last')] = raceId;
  const e = eventById(eventId);
  cleanGhosts(s);
  const earned: CircuitResult['earned'] = [];
  let cash = 0;
  const pay = (name: string, p: CircuitPrize) => { cash += grantCircuitPrize(s, p, events); earned.push({ name, prize: prizeText(p) }); };
  const ladderBefore = LADDER.filter((r) => rungBeaten(s, r)).length;
  // ---- time trial ghost
  let ghostT: number | null = null, delta: number | null = null, newGhost = false;
  if (keepsGhost(e) && o.playerTime !== null) {
    const old = readGhost(s, e.id);
    ghostT = old?.t ?? null;
    delta = old ? o.playerTime - old.t : null;
    if ((!old || o.playerTime < old.t - 1e-6) && o.trace && o.trace.length >= 2) {
      (s.ghosts ??= {})[e.id] = { t: +o.playerTime.toFixed(3), car, d: o.trace.slice(0, GHOST_MAX) };
      newGhost = true;
    }
    if (old && delta !== null && delta < 0 && !done(s, 'ghost-beaten')) { mark(s, 'ghost-beaten'); pay('Faster than yourself', msPrize('ghost-beaten')); }
  }
  // ---- ladder: beating a non-boss rung rival is recorded by finishing ahead of them
  const me = o.standings.find((r) => r.isPlayer);
  for (const r of LADDER) {
    if (r.event !== e.id && r.event !== e.heatOf) continue;
    const foe = o.standings.find((x) => x.id === r.rival || x.id.startsWith(`${r.rival}@`));
    if (me?.finishTime != null && foe && (foe.finishTime === null || me.finishTime < foe.finishTime)) {
      if (!done(s, `beat:${r.rival}`)) mark(s, `beat:${r.rival}`);
      if (r.prize && !done(s, `rung:${r.rival}`)) { mark(s, `rung:${r.rival}`); pay(`Beat ${RIVALS[r.rival]?.name ?? r.rival}`, r.prize); }
    }
  }
  const ladderAfter = LADDER.filter((r) => rungBeaten(s, r)).length;
  const rung = ladderAfter > ladderBefore ? LADDER.find((r) => (r.event === e.id || r.event === e.heatOf) && rungBeaten(s, r))?.rival ?? null : null;
  // ---- Heritage Cup prizes by round wins
  if (HERITAGE.rounds.includes(e.id)) {
    const wins = seriesWins(s);
    for (const sp of HERITAGE.prizes) if (wins >= sp.wins && !done(s, `series:${sp.wins}`)) { mark(s, `series:${sp.wins}`); pay(`${HERITAGE.name}: ${sp.wins} round wins`, sp.prize); }
    // a giant killer: won against a car that outguns yours on paper
    if (o.place === 1 && me && !done(s, 'giant-killer')) {
      const pv = (r: Racer) => r.stats.top * drivetrainFor(r.car).topScale;
      if (o.standings.some((r) => !r.isPlayer && pv(r) > pv(me) && r.stats.accel * drivetrainFor(r.car).accelScale > me.stats.accel * drivetrainFor(me.car).accelScale)) {
        mark(s, 'giant-killer'); pay('Giant killer', msPrize('giant-killer'));
      }
    }
  }
  // ---- skill milestones
  const shifts = (o.shiftLog ?? []).filter((x) => x.grade !== 'assist');
  const allClean = shifts.length >= 4 && shifts.every((x) => x.grade === 'clean');
  const field = o.standings.length > 1;
  if (o.perfectLaunch && field && !done(s, 'perfect-launch')) { mark(s, 'perfect-launch'); pay('Perfect launch', msPrize('perfect-launch')); }
  if (o.place === 1 && field && allClean && !done(s, 'clean-sweep')) { mark(s, 'clean-sweep'); pay('Clean sweep', msPrize('clean-sweep')); }
  if (o.place === 1 && field && allClean && o.perfects >= 2 && !done(s, 'flawless')) { mark(s, 'flawless'); pay('Flawless', msPrize('flawless')); }
  if (o.launchControl && !done(s, 'launch-control')) { mark(s, 'launch-control'); pay('Launch control', msPrize('launch-control')); }
  return { raceId, eventId: e.id, ghostT, ghostDelta: delta, newGhost, earned, cash, rung, ladder: { position: ladderAfter, of: LADDER.length } };
}
const msPrize = (id: MilestoneId) => MILESTONES.find((m) => m.id === id)!.prize;

// ---------------------------------------------------------------- the Race menu's summary

export interface LadderRungView {
  rival: string; name: string; car: CarId; carModel: string; paint: string;
  /** The rival's personality line and where they are fast (and why). */
  line: string; strength: string; home: string;
  event: string; eventName: string;
  beaten: boolean; open: boolean;
  /** What the open event still needs, when closed. */
  why: string;
  prize: string;
}
export interface SeriesRoundView { event: string; name: string; car: CarId; carModel: string; owned: boolean; bestPlace: number | null; points: number; won: boolean; open: boolean }
export interface TrialView {
  event: string; name: string; track: string; open: boolean;
  best: number | null;
  ghost: { t: number; car: CarId; carModel: string } | null;
  medal: number; // 0 none · 1 bronze · 2 silver · 3 gold
  nextMedal: { name: string; target: number; gap: number | null } | null;
}
export interface CompetitionSummary {
  ladder: { position: number; of: number; rungs: LadderRungView[]; next: LadderRungView | null };
  series: {
    id: string; name: string; rounds: SeriesRoundView[]; points: number; max: number; wins: number;
    next: SeriesRoundView | null;
    nextPrize: { wins: number; text: string; left: number } | null;
  };
  trials: TrialView[];
  milestones: { id: MilestoneId; name: string; text: string; prize: string; done: boolean }[];
}

/** Everything the Race menu needs to show the competition side (see docs in README: Circuit). */
export function competitionSummary(s: GameState): CompetitionSummary {
  const rungs: LadderRungView[] = LADDER.filter((r) => EVENTS.some((e) => e.id === r.event) && RIVALS[r.rival]).map((r) => {
    const rv = RIVALS[r.rival];
    const e = rungEvent(r);
    const prof = RIVAL_PROFILES[r.rival];
    const open = rungOpen(s, r);
    const req = e.requires;
    const why = open ? '' : req.car && !s.owned.includes(req.car) ? `Unlock the ${carById(req.car).model}` : req.afterWin ? `Win ${eventById(req.afterWin).name} first` : req.beatBoss ? `Beat ${RIVALS[req.beatBoss]?.name}` : '';
    return {
      rival: r.rival, name: rv.name, car: rv.car, carModel: rivalCarModel(rv), paint: rv.paint, line: rv.line,
      strength: prof?.strength ?? '', home: prof?.home ?? TRACKS[e.track].name,
      event: e.id, eventName: e.name, beaten: rungBeaten(s, r), open, why, prize: rungPrizeText(r),
    };
  });
  const position = rungs.filter((r) => r.beaten).length;
  const next = rungs.find((r) => !r.beaten && r.open) ?? rungs.find((r) => !r.beaten) ?? null;
  const rounds: SeriesRoundView[] = seriesRounds().map((e) => {
    const rec = s.events[e.id];
    const best = rec && rec.starts > 0 ? rec.bestPlace : null;
    const car = e.carOnly!;
    const owned = s.owned.includes(car);
    const req = e.requires;
    const open = owned && (!req.car || s.owned.includes(req.car)) && (!req.afterWin || (s.events[req.afterWin]?.wins ?? 0) > 0);
    return { event: e.id, name: e.name, car, carModel: carById(car).model, owned, bestPlace: best, points: best ? SERIES_POINTS[best - 1] ?? 0 : 0, won: (rec?.wins ?? 0) > 0, open };
  });
  const wins = rounds.filter((r) => r.won).length;
  const np = HERITAGE.prizes.find((p) => wins < p.wins) ?? null;
  const trials: TrialView[] = EVENTS.filter((e) => keepsGhost(e)).map((e) => {
    const g = readGhost(s, e.id);
    const rec = s.events[e.id];
    const medal = s.medals?.[e.id] ?? 0;
    const ta = e.timeAttack!;
    const req = e.requires;
    const open = (!req.car || s.owned.includes(req.car)) && (!req.afterWin || (s.events[req.afterWin]?.wins ?? 0) > 0) && (!req.beatBoss || s.bosses.includes(req.beatBoss));
    const target = [ta.bronze, ta.silver, ta.gold][medal];
    return {
      event: e.id, name: e.name, track: TRACKS[e.track].name, open, best: rec?.bestTime ?? null,
      ghost: g ? { t: g.t, car: g.car, carModel: carById(g.car).model } : null, medal,
      nextMedal: medal < 3 ? { name: ['Bronze', 'Silver', 'Gold'][medal], target, gap: rec?.bestTime != null ? +(rec.bestTime - target).toFixed(2) : null } : null,
    };
  });
  return {
    ladder: { position, of: rungs.length, rungs, next },
    series: {
      id: HERITAGE.id, name: HERITAGE.name, rounds, wins,
      points: rounds.reduce((a, r) => a + r.points, 0), max: rounds.length * SERIES_POINTS[0],
      next: rounds.find((r) => r.open && !r.won) ?? rounds.find((r) => !r.won) ?? null,
      nextPrize: np ? { wins: np.wins, text: np.text, left: np.wins - wins } : null,
    },
    trials,
    milestones: MILESTONES.map((m) => ({ id: m.id, name: m.name, text: m.text, prize: m.prizeText, done: done(s, m.id) })),
  };
}

// ---------------------------------------------------------------- explaining a finish

/** What a suggestion asks the player to do (the Garage / Race menu can route each kind to its screen). */
export interface FinishAction {
  kind: 'fit' | 'upgrade' | 'tune' | 'shift' | 'boost' | 'launch';
  family?: Family;
  tier?: number;
  car?: CarId;
}
export interface FinishExplanation {
  headline: string;
  reasons: string[];
  suggestion: { text: string; action?: FinishAction };
  /** The rival the finish is measured against (the car ahead, or the one behind after a win), and the margin
   *  (seconds, positive = behind them). Null alone on the road. */
  foe: string | null;
  margin: number | null;
  close: boolean;
}

type Zone = 'launch' | 'bends' | 'straights';
const ZONE_FAMILY: Record<Zone, Family> = { launch: 'turbo', bends: 'tires', straights: 'engine' };
const GEARS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const first = (name: string) => name.split(' ')[0];
const sec = (x: number) => `${Math.abs(x).toFixed(Math.abs(x) < 0.01 ? 3 : Math.abs(x) < 0.1 ? 2 : 1)} s`;

/**
 * Why a race ended the way it did, from the race's own data: the time lost or gained against the deciding rival on
 * each kind of segment (launch, bends, straights) next to the stat that governs it, the measured cost of the shifts
 * and the boost timing, and one useful change. Pass the game state for exact part suggestions from what you own.
 */
export function explainFinish(o: RaceOutcome, s?: GameState): FinishExplanation {
  const me = o.standings.find((r) => r.isPlayer);
  const shift = o.shiftLoss ?? 0;
  const boost = o.boostLoss ?? 0;
  const worst = (o.shiftLog ?? []).filter((x) => x.grade !== 'clean' && x.grade !== 'assist').sort((a, b) => b.cost - a.cost)[0] as ShiftRecord | undefined;
  const shiftWhy = worst ? ` — the shift into ${GEARS[worst.into] ?? `gear ${worst.into + 1}`} was ${worst.grade === 'missed' ? 'missed (the box shifted on the limiter)' : worst.grade}` : '';
  const boostWhy = o.nitroUsed === 0 && (o.nitroLeft ?? 0) > 0 ? ` (${o.nitroLeft} nitro unused)` : o.perfects < o.nitroUsed ? ` (${o.perfects} of ${o.nitroUsed} boosts Perfect)` : '';
  const ev = o.eventId ? EVENTS.find((e) => e.id === o.eventId) : undefined;
  const track = ev ? TRACKS[ev.track] : null;
  const car = me?.car;
  const partCap = ev?.partCap ?? (ev?.heatOf ? eventById(ev.heatOf).partCap : undefined);
  const skillReasons: [number, string][] = [];
  if (shift >= 0.05) skillReasons.push([shift, `Shifting cost ${sec(shift)}${shiftWhy}`]);
  if (boost >= 0.05) skillReasons.push([boost, `Boost timing cost ${sec(boost)}${boostWhy}`]);
  // a launch-control car that started without it (measured on the Tempest: about 0.3 s off the line)
  const lcMissed = !!me && LAUNCH_CONTROL.cars.includes(me.car) && !o.launchControl;
  if (lcMissed) skillReasons.push([0.3, 'Launch control wasn’t engaged — about 0.3 s lost off the line']);
  if (!me || me.finishTime === null || !track) {
    return { headline: me?.finishTime == null ? 'Did not finish' : `${me.finishTime.toFixed(2)} s`, reasons: skillReasons.map((r) => r[1]), suggestion: { text: 'Shift on the green and fire nitro inside each boost zone.' }, foe: null, margin: null, close: false };
  }
  const st = o.standings;
  const idx = st.indexOf(me);
  const foe = idx > 0 ? st[idx - 1] : st[idx + 1] ?? null;
  // alone on the road (a time trial): the skill losses are the whole story
  if (!foe || foe.finishTime === null) {
    const best = skillReasons.sort((a, b) => b[0] - a[0])[0];
    return {
      headline: `${me.finishTime.toFixed(2)} s`, reasons: skillReasons.map((r) => r[1]),
      suggestion: best ? (best[1].startsWith('Shift') ? { text: `Clean shifts are worth ${sec(shift)} on this course: tap SHIFT the moment the light turns green.`, action: { kind: 'shift' } } : { text: `Perfect boosts are worth ${sec(boost)} here: fire nitro inside each boost zone.`, action: { kind: 'boost' } })
        : { text: 'A clean run: only a stronger build goes faster now.', action: car ? buildAction(s, car, 'engine', partCap) : undefined },
      foe: null, margin: null, close: false,
    };
  }
  const margin = me.finishTime - foe.finishTime; // > 0: behind the foe
  // time lost to the foe on each kind of segment
  const zones: Record<Zone, number> = { launch: 0, bends: 0, straights: 0 };
  let pm = 0, pf = 0;
  track.segments.forEach((sg, i) => {
    const tm = me.splits[i], tf = foe.splits[i];
    if (tm === undefined || tf === undefined) return;
    const z: Zone = sg.type === 'launch' ? 'launch' : sg.radius ? 'bends' : 'straights';
    zones[z] += (tm - pm) - (tf - pf);
    pm = tm; pf = tf;
  });
  const dt = (r: Racer) => drivetrainFor(r.car);
  const statLine = (z: Zone): { mine: string; theirs: string; better: boolean } => {
    if (z === 'bends') return { mine: me.stats.grip.toFixed(2), theirs: foe.stats.grip.toFixed(2), better: foe.stats.grip > me.stats.grip * 1.005 };
    if (z === 'straights') {
      const a = mph(me.stats.top * dt(me).topScale), b = mph(foe.stats.top * dt(foe).topScale);
      return { mine: `${a} mph`, theirs: `${b} mph`, better: b > a };
    }
    const a = me.stats.accel * dt(me).accelScale, b = foe.stats.accel * dt(foe).accelScale;
    return { mine: a.toFixed(1), theirs: b.toFixed(1), better: b > a * 1.005 };
  };
  const label: Record<Zone, string> = {
    launch: 'off the line',
    bends: track.segments.some((x) => x.radius && x.radius <= 30) ? 'the hairpins' : track.segments.some((x) => x.type === 'hwbend') && !track.segments.some((x) => x.type === 'bend') ? 'the sweepers' : 'the bends',
    straights: track.segments.some((x) => x.type === 'highway') ? 'the straights' : 'the straights',
  };
  const statName: Record<Zone, string> = { launch: 'acceleration', bends: 'grip', straights: 'top speed' };
  const fn = first(foe.name);
  const zoneReasons: [number, string, Zone][] = [];
  for (const z of ['launch', 'bends', 'straights'] as Zone[]) {
    const lost = zones[z];
    if (Math.abs(lost) < 0.05) continue;
    const sl = statLine(z);
    const stat = z === 'straights' ? `${sl.mine} vs ${sl.theirs}` : `${statName[z]} ${sl.mine} vs ${fn}’s ${sl.theirs}`;
    zoneReasons.push([lost, lost > 0
      ? `Lost ${sec(lost)} ${z === 'launch' ? '' : 'in '}${label[z]}${sl.better ? `: ${stat}` : ''}`
      : `Gained ${sec(lost)} ${z === 'launch' ? '' : 'in '}${label[z]}${!sl.better ? `: ${stat}` : ''}`, z]);
  }
  const close = Math.abs(margin) < 0.3;
  const reasons = [...zoneReasons.map((r) => [Math.abs(r[0]), r[1]] as [number, string]), ...skillReasons].sort((a, b) => b[0] - a[0]).slice(0, 4).map((r) => r[1]);
  const headline = margin > 0
    ? `${close ? 'So close — ' : ''}${o.place === 1 ? '' : `${ordinal(o.place)}, `}${sec(margin)} behind ${foe.name}`
    : `Won by ${sec(margin)} over ${foe.name}${close ? ' — a close one' : ''}`;
  // the suggestion: the biggest leak the player can fix — a technique, or the part for the zone that lost most where
  // the foe really has the better stat
  const buildZone = zoneReasons.filter(([lost, , z]) => lost > 0.05 && statLine(z).better).sort((a, b) => b[0] - a[0])[0];
  const buildLost = buildZone?.[0] ?? 0;
  let suggestion: FinishExplanation['suggestion'];
  if (lcMissed && margin > 0 && shift < 0.3 && boost < 0.3) {
    suggestion = { text: `Tap ⚡LAUNCH right on GO: launch control is worth about 0.3 s off the line${margin < 0.3 ? ` — enough to beat ${fn}` : ''}.`, action: { kind: 'launch' } };
  } else if (shift >= 0.1 && shift >= boost && shift >= buildLost * 0.8) {
    suggestion = { text: `Clean shifts alone are worth ${sec(shift)} here${margin > 0 && shift > margin ? ` — enough to beat ${fn}` : ''}: tap SHIFT the moment the light turns green${worst ? `, especially into ${GEARS[worst.into] ?? 'the next gear'}` : ''}.`, action: { kind: 'shift' } };
  } else if (boost >= 0.1 && boost >= buildLost * 0.8) {
    suggestion = { text: `Perfect boosts are worth ${sec(boost)} here${margin > 0 && boost > margin ? ` — enough to beat ${fn}` : ''}: fire nitro inside each boost zone.`, action: { kind: 'boost' } };
  } else if (buildZone && car) {
    const z = buildZone[2];
    const fam: Family = z === 'launch' ? (foe.stats.accel * dt(foe).accelScale > me.stats.accel * dt(me).accelScale ? 'turbo' : 'tires') : ZONE_FAMILY[z];
    const act = buildAction(s, car, fam, partCap);
    const where = `${fn} takes ${sec(buildZone[0])} out of you ${z === 'launch' ? 'off the line' : `in ${label[z]}`}`;
    if (act?.kind === 'fit' && s) {
      const up = bestOwnedUpgrade(s, car, fam, partCap);
      suggestion = { text: `Fit the ${up?.text ?? `better ${FAMILIES[fam].name}`}${up ? ` (${up.gain})` : ''} — ${where}.`, action: act };
    } else if (act?.kind === 'upgrade') suggestion = { text: `A T${act.tier} ${FAMILIES[fam].name} is the most this car runs here — merge or order one: ${where}.`, action: act };
    else if (act?.kind === 'tune') suggestion = { text: `Your ${FAMILIES[fam].name} is maxed; a Tune-up stage adds a little everywhere — ${where}.`, action: act };
    else suggestion = { text: `${where}; your build is maxed for this course, so a car that suits it (or Perfect boosts on the exits) is the way through.` };
  } else if (margin <= 0) suggestion = { text: close ? `Defend it next time: ${skillReasons.length ? 'clean shifts and Perfect boosts' : 'the same clean run'} keep ${fn} behind.` : 'A clean, quick run — try a harder event.' };
  else suggestion = { text: `${fn} is simply quicker on this course right now; a stronger build or a car that suits it closes the gap.`, action: car ? buildAction(s, car, 'engine', partCap) : undefined };
  return { headline, reasons, suggestion, foe: foe.name, margin, close };
}

/** The build step for a family: fit a better owned part, else reach the car's cap, else a Tune-up stage. */
function buildAction(s: GameState | undefined, car: CarId, family: Family, partCap?: number): FinishAction | undefined {
  if (!s) return { kind: 'upgrade', family, tier: Math.min(carById(car).cap, partCap ?? 99), car };
  if (bestOwnedUpgrade(s, car, family, partCap)) return { kind: 'fit', family, car };
  const cap = Math.min(carById(car).cap, partCap ?? 99);
  const have = fitted(s, car)[family];
  if (!have || have.t < cap) return { kind: 'upgrade', family, tier: cap, car };
  if (!partCap && (s.tune?.[car] ?? 0) < 3) return { kind: 'tune', car };
  return undefined;
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
