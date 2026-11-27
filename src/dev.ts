// Development-only presets for late states and fixed seeds. Loaded via ?dev=<preset>&seed=<n>
// only when running `npm run dev`; excluded from production builds by import.meta.env.DEV.
import { expandBoard } from './core/board';
import type { Game } from './core/game';
import { fitRecommended } from './core/install';
import type { GameState, Part } from './core/state';
import { EVENTS, type Family } from './data/tables';

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
