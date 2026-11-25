import { describe, expect, it } from 'vitest';
import { runBot } from './bot';

// Open Road chapter: clean save → Altamar GT through the Coastal Crown series, with a perfect-timing
// player and a "mixed" player who lands every other boost late. Simulation through the real Game API.
describe('Open Road chapter playthrough (simulation)', () => {
  const runs = (['perfect', 'mixed'] as const).flatMap((policy) => [1, 2].map((seed) => ({ policy, seed, log: runBot({ seed, untilCar: 'tourer', maxS: 3 * 3600, policy }) })));
  it('prints the chapter milestones', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      const f = (k: string) => (m[k] ? (m[k] / 60).toFixed(1) + 'm' : '—');
      console.log(`${r.policy} seed ${r.seed}: Corsa ${f('beater')} Vexa ${f('hothatch')} Ironhorse ${f('muscle')} T6 Engine ${f('t6-engine')} Altamar ${f('tourer')} | races ${r.log.races}, max repeat ${r.log.maxRepeat} | ${Object.entries(r.log.perEvent).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
  });
  it('reaches the Altamar GT with ordinary luck, without grinding one event', () => {
    for (const r of runs) {
      expect(r.log.milestones.tourer).toBeGreaterThan(20 * 60);
      expect(r.log.milestones.tourer).toBeLessThan(45 * 60);
      expect(r.log.maxRepeat).toBeLessThanOrEqual(5);
      // the Coastal Crown win now brings the Altamar: no Rep grind on the coast after the boss
      for (const id of ['harbor-launch', 'cliff-esses', 'coast-crown']) expect(r.log.perEvent[id] ?? 0).toBeLessThanOrEqual(4);
    }
  });
});
