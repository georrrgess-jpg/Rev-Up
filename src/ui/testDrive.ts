// Test & Compare (race workstream, 1.10 Redline): pick a candidate part for a car — owned, or one to craft or order,
// fitted virtually — and drive the same short test course twice, live: your build, then the candidate. No rivals,
// rewards, purse or nitro; nothing in the save moves until you choose Fit. Then a compare card: launch split, exit
// speed at a named bend, top speed, finish time and clean shifts, current vs candidate, with what the part did on its
// own (the same two runs simulated with identical shifting) and one button: Fit it, Craft it or Order it.
// A quick estimate (both runs simulated with your usual shifting) is there for anyone who would rather not drive.
//
// Entry point other screens call: openTestDrive(app, { car?, family?, partId?, tier? }).
import './css/test-drive.css';
import * as TD from '../core/testDrive';
import type { RaceOutcome, RaceSim } from '../core/race';
import { ACTIVE_FAMILIES, CarId, FAMILIES, Family, carById } from '../data/tables';
import type { SlotRef } from '../core/events';
import type { App } from './app';
import { h } from './dom';
import { RaceScreen } from './raceScreen';
import { runGoalAction } from './goalCard';
import { openShop } from './shop';

export interface TestDriveOpts { car?: CarId; family?: Family; partId?: number; tier?: number }

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(x !== 0 && Math.abs(x) < 0.1 ? 1 : 0)}%`;
const statWord = (f: Family) => FAMILIES[f].statLabel.toLowerCase();
const virtual = (c: TD.Candidate) => c.source === 'craft' || c.source === 'order';

/** Open Test & Compare for a car (default: the active car), optionally on a family, an owned part or a tier. */
export function openTestDrive(app: App, opts: TestDriveOpts = {}) {
  const s0 = app.game.state;
  const car: CarId = opts.car && s0.owned.includes(opts.car) ? opts.car : s0.activeCar;
  let family: Family = opts.family ?? (opts.partId !== undefined ? [...s0.board, ...s0.tray, ...(s0.shelf ?? [])].find((p) => p?.id === opts.partId)?.f : undefined)
    ?? TD.defaultCandidate(s0, car)?.family ?? 'tires';
  const pickFor = (f: Family): TD.Candidate | null => {
    const list = TD.candidatesFor(app.game.state, car, f);
    return list.find((c) => opts.partId !== undefined && c.partId === opts.partId)
      ?? list.find((c) => opts.tier !== undefined && c.tier === opts.tier)
      ?? TD.defaultCandidate(app.game.state, car, f) ?? list[0] ?? null;
  };
  let chosen = pickFor(family);
  const course = TD.courseFor(car);
  app.sheet((close) => {
    const body = h('div', { class: 'td' });
    const render = () => {
      const s = app.game.state;
      const list = TD.candidatesFor(s, car, family);
      if (chosen && chosen.family !== family) chosen = pickFor(family);
      const last = s.testRuns?.[car];
      body.replaceChildren(...([
        h('h2', {}, 'Test & Compare'),
        h('p', { class: 'td-lede' }, `Drive a short test twice — your ${carById(car).model} as it is, then with the part — and see what it changes. No rivals, no rewards, nothing spent.`),
        h('div', { class: 'td-course' }, h('b', {}, course.name), ` · measures launch 0–${course.launchM} m, exit speed at ${course.bendName}, top speed and time`),
        h('div', { class: 'td-fams', role: 'tablist', 'aria-label': 'Part family' }, ...ACTIVE_FAMILIES.map((f) => h('button', {
          class: `btn sm${f === family ? ' on' : ''}`, role: 'tab', 'aria-selected': f === family ? 'true' : 'false',
          onclick: () => { family = f; chosen = pickFor(f); render(); },
        }, FAMILIES[f].name))),
        list.length ? h('div', { class: 'td-cands', role: 'radiogroup', 'aria-label': 'Candidate part' }, ...list.map((c) => {
          const gain = TD.statGain(s, car, c);
          const on = !!chosen && chosen.family === c.family && chosen.tier === c.tier && chosen.source === c.source && chosen.partId === c.partId;
          return h('button', { class: `td-cand${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', onclick: () => { chosen = c; render(); } },
            h('span', { class: 'td-dot', 'aria-hidden': 'true' }),
            h('span', { class: 'grow' }, h('b', {}, c.label), virtual(c) ? h('span', { class: 'td-virtual' }, 'virtual fit') : null),
            h('span', { class: `num td-gain ${gain > 0 ? 'up' : gain < 0 ? 'down' : ''}` }, `${pct(gain)} ${statWord(c.family)}`));
        })) : h('p', {}, `No other ${FAMILIES[family].name} to compare yet — this car is at its cap.`),
        last ? h('p', { class: 'td-last' }, `Last test: ${lastLabel(last.parts)} · ${(last.b.time - last.a.time) <= 0 ? '−' : '+'}${Math.abs(last.b.time - last.a.time).toFixed(2)} s`) : null,
        h('div', { class: 'td-btns' },
          h('button', { class: 'btn primary wide', disabled: !chosen, onclick: () => { if (!chosen) return; const c = chosen; close(); driveTest(app, car, c); } },
            h('span', { class: 'stack' }, 'Drive the test', h('small', {}, '2 short runs · same course and seed'))),
          h('button', { class: 'btn wide', disabled: !chosen, onclick: () => { if (!chosen) return; const c = chosen; close(); const e = TD.estimate(app.game.state, car, c); showCompare(app, car, c, e.a, e.b, { live: false, shift: e.shift }); } },
            h('span', { class: 'stack' }, 'Quick estimate', h('small', {}, 'simulated with your usual shifting')))),
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    };
    render();
    return body;
  });
}

function lastLabel(parts: string): string {
  const [f, t] = parts.split(':');
  return FAMILIES[f as Family] ? `${t} ${FAMILIES[f as Family].name}` : parts;
}

/** Run one live test run on the race screen; `done` gets the probe's measurements, or null if the player left. */
function runLive(app: App, car: CarId, side: TD.BuildSide, c: TD.Candidate, label: string, done: (m: TD.TestMetrics | null) => void) {
  const setup = TD.testSetup(app.game.state, car, side, c);
  const probe = new TD.TestProbe(TD.courseFor(car), setup.track!);
  app.busy = true;
  let result: TD.TestMetrics | null = null;
  const rs: RaceScreen = new RaceScreen(app, setup, -1, () => {
    app.busy = false;
    rs.el.remove();
    done(result);
  }, { test: { label, probe, onDone: (o: RaceOutcome | null, sim: RaceSim) => { result = o ? probe.result(sim) : null; } } });
  app.root.append(rs.el);
}

/** The two live runs with a short card between them, then the comparison. */
function driveTest(app: App, car: CarId, c: TD.Candidate) {
  const name = `T${c.tier} ${FAMILIES[c.family].name}`;
  runLive(app, car, 'current', c, 'Run 1 of 2 · Current build', (a) => {
    if (!a) { app.views[app.route].show(); return; }
    app.sheet((close) => h('div', { class: 'td' },
      h('h2', {}, `Run 1: ${a.time.toFixed(2)} s`),
      h('p', {}, `Now the same course with the ${name}${virtual(c) ? ' (a virtual fit — nothing is crafted or bought)' : ''}. Drive it the same way.`),
      h('div', { class: 'td-btns' },
        h('button', { class: 'btn primary wide', onclick: () => {
          close();
          runLive(app, car, 'candidate', c, `Run 2 of 2 · ${name}`, (b) => {
            if (!b) { app.views[app.route].show(); return; }
            showCompare(app, car, c, a, b, { live: true });
          });
        } }, `Drive run 2 · ${name}`),
        h('button', { class: 'btn wide', onclick: () => { close(); app.views[app.route].show(); } }, 'Stop the test'))));
  });
}

/** The compare card (live pair or estimate), saved as the car's last test. */
function showCompare(app: App, car: CarId, c: TD.Candidate, a: TD.TestMetrics, b: TD.TestMetrics, how: { live: boolean; shift?: string }) {
  const course = TD.courseFor(car);
  app.game.transact((d) => { TD.saveTestRun(d, car, course, a, b, c, Date.now()); return []; });
  // what the part does on its own: the same two runs with identical (clean) shifting
  // (an estimate is already two runs with the same shifting: its verdict reads the same numbers as its table)
  const same = how.live ? { a: TD.simulateSide(app.game.state, car, 'current', null, 'clean'), b: TD.simulateSide(app.game.state, car, 'candidate', c, 'clean') } : { a, b };
  const rows = TD.compareRows(course, a, b);
  const name = `T${c.tier} ${FAMILIES[c.family].name}`;
  const dLive = b.time - a.time, dPart = same.b.time - same.a.time;
  const driving = how.live && Math.abs(dLive - dPart) >= 0.1
    ? `Your two runs differ by ${Math.abs(dLive).toFixed(2)} s; with identical shifting the part is worth ${dPart <= 0 ? '−' : '+'}${Math.abs(dPart).toFixed(2)} s — the rest was the driving (${a.clean}/${a.shifts} vs ${b.clean}/${b.shifts} clean shifts).`
    : null;
  app.sheet((close) => {
    const action = actionFor(app, car, c, close);
    return h('div', { class: 'td td-compare' },
      h('h2', {}, how.live ? 'Test result' : 'Estimate'),
      h('p', { class: 'td-lede' }, `${carById(car).model} · ${course.name}${how.live ? ' · driven live' : ` · ${how.shift}`}`),
      h('table', { class: 'td-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Current'), h('th', {}, name), h('th', {}, 'Change'))),
        h('tbody', {}, ...rows.map((r) => h('tr', { class: r.better === true ? 'up' : r.better === false ? 'down' : '' },
          h('th', { scope: 'row' }, r.label), h('td', { class: 'num' }, r.a), h('td', { class: 'num' }, r.b),
          h('td', { class: 'num td-delta' }, r.better === true ? `▲ ${r.delta}` : r.better === false ? `▼ ${r.delta}` : r.delta))))),
      h('p', { class: `td-verdict ${dPart < -0.005 ? 'up' : dPart > 0.005 ? 'down' : ''}` }, TD.verdict(c, same, course)),
      driving ? h('p', { class: 'td-note' }, driving) : null,
      h('div', { class: 'td-btns' },
        action ? h('button', { class: 'btn primary wide', onclick: action.run }, h('span', { class: 'stack' }, action.label, action.sub ? h('small', {}, action.sub) : null)) : null,
        h('button', { class: 'btn wide', onclick: () => { close(); openTestDrive(app, { car, family: c.family }); } }, 'Test another part'),
        h('button', { class: 'btn wide', onclick: () => { close(); app.views[app.route].show(); } }, 'Done')));
  });
}

/** Fit (owned part, existing install rules), craft (route to the merge) or order (the Shop, preselected). */
function actionFor(app: App, car: CarId, c: TD.Candidate, close: () => void): { label: string; sub?: string; run: () => void } | null {
  const name = `T${c.tier} ${FAMILIES[c.family].name}`;
  const model = carById(car).model;
  if (c.source === 'bench' || c.source === 'shelf') return {
    label: `Fit the ${name}`, sub: `to the ${model} · the old part goes to its place`,
    run: () => {
      const g = app.game;
      if (c.source === 'shelf') {
        const ev = g.unstorePart(c.partId!);
        if (ev.some((e) => e.type === 'invalid')) { app.toast((ev.find((e) => e.type === 'invalid') as { reason: string }).reason); return; }
      }
      const at = slotOf(app, c.partId!);
      if (!at) { app.toast('That part is no longer on the bench'); return; }
      const ev = g.installPart(car, at);
      const bad = ev.find((e) => e.type === 'invalid') as { reason: string } | undefined;
      if (bad) { app.toast(bad.reason); return; }
      close();
      app.toast(`Fitted the ${name} to the ${model}`);
      app.views[app.route].show();
    },
  };
  if (c.source === 'craft') return {
    label: `Craft the ${name}`, sub: c.pairReady ? `merge your two T${c.tier - 1}s` : `merge two T${c.tier - 1} ${FAMILIES[c.family].plural}`,
    run: () => { close(); runGoalAction(app, { kind: 'craft', family: c.family, tier: c.tier, label: `Craft T${c.tier}` }); },
  };
  return {
    label: `Order the ${name}`, sub: c.price ? `$${c.price.toLocaleString('en-US')} in the Shop` : 'in the Shop',
    run: () => { close(); openShop(app, c.family, { tab: 'parts', tier: c.tier }); },
  };
}

function slotOf(app: App, id: number): SlotRef | null {
  const s = app.game.state;
  const bi = s.board.findIndex((p) => p?.id === id);
  if (bi >= 0) return { zone: 'board', i: bi };
  const ti = s.tray.findIndex((p) => p?.id === id);
  return ti >= 0 ? { zone: 'tray', i: ti } : null;
}
