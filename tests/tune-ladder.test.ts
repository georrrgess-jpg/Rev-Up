// Rival pace tuner (prints only; run with PROBE=1). For each event in tests/ladder.ts TARGETS, find the pace multiplier
// that puts the deciding rival halfway between the slowest "win" input and the fastest "lose" input on the event's
// reference build, and print the RIVAL_PACE table to paste into src/data/tables.ts. Then re-run the difficulty test.
//
//   PROBE=1 npx vitest run tests/tune-ladder.test.ts
import { describe, it } from 'vitest';
import { CATEGORY, LADDER_BUILDS, TARGETS, decidingRivalTime, playerTime } from './ladder';
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
      const tWin = Math.max(...cat.win.map((i) => playerTime(id, b, i)));
      const tLose = Math.min(...cat.lose.map((i) => playerTime(id, b, i)));
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
    console.log(notes.join('\n') + '\n\nexport const RIVAL_PACE: Record<string, number> = {\n' + out.join('\n') + '\n};');
  }, 600_000);
});
