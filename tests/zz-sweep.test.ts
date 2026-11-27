import { it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { DRIVETRAINS } from '../src/data/drivetrain';
import { buildStats } from './ladder';
const run = (ev: string, car: any, t: number, shift: any = 'clean') => { const sim = new RaceSim({ eventId: ev, seed: 101, player: { name: 'p', car, stats: buildStats({ car, tiers: [t, t, t], label: '' }), paint: '#fff' }, nitroCharges: 2, shift, rivalShift: 'clean' }); while (!sim.done && sim.player.finishTime === null) { const { active } = sim.windowState(); if (active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); sim.step(); } return sim.player.finishTime!; };
it('sweep', () => {
  const m = DRIVETRAINS.ardent;
  const evs = ['esplanade-gp', 'corniche', 'summit-gala', 'glacier-pass'];
  for (const ev of evs) console.log(ev, 'vireo9', ['clean', 'ordinary', 'missed'].map((s) => run(ev, 'vireo', 9, s).toFixed(2)).join('/'), 'proto9', ['clean', 'ordinary', 'missed'].map((s) => run(ev, 'proto', 9, s).toFixed(2)).join('/'), 'proto8', ['clean', 'ordinary', 'missed'].map((s) => run(ev, 'proto', 8, s).toFixed(2)).join('/'), 'gt8', run(ev, 'gt', 8).toFixed(2));
  for (const [lp, as, pe, ts] of [[0.66, 1.0, 2.3, 1.12], [0.8, 1.0, 2.3, 1.12], [0.8, 1.05, 2.3, 1.12], [0.85, 1.08, 2.3, 1.12], [0.8, 1.1, 2.3, 1.12]]) {
    m.lowPull = lp; m.accelScale = as; m.pullExp = pe; m.topScale = ts;
    console.log('ARD', lp, as, pe, ts, evs.map((ev) => `${ev} ${['clean', 'ordinary', 'missed'].map((s) => run(ev, 'ardent', 8, s).toFixed(2)).join('/')}`).join(' · '));
  }
});
