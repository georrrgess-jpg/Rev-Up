import { setMuted, sfx, unlockAudio } from '../audio';
import type { GameEvent } from '../core/events';
import type { Game } from '../core/game';
import { MAX_TIER, nitroCapFor } from '../data/tables';
import { fmt, h } from './dom';
import { GarageView } from './garage';
import { RaceView } from './race';
import { RevealOverlay } from './reveal';
import { openGuide } from './guide';
import { openSettings } from './settings';
import { ShowroomView } from './showroom';
import { maybeOfflineClaim } from './offline';

export type Route = 'garage' | 'race' | 'showroom';

export interface View {
  el: HTMLElement;
  onEvents(ev: GameEvent[]): void;
  show(): void;
  hide?(): void;
}

/** App shell: top bar, three destinations, sheets, toasts, and the reveal overlay. */
export class App {
  root: HTMLElement;
  route: Route = 'garage';
  views: Record<Route, View>;
  private chips: Record<string, HTMLElement> = {};
  private navBtns: Record<Route, HTMLButtonElement>;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  busy = false; // true during a live race or reveal: no update prompts, no route changes
  updateReady: (() => void) | null = null;
  offlineReady = false;
  reveal: RevealOverlay | null = null;

  constructor(public game: Game, mount: HTMLElement) {
    this.root = mount;
    const s = game.state;
    setMuted(s.settings.muted);
    document.documentElement.classList.toggle('reduced', s.settings.reducedMotion);

    const chip = (key: string, cls: string, glyph: string, word: string, label: string) => {
      const el = h('span', { class: `chip ${cls}`, title: label, 'aria-label': label },
        h('span', { class: 'ico g', 'aria-hidden': 'true' }, glyph), h('span', { class: 'ico w', 'aria-hidden': 'true' }, word), h('span', { class: 'num v' }, '0'));
      this.chips[key] = el;
      return el;
    };
    const top = h('header', { class: 'topbar' },
      chip('cash', 'cash', '$', '$', 'Cash'),
      chip('rep', 'rep', '★', 'Rep', 'Reputation'),
      chip('scrap', 'scrap', '♻', 'Scrap', 'Scrap'),
      chip('nitro', 'nitro', '⚡', 'Nitro', 'Banked nitro charges'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'iconbtn', 'aria-label': 'How to play', title: 'How to play', onclick: () => openGuide(this) }, '?'),
      h('button', { class: 'iconbtn', 'aria-label': 'Settings', onclick: () => openSettings(this) }, '⚙'),
    );

    const views = h('main', { class: 'views' });
    this.views = {
      garage: new GarageView(this),
      race: new RaceView(this),
      showroom: new ShowroomView(this),
    };
    for (const v of Object.values(this.views)) views.append(v.el);

    const navBtn = (r: Route, icon: string, label: string) =>
      h('button', { 'aria-label': label, onclick: () => this.go(r) }, h('span', { class: 'ni', 'aria-hidden': 'true' }, icon), label);
    this.navBtns = { garage: navBtn('garage', '▦', 'Garage'), race: navBtn('race', '⚑', 'Race'), showroom: navBtn('showroom', '◇', 'Showroom') };
    const nav = h('nav', { class: 'nav' }, this.navBtns.garage, this.navBtns.race, this.navBtns.showroom);

    this.root.append(top, views, nav);
    this.refreshTop();

    game.subscribe((ev) => this.onEvents(ev));
    window.addEventListener('hashchange', () => this.fromHash());
    window.addEventListener('resize', () => this.fitTop());
    document.fonts?.ready.then(() => this.fitTop());
    // First gesture unlocks audio (lazy) and counts as input.
    const first = () => { unlockAudio(); };
    window.addEventListener('pointerdown', first, { capture: true });
    window.addEventListener('keydown', first, { capture: true });
    window.addEventListener('pointerdown', () => game.input(), { capture: true, passive: true });
    window.addEventListener('keydown', () => game.input(), { capture: true });

    this.fromHash(true);
    if (game.load.problem) this.toast(game.load.problem, undefined, 6000);
    if (s.pendingReveal) setTimeout(() => this.openReveal(s.pendingReveal!), 300);
    else maybeOfflineClaim(this);
  }

  fromHash(initial = false) {
    const r = location.hash.replace('#', '') as Route;
    const route: Route = r === 'race' || r === 'showroom' ? r : 'garage';
    if (initial || route !== this.route) this.go(route, false);
  }

  go(r: Route, push = true) {
    if (this.busy) return;
    this.views[this.route].hide?.();
    this.route = r;
    for (const [k, v] of Object.entries(this.views)) v.el.classList.toggle('on', k === r);
    for (const [k, b] of Object.entries(this.navBtns)) {
      b.classList.toggle('on', k === r);
      if (k === r) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (push && location.hash !== `#${r}`) history.replaceState(null, '', `#${r}`);
    this.views[r].show();
    this.maybeShowUpdate();
  }

  onEvents(ev: GameEvent[]) {
    this.refreshTop(ev);
    for (const v of Object.values(this.views)) v.onEvents(ev);
    for (const e of ev) {
      if (e.type === 'unlock' && !this.reveal) setTimeout(() => this.promptReveal(), 450);
      if (e.type === 'invalid') {
        sfx.invalid();
        if (e.reason !== 'empty') this.toast(e.reason === 'Different family' || e.reason === 'Different tier' ? 'Match two parts of the same family and tier' : e.reason);
      }
    }
  }

  refreshTop(ev: GameEvent[] = []) {
    const s = this.game.state;
    const set = (k: string, v: string, bump: boolean) => {
      const el = this.chips[k];
      const span = el.querySelector('.v')!;
      if (span.textContent !== v) {
        span.textContent = v;
        if (bump) {
          el.classList.remove('bump');
          void el.offsetWidth;
          el.classList.add('bump');
        }
      }
    };
    const any = ev.length > 0;
    set('cash', fmt(s.cash), any);
    set('rep', fmt(s.rep), any);
    set('scrap', fmt(s.scrap), any);
    set('nitro', `${s.nitro}/${nitroCapFor(s.upgrades.nitroTank)}`, any);
    this.fitTop();
    this.navBtns.showroom.querySelector('.badge')?.remove();
    if (s.pendingReveal) this.navBtns.showroom.append(h('span', { class: 'badge' }, '1'));
  }

  /** Words ("Rep", "Scrap") read best, but large balances need the room: fall back to glyphs when a value would clip. */
  private topBar: HTMLElement | null = null;
  fitTop() {
    const bar = this.topBar ?? (this.topBar = this.root.querySelector('.topbar'));
    if (!bar) return;
    bar.classList.remove('compact', 'wrap');
    const clipping = () => Object.values(this.chips).some((c) => c.scrollWidth > c.clientWidth + 1);
    if (!clipping()) return;
    bar.classList.add('compact');
    // enlarged text or very large balances: let the bar take a second row rather than cut numbers off
    if (clipping()) bar.classList.add('wrap');
  }

  promptReveal() {
    const car = this.game.state.pendingReveal;
    if (!car || this.reveal) return;
    if (this.busy) return; // race result screen will prompt after closing
    this.openReveal(car);
  }

  openReveal(car: NonNullable<Game['state']['pendingReveal']>) {
    if (this.reveal || this.busy || this.game.state.pendingReveal !== car) return;
    this.busy = true;
    this.reveal = new RevealOverlay(this, car, () => {
      this.reveal = null;
      this.busy = false;
      this.views[this.route].show();
      if (this.game.state.pendingReveal) this.promptReveal();
      else this.maybeShowUpdate();
    });
    this.root.append(this.reveal.el);
  }

  /** Replay a car's unveil from the Showroom without touching the save. */
  replayReveal(car: NonNullable<Game['state']['pendingReveal']>) {
    if (this.reveal) return;
    this.busy = true;
    this.reveal = new RevealOverlay(this, car, () => {
      this.reveal = null;
      this.busy = false;
      this.views[this.route].show();
    }, true);
    this.root.append(this.reveal.el);
  }

  private toastMsg = '';
  private toastCount = 0;
  toast(msg: string, action?: { label: string; run: () => void }, ms = 3200) {
    // Repeated notices group into one ("×3") instead of stacking over the bench or the Race button.
    const same = this.toastEl?.isConnected && this.toastMsg === msg && !action;
    this.toastCount = same ? this.toastCount + 1 : 1;
    this.toastMsg = msg;
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const el = h('div', { class: `toast${action ? ' has-action' : ''}${same ? ' again' : ''}`, role: 'status' }, h('span', {}, msg),
      this.toastCount > 1 ? h('span', { class: 'toast-count' }, `×${this.toastCount}`) : null,
      action ? h('button', { class: 'btn sm primary', onclick: () => { el.remove(); action.run(); } }, action.label) : null);
    this.toastEl = el;
    this.root.append(el);
    this.toastTimer = window.setTimeout(() => el.remove(), ms);
  }

  sheet(build: (close: () => void) => HTMLElement, onClose?: () => void): () => void {
    const back = h('div', { class: 'sheet-back' });
    const opener = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      back.remove();
      document.removeEventListener('keydown', onKey);
      onClose?.();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    sh.append(build(close));
    back.append(sh);
    this.root.append(back);
    (sh.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    return close;
  }

  /** Offer a staged service-worker update only on a safe screen. */
  private updateOffered = false;
  maybeShowUpdate() {
    if (!this.updateReady || this.busy || this.updateOffered) return;
    this.updateOffered = true; // offered once; Settings keeps a Reload button afterwards
    const apply = this.updateReady;
    this.toast('An update is ready.', { label: 'Reload', run: () => { this.game.saveNow(); apply(); } }, 12000);
  }

  get topTier() { return MAX_TIER; }
}
