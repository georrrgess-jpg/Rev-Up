// Drivetrain feel probe (prints only; PROBE=1): per car, the cost of missed / ordinary / early shifting against clean,
// shifts per race, top speed and green-window length, on a sprint, a bendy and a long event.
//   PROBE=1 PROBE_CARS=vireo,mako,sovereign npx vitest run tests/probe-feel.test.ts
import { describe, it } from 'vitest';
import { RaceSim, ShiftPolicy, runRace } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { mph } from '../src/core/units';
import { CarId, Family, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const CARS = (process.env.PROBE_CARS ?? 'super,gt,proto,vireo,mako,sovereign').split(',') as CarId[];
const EVS = (process.env.PROBE_EVENTS ?? 'midnight-run,canyon-stage,summit-1000').split(',');
describe.skipIf(!process.env.PROBE)('feel probe', () => {
  it('prints', () => {
    const rows: string[] = [];
    for (const car of CARS) for (const ev of EVS) {
      const st = (p: ShiftPolicy) => ({ eventId: ev, seed: 7, player: { name: 'Y', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: 0, shift: p, analysis: false });
      const o = (p: ShiftPolicy) => runRace(st(p));
      const c = o("clean");
      if (c.playerTime === null) continue;
      const d = (p: ShiftPolicy) => ((o(p).playerTime ?? NaN) - c.playerTime!).toFixed(2);
      // green window length on a manual run with no taps
      const sim = new RaceSim(st('manual'));
      const greens: number[] = []; let g0 = -1;
      while (!sim.done && sim.player.finishTime === null) { sim.step(); const gr = sim.shiftCue() === 'green'; if (gr && g0 < 0) g0 = sim.t; if (!gr && g0 >= 0) { greens.push(sim.t - g0); g0 = -1; } }
      const pullLow = sim.drivetrain.band;
      rows.push(`${car.padEnd(9)} ${ev.padEnd(13)} clean ${c.playerTime!.toFixed(2)}s shifts ${c.shifts} top ${mph(c.topSpeed ?? 0)}mph  missed +${d('missed')} ordinary +${d('ordinary')} early +${d('early')}  green ${Math.round(Math.min(...greens) * 1000)}-${Math.round(Math.max(...greens) * 1000)}ms band ${pullLow.join('-')} place ${c.place}`);
    }
    console.log(rows.join('\n'));
  });
});
