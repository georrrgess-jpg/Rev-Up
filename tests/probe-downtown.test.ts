// Ladder calibration probe (prints only; run with PROBE=1). For each event, the car and build a player brings when
// the event opens ("arrival") and when it is built out ("full"), raced on the same seeds and rivals (each event's own
// rival shift quality) with missed / ordinary / clean shifting × no / late / Perfect nitro. Cells: wins out of N.
//
//   PROBE=1 npx vitest run tests/probe-downtown.test.ts
//   PROBE=1 PROBE_EVENTS=neon-mile,summit-gala PROBE_SEEDS=10 npx vitest run tests/probe-downtown.test.ts
import { describe, it } from 'vitest';
import { probeEvent, LADDER_BUILDS, SHIFTS, NITROS } from './ladder';
import { EVENTS } from '../src/data/tables';

describe.skipIf(!process.env.PROBE)('ladder calibration probe', () => {
  it('prints wins by shift × nitro for each event at arrival and full builds', () => {
    const seeds = Number(process.env.PROBE_SEEDS ?? 8);
    const only = process.env.PROBE_EVENTS?.split(',');
    const lines: string[] = [`seeds ${seeds}; cells: wins/${seeds} (mean time s) — rows missed/ordinary/clean shifting, columns no/late/Perfect nitro`];
    for (const e of EVENTS.filter((x) => !x.knockout && (!only || only.includes(x.id)))) {
      for (const b of LADDER_BUILDS[e.id] ?? []) {
        lines.push(`\n${e.id} · ${b.car} E${b.tiers[0]}T${b.tiers[1]}U${b.tiers[2]}${b.tune ? ` tune${b.tune}` : ''} (${b.label})`);
        for (const sh of SHIFTS) {
          const cells = NITROS.map((ni) => { const r = probeEvent(e.id, b, sh, ni, seeds); return `${e.speedTrap ? `${r.trap}mph` : e.timeAttack ? `${r.time.toFixed(2)}s` : `W${r.wins} ${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(2)}`} top${r.top}`.padEnd(22); });
          lines.push(`  ${sh.padEnd(9)}${cells.join('')}`);
        }
      }
    }
    console.log(lines.join('\n'));
  }, 600_000);
});
