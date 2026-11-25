import { carStyle } from '../core/style';
import type { GameState } from '../core/state';
import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { DISTRICTS, EVENTS, RIVALS, RaceEvent, TRACKS, carById, eventById, finishStripe, CREW_NITRO, nitroCapFor } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { h, ordinal } from './dom';

const kmh = (ms: number) => Math.round(ms * 3.6);

import { RaceScreen } from './raceScreen';

export class RaceView implements View {
  el: HTMLElement;
  private head: HTMLElement;
  private headCanvas: HTMLCanvasElement;
  private list: HTMLElement;
  private visible = false;
  private timer = 0;

  constructor(private app: App) {
    this.headCanvas = h('canvas', { 'aria-hidden': 'true' });
    this.head = h('div', { class: 'stats' });
    this.list = h('div', { class: 'racelist scroll' });
    this.el = h('section', { class: 'view', 'aria-label': 'Race' },
      h('div', { class: 'racehead' }, this.headCanvas, this.head, h('span', { style: 'flex:1' }),
        h('button', { class: 'btn sm', onclick: () => app.go('showroom') }, 'Change car')),
      this.list);
  }

  show() {
    this.visible = true;
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => { if (this.app.game.state.pendingQuick) this.render(); }, 1000);
  }
  hide() { this.visible = false; clearInterval(this.timer); }
  onEvents(ev: GameEvent[]) { if (this.visible && ev.length) this.render(); }

  render() {
    const s = this.app.game.state;
    const cls = carById(s.activeCar);
    const lo = computeLoadout(s);
    this.head.replaceChildren(h('strong', {}, cls.model), h('div', { class: 'head-stats' }, h('span', {}, `${kmh(lo.stats.top)} km/h`), h('span', {}, `Nitro ${s.nitro}/${nitroCapFor(s.upgrades.nitroTank)}`)));
    const { w, h: hh } = fitCanvas(this.headCanvas);
    const ctx = this.headCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hh);
    const paint = s.paints[s.activeCar];
    const length = Math.min(w * .83, hh * 1.85);
    drawCar(ctx, s.activeCar, (w - length * 1.06) / 2, hh * .91, length,
      { paint: paint ?? cls.paint, trim: cls.trim, livery: finishStripe(s.activeCar, paint), style: carStyle(s, s.activeCar) });

    const rec = P.recommendedEvent(s);
    const q = s.pendingQuick;
    const expanded = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details[open]')).map((d) => d.dataset.event));
    const nitroNote = `${s.nitro + CREW_NITRO} nitro${s.nitro ? '' : ' (crew)'}`; // banked charges plus the free crew charge
    const details = (e: RaceEvent) => {
      const pay = e.payout;
      return h('details', { class: 'event-detail', 'data-event': e.id, ...(expanded.has(e.id) ? { open: '' } : {}) },
        h('summary', {}, 'Rivals and payouts'),
        h('p', {}, e.blurb),
        h('div', { class: 'rivals' }, ...e.rivals.map((id) => RIVALS[id]).map((r) => h('div', {}, h('b', {}, r.name), ` · ${r.line}`))),
        h('p', {}, `Every place pays: ${[0, 1, 2, 3].map((i) => `${ordinal(i + 1)} $${pay.cash[i]} · ${pay.rep[i]} Rep`).join(' — ')}.`),
        e.boss ? h('p', { class: 'event-bonus' }, `First win: ${e.boss.reward.blueprint} paint, “${e.boss.reward.badge}” badge, $${e.boss.reward.cash} and ${e.boss.reward.crates} crates.`) : null);
    };
    const quickBtn = (e: RaceEvent, small: boolean) => {
      if (!P.canQuickRace(s, e)) return null;
      const here = q?.eventId === e.id;
      const crew = P.purse(s, e).quick;
      return h('button', { class: `btn${small ? ' sm' : ''}${q && !here ? ' off' : ''}`, 'aria-label': `Quick Race: your crew races for up to $${crew[0]}`, onclick: () => this.startQuick(e.id) },
        here ? `Crew ${Math.max(0, Math.ceil((q!.endsAt - Date.now()) / 1000))} s` : small ? h('span', { class: 'stack' }, 'Quick', h('small', {}, `$${crew[0]}`)) : h('span', { class: 'stack' }, 'Quick Race', h('small', {}, `crew earns up to $${crew[0]}`)));
    };
    const course = (e: RaceEvent) => h('span', { class: 'course' }, TRACKS[e.track].course);

    // Featured: one recommended event with a reason to run it now (a knockout shows the heat you race next).
    const shown = rec.knockout ? eventById(rec.knockout.heats[s.knockout?.heat ?? 0]) : rec;
    const fr = s.events[rec.id];
    const featured = h('section', { class: 'featured', 'aria-label': 'Up next' },
      h('div', { class: 'feat-label' }, 'Up next'),
      h('div', { class: 'top' }, h('span', { class: 'name' }, rec.name), rec.boss && !s.bosses.includes(rec.boss.rival) ? h('span', { class: 'tag boss' }, 'Rival') : null),
      h('div', { class: 'meta' }, course(rec), ` ${TRACKS[rec.track].favours}`),
      h('p', { class: 'reason' }, P.eventReason(s, rec)),
      rec.goals ? goalList(s, rec) : null,
      rec.knockout ? heatList(s, rec) : null,
      purseStrip(s, shown),
      h('div', { class: 'event-rewards' }, h('span', {}, `${shown.payout.rep[0]} Rep for a win`),
        shown.payout.crates[0] ? h('span', {}, `${shown.payout.crates[0]} crate${shown.payout.crates[0] > 1 ? 's' : ''}`) : null,
        fr?.bestTime ? h('span', {}, `Record ${fr.bestTime.toFixed(2)} s`) : null),
      h('div', { class: 'btns' },
        h('button', { class: `btn primary${q ? ' off' : ''}`, onclick: () => this.startLive(rec.id) }, h('span', { class: 'stack' }, 'Race', h('small', {}, `live · ${nitroNote}`))),
        quickBtn(rec, false)),
      details(rec),
      q?.eventId === rec.id ? h('div', { class: 'quickbar' }, h('i', { style: `width:${Math.min(100, ((Date.now() - q!.startedAt) / (q!.endsAt - q!.startedAt)) * 100)}%` })) : null);

    // A second choice beside the recommendation: a different route with its own reward.
    const alts = P.alternatives(s, rec);
    const altBox = alts.length ? h('section', { class: 'alts', 'aria-label': 'Also worth racing' }, h('div', { class: 'feat-label' }, 'Or try'),
      ...alts.map(({ e, why }) => h('div', { class: 'alt' }, h('div', { class: 'grow' }, h('b', {}, e.name), h('div', { class: 'd' }, why)),
        h('button', { class: `btn sm${q ? ' off' : ''}`, onclick: () => this.startLive(e.id) }, P.eventUnlocked(s, e).switchCar ? `Race · ${carById(P.eventUnlocked(s, e).switchCar!).model.split(' ')[0]}` : 'Race')))) : null;
    const out: HTMLElement[] = altBox ? [featured, altBox] : [featured];
    if (q && q.eventId !== rec.id) out.push(h('p', { class: 'crew-note' }, `Your crew is racing ${eventById(q.eventId).name} · ${Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000))} s left`));
    // Catalogue: one collapsible section per district, with a progress summary; the recommended one opens.
    const openSections = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details.district-sec[open]')).map((d) => d.dataset.district));
    const firstRender = !this.list.querySelector('details.district-sec');
    const order: string[] = ['downtown', 'coastal', 'suburbs', 'scrapyard', 'meets', 'trials'];
    const medalName = ['', 'Bronze', 'Silver', 'Gold'];
    for (const dist of order) {
      const evs = EVENTS.filter((e) => e.district === dist && !e.heatOf);
      if (!evs.length) continue;
      const open = evs.filter((e) => P.eventUnlocked(s, e).ok || P.eventUnlocked(s, e).switchCar);
      let summary: string;
      if (dist === 'trials') {
        const medals = evs.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0);
        summary = `${medals}/${evs.length * 3} medals`;
      } else if (dist === 'meets') {
        summary = `${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} trophies`;
      } else if (dist === 'downtown') {
        summary = `★ ${P.starsIn(s)}/${evs.filter((e) => e.goals).length * 3} · ${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} won`;
      } else {
        summary = `${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} won`;
      }
      if (!open.length) summary = `🔒 ${P.eventUnlocked(s, evs[0]).why}`;
      const rows: HTMLElement[] = [];
      for (const e of evs) {
        if (e.id === rec.id) continue;
        const u = P.eventUnlocked(s, e);
        const r = s.events[e.id];
        const medal = s.medals?.[e.id] ?? 0;
        const status = !u.ok && !u.switchCar ? `🔒 ${u.why}`
          : e.knockout ? (s.knockout ? `Through to heat ${s.knockout.heat + 1} of ${e.knockout.heats.length}` : r?.wins ? `✓ Champion ×${r.wins}` : 'Three heats · knockout')
          : e.speedTrap ? `${medal ? `${medalName[medal]} · ` : ''}${medal < 3 ? `${medalName[medal + 1]} at ${[e.speedTrap.bronze, e.speedTrap.silver, e.speedTrap.gold][medal]} km/h` : 'all medals'}${r?.bestSpeed ? ` · best ${r.bestSpeed} km/h` : ''}`
          : e.timeAttack ? (medal ? `${medalName[medal]}${medal < 3 ? ` · ${medalName[medal + 1]} at ${[e.timeAttack.bronze, e.timeAttack.silver, e.timeAttack.gold][medal].toFixed(2)} s` : ' · all medals'}` : `Bronze at ${e.timeAttack.bronze.toFixed(2)} s`) + (r?.bestTime ? ` · record ${r.bestTime.toFixed(2)} s` : '')
          : e.boss && s.bosses.includes(e.boss.rival) ? `Rival beaten${r?.bestTime ? ` · record ${r.bestTime.toFixed(2)} s` : ''}`
          : r?.wins ? `✓ Won${r.bestTime ? ` · record ${r.bestTime.toFixed(2)} s` : ''}`
          : r ? `Best ${ordinal(r.bestPlace)} · first win +$${e.firstClear.cash}` : e.boss ? `Rival race · ${e.boss.reward.blueprint} paint` : `First win +$${e.firstClear.cash} · ${e.firstClear.crates} crates`;
        const action = u.ok
          ? h('div', { class: 'row-btns' }, quickBtn(e, true), h('button', { class: `btn sm${q ? ' off' : ''}`, onclick: () => this.startLive(e.id) }, 'Race'))
          : u.switchCar && s.owned.includes(u.switchCar)
            ? h('button', { class: 'btn sm', onclick: () => this.startLive(e.id) }, `Race · ${carById(u.switchCar).model.split(' ')[0]}`)
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
            h('div', { class: 'meta' }, course(e), ` ${status}`)),
          action,
          u.ok || u.switchCar ? details(e) : null));
      }
      if (!rows.length) continue;
      const shouldOpen = firstRender ? (open.length > 0 && evs.some((e) => !s.events[e.id]?.wins || (e.timeAttack && (s.medals?.[e.id] ?? 0) < 3))) : openSections.has(dist);
      out.push(h('details', { class: 'district-sec', 'data-district': dist, ...(shouldOpen ? { open: '' } : {}) },
        h('summary', { class: 'district' }, h('span', {}, DISTRICTS[dist as keyof typeof DISTRICTS].name), h('span', { class: 'dist-sum' }, summary)),
        ...rows));
    }
    const scroll = this.list.scrollTop;
    this.list.replaceChildren(...out);
    this.list.scrollTop = scroll;
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

/** What a live race pays before you commit: each place, the skill bonus, and any one-time reward. */
function purseStrip(s: GameState, e: RaceEvent): HTMLElement {
  const p = P.purse(s, e);
  if (e.timeAttack) return h('div', { class: 'purse' }, h('span', { class: 'p1' }, `$${p.live[0]} a run`), h('span', {}, 'medals pay once'));
  return h('div', { class: 'purse', 'aria-label': `Pays ${p.live.map((c, i) => `${ordinal(i + 1)} $${c}`).join(', ')}` },
    ...p.live.slice(0, e.rivals.length + 1).map((c, i) => h('span', { class: i === 0 ? 'p1' : '' }, h('small', {}, ordinal(i + 1)), `$${c}`)),
    h('span', { class: 'skill' }, h('small', {}, 'Perfect'), `+$${p.perfect}`),
    p.firstClear ? h('span', { class: 'once' }, h('small', {}, 'First win'), `+$${p.firstClear}`) : null);
}
