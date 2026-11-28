// The nitro sequence (Redline): every beat is read from the sim's own boost state, a Perfect boost keeps its real
// advantage, and nothing outlives the boost (its end, the finish line, pause or a new race).
import { describe, expect, it } from 'vitest';
import { RaceSim } from '../src/core/race';
import { statsFor } from '../src/core/loadout';
import { CARS, RACE, type CarId, type Family } from '../src/data/tables';
import type { Part } from '../src/core/state';
import { NitroFx } from '../src/render/nitroFx';
import { FINISH_SETTLE_S, NITRO_STYLE, SETTLE_S, nitroBeat, nitroEnvelope, nitroReadiness } from '../src/ui/nitroSequence';

const build = (car: CarId, t: number) => {
  const eq: Partial<Record<Family, Part>> = {};
  (['engine', 'tires', 'turbo'] as Family[]).forEach((f, i) => { eq[f] = { id: i + 1, f, t, q: 'std' }; });
  return statsFor(car, eq);
};
const setup = (eventId: string, car: CarId, t: number, perfectMul?: number) =>
  ({ eventId, seed: 5, player: { name: 'You', car, stats: build(car, t), paint: '#fff', perfectMul }, nitroCharges: 3 });

/** Run to the first boost zone; fire either inside it (Perfect) or the same distance before it (ordinary). */
function boostRun(kind: 'perfect' | 'ordinary', eventId = 'maple-mile', car: CarId = 'muscle', t = 4, perfectMul?: number) {
  const sim = new RaceSim(setup(eventId, car, t, perfectMul));
  const w = sim.windows[0];
  const at = kind === 'perfect' ? w.start + 1 : w.start - 40;
  const fx = new NitroFx(false);
  const trace: { left: number; level: number; beat: string }[] = [];
  let fired = false;
  while (!sim.done && sim.t < 60) {
    if (!fired && sim.player.x >= at) { expect(sim.tapNitro()).toBe(kind === 'perfect' ? 'perfect' : 'boost'); fired = true; }
    sim.step();
    fx.update(RACE.dt, sim, 1);
    if (fired) trace.push({ left: sim.player.nitroLeft, level: fx.level, beat: nitroBeat(sim) });
    if (sim.lastBoostGain) break;
  }
  return { sim, fx, trace, gain: sim.lastBoostGain! };
}

describe('nitro envelope', () => {
  it('is on from the first frame, full through the boost and exactly 0 when the boost ends', () => {
    const D = RACE.nitroDurationS;
    expect(nitroEnvelope(0)).toBe(0);
    expect(nitroEnvelope(D)).toBeGreaterThanOrEqual(0.6);
    expect(nitroEnvelope(D / 2)).toBe(1);
    let prev = 1;
    for (let left = SETTLE_S; left >= 0; left -= 0.01) { const e = nitroEnvelope(left); expect(e).toBeLessThanOrEqual(prev + 1e-9); prev = e; }
    expect(nitroEnvelope(1e-6)).toBeLessThan(1e-3);
  });
  it('has a style for every player car', () => {
    for (const c of CARS) expect(NITRO_STYLE[c.id] ?? NITRO_STYLE.beater).toBeTruthy();
    expect(NITRO_STYLE.tempest.family).toBe('arcs');
    expect(NITRO_STYLE.super.family).toBe('trail');
    expect(NITRO_STYLE.muscle.family).toBe('flame');
  });
});

describe('nitro sequence follows the sim', () => {
  it('fire → settle → idle on the same steps as the boost, never longer', () => {
    const { trace } = boostRun('perfect');
    expect(trace.length).toBeGreaterThan(0);
    for (const f of trace) {
      expect(f.level > 0).toBe(f.left > 0);
      if (f.left > SETTLE_S) expect(f.beat).toBe('fire');
      else if (f.left > 0) expect(f.beat).toBe('settle');
    }
    // the boost lasted the sim's duration (one step of rounding)
    const boostSteps = trace.filter((f) => f.left > 0).length;
    expect(Math.abs(boostSteps * RACE.dt - RACE.nitroDurationS)).toBeLessThanOrEqual(RACE.dt * 1.5);
    expect(trace[trace.length - 1].level).toBe(0);
  });

  it('shows Ready only with a charge and a zone coming, and not while boosting', () => {
    const sim = new RaceSim(setup('maple-mile', 'muscle', 4));
    const w = sim.windows[0];
    let sawReady = false;
    while (sim.player.x < w.start + 1) {
      sim.step();
      const r = nitroReadiness(sim);
      if (r > 0) { sawReady = true; expect(nitroBeat(sim)).toBe('ready'); }
    }
    expect(sawReady).toBe(true);
    expect(nitroReadiness(sim)).toBe(1); // inside the unused zone
    sim.tapNitro();
    expect(nitroReadiness(sim)).toBe(0);
    expect(nitroBeat(sim)).toBe('fire');
    const empty = new RaceSim({ ...setup('maple-mile', 'muscle', 4), nitroCharges: 0 });
    while (empty.player.x < empty.windows[0].start + 1) empty.step();
    expect(nitroReadiness(empty)).toBe(0);
  });

  it('a Perfect boost looks Perfect and gains more than an ordinary one (Ironhorse 1.5×, Lumen 1.7×)', () => {
    const p = boostRun('perfect');
    const o = boostRun('ordinary');
    expect(p.gain.perfect).toBe(true);
    expect(o.gain.perfect).toBe(false);
    expect(p.gain.seconds).toBeGreaterThan(o.gain.seconds * 1.2);
    expect(p.sim.player.nitroMul).toBe(1.5);
    const lumen = CARS.find((c) => c.id === 'super')!.perfectMul;
    expect(lumen).toBe(1.7);
    const lp = boostRun('perfect', 'main-event', 'super', 7, lumen);
    const lo = boostRun('ordinary', 'main-event', 'super', 7, lumen);
    expect(lp.sim.player.nitroMul).toBe(1.7);
    expect(lp.gain.seconds).toBeGreaterThan(lo.gain.seconds);
  });

  it('settles at the finish line even though the sim freezes the boost clock there', () => {
    const sim = new RaceSim(setup('maple-mile', 'muscle', 4));
    const fx = new NitroFx(false);
    while (sim.player.x < sim.length - 15) { sim.step(); fx.update(RACE.dt, sim, 1); }
    sim.tapNitro();
    while (sim.player.finishTime === null) { sim.step(); fx.update(RACE.dt, sim, 1); }
    expect(sim.player.nitroLeft).toBeGreaterThan(0); // frozen by the sim
    let t = 0;
    while (t < FINISH_SETTLE_S + 0.05) { sim.step(); fx.update(RACE.dt, sim, 1); t += RACE.dt; }
    expect(fx.level).toBe(0);
    expect(fx.flame(sim.player)).toBe(0);
    expect(fx.perfect).toBe(false);
  });

  it('pause hides every transient effect and reset clears it all', () => {
    const { sim, fx } = boostRun('perfect');
    sim.tapNitro(); // a second charge, outside a zone
    for (let i = 0; i < 10; i++) { sim.step(); fx.update(RACE.dt, sim, 1); }
    expect(fx.flame(sim.player)).toBeGreaterThan(0);
    fx.setPaused(true);
    expect(fx.flame(sim.player)).toBe(0);
    fx.setPaused(false);
    expect(fx.flame(sim.player)).toBeGreaterThan(0);
    fx.reset();
    expect([fx.level, fx.surge, fx.room, fx.ready, fx.ignite]).toEqual([0, 0, 0, 0, 0]);
  });

  it('lighter effects: the setting, a quality drop or reduced motion; no embers and no camera surge with reduced motion', () => {
    const sim = new RaceSim(setup('maple-mile', 'muscle', 4));
    while (sim.player.x < 120) sim.step();
    sim.tapNitro();
    const light = new NitroFx(false, true), full = new NitroFx(false), calm = new NitroFx(true);
    for (let i = 0; i < 30; i++) { sim.step(); light.update(RACE.dt, sim, 1); full.update(RACE.dt, sim, 1); calm.update(RACE.dt, sim, 1); }
    const embers = (f: NitroFx) => (f as unknown as { embers: unknown[] }).embers.length;
    expect(light.light).toBe(true);
    expect(calm.light).toBe(true);
    expect(full.light).toBe(false);
    expect(embers(light)).toBe(0);
    expect(embers(full)).toBeGreaterThan(0);
    expect(embers(full)).toBeLessThanOrEqual(24);
    expect(calm.surge).toBe(0);
    expect(full.surge).toBeGreaterThan(0);
    full.update(RACE.dt, sim, 0); // the race dropped quality
    expect(full.light).toBe(true);
    expect(light.level).toBe(full.level); // the boost reads the same in every mode
  });
});
