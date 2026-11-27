import { it } from 'vitest';
import { buildStats, SHIFTS, NITROS } from './ladder';
import { RaceSim } from '../src/core/race';
import { rivalShiftFor } from '../src/core/progression';
import { carById, eventById, type CarId } from '../src/data/tables';
function probe(ev: string, car: CarId, tiers: [number, number, number], shift: any, nitro: string, launch: boolean, seeds = 6) {
  let wins = 0, gap = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = new RaceSim({ eventId: ev, seed: seed * 101, player: { name: 'p', car, stats: buildStats({ car, tiers, label: '' }), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: nitro === 'none' ? 0 : 2, shift, rivalShift: rivalShiftFor(eventById(ev)), analysis: false, launch: launch ? 'perfect' : 'none' } as any);
    while (!sim.done) {
      if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
        const { active } = sim.windowState();
        if (nitro === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
        if (nitro === 'late' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
      }
      sim.step();
    }
    const o = sim.outcome();
    const rivals = o.standings.filter((r: any) => !r.isPlayer && r.finishTime !== null).map((r: any) => r.finishTime).sort((a: number, b: number) => a - b);
    gap += (o.playerTime ?? 99) - rivals[0]; if (o.place === 1) wins++;
  }
  return `${wins}/${(gap / seeds).toFixed(2)}`;
}
const cases: [string, CarId[], [number, number, number]][] = JSON.parse(process.env.CASES ?? '[]');
it('probe', () => {
  for (const [ev, cars, tiers] of cases) for (const car of cars) for (const lc of [false, true]) {
    if (lc && car !== 'tempest') continue;
    const row: string[] = [];
    for (const sh of SHIFTS) for (const n of NITROS) row.push(`${sh[0]}${n[0]}:${probe(ev, car, tiers, sh, n, lc)}`);
    console.log(ev, (car + (lc ? '+LC' : '')).padEnd(12), row.join(' '));
  }
}, 600000);
