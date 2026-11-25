import { Family, Quality } from '../src/data/tables';
import { GameState, Part, newGame } from '../src/core/state';

export function emptyGame(seed = 1): GameState {
  const s = newGame(0, seed);
  s.board = s.board.map(() => null);
  s.tray = s.tray.map(() => null);
  s.crates = [];
  return s;
}

export function put(s: GameState, r: number, c: number, f: Family, t: number, q: Quality = 'std'): Part {
  const p: Part = { id: s.nextPartId++, f, t, q };
  s.board[r * s.cols + c] = p;
  return p;
}

export const at = (s: GameState, r: number, c: number) => ({ zone: 'board' as const, i: r * s.cols + c });

/** Find an rng state whose next roll is in [lo, hi). */
export function seedForRoll(lo: number, hi: number): number {
  for (let seed = 1; seed < 1e6; seed++) {
    const st = { rng: seed };
    let t = (st.rng = (st.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    if (r >= lo && r < hi) return seed;
  }
  throw new Error('no seed');
}

export const totalMass = (s: GameState) =>
  [...s.board, ...s.tray].filter(Boolean).reduce((a, p) => a + 2 ** (p!.t - 1), 0);
