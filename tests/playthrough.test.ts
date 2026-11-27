import { describe, expect, it } from 'vitest';
import { PLAYERS, fmtMin, runBot } from './bot';

// Clean-save playthroughs with baseline luck (every roll Standard — zero Mint/Polished: no dependence on rare drops).
// Method: scripted simulation through the real Game API with modelled input/menu time (tests/bot.ts).
describe('baseline playthrough (simulation)', () => {
  const seeds = [1, 2, 3, 4, 5];
  const runs = seeds.map((seed) => ({ seed, log: runBot({ seed }) }));

  it('prints milestone times', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      console.log(`seed ${r.seed}: firstMerge ${m.firstMerge}s launch ${r.log.firstLaunch}s firstRace ${m.firstRace}s beater ${m.beater}s ray ${m.ray}s hothatch ${m.hothatch}s muscle ${m.muscle}s keys T3tires@${m['key-tires']} T4turbo@${m['key-turbo']} T5engine@${m['key-engine']} | races ${r.log.races} (quick ${r.log.quick}, losses ${r.log.lossRaces}, max repeat ${r.log.maxRepeat}) merges ${r.log.merges} stuck-on-ingredients ${Math.round(r.log.stuckOnIngredients)}s waiting ${r.log.waiting}s catch-ups ${r.log.catchups} | ${Object.entries(r.log.perEvent).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
    if (process.env.BOT_LOG) console.log(runs[0].log.log.join('\n'));
  });

  it('hits the opening targets', () => {
    for (const r of runs) {
      expect(r.log.milestones.firstMerge).toBeLessThanOrEqual(5);
      expect(r.log.milestones.firstRace).toBeLessThanOrEqual(45);
    }
  });

  it('reaches every early class with zero Mint rolls near the target times', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      expect(m.beater).toBeGreaterThan(1.5 * 60);
      expect(m.beater).toBeLessThan(4.5 * 60);
      expect(m.hothatch).toBeGreaterThan(8 * 60);
      expect(m.hothatch).toBeLessThan(14.5 * 60);
      expect(m.muscle).toBeGreaterThan(17 * 60);
      expect(m.muscle).toBeLessThan(26 * 60);
    }
  });

  it('launches the first race inside 30 s and never grinds one race or waits idle', () => {
    for (const r of runs) {
      expect(r.log.firstLaunch).toBeLessThanOrEqual(30);
      expect(r.log.maxRepeat).toBeLessThanOrEqual(5);
      expect(r.log.waiting).toBe(0);
      expect(Object.keys(r.log.perEvent).length).toBeGreaterThanOrEqual(5);
    }
  });
});

// The whole ladder, fresh save → Halcyon X → the Azure Riviera supercars (Vireo 9R, Mako TT, Sovereign), for four
// kinds of player (tests/bot.ts):
//   clean     every shift in the green, every boost a Perfect
//   mixed     alternates clean shifts + Perfect boosts with late shifts + late boosts, race by race
//   ordinary  always a beat late on the shift, Perfect boosts
//   weak      never taps SHIFT (the automatic fallback every time), never uses nitro; buys Tune-ups
const CARS = ['beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto', 'vireo', 'mako', 'sovereign', 'tempest'];
/** 1.9 branches: each opens beside a main-line car (the Ardent with the Halcyon, the Meridian with the Sovereign). */
const BRANCHES: [string, string, string][] = [['ardent', 'gt', 'vireo'], ['meridian', 'mako', 'tempest']];
const ALL = [...CARS.slice(0, 8), 'ardent', 'proto', 'vireo', 'mako', 'meridian', 'sovereign', 'tempest'];

describe('full ladder playthrough to the Tempest (simulation)', () => {
  const runs = Object.entries(PLAYERS).flatMap(([kind, o]) => (kind === 'clean' || kind === 'mixed' ? [1, 2] : [1]).map((seed) => ({ kind, seed, log: runBot({ ...o, seed, untilCar: 'tempest', maxS: 4 * 3600 }) })));
  const finale = runBot({ ...PLAYERS.clean, seed: 1, untilWin: 'grand-riviera', maxS: 4 * 3600 });

  it('prints milestones, races and repeats per player type', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      console.log(`${r.kind.padEnd(8)} seed ${r.seed}: ${ALL.map((c) => `${c} ${fmtMin(m[c])} (${r.log.racesAt[c] ?? '—'})`).join(' · ')} | races ${r.log.races} (quick ${r.log.quick}) max repeat ${r.log.maxRepeat} longest losing run ${r.log.maxLossStreak}`);
    }
    console.log(`clean seed 1: Summit Gala won at ${fmtMin(finale.milestones['win-summit-gala'])} (Halcyon at ${fmtMin(finale.milestones.proto)}) · Grand Riviera won at ${fmtMin(finale.milestones['win-grand-riviera'])} (Sovereign at ${fmtMin(finale.milestones.sovereign)})`);
  });

  it('every player type reaches the Tempest, in ladder order, without grinding one race', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      for (let i = 1; i < CARS.length; i++) expect(m[CARS[i]], `${r.kind} ${CARS[i]}`).toBeGreaterThanOrEqual(m[CARS[i - 1]]);
      // a branch car arrives after the car it opens with, and before the main line has moved two cars on
      for (const [b, after, before] of BRANCHES) {
        expect(m[b], `${r.kind} ${b}`).toBeGreaterThanOrEqual(m[after]);
        expect(m[b], `${r.kind} ${b}`).toBeLessThanOrEqual(m[before]);
      }
      expect(r.log.maxRepeat, r.kind).toBeLessThanOrEqual(5);
    }
  });

  it('skill is worth time: clean players finish first, weak players still finish', () => {
    const at = (kind: string) => Math.max(...runs.filter((r) => r.kind === kind).map((r) => r.log.milestones.proto));
    expect(at('clean')).toBeGreaterThan(45 * 60);
    expect(at('clean')).toBeLessThan(75 * 60);
    expect(at('mixed')).toBeLessThan(80 * 60);
    expect(at('ordinary')).toBeLessThan(85 * 60);
    expect(at('weak')).toBeLessThan(130 * 60);
    expect(at('clean')).toBeLessThan(at('weak'));
    // the endgame (Lumen → Halcyon) is a real chapter, not a sprint
    for (const r of runs) expect(r.log.milestones.proto - r.log.milestones.super).toBeGreaterThan(18 * 60);
  });

  it('the Azure Riviera is a chapter of its own: about 20–30 minutes from the Halcyon to the Sovereign', () => {
    const at = (kind: string) => Math.max(...runs.filter((r) => r.kind === kind).map((r) => r.log.milestones.sovereign));
    expect(at('clean')).toBeLessThan(100 * 60);
    expect(at('mixed')).toBeLessThan(110 * 60);
    expect(at('ordinary')).toBeLessThan(110 * 60);
    expect(at('weak')).toBeLessThan(160 * 60);
    for (const r of runs) {
      const m = r.log.milestones;
      expect(m.sovereign - m.proto, r.kind).toBeGreaterThan(15 * 60);
      expect(m.sovereign - m.proto, r.kind).toBeLessThan(40 * 60);
      // each supercar arrives a few minutes after the one before (no instant double unlock)
      expect(m.mako - m.vireo, r.kind).toBeGreaterThan(2 * 60);
      expect(m.sovereign - m.mako, r.kind).toBeGreaterThan(5 * 60);
      // the Tempest is the last car: a few minutes after the Sovereign, never the same session minute
      expect(m.tempest - m.sovereign, r.kind).toBeGreaterThan(3 * 60);
      expect(m.tempest - m.sovereign, r.kind).toBeLessThan(25 * 60);
    }
  });

  it('losses stay short: a skilled player never loses one race more than 5 times running, a weak one 15', () => {
    for (const r of runs) expect(r.log.maxLossStreak, r.kind).toBeLessThanOrEqual(r.kind === 'weak' ? 15 : r.kind === 'clean' ? 5 : 8);
  });

  it('the grand finale is won with the Halcyon soon after it is built, and the Grand Riviera soon after the Sovereign', () => {
    expect(finale.milestones['win-summit-gala']).toBeLessThan(finale.milestones.proto + 15 * 60);
    expect(finale.milestones['win-grand-riviera']).toBeLessThan(finale.milestones.sovereign + 15 * 60);
  });
});
