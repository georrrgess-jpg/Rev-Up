// Deterministic shift × nitro comparison harness (prints only; run with PROBE=1).
// For each event and car at a given build, the same seeds and rivals are raced with missed / ordinary / clean shifting
// × no / ordinary (just after the zone) / Perfect nitro, and the mean finish time, mean place, wins and top speed are
// printed. Stage-2 tuning (rival stats, events) uses this to check that clean shifts and good boosts are rewarded.
//
//   PROBE=1 npx vitest run tests/probe-shift.test.ts
//   PROBE=1 PROBE_TIER=4 PROBE_CARS=hothatch,muscle PROBE_EVENTS=maple-mile,cul-de-sac PROBE_SEEDS=10 npx vitest run tests/probe-shift.test.ts
//
// PROBE_TIER: part tier on engine, tires and turbo (default: each car's cap; an event's partCap still applies).
// PROBE_TUNE: Tune-up stages (0–3). Default cars per event: the cars that event is meant for.
import { describe, it } from 'vitest';
import { RaceSim, ShiftPolicy } from '../src/core/race';
import { mph } from '../src/core/units';
import { CarId, EVENTS, RaceEvent, STAT_SCALE, TIER_STAT, TUNE_STEP, carById } from '../src/data/tables';

type Nitro = 'none' | 'ordinary' | 'perfect';
const SHIFTS: ShiftPolicy[] = ['missed', 'ordinary', 'clean'];
const NITROS: Nitro[] = ['none', 'ordinary', 'perfect'];

const statsFor = (car: CarId, tier: number, tune: number) => {
  const c = carById(car);
  const add = TIER_STAT[Math.min(tier, TIER_STAT.length - 1)];
  const k = 1 + tune * TUNE_STEP;
  return { top: (c.base.top + add * STAT_SCALE.top) * k, accel: (c.base.accel + add * STAT_SCALE.accel) * k, grip: (c.base.grip + add * STAT_SCALE.grip) * k };
};

/** The cars an event is meant for (its class, its required car, or the cars of its district). */
function carsFor(e: RaceEvent): CarId[] {
  if (e.carOnly) return [e.carOnly];
  const byDistrict: Record<string, CarId[]> = {
    scrapyard: ['junker', 'beater'], suburbs: ['hothatch', 'muscle'], coastal: ['muscle', 'tourer'], meets: ['beater', 'hothatch'],
    trials: ['beater', 'hothatch', 'muscle'], downtown: ['tourer', 'tuner', 'super'], riviera: ['rally', 'gt'], neon: ['gt', 'super'], desert: ['rally', 'proto'], summit: ['gt', 'proto'],
  };
  const list = [...(byDistrict[e.district] ?? ['muscle'])];
  if (e.requires.car && !list.includes(e.requires.car)) list.unshift(e.requires.car);
  return list;
}

export function probe(eventId: string, car: CarId, tier: number, tune: number, shift: ShiftPolicy, nitro: Nitro, seeds: number) {
  let tSum = 0, placeSum = 0, wins = 0, top = 0, n = 0, trap = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = new RaceSim({ eventId, seed: seed * 101, player: { name: 'p', car, stats: statsFor(car, tier, tune), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: nitro === 'none' ? 0 : 2, shift, analysis: false });
    while (!sim.done) {
      if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
        const { active } = sim.windowState();
        if (nitro === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
        if (nitro === 'ordinary' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
      }
      sim.step();
    }
    const o = sim.outcome();
    if (o.playerTime === null) continue;
    n++; tSum += o.playerTime; placeSum += o.place; if (o.place === 1) wins++; top = Math.max(top, o.topSpeed ?? 0); trap += o.trapSpeed ?? 0;
  }
  return { time: tSum / Math.max(1, n), place: placeSum / Math.max(1, n), wins, top: mph(top), trap: mph(trap / Math.max(1, n)) };
}

describe.skipIf(!process.env.PROBE)('shift × nitro comparison harness', () => {
  it('prints finish time / place for missed, ordinary and clean shifting × no, ordinary and Perfect nitro', () => {
    const seeds = Number(process.env.PROBE_SEEDS ?? 6);
    const tune = Number(process.env.PROBE_TUNE ?? 0);
    const onlyEv = process.env.PROBE_EVENTS?.split(',');
    const onlyCars = process.env.PROBE_CARS?.split(',') as CarId[] | undefined;
    const lines: string[] = [`seeds 1..${seeds} (×101), tune ${tune}; cells: mean time s / mean place / wins; top speed mph`];
    for (const e of EVENTS.filter((x) => !x.knockout && (!onlyEv || onlyEv.includes(x.id)))) {
      for (const car of onlyCars ?? carsFor(e)) {
        const tier = Math.min(Number(process.env.PROBE_TIER ?? carById(car).cap), e.partCap ?? 99, carById(car).cap);
        lines.push(`\n${e.id} · ${car} T${tier}${e.rivals.length ? '' : ' (solo)'}${e.speedTrap ? ' (speed trap: mean trap mph)' : ''}`);
        lines.push(`  ${'shift'.padEnd(9)}${NITROS.map((x) => `nitro ${x}`.padEnd(24)).join('')}`);
        for (const sh of SHIFTS) {
          const cells = NITROS.map((ni) => {
            const r = probe(e.id, car, tier, tune, sh, ni, seeds);
            return `${r.time.toFixed(2)}s P${r.place.toFixed(1)} W${r.wins} ${e.speedTrap ? `${r.trap}` : `${r.top}`}mph`.padEnd(24);
          });
          lines.push(`  ${sh.padEnd(9)}${cells.join('')}`);
        }
      }
    }
    console.log(lines.join('\n'));
  });
});
