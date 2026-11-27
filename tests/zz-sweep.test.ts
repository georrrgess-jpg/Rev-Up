import { it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { DRIVETRAINS } from '../src/data/drivetrain';
import { buildStats } from './ladder';
const run = (ev: string, car: any, t: number, shift: any = 'clean') => { const sim = new RaceSim({ eventId: ev, seed: 101, player: { name: 'p', car, stats: buildStats({ car, tiers: [t, t, t], label: '' }), paint: '#fff' }, nitroCharges: 2, shift, rivalShift: 'clean' }); while (!sim.done && sim.player.finishTime === null) { const { active } = sim.windowState(); if (active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); sim.step(); } return sim.player.finishTime!; };
it('sweep', () => {
  const m = DRIVETRAINS.meridian;
  const ref = (ev: string, sh: string) => Math.min(run(ev, 'mako', 9, sh), run(ev, 'sovereign', 9, sh));
  for (const ev of ['causeway-run', 'grand-riviera', 'port-sprint', 'corniche']) console.log(ev, 'best mako/sov', ['clean', 'missed'].map((s) => ref(ev, s).toFixed(2)).join('/'));
  for (const [ts, as] of [[1.38, 0.8], [1.42, 0.95], [1.45, 1.0], [1.48, 1.0], [1.45, 1.05], [1.5, 0.95]]) {
    m.topScale = ts; m.accelScale = as;
    console.log(ts, as, ['causeway-run', 'grand-riviera', 'port-sprint', 'corniche'].map((ev) => `${ev} ${run(ev, 'meridian', 9, 'clean').toFixed(2)}/${run(ev, 'meridian', 9, 'missed').toFixed(2)}`).join(' · '), 'mph', Math.round(85.8 * ts * 2.23694 * 1.06));
  }
});
