// Job Board balance (simulation): the ladder measured from a fresh save with the board off and on, for the clean and
// the weak player types, through the real rules. The bot plays as before; with the board on, race and merge jobs
// complete as it plays, and it hands in a delivery whenever it holds the part (what a player would do).
// Guard: the board may speed the ladder only modestly — it must not let a player skip cars.
import { describe, expect, it } from 'vitest';
import * as J from '../src/core/jobs';
import { CarId, carById } from '../src/data/tables';
import { PLAYERS, fmtMin, runBot } from './bot';

const LADDER: CarId[] = ['beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'];

function run(kind: 'clean' | 'weak', on: boolean) {
  J.jobsSwitch.off = !on;
  let jobs = 0, cash = 0, level = 1, skips = 0, hooked = false;
  /** when each open job was first seen and its progress then: a player skips a job that hasn't moved in 5 minutes */
  const seen = new Map<number, { t: number; p: number }>();
  try {
    const L = runBot({
      ...PLAYERS[kind], seed: 1, untilCar: 'proto', maxS: 3 * 3600,
      onStep: (g, t) => {
        if (!on) return;
        if (!hooked) { hooked = true; g.subscribe((ev) => { for (const e of ev) if (e.type === 'job') cash += e.cash; }); }
        const now = 1_000_000 + t * 1000; // the bot's clock
        for (const job of J.readJobs(g.state).slots) {
          if (!job) continue;
          if (job.kind === 'deliver' && J.deliverPreview(g.state, job)) { g.deliverJob(job.id, undefined, now); continue; }
          const s0 = seen.get(job.id);
          if (!s0 || s0.p !== job.progress) seen.set(job.id, { t, p: job.progress });
          else if (t - s0.t > 300) { g.skipJob(job.id, now); skips++; }
        }
        const r = J.readJobs(g.state);
        jobs = r.done; level = r.level;
      },
    });
    return { L, jobs, level, cash, skips };
  } finally {
    J.jobsSwitch.off = false;
  }
}

describe('Job Board balance (simulation)', () => {
  it('keeps the time to each car within a modest margin of the board-off run', () => {
    const lines: string[] = [];
    for (const kind of ['clean', 'weak'] as const) {
      const off = run(kind, false);
      const on = run(kind, true);
      lines.push(`\n== ${kind}: Halcyon ${fmtMin(off.L.milestones.proto)} → ${fmtMin(on.L.milestones.proto)} · jobs cleared ${on.jobs} (skipped ${on.skips}) · job cash ${'$'}${on.cash} · Garage Level ${on.level}`);
      lines.push('car'.padEnd(16) + 'min off → on    races off → on');
      for (const c of LADDER) {
        const a = off.L.milestones[c], b = on.L.milestones[c];
        lines.push(`${carById(c).model.padEnd(16)}${fmtMin(a).padStart(6)} → ${fmtMin(b).padEnd(7)}  ${String(off.L.racesAt[c] ?? '—').padStart(4)} → ${on.L.racesAt[c] ?? '—'}`);
      }
      console.log(lines.join('\n')); lines.length = 0; // print before asserting, so a failure shows the table
      expect(on.L.milestones.proto).toBeGreaterThan(0);
      expect(on.jobs).toBeGreaterThan(10); // the bot meets the board as it plays
      // the board is a bonus, not a shortcut. A clean player is unchanged (every car within 12%, the ladder within 8%);
      // a struggling player gets more from it (catch-up: deliveries and level rewards), bounded at 20% / 18%.
      const [car, ladder] = kind === 'clean' ? [0.88, 0.92] : [0.8, 0.82];
      for (const c of LADDER) {
        const a = off.L.milestones[c], b = on.L.milestones[c];
        if (a && b && a > 600) expect(b / a).toBeGreaterThan(car);
      }
      expect(on.L.milestones.proto! / off.L.milestones.proto!).toBeGreaterThan(ladder);
    }
    console.log(lines.join('\n'));
  }, 300_000);
});
