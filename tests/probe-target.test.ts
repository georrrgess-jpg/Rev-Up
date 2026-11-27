// Shift target probe (prints only; run with PROBE=1): drives live (manual) races frame by frame the way the race
// screen does and counts every time the green arc the HUD draws moves — within an attempt, across a braking zone,
// and on the first frames of the next upshift window.
//
//   PROBE=1 npx vitest run tests/probe-target.test.ts
import { describe, it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CarId, Family, RACE, TIER_STAT, carById } from '../src/data/tables';
import type { Part } from '../src/core/state';

const build = (car: CarId) => {
  const t = Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};

const PAIRS: [string, CarId][] = [
  ['foundry-final', 'muscle'], ['canyon-stage', 'rally'], ['canyon-stage', 'gt'], ['cliff-esses', 'super'], ['cliff-esses', 'hothatch'],
  ['summit-1000', 'proto'], ['summit-1000', 'vireo'], ['summit-1000', 'mako'], ['summit-1000', 'sovereign'], ['neon-mile', 'tuner'],
];

describe.skipIf(!process.env.PROBE)('shift target probe', () => {
  it('prints arc moves', () => {
    const rows: string[] = [];
    let tot = { live: 0, hold: 0, soonMoves: 0, frames: 0, zones: 0, zoneMoves: 0 };
    for (const [ev, car] of PAIRS) for (const nitro of [0, 2]) for (const fps of [60, 15]) {
      const sim = new RaceSim({ eventId: ev, seed: 7, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges: nitro, shift: 'manual', analysis: false });
      let acc = 0;
      let prevBand = '', prevGear = -1, prevCue = 'off', tapAt = -1, now = 0, seenId = -1;
      let inZone = false, zoneBands = new Set<string>();
      const c = { live: 0, hold: 0, soonMoves: 0, frames: 0, zones: 0, zoneMoves: 0 };
      while (!sim.done && sim.player.finishTime === null) {
        acc += 1 / fps; now += 1 / fps;
        if (sim.charges > 0 && sim.player.nitroLeft <= 0) { const { active } = sim.windowState(); if (active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro(); }
        while (acc >= RACE.dt - 1e-9) { sim.step(); acc -= RACE.dt; }
        const a = sim.attempt;
        const band = (sim as unknown as { hudBand?: () => [number, number] }).hudBand?.().join('-') ?? a.band.join('-');
        c.frames++;
        const hold = a.cue === 'hold' || sim.player.braking;
        if (prevBand && band !== prevBand) {
          if (process.env.PROBE_V) console.log(`${ev} ${car} n${nitro} t=${sim.t.toFixed(2)} gear ${prevGear + 1}->${sim.player.gear + 1} cue ${prevCue}->${a.cue} id ${a.id} braking ${sim.player.braking} ${prevBand} -> ${band}`);
          if (hold) c.hold++;
          else if (sim.player.gear === prevGear) { c.live++; if (prevCue === 'soon' || prevCue === 'green') c.soonMoves++; }
        }
        if (hold && !inZone) { inZone = true; zoneBands = new Set([prevBand]); c.zones++; }
        if (inZone) zoneBands.add(band);
        if (!hold && inZone) { inZone = false; if (zoneBands.size > 1) c.zoneMoves++; }
        prevBand = band; prevGear = sim.player.gear; prevCue = a.cue;
        if (a.cue === 'green' && tapAt < 0 && a.id !== seenId) { tapAt = now + 0.2; seenId = a.id; }
        if (tapAt >= 0 && now >= tapAt) { sim.tapShift(); tapAt = -1; }
      }
      rows.push(`${ev.padEnd(14)} ${car.padEnd(10)} n${nitro} ${String(fps).padStart(2)}fps  live-gear arc moves ${c.live} (during soon/green ${c.soonMoves})  moves while braking ${c.hold}  braking zones ${c.zones} with arc jumps ${c.zoneMoves}  clean ${sim.shiftLog.filter((s) => s.grade === 'clean').length}/${sim.shiftLog.filter((s) => s.grade !== 'assist').length} downs ${sim.autoDowns}`);
      for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += c[k];
    }
    console.log(rows.join('\n') + `\nTOTAL ${JSON.stringify(tot)}`);
  });
});
