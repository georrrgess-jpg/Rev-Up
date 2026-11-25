import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runBot, fmtMin } from './bot';

it('explore', () => {
  const shift = (process.env.SHIFT ?? 'clean') as never;
  const policy = (process.env.NITRO ?? 'perfect') as never;
  const t0 = Date.now();
  const L = runBot({ seed: Number(process.env.SEED ?? 1), untilCar: process.env.UNTIL ?? 'proto', maxS: Number(process.env.MAXS ?? 4 * 3600), shift, policy, tune: process.env.TUNE ? true : undefined });
  const m = L.milestones;
  console.log(`${shift}/${policy}: ${['beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'].map((c) => `${c} ${fmtMin(m[c])}`).join(' ')} | races ${L.races} quick ${L.quick} maxRepeat ${L.maxRepeat} maxLossStreak ${L.maxLossStreak} wall ${Date.now() - t0}ms`);
  console.log(Object.entries(L.liveStarts).map(([k, v]) => `${k}:${L.liveWins[k] ?? 0}/${v}`).join(' '));
  console.log(Object.entries(m).filter(([k]) => k.startsWith('t')).map(([k, v]) => `${k}@${fmtMin(v)}`).join(' '));
  console.log(Object.entries(L.perEvent).map(([k, v]) => `${k}:${v}`).join(' '));
  writeFileSync(`/tmp/claude-0/-home-user-Rev-Up/bb1d4249-0e6a-57a2-9795-17164d091212/scratchpad/agentD/botlog-${shift}-${policy}.txt`, L.log.join('\n'));
}, 900_000);
