// Circuit update (Racing and competition): the new events' difficulty by input quality, launch control, a fitting part
// or tune changing a result, personal-best ghosts, the rival ladder / class series summary and explainFinish.
// Pace tuner (prints only): PROBE=1 npx vitest run tests/circuit.test.ts -t tuner
import { describe, expect, it } from 'vitest';
import { RaceSim, ShiftPolicy } from '../src/core/race';
import { rivalShiftFor } from '../src/core/progression';
import { Build, buildStats } from './ladder';
import { CIRCUIT_PACE } from '../src/data/circuit';
import { RIVALS, carById, eventById } from '../src/data/tables';
import { mph } from '../src/core/units';
import {
  GHOST_DT, cleanGhosts, commitCircuit, competitionSummary, explainFinish, ghostTimeAt, ghostX, readGhost,
} from '../src/core/circuit';
import { newGame } from '../src/core/state';
import { drivetrainFor } from '../src/data/drivetrain';

type Nitro = 'none' | 'late' | 'perfect';
type Launch = 'perfect' | 'none';
interface Input { shift: ShiftPolicy; nitro: Nitro; launch?: Launch }

/** One race on a fixed seed with these inputs (the player's run does not depend on the seed). */
function race(eventId: string, b: Build, inp: Input, seed = 101, charges = 2) {
  const e = eventById(eventId);
  const sim = new RaceSim({
    eventId, seed, player: { name: 'p', car: b.car, stats: buildStats(b, e.partCap), paint: '#fff', perfectMul: carById(b.car).perfectMul },
    nitroCharges: inp.nitro === 'none' ? 0 : charges, shift: inp.shift, rivalShift: rivalShiftFor(e), launch: inp.launch ?? 'none',
  });
  while (!sim.done) {
    if (sim.charges > 0 && sim.player.nitroLeft <= 0 && sim.player.finishTime === null) {
      const { active } = sim.windowState();
      if (inp.nitro === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
      if (inp.nitro === 'late' && !active && sim.windows.some((w) => sim.player.x > w.end && sim.player.x < w.end + 25)) sim.tapNitro();
    }
    sim.step();
  }
  return sim.outcome();
}
const wins = (eventId: string, b: Build, inp: Input, seeds = 6) => {
  let w = 0;
  for (let k = 1; k <= seeds; k++) if (race(eventId, b, inp, k * 101).place === 1) w++;
  return w;
};
const B = (car: Build['car'], tiers: Build['tiers'], tune = 0): Build => ({ car, tiers, tune, label: '' });

/** Each Circuit event: the build a player brings, inputs that must win, inputs that must lose. */
const TARGETS: Record<string, { b: Build; win: Input[]; lose: Input[]; soft?: Input[] }> = {
  // a class round for an older car: approachable (ordinary shifts with a Perfect boost win; missed with no nitro loses)
  'kestrel-chicane': { b: B('tuner', [6, 6, 6]), win: [{ shift: 'ordinary', nitro: 'perfect' }, { shift: 'clean', nitro: 'late' }], lose: [{ shift: 'missed', nitro: 'none' }] },
  'corvo-airfield': { b: B('rally', [8, 8, 8]), win: [{ shift: 'clean', nitro: 'perfect' }, { shift: 'ordinary', nitro: 'perfect' }], lose: [{ shift: 'missed', nitro: 'late' }, { shift: 'missed', nitro: 'none' }], soft: [{ shift: 'ordinary', nitro: 'none' }] },
  // ladder rungs: clean inputs on the right car win; missed inputs lose
  'esplanade-gp': { b: B('ardent', [8, 8, 8]), win: [{ shift: 'clean', nitro: 'perfect' }, { shift: 'clean', nitro: 'late' }], lose: [{ shift: 'missed', nitro: 'late' }, { shift: 'missed', nitro: 'none' }], soft: [{ shift: 'ordinary', nitro: 'none' }] },
  'causeway-run': { b: B('meridian', [9, 9, 9]), win: [{ shift: 'clean', nitro: 'perfect' }, { shift: 'ordinary', nitro: 'perfect' }], lose: [{ shift: 'missed', nitro: 'late' }, { shift: 'missed', nitro: 'none' }], soft: [{ shift: 'ordinary', nitro: 'none' }] },
  // the top rung: launch control, clean shifts and Perfect boosts on a full Tempest; without launch control it loses
  'circuit-crown': { b: B('tempest', [10, 10, 10]), win: [{ shift: 'clean', nitro: 'perfect', launch: 'perfect' }], lose: [{ shift: 'missed', nitro: 'late', launch: 'perfect' }, { shift: 'clean', nitro: 'perfect', launch: 'none' }], soft: [{ shift: 'ordinary', nitro: 'perfect', launch: 'perfect' }] },
};

describe.skipIf(!process.env.PROBE)('circuit pace tuner', () => {
  it('prints CIRCUIT_PACE and time-trial medal times', () => {
    const out: string[] = [], notes: string[] = [];
    for (const [id, t] of Object.entries(TARGETS)) {
      const e = eventById(id);
      const tWin = Math.max(...t.win.map((i) => race(id, t.b, i).playerTime!));
      const tLose = Math.min(...t.lose.map((i) => race(id, t.b, i).playerTime!));
      const soft = Math.min(Infinity, ...(t.soft ?? []).map((i) => race(id, t.b, i).playerTime!));
      const target = Math.max(tWin + Math.min(0.15, (tLose - tWin) / 2), Math.min((tWin + tLose) / 2, soft - 0.12));
      const base = e.rivals.map((r) => ({ ...RIVALS[r].stats }));
      const apply = (m: number) => e.rivals.forEach((r, i) => { RIVALS[r].stats = { top: base[i].top * m, accel: base[i].accel * m, grip: base[i].grip * m }; });
      const decide = () => {
        let sum = 0;
        for (let seed = 1; seed <= 6; seed++) {
          const sim = new RaceSim({ eventId: id, seed: seed * 101, player: { name: 'p', car: 'junker', stats: { top: 300, accel: 40, grip: 9 }, paint: '#fff' }, nitroCharges: 0, rivalShift: rivalShiftFor(e), analysis: false });
          while (!sim.done) sim.step();
          sum += Math.min(...sim.racers.filter((r) => !r.isPlayer).map((r) => r.finishTime ?? 99));
        }
        return sum / 6;
      };
      let lo = 0.6, hi = 1.6;
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; apply(mid); if (decide() > target) lo = mid; else hi = mid; }
      const m = (lo + hi) / 2;
      apply(1);
      out.push(`  '${id}': ${((CIRCUIT_PACE[id] ?? 1) * m).toFixed(3)},`);
      notes.push(`${id.padEnd(16)} ${t.b.car} win≤${tWin.toFixed(2)} lose≥${tLose.toFixed(2)} soft ${soft.toFixed(2)} → ×${m.toFixed(3)}${tLose <= tWin ? ' ** CONFLICT' : ''}`);
    }
    const ta = (id: string, b: Build) => {
      const r = (i: Input) => (Math.ceil((race(id, b, i).playerTime! + 0.05) * 10) / 10).toFixed(1);
      return `${id} (${b.car}): { bronze: ${r({ shift: 'ordinary', nitro: 'none' })}, silver: ${r({ shift: 'clean', nitro: 'late' })}, gold: ${r({ shift: 'clean', nitro: 'perfect' })} }`;
    };
    console.log([ta('ta-esplanade', B('vireo', [9, 9, 9])), ta('ta-causeway', B('vireo', [9, 9, 9])), ta('ta-airstrip', B('vireo', [9, 9, 9]))].join('\n'));
    console.log(notes.join('\n') + '\n\nexport const CIRCUIT_PACE: Record<string, number> = {\n' + out.join('\n') + '\n};');
  }, 300_000);
});

/** A live-style run: SHIFT is tapped `react` seconds after the light turns green (manual policy, the HUD's own cue). */
function tapRun(eventId: string, b: Build, react = 0.2) {
  const e = eventById(eventId);
  const sim = new RaceSim({ eventId, seed: 101, player: { name: 'p', car: b.car, stats: buildStats(b, e.partCap), paint: '#fff' }, nitroCharges: 0, shift: 'manual', rivalShift: rivalShiftFor(e) });
  let greenAt = -1;
  let maxDownsInZone = 0, zoneDowns = 0, lastBrake = -9;
  while (!sim.done && sim.player.finishTime === null) {
    if (sim.attempt.cue === 'green') { if (greenAt < 0) greenAt = sim.t; if (sim.t - greenAt >= react) { sim.tapShift(); greenAt = -1; } }
    else greenAt = -1;
    const downs = sim.autoDowns;
    sim.step();
    if (sim.player.braking) { if (sim.t - lastBrake > 0.3) zoneDowns = 0; lastBrake = sim.t; }
    if (sim.autoDowns > downs) { zoneDowns++; maxDownsInZone = Math.max(maxDownsInZone, zoneDowns); }
  }
  return { o: sim.outcome(), downs: sim.autoDowns, maxDownsInZone };
}

describe('circuit events', () => {
  it('each Circuit event: win inputs win and lose inputs lose on the build a player brings', () => {
    const fails: string[] = [];
    for (const [id, t] of Object.entries(TARGETS)) {
      for (const i of t.win) { const w = wins(id, t.b, i); if (w < 5) fails.push(`${id} ${JSON.stringify(i)} should win (${w}/6)`); }
      for (const i of t.lose) { const w = wins(id, t.b, i); if (w > 1) fails.push(`${id} ${JSON.stringify(i)} should lose (${w}/6)`); }
    }
    expect(fails).toEqual([]);
  });

  it('clean vs missed shifting in the same event: clean wins, a missed run still finishes (recoverable) and loses', () => {
    const rows: string[] = [];
    for (const [id, b] of [['esplanade-gp', B('ardent', [8, 8, 8])], ['causeway-run', B('meridian', [9, 9, 9])], ['circuit-crown', B('tempest', [10, 10, 10])]] as const) {
      const clean = race(id, b, { shift: 'clean', nitro: 'perfect', launch: 'perfect' });
      const missed = race(id, b, { shift: 'missed', nitro: 'perfect', launch: 'perfect' });
      rows.push(`${id.padEnd(16)} clean ${clean.playerTime!.toFixed(2)} s (${clean.place}) · missed ${missed.playerTime!.toFixed(2)} s (${missed.place}) · Δ ${(missed.playerTime! - clean.playerTime!).toFixed(2)} s · shifts ${clean.shifts}`);
      expect(missed.playerTime).not.toBeNull();
      expect(missed.playerTime! - clean.playerTime!).toBeGreaterThan(0.3);
      expect(clean.place).toBe(1);
      expect(missed.place).toBeGreaterThan(1);
    }
    console.log(rows.join('\n'));
  });

  it('a fitting part or tune changes the result', () => {
    // the Causeway is the course where the engine matters most: on ordinary shifts with Perfect boosts the full
    // build wins, and arriving with a T7 engine loses; the engine is worth more there than on any other course
    const inp: Input = { shift: 'ordinary', nitro: 'perfect' };
    const full = race('causeway-run', B('meridian', [9, 9, 9]), inp);
    const t7Engine = race('causeway-run', B('meridian', [7, 9, 9]), inp);
    console.log(`causeway (ordinary/perfect): full ${full.playerTime!.toFixed(2)} (${full.place}) · T7 engine ${t7Engine.playerTime!.toFixed(2)} (${t7Engine.place})`);
    expect(full.place).toBe(1);
    expect(t7Engine.place).toBeGreaterThan(1);
    const engineWorth = (id: string, b: Build) => race(id, { ...b, tiers: [b.tiers[0] - 1, b.tiers[1], b.tiers[2]] }, { shift: 'clean', nitro: 'perfect' }).playerTime! - race(id, b, { shift: 'clean', nitro: 'perfect' }).playerTime!;
    const causeway = engineWorth('causeway-run', B('meridian', [9, 9, 9]));
    for (const [id, b] of [['esplanade-gp', B('meridian', [9, 9, 9])], ['grand-riviera', B('meridian', [9, 9, 9])], ['corniche', B('meridian', [9, 9, 9])], ['port-sprint', B('meridian', [9, 9, 9])]] as const)
      expect(causeway).toBeGreaterThan(engineWorth(id, b));
    // the Esplanade is a grip course: T7 tyres lose; an ordinary-shift no-nitro run loses until all three Tune-up stages are bought
    const t7 = race('esplanade-gp', B('ardent', [8, 7, 8]), { shift: 'clean', nitro: 'late' });
    console.log(`esplanade (clean/late): T7 tires ${t7.playerTime!.toFixed(2)} (${t7.place})`);
    expect(t7.place).toBeGreaterThan(1);
    expect(race('esplanade-gp', B('ardent', [8, 8, 8]), { shift: 'ordinary', nitro: 'none' }).place).toBeGreaterThan(1);
    expect(race('esplanade-gp', B('ardent', [8, 8, 8], 3), { shift: 'ordinary', nitro: 'none' }).place).toBe(1);
  });

  it('courses ask for different things: each new supercar wins its own course against the others', () => {
    const t = (id: string, b: Build) => race(id, b, { shift: 'clean', nitro: 'perfect', launch: 'perfect' }).playerTime!;
    const ardent = B('ardent', [8, 8, 8]), meridian = B('meridian', [9, 9, 9]), tempest = B('tempest', [10, 10, 10]);
    expect(t('esplanade-gp', ardent)).toBeLessThan(t('esplanade-gp', meridian));
    expect(t('causeway-run', meridian)).toBeLessThan(t('causeway-run', ardent));
    expect(t('circuit-crown', tempest)).toBeLessThan(t('circuit-crown', meridian));
  });

  it('Tempest launch control: on GO it wins the launch; a mistimed tap is a normal launch', () => {
    const b = B('tempest', [10, 10, 10]);
    const lc = race('circuit-crown', b, { shift: 'clean', nitro: 'perfect', launch: 'perfect' });
    const no = race('circuit-crown', b, { shift: 'clean', nitro: 'perfect', launch: 'none' });
    expect(lc.launchControl).toBe(true);
    expect(no.launchControl).toBe(false);
    const me = (o: typeof lc) => o.standings.find((r) => r.isPlayer)!.splits[0];
    expect(me(no) - me(lc)).toBeGreaterThan(0.15);
    expect(lc.place).toBe(1);
    expect(no.place).toBeGreaterThan(1);
    // the live tap: within the window engages it, an early tap does not, and there is one try per start
    const mk = () => new RaceSim({ eventId: 'circuit-crown', seed: 1, player: { name: 'p', car: 'tempest', stats: buildStats(b), paint: '#fff' }, nitroCharges: 0, shift: 'manual' });
    const a = mk(); expect(a.tapLaunch(0.1)).toBe('perfect'); expect(a.player.lc).toBe(true); expect(a.tapLaunch(0)).toBe('done');
    const c = mk(); expect(c.tapLaunch(0.6)).toBe('early'); expect(c.player.lc).toBeFalsy(); expect(c.tapLaunch(0)).toBe('done');
    const other = new RaceSim({ eventId: 'circuit-crown', seed: 1, player: { name: 'p', car: 'meridian', stats: buildStats(B('meridian', [9, 9, 9])), paint: '#fff' }, nitroCharges: 0 });
    expect(other.tapLaunch(0)).toBe('na');
  });

  it('the new supercars shift in sync with the cue: every tap on green is clean, one downshift per braking zone', () => {
    const rows: string[] = [];
    for (const [id, b] of [['esplanade-gp', B('ardent', [8, 8, 8])], ['causeway-run', B('meridian', [9, 9, 9])], ['circuit-crown', B('tempest', [10, 10, 10])], ['esplanade-gp', B('tempest', [10, 10, 10])], ['ta-esplanade', B('meridian', [9, 9, 9])]] as const) {
      const r = tapRun(id, b);
      const d = drivetrainFor(b.car);
      rows.push(`${b.car.padEnd(9)} ${id.padEnd(14)} clean ${r.o.shiftsClean}/${r.o.shifts} · braking downshifts ${r.downs} (max ${r.maxDownsInZone} per zone) · ${d.gears.length} gears · top ${mph(r.o.topSpeed ?? 0)} mph`);
      expect(r.o.shiftsClean).toBe(r.o.shifts);
      expect(r.o.shifts).toBeGreaterThanOrEqual(d.gears.length - 1);
      expect(r.maxDownsInZone).toBeLessThanOrEqual(1);
    }
    console.log(rows.join('\n'));
  });

  it('the three supercars feel distinct: shifts per race and gear count', () => {
    const n = (car: Build['car'], tiers: Build['tiers']) => race('esplanade-gp', B(car, tiers), { shift: 'clean', nitro: 'none' }).shifts!;
    const ardent = n('ardent', [8, 8, 8]), meridian = n('meridian', [9, 9, 9]), tempest = n('tempest', [10, 10, 10]);
    expect(ardent).toBeGreaterThan(meridian);
    expect(meridian).toBeGreaterThan(tempest);
    expect(tempest).toBeLessThanOrEqual(2 + 2); // a three-speed box: two upshifts a straight at most
  });
});

describe('personal-best ghosts', () => {
  it('a time trial saves a ghost, a faster run replaces it, a slower one does not, and the delta is right', () => {
    const s = newGame(0);
    s.owned.push('vireo');
    const b = B('vireo', [9, 9, 9]);
    const slow = race('ta-esplanade', b, { shift: 'ordinary', nitro: 'none' });
    const fast = race('ta-esplanade', b, { shift: 'clean', nitro: 'perfect' });
    const ev: never[] = [];
    const r1 = commitCircuit(s, 1, 'vireo', slow, ev)!;
    expect(r1.newGhost).toBe(true);
    expect(r1.ghostT).toBeNull();
    const g1 = readGhost(s, 'ta-esplanade')!;
    expect(g1.t).toBeCloseTo(slow.playerTime!, 3);
    expect(JSON.stringify(g1).length).toBeLessThan(1200); // compact: a sample every 0.25 s, in decimetres
    // the same race id never commits twice
    expect(commitCircuit(s, 1, 'vireo', fast, ev)).toBeNull();
    const cash0 = s.cash;
    const r2 = commitCircuit(s, 2, 'vireo', fast, ev)!;
    expect(r2.newGhost).toBe(true);
    expect(r2.ghostDelta!).toBeCloseTo(fast.playerTime! - slow.playerTime!, 3);
    expect(r2.earned.map((x) => x.name)).toContain('Faster than yourself');
    expect(s.cash).toBeGreaterThan(cash0);
    const r3 = commitCircuit(s, 3, 'vireo', slow, ev)!;
    expect(r3.newGhost).toBe(false);
    expect(readGhost(s, 'ta-esplanade')!.t).toBeCloseTo(fast.playerTime!, 3);
    // ghostX and ghostTimeAt agree, and the ghost reaches the line at its time
    const g = readGhost(s, 'ta-esplanade')!;
    for (const t of [0.1, 1, 3.3, 7.77, g.t - 0.3]) expect(ghostTimeAt(g, ghostX(g, t))).toBeCloseTo(t, 2);
    expect(ghostTimeAt(g, 650)).toBeCloseTo(g.t, 1);
    expect(GHOST_DT).toBeCloseTo(0.25, 6);
  });

  it('malformed ghosts are dropped on read and by cleanGhosts', () => {
    const s = newGame(0);
    s.ghosts = { 'ta-esplanade': { t: -1, car: 'vireo', d: [1, 2] }, 'ta-causeway': { t: 12, car: 'vireo', d: [5, 3] }, nope: { t: 12, car: 'vireo', d: [1, 2] }, 'ta-airstrip': { t: 14, car: 'vireo', d: [10, 40, 90] } } as never;
    expect(readGhost(s, 'ta-esplanade')).toBeNull();
    cleanGhosts(s);
    expect(Object.keys(s.ghosts!)).toEqual(['ta-airstrip']);
  });
});

describe('competition summary and finish explanations', () => {
  it('summarises the ladder, the Heritage Cup, time trials and milestones', () => {
    const s = newGame(0);
    let c = competitionSummary(s);
    expect(c.ladder.position).toBe(0);
    expect(c.ladder.next?.rival).toBe('ray');
    expect(c.ladder.rungs.every((r) => r.strength && r.line && r.prize)).toBe(true);
    expect(c.series.rounds.length).toBeGreaterThanOrEqual(8);
    expect(c.series.nextPrize?.wins).toBe(3);
    expect(c.trials.some((t) => t.event === 'ta-esplanade')).toBe(true);
    s.bosses.push('ray', 'vale');
    s.owned.push('beater', 'hothatch', 'muscle');
    s.events['tapeback-trophy'] = { wins: 1, starts: 2, bestPlace: 1, bestTime: 15 };
    s.events['corsa-club'] = { wins: 0, starts: 1, bestPlace: 2, bestTime: 18 };
    c = competitionSummary(s);
    expect(c.ladder.position).toBe(2);
    expect(c.ladder.next?.rival).toBe('nova');
    expect(c.series.points).toBe(16);
    expect(c.series.wins).toBe(1);
    expect(c.series.next?.event).toBe('corsa-club');
  });

  it('series prizes and the ladder rung prize pay once', () => {
    const s = newGame(0);
    for (const id of ['tapeback-trophy', 'corsa-club', 'hatch-attack']) s.events[id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 15 };
    const o = race('hatch-attack', B('hothatch', [4, 4, 4]), { shift: 'clean', nitro: 'perfect' });
    const r = commitCircuit(s, 7, 'hothatch', o, [])!;
    expect(r.earned.map((x) => x.name)).toContain('Heritage Cup: 3 round wins');
    expect(s.blueprints).toContain('Heritage Green');
    const r2 = commitCircuit(s, 8, 'hothatch', o, [])!;
    expect(r2.earned.map((x) => x.name)).not.toContain('Heritage Cup: 3 round wins');
    // beating Lorne on the Causeway pays the T9 Turbo once
    s.owned.push('meridian');
    const c = race('causeway-run', B('meridian', [9, 9, 9]), { shift: 'clean', nitro: 'perfect' });
    const parts0 = s.board.filter(Boolean).length + s.crates.length;
    const r3 = commitCircuit(s, 9, 'meridian', c, [])!;
    expect(r3.earned.map((x) => x.name)).toContain('Beat Lorne Gillespie');
    expect(s.board.filter(Boolean).length + s.crates.length).toBeGreaterThan(parts0);
    expect(commitCircuit(s, 10, 'meridian', c, [])!.earned.map((x) => x.name)).not.toContain('Beat Lorne Gillespie');
  });

  it('explainFinish names the zone, the stat and a useful change', () => {
    // short of tyres on the grip course: the bends are where it goes, with the grip numbers, and Tires is the fix
    const grip = race('esplanade-gp', B('ardent', [8, 6, 8]), { shift: 'clean', nitro: 'perfect' });
    const x = explainFinish(grip);
    expect(grip.place).toBeGreaterThan(1);
    expect(x.headline).toMatch(/behind/);
    expect(x.reasons.join(' ')).toMatch(/hairpins: grip \d\.\d\d vs/);
    expect(x.suggestion.action?.family).toBe('tires');
    // missed shifts with a good build: shifting is the reason and the fix
    const miss = race('esplanade-gp', B('ardent', [8, 8, 8]), { shift: 'missed', nitro: 'perfect' });
    const y = explainFinish(miss);
    expect(y.reasons[0]).toMatch(/Shifting cost/);
    expect(y.suggestion.action?.kind).toBe('shift');
    // a win explains the margin
    const win = race('esplanade-gp', B('ardent', [8, 8, 8]), { shift: 'clean', nitro: 'perfect' });
    expect(explainFinish(win).headline).toMatch(/^Won by/);
    // alone on the road
    expect(explainFinish(race('ta-esplanade', B('vireo', [9, 9, 9]), { shift: 'missed', nitro: 'none' })).suggestion.action?.kind).toBe('shift');
    console.log([x, y].map((e) => `${e.headline}\n  ${e.reasons.join('\n  ')}\n  → ${e.suggestion.text}`).join('\n'));
  });
});
