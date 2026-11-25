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
      console.log(`seed ${r.seed}: firstMerge ${m.firstMerge}s firstRace ${m.firstRace}s beater ${m.beater}s ray ${m.ray}s hothatch ${m.hothatch}s muscle ${m.muscle}s | races ${r.log.races} (quick ${r.log.quick}, losses ${r.log.lossRaces}) catch-ups ${r.log.catchups}`);
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
      expect(m.beater).toBeGreaterThan(90);
      expect(m.beater).toBeLessThan(330);
      expect(m.hothatch).toBeGreaterThan(8 * 60);
      expect(m.hothatch).toBeLessThan(17 * 60);
      expect(m.muscle).toBeGreaterThan(18 * 60);
      expect(m.muscle).toBeLessThan(34 * 60);
    }
  });
});
