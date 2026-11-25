// Calibration probe (prints only): for each Downtown event and each late car with a full loadout at its cap,
// win rate over 10 seeds with perfect / ordinary / no nitro, mean time, and trap speed. Run with PROBE=1.
import { describe, it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { CarId, EVENTS, STAT_SCALE, TIER_STAT, carById } from '../src/data/tables';

const statsFor = (car: CarId, tier: number) => {
  const c = carById(car);
  const add = TIER_STAT[tier];
  return { top: c.base.top + add * STAT_SCALE.top, accel: c.base.accel + add * STAT_SCALE.accel, grip: c.base.grip + add * STAT_SCALE.grip };
};

describe.skipIf(!process.env.PROBE)('downtown calibration probe', () => {
  it('prints win rates', () => {
    const lines: string[] = [];
    const evs = EVENTS.filter((e) => e.district === 'downtown' && !e.knockout && !e.heatOf);
    for (const e of evs) {
      for (const [car, tierFull] of [['muscle', 5], ['tourer', 6], ['tuner', 6], ['super', 7], ['tuner', 5], ['tourer', 5], ['hothatch', 4], ['beater', 3]] as [CarId, number][]) {
        const tier = Math.min(tierFull, e.partCap ?? 99);
        for (const policy of ['perfect', 'ordinary', 'none']) {
          let wins = 0, tsum = 0, trap = 0, n = 0;
          for (let seed = 1; seed <= 10; seed++) {
            const sim = new RaceSim({ eventId: e.id, seed: seed * 101, player: { name: 'p', car, stats: statsFor(car, tier), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: policy === 'none' ? 0 : 2 });
            while (!sim.done) {
              const { active } = sim.windowState();
              if (sim.charges > 0 && sim.player.nitroLeft <= 0) {
                if (policy === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
                if (policy === 'ordinary' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
              }
              sim.step();
            }
            const o = sim.outcome();
            if (o.place === 1) wins++;
            tsum += o.playerTime ?? 0; trap += (o.trapSpeed ?? 0) * 3.6; n++;
          }
          lines.push(`${e.id.padEnd(13)} ${car.padEnd(8)} T${tier} ${policy.padEnd(8)} wins ${wins}/10  time ${(tsum / n).toFixed(2)}  trap ${(trap / n).toFixed(0)} km/h${e.goals ? `  par ${e.goals.par}` : ''}`);
        }
      }
    }
    for (const id of ['main-event:1', 'main-event:2', 'main-event:3']) {
      const e = EVENTS.find((x) => x.id === id)!;
      for (const [car, tier, pol] of [['tourer', 6, 'p'], ['tuner', 6, 'p'], ['tuner', 6, 'o'], ['tuner', 5, 'p']] as [CarId, number, string][]) {
        let placeSum = 0, adv = 0;
        for (let seed = 1; seed <= 10; seed++) {
          const sim = new RaceSim({ eventId: id, seed: seed * 101, player: { name: 'p', car, stats: statsFor(car, tier), paint: '#fff' }, nitroCharges: 2 });
          while (!sim.done) {
            const { active } = sim.windowState();
            if (sim.charges > 0 && sim.player.nitroLeft <= 0) {
              if (pol === 'p' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
              if (pol === 'o' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
            }
            sim.step();
          }
          const o = sim.outcome(); placeSum += o.place; if (o.place <= (e.advance ?? 1)) adv++;
        }
        lines.push(`${id.padEnd(13)} ${car.padEnd(8)} T${tier} ${pol}  through ${adv}/10  mean place ${(placeSum / 10).toFixed(1)}`);
      }
    }
    console.log(lines.join('\n'));
  });
});
