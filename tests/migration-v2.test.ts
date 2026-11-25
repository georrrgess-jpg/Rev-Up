import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { computeLoadout } from '../src/core/loadout';
import { MemoryKV, encodeSave, saveKey } from '../src/core/save';
import { newGame } from '../src/core/state';

const T0 = 1_700_000_000_000;

describe('save v1 → v2: auto-equip becomes fitted parts', () => {
  it('fits exactly the parts v1 auto-equipped on the active car, keeps every part once, and keeps the build', () => {
    const v1 = newGame(T0) as unknown as Record<string, unknown> & { board: unknown[]; tray: unknown[] };
    v1.v = 1;
    delete v1.installed; delete v1.mastery;
    Object.assign(v1, { owned: ['junker', 'beater'], activeCar: 'beater', crafted: ['tires:3'], nextPartId: 20 });
    v1.board = v1.board.map(() => null);
    v1.tray = v1.tray.map(() => null);
    const parts = [
      { id: 1, f: 'engine', t: 3, q: 'std' }, { id: 2, f: 'engine', t: 2, q: 'std' },
      { id: 3, f: 'tires', t: 3, q: 'polished' }, { id: 4, f: 'turbo', t: 1, q: 'std' }, { id: 5, f: 'turbo', t: 4, q: 'std' },
    ];
    parts.forEach((p, i) => (v1.board[i] = p));
    const kv = new MemoryKV();
    kv.setItem(saveKey('/t/'), encodeSave(v1 as never));
    const g = new Game(kv, '/t/', T0);
    const s = g.state;
    expect(s.v).toBe(2);
    // the v1 build of the Corsa (cap T3): engine T3, polished T3 tires, and the T4 turbo running at T3
    expect(s.installed.beater).toMatchObject({ engine: { id: 1 }, tires: { id: 3 }, turbo: { id: 5 } });
    const onBench = [...s.board, ...s.tray].filter(Boolean).map((p) => p!.id).sort();
    expect(onBench).toEqual([2, 4]);
    expect(computeLoadout(s, 'beater').stats.top).toBeGreaterThan(computeLoadout(s, 'junker').stats.top);
    expect(s.crafted).toEqual(['tires:3']); // crafted credit untouched
  });

  it('records per-car milestones on live races', () => {
    const g = new Game(new MemoryKV(), '/t/', T0);
    g.fitRecommended('junker', T0);
    const setup = g.startRace('yard-sprint', T0 + 1000)!;
    void setup;
    g.commitRace(g.pendingRaceId!, { place: 2, standings: [], playerTime: 21.5, gapText: '', perfects: 1, nitroUsed: 1, nitroLeft: 0, trapSpeed: 30, cutoff: false, advice: null }, T0 + 30000);
    expect(g.state.mastery.junker).toMatchObject({ races: 1, wins: 0, podiums: 1, perfects: 1, best: { 'yard-sprint': 21.5 } });
  });
});
