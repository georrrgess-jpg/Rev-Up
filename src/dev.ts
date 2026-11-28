// Development-only presets for late states and fixed seeds. Loaded via ?dev=<preset>&seed=<n>
// only when running `npm run dev`; excluded from production builds by import.meta.env.DEV.
import { expandBoard } from './core/board';
import type { Game } from './core/game';
import { fitRecommended } from './core/install';
import type { GameState, Part } from './core/state';
import { ENABLED_CARS, EVENTS, type Family } from './data/tables';
import { carStages } from './core/progression';

function fill(s: GameState, list: [Family, number][]) {
  s.board = s.board.map(() => null);
  s.tray = s.tray.map(() => null);
  list.forEach(([f, t], i) => {
    const p: Part = { id: s.nextPartId++, f, t, q: 'std' };
    if (i < s.board.length) s.board[i] = p;
    else s.tray[i - s.board.length] = p;
  });
}

export function applyPreset(game: Game, preset: string) {
  game.transact((s) => {
    switch (preset) {
      case 'beater-ready':
        s.rep = 44;
        fill(s, [['tires', 2], ['tires', 2], ['engine', 2], ['turbo', 1]]);
        break;
      case 'ray':
        s.owned = ['junker', 'beater']; s.activeCar = 'beater'; s.revealed = [...s.owned];
        s.rep = 80; s.crafted = ['tires:2', 'tires:3']; s.cash = 400; s.nitro = 3;
        s.events['yard-sprint'] = { wins: 2, starts: 2, bestPlace: 1, bestTime: 20 };
        s.events['crusher-run'] = { wins: 1, starts: 2, bestPlace: 1, bestTime: 19.5 };
        fill(s, [['engine', 3], ['tires', 3], ['turbo', 3], ['engine', 1], ['turbo', 2]]);
        break;
      case 'muscle-ready':
        s.owned = ['junker', 'beater', 'hothatch']; s.activeCar = 'hothatch'; s.revealed = [...s.owned];
        s.rep = 990; s.bosses = ['ray']; s.blueprints = ['Ray’s Rust-Red']; s.badges = ['Scrapyard King'];
        s.crafted = ['tires:3', 'turbo:4', 'engine:4']; s.cash = 2000; s.activeS = 1200;
        fill(s, [['engine', 4], ['engine', 4], ['tires', 4], ['turbo', 4]]);
        fitRecommended(s, 'hothatch');
        break;
      case 'late':
        s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle'; s.revealed = [...s.owned];
        s.rep = 1400; s.bosses = ['ray']; s.blueprints = ['Ray’s Rust-Red']; s.badges = ['Scrapyard King'];
        s.crafted = ['tires:3', 'turbo:4', 'engine:5']; s.cash = 5000; s.activeS = 1800; s.nitro = 3;
        for (const id of ['yard-sprint', 'crusher-run', 'rusty-ray', 'cul-de-sac', 'maple-mile']) s.events[id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 18 };
        fill(s, [['engine', 5], ['tires', 5], ['turbo', 5], ['engine', 3], ['engine', 3], ['tires', 1], ['turbo', 2]]);
        fitRecommended(s, 'muscle'); // a real save at this point has its build fitted
        break;
      // Endgame states (the Overhaul ladder): parts fitted to the newest car at its cap, Rep just short of the next car.
      case 'desert':
      case 'summit':
      case 'finale': {
        const ladder = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto'] as const;
        const upTo = { desert: 'super', summit: 'gt', finale: 'proto' }[preset as 'desert' | 'summit' | 'finale'];
        s.owned = ladder.slice(0, ladder.indexOf(upTo as never) + 1) as never;
        s.activeCar = upTo as never; s.revealed = [...s.owned];
        const cap = { desert: 7, summit: 8, finale: 9 }[preset as 'desert'];
        s.rep = { desert: 5400, summit: 9000, finale: 14200 }[preset as 'desert'];
        s.bosses = ['ray', 'vale', 'nova', ...(preset !== 'desert' ? ['sable'] : [])];
        s.blueprints = ['Ray’s Rust-Red', 'Crown Teal', 'Main Event Neon', ...(preset !== 'desert' ? ['Canyon Ochre'] : [])];
        s.badges = ['Scrapyard King', 'Coastal Crown', 'Main Event Champion', ...(preset !== 'desert' ? ['Canyon Rally Champion'] : [])];
        s.crafted = ['tires:3', 'turbo:4', 'engine:5', 'engine:6', 'tires:6', 'turbo:7', ...(preset !== 'desert' ? ['tires:8', 'engine:8'] : []), ...(preset === 'finale' ? ['turbo:9'] : [])];
        s.cash = 20000; s.activeS = 3600; s.nitro = 3; s.stats.races = 150;
        const later = ['canyon-qualifier', 'mesa-trap', 'dust-stage', 'canyon-stage', 'rally-final', 'ironhorse-revival', 'ta-canyon', 'glacier-pass', 'summit-1000', 'altamar-tour', 'ta-summit', 'summit-gala'];
        const done = { desert: 0, summit: 7, finale: 11 }[preset as 'desert'];
        for (const e of EVENTS) if (!e.heatOf && (!later.includes(e.id) || later.indexOf(e.id) < done)) s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
        s.stars = { 'neon-mile': 7, 'skyline-run': 7, 'stock-cup': 7 };
        const fam: Family[] = ['engine', 'tires', 'turbo'];
        s.installed = { [upTo]: Object.fromEntries(fam.map((f) => [f, { id: s.nextPartId++, f, t: cap, q: 'std' }])) };
        fill(s, [['engine', cap - 1], ['tires', cap - 1], ['turbo', cap - 2], ['turbo', cap - 2]]);
        break;
      }
      // Azure Riviera (the supercars): 'riviera' the Summit Gala just won, the Vireo one race of Rep away;
      // 'super1' the Vireo owned and active; 'super2' the Mako too; 'flagship' every car, the Sovereign on T10 parts.
      case 'riviera':
      case 'super1':
      case 'super2':
      case 'flagship': {
        const ladder = ['junker', 'beater', 'hothatch', 'muscle', 'tourer', 'tuner', 'super', 'rally', 'gt', 'proto', 'vireo', 'mako', 'sovereign'] as const;
        const upTo = ({ riviera: 'proto', super1: 'vireo', super2: 'mako', flagship: 'sovereign' } as const)[preset as 'riviera'];
        s.owned = ladder.slice(0, ladder.indexOf(upTo) + 1) as never;
        s.activeCar = upTo; s.revealed = [...s.owned];
        s.rep = ({ riviera: 14900, super1: 16500, super2: 20000, flagship: 24000 } as const)[preset as 'riviera'];
        s.bosses = ['ray', 'vale', 'nova', 'sable', 'iver'];
        s.blueprints = ['Ray’s Rust-Red', 'Crown Teal', 'Main Event Neon', 'Canyon Ochre', 'Summit Ice'];
        s.badges = ['Scrapyard King', 'Coastal Crown', 'Main Event Champion', 'Canyon Rally Champion', 'Summit Champion'];
        s.crafted = ['tires:3', 'turbo:4', 'engine:5', 'engine:6', 'tires:6', 'turbo:7', 'tires:8', 'engine:8', 'turbo:9', 'tires:9', 'engine:9', ...(preset === 'flagship' ? ['engine:10'] : [])];
        s.cash = 60000; s.scrap = 4000; s.activeS = 4200; s.nitro = 3; s.stats.races = 220;
        const won = { riviera: [], super1: [], super2: ['corniche'], flagship: ['corniche', 'port-sprint'] }[preset as 'riviera'] as string[];
        for (const e of EVENTS) if (!e.heatOf && (e.district !== 'riviera' && e.id !== 'ta-corniche' && e.id !== 'riviera-night' || won.includes(e.id))) s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
        s.stars = { 'neon-mile': 7, 'skyline-run': 7, 'stock-cup': 7 };
        const fam: Family[] = ['engine', 'tires', 'turbo'];
        // the newest car on its best parts (the Sovereign on a T10 engine), the Halcyon on its T9 build
        const fit = (tiers: number[]) => Object.fromEntries(fam.map((f, i) => [f, { id: s.nextPartId++, f, t: tiers[i], q: 'std' as const }]));
        s.installed = { proto: fit([9, 9, 9]), ...(upTo !== 'proto' ? { [upTo]: fit(upTo === 'sovereign' ? [10, 9, 9] : [9, 9, 9]) } : {}) };
        fill(s, [['engine', 9], ['tires', 9], ['turbo', 8], ['turbo', 8], ['engine', 7]]);
        break;
      }
      case 'fullx':
      case 'full': {
        if (preset === 'fullx') expandBoard(s);
        const list: [Family, number][] = [];
        const fams: Family[] = ['engine', 'tires', 'turbo'];
        for (let i = 0; i < s.board.length + s.tray.length; i++) list.push([fams[i % 3], (i % 4) + 1]);
        fill(s, list);
        s.crates.push({ kind: 'std', source: 'printer' }, { kind: 'std', source: 'printer' });
        s.stats.milestones.firstMerge = 1; s.stats.races = 1;
        break;
      }
      case 'cascade':
        fill(s, []);
        s.board[2 * s.cols + 0] = { id: s.nextPartId++, f: 'engine', t: 1, q: 'std' };
        s.board[2 * s.cols + 2] = { id: s.nextPartId++, f: 'engine', t: 1, q: 'std' };
        s.board[1 * s.cols + 2] = { id: s.nextPartId++, f: 'engine', t: 2, q: 'std' };
        s.board[2 * s.cols + 3] = { id: s.nextPartId++, f: 'engine', t: 3, q: 'std' };
        s.board[3 * s.cols + 2] = { id: s.nextPartId++, f: 'engine', t: 4, q: 'std' };
        s.stats.milestones.firstMerge = 1;
        break;
      // ---- 1.9 Circuit presets
      // 'slow': the old slowest stretch — the Strata GTR just won, the Ardent and the Halcyon both open (two goals),
      // Rep part-way, no T8 Turbo yet, cash for one order. 'shelf': a full Parts Shelf (rank 1, 10 parts) and a full
      // bench with over-cap parts. 'ardent' / 'meridian' / 'tempest': each new car owned and active on its build.
      // 1.10 'redline' / 'redline5': the Redline Series open at step 1 (or with steps 1–4 done, the final next) on a
      // Halcyon X save with the Kestrel 1600 (T6), the Corvo (T8), the Ardent (T8) and the Halcyon (T9) built
      case 'redline':
      case 'redline5':
      case 'slow':
      case 'ardent':
      case 'meridian':
      case 'tempest': {
        const series = preset === 'redline' || preset === 'redline5';
        const upTo = ({ slow: 'gt', ardent: 'ardent', meridian: 'meridian', tempest: 'tempest', redline: 'proto', redline5: 'proto' } as const)[preset as 'slow'];
        const all = ENABLED_CARS.map((c) => c.id);
        s.owned = all.slice(0, all.indexOf(upTo) + 1);
        if (preset === 'slow') s.owned = s.owned.filter((c) => c !== 'ardent');
        s.activeCar = upTo; s.revealed = [...s.owned];
        s.rep = ({ slow: 10200, ardent: 11600, meridian: 20400, tempest: 27500, redline: 14000, redline5: 14000 } as const)[preset as 'slow'];
        s.cash = ({ slow: 16000, ardent: 30000, meridian: 60000, tempest: 90000, redline: 40000, redline5: 40000 } as const)[preset as 'slow'];
        s.scrap = 2500; s.activeS = 3600; s.nitro = 3; s.stats.races = 160;
        for (const c of s.owned) { const u = ENABLED_CARS.find((x) => x.id === c)!.unlock; if (u) for (let t = 2; t <= u.tier; t++) if (!s.crafted.includes(`${u.family}:${t}`)) s.crafted.push(`${u.family}:${t}`); }
        for (let k = 0; k < 6; k++) for (const e of EVENTS) {
          if (e.heatOf || s.events[e.id] || (preset !== 'slow' && e.requires.car === upTo)) continue;
          if (e.requires.car && !s.owned.includes(e.requires.car)) continue;
          if (e.requires.afterWin && !s.events[e.requires.afterWin]) continue;
          if (preset === 'tempest' && e.id === 'launch-final') continue;
          if ((preset === 'slow' || series) && (e.id === 'summit-1000' || e.district === 'riviera')) continue;
          s.events[e.id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
          if (e.boss) { s.bosses.push(e.boss.rival); s.blueprints.push(e.boss.reward.blueprint); s.badges.push(e.boss.reward.badge); }
        }
        s.stars = { 'neon-mile': 7, 'skyline-run': 7, 'stock-cup': 7 };
        s.stagesPaid = ENABLED_CARS.filter((c) => s.owned.includes(c.id)).flatMap((c) => carStages(c).map((d) => d.key));
        const fam: Family[] = ['engine', 'tires', 'turbo'];
        const cap = ENABLED_CARS.find((c) => c.id === upTo)!.cap;
        s.installed = { [upTo]: Object.fromEntries(fam.map((f) => [f, { id: s.nextPartId++, f, t: cap, q: 'std' as const }])) };
        if (series) {
          for (const [car, t] of [['tuner', 6], ['rally', 8], ['ardent', 8]] as const) s.installed[car] = Object.fromEntries(fam.map((f) => [f, { id: s.nextPartId++, f, t, q: 'std' as const }]));
          s.rivalRuns = {};
          if (preset === 'redline5') for (const id of ['rl-1', 'rl-2', 'rl-3', 'rl-4']) s.rivalRuns[id] = { tries: 2, best: 24, bestGap: 0.3, done: true, claimed: true };
          if (preset === 'redline5') s.blueprints.push('Redline Red');
        }
        s.upgrades = { ...s.upgrades, grid: 1, storage: 1, workshop: 1, printer: 3, crateTier: 3 };
        expandBoard(s);
        fill(s, preset === 'slow' ? [['turbo', 7], ['turbo', 7], ['engine', 7], ['tires', 6], ['turbo', 6]] : [['engine', cap - 1], ['tires', cap - 1], ['turbo', cap - 1], ['engine', 6]]);
        break;
      }
      case 'shelf': {
        s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle'; s.revealed = [...s.owned];
        s.rep = 1800; s.crafted = ['tires:3', 'turbo:4', 'engine:5']; s.cash = 6000; s.scrap = 300; s.activeS = 1800; s.stats.races = 40;
        s.bosses = ['ray']; s.stats.milestones.firstMerge = 1;
        for (const id of ['yard-sprint', 'crusher-run', 'rusty-ray', 'cul-de-sac', 'maple-mile']) s.events[id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 18 };
        s.upgrades = { ...s.upgrades, storage: 1, workshop: 1 };
        s.shelf = ([['engine', 7], ['tires', 7], ['turbo', 6], ['engine', 6], ['tires', 4], ['turbo', 4], ['engine', 3], ['tires', 3], ['turbo', 2], ['engine', 2]] as [Family, number][])
          .map(([f, t]) => ({ id: s.nextPartId++, f, t, q: 'std' as const }));
        const list: [Family, number][] = [];
        const fams: Family[] = ['engine', 'tires', 'turbo'];
        for (let i = 0; i < s.board.length + s.tray.length; i++) list.push([fams[i % 3], i % 5 === 0 ? 7 : (i % 4) + 1]);
        fill(s, list);
        s.installed = { muscle: Object.fromEntries(fams.map((f) => [f, { id: s.nextPartId++, f, t: 5, q: 'std' as const }])) };
        break;
      }
      case 'offline':
        s.offline.lastSeenAt = Date.now() - 3 * 3600 * 1000; // three hours away, priced by the real rule on load
        break;
      case 'reveal':
        s.owned = ['junker', 'beater']; s.activeCar = 'beater'; s.pendingReveal = 'beater'; s.crafted = ['tires:3']; s.rep = 50;
        break;
    }
    return [];
  });
}
