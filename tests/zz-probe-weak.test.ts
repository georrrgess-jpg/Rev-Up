import { it } from 'vitest';
import { PLAYERS, runBot } from './bot';
it('probe', () => {
  const kind = (process.env.KIND ?? 'weak') as 'weak';
  const L = runBot({ ...PLAYERS[kind], seed: 1, untilCar: process.env.UNTIL ?? 'super', maxS: 4 * 3600 });
  const fs = require('node:fs');
  fs.writeFileSync(`/tmp/claude-0/-home-user-Rev-Up/bb1d4249-0e6a-57a2-9795-17164d091212/scratchpad/progression2/log-${kind}.txt`, L.log.join('\n') + '\n' + JSON.stringify(L.milestones));
}, 600000);
