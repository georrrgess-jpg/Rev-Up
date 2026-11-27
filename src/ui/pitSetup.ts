// Pit Setup: from a race card straight to fitting the car and starting. Shows the car that will race, what the
// track asks for, what is fitted, and the best parts you already own for each slot with what a swap changes.
// Keep the build and start, swap one part, or apply the recommended setup and start. When nothing owned helps, it
// points at the exact merge or Workshop order and brings you back to this same event afterwards.
// Owned by the Pit Setup & Rival Runs workstream.
import './css/pit.css';
import type { GameEvent } from '../core/events';
import * as I from '../core/install';
import { computeLoadout, loadoutWith } from '../core/loadout';
import { DEMAND_FAMILY, DEMAND_LABEL, PitHint, PitSlot, changeWords, pitSlots, trackDemands } from '../core/pitSetup';
import * as P from '../core/progression';
import type { Part } from '../core/state';
import { mph } from '../core/units';
import { CarId, FAMILIES, Family, RaceEvent, TRACKS, carById, eventById } from '../data/tables';
import type { App } from './app';
import { h } from './dom';
import { describeFitEvents } from './fit';
import { openShop } from './shop';

export interface PitOpts {
  /** Start the event (the Race menu's live start: it handles class-meet car switches). */
  onStart: (eventId: string) => void;
  /** Leave for the Garage to merge; the Race menu reopens this Pit Setup when you come back. */
  onAwayToMerge: (eventId: string) => void;
}

/** The car that will race this event: the class-meet car if the event switches to it, else the active car. */
export function pitCar(app: App, e: RaceEvent): CarId {
  const s = app.game.state;
  const u = P.eventUnlocked(s, e);
  return !u.ok && u.switchCar && s.owned.includes(u.switchCar) ? u.switchCar : s.activeCar;
}

/** The event actually raced (a knockout races its next heat) and its part cap. */
function raced(app: App, e: RaceEvent): { ev: RaceEvent; cap?: number } {
  const ev = e.knockout ? eventById(e.knockout.heats[app.game.state.knockout?.heat ?? 0]) : e;
  return { ev, cap: ev.partCap ?? (ev.heatOf ? eventById(ev.heatOf).partCap : undefined) ?? e.partCap };
}

const partName = (p: Part) => `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? ` (${p.q === 'mint' ? 'Mint' : 'Polished'})` : ''}`;

export function openPitSetup(app: App, eventId: string, o: PitOpts) {
  const e = eventById(eventId);
  let note = '';
  let noteBad = false;
  app.sheet((close) => {
    const body = h('div', { class: 'pit', 'aria-label': `Pit Setup for ${e.name}` });
    const build = () => {
      const s = app.game.state;
      const car = pitCar(app, e);
      const cls = carById(car);
      const { ev, cap } = raced(app, e);
      const track = TRACKS[ev.track];
      const lo = computeLoadout(s, car, undefined, cap);
      const slots = pitSlots(s, car, cap);
      const demands = trackDemands(ev.track);
      const levelOf = (f: Family) => demands.find((d) => DEMAND_FAMILY[d.key] === f)!;
      // recommended setup (same rule as Fit Parts' Recommended fit), previewed under this race's cap
      // (only the parts that help under this race's cap, so a capped race never moves parts for nothing)
      const rec = Object.entries(I.recommendedFit(s, car)) as [Family, I.PartSource][];
      const useful = rec.filter(([f, r]) => {
        const k = FAMILIES[f].stat as 'top' | 'accel' | 'grip';
        return loadoutWith(s, car, { [f]: r.part }, cap).stats[k] > lo.stats[k] + 1e-9;
      });
      const recOver: Partial<Record<Family, Part>> = {};
      for (const [f, r] of useful) recOver[f] = r.part;
      const recAfter = loadoutWith(s, car, recOver, cap).stats;
      const recWords = changeWords(lo.stats, recAfter);
      const switching = car !== s.activeCar;

      const act = (run: () => GameEvent[]) => {
        const evs = run();
        noteBad = evs.length === 1 && evs[0].type === 'invalid';
        note = noteBad ? (evs[0] as { reason: string }).reason : describeFitEvents(app, evs);
        build();
      };
      const swap = (sl: PitSlot, k: number) => {
        const src = sl.options[k].src;
        act(() => ('at' in src ? app.game.installPart(car, src.at) : app.game.movePartBetweenCars(src.car, sl.family, car)));
      };
      const hintBtn = (hint: PitHint) => {
        if (hint.kind === 'merge') return h('button', { class: 'btn sm', onclick: () => { close(); o.onAwayToMerge(eventId); } }, 'Go merge');
        if (hint.kind === 'order') {
          return h('button', { class: 'btn sm', onclick: () => {
            close();
            openShop(app, hint.family, { tier: hint.tier, onDone: () => openPitSetup(app, eventId, o) });
          } }, 'Order');
        }
        return null;
      };

      const slotEls = slots.map((sl) => {
        const d = levelOf(sl.family);
        return h('div', { class: `pit-slot${sl.options.length ? ' can' : ''}`, 'data-family': sl.family },
          h('div', { class: 'ps-head' },
            h('b', {}, FAMILIES[sl.family].name),
            h('span', { class: `ps-need ${d.level.toLowerCase()}` }, `${DEMAND_LABEL[d.key]} · ${d.level}`),
            h('span', { class: 'ps-cur' }, sl.current ? `${partName(sl.current)} fitted${cap && sl.current.t > cap ? ` · runs at T${cap}` : ''}` : 'Empty slot')),
          ...sl.options.map((op, k) => h('div', { class: 'ps-opt' },
            h('div', { class: 'grow' }, h('div', { class: 'ps-part' }, `${partName(op.src.part)} · ${op.where}`), h('div', { class: 'ps-gain' }, op.words.join(' · ') || 'small gain')),
            h('button', { class: 'btn sm primary-lite', onclick: () => swap(sl, k), 'aria-label': `Swap in the ${partName(op.src.part)} from the ${op.where}` }, sl.current ? 'Swap' : 'Fit'))),
          sl.hint ? h('div', { class: `ps-hint ${sl.hint.kind}` }, h('span', { class: 'grow' }, sl.hint.text), hintBtn(sl.hint)) : null);
      });

      const stat = (k: string, v: string) => h('div', { class: 'pit-stat' }, h('small', {}, k), h('b', { class: 'num' }, v));
      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, `Pit Setup · ${ev.name}`),
        h('p', { class: 'd pit-sub' }, `${cls.model}${switching ? ' (this race switches to it)' : ''} · ${track.course}${cap ? ` · parts run at T${cap}, no Tune-ups` : ''}`),
        h('div', { class: 'pit-demands', 'aria-label': 'What this track asks for' },
          ...demands.map((d) => h('div', { class: 'pd' },
            h('div', { class: 'pd-top' }, h('span', {}, DEMAND_LABEL[d.key]), h('small', {}, `${FAMILIES[DEMAND_FAMILY[d.key]].name}`)),
            h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((d.share / Math.max(...demands.map((x) => x.share))) * 100)}%` })),
            h('small', { class: `pd-lv ${d.level.toLowerCase()}` }, d.level)))),
        h('div', { class: 'pit-stats' }, stat('Top speed', `${mph(lo.stats.top)} mph`), stat('Accel', lo.stats.accel.toFixed(1)), stat('Grip', lo.stats.grip.toFixed(2))),
        h('p', { class: `pit-note${noteBad ? ' bad' : ''}`, role: 'status' }, note),
        h('div', { class: 'pit-slots' }, ...slotEls),
        recWords.length
          ? h('div', { class: 'pit-actions' },
            h('button', { class: 'btn', onclick: () => { close(); o.onStart(eventId); } }, h('span', { class: 'stack' }, 'Keep build', h('small', {}, 'start the race'))),
            h('button', { class: 'btn primary', onclick: () => { applyRecommended(app, car, useful); close(); o.onStart(eventId); } }, h('span', { class: 'stack' }, 'Recommended & start', h('small', {}, recWords.join(' · ')))))
          : h('div', { class: 'pit-actions' },
            h('button', { class: 'btn primary', onclick: () => { close(); o.onStart(eventId); } }, h('span', { class: 'stack' }, 'Start race', h('small', {}, 'your best owned parts are fitted')))),
      );
    };
    build();
    return body;
  });
}

/** Fit each useful recommended part (each one a swap, so nothing needs a free cell and nothing is duplicated). */
function applyRecommended(app: App, car: CarId, useful: [Family, I.PartSource][]) {
  for (const [f, src] of useful) {
    if ('at' in src) app.game.installPart(car, src.at);
    else app.game.movePartBetweenCars(src.car, f, car);
  }
}
