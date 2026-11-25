// Development-only presets for late states and fixed seeds. Loaded via ?dev=<preset>&seed=<n>
// only when running `npm run dev`; excluded from production builds by import.meta.env.DEV.
import { expandBoard } from './core/board';
import type { Game } from './core/game';
import type { GameState, Part } from './core/state';
import type { Family } from './data/tables';

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
        break;
      case 'late':
        s.owned = ['junker', 'beater', 'hothatch', 'muscle']; s.activeCar = 'muscle'; s.revealed = [...s.owned];
        s.rep = 1400; s.bosses = ['ray']; s.blueprints = ['Ray’s Rust-Red']; s.badges = ['Scrapyard King'];
        s.crafted = ['tires:3', 'turbo:4', 'engine:5']; s.cash = 5000; s.activeS = 1800; s.nitro = 3;
        for (const id of ['yard-sprint', 'crusher-run', 'rusty-ray', 'cul-de-sac', 'maple-mile']) s.events[id] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 18 };
        fill(s, [['engine', 5], ['tires', 5], ['turbo', 5], ['engine', 3], ['engine', 3], ['tires', 1], ['turbo', 2]]);
        break;
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
        s.offline.lastSeenAt = Date.now() - 3 * 3600_000;
        break;
      case 'reveal':
        s.owned = ['junker', 'beater']; s.activeCar = 'beater'; s.pendingReveal = 'beater'; s.crafted = ['tires:3']; s.rep = 50;
        break;
    }
    return [];
  });
}
