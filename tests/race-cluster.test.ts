// 1.10 instrument cluster: the shift window is shown as a shape and a word as well as a colour, and that marker is
// exactly what a SHIFT tap is judged on (through braking, consecutive downshifts, nitro and the practice race); the
// speedometer's range is fixed per race and never pinned, even by a Perfect boost on a highway; the acceleration
// sweep is the real speed gain; every car keeps the same layout with its own dressing.
import { describe, expect, it } from 'vitest';
import { RaceSetup, RaceSim, ShiftPolicy } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { mph } from '../src/core/units';
import { CARS, CarId, Family, RACE, TIER_STAT, carById } from '../src/data/tables';
import { GAIN_S, clusterStyle, gaugeRange, shiftMarker, speedGain } from '../src/ui/clusterModel';
import type { Part } from '../src/core/state';

const build = (car: CarId, tier?: number) => {
  const t = tier ?? Math.min(carById(car).cap, TIER_STAT.length - 1);
  const eq: Partial<Record<Family, Part>> = { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } };
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId, shift: ShiftPolicy = 'manual', nitroCharges = 0, extra: Partial<RaceSetup> = {}): RaceSetup =>
  ({ eventId, seed: 11, player: { name: 'You', car, stats: build(car), paint: '#fff', perfectMul: carById(car).perfectMul }, nitroCharges, shift, analysis: false, ...extra });

const CASES: [string, CarId][] = [
  ['canyon-stage', 'rally'], ['cliff-esses', 'super'], ['cliff-esses', 'hothatch'], ['foundry-final', 'muscle'],
  ['summit-1000', 'proto'], ['summit-1000', 'vireo'], ['corniche', 'mako'], ['esplanade-gp', 'ardent'], ['yard-sprint', 'junker'], ['launch-final', 'tempest'],
];

describe('race cluster', () => {
  it('the marker a player sees is the grade a tap gets: SHIFT is clean, LATE is late, BRAKING is not a shift', () => {
    const seen = new Set<string>();
    for (const [ev, car] of CASES) for (const nitro of [0, 3]) for (const practice of [false, true]) {
      const sim = new RaceSim(setup(ev, car, 'manual', nitro, practice ? { windowScale: 1.6 } : {}));
      let lastId = -1, n = 0;
      while (!sim.done && sim.player.finishTime === null) {
        if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.windowState().active) sim.tapNitro();
        sim.step();
        const a = sim.attempt;
        const m = shiftMarker(a, sim.shiftCue(), { topGear: sim.topGear() });
        seen.add(m.shape);
        // the marker's window is the attempt's window
        if (m.shape !== 'none') expect(m.band.join()).toBe(a.band.join());
        // probe a tap on a copy at this exact frame (every 5th step, so the race still runs on)
        if (++n % 5 === 0 && m.shape !== 'none') {
          const r = sim.clone().tapShift();
          const at = `${ev} ${car} n${nitro}${practice ? ' practice' : ''} t=${sim.t.toFixed(2)} ${m.shape}`;
          if (m.label === 'SHIFT') expect(r, at).toBe('clean');
          else if (m.label === 'LATE') expect(r, at).toBe('late');
          else if (m.label === 'BRAKING') expect(['hold', 'busy'], at).toContain(r);
          else if (m.shape === 'outline') expect(['early', 'wait', 'busy'], at).toContain(r);
        }
        // a player who taps on the first frame of each SHIFT
        if (m.label === 'SHIFT' && a.id !== lastId) { lastId = a.id; expect(sim.tapShift()).toBe('clean'); }
      }
    }
    for (const sh of ['outline', 'bracket', 'held', 'none']) expect(seen.has(sh), sh).toBe(true);
  });

  it('through consecutive braking zones the held marker stays put and says BRAKING, then a fresh window opens below green', () => {
    let zones = 0;
    for (const [ev, car] of [['canyon-stage', 'rally'], ['corniche', 'mako'], ['cliff-esses', 'hothatch'], ['summit-1000', 'sovereign']] as [string, CarId][]) {
      const sim = new RaceSim(setup(ev, car, 'clean'));
      let held: string | null = null;
      while (!sim.done && sim.player.finishTime === null) {
        sim.step();
        const m = shiftMarker(sim.attempt, sim.shiftCue(), { topGear: sim.topGear() });
        if (m.shape === 'held') {
          if (held === null) { held = m.band.join(); zones++; }
          expect(m.band.join()).toBe(held);
          expect(m.label).toBe('BRAKING');
        } else if (held !== null) {
          held = null;
          expect(m.shape, `${ev} ${car} t=${sim.t.toFixed(2)}`).not.toBe('bracket');
        }
      }
    }
    expect(zones).toBeGreaterThan(8);
  });

  it('launch control reads LAUNCH, and only on green', () => {
    expect(shiftMarker({ cue: 'off', band: [0.8, 0.9] }, 'green', { launchArmed: true })).toMatchObject({ shape: 'bracket', label: 'LAUNCH' });
    expect(shiftMarker({ cue: 'off', band: [0.8, 0.9] }, 'soon', { launchArmed: true })).toMatchObject({ shape: 'outline', label: '' });
    expect(shiftMarker({ cue: 'hold', band: [0.8, 0.9] }, 'off', { topGear: true }).shape).toBe('none');
  });

  it('speedometer range: sized to the car and build, fixed for the race, never pinned (nitro and highways included)', () => {
    for (const c of CARS.filter((x) => x.enabled)) {
      const stock = gaugeRange(c.id, build(c.id, 1));
      const full = gaugeRange(c.id, build(c.id));
      expect(full).toBeGreaterThanOrEqual(stock);
      expect(full % 20).toBe(0);
      expect(full).toBeLessThanOrEqual(400);
    }
    // the busiest highway runs with Perfect boosts never pass the dial
    for (const [ev, car] of [['causeway-run', 'meridian'], ['bridge-trap', 'super'], ['grand-riviera', 'sovereign'], ['coast-crown', 'tourer'], ['maple-mile', 'beater'], ['launch-final', 'tempest']] as [string, CarId][]) {
      const s = setup(ev, car, 'clean', 3, { windowScale: 1.6 });
      const range = gaugeRange(car, s.player.stats, s.player.perfectMul);
      const sim = new RaceSim(s);
      let peak = 0;
      while (!sim.done && sim.player.finishTime === null) {
        if (sim.charges > 0 && sim.player.nitroLeft <= 0) sim.tapNitro();
        sim.step();
        peak = Math.max(peak, mph(sim.player.v));
      }
      expect(peak, `${ev} ${car}`).toBeLessThanOrEqual(range);
      // and the dial is not absurdly big for the car either: the run uses over half of it
      expect(peak / range, `${ev} ${car}`).toBeGreaterThan(0.5);
    }
  });

  it('the acceleration sweep is the real speed gained over the last GAIN_S, zero while braking', () => {
    const sim = new RaceSim(setup('canyon-stage', 'rally', 'clean'));
    const samples: [number, number][] = [];
    let sawGain = false, sawBrakeZero = false;
    while (!sim.done && sim.player.finishTime === null) {
      sim.step();
      const v = mph(sim.player.v);
      samples.push([sim.t, v]);
      while (samples.length > 2 && samples[1][0] < sim.t - GAIN_S) samples.shift();
      const g = speedGain(samples, sim.t, v);
      const ref = samples.find(([t]) => t >= sim.t - GAIN_S)![1];
      expect(g).toBe(Math.max(0, v - ref));
      if (g > 5) sawGain = true;
      if (sim.player.braking && sim.t > 3 && g === 0) sawBrakeZero = true;
    }
    expect(sawGain && sawBrakeZero).toBe(true);
    void RACE;
  });

  it('every car has a cluster: one layout, dressed by tier (starter → sport → pro → flagship)', () => {
    const order: Record<string, number> = { starter: 0, sport: 1, pro: 2, flagship: 3 };
    expect(clusterStyle('junker').tier).toBe('starter');
    expect(clusterStyle('sovereign').face).toBe('gold');
    expect(clusterStyle('tempest').face).toBe('volt');
    for (const c of CARS) expect(clusterStyle(c.id).accent).toMatch(/^#[0-9a-f]{6}$/i);
    // dressing never goes backwards along the car ladder's first three chapters
    expect(order[clusterStyle('junker').tier]).toBeLessThan(order[clusterStyle('muscle').tier]);
    expect(order[clusterStyle('muscle').tier]).toBeLessThan(order[clusterStyle('super').tier]);
    expect(order[clusterStyle('super').tier]).toBeLessThan(order[clusterStyle('sovereign').tier]);
  });
});
