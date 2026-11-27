// The Race menu: one recommended event with the reason it suits your goal and build, then the catalogue.
// Each event shows track type, difficulty, reward and requirements; rivals and full payouts sit behind a tap.
// Live races (you drive: full purse and bonuses) and Quick Races (your crew drives while you merge: a share
// of the purse, no bonuses) are labelled and priced apart. Owned by the mobile UX workstream.
import { carStyle } from '../core/style';
import type { GameState } from '../core/state';
import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { mph } from '../core/units';
import { DISTRICTS, EVENTS, FAMILIES, RIVALS, RaceEvent, TRACKS, carById, eventById, finishStripe, CREW_NITRO, nitroCapFor } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { difficulty, fitStatus } from './benefit';
import { h, ordinal } from './dom';
import { openFitParts } from './fit';
import { RaceScreen } from './raceScreen';
import { openPitSetup } from './pitSetup';
import { rivalRunsSection } from './rivalRuns';
import { jobBoardSection } from './jobs';
import type { CarId } from '../data/tables';

/** Speed-trap thresholds and records are stored in km/h until the stage-2 tables move to mph: show them in mph. */

export class RaceView implements View {
  el: HTMLElement;
  private head: HTMLElement;
  private headCanvas: HTMLCanvasElement;
  private fitBar: HTMLElement;
  private list: HTMLElement;
  private visible = false;
  private timer = 0;
  /** Pit Setup sent the player to the Garage to merge: reopen it for this event when the Race menu shows again. */
  private pitReturn: string | null = null;

  constructor(private app: App) {
    this.headCanvas = h('canvas', { 'aria-hidden': 'true' });
    this.head = h('div', { class: 'stats' });
    this.fitBar = h('div', { class: 'fitbar' });
    this.list = h('div', { class: 'racelist scroll' });
    this.el = h('section', { class: 'view race-view', 'aria-label': 'Race' },
      h('div', { class: 'racehead' }, this.headCanvas, this.head, h('span', { style: 'flex:1' }),
        h('button', { class: 'btn sm', onclick: () => app.go('showroom') }, 'Change car')),
      this.fitBar,
      this.list);
  }

  show() {
    this.visible = true;
    this.render();
    if (this.pitReturn && !this.app.busy) {
      const id = this.pitReturn;
      this.pitReturn = null;
      this.openPit(id);
    }
    clearInterval(this.timer);
    this.timer = window.setInterval(() => { if (this.app.game.state.pendingQuick) this.render(); }, 1000);
  }
  hide() { this.visible = false; clearInterval(this.timer); }
  onEvents(ev: GameEvent[]) { if (this.visible && ev.length) this.render(); }

  render() {
    const s = this.app.game.state;
    const cls = carById(s.activeCar);
    const lo = computeLoadout(s);
    this.head.replaceChildren(h('strong', {}, cls.model),
      h('div', { class: 'head-stats' }, h('span', {}, `${mph(lo.stats.top)} mph top`), h('span', {}, `Nitro ${s.nitro}/${nitroCapFor(s.upgrades.nitroTank)}`)));
    const { w, h: hh } = fitCanvas(this.headCanvas);
    const ctx = this.headCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hh);
    const paint = s.paints[s.activeCar];
    const length = Math.min(w * .83, hh * 1.85);
    drawCar(ctx, s.activeCar, (w - length * 1.06) / 2, hh * .91, length,
      { paint: paint ?? cls.paint, trim: cls.trim, livery: finishStripe(s.activeCar, paint), style: carStyle(s, s.activeCar) });

    // Empty or improvable slots: say so before the player races, with the one action that fixes it.
    const fs = fitStatus(s);
    const fitMsg = fs.empty.length
      ? `${fs.empty.length === 1 ? `The ${FAMILIES[fs.empty[0]].name} slot is` : `${fs.empty.length} part slots are`} empty on your ${cls.model}. Empty slots add nothing.`
      : fs.better.length ? `${fs.better.length === 1 && fs.better[0] !== 'tires' ? `A better ${FAMILIES[fs.better[0]].name} is` : `Better ${fs.better.map((f) => FAMILIES[f].name).join(' and ')} are`} on your bench, not on the car.` : '';
    this.fitBar.hidden = !fitMsg;
    this.fitBar.replaceChildren(...(fitMsg ? [h('span', { class: 'grow' }, fitMsg),
      h('button', { class: 'btn sm primary', 'data-coach': 'race-fit', onclick: () => openFitParts(this.app) }, 'Fit parts')] : []));

    const rec = P.recommendedEvent(s);
    const q = s.pendingQuick;
    const expanded = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details.event-detail[open]')).map((d) => d.dataset.event));
    const nitroNote = `${s.nitro + CREW_NITRO} nitro${s.nitro ? '' : ' (crew)'}`; // banked charges plus the free crew charge
    const details = (e: RaceEvent) => {
      const p = P.purse(s, e);
      const quick = P.canQuickRace(s, e) || (!e.boss && !e.timeAttack && !e.speedTrap && !e.knockout);
      return h('details', { class: 'event-detail', 'data-event': e.id, ...(expanded.has(e.id) ? { open: '' } : {}) },
        h('summary', {}, 'Rivals and payouts'),
        h('p', {}, e.blurb),
        e.rivals.length ? h('div', { class: 'rivals' }, ...e.rivals.map((id) => RIVALS[id]).map((r) => h('div', {}, h('b', {}, r.name), ` · ${r.line}`))) : null,
        e.timeAttack ? null : h('table', { class: 'paytable' },
          h('tr', {}, h('th', {}, ''), ...p.live.slice(0, e.rivals.length + 1).map((_, i) => h('th', {}, ordinal(i + 1)))),
          h('tr', {}, h('th', {}, 'Live'), ...p.live.slice(0, e.rivals.length + 1).map((c) => h('td', {}, `$${c}`))),
          quick ? h('tr', { class: 'q' }, h('th', {}, 'Quick'), ...p.quick.slice(0, e.rivals.length + 1).map((c) => h('td', {}, `$${c}`))) : null,
          h('tr', { class: 'r' }, h('th', {}, 'Rep'), ...e.payout.rep.slice(0, e.rivals.length + 1).map((c) => h('td', {}, `${c}`)))),
        h('p', {}, `Live only: +$${p.perfect} per Perfect boost (up to 2)${p.firstClear ? `, +$${p.firstClear} for your first win` : ''}. Quick Race pays ${Math.round(p.quickShare * 100)}% of the live purse and no bonuses.`),
        e.boss ? h('p', { class: 'event-bonus' }, `First win: ${e.boss.reward.blueprint} paint, “${e.boss.reward.badge}” badge, $${e.boss.reward.cash} and ${e.boss.reward.crates} crates.`) : null);
    };
    const quickPart = (e: RaceEvent, small: boolean) => {
      const crew = P.purse(s, e).quick;
      if (!P.canQuickRace(s, e)) {
        if (small || e.boss || e.timeAttack || e.speedTrap || e.knockout || e.heatOf) return null;
        return h('div', { class: 'quick-locked' }, h('b', {}, 'Quick Race'), ` opens after your first live win here — then your crew can race it for $${crew[0]} while you merge.`);
      }
      const here = q?.eventId === e.id;
      const left = here ? Math.max(0, Math.ceil((q!.endsAt - Date.now()) / 1000)) : 0;
      return h('button', {
        class: `btn quick${small ? ' sm' : ''}${q && !here ? ' off' : ''}`, 'data-coach': small ? null : 'race-quick',
        'aria-label': `Quick Race: your crew races for up to $${crew[0]}, no bonuses`, onclick: () => this.startQuick(e.id),
      }, here ? `Crew racing · ${left} s` : small ? h('span', { class: 'stack' }, 'Quick', h('small', {}, `$${crew[0]}`))
        : h('span', { class: 'stack' }, 'Quick Race', h('small', {}, `crew drives · up to $${crew[0]}`)));
    };
    const course = (e: RaceEvent) => h('span', { class: 'course' }, TRACKS[e.track].course);
    const diffTag = (e: RaceEvent) => {
      const car = P.eventUnlocked(s, e).switchCar ?? s.activeCar;
      const d = difficulty(s, e, car);
      return h('span', { class: `diff ${d.cls}`, title: d.why }, d.label);
    };
    const reasonFor = (e: RaceEvent) => {
      if (e.speedTrap) {
        const m = s.medals?.[e.id] ?? 0;
        const best = s.events[e.id] ? P.bestTrapMph(s.events[e.id]) : 0;
        return m >= 3 ? `Gold won${best ? ` · record ${best} mph` : ''}` : `${['Bronze', 'Silver', 'Gold'][m]} at ${[e.speedTrap.bronze, e.speedTrap.silver, e.speedTrap.gold][m]} mph through the gate${best ? ` · best ${best} mph` : ''}`;
      }
      return P.eventReason(s, e);
    };

    // Featured: one recommended event with a reason to run it now (a knockout shows the heat you race next).
    const shown = rec.knockout ? eventById(rec.knockout.heats[s.knockout?.heat ?? 0]) : rec;
    const fr = s.events[rec.id];
    const d = difficulty(s, shown, P.eventUnlocked(s, rec).switchCar ?? s.activeCar);
    const winRep = shown.payout.rep[0];
    const fact = (k: string, v: (string | HTMLElement)[] | string, cls = '') => h('div', { class: `fact ${cls}` }, h('small', {}, k), h('span', {}, ...(Array.isArray(v) ? v : [v])));
    const featured = h('section', { class: 'featured', 'aria-label': 'Recommended race' },
      h('div', { class: 'feat-label' }, 'Recommended for you'),
      h('div', { class: 'top' }, h('span', { class: 'name' }, rec.name), rec.boss && !s.bosses.includes(rec.boss.rival) ? h('span', { class: 'tag boss' }, 'Rival') : null),
      h('p', { class: 'reason' }, reasonFor(rec)),
      h('div', { class: 'facts' },
        fact('Track', [course(rec), ` ${TRACKS[rec.track].favours}`]),
        fact('Difficulty', [h('span', { class: `diff ${d.cls}` }, d.label), ` ${d.why}`]),
        fact('Win pays', shown.timeAttack ? `$${shown.payout.cash[0]} a run · medals pay once` : `$${shown.payout.cash[0]} and ${winRep} Rep${shown.payout.crates[0] ? ` · ${shown.payout.crates[0]} crate${shown.payout.crates[0] > 1 ? 's' : ''}` : ''}${P.purse(s, shown).firstClear ? ` · +$${P.purse(s, shown).firstClear} first win` : ''}`),
        fact('Needs', P.eventUnlocked(s, rec).switchCar ? `The ${carById(P.eventUnlocked(s, rec).switchCar!).model} (we'll switch to it)` : 'Nothing more — open now'),
        fr?.bestTime ? fact('Your record', `${fr.bestTime.toFixed(2)} s`) : null),
      rec.goals ? goalList(s, rec) : null,
      rec.knockout ? heatList(s, rec) : null,
      h('div', { class: 'btns' },
        h('button', { class: 'btn pit-btn', 'data-pit': rec.id, onclick: () => this.openPit(rec.id) }, h('span', { class: 'stack' }, 'Pit Setup', h('small', {}, 'fit, then race'))),
        h('button', { class: `btn primary race-live${q && q.eventId === rec.id ? ' off' : ''}`, 'data-coach': 'race-live', onclick: () => this.startLive(rec.id) },
          h('span', { class: 'stack' }, 'Race live', h('small', {}, `you drive · full purse · ${nitroNote}`)))),
      quickPart(rec, false),
      details(rec),
      q?.eventId === rec.id ? h('div', { class: 'quickbar' }, h('i', { style: `width:${Math.min(100, ((Date.now() - q!.startedAt) / (q!.endsAt - q!.startedAt)) * 100)}%` })) : null);

    // A second choice beside the recommendation: a different route with its own reward.
    const alts = P.alternatives(s, rec);
    const altBox = alts.length ? h('section', { class: 'alts', 'aria-label': 'Also worth racing' }, h('div', { class: 'feat-label' }, 'Or try'),
      ...alts.map(({ e }) => h('div', { class: 'alt' }, h('div', { class: 'grow' }, h('b', {}, e.name), ' ', diffTag(e), h('div', { class: 'd' }, reasonFor(e))),
        h('button', { class: 'btn sm pit-btn', 'data-pit': e.id, 'aria-label': `Pit Setup for ${e.name}`, onclick: () => this.openPit(e.id) }, 'Pit'),
        h('button', { class: `btn sm${q?.eventId === e.id ? ' off' : ''}`, onclick: () => this.startLive(e.id) }, P.eventUnlocked(s, e).switchCar ? `Race · ${carById(P.eventUnlocked(s, e).switchCar!).model.split(' ')[0]}` : 'Race')))) : null;
    const out: HTMLElement[] = altBox ? [featured, altBox] : [featured];
    const jobs = jobBoardSection(this.app); // Job Board: short jobs, right under the races they ask for
    if (jobs) out.push(jobs);
    const runs = rivalRunsSection(this.app, (id, car) => this.startRivalRun(id, car));
    if (runs) out.push(runs);
    if (q && q.eventId !== rec.id) out.push(h('p', { class: 'crew-note' }, `Your crew is racing ${eventById(q.eventId).name} · ${Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000))} s left`));

    // Catalogue: districts you can race in first (open), locked districts after (closed, with what opens them).
    const openSections = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details.district-sec[open]')).map((dd) => dd.dataset.district));
    const firstRender = !this.list.querySelector('details.district-sec');
    // campaign order first; any district added later (stage-2 endgame) follows in table order
    const order: string[] = ['scrapyard', 'suburbs', 'meets', 'trials', 'coastal', 'downtown', 'desert', 'summit'];
    for (const e of EVENTS) if (!order.includes(e.district)) order.push(e.district);
    const medalName = ['', 'Bronze', 'Silver', 'Gold'];
    const sections: { el: HTMLElement; locked: boolean }[] = [];
    for (const dist of order) {
      const evs = EVENTS.filter((e) => e.district === dist && !e.heatOf);
      if (!evs.length) continue;
      const open = evs.filter((e) => P.eventUnlocked(s, e).ok || P.eventUnlocked(s, e).switchCar);
      let summary: string;
      if (dist === 'trials') summary = `${evs.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0)}/${evs.length * 3} medals`;
      else if (dist === 'meets') summary = `${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} trophies`;
      else if (dist === 'downtown') summary = `★ ${P.starsIn(s)}/${evs.filter((e) => e.goals).length * 3} · ${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} won`;
      else summary = `${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} won`;
      const locked = !open.length;
      if (locked) summary = `🔒 ${P.eventUnlocked(s, evs[0]).why}`;
      const rows: HTMLElement[] = [];
      for (const e of evs) {
        if (e.id === rec.id) continue;
        const u = P.eventUnlocked(s, e);
        const r = s.events[e.id];
        const medal = s.medals?.[e.id] ?? 0;
        const status = !u.ok && !u.switchCar ? `🔒 ${u.why}`
          : e.knockout ? (s.knockout ? `Through to heat ${s.knockout.heat + 1} of ${e.knockout.heats.length}` : r?.wins ? `✓ Champion ×${r.wins}` : 'Three heats · knockout')
          : e.speedTrap ? `${medal ? `${medalName[medal]} · ` : ''}${medal < 3 ? `${medalName[medal + 1]} at ${[e.speedTrap.bronze, e.speedTrap.silver, e.speedTrap.gold][medal]} mph` : 'all medals'}${r && P.bestTrapMph(r) ? ` · best ${P.bestTrapMph(r)} mph` : ''}`
          : e.timeAttack ? (medal ? `${medalName[medal]}${medal < 3 ? ` · ${medalName[medal + 1]} at ${[e.timeAttack.bronze, e.timeAttack.silver, e.timeAttack.gold][medal].toFixed(2)} s` : ' · all medals'}` : `Bronze at ${e.timeAttack.bronze.toFixed(2)} s`) + (r?.bestTime ? ` · record ${r.bestTime.toFixed(2)} s` : '')
          : e.boss && s.bosses.includes(e.boss.rival) ? `Rival beaten${r?.bestTime ? ` · record ${r.bestTime.toFixed(2)} s` : ''}`
          : r?.wins ? `✓ Won · win pays $${e.payout.cash[0]} and ${e.payout.rep[0]} Rep`
          : r ? `Best ${ordinal(r.bestPlace)} · first win +$${e.firstClear.cash}` : e.boss ? `Rival race · ${e.boss.reward.blueprint} paint` : `Win: $${e.payout.cash[0] + e.firstClear.cash} and ${e.payout.rep[0]} Rep the first time`;
        const action = u.ok
          ? h('div', { class: 'row-btns' }, quickPart(e, true), h('button', { class: 'btn sm pit-btn', 'data-pit': e.id, 'aria-label': `Pit Setup for ${e.name}`, onclick: () => this.openPit(e.id) }, 'Pit'), h('button', { class: `btn sm primary-lite${q?.eventId === e.id ? ' off' : ''}`, onclick: () => this.startLive(e.id) }, 'Race'))
          : u.switchCar && s.owned.includes(u.switchCar)
            ? h('div', { class: 'row-btns' }, h('button', { class: 'btn sm pit-btn', 'data-pit': e.id, 'aria-label': `Pit Setup for ${e.name}`, onclick: () => this.openPit(e.id) }, 'Pit'), h('button', { class: 'btn sm', onclick: () => this.startLive(e.id) }, `Race · ${carById(u.switchCar).model.split(' ')[0]}`))
            : null;
        const tags = [
          e.series ? h('span', { class: 'tag' }, `Round ${e.series.round}/${e.series.of}`) : null,
          e.carOnly ? h('span', { class: 'tag' }, 'Class meet') : null,
          e.timeAttack ? h('span', { class: 'tag' }, 'Solo') : null,
          e.speedTrap ? h('span', { class: 'tag' }, 'Speed trap') : null,
          e.partCap ? h('span', { class: 'tag' }, `Stock · T${e.partCap}`) : null,
          e.knockout ? h('span', { class: 'tag boss' }, 'Knockout') : null,
          e.goals ? starTag(s.stars?.[e.id] ?? 0) : null,
          e.trophy && s.badges.includes(e.trophy) ? h('span', { class: 'tag done' }, `🏆 ${e.trophy}`) : null,
        ];
        rows.push(h('div', { class: `evt-row${u.ok ? '' : ' locked'}` },
          h('div', { class: 'row-main' },
            h('div', { class: 'name' }, e.name, ...tags),
            h('div', { class: 'meta' }, course(e), ' ', u.ok || u.switchCar ? diffTag(e) : null, ` ${status}`)),
          action,
          u.ok || u.switchCar ? details(e) : null));
      }
      if (!rows.length) continue;
      const shouldOpen = firstRender ? (!locked && evs.some((e) => !s.events[e.id]?.wins || (e.timeAttack && (s.medals?.[e.id] ?? 0) < 3))) : openSections.has(dist);
      sections.push({ locked, el: h('details', { class: `district-sec${locked ? ' locked' : ''}`, 'data-district': dist, ...(shouldOpen ? { open: '' } : {}) },
        h('summary', { class: 'district' }, h('span', {}, DISTRICTS[dist as keyof typeof DISTRICTS].name), h('span', { class: 'dist-sum' }, summary)),
        ...rows) });
    }
    const openSecs = sections.filter((x) => !x.locked).map((x) => x.el);
    const lockedSecs = sections.filter((x) => x.locked).map((x) => x.el);
    if (openSecs.length) out.push(h('div', { class: 'feat-label cat-label' }, 'All races'), ...openSecs);
    if (lockedSecs.length) out.push(h('div', { class: 'feat-label cat-label' }, 'Still locked'), ...lockedSecs);
    const scroll = this.list.scrollTop;
    this.list.replaceChildren(...out);
    this.list.scrollTop = scroll;
  }

  /** Pit Setup for an event: fit the car that will race it, then start (or come back here after a merge/order). */
  openPit(id: string) {
    if (this.app.busy) return;
    openPitSetup(this.app, id, {
      onStart: (eid) => this.startLive(eid),
      onAwayToMerge: (eid) => {
        this.pitReturn = eid;
        this.app.go('garage');
        this.app.toast(`Merge the pair, then tap Race — Pit Setup for ${eventById(eid).name} will be waiting`, undefined, 5000);
      },
    });
  }

  /** A Rival Run: the run's car rule, cap and nitro are applied by the game; the result card offers a fast retry. */
  startRivalRun(runId: string, car: CarId) {
    if (this.app.busy) return;
    const setup = this.app.game.startRivalRun(runId, car);
    if (!setup) return;
    this.app.busy = true;
    const rs = new RaceScreen(this.app, setup, this.app.game.pendingRaceId!, () => {
      this.app.busy = false;
      rs.el.remove();
      this.app.views[this.app.route].show();
      this.app.guide?.update();
    });
    this.app.root.append(rs.el);
  }

  startQuick(id: string) {
    const s = this.app.game.state;
    if (s.pendingQuick) { this.app.toast('Your crew is already out on a Quick Race'); return; }
    this.app.game.quickRace(id);
    this.app.toast(`Quick Race started. Results in about ${Math.round((this.app.game.state.pendingQuick?.outcome.playerTime ?? 20))} s — keep merging.`);
    this.render();
  }

  startLive(id: string) {
    if (this.app.busy) return;
    // A class meet recommended for an earlier car switches to that car first.
    const u = P.eventUnlocked(this.app.game.state, eventById(id));
    if (!u.ok && u.switchCar && this.app.game.state.owned.includes(u.switchCar)) {
      this.app.game.setActiveCar(u.switchCar);
      this.app.toast(`Racing the ${carById(u.switchCar).model} for ${eventById(id).name}`);
    }
    const setup = this.app.game.startRace(id);
    if (!setup) return;
    this.app.busy = true;
    const rs = new RaceScreen(this.app, setup, this.app.game.pendingRaceId!, () => {
      this.app.busy = false;
      rs.el.remove();
      this.app.views[this.app.route].show();
      if (this.app.game.state.pendingReveal) this.app.openReveal(this.app.game.state.pendingReveal);
      else this.app.maybeShowUpdate();
      this.app.guide?.update();
    });
    this.app.root.append(rs.el);
  }
}

// ---------------------------------------------------------------------------------------------

/** ★★☆ for an event's goals. */
function starTag(bits: number): HTMLElement {
  const n = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
  return h('span', { class: `tag stars${n === 3 ? ' done' : ''}`, 'aria-label': `${n} of 3 goals` }, '★'.repeat(n) + '☆'.repeat(3 - n));
}

/** The three goals for this event, ticked when met, each with its one-time pay. */
function goalList(s: GameState, e: RaceEvent): HTMLElement {
  const bits = s.stars?.[e.id] ?? 0;
  const items = [`Win`, `Under ${e.goals!.par.toFixed(1)} s`, 'A Perfect boost'];
  return h('div', { class: 'goals', 'aria-label': 'Event goals' }, ...items.map((t, k) => h('span', { class: bits & (1 << k) ? 'met' : '' }, bits & (1 << k) ? '★ ' : '☆ ', t)),
    h('span', { class: 'pay' }, `$${P.starCash(e)} each, once`));
}

/** Knockout progress: each heat, how many go through, and where you are. */
function heatList(s: GameState, e: RaceEvent): HTMLElement {
  const at = s.knockout?.heat ?? 0;
  return h('ol', { class: 'heats' }, ...e.knockout!.heats.map((id, k) => {
    const hEv = eventById(id);
    return h('li', { class: k < at && s.knockout ? 'done' : k === at ? 'now' : '' }, h('b', {}, hEv.name), ` · ${hEv.advance === 1 ? 'win to take it' : `top ${hEv.advance} go through`}`);
  }));
}
