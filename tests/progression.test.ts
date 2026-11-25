import { describe, expect, it } from 'vitest';
import * as B from '../src/core/board';
import { Game } from '../src/core/game';
import * as P from '../src/core/progression';
import { RaceSim, runRace } from '../src/core/race';
import { MemoryKV, decodeSave, encodeSave, exportText, importText, loadGame, saveKey, writeGame } from '../src/core/save';
import { migrate, newGame, validateState } from '../src/core/state';
import { CATCHUP_EFFORT_THRESHOLD, OFFLINE_MAX_S, SIGNATURE_FINISHES, carById, eventById } from '../src/data/tables';
import { statsFor } from '../src/core/loadout';
import { at, emptyGame, put } from './helpers';

const T0 = 1_700_000_000_000;
const mkGame = (kv = new MemoryKV(), now = T0) => new Game(kv, '/Rev-Up/', now);

function liveRace(g: Game, eventId: string, now: number, policy: 'perfect' | 'none' = 'perfect') {
  const setup = g.startRace(eventId, now)!;
  const sim = new RaceSim(setup);
  while (!sim.done) {
    const { active } = sim.windowState();
    if (policy === 'perfect' && active && !sim.usedWindows.has(active.segIndex)) sim.tapNitro();
    sim.step();
  }
  return { id: g.pendingRaceId!, out: sim.outcome() };
}

describe('unlocks and keystones', () => {
  it('requires both reputation and a player-crafted keystone', () => {
    const s = emptyGame();
    s.rep = 999;
    s.crates.push({ kind: 'targeted', family: 'tires', tier: 3, source: 'race' });
    B.openCrates(s);
    const ev: never[] = [];
    P.checkUnlocks(s, ev);
    expect(s.owned).toEqual(['junker']);
    put(s, 0, 1, 'tires', 2);
    put(s, 0, 2, 'tires', 2);
    B.moveOrFuse(s, at(s, 0, 1), at(s, 0, 2), 0);
    P.checkUnlocks(s, ev);
    expect(s.owned).toContain('beater');
    expect(s.pendingReveal).toBe('beater');
  });

  it('keeps keystones crafted before the rep requirement, even after consuming them', () => {
    const s = emptyGame();
    put(s, 0, 0, 'tires', 2);
    put(s, 0, 1, 'tires', 2);
    B.moveOrFuse(s, at(s, 0, 0), at(s, 0, 1), 0); // T3 tires
    put(s, 1, 1, 'tires', 3);
    B.moveOrFuse(s, at(s, 1, 1), at(s, 0, 1), 5000); // consumed into T4
    expect(B.allParts(s).some((p) => p.f === 'tires' && p.t === 3)).toBe(false);
    s.rep = 70;
    P.checkUnlocks(s, []);
    expect(s.owned).toContain('beater');
  });

  it('shows the exact remaining goal', () => {
    const s = emptyGame();
    s.rep = 10;
    expect(P.goalStatus(s)!.line).toBe('Craft T3 Tires · 60 more Rep to unlock the Corsa Rojo');
  });

  it('offers one catch-up crate after a stall in active play, never from idle time', () => {
    const s = emptyGame();
    s.owned = ['junker', 'beater'];
    s.rep = 300;
    put(s, 0, 0, 'turbo', 2);
    // idle: no input for a long time
    for (let k = 0; k < 400; k++) P.tick(s, 1, T0 + k * 1000, T0 - 60_000, []);
    expect(s.crates.some((c) => c.kind === 'catchup')).toBe(false);
    const ev: { type: string }[] = [];
    for (let k = 0; k < CATCHUP_EFFORT_THRESHOLD + 2; k++) P.tick(s, 1, T0 + k * 1000, T0 + k * 1000, ev as never);
    const c = s.crates.find((x) => x.kind === 'catchup');
    expect(c).toMatchObject({ family: 'turbo', tier: 2 });
    for (let k = 0; k < CATCHUP_EFFORT_THRESHOLD * 3; k++) P.tick(s, 1, T0, T0, []);
    expect(s.crates.filter((x) => x.kind === 'catchup')).toHaveLength(1);
    // repeatable route still exists after the catch-up crate
    s.scrap = 100;
    expect(B.buyCrate(s, 'targeted', 'turbo').some((e) => e.type === 'invalid')).toBe(false);
  });
});

describe('expanded career', () => {
  it('queues multiple earned cars and preserves their reveal order across reload', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.transact((s) => {
      s.rep = 2000;
      s.crafted = ['tires:3', 'turbo:4', 'engine:5'];
      const events: Parameters<typeof P.checkUnlocks>[1] = [];
      P.checkUnlocks(s, events);
      return events;
    }, T0);
    expect(g.state.pendingReveal).toBe('beater');
    expect(g.state.owned).toEqual(['junker', 'beater', 'hothatch', 'muscle']);
    g.finishReveal('beater', T0);
    const reopened = mkGame(kv, T0 + 1000);
    expect(reopened.state.pendingReveal).toBe('hothatch');
    reopened.finishReveal('hothatch', T0 + 1000);
    expect(reopened.state.pendingReveal).toBe('muscle');
  });

  it('rewards a live podium once, tracks live records, and preserves old saves', () => {
    const { livePodiums: _oldField, ...old } = newGame(T0);
    const g = new Game(new MemoryKV(), '/Rev-Up/', T0, migrate(old)!);
    expect(g.state.livePodiums).toEqual([]);
    g.state.events['yard-sprint'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 60 };
    const outcome = { place: 3, playerTime: 30, gapText: '', perfects: 0, nitroUsed: 0, standings: [], advice: null };
    g.quickRace('yard-sprint', T0);
    const quickId = g.state.pendingQuick!.id;
    const quick = P.commitRace(g.state, { raceId: quickId, mode: 'quick', outcome }, []);
    expect(quick?.signatureFinish).toBeUndefined();
    expect(g.state.events['yard-sprint'].bestTime).toBe(60);
    const setup = g.startRace('yard-sprint', T0);
    expect(setup?.nitroCharges).toBe(1); // the free crew charge
    const live = P.commitRace(g.state, { raceId: g.pendingRaceId!, mode: 'live', outcome }, []);
    expect(live?.signatureFinish).toBe('junker');
    expect(live?.personalBest).toBe(true);
    expect(g.state.livePodiums).toEqual(['junker']);
    g.startRace('yard-sprint', T0);
    const repeat = P.commitRace(g.state, { raceId: g.pendingRaceId!, mode: 'live', outcome }, []);
    expect(repeat?.signatureFinish).toBeUndefined();
    expect(repeat?.personalBest).toBe(false);
  });

  it('loads a 1.0 save that now qualifies for several cars: each is owned once and revealed in order', () => {
    const kv = new MemoryKV();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    delete old.livePodiums;
    delete old.pendingQuick;
    Object.assign(old, { rep: 980, crafted: ['tires:3', 'turbo:4'], cash: 777, paints: { junker: '#a8432a' }, blueprints: ['Ray’s Rust-Red'] });
    kv.setItem(saveKey('/Rev-Up/'), encodeSave(old as never));
    const g = new Game(kv, '/Rev-Up/', T0 + 1000);
    expect(g.state.owned).toEqual(['junker', 'beater', 'hothatch']);
    expect(g.state.cash).toBe(777);
    expect(g.state.paints.junker).toBe('#a8432a');
    expect(g.state.pendingReveal).toBe('beater');
    // closing mid-reveal and reopening never re-grants or skips a car
    const again = new Game(kv, '/Rev-Up/', T0 + 2000);
    expect(again.state.owned.filter((c) => c === 'beater')).toHaveLength(1);
    again.finishReveal('beater', T0 + 2100);
    const third = new Game(kv, '/Rev-Up/', T0 + 3000);
    expect(third.state.pendingReveal).toBe('hothatch');
    third.finishReveal('hothatch', T0 + 3100);
    expect(new Game(kv, '/Rev-Up/', T0 + 4000).state.pendingReveal).toBeNull();
  });

  it('an earned finish persists across reload and is used in the next race', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.state.livePodiums = ['junker'];
    g.setPaint('junker', SIGNATURE_FINISHES.junker!.paint, T0);
    const g2 = new Game(kv, '/Rev-Up/', T0 + 5000);
    expect(g2.startRace('yard-sprint', T0 + 6000)?.player.paint).toBe(SIGNATURE_FINISHES.junker!.paint);
  });

  it('the Tapeback Trophy brings the first car back: car-limited, reason given, winnable with a T2 Tapeback', () => {
    const s = newGame(T0);
    const e = eventById('tapeback-trophy');
    expect(P.eventUnlocked(s, e).ok).toBe(false); // needs the Beater first
    s.owned.push('beater');
    s.activeCar = 'beater';
    expect(P.eventUnlocked(s, e)).toMatchObject({ ok: false, switchCar: 'junker' });
    s.activeCar = 'junker';
    expect(P.eventUnlocked(s, e).ok).toBe(true);
    expect(P.eventReason(s, e)).toMatch(/^First win: \+\$150/);
    const stats = (t: number) => statsFor('junker', { engine: { id: 1, f: 'engine', t, q: 'std' }, tires: { id: 2, f: 'tires', t, q: 'std' }, turbo: { id: 3, f: 'turbo', t, q: 'std' } });
    let wins = 0;
    let winsT1 = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const setup = (t: number) => ({ eventId: e.id, seed, player: { name: 'You', car: 'junker' as const, stats: stats(t), paint: '#fff' }, nitroCharges: 3 });
      if (runRace(setup(2), 'perfect').place === 1) wins++;
      if (runRace(setup(1), 'none').place === 1) winsT1++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
    expect(winsT1).toBe(0);
  });

  it('Fresh route adds Rep only for an event outside the last two races, once per race', () => {
    const s = newGame(T0);
    s.stats.races = 5;
    s.recentEvents = ['yard-sprint', 'crusher-run'];
    const y = eventById('yard-sprint');
    expect(P.computePayout(s, y, 1, 'quick', 0).freshRep).toBe(0);
    s.owned.push('beater'); s.activeCar = 'beater';
    s.events['yard-sprint'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    s.recentEvents = ['crusher-run', 'rusty-ray'];
    const p = P.computePayout(s, y, 1, 'quick', 0);
    expect(p.freshRep).toBe(Math.ceil(y.payout.rep[0] * 0.75));
    expect(p.rep).toBe(y.payout.rep[0] + p.freshRep);
    // committing records the event, so an immediate repeat is no longer fresh
    s.pendingRace = { id: 9, eventId: 'yard-sprint', car: 'beater', seed: 9, startedAt: T0 };
    const outcome = { place: 1, playerTime: 20, gapText: '', perfects: 0, nitroUsed: 0, standings: [], advice: null };
    const r = P.commitRace(s, { raceId: 9, mode: 'live', outcome }, []);
    expect(r?.freshRep).toBe(p.freshRep);
    expect(P.computePayout(s, y, 1, 'quick', 0).freshRep).toBe(0);
  });

  it('offers an opening boost and unlocks tools through races', () => {
    const g = mkGame();
    expect(g.startRace('yard-sprint', T0)?.nitroCharges).toBe(1);
    expect(g.state.nitro).toBe(0);
    expect(P.mergeAllUnlocked(g.state)).toBe(false);
    g.state.stats.races = 5;
    expect(P.mergeAllUnlocked(g.state)).toBe(true);
  });
});

describe('race payouts', () => {
  it('pays every placement, scaled by finish', () => {
    const s = newGame(0);
    const e = eventById('yard-sprint');
    const pays = [1, 2, 3, 4].map((p) => P.computePayout(s, e, p, 'quick', 0));
    for (let i = 1; i < 4; i++) {
      expect(pays[i].cash).toBeLessThan(pays[i - 1].cash);
      expect(pays[i].rep).toBeLessThan(pays[i - 1].rep);
      expect(pays[i].cash).toBeGreaterThan(0);
    }
  });

  it('first clear and precision only in live races; boss loot awarded once', () => {
    const s = newGame(0);
    s.owned.push('beater');
    const e = eventById('rusty-ray');
    const first = P.computePayout(s, e, 1, 'live', 2);
    expect(first.boss).toBe(true);
    expect(first.precision).toBe(2 * P.perfectBonus(e)); // 10% of the win purse per Perfect, two at most
    expect(P.computePayout(s, e, 1, 'quick', 2).boss).toBe(false);
    s.bosses.push('ray');
    expect(P.computePayout(s, e, 1, 'live', 0).boss).toBe(false);
    const y = eventById('yard-sprint');
    expect(P.computePayout(s, y, 1, 'live', 0).firstClear).toBe(true);
    expect(P.computePayout(s, y, 1, 'quick', 0).firstClear).toBe(false);
  });

  it('gates Quick Race behind a live win and never on the boss', () => {
    const s = newGame(0);
    expect(P.canQuickRace(s, eventById('yard-sprint'))).toBe(false);
    s.events['yard-sprint'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    expect(P.canQuickRace(s, eventById('yard-sprint'))).toBe(true);
    s.owned.push('beater');
    s.events['rusty-ray'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    expect(P.canQuickRace(s, eventById('rusty-ray'))).toBe(false);
  });

  it('commits a live result exactly once and spends only used nitro', () => {
    const g = mkGame();
    g.state.nitro = 3;
    const { id, out } = liveRace(g, 'yard-sprint', T0 + 1000);
    const cash0 = g.state.cash;
    const r1 = g.commitRace(id, out, T0 + 30_000);
    const r2 = g.commitRace(id, out, T0 + 30_001);
    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
    expect(g.state.cash).toBe(cash0 + r1!.cash);
    expect(g.state.nitro).toBe(3 - Math.max(0, out.nitroUsed - 1)); // crew charge spent first
    expect(out.nitroUsed).toBeGreaterThan(0);
  });

  it('boss loot is single-award across repeated wins', () => {
    const g = mkGame();
    g.state.owned.push('beater');
    g.state.activeCar = 'beater';
    // strong parts so the boss is beaten
    for (const f of ['engine', 'tires', 'turbo'] as const) put(g.state, 5, ['engine', 'tires', 'turbo'].indexOf(f), f, 3);
    let wins = 0;
    for (let k = 0; k < 4; k++) {
      const { id, out } = liveRace(g, 'rusty-ray', T0 + k * 60_000);
      const r = g.commitRace(id, out, T0 + k * 60_000 + 30_000)!;
      if (r.place === 1) wins++;
    }
    expect(wins).toBeGreaterThan(1);
    expect(g.state.bosses).toEqual(['ray']);
    expect(g.state.blueprints).toHaveLength(1);
  });

  it('Quick Race runs for the race duration then pays the base payout once, surviving reload', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.state.events['yard-sprint'] = { wins: 1, starts: 1, bestPlace: 1, bestTime: 20 };
    g.saveNow(T0);
    g.quickRace('yard-sprint', T0 + 1000);
    const q = g.state.pendingQuick!;
    expect(q).not.toBeNull();
    g.state.rep = 25; // opens Crusher Run
    expect(P.recommendedEvent(g.state).id).toBe('crusher-run'); // live pick avoids the crew's event
    g.state.rep = 0;
    expect(g.startRace('crusher-run', T0 + 2000)).toBeNull(); // still needs Rep
    g.state.pendingRace = null;
    const cash0 = g.state.cash;
    g.tick(1, T0 + 5000);
    expect(g.state.pendingQuick).not.toBeNull();
    // reload after it finished
    const g2 = new Game(kv, '/Rev-Up/', q.endsAt + 10);
    expect(g2.state.pendingQuick).toBeNull();
    const base = P.computePayout(newGame(0), eventById('yard-sprint'), q.outcome.place, 'quick', 0);
    expect(g2.state.cash).toBe(cash0 + base.cash);
    const g3 = new Game(kv, '/Rev-Up/', q.endsAt + 20);
    expect(g3.state.cash).toBe(g2.state.cash);
  });
});

describe('saves', () => {
  it('round-trips and validates', () => {
    const s = newGame(T0);
    expect(validateState(s)).toEqual([]);
    expect(decodeSave(encodeSave(s))).toEqual(s);
    expect(importText(exportText(s))).toEqual(s);
  });

  it('recovers from a corrupted or malformed save and keeps a backup', () => {
    const kv = new MemoryKV();
    kv.setItem(saveKey('/Rev-Up/'), '{"app":"rev-up","v":1,"sum":1,"data":"{}"}');
    const r = loadGame(kv, '/Rev-Up/', T0);
    expect(r.status).toBe('recovered');
    expect(kv.getItem('revup:/Rev-Up/:corrupt-backup')).toBeTruthy();
    const bad = newGame(T0) as unknown as Record<string, unknown>;
    bad.cash = -5;
    kv.setItem(saveKey('/Rev-Up/'), encodeSave(bad as never));
    expect(loadGame(kv, '/Rev-Up/', T0).status).toBe('recovered');
    kv.setItem(saveKey('/Rev-Up/'), 'garbage');
    expect(loadGame(kv, '/Rev-Up/', T0).status).toBe('recovered');
  });

  it('refuses saves from a newer schema, migrates partial old shapes', () => {
    const s = newGame(T0) as unknown as Record<string, unknown>;
    s.v = 99;
    expect(decodeSave(encodeSave(s as never))).toBeNull();
    const old = newGame(T0) as unknown as Record<string, unknown>;
    delete old.tips;
    delete old.pendingQuick;
    expect(decodeSave(encodeSave(old as never))).not.toBeNull();
  });

  it('rejects writes from a stale tab', () => {
    const kv = new MemoryKV();
    const a = newGame(T0);
    const b = structuredClone(a);
    expect(writeGame(kv, '/x/', a)).toBe('ok');
    expect(writeGame(kv, '/x/', a)).toBe('ok');
    expect(writeGame(kv, '/x/', b)).toBe('conflict');
  });

  it('namespaces storage by base path', () => {
    const kv = new MemoryKV();
    const g1 = new Game(kv, '/Rev-Up/', T0);
    g1.state.cash = 123;
    g1.saveNow(T0);
    const g2 = new Game(kv, '/Other/', T0);
    expect(g2.state.cash).toBe(0);
  });

  it('abandons a race in flight on reload without spending nitro', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.state.nitro = 2;
    g.saveNow(T0);
    g.startRace('yard-sprint', T0 + 100);
    const g2 = new Game(kv, '/Rev-Up/', T0 + 5000);
    expect(g2.state.pendingRace).toBeNull();
    expect(g2.state.nitro).toBe(2);
    expect(g2.state.stats.races).toBe(0);
  });

  it('keeps car ownership when the browser closes mid-reveal', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.state.rep = 80;
    g.transact((d) => {
      put(d, 0, 0, 'tires', 2);
      put(d, 0, 1, 'tires', 2);
      return B.moveOrFuse(d, at(d, 0, 0), at(d, 0, 1), T0);
    }, T0);
    expect(g.state.owned).toContain('beater');
    const g2 = new Game(kv, '/Rev-Up/', T0 + 1000);
    expect(g2.state.owned).toContain('beater');
    expect(g2.state.pendingReveal).toBe('beater');
    g2.finishReveal('beater', T0 + 2000);
    expect(new Game(kv, '/Rev-Up/', T0 + 3000).state.pendingReveal).toBeNull();
  });
});

describe('offline claims', () => {
  const rate = carById('junker').offlineRate;
  it('awards one bounded claim for up to eight hours', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    g.saveNow(T0);
    const g2 = new Game(kv, '/Rev-Up/', T0 + 20 * 3600_000);
    expect(g2.state.offline.pendingS).toBe(OFFLINE_MAX_S);
    expect(g2.state.offline.pendingCash).toBe(Math.floor((OFFLINE_MAX_S / 60) * rate));
  });
  it('repeat reloads never multiply the same claim', () => {
    const kv = new MemoryKV();
    mkGame(kv).saveNow(T0);
    const a = new Game(kv, '/Rev-Up/', T0 + 3600_000);
    const c1 = a.state.offline.pendingCash;
    const b = new Game(kv, '/Rev-Up/', T0 + 3600_000 + 2000);
    const c = new Game(kv, '/Rev-Up/', T0 + 3600_000 + 4000);
    expect(b.state.offline.pendingCash).toBe(c1);
    expect(c.state.offline.pendingCash).toBe(c1);
    const got = c.claimOffline(T0 + 3600_000 + 5000);
    expect(got).toBe(c1);
    expect(new Game(kv, '/Rev-Up/', T0 + 3600_000 + 6000).state.offline.pendingCash).toBe(0);
  });
  it('clamps clock rollback and does not recount the gap later', () => {
    const kv = new MemoryKV();
    mkGame(kv).saveNow(T0);
    const back = new Game(kv, '/Rev-Up/', T0 - 3600_000);
    expect(back.state.offline.pendingCash).toBe(0);
    const fwd = new Game(kv, '/Rev-Up/', T0 + 60_000);
    expect(fwd.state.offline.pendingCash).toBe(0); // only 1 real minute since last seen
  });
  it('leaves the board alone while away', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    const board = JSON.stringify(g.state.board);
    const crates = g.state.crates.length;
    g.saveNow(T0);
    const g2 = new Game(kv, '/Rev-Up/', T0 + 5 * 3600_000);
    expect(JSON.stringify(g2.state.board)).toBe(board);
    expect(g2.state.crates.length).toBe(crates);
  });
});

describe('race result reload consistency', () => {
  it('after committing, a reload shows the same currencies and last result', () => {
    const kv = new MemoryKV();
    const g = mkGame(kv);
    const { id, out } = liveRace(g, 'yard-sprint', T0 + 1000);
    g.commitRace(id, out, T0 + 30_000);
    const g2 = new Game(kv, '/Rev-Up/', T0 + 31_000);
    expect(g2.state.cash).toBe(g.state.cash);
    expect(g2.state.rep).toBe(g.state.rep);
    expect(g2.state.lastResult?.raceId).toBe(id);
    expect(runRace).toBeTypeOf('function');
  });
});
