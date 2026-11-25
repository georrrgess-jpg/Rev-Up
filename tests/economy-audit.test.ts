// Economy audit (simulation, ~10 s): one fresh-save run to the Halcyon X per player type, through the real rules.
// Prints earnings per race by stage, races needed for representative purchases, the time between meaningful rewards,
// the longest run of one race, races to each car, and the cash still idle; asserts the pacing guards.
// Set AUDIT_SAVES=<dir> to also write realistic saves at key moments for manual review.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeSave } from '../src/core/save';
import { CarId, EVENTS, PART_ORDER_PRICE, carById, roundCash, styleItem, tunePrice } from '../src/data/tables';
import { PLAYERS, fmtMin, runBot } from './bot';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const LADDER: CarId[] = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'];
/** A representative purchase for each stage (the best car owned). */
const BUYS: Partial<Record<CarId, [string, number]>> = {
  junker: ['T2 part', PART_ORDER_PRICE[2]], beater: ['Bigger bench', 600], hothatch: ['Pit crew', 900], muscle: ['Metallic paint', styleItem('material:metallic')!.price],
  tourer: ['T6 part', PART_ORDER_PRICE[6]], tuner: ['Flames livery', styleItem('livery:flames')!.price], super: ['Candy paint', styleItem('material:candy')!.price],
  rally: ['Chrome paint', styleItem('material:chrome')!.price], gt: ['T8 part', PART_ORDER_PRICE[8]], proto: ['Halcyon Tune-up 3', tunePrice('proto', 2)],
};

describe('economy audit (simulation)', () => {
  it('prints earnings, purchase pacing and reward cadence per player type', () => {
    const lines: string[] = [];
    for (const kind of ['clean', 'mixed', 'weak'] as const) {
      const per: Record<string, { live: number[]; quick: number[]; t0: number; t1: number }> = {};
      const rewards: number[] = [];
      let lastSig = '', lastRace = -1, idleAt60 = -1, hooked = false;
      const quick: number[] = [];
      const saves = new Set<string>();
      const save = (name: string, data: string) => { if (!process.env.AUDIT_SAVES || saves.has(name)) return; saves.add(name); writeFileSync(`${process.env.AUDIT_SAVES}/${name}-${kind}.txt`, data); };
      const L = runBot({
        ...PLAYERS[kind], seed: 1, untilCar: 'proto', maxS: 3 * 3600,
        onStep: (g, t) => {
          const s = g.state;
          const best = LADDER.filter((c) => s.owned.includes(c)).pop()!;
          const st = (per[best] ??= { live: [], quick: [], t0: t, t1: t });
          st.t1 = t;
          if (!hooked) { hooked = true; g.subscribe((ev) => { if (ev.some((e) => e.type === 'quickDone') && g.quickResult) quick.push(g.quickResult.cash); }); }
          st.quick.push(...quick.splice(0));
          const r = s.lastResult;
          if (r && r.mode === 'live' && r.raceId !== lastRace) { lastRace = r.raceId; st.live.push(r.cash); }
          const sig = [s.owned.length, Object.values(s.upgrades).join(','), s.livePodiums.length, s.blueprints.length, s.badges.length, Object.values(s.medals).join(','), s.owns.length, Object.values(s.tune).join(',')].join('|');
          if (sig !== lastSig) { if (lastSig) rewards.push(t); lastSig = sig; }
          if (idleAt60 < 0 && t >= 3600) idleAt60 = s.cash;
          if (t > 300) save('early', encodeSave(s));
          if (s.owned.includes('super')) save('lumen', encodeSave(s));
          if (s.owned.includes('gt')) save('strata', encodeSave(s));
        },
      });
      const gaps = rewards.map((r, i) => r - (rewards[i - 1] ?? 0)).sort((a, b) => a - b);
      lines.push(`\n== ${kind} — Halcyon at ${fmtMin(L.milestones.proto)}, ${L.races} races (${L.quick} quick), longest run of one race ${L.maxRepeat}, longest losing run ${L.maxLossStreak}`);
      lines.push(`races to each car: ${LADDER.slice(1).map((c) => `${carById(c).model} ${L.racesAt[c] ?? '—'}`).join(' · ')}`);
      lines.push(`rewards ${rewards.length}: median gap ${mmss(gaps[Math.floor(gaps.length / 2)] ?? 0)}, longest ${mmss(gaps[gaps.length - 1] ?? 0)}; cash in hand at 60 min ${idleAt60 < 0 ? '(finished)' : `$${idleAt60}`}`);
      lines.push('stage (best car)        minutes  live $/race  quick $/race  representative buy → races');
      for (const c of LADDER) {
        const st = per[c];
        if (!st) continue;
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
        const live = avg(st.live), quick = avg(st.quick);
        const [what, price] = BUYS[c]!;
        lines.push(`${carById(c).model.padEnd(22)} ${((st.t1 - st.t0) / 60).toFixed(1).padStart(6)}  ${`$${Math.round(live)}`.padStart(11)}  ${`$${Math.round(quick)}`.padStart(12)}  ${what} $${price} → ${live ? (price / live).toFixed(1) : '—'} live races`);
      }
      expect(L.milestones.proto).toBeGreaterThan(0);
      expect(L.maxRepeat).toBeLessThanOrEqual(5);
      expect(gaps[gaps.length - 1]).toBeLessThan(8 * 60); // something meaningful at least every 8 minutes
    }
    lines.push('\n== payout by placement (cash, live; all on $5 / $10 / $50 steps) ==');
    for (const e of EVENTS.filter((x) => !x.heatOf)) lines.push(`${e.id.padEnd(18)} ${e.payout.cash.map(roundCash).join(' / ')}${e.firstClear?.cash ? `  first win +$${e.firstClear.cash}` : ''}${e.boss ? `  rival +$${e.boss.reward.cash}` : ''}`);
    console.log(lines.join('\n'));
  }, 120_000);
});
