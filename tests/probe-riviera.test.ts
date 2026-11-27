// Riviera chapter calibration probes (prints only; run with PROBE=1).
import { describe, it } from 'vitest';
import { PLAYERS, fmtMin, runBot } from './bot';
import { probeEvent, decidingRivalTime } from './ladder';
import type { CarId } from '../src/data/tables';

describe.skipIf(!process.env.PROBE)('riviera probes', () => {
  it('cars on each course', () => {
    const cars: [CarId, number][] = [['proto', 9], ['vireo', 9], ['mako', 9], ['sovereign', 10], ['gt', 8], ['super', 7]];
    for (const ev of ['corniche', 'port-sprint', 'grand-riviera', 'summit-gala', 'glacier-pass', 'mesa-trap', 'riviera-night']) {
      const row = cars.map(([c, t]) => { const r = probeEvent(ev, { car: c, tiers: [t, t, t], label: '' }, 'clean', 'perfect', 1); return `${c} ${r.time.toFixed(2)}s ${Math.round(r.top)}mph`; });
      console.log(ev.padEnd(14), 'rival', decidingRivalTime(ev, 3).toFixed(2), '|', row.join(' · '));
    }
  });
  it.skipIf(!process.env.BOT)('rep and cash at the Summit Gala win', () => {
    for (const kind of ['clean', 'weak'] as const) {
      let rep = 0, cash = 0, t = 0;
      const L = runBot({ ...PLAYERS[kind], seed: 1, untilWin: 'summit-gala', maxS: 4 * 3600, onStep: (g, tt) => { rep = g.state.rep; cash = g.state.cash; t = tt; } });
      console.log(kind, 'gala', fmtMin(L.milestones['win-summit-gala']), 'halcyon', fmtMin(L.milestones.proto), 'rep', rep, 'cash', cash, 't', fmtMin(t));
    }
  }, 300_000);
});
describe.skipIf(!process.env.PROBE)('riviera pars', () => {
  it('pars and medals', () => {
    const t = (id: string, car: CarId, tiers: [number, number, number], sh: 'ordinary' | 'clean', ni: 'none' | 'late' | 'perfect') => probeEvent(id, { car, tiers, label: '' }, sh, ni, 1).time;
    for (const [id, car, tiers] of [['corniche', 'vireo', [9, 9, 9]], ['port-sprint', 'mako', [9, 9, 9]], ['grand-riviera', 'sovereign', [10, 10, 10]]] as const)
      console.log(`par ${id}: ${(Math.ceil(t(id, car, [...tiers] as never, 'ordinary', 'late') * 10) / 10).toFixed(1)}`);
    const r = (sh: 'ordinary' | 'clean', ni: 'none' | 'late' | 'perfect') => (Math.ceil((t('ta-corniche', 'vireo', [9, 9, 9], sh, ni) + 0.05) * 10) / 10).toFixed(1);
    console.log(`timeAttack ta-corniche: { bronze: ${r('ordinary', 'none')}, silver: ${r('clean', 'late')}, gold: ${r('clean', 'perfect')} }`);
  });
});
describe.skipIf(!process.env.PROBE)('riviera ladder', () => {
  it('times to the supercars', () => {
    for (const kind of (process.env.KINDS ?? 'clean,weak').split(',')) {
      const L = runBot({ ...PLAYERS[kind], seed: Number(process.env.SEED ?? 1), untilWin: 'grand-riviera', maxS: 5 * 3600 });
      const m = L.milestones;
      console.log(`${kind}: halcyon ${fmtMin(m.proto)} gala ${fmtMin(m['win-summit-gala'])} vireo ${fmtMin(m.vireo)} corniche ${fmtMin(m['win-corniche'])} mako ${fmtMin(m.mako)} port ${fmtMin(m['win-port-sprint'])} t9e ${fmtMin(m['t9-engine'])} t10e ${fmtMin(m['t10-engine'])} sovereign ${fmtMin(m.sovereign)} grand ${fmtMin(m['win-grand-riviera'])} | races ${L.races} maxRepeat ${L.maxRepeat} maxLoss ${L.maxLossStreak} | ${['corniche', 'ta-corniche', 'riviera-night', 'port-sprint', 'grand-riviera'].map((k) => `${k}:${L.liveWins[k] ?? 0}/${L.liveStarts[k] ?? 0}`).join(' ')}`);
      if (process.env.BOT_LOG) console.log(L.log.filter((l) => Number(l.split('s')[0]) > (m.proto ?? 0) - 60).slice(0, 400).join('\n'));
    }
  }, 900_000);
});
describe.skipIf(!process.env.PROBE)('riviera tune', () => {
  it('weak player by tune stage', () => {
    for (const [ev, car, t] of [['corniche', 'vireo', 9], ['port-sprint', 'mako', 9], ['grand-riviera', 'sovereign', 10], ['summit-gala', 'proto', 9]] as const) {
      const row = [0, 1, 2, 3].map((tune) => { const r = probeEvent(ev, { car, tiers: [t, t, t], label: '', tune }, 'missed', 'none', 6); return `tune${tune} ${r.time.toFixed(2)} w${r.wins}`; });
      console.log(ev, 'rival', decidingRivalTime(ev, 6).toFixed(2), row.join(' · '));
    }
  });
});
describe.skipIf(!process.env.PROBE)('riviera arrival', () => {
  it('sovereign arrival', () => {
    for (const tiers of [[10, 9, 9], [10, 10, 9], [10, 10, 10]] as [number, number, number][]) console.log('sov', tiers.join('/'), ['grand-riviera', 'port-sprint', 'corniche'].map((ev) => `${ev} ${probeEvent(ev, { car: 'sovereign', tiers, label: '' }, 'clean', 'perfect', 2).time.toFixed(2)}`).join(' · '));
  });
});
describe.skipIf(!process.env.PROBE)('reward cadence', () => {
  it('reward signature changes 45–70 min', () => {
    let last = '';
    const out: string[] = [];
    runBot({ ...PLAYERS[process.env.KIND ?? 'clean'], seed: 1, untilCar: 'proto', maxS: 3 * 3600, onStep: (g, t) => {
      const s = g.state;
      const parts = { owned: s.owned.length, up: Object.values(s.upgrades).join(','), pod: s.livePodiums.length, bp: s.blueprints.length, badges: s.badges.length, medals: Object.values(s.medals).join(','), owns: s.owns.length, tune: Object.values(s.tune).join(',') };
      const sig = JSON.stringify(parts);
      if (sig !== last && t > 45 * 60) out.push(`${(t / 60).toFixed(1)} ${sig}`);
      last = sig;
    } });
    console.log(out.join('\n'));
  }, 300_000);
});
