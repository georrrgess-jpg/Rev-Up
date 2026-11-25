// Rival pace tuner (prints only; run with PROBE=1). For each event in tests/ladder.ts TARGETS, find the pace multiplier
// that puts the deciding rival halfway between the slowest "win" input and the fastest "lose" input on the event's
// reference build, and print the RIVAL_PACE table to paste into src/data/tables.ts. Then re-run the difficulty test.
//
//   PROBE=1 npx vitest run tests/tune-ladder.test.ts
import { describe, it } from 'vitest';
import { CATEGORY, LADDER_BUILDS, TARGETS, decidingRivalTime, playerTime, probeEvent } from './ladder';
import { RIVALS, RIVAL_PACE, eventById } from '../src/data/tables';

describe.skipIf(!process.env.PROBE)('rival pace tuner', () => {
  it('prints a RIVAL_PACE table', () => {
    const seeds = 6;
    const out: string[] = [];
    const notes: string[] = [];
    for (const [id, t] of Object.entries(TARGETS)) {
      const e = eventById(id);
      const b = LADDER_BUILDS[id][t.ref];
      const cat = CATEGORY[t.cat];
      const tWin = Math.max(...cat.win.map((i) => playerTime(id, b, i)), ...cat.tuned.map((i) => playerTime(id, b, i, 3)));
      const tLose = cat.lose.length ? Math.min(...cat.lose.map((i) => playerTime(id, b, i))) : tWin + 0.6;
      const target = (tWin + tLose) / 2;
      const base = e.rivals.map((r) => ({ ...RIVALS[r].stats }));
      const apply = (m: number) => e.rivals.forEach((r, i) => { RIVALS[r].stats = { top: base[i].top * m, accel: base[i].accel * m, grip: base[i].grip * m }; });
      let lo = 0.6, hi = 1.6;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        if (decidingRivalTime(id, seeds) > target) lo = mid; else hi = mid;
      }
      const m = (lo + hi) / 2;
      apply(1);
      const pace = (RIVAL_PACE[id] ?? 1) * m;
      out.push(`  '${id}': ${pace.toFixed(3)},`);
      notes.push(`${id.padEnd(18)} ${b.car} E${b.tiers.join('/')} win≤${tWin.toFixed(2)} lose≥${tLose.toFixed(2)} margin ${((tLose - tWin) / 2).toFixed(2)} s${tLose <= tWin ? '  ** CONFLICT' : ''} → ×${m.toFixed(3)}`);
    }
    // Goal par times (full build, ordinary shifts, late boosts), time-attack medals and speed-trap medals
    const t = (id: string, car: string, tiers: number[], sh: string, ni: string) => probeEvent(id, { car: car as never, tiers: tiers as never, label: '' }, sh as never, ni as never, 1);
    const pars: string[] = [];
    for (const [id, car, tiers] of [['neon-mile', 'tourer', [6, 6, 6]], ['stock-cup', 'tuner', [4, 4, 4]], ['skyline-run', 'tourer', [6, 6, 6]], ['midnight-run', 'super', [7, 7, 7]], ['canyon-qualifier', 'super', [7, 7, 7]], ['glacier-pass', 'gt', [8, 8, 8]], ['summit-1000', 'gt', [8, 8, 8]], ['summit-gala', 'proto', [9, 9, 9]]] as const)
      pars.push(`par ${id}: ${(Math.ceil(t(id, car, [...tiers], 'ordinary', 'late').time * 10) / 10).toFixed(1)}`);
    for (const [id, car, tiers] of [['ta-strip', 'hothatch', [4, 4, 4]], ['ta-maple', 'muscle', [5, 5, 5]], ['ta-cliffs', 'tourer', [6, 6, 6]], ['ta-canyon', 'rally', [8, 8, 8]], ['ta-summit', 'proto', [9, 9, 9]]] as const) {
      const r = (sh: string, ni: string) => (Math.ceil((t(id, car, [...tiers], sh, ni).time + 0.05) * 10) / 10).toFixed(1);
      pars.push(`timeAttack ${id} (${car}): { bronze: ${r('ordinary', 'none')}, silver: ${r('clean', 'late')}, gold: ${r('clean', 'perfect')} }`);
    }
    const trap = (id: string, car: string, tiers: number[], sh: string, ni: string) => probeEvent(id, { car: car as never, tiers: tiers as never, label: '' }, sh as never, ni as never, 1).trap;
    pars.push(`speedTrap bridge-trap: { bronze: ${trap('bridge-trap', 'tourer', [6, 6, 6], 'ordinary', 'late')}, silver: ${trap('bridge-trap', 'super', [7, 7, 7], 'ordinary', 'late')}, gold: ${trap('bridge-trap', 'super', [7, 7, 7], 'clean', 'perfect') - 1} }`);
    pars.push(`speedTrap mesa-trap: { bronze: ${trap('mesa-trap', 'super', [7, 7, 7], 'ordinary', 'late')}, silver: ${trap('mesa-trap', 'gt', [8, 8, 8], 'clean', 'perfect')}, gold: ${trap('mesa-trap', 'proto', [9, 9, 9], 'clean', 'perfect') - 1} }`);
    console.log(pars.join('\n'));
    console.log(notes.join('\n') + '\n\nexport const RIVAL_PACE: Record<string, number> = {\n' + out.join('\n') + '\n};');
  }, 600_000);
});
