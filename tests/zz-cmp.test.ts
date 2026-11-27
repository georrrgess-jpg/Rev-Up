import { it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { buildStats } from './ladder';
const run = (ev: string, car: any, t: number, shift: any = 'clean', nitro = true, launch: any = 'perfect') => { const sim = new RaceSim({ eventId: ev, seed: 101, player: { name: 'p', car, stats: buildStats({ car, tiers: [t, t, t], label: '' }), paint: '#fff' }, nitroCharges: nitro ? 2 : 0, shift, launch, rivalShift: 'clean' }); while (!sim.done && sim.player.finishTime === null) { const { active } = sim.windowState(); if (nitro && active && sim.charges > 0 && sim.player.nitroLeft <= 0 && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); sim.step(); } return sim.outcome(); };
it('cmp', () => {
  for (const [ev, cars] of [['causeway-run', [['meridian', 9], ['mako', 9], ['sovereign', 9], ['vireo', 9], ['proto', 9]]], ['esplanade-gp', [['ardent', 8], ['proto', 8], ['gt', 8], ['vireo', 8]]], ['launch-final', [['tempest', 10], ['sovereign', 10], ['meridian', 9], ['mako', 9]]]] as const)
    for (const sh of ['clean', 'ordinary', 'missed'])
      console.log(ev, sh, (cars as any).map(([c, t]: any) => `${c} ${run(ev, c, t, sh).playerTime!.toFixed(2)}`).join(' · '));
  for (const sh of ['clean', 'ordinary', 'missed']) for (const lc of ['perfect', 'none']) for (const n of [true, false]) { const o = run('launch-final', 'tempest', 10, sh, n, lc); console.log('LF tempest', sh, lc, n ? 'nitro' : 'none', o.playerTime!.toFixed(2), o.place); }
});
