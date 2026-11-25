import { describe, expect, it } from 'vitest';
import { runBot } from './bot';

// Clean-save path from first merge to Muscle with baseline luck (every roll Standard — zero Mint/Polished).
// Method: scripted simulation through the real Game API with modelled input/menu time.
describe('baseline playthrough (simulation)', () => {
  const seeds = [1, 2, 3, 4, 5];
  const runs = seeds.map((seed) => ({ seed, log: runBot({ seed }) }));

  it('prints milestone times', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      console.log(`seed ${r.seed}: firstMerge ${m.firstMerge}s launch ${r.log.firstLaunch}s firstRace ${m.firstRace}s beater ${m.beater}s ray ${m.ray}s hothatch ${m.hothatch}s muscle ${m.muscle}s keys T3tires@${m["key-tires"]} T4turbo@${m["key-turbo"]} T5engine@${m["key-engine"]} | races ${r.log.races} (quick ${r.log.quick}, losses ${r.log.lossRaces}, max repeat ${r.log.maxRepeat}) merges ${r.log.merges} stuck-on-ingredients ${Math.round(r.log.stuckOnIngredients)}s waiting ${r.log.waiting}s catch-ups ${r.log.catchups} | ${Object.entries(r.log.perEvent).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
    if (process.env.BOT_LOG) console.log(runs[0].log.log.join('\n'));
  });

  it('hits the opening targets', () => {
    for (const r of runs) {
      expect(r.log.milestones.firstMerge).toBeLessThanOrEqual(5);
      expect(r.log.milestones.firstRace).toBeLessThanOrEqual(45);
    }
  });

  it('reaches every class with zero Mint rolls near the target times', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      expect(m.beater).toBeGreaterThan(2 * 60);
      expect(m.beater).toBeLessThan(4.5 * 60);
      expect(m.hothatch).toBeGreaterThan(10 * 60);
      expect(m.hothatch).toBeLessThan(14.5 * 60);
      expect(m.muscle).toBeGreaterThan(19 * 60);
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
