// Job Board rules (New mechanic): unlock timing, deterministic generation, completion and pay-once, timed refills
// (away, reloads, clock rollback, no stacking), the streak, Garage Level rewards, and persistence / old saves.
import { describe, expect, it } from 'vitest';
import { JOB_REFILL_S, JOB_SKIP_S, JOB_SLOTS, STREAK_IDLE_S, xpFor } from '../src/data/jobs';
import { Game } from '../src/core/game';
import * as J from '../src/core/jobs';
import type { RaceOutcome } from '../src/core/race';
import { MemoryKV, decodeSave, encodeSave, saveKey } from '../src/core/save';
import { GameState, migrate, newGame } from '../src/core/state';
import { PART_ORDER_PRICE, onCashStep } from '../src/data/tables';
import { emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

/** A state that has opened the board (three races finished). */
function opened(seed = 7): GameState {
  const s = emptyGame(seed);
  s.createdAt = T0;
  s.stats.races = 3;
  s.events['yard-sprint'] = { wins: 2, starts: 3, bestPlace: 1, bestTime: 20 };
  return s;
}

function fakeOutcome(o: { place?: number; perfects?: number; clean?: number; missed?: number }): RaceOutcome {
  const clean = o.clean ?? 0, missed = o.missed ?? 0;
  const shiftLog = [...Array(clean).fill('clean'), ...Array(missed).fill('missed')].map((grade, i) => ({ t: i, into: i + 2, grade, rpm: 6000, cost: 0 }));
  return {
    place: o.place ?? 1, playerTime: 20, gapText: '', perfects: o.perfects ?? 0, nitroUsed: 0, nitroLeft: 0, cutoff: false, advice: null,
    standings: [{ name: 'You', finishTime: 20, isPlayer: true }], shifts: clean + missed, shiftsClean: clean, shiftLog,
  } as unknown as RaceOutcome;
}

/** A game on a fresh save that has opened the board, with a chosen job in slot 0. */
function gameWith(job: Partial<J.Job>, now = T0) {
  const kv = new MemoryKV();
  const s = opened();
  J.settleJobs(s, now, []);
  const j = J.jobsOf(s);
  j.slots[0] = { id: 900, kind: 'merge', need: 1, progress: 0, cash: 50, xp: 1, ...job } as J.Job;
  j.slots[1] = null; j.slots[2] = null; // only this job is open
  j.readyAt = [0, now + 3600_000, now + 3600_000];
  const g = new Game(kv, '/t/', now, s);
  return { g, kv };
}

describe('Job Board: unlock and generation', () => {
  it('stays closed until the third race finish, then opens with three jobs in the same commit', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    expect(J.jobsUnlocked(g.state)).toBe(false);
    for (let k = 0; k < 3; k++) {
      expect(g.state.jobs?.slots.some(Boolean) ?? false).toBe(false);
      g.startRace('yard-sprint', T0 + k * MIN);
      g.commitRace(g.pendingRaceId!, fakeOutcome({ place: 2 }), T0 + k * MIN + 30_000);
    }
    expect(J.jobsUnlocked(g.state)).toBe(true);
    expect(J.readJobs(g.state).slots.filter(Boolean)).toHaveLength(JOB_SLOTS);
  });

  it('is deterministic per seed, varied across seeds, and prices jobs on cash steps', () => {
    const s = opened();
    s.owned = ['junker', 'beater', 'hothatch', 'muscle'];
    s.crafted = ['tires:3', 'turbo:4', 'engine:5'];
    const kinds = new Set<string>();
    for (let seed = 1; seed < 400; seed++) {
      const a = J.makeJob(s, seed, 1), b = J.makeJob(s, seed, 1);
      expect(a).toEqual(b);
      kinds.add(a.kind);
      expect(onCashStep(a.cash)).toBe(true);
      expect(a.cash).toBeGreaterThan(0);
      if (a.kind === 'deliver') {
        expect(a.cash).toBeLessThan(PART_ORDER_PRICE[a.tier!] * (a.polished ? 1 : 1) + 1); // never worth buying to hand in
        expect(a.tier).toBeLessThan(5); // under the best car's limit (Ironhorse: T5)
      }
      if (a.kind === 'classic') expect(['junker', 'beater', 'hothatch']).toContain(a.car);
    }
    expect([...kinds].sort()).toEqual(['classic', 'deliver', 'merge', 'perfects', 'shifts', 'win']);
  });

  it('never asks for the family the next car must be crafted from, and keeps one of each kind on the board', () => {
    const s = opened();
    s.owned = ['junker', 'beater']; // next car: Vexa GTi, needs a crafted T4 Turbo
    for (let seed = 1; seed < 300; seed++) {
      const job = J.makeJob(s, seed, 1);
      if (job.kind === 'deliver') expect(job.family).not.toBe('turbo');
    }
    for (let k = 0; k < 20; k++) {
      const t = opened(k + 1);
      J.settleJobs(t, T0, []);
      const ks = J.readJobs(t).slots.map((x) => x!.kind);
      expect(new Set(ks).size).toBe(ks.length);
    }
  });
});

describe('Job Board: completion pays once', () => {
  it('a merge job completes on real merges and pays at once', () => {
    const { g } = gameWith({ kind: 'merge', need: 2, cash: 50 });
    put(g.state, 0, 0, 'engine', 1); put(g.state, 0, 1, 'engine', 1);
    put(g.state, 1, 0, 'tires', 1); put(g.state, 1, 1, 'tires', 1);
    const cash = g.state.cash;
    g.move({ zone: 'board', i: 0 }, { zone: 'board', i: 1 }, T0 + 1000);
    expect(J.readJobs(g.state).slots[0]?.progress).toBe(1);
    const ev = g.move({ zone: 'board', i: g.state.cols }, { zone: 'board', i: g.state.cols + 1 }, T0 + 2000);
    expect(ev.some((e) => e.type === 'job')).toBe(true);
    const j = J.readJobs(g.state);
    expect(j.slots[0]).toBeNull();
    expect(j.done).toBe(1);
    expect(j.streak).toBe(1);
    expect(g.state.cash - cash).toBe(50 + 2 * 5); // the job plus each merge's own $5
    expect(j.readyAt[0]).toBe(T0 + 2000 + JOB_REFILL_S * 1000);
  });

  it('a race job pays in the race commit, and a repeated commit of the same race pays nothing', () => {
    const { g } = gameWith({ kind: 'win', cond: 'clean', need: 1, cash: 60 });
    g.startRace('yard-sprint', T0);
    const id = g.pendingRaceId!;
    const before = g.state.cash;
    g.commitRace(id, fakeOutcome({ place: 1, clean: 4, missed: 1 }), T0 + 30_000);
    expect(J.readJobs(g.state).slots[0]).not.toBeNull(); // a missed shift: not this job
    g.startRace('yard-sprint', T0 + MIN);
    const id2 = g.pendingRaceId!;
    g.commitRace(id2, fakeOutcome({ place: 1, clean: 5 }), T0 + 90_000);
    const paid = J.readJobs(g.state).log[0];
    expect(paid.cash).toBe(roundStreak(60, 0));
    expect(paid.raceId).toBe(id2);
    const cash = g.state.cash;
    g.commitRace(id2, fakeOutcome({ place: 1, clean: 5 }), T0 + 91_000); // a double tap / replay
    expect(g.state.cash).toBe(cash);
    expect(J.readJobs(g.state).done).toBe(1);
    expect(cash).toBeGreaterThan(before);
  });

  it('counts clean shifts and Perfect boosts across races; an older car job needs that car', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    s.owned = ['junker', 'beater'];
    j.slots = [
      { id: 1, kind: 'shifts', need: 8, progress: 0, cash: 40, xp: 1 },
      { id: 2, kind: 'perfects', need: 2, progress: 0, cash: 40, xp: 1 },
      { id: 3, kind: 'classic', need: 1, progress: 0, cash: 50, xp: 2, car: 'junker' },
    ];
    const ev: never[] = [];
    J.onRace(s, { raceId: 1, place: 2, perfects: 1, clean: 5, missed: 0, eventId: 'yard-sprint', car: 'beater' }, T0, ev);
    expect(j.slots.map((x) => x?.progress)).toEqual([5, 1, 0]);
    J.onRace(s, { raceId: 2, place: 3, perfects: 1, clean: 3, missed: 2, eventId: 'yard-sprint', car: 'junker' }, T0, ev);
    expect(J.readJobs(s).slots.every((x) => x === null)).toBe(true);
    expect(J.readJobs(s).done).toBe(3);
  });

  it('a Rival Run counts shifts and Perfects, never a win or car job', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    j.slots = [{ id: 1, kind: 'win', cond: 'perfect', need: 1, progress: 0, cash: 40, xp: 1 }, { id: 2, kind: 'perfects', need: 1, progress: 0, cash: 40, xp: 1 }, null];
    J.onRace(s, { raceId: 1, place: 1, perfects: 1, clean: 5, missed: 0, eventId: 'yard-sprint', car: 'junker', rivalRun: true }, T0, []);
    expect(J.readJobs(s).slots[0]?.id).toBe(1);
    expect(J.readJobs(s).slots[1]).toBeNull();
  });

  it('a delivery takes a matching spare once, never a fitted or starred part', () => {
    const { g } = gameWith({ kind: 'deliver', family: 'engine', tier: 2, need: 1, cash: 45 });
    const starred = put(g.state, 0, 0, 'engine', 2);
    g.state.favorites = [starred.id];
    g.state.installed.junker = { engine: { id: g.state.nextPartId++, f: 'engine', t: 2, q: 'std' } };
    expect(g.deliverJob(900, undefined, T0 + 1000)[0]).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/starred/) });
    const spare = put(g.state, 2, 2, 'engine', 2);
    const cash = g.state.cash;
    const ev = g.deliverJob(900, undefined, T0 + 2000);
    expect(ev.some((e) => e.type === 'jobDeliver')).toBe(true);
    expect(g.state.cash - cash).toBe(45);
    expect(g.state.board.some((p) => p?.id === spare.id)).toBe(false);
    expect(g.state.board.some((p) => p?.id === starred.id)).toBe(true);
    expect(g.state.installed.junker?.engine).toBeTruthy();
    // rapid second tap: the job is gone, nothing more is paid or taken
    put(g.state, 3, 3, 'engine', 2);
    expect(g.deliverJob(900, undefined, T0 + 2100)[0]).toMatchObject({ type: 'invalid' });
    expect(g.state.cash - cash).toBe(45);
  });

  it('a Polished delivery needs Polished or Mint', () => {
    const { g } = gameWith({ kind: 'deliver', family: 'tires', tier: 3, polished: true, need: 1, cash: 150, xp: 2 });
    put(g.state, 0, 0, 'tires', 3);
    expect(g.deliverJob(900, undefined, T0)[0].type).toBe('invalid');
    put(g.state, 0, 1, 'tires', 3, 'mint');
    expect(g.deliverJob(900, undefined, T0).some((e) => e.type === 'job')).toBe(true);
  });

  it('a stale second tab cannot pay a job again', () => {
    const { g, kv } = gameWith({ kind: 'deliver', family: 'engine', tier: 2, need: 1, cash: 45 });
    put(g.state, 0, 0, 'engine', 2);
    g.saveNow(T0);
    const other = new Game(kv, '/t/', T0 + 10);
    other.deliverJob(900, undefined, T0 + 20); // tab B pays and saves
    const paid = decodeSave(kv.getItem(saveKey('/t/'))!)!.cash;
    g.deliverJob(900, undefined, T0 + 30); // tab A (stale) tries the same job
    expect(g.conflict).toBe(true);
    expect(decodeSave(kv.getItem(saveKey('/t/'))!)!.cash).toBe(paid);
  });
});

const roundStreak = (cash: number, streak: number) => Math.round(cash * (1 + J.streakBonus(streak)));

describe('Job Board: refills', () => {
  it('refills a slot after the timer while playing, never before', () => {
    const { g } = gameWith({ kind: 'merge', need: 1, cash: 30 });
    put(g.state, 0, 0, 'engine', 1); put(g.state, 0, 1, 'engine', 1);
    g.move({ zone: 'board', i: 0 }, { zone: 'board', i: 1 }, T0);
    g.tick(1, T0 + JOB_REFILL_S * 1000 - 1000);
    expect(J.readJobs(g.state).slots[0]).toBeNull();
    expect(J.refillIn(g.state, 0, T0 + JOB_REFILL_S * 1000 - 1000)).toBe(1);
    g.tick(1, T0 + JOB_REFILL_S * 1000);
    expect(J.readJobs(g.state).slots[0]).not.toBeNull();
  });

  it('time away fills each empty slot once (bounded), and reloads never stack or reroll jobs', () => {
    const kv = new MemoryKV();
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    j.slots = [null, null, null];
    j.readyAt = [T0 + MIN, T0 + 2 * MIN, T0 + 3 * MIN];
    new Game(kv, '/t/', T0, s).saveNow(T0);
    const later = T0 + 24 * 3600_000;
    const g1 = new Game(kv, '/t/', later);
    const jobs1 = J.readJobs(g1.state).slots;
    expect(jobs1.filter(Boolean)).toHaveLength(3);
    const g2 = new Game(kv, '/t/', later + 5000); // reload
    expect(J.readJobs(g2.state).slots).toEqual(jobs1);
    const g3 = new Game(kv, '/t/', later + 48 * 3600_000); // away again, nothing to fill
    expect(J.readJobs(g3.state).slots).toEqual(jobs1);
  });

  it('a clock set backwards never makes a slot wait longer than one refill', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    j.slots[0] = null;
    j.readyAt[0] = T0 + JOB_REFILL_S * 1000;
    const back = T0 - 30 * 24 * 3600_000;
    J.settleJobs(s, back, []);
    expect(J.readJobs(s).readyAt[0]).toBe(back + JOB_REFILL_S * 1000);
    expect(J.readJobs(s).lastAt).toBe(T0); // the high-water mark is kept
    J.settleJobs(s, back + JOB_REFILL_S * 1000, []);
    expect(J.readJobs(s).slots[0]).not.toBeNull();
  });

  it('skip frees the slot after a short wait and keeps the streak', () => {
    const { g } = gameWith({ kind: 'merge', need: 9, cash: 30 });
    J.jobsOf(g.state).streak = 3;
    g.skipJob(900, T0);
    expect(J.readJobs(g.state).slots[0]).toBeNull();
    expect(J.readJobs(g.state).streak).toBe(3);
    expect(J.readJobs(g.state).readyAt[0]).toBe(T0 + JOB_SKIP_S * 1000);
    expect(g.skipJob(900, T0 + 1)[0].type).toBe('invalid');
  });
});

describe('Job Board: streak and Garage Level', () => {
  it('back-to-back clears raise pay up to +50%; it eases down one step only during active play', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    const pays: number[] = [];
    for (let k = 0; k < 8; k++) {
      j.slots[0] = { id: 100 + k, kind: 'merge', need: 1, progress: 0, cash: 100, xp: 1 };
      const ev: { type: string; cash?: number }[] = [];
      J.onMerges(s, 1, T0, ev as never);
      pays.push(ev.find((e) => e.type === 'job')!.cash!);
    }
    expect(pays).toEqual([100, 110, 120, 130, 140, 150, 150, 150]);
    expect(J.readJobs(s).streak).toBe(8);
    const cash = s.cash;
    // away (no input): the streak is paused
    for (let k = 0; k < STREAK_IDLE_S + 10; k++) J.tickJobs(s, 1, T0 + k * 1000, T0 - 3600_000, []);
    expect(J.readJobs(s).streak).toBe(8);
    // active play without a clear: one step down, never a wipe, nothing taken back
    for (let k = 0; k < STREAK_IDLE_S; k++) J.tickJobs(s, 1, T0 + k * 1000, T0 + k * 1000, []);
    expect(J.readJobs(s).streak).toBe(7);
    expect(s.cash).toBe(cash);
    expect(J.readJobs(s).bestStreak).toBe(8);
  });

  it('levels grant their reward once: crates and scrap at L2, a fourth slot at L3', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    const j = J.jobsOf(s);
    const clear = (xp: number) => { j.slots[0] = { id: j.nextId++, kind: 'merge', need: 1, progress: 0, cash: 30, xp }; const ev: never[] = []; J.onMerges(s, 1, T0, ev); return ev as { type: string; level?: number }[]; };
    clear(2);
    expect(J.levelInfo(s).level).toBe(1);
    const crates = s.crates.length, scrap = s.scrap;
    const ev = clear(1); // xp 3 = level 2
    expect(ev.filter((e) => e.type === 'garageLevel').map((e) => e.level)).toEqual([2]);
    expect(s.crates.length - crates).toBe(2);
    expect(s.scrap - scrap).toBe(20);
    clear(xpFor(3) - 3); // level 3: a fourth slot that fills on the next settle
    expect(J.readJobs(s).slots).toHaveLength(4);
    J.settleJobs(s, T0 + 1, []);
    expect(J.readJobs(s).slots.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(s.crates.length - crates).toBe(2); // L2 is never paid again
  });

  it('a rare part reward is Polished, under the best car limit and never the next craft family', () => {
    const s = opened();
    s.owned = ['junker', 'beater', 'hothatch']; // next: Ironhorse (crafted T5 Engine)
    const p = J.rewardPart(s);
    expect(p.tier).toBe(3);
    expect(p.family).not.toBe('engine');
    expect(J.rewardText(s, { kind: 'part' })).toMatch(/Polished T3/);
  });
});

describe('Job Board: saves', () => {
  it('an old save without a board loads and opens it; a damaged board is repaired', () => {
    const old = newGame(T0) as GameState;
    old.stats.races = 5;
    delete old.jobs;
    const kv = new MemoryKV();
    kv.setItem(saveKey('/t/'), encodeSave(old));
    const g = new Game(kv, '/t/', T0 + 1000);
    expect(J.readJobs(g.state).slots.filter(Boolean)).toHaveLength(3);
    const bad = { ...structuredClone(old), jobs: { slots: [{ kind: 'nope' }, 'x', null], xp: 'lots', readyAt: 'soon', level: -4 } };
    const m = migrate(JSON.parse(JSON.stringify(bad)))!;
    expect(m).not.toBeNull();
    const r = J.readJobs(m);
    expect(r.slots).toEqual([null, null, null]);
    expect(r.xp).toBe(0);
    expect(r.level).toBe(1);
    const arr = migrate(JSON.parse(JSON.stringify({ ...old, jobs: [1, 2] })))!;
    expect(arr.jobs).toBeUndefined();
  });

  it('round-trips through the save', () => {
    const s = opened();
    J.settleJobs(s, T0, []);
    J.jobsOf(s).xp = 9; J.jobsOf(s).level = 3; J.jobsOf(s).perks = ['slot'];
    const back = decodeSave(encodeSave(s))!;
    expect(J.readJobs(back)).toEqual(J.readJobs(s));
  });
});
