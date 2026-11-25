import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { encodeSave } from '../src/core/save';
import { fmtMin, runBot } from './bot';

// Downtown Nights: clean save → Lumen RS through the Neon Mile, event goals (stars), the Kestrel 1600 and The Main
// Event knockout. Simulation through the real Game API with clean, mixed and weak players. Baseline luck.
// AUDIT_SAVES=<dir> also writes realistic saves at the chapter's start, middle and end for manual review.
describe('Downtown Nights playthrough (simulation)', () => {
  const runs = (['clean', 'mixed'] as const).flatMap((kind) => [1, 2].map((seed) => {
    let stars: Record<string, number> = {};
    const log = runBot({
      seed, untilCar: 'super', maxS: 3 * 3600, shift: kind, policy: kind === 'clean' ? 'perfect' : 'mixed', onStep: (g) => {
        stars = g.state.stars;
        const dir = process.env.AUDIT_SAVES;
        if (dir && seed === 1 && kind === 'clean') {
          const o = g.state.owned;
          if (o.includes('tourer') && !o.includes('tuner') && g.state.events['neon-mile']?.wins) writeFileSync(`${dir}/downtown-start.txt`, encodeSave(g.state));
          if (o.includes('tuner') && !g.state.events['main-event']?.wins) writeFileSync(`${dir}/downtown-mid.txt`, encodeSave(g.state));
          if (o.includes('super')) writeFileSync(`${dir}/downtown-end.txt`, encodeSave(g.state));
        }
      },
    });
    return { kind, seed, log, stars };
  }));
  it('prints the chapter milestones', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      const dt = ['neon-mile', 'bridge-trap', 'stock-cup', 'skyline-run', 'main-event', 'midnight-run'].map((k) => `${k}:${r.log.perEvent[k] ?? 0}`).join(' ');
      console.log(`${r.kind} seed ${r.seed}: Ironhorse ${fmtMin(m.muscle)} Altamar ${fmtMin(m.tourer)} Kestrel ${fmtMin(m.tuner)} Lumen ${fmtMin(m.super)} | races ${r.log.races}, max repeat ${r.log.maxRepeat} | ${dt} | stars ${JSON.stringify(r.stars)}`);
    }
  });
  it('a player who never shifts or uses nitro still gets there, by spending on Tune-ups', () => {
    const weak = runBot({ seed: 3, untilCar: 'super', maxS: 3 * 3600, shift: 'missed', policy: 'none' });
    console.log(`weak seed 3: Altamar ${fmtMin(weak.milestones.tourer)} Kestrel ${fmtMin(weak.milestones.tuner)} Lumen ${fmtMin(weak.milestones.super)} | races ${weak.races}, max repeat ${weak.maxRepeat}, longest losing run ${weak.maxLossStreak}`);
    expect(weak.milestones.super).toBeLessThan(90 * 60);
    expect(weak.maxRepeat).toBeLessThanOrEqual(5);
  });
  it('reaches the Lumen RS with ordinary luck, without grinding one event', () => {
    for (const r of runs) {
      expect(r.log.milestones.super).toBeGreaterThan(25 * 60);
      expect(r.log.milestones.super).toBeLessThan(45 * 60);
      expect(r.log.milestones.tuner).toBeLessThan(r.log.milestones.super); // the Kestrel is the chapter's midpoint unlock
      expect(r.log.maxRepeat).toBeLessThanOrEqual(5);
      for (const id of ['neon-mile', 'stock-cup', 'skyline-run']) expect(r.log.perEvent[id] ?? 0).toBeLessThanOrEqual(10);
    }
  });
});
