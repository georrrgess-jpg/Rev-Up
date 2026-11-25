import { EngineHum, resumeAudio, sfx, suspendAudio } from '../audio';
import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { RaceSetup, RaceSim } from '../core/race';
import type { LastResult } from '../core/state';
import { DISTRICTS, EVENTS, NITRO_CAP, RACE, RIVALS, RaceEvent, SIGNATURE_FINISHES, TRACKS, carById, eventById, finishStripe, trackLength } from '../data/tables';
import { carLengthM, drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { h, ordinal } from './dom';

const kmh = (ms: number) => Math.round(ms * 3.6);

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
    this.head.replaceChildren(h('strong', {}, cls.model), h('div', {}, `${kmh(lo.stats.top)} km/h · Nitro ${s.nitro}/${NITRO_CAP}`));
    const { w, h: hh } = fitCanvas(this.headCanvas);
    const ctx = this.headCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hh);
    const paint = s.paints[s.activeCar];
    const length = Math.min(w * .83, hh * 1.85);
    drawCar(ctx, s.activeCar, (w - length * 1.06) / 2, hh * .91, length,
      { paint: paint ?? cls.paint, trim: cls.trim, livery: finishStripe(s.activeCar, paint) });

    const rec = P.recommendedEvent(s);
    const q = s.pendingQuick;
    const expanded = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details[open]')).map((d) => d.dataset.event));
    const nitroNote = s.nitro ? `${s.nitro} nitro` : s.stats.races === 0 ? 'starter nitro' : 'no nitro';
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
      return h('button', { class: `btn${small ? ' sm' : ''}${q && !here ? ' off' : ''}`, onclick: () => this.startQuick(e.id) },
        here ? `Crew ${Math.max(0, Math.ceil((q!.endsAt - Date.now()) / 1000))} s` : small ? 'Quick' : h('span', { class: 'stack' }, 'Quick Race', h('small', {}, 'base pay · keep merging')));
    };
    const course = (e: RaceEvent) => h('span', { class: 'course' }, TRACKS[e.track].course);

    // Featured: one recommended event with a reason to run it now.
    const fr = s.events[rec.id];
    const featured = h('section', { class: 'featured', 'aria-label': 'Recommended event' },
      h('div', { class: 'feat-label' }, 'Recommended'),
      h('div', { class: 'top' }, h('span', { class: 'name' }, rec.name), rec.boss && !s.bosses.includes(rec.boss.rival) ? h('span', { class: 'tag boss' }, 'Rival') : null),
      h('div', { class: 'meta' }, course(rec), ` ${TRACKS[rec.track].favours}`),
      h('p', { class: 'reason' }, P.eventReason(s, rec)),
      h('div', { class: 'event-rewards' }, h('span', {}, `Win $${rec.payout.cash[0]}`), h('span', {}, `${rec.payout.rep[0]} Rep`),
        rec.payout.crates[0] ? h('span', {}, `${rec.payout.crates[0]} crate${rec.payout.crates[0] > 1 ? 's' : ''}`) : null,
        fr?.bestTime ? h('span', {}, `Record ${fr.bestTime.toFixed(2)} s`) : null),
      h('div', { class: 'btns' },
        h('button', { class: `btn primary${q ? ' off' : ''}`, onclick: () => this.startLive(rec.id) }, h('span', { class: 'stack' }, 'Race', h('small', {}, `live · ${nitroNote}`))),
        quickBtn(rec, false)),
      details(rec),
      q?.eventId === rec.id ? h('div', { class: 'quickbar' }, h('i', { style: `width:${Math.min(100, ((Date.now() - q!.startedAt) / (q!.endsAt - q!.startedAt)) * 100)}%` })) : null);

    const out: HTMLElement[] = [featured];
    if (q && q.eventId !== rec.id) out.push(h('p', { class: 'crew-note' }, `Your crew is racing ${eventById(q.eventId).name} · ${Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000))} s left`));
    // Catalogue: one collapsible section per district, with a progress summary; the recommended one opens.
    const openSections = new Set(Array.from(this.list.querySelectorAll<HTMLDetailsElement>('details.district-sec[open]')).map((d) => d.dataset.district));
    const firstRender = !this.list.querySelector('details.district-sec');
    const order: string[] = ['scrapyard', 'suburbs', 'coastal', 'meets', 'trials'];
    const medalName = ['', 'Bronze', 'Silver', 'Gold'];
    for (const dist of order) {
      const evs = EVENTS.filter((e) => e.district === dist);
      if (!evs.length) continue;
      const open = evs.filter((e) => P.eventUnlocked(s, e).ok || P.eventUnlocked(s, e).switchCar);
      let summary: string;
      if (dist === 'trials') {
        const medals = evs.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0);
        summary = `${medals}/${evs.length * 3} medals`;
      } else if (dist === 'meets') {
        summary = `${evs.filter((e) => s.events[e.id]?.wins).length}/${evs.length} trophies`;
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

interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number }

const sim0Launch = (sim: RaceSim) => sim.player.x < (sim.track.segments[0]?.length ?? 0) && sim.player.x > 0.5;

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

class RaceScreen {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: RaceSim;
  private posEl: HTMLElement;
  private timeEl: HTMLElement;
  private standEl: HTMLElement;
  private progEl: HTMLElement;
  private dots: HTMLElement[] = [];
  private callout: HTMLElement;
  private nitroBtn: HTMLButtonElement;
  private hintEl: HTMLElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private countdown: number;
  private paused = false;
  private pauseEl: HTMLElement | null = null;
  private finished = false;
  private particles: Particle[] = [];
  private hum: EngineHum;
  private lastHud = 0;
  private cueDone = new Set<number>();
  private calloutTimer = 0;
  private quality = 1; // 1 full, 0 reduced effects
  private frameTimes: number[] = [];
  private dpr = 1;
  private reduced: boolean;
  private zoom = 0;
  private ticker!: HTMLElement;
  private flash!: HTMLElement;
  private tickerTimer = 0;
  private lastOrder = '';
  private shake = 0;
  private kick = 0;
  private finishHold = 0; // real seconds shown after the player crosses the line
  private result: LastResult | null = null;
  private prevV: number[] = [];
  private slowWindows = 0;
  private goodWindows = 0;
  private gainShown: object | null = null;
  private eventName: string;

  constructor(private app: App, private setup: RaceSetup, private raceId: number, private onClose: () => void) {
    this.sim = new RaceSim(setup);
    const rev = carById(setup.player.car).rev;
    this.hum = new EngineHum(rev.base, rev.peak, setup.player.car);
    this.reduced = app.game.state.settings.reducedMotion;
    this.countdown = this.reduced ? 1.2 : 2.4;
    this.eventName = eventById(setup.eventId).name;
    this.canvas = h('canvas', { class: 'track', 'aria-hidden': 'true' });
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.posEl = h('div', { class: 'pos num' });
    this.timeEl = h('div', { class: 'time num' });
    this.standEl = h('div', { class: 'stand' });
    this.progEl = h('div', { class: 'prog', 'aria-hidden': 'true' });
    const L = trackLength(this.sim.track);
    for (const w of this.sim.windows) {
      const m = h('div', { class: 'w' });
      m.style.left = `${(w.start / L) * 100}%`;
      m.style.width = `${((w.end - w.start) / L) * 100}%`;
      this.progEl.append(m);
    }
    this.dots = this.sim.racers.map((r) => {
      const d = h('div', { class: `dot${r.isPlayer ? ' me' : ''}` });
      if (!r.isPlayer) d.style.background = r.paint;
      this.progEl.append(d);
      return d;
    });
    this.callout = h('div', { class: 'callout', role: 'status', 'aria-live': 'assertive' });
    this.ticker = h('div', { class: 'ticker', role: 'status' });
    this.flash = h('div', { class: 'race-flash', 'aria-hidden': 'true' });
    this.nitroBtn = h('button', { class: 'nitrobtn', 'aria-label': 'Nitro' });
    this.nitroBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tapNitro(); });
    this.nitroBtn.addEventListener('click', (e) => { if ((e as PointerEvent).pointerType === '' || e.detail === 0) this.tapNitro(); });
    this.hintEl = h('div', { class: 'racehint' });
    const pauseBtn = h('button', { class: 'iconbtn pausebtn', 'aria-label': 'Pause', onclick: () => this.setPaused(true) }, 'Ⅱ');
    this.el = h('div', { class: 'racescreen', role: 'dialog', 'aria-label': `Race: ${this.eventName}` },
      this.canvas,
      h('div', { class: 'hud' },
        h('div', { class: 'row1' }, h('div', {}, this.posEl, this.standEl), h('div', {}, this.timeEl, h('div', { style: 'margin-top:6px;text-align:right' }, pauseBtn))),
        this.progEl),
      this.callout,
      this.ticker,
      this.flash,
      h('div', { class: 'nitrobar' }, this.hintEl, this.nitroBtn),
    );
    this.onKey = this.onKey.bind(this);
    this.onVis = this.onVis.bind(this);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('blur', this.onVis);
    requestAnimationFrame(() => {
      this.resize();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    });
    this.hum.start();
    this.updateHud(true);
    this.showCallout('3', 'countdown');
    sfx.countdown(false);
  }

  private resize() {
    const fit = fitCanvas(this.canvas, this.quality ? 2 : 1);
    this.dpr = fit.dpr;
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'n' || e.key === 'N' || e.key === 'ArrowUp') { e.preventDefault(); if (!this.finished) this.tapNitro(); }
    if (e.key === 'Escape' || e.key === 'p') { if (!this.finished) this.setPaused(!this.paused); }
  }
  private onVis() {
    // Pause cleanly when the app loses focus so a hidden timer cannot eat a perfect window.
    if ((document.hidden || !document.hasFocus()) && !this.finished) this.setPaused(true);
  }

  private setPaused(p: boolean) {
    if (this.finished || p === this.paused) return;
    this.paused = p;
    if (p) {
      suspendAudio();
      this.pauseEl = h('div', { class: 'paused' }, h('div', { style: 'text-align:center' },
        h('div', { class: 'callout small', style: 'position:static;transform:none;margin-bottom:16px' }, 'Paused'),
        h('button', { class: 'btn primary', onclick: () => this.setPaused(false) }, 'Resume'), ' ',
        h('button', { class: 'btn', onclick: () => this.quit() }, 'Leave race')));
      this.el.append(this.pauseEl);
      (this.pauseEl.querySelector('.btn') as HTMLButtonElement).focus({ preventScroll: true });
    } else {
      resumeAudio();
      this.pauseEl?.remove();
      this.pauseEl = null;
      this.last = performance.now();
    }
  }

  private quit() {
    // Leaving forfeits this run: no payout and no nitro spent.
    this.app.game.abandonRace();
    this.close();
  }

  private close() {
    cancelAnimationFrame(this.raf);
    this.hum.stop();
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('blur', this.onVis);
    resumeAudio();
    this.onClose();
  }

  private tapNitro() {
    if (this.countdown > 0 || this.paused || this.finished) return;
    const inLaunch = this.sim.track.segments[0] && this.sim.player.x < this.sim.track.segments[0].length;
    const r = this.sim.tapNitro();
    if (r === 'perfect') {
      sfx.nitro(true); this.showCallout('PERFECT NITRO', 'perfect'); this.burst(46, '#ffd75e');
      if (!this.reduced) { this.kick = 1.6; this.flash.className = 'race-flash on'; setTimeout(() => (this.flash.className = 'race-flash'), 260); }
      this.nitroBtn.classList.add('perfect-run');
    } else if (r === 'boost') {
      sfx.nitro(false); this.burst(20, '#8fd3ff');
      this.showCallout(inLaunch ? 'Wheelspin — boosts work best on straights' : 'Nitro', inLaunch ? 'small' : 'boost', inLaunch ? 1400 : 900);
      if (!this.reduced) this.kick = 0.8;
    }
    else if (r === 'empty') this.showCallout('No nitro left', 'small');
    this.updateHud(true);
  }

  private showCallout(text: string, cls: string, ms = 900) {
    this.callout.textContent = text;
    this.callout.className = `callout ${cls}`;
    clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => { this.callout.textContent = ''; }, ms);
  }

  private frame(t: number) {
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1; // long frames never jump the simulation
    // adaptive effects: drop resolution/particles before touching sim timing
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 60) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes = [];
      if (avg > 0.024) { this.slowWindows++; this.goodWindows = 0; } else if (avg < 0.019) { this.goodWindows++; this.slowWindows = 0; }
      if (this.slowWindows >= 2 && this.quality === 1) { this.quality = 0; this.resize(); }
      if (this.goodWindows >= 3 && this.quality === 0) { this.quality = 1; this.resize(); }
    }
    if (!this.paused) {
      if (this.countdown > 0) {
        const before = Math.ceil(this.countdown / (this.reduced ? 0.4 : 0.8));
        this.countdown -= dt;
        const after = Math.ceil(this.countdown / (this.reduced ? 0.4 : 0.8));
        if (this.countdown <= 0) { this.showCallout('GO!', 'perfect', 600); sfx.countdown(true); if (!this.reduced) this.shake = 0.35; this.burst(24, '#c9c2b8'); }
        else if (after !== before) { this.showCallout(String(after), 'countdown'); sfx.countdown(false); }
      } else if (!this.finished) {
        this.acc += dt;
        while (this.acc >= RACE.dt && !this.finished) {
          this.sim.step(RACE.dt);
          this.acc -= RACE.dt;
          if (this.sim.player.finishTime !== null || this.sim.done) this.onPlayerFinish();
        }
        this.telegraph();
        this.boostFeedback();
      } else if (this.finishHold > 0) {
        // rivals keep driving across the line while the result settles
        this.acc += dt;
        while (this.acc >= RACE.dt) { this.sim.step(RACE.dt); this.acc -= RACE.dt; }
        this.finishHold -= dt;
        if (this.finishHold <= 0) this.showResult(this.result);
      }
      this.shake = Math.max(0, this.shake - dt);
      this.kick = Math.max(0, this.kick - dt);
      if (!this.finished && this.countdown <= 0 && sim0Launch(this.sim) && !this.reduced && Math.random() < 0.5) this.burst(2, '#bdb6ab');
      this.stepParticles(dt);
    }
    this.draw();
    if (t - this.lastHud > 100) { this.lastHud = t; this.updateHud(); }
  }

  /** After each boost, show what it actually gained against the no-nitro ghost. */
  private boostFeedback() {
    const g = this.sim.lastBoostGain;
    if (!g || g === this.gainShown) return;
    this.gainShown = g;
    this.nitroBtn.classList.remove('perfect-run');
    if (g.seconds >= 0.01) this.tick(`${g.perfect ? 'Perfect boost' : 'Boost'}: +${g.seconds.toFixed(2)} s on the field`, g.perfect ? 'gold' : 'blue');
  }

  private tick(text: string, cls = '') {
    this.ticker.textContent = text;
    this.ticker.className = `ticker on ${cls}`;
    clearTimeout(this.tickerTimer);
    this.tickerTimer = window.setTimeout(() => { this.ticker.className = 'ticker'; }, 1500);
  }

  private telegraph() {
    const { active, next } = this.sim.windowState();
    const p = this.sim.player;
    const canUse = this.sim.charges > 0 && p.nitroLeft <= 0;
    const inWindow = !!active && canUse && !this.sim.usedWindows.has(active.segIndex);
    this.nitroBtn.classList.toggle('window', inWindow);
    const eta = !active && next && canUse && p.v > 1 ? (next.start - p.x) / p.v : Infinity;
    const approaching = eta < 2.2;
    this.nitroBtn.classList.toggle('approach', approaching);
    if (approaching) {
      this.nitroBtn.style.setProperty('--eta', String(Math.max(0, Math.min(1, 1 - eta / 2.2))));
      this.nitroBtn.dataset.label = `WINDOW IN ${eta.toFixed(1)} s`;
    } else if (inWindow) this.nitroBtn.dataset.label = '▲ PERFECT WINDOW';
    // overtakes, called out once they settle (after the launch)
    if (this.sim.t > 2) {
      const order = this.sim.standings().map((r) => r.id).join('|');
      if (this.lastOrder && order !== this.lastOrder) {
        const before = this.lastOrder.split('|');
        const now = order.split('|');
        const me = now.indexOf('player'), was = before.indexOf('player');
        if (me < was) this.tick(`Passed ${this.sim.racers.find((r) => r.id === before[me])?.name ?? 'a rival'} · ${ordinal(me + 1)}`, 'gold');
        else if (me > was) this.tick(`${this.sim.racers.find((r) => r.id === now[me - 1])?.name ?? 'A rival'} passed you · ${ordinal(me + 1)}`);
      }
      this.lastOrder = order;
    }
    if (active && canUse && !this.sim.usedWindows.has(active.segIndex) && !this.cueDone.has(active.segIndex)) {
      this.cueDone.add(active.segIndex);
      if (this.app.game.state.settings.nitroCue) sfx.windowCue();
      this.showCallout('TAP NITRO NOW', 'window', 700);
    } else if (!active && next && canUse && eta < 2.0 && eta > 1.9) {
      this.showCallout('Nitro window ahead', 'window', 900);
    }
    this.hum.set(Math.min(1, p.v / (p.stats.top * 1.1)), p.nitroLeft > 0);
  }

  private onPlayerFinish() {
    if (this.finished) return;
    this.finished = true;
    this.nitroBtn.classList.remove('window');
    // Finish an off-screen copy for the real result, and commit now so closing the page cannot lose or
    // double the payout. The visible race keeps running so the crossing and the rivals' arrival are seen.
    const outcome = this.sim.clone().finish();
    this.result = this.app.game.commitRace(this.raceId, outcome) ?? this.app.game.state.lastResult;
    if (outcome.place === 1) sfx.win(); else sfx.lose();
    const gap = outcome.gapText.replace(/ of .*$/, '').replace(' behind first', ' behind');
    this.showCallout(outcome.place === 1 ? `WIN! ${gap}` : `${ordinal(outcome.place)} · ${gap}`, outcome.place === 1 ? 'perfect' : 'small', 1600);
    this.finishHold = this.reduced ? 0.3 : 1.6;
    this.updateHud(true);
  }

  private showResult(r: LastResult | null) {
    this.hum.stop();
    const game = this.app.game;
    const s = game.state;
    if (!r) { this.close(); return; }
    const ev = eventById(r.eventId);
    const pills: HTMLElement[] = [
      h('span', { class: 'chip cash' }, `+$${r.cash}`),
      h('span', { class: 'chip rep' }, `+${r.rep} Rep`),
    ];
    if (r.crates) pills.push(h('span', { class: 'chip' }, `📦 ${r.crates} crate${r.crates > 1 ? 's' : ''}`));
    if (r.perfects) pills.push(h('span', { class: 'chip nitro' }, `Perfect ×${r.perfects}${r.precision ? ` (+$${r.precision})` : ''}`));
    if (r.firstClear) pills.push(h('span', { class: 'chip', style: 'color:var(--gold)' }, 'First win bonus'));
    const g = P.goalStatus(s);
    const finish = r.signatureFinish ? SIGNATURE_FINISHES[r.signatureFinish] : undefined;
    if (r.personalBest) pills.push(h('span', { class: 'chip best' }, 'Personal best'));
    if (r.freshRep) pills.push(h('span', { class: 'chip rep' }, `Fresh route +${r.freshRep} Rep`));
    const nextLabel = s.pendingReveal ? 'Car unlocked' : 'Next step';
    const nextText = s.pendingReveal ? `The ${carById(s.pendingReveal).model} is ready to reveal.` : r.advice;
    const card = h('div', { class: 'card', role: 'dialog', 'aria-label': 'Race result' },
      h('div', { class: `place${r.place === 1 ? ' p1' : ''}` }, r.place === 1 ? 'You won!' : `${ordinal(r.place)} place`),
      h('div', { class: 'gap' }, h('span', { class: 'gap-main' }, r.gapText), h('span', { class: 'gap-sub' }, `${ev.name}${r.time ? ` · ${r.time.toFixed(2)} s` : ''}`)),
      r.boss ? h('div', { class: 'boss' }, h('b', {}, 'Rusty Ray is beaten.'), ` The Suburbs are open. Ray hands over his signature blueprint: ${ev.boss!.reward.blueprint} paint (apply it in the Showroom) and the “${ev.boss!.reward.badge}” badge.`) : null,
      h('div', { class: 'pays' }, ...pills),
      s.stats.races <= 1 ? h('p', { class: 'explain' }, 'Cash buys upgrades and crates · Rep unlocks new cars · Crates drop parts onto your bench.') : null,
      finish ? h('div', { class: 'finish-earned' }, h('span', { class: 'swatch', style: `--paint:${finish.paint}` }), h('div', {}, h('strong', {}, finish.name), h('div', {}, 'Signature finish unlocked in the Showroom'))) : null,
      ev.id === 'foundry-final' && r.firstClear ? h('div', { class: 'finish-earned' }, 'Campaign finale won') : null,
      h('div', { class: 'standing' }, ...r.standings.map((st, i) => h('div', { class: st.isPlayer ? 'me' : '' }, `${i + 1}. ${st.name}${st.time ? ` — ${st.time.toFixed(2)} s` : ''}`))),
      h('button', { class: 'next', onclick: () => { this.close(); if (!s.pendingReveal) this.app.go('garage'); } }, h('small', {}, nextLabel), nextText,
        g && !s.pendingReveal ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(g.progress * 100)}%` })) : null),
      r.firstClear ? h('p', { class: 'pay', style: 'margin:-4px 0 10px' }, 'Quick Race is now available for this event.') : null,
      h('div', { class: 'btns' },
        s.pendingReveal
          ? h('button', { class: 'btn primary', onclick: () => this.close() }, 'Reveal car')
          : h('button', { class: 'btn primary', onclick: () => { this.close(); this.app.go('garage'); } }, 'Back to Garage'),
        !s.pendingReveal ? h('button', { class: 'btn', onclick: () => this.retry(r.eventId) }, 'Race again') : null),
    );
    const wrap = h('div', { class: 'result' }, card);
    this.el.append(wrap);
    (card.querySelector('.btn.primary') as HTMLButtonElement).focus({ preventScroll: true });
  }

  private retry(eventId: string) {
    const app = this.app;
    this.close();
    if (app.game.state.pendingReveal) return; // reveal takes priority
    (app.views.race as RaceView).startLive(eventId);
  }

  private updateHud(force = false) {
    if (!force && this.paused) return;
    const sim = this.sim;
    const st = sim.standings();
    const me = st.findIndex((r) => r.isPlayer) + 1;
    this.posEl.innerHTML = this.countdown > 0 ? '–' : `${me}<small>/${sim.racers.length}</small>`;
    this.timeEl.textContent = `${Math.max(0, sim.player.finishTime ?? sim.t).toFixed(sim.player.finishTime !== null ? 2 : 1)} s`;
    this.standEl.innerHTML = st.map((r, i) => `<div class="${r.isPlayer ? 'me' : ''}">${i + 1}. ${r.isPlayer ? 'You' : r.name}</div>`).join('');
    const L = sim.length;
    sim.racers.forEach((r, i) => { this.dots[i].style.left = `${Math.min(100, (r.x / L) * 100)}%`; });
    const c = sim.charges;
    const active = sim.windowState().active;
    const ready = !this.finished && c > 0 && sim.player.nitroLeft <= 0 && active && !sim.usedWindows.has(active.segIndex);
    const nitroLabel = ready ? 'Tap now' : sim.player.nitroLeft > 0 ? 'Boosting' : 'Nitro';
    const labelKey = `${c}:${nitroLabel}`;
    if (this.nitroBtn.dataset.label !== labelKey) {
      this.nitroBtn.dataset.label = labelKey;
      this.nitroBtn.replaceChildren(h('span', { class: 'n num' }, c), nitroLabel);
    }
    this.nitroBtn.classList.toggle('empty', c === 0);
    this.nitroBtn.setAttribute('aria-label', `Nitro, ${c} left`);
    this.hintEl.textContent = this.finished ? '' : c === 0 ? (this.setup.nitroCharges === 0 ? 'No nitro banked — merge combos of 3 to bank some.' : 'All nitro used.') : 'Tap nitro in the amber windows for a Perfect boost.';
  }

  // ---------------- Drawing ----------------
  private burst(n: number, c: string) {
    if (this.reduced) return;
    const max = this.quality ? 60 : 20;
    for (let k = 0; k < n && this.particles.length < max; k++) {
      this.particles.push({ x: 0, y: 0, vx: -(40 + Math.random() * 80), vy: (Math.random() - 0.5) * 40, life: 0.5 + Math.random() * 0.4, c, s: 2 + Math.random() * 3 });
    }
  }
  private stepParticles(dt: number) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sim = this.sim;
    const theme = sim.track.theme;
    const player = sim.player;
    // Camera frames the pack: zoom out when rivals spread, keep the player between 22% and 70% of the width.
    // Camera: frame the player with the nearest rival (or the whole pack if it fits); before a nitro window,
    // shift to show more road ahead; a short shake at the launch and a kick when a boost fires.
    const ppm0 = Math.min(W * 0.34, H * 0.24) / 4.3;
    const rivals = sim.racers.filter((r) => !r.isPlayer);
    const nearest = rivals.reduce((b, r) => (Math.abs(r.x - player.x) < Math.abs(b.x - player.x) ? r : b), rivals[0] ?? player);
    const xs = sim.racers.map((r) => r.x);
    const packSpan = Math.max(...xs) - Math.min(...xs);
    const span = packSpan * ppm0 * 0.45 < W * 0.8 ? packSpan : Math.abs(nearest.x - player.x);
    const target = Math.max(ppm0 * 0.45, Math.min(ppm0, (W * 0.78) / (span + 9)));
    this.zoom = this.zoom ? this.zoom + (target - this.zoom) * 0.06 : target;
    const ppm = this.zoom * (1 - 0.05 * Math.min(1, this.kick));
    const focus = packSpan * ppm < W * 0.8 ? xs : [player.x, nearest.x];
    const mid = (Math.max(...focus) + Math.min(...focus)) / 2;
    const ahead = sim.windowState().next;
    const lookAhead = ahead && player.v > 1 && (ahead.start - player.x) / player.v < 2.5 ? 0.12 : 0;
    let camX = mid - (W * (0.48 - lookAhead)) / ppm;
    camX = Math.min(camX, player.x - (W * 0.18) / ppm);
    camX = Math.max(camX, player.x - (W * (0.62 - lookAhead)) / ppm);
    if (this.finished) camX = Math.min(camX, sim.length - (W * 0.55) / ppm); // hold on the finish line
    const shakeY = this.shake > 0 ? Math.sin(sim.t * 90) * 3 * this.dpr * (this.shake / 0.35) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, shakeY);
    // Lanes sit just above the nitro button area and grow with tall screens.
    const buttonArea = 168 * this.dpr;
    const roadBot = Math.min(H * 0.84, H - buttonArea);
    const roadTop = roadBot - Math.min(H * 0.36, W * 0.8);
    const horizon = roadTop - H * 0.09;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    if (sim.track.id === 'foundry') { sky.addColorStop(0, '#10182c'); sky.addColorStop(.65, '#47324b'); sky.addColorStop(1, '#b3614c'); }
    else if (theme === 'scrap') { sky.addColorStop(0, '#2b1d2e'); sky.addColorStop(0.6, '#7a3f2a'); sky.addColorStop(1, '#d9813f'); }
    else if (theme === 'coast') { sky.addColorStop(0, '#0f2a44'); sky.addColorStop(0.6, '#3f7fa3'); sky.addColorStop(1, '#f0c189'); }
    else { sky.addColorStop(0, '#16233d'); sky.addColorStop(0.6, '#3d5a7a'); sky.addColorStop(1, '#e0a165'); }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 2);
    // sun
    ctx.fillStyle = theme === 'scrap' ? 'rgba(255,200,120,0.55)' : 'rgba(255,220,160,0.5)';
    ctx.beginPath(); ctx.arc(W * 0.78, horizon * 0.82, H * 0.06, 0, 7); ctx.fill();
    // restrained background motion: slow clouds drifting against the camera
    if (!this.reduced) {
      ctx.fillStyle = sim.track.theme === 'suburb' ? 'rgba(230,236,245,0.05)' : 'rgba(255,214,170,0.045)';
      for (let k = 0; k < 4; k++) {
        const span = W * 1.6;
        const cx = ((k * span) / 4 - camX * ppm * 0.03 - sim.t * 6 * this.dpr) % span;
        const x = cx < -W * 0.3 ? cx + span : cx;
        const y = horizon * (0.25 + 0.12 * (k % 3));
        ctx.beginPath(); ctx.ellipse(x, y, W * 0.16, H * 0.018, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + W * 0.06, y - H * 0.012, W * 0.09, H * 0.016, 0, 0, 7); ctx.fill();
      }
    }
    // route lighting: the Foundry glows and breathes along the horizon
    if (sim.track.id === 'foundry') {
      const pulse = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(sim.t * 1.7);
      const glow = ctx.createRadialGradient(W * 0.3, horizon, 0, W * 0.3, horizon, W * 0.55);
      glow.addColorStop(0, `rgba(255,120,40,${0.28 + 0.12 * pulse})`);
      glow.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, horizon + 4);
    }

    // far layer
    const far = (par: number, color: string, base: number, hmax: number, spacing: number, kind: 'pile' | 'house' | 'crane' | 'tree') => {
      ctx.fillStyle = color;
      const off = camX * ppm * par;
      const sp = spacing * this.dpr;
      const start = Math.floor(off / sp) - 1;
      for (let k = start; k < start + W / sp + 3; k++) {
        const x = k * sp - off;
        const r = hash(k + base);
        const hh = hmax * (0.4 + r * 0.6) * this.dpr;
        const y = base;
        if (kind === 'pile') {
          ctx.beginPath(); ctx.moveTo(x - sp * 0.6, y); ctx.quadraticCurveTo(x, y - hh * 1.6, x + sp * 0.7, y); ctx.fill();
        } else if (kind === 'house') {
          const bw = sp * 0.7;
          ctx.fillRect(x, y - hh, bw, hh);
          ctx.beginPath(); ctx.moveTo(x - 4, y - hh); ctx.lineTo(x + bw / 2, y - hh - bw * 0.4); ctx.lineTo(x + bw + 4, y - hh); ctx.fill();
          if (r > 0.4) { ctx.fillStyle = 'rgba(255,200,110,0.55)'; ctx.fillRect(x + bw * 0.2, y - hh * 0.6, bw * 0.18, bw * 0.14); ctx.fillStyle = color; }
        } else if (kind === 'crane') {
          if (r > 0.55) { ctx.fillRect(x, y - hh * 2, 4 * this.dpr, hh * 2); ctx.fillRect(x - hh * 0.6, y - hh * 2, hh * 1.4, 3 * this.dpr); }
          else { ctx.fillRect(x, y - hh * 0.5, sp * 0.5, hh * 0.5); }
        } else {
          ctx.beginPath(); ctx.arc(x, y - hh, hh * 0.45, 0, 7); ctx.fill(); ctx.fillRect(x - 2 * this.dpr, y - hh, 4 * this.dpr, hh);
        }
      }
    };
    if (theme === 'scrap') {
      far(0.08, '#4a2c2a', horizon, 40, 160, 'pile');
      far(0.18, '#2e1d1a', horizon + 6, 46, 120, 'crane');
      far(0.35, '#201513', roadTop - 2, 34, 90, 'pile');
    } else if (theme === 'coast') {
      ctx.fillStyle = '#1f5f7d'; ctx.fillRect(0, horizon - 10 * this.dpr, W, roadTop - horizon + 10 * this.dpr); // the sea
      ctx.fillStyle = 'rgba(255,236,200,0.25)';
      for (let k = 0; k < 6; k++) ctx.fillRect(((k * 211 - camX * ppm * 0.05) % W + W) % W, horizon - 4 * this.dpr + k * 3 * this.dpr, 50 * this.dpr, 1.5 * this.dpr);
      far(0.1, '#2c3b33', horizon - 10 * this.dpr, 46, 220, 'pile');
      far(0.38, '#1b2a22', roadTop - 2, 46, 110, 'tree');
    } else {
      far(0.08, '#2e3a4f', horizon, 34, 150, 'tree');
      far(0.2, '#2a2730', horizon + 8, 40, 130, 'house');
      far(0.38, '#1d2b22', roadTop - 2, 40, 70, 'tree');
    }
    // ground strip
    if (theme !== 'coast') {
      ctx.fillStyle = theme === 'scrap' ? '#3a2a1f' : '#263526';
      ctx.fillRect(0, horizon, W, roadTop - horizon);
    }

    // road
    const segInfo = (x: number) => {
      let s0 = 0;
      for (const sg of sim.track.segments) { if (x < s0 + sg.length) return { sg, s0 }; s0 += sg.length; }
      return { sg: sim.track.segments[sim.track.segments.length - 1], s0 };
    };
    // draw road in strips by segment type
    const stripM = 2;
    for (let wx = Math.floor(camX / stripM) * stripM; (wx - camX) * ppm < W; wx += stripM) {
      const { sg } = segInfo(Math.max(0, wx));
      const sx = (wx - camX) * ppm;
      const hw = sg.type === 'highway' || sg.type === 'hwbend';
      ctx.fillStyle = hw ? '#3a3d42' : theme === 'scrap' ? '#4b4038' : '#3d3c3a';
      ctx.fillRect(sx, roadTop, stripM * ppm + 1, roadBot - roadTop);
      if (sg.radius) {
        // bend curbs
        const alt = Math.floor(wx / 3) % 2 === 0;
        ctx.fillStyle = alt ? '#c4362c' : '#eee';
        ctx.fillRect(sx, roadTop - 5 * this.dpr, stripM * ppm + 1, 5 * this.dpr);
        ctx.fillRect(sx, roadBot, stripM * ppm + 1, 5 * this.dpr);
      } else if (hw) {
        ctx.fillStyle = '#8b8f96';
        ctx.fillRect(sx, roadTop - 4 * this.dpr, stripM * ppm + 1, 3 * this.dpr);
      }
    }
    // nitro windows (telegraphed on the road ahead)
    for (const w of sim.windows) {
      const x0 = (w.start - camX) * ppm;
      const x1 = (w.end - camX) * ppm;
      if (x1 < 0 || x0 > W) continue;
      const used = sim.usedWindows.has(w.segIndex);
      ctx.fillStyle = used ? 'rgba(242,163,58,0.08)' : 'rgba(242,163,58,0.28)';
      ctx.fillRect(x0, roadTop, x1 - x0, roadBot - roadTop);
      if (!used) {
        ctx.fillStyle = 'rgba(255,196,87,0.75)';
        ctx.font = `800 ${Math.round(16 * this.dpr)}px Barlow, system-ui`;
        for (let cx = x0 + 10; cx < x1 - 10; cx += 46 * this.dpr) ctx.fillText('›››', cx, (roadTop + roadBot) / 2 + 6 * this.dpr);
      }
    }
    // lane lines
    const lanes = 4;
    const laneH = (roadBot - roadTop) / lanes;
    ctx.fillStyle = 'rgba(255,240,200,0.55)';
    const dash = 4 * ppm;
    for (let l = 1; l < lanes; l++) {
      const y = roadTop + l * laneH;
      const off = (camX * ppm) % (dash * 2);
      for (let x = -off; x < W; x += dash * 2) ctx.fillRect(x, y - 1.5 * this.dpr, dash, 3 * this.dpr);
    }
    // start & finish
    const drawLine = (m: number, checker: boolean) => {
      const x = (m - camX) * ppm;
      if (x < -40 || x > W + 40) return;
      const sq = 8 * this.dpr;
      for (let y = roadTop, k = 0; y < roadBot; y += sq, k++) {
        ctx.fillStyle = checker ? (k % 2 ? '#111' : '#eee') : '#eee';
        ctx.fillRect(x, y, sq, sq);
        if (checker) { ctx.fillStyle = k % 2 ? '#eee' : '#111'; ctx.fillRect(x + sq, y, sq, sq); }
      }
    };
    drawLine(0, false);
    drawLine(sim.length, true);
    // signs for bends
    for (let s0 = 0, i = 0; i < sim.track.segments.length; s0 += sim.track.segments[i].length, i++) {
      const sg = sim.track.segments[i];
      if (!sg.radius) continue;
      const x = (s0 - 25 - camX) * ppm;
      if (x < -60 || x > W + 60) continue;
      ctx.fillStyle = '#555';
      ctx.fillRect(x, roadTop - 46 * this.dpr, 3 * this.dpr, 42 * this.dpr);
      ctx.fillStyle = '#f2a33a';
      ctx.fillRect(x - 22 * this.dpr, roadTop - 64 * this.dpr, 48 * this.dpr, 20 * this.dpr);
      ctx.fillStyle = '#1d1208';
      ctx.font = `800 ${Math.round(13 * this.dpr)}px Barlow, system-ui`;
      ctx.fillText('BEND ›', x - 18 * this.dpr, roadTop - 49 * this.dpr);
    }

    // cars by lane (back lanes first)
    const order = [1, 3, 0, 2]; // lane per racer index
    const draws = sim.racers.map((r, i) => ({ r, lane: order[i] })).sort((a, b) => a.lane - b.lane);
    for (const { r, lane } of draws) {
      const depth = 0.86 + lane * 0.06;
      const len = carLengthM(r.car) * ppm * depth;
      const gy = roadTop + (lane + 0.85) * laneH;
      const sx = (r.x - camX) * ppm - len;
      const cls = carById(r.car);
      if (sx > W + 10 || sx + len < -10) {
        // off-screen marker
        const ahead = sx > W;
        const gap = Math.round(Math.abs(r.x - player.x));
        ctx.font = `800 ${Math.round(13 * this.dpr)}px Barlow, system-ui`;
        const label = `${ahead ? '' : '‹ '}${r.name.split(' ')[0]} ${ahead ? '+' : '-'}${gap} m${ahead ? ' ›' : ''}`;
        const tw = ctx.measureText(label).width;
        const tx = ahead ? W - tw - 12 * this.dpr : 18 * this.dpr;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(tx - 12 * this.dpr, gy - 18 * this.dpr, tw + 18 * this.dpr, 20 * this.dpr);
        ctx.fillStyle = r.paint;
        ctx.beginPath(); ctx.arc(tx - 5 * this.dpr, gy - 8 * this.dpr, 4 * this.dpr, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * this.dpr; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, tx + 2 * this.dpr, gy - 4 * this.dpr);
        continue;
      }
      const livery = r.isPlayer ? this.app.game.state.paints[r.car] : null;
      const idx = sim.racers.indexOf(r);
      const braking = this.prevV[idx] !== undefined && r.v < this.prevV[idx] - 0.03 && r.finishTime === null;
      this.prevV[idx] = r.v;
      drawCar(ctx, r.car, sx, gy, len, {
        paint: r.isPlayer ? (livery ?? cls.paint) : r.paint, trim: cls.trim, wheelAngle: r.x / 0.31,
        blur: this.reduced ? 0 : Math.max(0, Math.min(1, (r.v - 7) / 10)), brake: braking,
        livery: finishStripe(r.car, livery ?? undefined), detail: false, cache: true,
        nitro: r.nitroLeft > 0 ? r.nitroMul : 0, headlights: theme === 'scrap' ? 0.25 : 0.55,
      });
      if (r.isPlayer) {
        ctx.fillStyle = '#ffc457';
        ctx.beginPath();
        const ax = sx + len * 0.5;
        const ay = gy - (len / carLengthM(r.car)) * 1.62; // just above this car's roof
        ctx.moveTo(ax - 7 * this.dpr, ay - 10 * this.dpr); ctx.lineTo(ax + 7 * this.dpr, ay - 10 * this.dpr); ctx.lineTo(ax, ay); ctx.fill();
        // particles anchor at the exhaust
        for (const p of this.particles) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.c;
          ctx.fillRect(sx + p.x * this.dpr, gy - len * 0.09 + p.y * this.dpr, p.s * this.dpr, p.s * this.dpr);
        }
        ctx.globalAlpha = 1;
      }
    }
    // speed lines
    if (!this.reduced && this.quality && player.v > 18) {
      const perfectBoost = player.nitroLeft > 0 && player.nitroMul > 1;
      ctx.strokeStyle = perfectBoost ? 'rgba(255,214,94,0.35)' : `rgba(255,255,255,${Math.min(0.22, (player.v - 18) / 80 + (player.nitroLeft > 0 ? 0.1 : 0))})`;
      ctx.lineWidth = (perfectBoost ? 3 : 2) * this.dpr;
      const n = perfectBoost ? 16 : 10;
      const cell = W / 3;
      for (let k = 0; k < n; k++) {
        const world = camX * ppm * 1.6 + k * cell * 0.37;
        const slot = Math.floor(world / cell);
        const y = horizon * 0.3 + hash(slot * 13.1 + k) * (roadBot - horizon * 0.3);
        const x = ((k * cell * 0.37 - camX * ppm * 1.6) % (W + cell) + W + cell) % (W + cell) - cell * 0.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (perfectBoost ? 90 : 60) * this.dpr, y); ctx.stroke();
      }
    }
    // foreground
    ctx.fillStyle = theme === 'scrap' ? '#1a120d' : '#142016';
    ctx.fillRect(0, roadBot, W, H - roadBot + 8 * this.dpr); // no unpainted strip under the road
    ctx.fillStyle = theme === 'scrap' ? '#2a1d14' : '#1d2d1f';
    const fsp = 140 * this.dpr;
    const foff = (camX * ppm * 1.25) % fsp;
    for (let x = -foff; x < W; x += fsp) ctx.fillRect(x, roadBot + 8 * this.dpr, 6 * this.dpr, 40 * this.dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
