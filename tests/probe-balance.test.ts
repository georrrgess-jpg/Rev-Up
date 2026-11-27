// Before/after balance probe for race-sim changes (prints only; PROBE=1). PROBE_ORIG points at a copy of the old sim.
import { describe, it } from 'vitest';
import * as NEW from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CarId, EVENTS, Family, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId, cap?: number) => {
  const t = Math.min(carById(car).cap, cap ?? 99, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const CARS: CarId[] = ['junker', 'hothatch', 'muscle', 'tuner', 'super', 'rally', 'gt', 'proto', 'vireo', 'mako', 'sovereign'];
describe.skipIf(!process.env.PROBE)('balance probe', () => {
  it('prints', async () => {
    const OLD = process.env.PROBE_ORIG ? await import(process.env.PROBE_ORIG) as typeof NEW : null;
    let maxd = 0; const rows: string[] = [];
    for (const ev of EVENTS) for (const car of CARS) {
      if (ev.carOnly && ev.carOnly !== car) continue;
      for (const pol of ['clean', 'ordinary', 'missed'] as const) {
        const setup = { eventId: ev.id, seed: 3, player: { name: 'You', car, stats: build(car, ev.partCap), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 2, shift: pol, analysis: false };
        const a = NEW.runRace(setup, 'perfect');
        const b = OLD ? OLD.runRace(setup as never, 'perfect') : null;
        const d = b && a.playerTime && b.playerTime ? a.playerTime - b.playerTime : 0;
        const rd = b ? a.standings.map((r) => r.finishTime ?? 0).reduce((x, y) => x + y, 0) - b.standings.map((r) => r.finishTime ?? 0).reduce((x, y) => x + y, 0) : 0;
        if (Math.abs(d) > Math.abs(maxd)) maxd = d;
        if (Math.abs(d) > 0.03 || (b && a.place !== b.place)) rows.push(`${ev.id} ${car} ${pol}: ${b?.playerTime?.toFixed(3)} -> ${a.playerTime?.toFixed(3)} (${d >= 0 ? '+' : ''}${d.toFixed(3)} s) place ${b?.place}->${a.place} field Δ${rd.toFixed(2)}`);
      }
    }
    console.log(rows.join('\n') + `\nmax Δ ${maxd.toFixed(3)} s, ${rows.length} runs moved > 0.03 s or changed place`);
  });
});
