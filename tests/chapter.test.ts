import { describe, expect, it } from 'vitest';
import { fmtMin, runBot } from './bot';

// Open Road chapter: clean save → Altamar GT through the Coastal Crown series (rivals shift clean from here on), with a
// clean player and a mixed player who alternates clean shifts + Perfect boosts with late ones. Baseline luck.
describe('Open Road chapter playthrough (simulation)', () => {
  const runs = (['clean', 'mixed'] as const).flatMap((kind) => [1, 2].map((seed) => ({ kind, seed, log: runBot({ seed, untilCar: 'tourer', maxS: 3 * 3600, shift: kind, policy: kind === 'clean' ? 'perfect' : 'mixed' }) })));
  it('prints the chapter milestones', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      console.log(`${r.kind} seed ${r.seed}: Corsa ${fmtMin(m.beater)} Vexa ${fmtMin(m.hothatch)} Ironhorse ${fmtMin(m.muscle)} T6 Engine ${fmtMin(m['t6-engine'])} Altamar ${fmtMin(m.tourer)} | races ${r.log.races}, max repeat ${r.log.maxRepeat} | ${Object.entries(r.log.liveStarts).map(([k, v]) => `${k}:${r.log.liveWins[k] ?? 0}/${v}`).join(' ')}`);
    }
  });
  it('reaches the Altamar GT with ordinary luck, without grinding one event', () => {
    for (const r of runs) {
      expect(r.log.milestones.tourer).toBeGreaterThan(20 * 60);
      expect(r.log.milestones.tourer).toBeLessThan(40 * 60);
      expect(r.log.maxRepeat).toBeLessThanOrEqual(5);
      // the Coastal Crown win brings the Altamar: no Rep grind on the coast after the boss
      for (const id of ['harbor-launch', 'cliff-esses', 'coast-crown']) expect(r.log.perEvent[id] ?? 0).toBeLessThanOrEqual(4);
    }
  });
});
