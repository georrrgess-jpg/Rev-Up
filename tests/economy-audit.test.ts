// Economy audit (simulation): cash earned and spent over a full playthrough, what the cash buys and when,
// and the gaps between meaningful rewards. Prints a report; asserts only that the run completes.
// Set AUDIT_SAVES=<dir> to also write realistic saves at key moments for manual review.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as P from '../src/core/progression';
import { encodeSave } from '../src/core/save';
import { EVENTS } from '../src/data/tables';
import { runBot } from './bot';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

describe('economy audit (simulation)', () => {
  it('prints a cash timeline and reward cadence', () => {
    const lines: string[] = [];
    for (const [seed, policy] of [[1, 'perfect'], [2, 'mixed'], [3, 'none']] as const) {
      let prev = -1;
      let earned = 0;
      let spent = 0;
      const marks: string[] = [];
      const rewards: number[] = []; // times of meaningful rewards: unlocks, upgrades, finishes, medals, trophies
      let lastSig = '';
      const saves: Record<string, boolean> = {};
      const save = (name: string, g: Parameters<NonNullable<Parameters<typeof runBot>[0]['onStep']>>[0]) => {
        if (saves[name] || !process.env.AUDIT_SAVES) return;
        saves[name] = true;
        writeFileSync(`${process.env.AUDIT_SAVES}/${name}-seed${seed}.txt`, encodeSave(g.state));
      };
      let nextMark = 0;
      const L = runBot({
        seed, policy, untilCar: 'super', maxS: 7200,
        onStep: (g, t) => {
          const s = g.state;
          if (prev >= 0) { if (s.cash > prev) earned += s.cash - prev; else spent += prev - s.cash; }
          prev = s.cash;
          const sig = [s.owned.length, Object.values(s.upgrades ?? {}).join(','), s.livePodiums.length, s.blueprints.length, s.badges.length, Object.values(s.medals ?? {}).join(',')].join('|');
          if (sig !== lastSig) { if (lastSig) rewards.push(t); lastSig = sig; }
          if (t >= nextMark) {
            marks.push(`${mmss(t)} cash $${s.cash} (earned $${earned}, spent $${spent}) rep ${s.rep} cars ${s.owned.length}`);
            nextMark += 300;
          }
          if (t > 300) save('early', g);
          if (s.owned.includes('hothatch')) save('mid', g);
          if (s.events['harbor-launch']?.wins && s.events['cliff-esses']?.wins && !s.events['coast-crown']?.wins) save('last-event', g);
          void P;
        },
      });
      const gaps = rewards.map((r, i) => r - (rewards[i - 1] ?? 0));
      lines.push(`\n== seed ${seed} (${policy}) — Altamar at ${L.milestones.tourer ? mmss(L.milestones.tourer) : 'not reached'}, Lumen at ${L.milestones.super ? mmss(L.milestones.super) : 'not reached'}, ${L.races} races (${L.quick} quick)`);
      lines.push(...marks);
      lines.push(`rewards: ${rewards.length}; longest gap ${mmss(Math.max(...gaps))}; median gap ${mmss(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0)}`);
      lines.push(`purchases: ${L.log.filter((l) => / upgrade /.test(l)).join(' · ')}`);
      lines.push(`orders: ${L.log.filter((l) => / order /.test(l)).length} part orders logged`);
      expect(L.races).toBeGreaterThan(10);
    }
    lines.push('\n== payout by placement (cash, live) ==');
    for (const e of EVENTS) lines.push(`${e.id.padEnd(16)} ${e.payout.cash.join(' / ')}${e.firstClear?.cash ? `  first clear +$${e.firstClear.cash}` : ''}`);
    console.log(lines.join('\n'));
  });
});
