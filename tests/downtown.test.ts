import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { encodeSave } from '../src/core/save';
import { runBot } from './bot';

// Downtown Nights: clean save → Lumen RS through the Neon Mile, event goals (stars), the Kestrel 1600,
// and The Main Event knockout. Simulation through the real Game API with three kinds of player.
describe('Downtown Nights playthrough (simulation)', () => {
  const runs = (['perfect', 'mixed'] as const).flatMap((policy) => [1, 2].map((seed) => ({ policy, seed, log: (() => { let st: Record<string, number> = {}; let nitro = 0; const log = runBot({ seed, untilCar: 'super', maxS: 4 * 3600, policy, onStep: (g) => {
        st = g.state.stars; nitro = g.state.nitro;
        const dir = process.env.AUDIT_SAVES;
        if (dir && seed === 1 && policy === 'perfect') {
          const o = g.state.owned;
          if (o.includes('tourer') && !o.includes('tuner') && g.state.events['neon-mile']?.wins) writeFileSync(`${dir}/downtown-start.txt`, encodeSave(g.state));
          if (o.includes('tuner') && !g.state.events['main-event']?.wins) writeFileSync(`${dir}/downtown-mid.txt`, encodeSave(g.state));
          if (o.includes('super')) writeFileSync(`${dir}/downtown-end.txt`, encodeSave(g.state));
        }
      } }); return Object.assign(log, { stars: st, nitro }); })() })));
  it('prints the chapter milestones', () => {
    for (const r of runs) {
      const m = r.log.milestones;
      const f = (k: string) => (m[k] ? (m[k] / 60).toFixed(1) + 'm' : '—');
      const dt = ['neon-mile', 'bridge-trap', 'stock-cup', 'skyline-run', 'main-event', 'midnight-run'].map((k) => `${k}:${r.log.perEvent[k] ?? 0}`).join(' ');
      console.log(`${r.policy} seed ${r.seed}: Ironhorse ${f('muscle')} Altamar ${f('tourer')} Kestrel ${f('tuner')} T7 Turbo ${f('t7-turbo')} Lumen ${f('super')} | races ${r.log.races}, max repeat ${r.log.maxRepeat} | ${dt} | stars ${JSON.stringify((r.log as unknown as { stars: unknown }).stars)}`);
    }
  });
  it('a player who never uses nitro still gets there, by spending on Tune-ups', () => {
    const weak = runBot({ seed: 3, untilCar: 'super', maxS: 2 * 3600, policy: 'none' });
    console.log(`no-nitro seed 3: Altamar ${(weak.milestones.tourer / 60).toFixed(1)}m Kestrel ${(weak.milestones.tuner / 60).toFixed(1)}m Lumen ${(weak.milestones.super / 60).toFixed(1)}m | races ${weak.races}, max repeat ${weak.maxRepeat}`);
    expect(weak.milestones.super).toBeLessThan(90 * 60);
    expect(weak.maxRepeat).toBeLessThanOrEqual(5);
  });
  it('reaches the Lumen RS with ordinary luck, without grinding one event', () => {
    for (const r of runs) {
      expect(r.log.milestones.super).toBeGreaterThan(25 * 60);
      expect(r.log.milestones.super).toBeLessThan(75 * 60);
      expect(r.log.milestones.tuner).toBeLessThan(r.log.milestones.super); // the Kestrel is the chapter's midpoint unlock
      expect(r.log.maxRepeat).toBeLessThanOrEqual(5);
      for (const id of ['neon-mile', 'stock-cup', 'skyline-run']) expect(r.log.perEvent[id] ?? 0).toBeLessThanOrEqual(10);
    }
  });
});
