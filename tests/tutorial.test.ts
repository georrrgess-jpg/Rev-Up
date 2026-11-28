import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import { RaceSim } from '../src/core/race';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { newGame, type GameState } from '../src/core/state';
import { computeLoadout } from '../src/core/loadout';
import * as P from '../src/core/progression';
import { bestBuy, finishOnboard, fitChange, ingredients, measureParts, onboardActive, onboardFitPart, onboardStep, rescueCrate, tutorialStep } from '../src/core/tutorial';

const T0 = 1_700_000_000_000;
const at = (s: ReturnType<typeof newGame>, r: number, c: number) => ({ zone: 'board' as const, i: r * s.cols + c });

function race(g: Game, now: number) {
  const setup = g.startRace('yard-sprint', now)!;
  const sim = new RaceSim(setup);
  const out = sim.finish();
  return g.commitRace(g.pendingRaceId!, out, now + 25_000);
}

/** A returning player: the first session is behind them. */
const returning = (s: GameState) => { s.onboard = { step: 'done', done: true }; };

describe('Redline first session: merge → fit → test run → next car', () => {
  it('walks a fresh save step by step, each step resolved by play', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    expect(g.state.onboard).toEqual({ step: 'merge' });
    expect(onboardStep(g.state)).toBe('merge'); // the first action, no wall of text first
    expect(tutorialStep(g.state)).toBe('merge');
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    expect(onboardStep(g.state)).toBe('fit');
    const part = onboardFitPart(g.state)!;
    expect(part).toMatchObject({ f: 'engine', t: 2 }); // the part just made
    const ch = fitChange(g.state, 'junker', part)!;
    expect(ch.label).toBe('Top speed');
    expect(ch.up).toBe(true);
    expect(ch.to).not.toBe(ch.from);
    const loc = g.state.board.findIndex((p) => p?.id === part.id);
    g.installPart('junker', { zone: 'board', i: loc }, T0 + 1500);
    expect(onboardStep(g.state)).toBe('race');
    expect(tutorialStep(g.state)).toBe('race1');
    race(g, T0 + 5000);
    expect(onboardStep(g.state)).toBe('craft'); // the next step toward a car
    expect(tutorialStep(g.state)).toBe('craftGoal');
    // finish the craft: merge Tires up to the T3 the Corsa Rojo needs
    for (let k = 0; k < 12 && onboardStep(g.state) === 'craft'; k++) {
      const s = g.state;
      const refs = s.board.map((_, i) => ({ zone: 'board' as const, i }));
      const pair = refs.flatMap((a) => refs.map((b) => [a, b] as const)).find(([a, b]) => a.i < b.i && s.board[a.i]?.f === 'tires' && B.canFuse(s.board[a.i], s.board[b.i]));
      if (!pair) break;
      g.move(pair[0], pair[1], T0 + 40_000 + k * 1000);
    }
    expect(P.goalStatus(g.state)?.keystoneDone).toBe(true);
    expect(onboardStep(g.state)).toBeNull();
    g.transact((d) => { finishOnboard(d, T0 + 60_000); return []; }, T0 + 60_000);
    expect(g.state.onboard).toMatchObject({ step: 'done', done: true, at: T0 + 60_000 });
    expect(onboardActive(g.state)).toBe(false);
  });

  it('resumes where it left off after a reload, mid-step', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, '/t/', T0);
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    const again = new Game(kv, '/t/', T0 + 60_000);
    expect(onboardStep(again.state)).toBe('fit');
    again.fitRecommended('junker', T0 + 61_000);
    again.startRace('yard-sprint', T0 + 62_000); // closed the page mid-race
    const third = new Game(kv, '/t/', T0 + 120_000);
    expect(onboardStep(third.state)).toBe('race');
  });

  it('is safe out of order: racing first skips straight to the next car', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    race(g, T0 + 1000);
    expect(onboardStep(g.state)).toBe('craft');
  });

  it('skipping ends the guided run and is remembered; one-line tips still come later', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, '/t/', T0);
    g.transact((d) => { finishOnboard(d, T0 + 10, true); return []; }, T0 + 10);
    expect(g.state.onboard).toMatchObject({ skipped: true, done: true });
    expect(onboardStep(g.state)).toBeNull();
    expect(['merge', 'fit', 'race1', 'craftGoal']).not.toContain(tutorialStep(g.state)); // only one-line tips remain
    const again = new Game(kv, '/t/', T0 + 5000);
    expect(onboardActive(again.state)).toBe(false);
    // Skip tips (the older switch) turns every tip off, the first session included
    const h = new Game(new MemoryKV(), '/t2/', T0);
    h.markTip('skipGuide');
    expect(onboardActive(h.state)).toBe(false);
    expect(tutorialStep(h.state)).toBeNull();
  });

  it('old saves are never put through the first session (raced, or own a second car)', () => {
    for (const patch of [{ races: 1, owned: ['junker'] }, { races: 0, owned: ['junker', 'beater'] }, { races: 25, owned: ['junker', 'beater', 'hothatch'] }]) {
      const kv = new MemoryKV();
      const old = newGame(T0) as unknown as Record<string, unknown>;
      Object.assign(old, { owned: patch.owned, activeCar: 'junker', rep: 500, crafted: ['tires:3'], tips: {} });
      delete (old as { onboard?: unknown }).onboard;
      (old.stats as { races: number }).races = patch.races;
      kv.setItem(saveKey('/t/'), encodeSave(old as never));
      const g = new Game(kv, '/t/', T0);
      expect(g.state.onboard).toEqual({ step: 'done', done: true });
      expect(onboardStep(g.state)).toBeNull();
      expect(['merge', 'fit', 'race1', 'craftGoal', 'goal', 'goalCard']).not.toContain(tutorialStep(g.state));
    }
  });

  it('a malformed onboarding field is repaired on load, never fatal', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    old.onboard = { step: 42, done: 'yes' };
    kv.setItem(saveKey('/t/'), encodeSave(old as never));
    const g = new Game(kv, '/t/', T0);
    expect(g.state.onboard?.step).toBe('merge');
  });

  it('measures what a fitted part did on the exact race (same seed, with and without it)', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    g.installPart('junker', at(g.state, 2, 2), T0 + 1500);
    const setup = g.startRace('yard-sprint', T0 + 2000)!;
    const gains = measureParts(g.state, setup);
    expect(gains.length).toBe(1);
    expect(gains[0].part.f).toBe('engine');
    expect(gains[0].seconds).toBeGreaterThan(0.05);
    expect(['off the line', 'on the straights', 'through the bends']).toContain(gains[0].where);
    // deterministic: the same numbers every time
    expect(measureParts(g.state, setup)[0].seconds).toBe(gains[0].seconds);
  });

  it('a bench that cannot make the goal part gets one targeted crate (once), sized to close the gap', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    race(g, T0 + 1000);
    g.transact((d) => { d.board = d.board.map((p) => (p?.f === 'tires' ? null : p)); d.tray = d.tray.map((p) => (p?.f === 'tires' ? null : p)); d.crates = []; return []; }, T0 + 30_000);
    const goal = P.goalStatus(g.state)!;
    const rc = rescueCrate(g.state)!;
    expect(rc.family).toBe(goal.family);
    expect(2 ** (rc.tier - 1)).toBeLessThanOrEqual(ingredients(g.state, goal.family, goal.tier).need);
    g.transact((d) => { d.tips['fr:rescue'] = true; return []; }, T0 + 31_000);
    expect(rescueCrate(g.state)).toBeNull();
  });
});

describe('just-in-time tips after the first session', () => {
  it('cash is explained once it buys something useful, and ends on "Got it" or a purchase', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((s) => { returning(s); s.stats.milestones.firstMerge = 1; s.stats.races = 1; s.cash = 20; return []; }, T0);
    expect(tutorialStep(g.state)).not.toBe('spend');
    g.transact((s) => { s.cash = Math.max(200, bestBuy(s).pick?.price ?? 0); return []; }, T0);
    expect(tutorialStep(g.state)).toBe('spend');
    g.markTip('spend');
    expect(tutorialStep(g.state)).not.toBe('spend');
  });

  it('contextual tips end with "Got it"', () => {
    const h = new Game(new MemoryKV(), '/t2/', T0);
    h.transact((s) => {
      returning(s);
      s.stats.milestones.firstMerge = 1; s.stats.races = 4; s.owned.push('beater');
      s.tips.betterPart = true; s.tips.spend = true;
      s.tray[0] = { id: s.nextPartId++, f: 'engine', t: 1, q: 'std' };
      return [];
    }, T0);
    expect(tutorialStep(h.state)).toBe('overflow');
    h.markTip('overflow');
    expect(tutorialStep(h.state)).not.toBe('overflow');
  });

  it('tells a returning player once when a better part waits on the bench', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((s) => {
      returning(s);
      s.stats.milestones.firstMerge = 1; s.stats.races = 4; s.tips.spend = true;
      s.board = s.board.map(() => null); s.crates = [];
      s.board[0] = { id: s.nextPartId++, f: 'engine', t: 2, q: 'std' };
      s.installed = { junker: { engine: { id: s.nextPartId++, f: 'engine', t: 1, q: 'std' } } };
      return [];
    }, T0);
    expect(tutorialStep(g.state)).toBe('betterPart');
    g.markTip('betterPart');
    expect(tutorialStep(g.state)).not.toBe('betterPart');
  });

  it('explains part limits the first time a part runs above the car limit', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((s) => {
      returning(s);
      s.stats.milestones.firstMerge = 1; s.stats.races = 4;
      Object.assign(s.tips, { spend: true, betterPart: true, nitroBank: true, overflow: true, scrap: true, mergeAll: true });
      s.board = s.board.map(() => null); s.crates = [];
      s.installed = { junker: { tires: { id: s.nextPartId++, f: 'tires', t: 3, q: 'std' } } }; // Tapeback cap is T2
      return [];
    }, T0);
    expect(tutorialStep(g.state)).toBe('cap');
    expect(B.allParts(g.state)).toHaveLength(0); // the fitted part is on the car, not the bench
    expect(computeLoadout(g.state).blocked.tires).toBeTruthy();
  });
});
