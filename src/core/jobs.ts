// Job Board rules: generation (deterministic per seed), progress and completion, pay (once, in the same transaction
// as the action that finished the job), timed refills that respect the save's clock (rollback clamped, one job per
// slot so reloads and time away never stack), the streak, and Garage Level rewards (granted once per level).
// Every function that changes state runs inside Game.transact. Owned by the New mechanic workstream.
import {
  DELIVER_POLISHED, DELIVER_SHARE, JOBS_UNLOCK_RACES, JOB_PAY, JOB_PAY_MIN, JOB_REFILL_FAST_S, JOB_REFILL_S, JOB_SKIP_S,
  JOB_SLOTS, JOB_SLOTS_MAX, JOB_WEIGHT, JobKind, LevelReward, STREAK_IDLE_S, STREAK_MAX_BONUS, STREAK_STEP, levelReward, xpFor,
} from '../data/jobs';
import {
  ACTIVE_FAMILIES, ACTIVE_IDLE_CUTOFF_MS, CarId, EVENTS, FAMILIES, Family, PART_ORDER_PRICE, RaceEvent, STYLE_ITEMS, carById, eventById, roundCash,
} from '../data/tables';
import { allParts, firstFree, getPart, setPart } from './board';
import type { GameEvent, SlotRef } from './events';
import { eventUnlocked, goalStatus, stagePurse } from './progression';
import type { RaceOutcome } from './race';
import { makeRng } from './rng';
import type { GameState, Part } from './state';

export interface Job {
  id: number;
  kind: JobKind;
  /** counters: merges, clean shifts, Perfect boosts; binary jobs need 1 */
  need: number;
  progress: number;
  cash: number;
  xp: number;
  /** deliver: the part asked for */
  family?: Family;
  tier?: number;
  polished?: boolean;
  /** win: the condition */
  cond?: 'clean' | 'perfect' | 'event';
  event?: string;
  /** classic: the older car to bring */
  car?: CarId;
}

export interface JobLog { id: number; title: string; cash: number; xp: number; streak: number; raceId?: number }

export interface JobsState {
  seed: number;
  slots: (Job | null)[];
  /** per slot: when an empty slot refills (ms, the save's clock) */
  readyAt: number[];
  xp: number;
  /** Garage Level reached (its reward is granted in the same transaction) */
  level: number;
  streak: number;
  bestStreak: number;
  /** active seconds with an open job since the last clear (time away never counts) */
  idleS: number;
  done: number;
  /** clock high-water mark: a clock set back never makes a refill wait longer than a full refill */
  lastAt: number;
  nextId: number;
  /** the last few clears, newest first (the result card and the board read this) */
  log: JobLog[];
  /** rewards from levels reached (slot, refill) */
  perks: string[];
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const KINDS: JobKind[] = ['merge', 'deliver', 'win', 'shifts', 'perfects', 'classic'];

/** Test hook: the balance test measures the ladder with the board switched off and on. */
export const jobsSwitch = { off: false };
export const jobsUnlocked = (s: GameState) => !jobsSwitch.off && (s.stats.races >= JOBS_UNLOCK_RACES || s.owned.length > 1);
export const slotCount = (j: JobsState) => (j.perks.includes('slot') ? JOB_SLOTS_MAX : JOB_SLOTS);
export const refillS = (j: JobsState) => (j.perks.includes('refill') ? JOB_REFILL_FAST_S : JOB_REFILL_S);
export const streakBonus = (streak: number) => Math.min(STREAK_MAX_BONUS, Math.max(0, streak) * STREAK_STEP);
/** What a job pays if cleared now: its price with the streak bonus, on a cash step. */
export const payNow = (job: Pick<Job, 'cash'>, streak: number) => roundCash(job.cash * (1 + streakBonus(streak)));

function cleanJob(x: unknown): Job | null {
  if (!x || typeof x !== 'object') return null;
  const j = x as Job;
  if (!isNum(j.id) || !KINDS.includes(j.kind) || !isNum(j.need) || !isNum(j.progress) || !isNum(j.cash) || !isNum(j.xp)) return null;
  if (j.kind === 'deliver' && (!j.family || !ACTIVE_FAMILIES.includes(j.family) || !isNum(j.tier))) return null;
  if (j.kind === 'classic' && (!j.car || !CARS_OK(j.car))) return null;
  if (j.kind === 'win' && j.cond === 'event' && (!j.event || !EVENTS.some((e) => e.id === j.event))) return null;
  return { ...j };
}
const CARS_OK = (c: string) => { try { carById(c as CarId); return true; } catch { return false; } };

/** The board, repaired and defaulted (a save from before the Job Board, or a damaged field, reads as a fresh one).
 *  A copy: safe to call from the UI. */
export function readJobs(s: GameState): JobsState {
  const raw = s.jobs as Partial<JobsState> | undefined;
  const j: JobsState = {
    seed: isNum(raw?.seed) ? raw!.seed >>> 0 : ((s.createdAt ^ 0x10b5) >>> 0),
    slots: Array.isArray(raw?.slots) ? raw!.slots.map(cleanJob) : [],
    readyAt: Array.isArray(raw?.readyAt) ? raw!.readyAt.map((t) => (isNum(t) ? t : 0)) : [],
    xp: isNum(raw?.xp) ? Math.max(0, raw!.xp) : 0,
    level: isNum(raw?.level) ? Math.max(1, Math.floor(raw!.level)) : 1,
    streak: isNum(raw?.streak) ? Math.max(0, Math.floor(raw!.streak)) : 0,
    bestStreak: isNum(raw?.bestStreak) ? raw!.bestStreak : 0,
    idleS: isNum(raw?.idleS) ? Math.max(0, raw!.idleS) : 0,
    done: isNum(raw?.done) ? raw!.done : 0,
    lastAt: isNum(raw?.lastAt) ? raw!.lastAt : 0,
    nextId: isNum(raw?.nextId) ? raw!.nextId : 1,
    log: Array.isArray(raw?.log) ? raw!.log.filter((l) => l && isNum(l.id) && typeof l.title === 'string').slice(0, 6) : [],
    perks: Array.isArray(raw?.perks) ? raw!.perks.filter((p) => typeof p === 'string') : [],
  };
  const n = slotCount(j);
  while (j.slots.length < n) j.slots.push(null);
  j.slots.length = n;
  while (j.readyAt.length < n) j.readyAt.push(0);
  j.readyAt.length = n;
  for (const job of j.slots) if (job && job.id >= j.nextId) j.nextId = job.id + 1;
  return j;
}

/** The board for a rule inside a transaction: the cleaned record is attached to the draft so changes stick. */
export function jobsOf(s: GameState): JobsState {
  const clean = readJobs(s);
  if (s.jobs && typeof s.jobs === 'object' && !Array.isArray(s.jobs)) return Object.assign(s.jobs, clean); // same object: references stay live
  return (s.jobs = clean);
}

// ---------------- Text ----------------

export function jobTitle(job: Job): string {
  switch (job.kind) {
    case 'merge': return `Merge ${job.need} parts`;
    case 'deliver': return `Deliver a${job.polished ? ' Polished' : ''} T${job.tier} ${FAMILIES[job.family!].name}`;
    case 'win':
      if (job.cond === 'event') return `Win ${eventById(job.event!).name}`;
      return job.cond === 'clean' ? 'Win a live race with no missed shift' : 'Win a live race with a Perfect boost';
    case 'shifts': return `Land ${job.need} clean shifts`;
    case 'perfects': return `Land ${job.need} Perfect boosts`;
    case 'classic': return `Top 3 in the ${carById(job.car!).model}`;
  }
}

/** One line on where the job gets done. */
export function jobHint(job: Job): string {
  switch (job.kind) {
    case 'merge': return 'Any merge on the bench counts, Merge All too.';
    case 'deliver': return `A spare from your bench or rack${job.polished ? ' (Polished or Mint)' : ''}; fitted and starred parts are never taken.`;
    case 'win': return job.cond === 'event' ? 'A live race, any car.' : 'Any live race, any car.';
    case 'shifts': return 'Shift on the green in live races and Rival Runs; adds up across races.';
    case 'perfects': return 'NITRO inside a boost zone, in live races and Rival Runs; adds up across races.';
    case 'classic': return `Any live race in the ${carById(job.car!).model}: an early track suits it.`;
  }
}

// ---------------- Generation (deterministic per seed) ----------------

const ordinary = (e: RaceEvent) => !e.heatOf && !e.knockout && !e.boss && !e.timeAttack && !e.speedTrap;
const bestCap = (s: GameState) => Math.max(...s.owned.map((c) => carById(c).cap));

/** Kinds possible at this stage (an older car to bring, a won race to repeat). */
function options(s: GameState, taken: Set<JobKind>): JobKind[] {
  const out: JobKind[] = [];
  for (const k of KINDS) {
    if (taken.has(k)) continue; // one of each kind on the board at a time: variety
    if (k === 'classic' && s.owned.filter((c) => carById(c).cap < bestCap(s)).length === 0) continue;
    out.push(k);
  }
  return out;
}

/**
 * Make one job from `seed` for this state (same state + seed → same job). Pay scales with the win purse of your
 * best open ordinary race, so it means the same at every stage, and stays a small share of what racing pays.
 */
export function makeJob(s: GameState, seed: number, id: number, taken: Set<JobKind> = new Set()): Job {
  const r = makeRng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];
  const kinds = options(s, taken);
  const total = kinds.reduce((a, k) => a + JOB_WEIGHT[k], 0);
  let roll = r() * total;
  let kind: JobKind = kinds[0] ?? 'merge';
  for (const k of kinds) { roll -= JOB_WEIGHT[k]; if (roll < 0) { kind = k; break; } }
  const purse = stagePurse(s).cash;
  const pay = (share: number) => roundCash(Math.max(JOB_PAY_MIN, purse * share));
  const cap = bestCap(s);
  switch (kind) {
    case 'merge': {
      const need = 4 + Math.floor(r() * 4);
      return { id, kind, need, progress: 0, cash: pay(JOB_PAY.merge), xp: 1 };
    }
    case 'deliver': {
      // never the family the next car's craft needs (that part is an ingredient, not a surplus)
      const g = goalStatus(s);
      const fams = ACTIVE_FAMILIES.filter((f) => !(g && !g.keystoneDone && f === g.family));
      const family = pick(fams.length ? fams : ACTIVE_FAMILIES);
      const lo = Math.max(2, cap - 2);
      const hi = Math.max(lo, Math.min(cap - 1, PART_ORDER_PRICE.length - 1));
      const tier = lo + Math.floor(r() * (hi - lo + 1));
      const polished = cap >= 4 && r() < 0.3;
      const cash = roundCash(Math.max(purse * JOB_PAY.deliver, JOB_PAY_MIN, PART_ORDER_PRICE[tier] * DELIVER_SHARE * (polished ? DELIVER_POLISHED : 1)));
      return { id, kind, need: 1, progress: 0, cash, xp: polished ? 2 : 1, family, tier, polished };
    }
    case 'win': {
      const won = EVENTS.filter((e) => ordinary(e) && !e.carOnly && (s.events[e.id]?.wins ?? 0) > 0 && eventUnlocked(s, e).ok);
      const conds: Job['cond'][] = ['clean', 'perfect', ...(won.length ? ['event' as const] : [])];
      const cond = pick(conds);
      // a repeat of one of your three most recent wins up the ladder
      const event = cond === 'event' ? pick(won.slice(-3)).id : undefined;
      return { id, kind, need: 1, progress: 0, cash: pay(JOB_PAY.win), xp: 1, cond, ...(event ? { event } : {}) };
    }
    case 'shifts': {
      const need = 8 + 2 * Math.floor(r() * 4);
      return { id, kind, need, progress: 0, cash: pay(JOB_PAY.shifts), xp: 1 };
    }
    case 'perfects': {
      const need = 2 + Math.floor(r() * 3);
      return { id, kind, need, progress: 0, cash: pay(JOB_PAY.perfects), xp: 1 };
    }
    case 'classic': {
      const older = s.owned.filter((c) => carById(c).cap < cap);
      return { id, kind, need: 1, progress: 0, cash: pay(JOB_PAY.classic), xp: 2, car: pick(older) };
    }
  }
}

/** Advance the board's seed (LCG) and make the next job for a slot. */
function nextJob(s: GameState, j: JobsState, slot: number): Job {
  j.seed = (Math.imul(j.seed, 1664525) + 1013904223) >>> 0;
  const taken = new Set(j.slots.filter((x, i) => x && i !== slot).map((x) => x!.kind));
  return makeJob(s, j.seed, j.nextId++, taken);
}

// ---------------- Time: refills and the streak ----------------

/**
 * Bring the board up to `now`: fill every empty slot whose refill time has come (one job per slot, so a long time
 * away, a reload or a second tab never stacks jobs), and clamp refill times when the clock went backwards so a
 * slot never waits longer than one refill. Returns how many jobs arrived.
 */
export function settleJobs(s: GameState, now: number, events: GameEvent[]): number {
  if (!jobsUnlocked(s)) return 0;
  const j = jobsOf(s);
  const first = j.lastAt === 0 && j.slots.every((x) => !x) && j.done === 0;
  const span = refillS(j) * 1000;
  let added = 0;
  for (let i = 0; i < j.slots.length; i++) {
    if (j.slots[i]) continue;
    j.readyAt[i] = Math.min(j.readyAt[i], now + span); // clock rollback: never longer than one refill
    if (first || now >= j.readyAt[i]) {
      j.slots[i] = nextJob(s, j, i);
      j.readyAt[i] = 0;
      added++;
    }
  }
  j.lastAt = Math.max(j.lastAt, now);
  if (added) events.push({ type: 'jobNew', count: added, first });
  return added;
}

/** Each visible second: refills, and the streak easing down after long active play without a clear. */
export function tickJobs(s: GameState, dtS: number, now: number, lastInputAt: number, events: GameEvent[]) {
  if (!jobsUnlocked(s)) return;
  const active = now - lastInputAt < ACTIVE_IDLE_CUTOFF_MS;
  const j = jobsOf(s);
  settleJobs(s, now, events);
  const open = j.slots.some(Boolean);
  if (active && open && j.streak > 0) {
    j.idleS += Math.max(0, Math.min(dtS, 1));
    if (j.idleS >= STREAK_IDLE_S) { j.streak--; j.idleS = 0; events.push({ type: 'jobStreak', streak: j.streak }); }
  }
}

/** Seconds until slot `i` refills (0 when it holds a job). */
export function refillIn(s: GameState, i: number, now: number): number {
  const j = readJobs(s);
  if (j.slots[i]) return 0;
  return Math.max(0, Math.ceil((j.readyAt[i] - now) / 1000));
}

// ---------------- Completion ----------------

/** Garage Level from total XP, and the XP span of the current level. */
export function levelInfo(s: GameState) {
  const j = readJobs(s);
  const lvl = j.level;
  const from = xpFor(lvl);
  const to = xpFor(lvl + 1);
  return { level: lvl, xp: j.xp, from, to, frac: Math.max(0, Math.min(1, (j.xp - from) / Math.max(1, to - from))), next: levelReward(lvl + 1), nextLevel: lvl + 1 };
}

function finish(s: GameState, j: JobsState, slot: number, now: number, events: GameEvent[], raceId?: number) {
  const job = j.slots[slot]!;
  const cash = payNow(job, j.streak);
  s.cash += cash;
  s.stats.earned = (s.stats.earned ?? 0) + cash;
  j.streak++;
  j.bestStreak = Math.max(j.bestStreak, j.streak);
  j.idleS = 0;
  j.done++;
  j.xp += job.xp;
  j.slots[slot] = null;
  j.readyAt[slot] = now + refillS(j) * 1000;
  const title = jobTitle(job);
  j.log = [{ id: job.id, title, cash, xp: job.xp, streak: j.streak, ...(raceId !== undefined ? { raceId } : {}) }, ...j.log].slice(0, 6);
  events.push({ type: 'job', id: job.id, title, cash, xp: job.xp, streak: j.streak });
  while (j.xp >= xpFor(j.level + 1)) {
    j.level++;
    const text = grantLevel(s, j, j.level, events);
    events.push({ type: 'garageLevel', level: j.level, reward: text });
  }
}

/** Apply progress to every open job of a kind; finished jobs pay at once. */
function progress(s: GameState, now: number, events: GameEvent[], test: (job: Job) => number, raceId?: number) {
  if (!jobsUnlocked(s)) return;
  const j = jobsOf(s);
  for (let i = 0; i < j.slots.length; i++) {
    const job = j.slots[i];
    if (!job) continue;
    const add = test(job);
    if (add <= 0) continue;
    job.progress = Math.min(job.need, job.progress + add);
    if (job.progress >= job.need) finish(s, j, i, now, events, raceId);
  }
  settleJobs(s, now, events); // a slot a level just added fills at once
}

/** Merges (manual or Merge All). */
export function onMerges(s: GameState, n: number, now: number, events: GameEvent[]) {
  if (n > 0) progress(s, now, events, (job) => (job.kind === 'merge' ? n : 0));
}

export interface RaceSummary { raceId: number; place: number; perfects: number; clean: number; missed: number; eventId: string; car: CarId; rivalRun?: boolean }

/** What a job needs from a finished race (missed shifts come from the full outcome's shift log). */
export function raceSummary(raceId: number, o: RaceOutcome, car: CarId, eventId: string, rivalRun = false): RaceSummary {
  const log = o.shiftLog ?? [];
  return {
    raceId, place: o.place, perfects: o.perfects ?? 0, eventId, car, rivalRun,
    clean: o.shiftsClean ?? log.filter((x) => x.grade === 'clean').length,
    missed: log.filter((x) => x.grade === 'missed').length,
  };
}

/** A committed live race (or Rival Run: shifts and Perfect boosts only). Runs in the race's commit transaction,
 *  which is single-use per race id, so a job can never pay twice for one race. */
export function onRace(s: GameState, r: RaceSummary, now: number, events: GameEvent[]) {
  progress(s, now, events, (job) => {
    if (job.kind === 'shifts') return r.clean;
    if (job.kind === 'perfects') return r.perfects;
    if (r.rivalRun) return 0;
    if (job.kind === 'win' && r.place === 1) {
      if (job.cond === 'clean') return r.missed === 0 ? 1 : 0;
      if (job.cond === 'perfect') return r.perfects > 0 ? 1 : 0;
      if (job.cond === 'event') return r.eventId === job.event ? 1 : 0;
    }
    if (job.kind === 'classic') return r.car === job.car && r.place <= 3 ? 1 : 0;
    return 0;
  }, r.raceId);
  settleJobs(s, now, events); // the race that opens the board (the third finish) fills it at once
}

/** Parts on the bench or rack that a delivery job accepts, best match first (exact tier, plain before Polished). */
export function deliverables(s: GameState, job: Job): { ref: SlotRef; part: Part }[] {
  if (job.kind !== 'deliver') return [];
  const fav = new Set(s.favorites ?? []);
  const out: { ref: SlotRef; part: Part }[] = [];
  s.board.forEach((p, i) => p && out.push({ ref: { zone: 'board', i }, part: p }));
  s.tray.forEach((p, i) => p && out.push({ ref: { zone: 'tray', i }, part: p }));
  const qv = (p: Part) => (p.q === 'std' ? 0 : p.q === 'polished' ? 1 : 2);
  return out
    .filter(({ part }) => part.f === job.family && part.t === job.tier && !fav.has(part.id) && (!job.polished || part.q !== 'std'))
    .sort((a, b) => qv(a.part) - qv(b.part));
}

/** A matching part held but starred (so it is not offered). */
export const starredMatch = (s: GameState, job: Job) => job.kind === 'deliver' && allParts(s).some((p) => p.f === job.family && p.t === job.tier
  && (s.favorites ?? []).includes(p.id) && (!job.polished || p.q !== 'std'));

/** Hand in a part for a delivery job (the best match, or the given part id). Exactly once: the slot must still hold
 *  this job id, so a second tap or a stale tab finds nothing to pay. */
export function deliverJob(s: GameState, jobId: number, now: number, partId?: number): GameEvent[] {
  if (!jobsUnlocked(s)) return [{ type: 'invalid', reason: 'The Job Board opens after a few races' }];
  const j = jobsOf(s);
  const slot = j.slots.findIndex((x) => x?.id === jobId);
  if (slot < 0) return [{ type: 'invalid', reason: 'That job is already done' }];
  const job = j.slots[slot]!;
  if (job.kind !== 'deliver') return [{ type: 'invalid', reason: 'Not a delivery job' }];
  const list = deliverables(s, job);
  const m = partId !== undefined ? list.find((x) => x.part.id === partId) : list[0];
  if (!m) return [{ type: 'invalid', reason: starredMatch(s, job) ? 'Your matching part is starred: unstar it to deliver it' : `No spare ${jobTitle(job).replace('Deliver a', '').trim()} on your bench` }];
  setPart(s, m.ref, null);
  const events: GameEvent[] = [{ type: 'jobDeliver', id: job.id, at: m.ref, family: m.part.f, tier: m.part.t }];
  job.progress = 1;
  finish(s, j, slot, now, events);
  settleJobs(s, now, events);
  return events;
}

/** Skip a job: the slot refills after a short wait; the streak and everything earned stay. */
export function skipJob(s: GameState, jobId: number, now: number): GameEvent[] {
  const j = jobsOf(s);
  const slot = j.slots.findIndex((x) => x?.id === jobId);
  if (slot < 0) return [{ type: 'invalid', reason: 'That job is already gone' }];
  j.slots[slot] = null;
  j.readyAt[slot] = now + JOB_SKIP_S * 1000;
  return [{ type: 'jobSkip', id: jobId }];
}

// ---------------- Garage Level rewards ----------------

const pickStyle = (s: GameState, kind: 'livery' | 'wheel' | 'paint') =>
  STYLE_ITEMS.filter((i) => i.kind === kind && !(s.owns ?? []).includes(i.id) && !i.blurb.includes('Earned')).sort((a, b) => a.price - b.price)[0];

/** What a level gives, in words (the board shows the next one before you reach it). */
export function rewardText(s: GameState, r: LevelReward): string {
  switch (r.kind) {
    case 'crates': return `${r.crates} crates and ${r.scrap} scrap`;
    case 'slot': return 'A 4th job slot';
    case 'refill': return `Quicker refills (${JOB_REFILL_S / 60} → ${JOB_REFILL_FAST_S / 60} min)`;
    case 'style': { const it = pickStyle(s, r.style); return it ? `${it.name} ${r.style === 'livery' ? 'livery' : r.style === 'wheel' ? 'wheels' : 'paint'} (free)` : `${r.style === 'paint' ? 'A paint' : r.style === 'wheel' ? 'A wheel set' : 'A livery'} — or 3 crates if you own them all`; }
    case 'badge': return `“${r.badge}” badge and ${r.crates} crates`;
    case 'part': { const p = rewardPart(s); return `A Polished T${p.tier} ${FAMILIES[p.family].name}`; }
  }
}

/** The rare part: Polished, one tier under your best car's limit, never the family the next car's craft needs
 *  (so it can't stand in for the craft), the family your car is weakest in. */
export function rewardPart(s: GameState): { family: Family; tier: number } {
  const g = goalStatus(s);
  const tier = Math.max(2, Math.min(bestCap(s) - 1, PART_ORDER_PRICE.length - 1));
  const fit = s.installed?.[s.activeCar] ?? {};
  const fams = ACTIVE_FAMILIES.filter((f) => !(g && !g.keystoneDone && f === g.family));
  const family = fams.sort((a, b) => (fit[a]?.t ?? 0) - (fit[b]?.t ?? 0))[0] ?? 'engine';
  return { family, tier };
}

function grantLevel(s: GameState, j: JobsState, level: number, events: GameEvent[]): string {
  const r = levelReward(level);
  const text = rewardText(s, r);
  const crates = (n: number) => { for (let k = 0; k < n; k++) s.crates.push({ kind: 'std', source: 'shop' }); };
  switch (r.kind) {
    case 'crates': crates(r.crates); s.scrap += r.scrap; break;
    case 'slot':
      if (!j.perks.includes('slot')) { j.perks.push('slot'); j.slots.push(null); j.readyAt.push(0); } // fills on the next settle
      break;
    case 'refill': if (!j.perks.includes('refill')) j.perks.push('refill'); break;
    case 'style': {
      const it = pickStyle(s, r.style);
      if (it) (s.owns ??= []).push(it.id); else crates(3);
      break;
    }
    case 'badge': if (!s.badges.includes(r.badge)) s.badges.push(r.badge); crates(r.crates); break;
    case 'part': {
      const p = rewardPart(s);
      const at = firstFree(s);
      if (at) {
        const part: Part = { id: s.nextPartId++, f: p.family, t: p.tier, q: 'polished' };
        setPart(s, at, part);
        events.push({ type: 'place', at, family: p.family, tier: p.tier, source: 'job' });
      } else s.crates.push({ kind: 'targeted', family: p.family, tier: p.tier, source: 'shop' }); // full bench: waits as a crate
      break;
    }
  }
  return text;
}

/** The part a delivery job would take (for the board's preview), or null. */
export const deliverPreview = (s: GameState, job: Job): Part | null => deliverables(s, job)[0]?.part ?? null;
export { getPart };
