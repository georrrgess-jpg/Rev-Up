import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import { RaceSim } from '../src/core/race';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { newGame } from '../src/core/state';
import { BEGINNER_STEPS, tutorialStep } from '../src/core/tutorial';

const T0 = 1_700_000_000_000;
const at = (s: ReturnType<typeof newGame>, r: number, c: number) => ({ zone: 'board' as const, i: r * s.cols + c });

function race(g: Game, now: number) {
  const setup = g.startRace('yard-sprint', now)!;
  const sim = new RaceSim(setup);
  const out = sim.finish();
  return g.commitRace(g.pendingRaceId!, out, now + 25_000);
}

describe('teach-through-play steps', () => {
  it('walks a fresh save: goal → merge → fit → first race → spend → remaining requirements → craft', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, '/t/', T0);
    expect(tutorialStep(g.state)).toBe('goal'); // the next car and why, before anything else
    g.markTip('goal');
    expect(tutorialStep(g.state)).toBe('merge');
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    expect(tutorialStep(g.state)).toBe('fit'); // a fresh car has empty slots: parts don't fit themselves
    g.installPart('junker', at(g.state, 2, 2), T0 + 1500); // the merged T2 Engine
    expect(tutorialStep(g.state)).toBe('race1');
    g.fitRecommended('junker', T0 + 1600); // and the rest, as the Fit Parts view suggests
    expect(tutorialStep(g.state)).toBe('race1');
    race(g, T0 + 5000);
    expect(g.state.cash).toBeGreaterThanOrEqual(45);
    expect(tutorialStep(g.state)).toBe('spend'); // use the payout in the Shop
    g.orderPart('tires', 1, T0 + 40_000);
    expect(tutorialStep(g.state)).toBe('goalCard'); // then the exact remaining requirements
    g.markTip('goalCard');
    expect(tutorialStep(g.state)).toBe('craftGoal'); // starter Tires pairs → T3 Tires for the Corsa Rojo
  });

  it('merging first counts as seeing the goal; the fit beat ends with any fitted part', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    expect(tutorialStep(g.state)).toBe('fit');
    g.fitRecommended('junker', T0 + 2000);
    expect(tutorialStep(g.state)).toBe('race1');
  });

  it('is safe out of order: racing before merging keeps the merge tip until a merge happens', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    race(g, T0 + 1000);
    expect(tutorialStep(g.state)).toBe('merge');
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 40_000);
    expect(['race1', 'fit', 'goal']).not.toContain(tutorialStep(g.state)); // already raced
  });

  it('resumes the same step after a reload mid-step', () => {
    const kv = new MemoryKV();
    const g = new Game(kv, '/t/', T0);
    g.move(at(g.state, 2, 1), at(g.state, 2, 2), T0 + 1000);
    g.fitRecommended('junker', T0 + 1500);
    expect(tutorialStep(g.state)).toBe('race1');
    g.startRace('yard-sprint', T0 + 2000); // closed the page mid-race
    const again = new Game(kv, '/t/', T0 + 60_000);
    expect(tutorialStep(again.state)).toBe('race1');
  });

  it('the spend beat waits for enough cash and ends on "Got it" as well as on a purchase', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((s) => { s.stats.milestones.firstMerge = 1; s.stats.races = 1; s.tips.goal = true; s.cash = 20; return []; }, T0);
    expect(tutorialStep(g.state)).toBe('goalCard'); // nothing affordable yet: skip ahead
    g.transact((s) => { s.cash = 200; return []; }, T0);
    expect(tutorialStep(g.state)).toBe('spend');
    g.markTip('spend');
    expect(tutorialStep(g.state)).toBe('goalCard');
  });

  it('Skip turns every tip off, and contextual tips end with "Got it"', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.markTip('skipGuide');
    expect(tutorialStep(g.state)).toBeNull();
    const h = new Game(new MemoryKV(), '/t2/', T0);
    h.transact((s) => {
      s.stats.milestones.firstMerge = 1; s.stats.races = 4; s.owned.push('beater');
      for (const id of BEGINNER_STEPS) s.tips[id] = true;
      s.tips.betterPart = true;
      s.tray[0] = { id: s.nextPartId++, f: 'engine', t: 1, q: 'std' };
      return [];
    }, T0);
    expect(tutorialStep(h.state)).toBe('overflow');
    h.markTip('overflow');
    expect(tutorialStep(h.state)).not.toBe('overflow');
  });

  it('a returning save opens at its progress without beginner prompts', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    Object.assign(old, { owned: ['junker', 'beater', 'hothatch'], activeCar: 'hothatch', rep: 500, crafted: ['tires:3', 'turbo:4'], tips: {} });
    (old.stats as { races: number; milestones: Record<string, number> }).races = 25;
    (old.stats as { milestones: Record<string, number> }).milestones.firstMerge = 2;
    kv.setItem(saveKey('/t/'), encodeSave(old as never));
    const g = new Game(kv, '/t/', T0);
    const step = tutorialStep(g.state);
    expect(['goal', 'merge', 'fit', 'race1', 'spend', 'goalCard', 'craftGoal']).not.toContain(step);
    expect(g.state.owned).toEqual(['junker', 'beater', 'hothatch']);
  });

  it('tells a returning player once when a better part waits on the bench (parts no longer fit themselves)', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.transact((s) => {
      s.stats.milestones.firstMerge = 1; s.stats.races = 4;
      for (const id of BEGINNER_STEPS) s.tips[id] = true;
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
      s.stats.milestones.firstMerge = 1; s.stats.races = 4;
      Object.assign(s.tips, { goal: true, fit: true, spend: true, craftGoal: true, shop: true, goalCard: true, betterPart: true, nitroBank: true, overflow: true, scrap: true, mergeAll: true });
      s.board = s.board.map(() => null); s.crates = [];
      s.installed = { junker: { tires: { id: s.nextPartId++, f: 'tires', t: 3, q: 'std' } } }; // Tapeback cap is T2
      return [];
    }, T0);
    expect(tutorialStep(g.state)).toBe('cap');
    expect(B.allParts(g.state)).toHaveLength(0); // the fitted part is on the car, not the bench
  });
});
