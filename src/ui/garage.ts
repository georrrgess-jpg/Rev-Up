import { sfx } from '../audio';
import * as B from '../core/board';
import type { GameEvent, SlotRef } from '../core/events';
import { sameRef } from '../core/events';
import { computeLoadout, scrapImpact } from '../core/loadout';
import * as P from '../core/progression';
import type { Part } from '../core/state';
import {
  ACTIVE_FAMILIES, CRATE_SCRAP_COST, FAMILIES, Family, MAX_TIER, MERGE_ALL_UNLOCK_ACTIVE_S, NITRO_CAP,
  TARGETED_CRATE_CASH_COST, TARGETED_CRATE_SCRAP_COST, UPGRADES, carById, eventById,
} from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import { familyIcon, partSvg } from '../render/parts';
import type { App, View } from './app';
import { h } from './dom';

const PRESS: SlotRef = { zone: 'tray', i: -1 }; // sentinel for the scrap press

export class GarageView implements View {
  el: HTMLElement;
  private goalBtn: HTMLButtonElement;
  private goalCanvas: HTMLCanvasElement;
  private goalTitle: HTMLElement;
  private goalLine: HTMLElement;
  private goalBar: HTMLElement;
  private equipEl: HTMLElement;
  private capEl: HTMLElement;
  private boardEl: HTMLElement;
  private trayEl: HTMLElement;
  private pressEl: HTMLButtonElement;
  private hintEl: HTMLElement;
  private cratesBtn: HTMLButtonElement;
  private printerBar: HTMLElement;
  private mergeAllBtn: HTMLButtonElement;
  private raceBtn: HTMLButtonElement;
  private cells: HTMLButtonElement[] = [];
  private trayCells: HTMLButtonElement[] = [];
  private sel: SlotRef | null = null;
  private drag: { from: SlotRef; id: number; x0: number; y0: number; ghost: HTMLElement | null } | null = null;
  private boardCols = 0;
  private visible = false;

  constructor(private app: App) {
    this.goalCanvas = h('canvas', { 'aria-hidden': 'true' });
    this.goalTitle = h('div', { class: 'gt' });
    this.goalLine = h('div', { class: 'gl' });
    this.goalBar = h('i');
    this.goalBtn = h('button', { class: 'goal', onclick: () => this.onGoal() }, this.goalCanvas,
      h('div', { class: 'gtxt' }, this.goalTitle, this.goalLine, h('div', { class: 'bar' }, this.goalBar)));
    this.equipEl = h('div', { class: 'equip', 'aria-label': 'Equipped parts' });
    this.capEl = h('div', { class: 'capnote' });
    this.boardEl = h('div', { class: 'board', role: 'grid', 'aria-label': 'Parts board' });
    this.trayEl = h('div', { class: 'tray', role: 'grid', 'aria-label': 'Overflow tray' });
    this.pressEl = h('button', { class: 'press', 'data-press': '1', 'aria-label': 'Scrap press: drop or select a part, then tap here to scrap it' },
      h('span', { class: 'pi', 'aria-hidden': 'true' }, '♻'), 'SCRAP');
    this.pressEl.addEventListener('click', () => this.onPressTap());
    this.hintEl = h('div', { class: 'hint', role: 'status' });
    this.printerBar = h('i');
    this.cratesBtn = h('button', { class: 'btn crates', onclick: () => this.onCrates() });
    this.mergeAllBtn = h('button', { class: 'btn', onclick: () => this.onMergeAll() });
    this.raceBtn = h('button', { class: 'btn primary race', onclick: () => this.onRace() });
    const shopBtn = h('button', { class: 'btn', 'aria-label': 'Workshop: crates and upgrades', onclick: () => this.openWorkshop() }, h('span', { class: 'stack' }, '🛠', h('small', {}, 'Shop')));

    this.el = h('section', { class: 'view garage', 'aria-label': 'Garage' },
      this.goalBtn, this.equipEl, this.capEl,
      h('div', { class: 'boardwrap' }, this.boardEl),
      h('div', { class: 'trayrow' }, this.trayEl, this.pressEl),
      this.hintEl,
      h('div', { class: 'actions' }, this.cratesBtn, shopBtn, this.mergeAllBtn, this.raceBtn),
    );
    this.bindPointer();
    this.bindKeys();
    window.addEventListener('resize', () => this.visible && this.layout());
    window.visualViewport?.addEventListener('resize', () => this.visible && this.layout());
  }

  get s() { return this.app.game.state; }

  show() {
    this.visible = true;
    this.render();
    requestAnimationFrame(() => this.layout());
  }
  hide() {
    this.visible = false;
    this.cancelDrag();
    this.setSel(null);
  }

  // ---------------- Layout ----------------
  private layout() {
    const s = this.s;
    const vw = this.el.clientWidth - 24;
    const gap = 5;
    const cellW = (Math.min(vw, 520) - 14 - gap * (s.cols - 1)) / s.cols;
    const others = [this.goalBtn, this.equipEl, this.capEl, this.hintEl, this.el.querySelector('.actions') as HTMLElement]
      .reduce((a, e) => a + e.offsetHeight, 0) + 34;
    const H = this.el.clientHeight - others;
    const cellH = (H - 14 - gap * (s.rows - 1) - 14) / (s.rows + 0.86);
    const cell = Math.max(38, Math.min(84, Math.floor(Math.min(cellW, cellH))));
    this.el.style.setProperty('--cell', `${cell}px`);
    this.drawGoal();
  }

  // ---------------- Rendering ----------------
  private ensureCells() {
    const s = this.s;
    if (this.boardCols !== s.cols || this.cells.length !== s.board.length) {
      this.boardCols = s.cols;
      this.boardEl.style.setProperty('--cols', String(s.cols));
      this.boardEl.replaceChildren();
      this.cells = s.board.map((_, i) => {
        const b = h('button', { class: 'cell', 'data-zone': 'board', 'data-i': i, role: 'gridcell', tabindex: i === 0 ? 0 : -1 });
        this.boardEl.append(b);
        return b;
      });
      requestAnimationFrame(() => this.layout());
    }
    if (!this.trayCells.length) {
      this.trayCells = s.tray.map((_, i) => {
        const b = h('button', { class: 'cell', 'data-zone': 'tray', 'data-i': i, role: 'gridcell', tabindex: -1 });
        this.trayEl.append(b);
        return b;
      });
    }
  }

  private cellFor(r: SlotRef): HTMLButtonElement | null {
    if (sameRef(r, PRESS)) return this.pressEl;
    return (r.zone === 'board' ? this.cells[r.i] : this.trayCells[r.i]) ?? null;
  }

  private partHtml(p: Part, equipped: boolean, overCap: boolean): string {
    const q = p.q === 'mint' ? '<span class="qtag">MINT</span>' : p.q === 'polished' ? '<span class="qtag">POL</span>' : '';
    const label = `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? `, ${p.q}` : ''}${equipped ? ', equipped' : ''}${overCap ? ', above car cap' : ''}`;
    return `<div class="part q-${p.q}${equipped ? ' equipped' : ''}${overCap ? ' over-cap' : ''}" aria-label="${label}">${partSvg(p.f, p.t, p.q)}<span class="tier">${p.t}</span>${q}<span class="fam" style="background:${FAMILIES[p.f].color}"></span></div>`;
  }

  render(anim: Map<string, string[]> = new Map()) {
    if (!this.el.isConnected) return;
    this.ensureCells();
    const s = this.s;
    const lo = computeLoadout(s);
    const eqIds = new Set(Object.values(lo.equipped).map((p) => p!.id));
    const cap = carById(s.activeCar).cap;
    const paint = (cell: HTMLButtonElement, p: Part | null, key: string) => {
      const html = p ? this.partHtml(p, eqIds.has(p.id), p.t > cap) : '';
      if (cell.dataset.html !== html) {
        cell.innerHTML = html;
        cell.dataset.html = html;
      }
      cell.setAttribute('aria-label', p ? cell.firstElementChild!.getAttribute('aria-label')! : 'Empty slot');
      const classes = anim.get(key);
      if (classes && cell.firstElementChild) {
        const el = cell.firstElementChild as HTMLElement;
        el.classList.remove('pop', 'flash-mint', 'flash-pol', 'drop-in');
        void el.offsetWidth;
        el.classList.add(...classes);
      }
    };
    s.board.forEach((p, i) => paint(this.cells[i], p, `board:${i}`));
    s.tray.forEach((p, i) => paint(this.trayCells[i], p, `tray:${i}`));
    this.renderHighlights();
    this.renderGoal();
    this.renderEquip(lo);
    this.renderActions();
    this.renderHint();
  }

  private renderHighlights() {
    const s = this.s;
    const src = this.drag?.from ?? this.sel;
    const srcPart = src ? B.getPart(s, src) : null;
    const all = [...this.cells.map((c, i) => [c, { zone: 'board', i }] as const), ...this.trayCells.map((c, i) => [c, { zone: 'tray', i }] as const)];
    for (const [c, ref] of all) {
      const p = B.getPart(s, ref as SlotRef);
      const isSrc = !!src && sameRef(src, ref as SlotRef);
      c.classList.toggle('sel', !!this.sel && sameRef(this.sel, ref as SlotRef));
      c.classList.toggle('target', !!srcPart && !isSrc && B.canFuse(srcPart, p));
      c.classList.toggle('target-empty', !!srcPart && !p);
    }
    this.pressEl.classList.toggle('target', !!srcPart);
    // first-merge coaching: pulse the starter pair
    if (!s.stats.milestones.firstMerge && !srcPart) {
      const pair = this.findPair();
      if (pair) for (const r of pair) this.cellFor(r)?.firstElementChild?.classList.add('pop');
    }
  }

  private findPair(): [SlotRef, SlotRef] | null {
    const s = this.s;
    for (let i = 0; i < s.board.length; i++) for (let j = i + 1; j < s.board.length; j++) {
      if (B.canFuse(s.board[i], s.board[j]) && s.board[i]!.f === 'engine') return [{ zone: 'board', i }, { zone: 'board', i: j }];
    }
    return null;
  }

  private renderGoal() {
    const s = this.s;
    const g = P.goalStatus(s);
    this.goalBtn.classList.toggle('ready', !!s.pendingReveal);
    if (s.pendingReveal) {
      const c = carById(s.pendingReveal);
      this.goalTitle.textContent = 'Unlocked';
      this.goalLine.innerHTML = `Tap to reveal the <b>${c.name}</b>`;
      this.goalBar.style.width = '100%';
    } else if (g) {
      this.goalTitle.textContent = `Next car · ${g.car.name}`;
      const parts: string[] = [];
      if (!g.keystoneDone) parts.push(`Craft <b>T${g.tier} ${FAMILIES[g.family].name}</b>`);
      if (s.rep < g.repNeed) parts.push(`<b>${g.repNeed - s.rep}</b> more Rep`);
      this.goalLine.innerHTML = parts.length ? parts.join(' · ') : `The ${g.car.name} is ready`;
      this.goalBar.style.width = `${Math.round(g.progress * 100)}%`;
      this.goalBtn.setAttribute('aria-label', `Next car: ${g.line}`);
    } else {
      this.goalTitle.textContent = 'Showroom';
      this.goalLine.textContent = 'Every car in this release is yours. Race to bank cash.';
      this.goalBar.style.width = '100%';
    }
    this.drawGoal();
  }

  private drawGoal() {
    const s = this.s;
    const { w, h: hh } = fitCanvas(this.goalCanvas, 2);
    const ctx = this.goalCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hh);
    const id = s.pendingReveal ?? P.nextCar(s)?.id ?? s.activeCar;
    const cls = carById(id);
    const cw = w * 0.92;
    const covered = !!(s.pendingReveal || P.nextCar(s));
    drawCar(ctx, id, (w - cw) / 2, hh * 0.92, cw, { paint: cls.paint, trim: cls.trim, cover: covered ? 1 : 0 });
  }

  private renderEquip(lo: ReturnType<typeof computeLoadout>) {
    const s = this.s;
    const cls = carById(s.activeCar);
    this.equipEl.replaceChildren(...ACTIVE_FAMILIES.map((f) => {
      const p = lo.equipped[f];
      return h('div', { class: `eq${p ? '' : ' none'}`, title: FAMILIES[f].statLabel },
        h('span', { html: p ? partSvg(f, p.t, p.q) : familyIcon(f) }),
        h('span', {}, p ? `T${p.t} ${FAMILIES[f].name}` : `No ${FAMILIES[f].name}`));
    }));
    const blocked = (Object.keys(lo.blocked) as Family[])[0];
    this.capEl.textContent = blocked ? `T${lo.blocked[blocked]!.t} ${FAMILIES[blocked].name} is stored above the ${cls.name} cap (T${cls.cap}) — the next car can use it.` : '';
    this.capEl.style.display = blocked ? '' : 'none';
  }

  renderActions() {
    const s = this.s;
    const n = s.crates.length;
    const printerCrates = s.crates.filter((c) => c.source === 'printer').length;
    const paused = printerCrates >= P.PRINTER_BANK_CAP;
    this.cratesBtn.replaceChildren(h('span', { class: 'stack' }, '📦', h('small', {}, paused ? 'Printer full' : 'Crates')),
      ...[n ? h('span', { class: 'count num' }, n) : '', h('span', { class: 'printer' }, this.printerBar)]);
    this.cratesBtn.setAttribute('aria-label', `Crates: ${n} waiting${paused ? ', printer paused until you open some' : ''}`);
    this.cratesBtn.classList.toggle('pulse', n > 0 && B.freeSlots(s) > 0);
    this.updatePrinter();
    const unlocked = P.mergeAllUnlocked(s);
    const left = Math.max(0, MERGE_ALL_UNLOCK_ACTIVE_S - s.activeS);
    this.mergeAllBtn.replaceChildren(h('span', { class: 'stack' }, '⚡', h('small', {}, unlocked ? 'Merge All' : `${Math.ceil(left / 60)} min`)));
    this.mergeAllBtn.classList.toggle('off', !unlocked || !B.hasAnyPair(s));
    this.mergeAllBtn.setAttribute('aria-label', unlocked ? 'Merge All' : `Merge All unlocks in ${Math.ceil(left / 60)} active minutes`);
    const q = s.pendingQuick;
    if (q) {
      const left2 = Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000));
      this.raceBtn.replaceChildren(h('span', { class: 'stack' }, 'Crew racing', h('small', {}, `${eventById(q.eventId).name} · ${left2} s`)));
    } else {
      const ev = P.recommendedEvent(s);
      this.raceBtn.replaceChildren(h('span', { class: 'stack' }, '🏁 RACE', h('small', {}, `${ev.name}${s.nitro ? ` · 🔥${s.nitro}` : ''}`)));
    }
  }

  updatePrinter() {
    const s = this.s;
    const frac = Math.min(1, s.printerS / P.printerInterval(s));
    this.printerBar.style.width = `${Math.round(frac * 100)}%`;
  }

  private renderHint() {
    const s = this.s;
    let t = '';
    if (!s.stats.milestones.firstMerge) t = 'Drag one Engine onto the other to merge them';
    else if (s.stats.races === 0 && !s.pendingRace) t = 'Merged! Tap Race to earn cash and Rep';
    else if (B.freeSlots(s) === 0) t = 'Board full. Merge a pair or scrap a part';
    else if (s.nitro > 0 && !s.tips.nitro) t = `Nitro ${s.nitro}/${NITRO_CAP} banked. Tap it in the amber windows`;
    this.hintEl.textContent = t;
    this.raceBtn.classList.toggle('pulse', !!s.stats.milestones.firstMerge && s.stats.races === 0);
  }

  // ---------------- Events → animations ----------------
  onEvents(ev: GameEvent[]) {
    if (!this.visible) return;
    const anim = new Map<string, string[]>();
    const key = (r: SlotRef) => `${r.zone}:${r.i}`;
    let delay = 0;
    let maxChain = 0;
    for (const e of ev) {
      if (e.type === 'fuse') {
        const cls = ['pop'];
        if (e.q === 'mint') cls.push('flash-mint');
        if (e.q === 'polished') cls.push('flash-pol');
        anim.set(key(e.at), cls);
        maxChain = Math.max(maxChain, e.chain);
        const chain = e.chain;
        const at = e.at;
        const q = e.q;
        const tier = e.tier;
        const skipped = e.skipped;
        setTimeout(() => {
          sfx.merge(chain);
          if (q === 'mint') { sfx.mint(); this.floater(at, skipped ? `MINT · jumped to T${tier}` : 'MINT', 'gold'); }
          else if (q === 'polished') { sfx.polished(); this.floater(at, 'Polished +15%', ''); }
          if (chain > 1) this.floater(at, `Cascade ×${chain}`, '');
        }, delay);
        delay += this.s.settings.reducedMotion ? 0 : 90;
      }
      if (e.type === 'place') anim.set(key(e.at), ['drop-in']);
      if (e.type === 'move') anim.set(key(e.to), ['drop-in']);
      if (e.type === 'scrap') { sfx.scrap(); this.floater(PRESS, `+${e.value} scrap`, ''); }
      if (e.type === 'nitro') { sfx.nitroBank(); this.floaterTop(`Nitro +1 (${e.total}/${NITRO_CAP})`, 'blue'); }
      if (e.type === 'nitroFull') this.floaterTop(`Nitro full (${NITRO_CAP}/${NITRO_CAP})`, 'blue');
      if (e.type === 'combo' && e.count >= 2) this.floaterTop(`Combo ×${e.count}`, '');
      if (e.type === 'keystone') {
        const g = P.goalStatus(this.s);
        const car = P.nextCar(this.s);
        if (car?.unlock && car.unlock.family === e.family && car.unlock.tier === e.tier) {
          this.app.toast(g?.keystoneDone && this.s.rep < g.repNeed ? `Keystone crafted! ${g.repNeed - this.s.rep} more Rep to unlock the ${car.name}` : 'Keystone crafted!');
        }
      }
      if (e.type === 'crateBlocked') this.app.toast('Board full. Merge a pair or scrap a part.');
      if (e.type === 'catchup') this.app.toast(`A ${FAMILIES[e.family].name} crate arrived to help with your goal`);
      if (e.type === 'mergeAll') this.app.toast(e.fusions ? `Merge All: ${e.fusions} fusions${e.longest >= 3 ? ` · longest chain ${e.longest}` : ''}` : 'Nothing to merge');
      if (e.type === 'invalid') {
        const c = this.sel ? this.cellFor(this.sel) : null;
        c?.classList.add('shake');
        setTimeout(() => c?.classList.remove('shake'), 300);
      }
      if (e.type === 'quickDone') {
        const r = this.app.game.quickResult;
        if (r) this.app.toast(`Quick Race ${r.place === 1 ? 'won' : `finished ${['', '1st', '2nd', '3rd', '4th'][r.place]}`}: +$${r.cash}, +${r.rep} Rep${r.crates ? `, ${r.crates} crate${r.crates > 1 ? 's' : ''}` : ''}`);
      }
    }
    const placed = ev.filter((e) => e.type === 'place').length;
    if (placed && !ev.some((e) => e.type === 'fuse')) sfx.place();
    void maxChain;
    this.render(anim);
  }

  floater(at: SlotRef, text: string, cls: string) {
    const c = this.cellFor(at);
    if (!c) return;
    const r = c.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const f = h('div', { class: `floater ${cls}` }, text);
    f.style.left = `${r.left - host.left + r.width / 2}px`;
    f.style.top = `${r.top - host.top - 4}px`;
    this.el.append(f);
    setTimeout(() => f.remove(), 1000);
  }
  floaterTop(text: string, cls: string) {
    const r = this.boardEl.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const f = h('div', { class: `floater ${cls}` }, text);
    f.style.left = `${r.left - host.left + r.width / 2}px`;
    f.style.top = `${r.top - host.top + 6}px`;
    this.el.append(f);
    setTimeout(() => f.remove(), 1000);
  }

  // ---------------- Input: pointer ----------------
  private refFromEl(el: Element | null): SlotRef | null {
    const c = el?.closest('[data-zone],[data-press]') as HTMLElement | null;
    if (!c) return null;
    if (c.dataset.press) return PRESS;
    return { zone: c.dataset.zone as 'board' | 'tray', i: Number(c.dataset.i) };
  }

  private bindPointer() {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ref = this.refFromEl(e.target as Element);
      if (!ref || sameRef(ref, PRESS)) return;
      const p = B.getPart(this.s, ref);
      if (!p) return; // taps on empty cells are handled by click
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      this.drag = { from: ref, id: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null };
    };
    const onMove = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.ghost) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
        const c = this.cellFor(d.from)!;
        d.ghost = h('div', { class: 'ghost', html: c.innerHTML });
        d.ghost.style.setProperty('--cell', getComputedStyle(this.el).getPropertyValue('--cell'));
        document.body.append(d.ghost);
        c.firstElementChild?.classList.add('dragging');
        this.setSel(null);
        this.renderHighlights();
      }
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (d.ghost) {
        d.ghost.remove();
        const target = this.refFromEl(document.elementFromPoint(e.clientX, e.clientY));
        this.cellFor(d.from)?.firstElementChild?.classList.remove('dragging');
        if (target && sameRef(target, PRESS)) this.requestScrap(d.from);
        else if (target && !sameRef(target, d.from)) this.doMove(d.from, target);
        else this.renderHighlights(); // invalid drop returns cleanly
        this.suppressClick = true;
        setTimeout(() => (this.suppressClick = false), 0);
      }
    };
    for (const zone of [this.boardEl, this.trayEl]) {
      zone.addEventListener('pointerdown', onDown);
      zone.addEventListener('pointermove', onMove);
      zone.addEventListener('pointerup', onUp);
      zone.addEventListener('pointercancel', () => this.cancelDrag());
      zone.addEventListener('lostpointercapture', (e) => { if (this.drag?.ghost && this.drag.id === (e as PointerEvent).pointerId) this.cancelDrag(); });
      zone.addEventListener('click', (e) => {
        if (this.suppressClick) return;
        const ref = this.refFromEl(e.target as Element);
        if (ref) this.onTap(ref);
      });
      zone.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  private suppressClick = false;

  private cancelDrag() {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.cellFor(this.drag.from)?.firstElementChild?.classList.remove('dragging');
    this.drag = null;
    this.renderHighlights();
  }

  private onTap(ref: SlotRef) {
    const p = B.getPart(this.s, ref);
    if (!this.sel) {
      if (p) this.setSel(ref);
      return;
    }
    if (sameRef(this.sel, ref)) return this.setSel(null);
    const from = this.sel;
    const target = B.getPart(this.s, ref);
    const src = B.getPart(this.s, from);
    if (target && src && !B.canFuse(src, target)) {
      this.setSel(ref); // tapping a non-matching part switches selection
      return;
    }
    this.setSel(null);
    this.doMove(from, ref);
  }

  private onPressTap() {
    if (this.sel) {
      const from = this.sel;
      this.setSel(null);
      this.requestScrap(from);
    } else this.app.toast('Select a part, then tap Scrap — or drag a part here.');
  }

  private setSel(r: SlotRef | null) {
    this.sel = r;
    this.renderHighlights();
  }

  private doMove(from: SlotRef, to: SlotRef) {
    this.app.game.move(from, to);
  }

  requestScrap(ref: SlotRef) {
    const p = B.getPart(this.s, ref);
    if (!p) return;
    const imp = scrapImpact(this.s, p.id);
    const value = B.scrapValue(p);
    if (!imp && p.t < 3) {
      this.app.game.scrap(ref);
      return;
    }
    this.app.sheet((close) => {
      const fam = FAMILIES[p.f];
      return h('div', {},
        h('h2', {}, `Scrap T${p.t} ${fam.name}?`),
        imp
          ? h('p', {}, `It's equipped on your ${carById(this.s.activeCar).name}. ${fam.statLabel} drops — `,
            imp.next ? h('b', {}, `T${imp.next.t} ${fam.name} equips next.`) : h('b', {}, `no ${fam.name} left to equip.`))
          : h('p', {}, `You'll get ${value} scrap. Every 10 scrap buys a crate.`),
        imp ? h('p', {}, `You'll get ${value} scrap.`) : null,
        h('div', { class: 'fams' },
          h('button', { class: 'btn', onclick: close }, 'Keep it'),
          h('button', { class: 'btn danger', onclick: () => { close(); this.app.game.scrap(ref); } }, `Scrap for ${value}`)),
      );
    });
  }

  // ---------------- Input: keyboard ----------------
  private bindKeys() {
    this.el.addEventListener('keydown', (e) => {
      const ref = this.refFromEl(document.activeElement);
      if (!ref) return;
      const s = this.s;
      let next: SlotRef | null = null;
      if (sameRef(ref, PRESS)) {
        if (e.key === 'ArrowLeft') next = { zone: 'tray', i: s.tray.length - 1 };
        if (e.key === 'ArrowUp') next = { zone: 'board', i: s.board.length - 1 };
      } else if (ref.zone === 'board') {
        const r = Math.floor(ref.i / s.cols);
        const c = ref.i % s.cols;
        if (e.key === 'ArrowRight' && c < s.cols - 1) next = { zone: 'board', i: ref.i + 1 };
        if (e.key === 'ArrowLeft' && c > 0) next = { zone: 'board', i: ref.i - 1 };
        if (e.key === 'ArrowUp' && r > 0) next = { zone: 'board', i: ref.i - s.cols };
        if (e.key === 'ArrowDown') next = r < s.rows - 1 ? { zone: 'board', i: ref.i + s.cols } : { zone: 'tray', i: Math.min(s.tray.length - 1, c) };
      } else {
        if (e.key === 'ArrowRight') next = ref.i < s.tray.length - 1 ? { zone: 'tray', i: ref.i + 1 } : PRESS;
        if (e.key === 'ArrowLeft' && ref.i > 0) next = { zone: 'tray', i: ref.i - 1 };
        if (e.key === 'ArrowUp') next = { zone: 'board', i: (s.rows - 1) * s.cols + Math.min(ref.i, s.cols - 1) };
      }
      if (next) {
        e.preventDefault();
        const el = this.cellFor(next)!;
        for (const c of [...this.cells, ...this.trayCells]) c.tabIndex = -1;
        el.tabIndex = 0;
        el.focus();
        return;
      }
      if (e.key === 'Escape') { this.setSel(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x') && !sameRef(ref, PRESS)) {
        e.preventDefault();
        this.setSel(null);
        this.requestScrap(ref);
      }
      if (e.key === 'r') this.onRace();
      if (e.key === 'c') this.onCrates();
    });
  }

  // ---------------- Actions ----------------
  private onGoal() {
    const s = this.s;
    if (s.pendingReveal) return this.app.openReveal(s.pendingReveal);
    const g = P.goalStatus(s);
    if (!g) return this.app.go('showroom');
    const tips: string[] = [];
    if (!g.keystoneDone) {
      tips.push(g.bestHeld >= 1
        ? `Your best ${FAMILIES[g.family].name} is T${g.bestHeld}. Merge pairs up to T${g.tier} — crafting it yourself counts, crate drops don't.`
        : `Merge ${FAMILIES[g.family].plural} up to T${g.tier}. Crafting it yourself counts, crate drops don't.`);
    }
    if (s.rep < g.repNeed) tips.push(`Earn ${g.repNeed - s.rep} more Rep from races. Every finish pays Rep — wins pay most.`);
    this.app.sheet((close) => h('div', {},
      h('button', { class: 'btn sm close', onclick: close }, 'Close'),
      h('h2', {}, `Next: the ${g.car.name}`),
      h('p', {}, g.car.blurb),
      ...tips.map((t) => h('p', {}, t)),
      !g.keystoneDone ? h('button', { class: 'btn wide', onclick: () => { close(); this.openWorkshop(); } }, `Get ${FAMILIES[g.family].name} crates`) : null,
    ));
  }

  private onCrates() {
    const s = this.s;
    this.app.game.markTip('crates');
    if (!s.crates.length) {
      const secs = Math.ceil(P.printerInterval(s) - s.printerS);
      this.app.toast(`No crates yet. The printer makes one in ${secs} s`);
      return;
    }
    if (B.freeSlots(s) === 0) {
      this.app.toast('Board full. Merge a pair or scrap a part.');
      return;
    }
    this.app.game.openCrates();
  }

  private onMergeAll() {
    const s = this.s;
    if (!P.mergeAllUnlocked(s)) {
      this.app.toast(`Merge All unlocks after 10 active minutes · ${Math.ceil((MERGE_ALL_UNLOCK_ACTIVE_S - s.activeS) / 60)} min to go`);
      return;
    }
    if (!B.hasAnyPair(s)) { this.app.toast('No pairs to merge'); return; }
    this.app.game.mergeAll();
  }

  private onRace() {
    const s = this.s;
    if (s.pendingQuick) { this.app.go('race'); return; }
    this.app.game.markTip('nitro');
    (this.app.views.race as unknown as { startLive(id: string): void }).startLive(P.recommendedEvent(s).id);
  }

  openWorkshop() {
    const game = this.app.game;
    this.app.sheet((close) => {
      const body = h('div', {});
      const build = () => {
        const s = game.state;
        const g = P.goalStatus(s);
        body.replaceChildren(
          h('button', { class: 'btn sm close', onclick: close }, 'Close'),
          h('h2', {}, 'Workshop'),
          h('p', {}, `You have ${s.scrap} scrap and $${s.cash}. Crates open straight onto the board when there's room.`),
          h('h3', {}, 'Crates'),
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Random crate'), h('div', { class: 'd' }, 'One part, any family')),
            h('button', { class: `btn sm${s.scrap < CRATE_SCRAP_COST ? ' off' : ''}`, onclick: () => { game.buyCrate('std'); build(); } }, `${CRATE_SCRAP_COST} scrap`)),
          h('div', { class: 'd', style: 'margin:6px 0' }, g && !g.keystoneDone ? `Pick a family. Your goal needs ${FAMILIES[g.family].plural}.` : 'Pick a family:'),
          h('div', { class: 'fams' }, ...ACTIVE_FAMILIES.map((f) => h('button', {
            class: `btn${g && !g.keystoneDone && g.family === f ? ' primary' : ''}${s.scrap < TARGETED_CRATE_SCRAP_COST ? ' off' : ''}`,
            'aria-label': `${FAMILIES[f].name} crate for ${TARGETED_CRATE_SCRAP_COST} scrap`,
            onclick: () => { game.buyCrate('targeted', f); build(); },
          }, h('span', { html: familyIcon(f) }), h('small', {}, `${FAMILIES[f].name} · ${TARGETED_CRATE_SCRAP_COST} scrap`)))),
          h('div', { class: 'fams', style: 'margin-top:6px' }, ...ACTIVE_FAMILIES.map((f) => h('button', {
            class: `btn sm${s.cash < TARGETED_CRATE_CASH_COST ? ' off' : ''}`,
            'aria-label': `Order a ${FAMILIES[f].name} part for ${TARGETED_CRATE_CASH_COST} dollars`,
            onclick: () => { game.buyCrate('cash', f); build(); },
          }, `${FAMILIES[f].name} $${TARGETED_CRATE_CASH_COST}`))),
          h('h3', {}, 'Upgrades'),
          ...UPGRADES.map((u) => {
            const lvl = s.upgrades[u.id];
            const next = u.levels[lvl];
            return h('div', { class: 'row' },
              h('div', { class: 'grow' }, h('div', { class: 't' }, `${u.name}${u.levels.length > 1 ? ` · ${lvl}/${u.levels.length}` : ''}`), h('div', { class: 'd' }, next ? next.label : 'Maxed')),
              next ? h('button', { class: `btn sm${s.cash < next.cost ? ' off' : ' primary'}`, onclick: () => { game.buyUpgrade(u.id); build(); } }, `$${next.cost}`) : h('span', { class: 'd' }, '✓'));
          }),
          h('h3', {}, 'Tips'),
          h('p', {}, `Two parts of the same family and tier merge into the next tier. T${MAX_TIER} is the top tier for now. Merges in quick succession build a combo: every third banks a nitro charge.`),
        );
      };
      build();
      return body;
    });
  }
}
