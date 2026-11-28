import { sfx } from '../audio';
import { gsfx } from '../audio-garage';
import * as B from '../core/board';
import type { GameEvent, SlotRef } from '../core/events';
import { sameRef } from '../core/events';
import * as I from '../core/install';
import { computeLoadout, loadoutWith } from '../core/loadout';
import * as P from '../core/progression';
import type { Part } from '../core/state';
import { mph } from '../core/units';
import { ACTIVE_FAMILIES, FAMILIES, Family, MAX_TIER, MERGE_ALL_UNLOCK_RACES, nitroCapFor, PART_ORDER_PRICE, carById, eventById } from '../data/tables';
import { familyIcon, partTileHtml, qualityName } from '../render/parts';
import { drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { fitChange, onboardActive, onboardFitPart, onboardStep, statLine, tutorialStep } from '../core/tutorial';
import { Coach, CoachStep } from './coach';
import { h } from './dom';
import { openShop } from './shop';
import { openSpares } from './spares';
import { openFitParts } from './fit';
import { openMechanic } from './mechanic';
import { openTestDrive } from './testDrive'; // 1.10 Test & Compare
import { GoalCard, findPair } from './goalCard';
import { canStore, earliestCarFor, isOverCap, storePart } from './contracts';
import { icon, type IconName } from './icons';

const PRESS: SlotRef = { zone: 'tray', i: -1 }; // sentinel for the scrap press

/** Plain stat change words for the active car: "+8 mph · Accel +0.3". */
export function statDelta(a: { top: number; accel: number; grip: number }, b: { top: number; accel: number; grip: number }): string[] {
  const bits: string[] = [];
  const dm = mph(b.top) - mph(a.top);
  if (dm) bits.push(`${dm > 0 ? '+' : '−'}${Math.abs(dm)} mph`);
  const da = Math.round((b.accel - a.accel) * 10) / 10;
  if (da) bits.push(`Accel ${da > 0 ? '+' : '−'}${Math.abs(da).toFixed(1)}`);
  const dg = Math.round((b.grip - a.grip) * 100) / 100;
  if (dg) bits.push(`Grip ${dg > 0 ? '+' : '−'}${Math.abs(dg).toFixed(2)}`);
  return bits;
}

export class GarageView implements View {
  el: HTMLElement;
  private benchStatus: HTMLElement;
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
  private eqSlots: Partial<Record<Family, HTMLButtonElement>> = {};
  private carCanvas!: HTMLCanvasElement;
  private carName!: HTMLElement;
  private carBtn!: HTMLButtonElement;
  private carKey = '';
  /** The car tile canvas's CSS size (ResizeObserver): drawing never reads layout during a merge. */
  private carBox: { w: number; h: number } | null = null;
  private goal: GoalCard;
  private sel: SlotRef | null = null;
  private drag: { from: SlotRef; id: number; x0: number; y0: number; ghost: HTMLElement | null } | null = null;
  /** What the pointer is over while dragging: a cell, the press, or a car slot. */
  private hover: { ref?: SlotRef; fit?: Family } | null = null;
  private boardCols = 0;
  private visible = false;
  /** Pending merge sounds and floaters; a new action flushes them so feedback never lags behind play. */
  private fx: number[] = [];

  constructor(private app: App) {
    this.goal = new GoalCard(app);
    this.equipEl = h('div', { class: 'equip fitstrip', role: 'group', 'aria-label': 'Parts fitted to your car. Tap a slot to fit parts.' });
    this.capEl = h('div', { class: 'capnote' });
    this.benchStatus = h('span', { class: 'num' });
    this.boardEl = h('div', { class: 'board', role: 'grid', 'aria-label': 'Parts board' });
    this.trayEl = h('div', { class: 'tray', role: 'grid', 'aria-label': 'Spare rack' });
    this.pressEl = h('button', { class: 'press', 'data-press': '1', 'aria-label': 'Scrap press: drop or select a part, then tap here to scrap it. Tap with nothing selected to sort spares.' },
      icon('recycle', 'pi'), h('span', { class: 'pl' }, 'Recycle'));
    this.pressEl.addEventListener('click', () => this.onPressTap());
    this.hintEl = h('div', { class: 'hint', role: 'status' });
    this.printerBar = h('i');
    this.cratesBtn = h('button', { class: 'btn tool crates', onclick: () => this.onCrates() });
    this.mergeAllBtn = h('button', { class: 'btn tool', 'data-coach': 'merge-all', onclick: () => this.onMergeAll() });
    this.raceBtn = h('button', { class: 'btn primary race', onclick: () => this.onRace() });
    // Selection actions: while a part is picked up, the action bar's left side says what can be done with it.
    this.selBar = h('div', { class: 'selbar', role: 'group', 'aria-label': 'Selected part' });
    const shopBtn = h('button', { class: 'btn tool', 'aria-label': 'Shop: parts, crates and upgrades', onclick: () => openShop(this.app) }, icon('shop'), h('span', { class: 'tl' }, 'Shop'));
    this.shopBtn = shopBtn;

    // Your car: the active car beside its fitted slots (tap it to open the Mechanic Shop; cars are picked in the Showroom).
    this.carCanvas = h('canvas', { 'aria-hidden': 'true' });
    this.carName = h('span', { class: 'mycar-n' });
    this.carBtn = h('button', { class: 'mycar', 'data-coach': 'fit-now', onclick: () => { if (this.carBtn.classList.contains('fitnow')) this.fitBenchUpgrades(); else openMechanic(this.app); } }, this.carCanvas, this.carName, icon('fit', 'mycar-fit'));
    // The bench header folded into the spare-rack row: free slots and Keep / Recycle sit beside the rack they sort.
    const sortBtn = h('button', { class: 'traycaption sort-spares', 'aria-label': 'Keep or recycle spare parts', onclick: () => openSpares(this.app) },
      icon('spares', 'tc-i'), h('span', { class: 'tc-t' }, 'Spares'), this.benchStatus);
    this.el = h('section', { class: 'view garage', 'aria-label': 'Garage' },
      h('div', { class: 'garage-body scroll' },
        this.goal.el,
        h('div', { class: 'boardwrap' }, this.boardEl),
        h('div', { class: 'carrow' }, this.carBtn, this.equipEl), this.capEl,
        h('div', { class: 'trayrow' }, sortBtn, this.trayEl, this.pressEl),
        this.hintEl),
      this.actionsEl = h('div', { class: 'actions' }, this.cratesBtn, shopBtn, this.mergeAllBtn, this.selBar, this.raceBtn),
    );
    this.coach = new Coach(this.el,
      (id) => { this.app.game.markTip(id); this.render(); },
      () => { this.app.game.markTip('skipGuide'); this.render(); this.app.toast('Tips off. Replay them any time from How to play (?).'); });
    this.bindPointer();
    this.bindKeys();
    this.bindStrip();
    window.addEventListener('resize', () => this.visible && this.layout());
    window.visualViewport?.addEventListener('resize', () => this.visible && this.layout());
    // the view also changes height without a window resize (the top bar can take a second row)
    let lastH = 0;
    new ResizeObserver(() => { const hh = this.el.clientHeight; if (this.visible && hh !== lastH) { lastH = hh; this.layout(); } }).observe(this.el);
  }

  get s() { return this.app.game.state; }

  show() {
    this.visible = true;
    this.render();
    requestAnimationFrame(() => this.layout());
  }
  private coach!: Coach;
  private selBar!: HTMLElement;
  private actionsEl!: HTMLElement;
  private prevStats: { top: number; accel: number; grip: number; car: string } | null = null;
  /** The family of a part fitted to the active car in the batch being rendered (its stat change is named). */
  private fitFam: Family | null = null;
  private shopBtn!: HTMLButtonElement;

  hide() {
    this.coach?.clear();
    this.visible = false;
    this.cancelDrag();
    this.setSel(null);
  }

  // ---------------- Layout ----------------
  private layout() {
    requestAnimationFrame(() => this.coach?.place());
    const s = this.s;
    const body = this.el.querySelector('.garage-body') as HTMLElement;
    const gap = s.cols >= 6 ? 4 : 5;
    this.el.style.setProperty('--gap', `${gap}px`);
    const pad = 10; // board padding + border, both sides
    const vw = body.clientWidth - 4;
    const cellW = (Math.min(vw, 560) - pad - gap * (s.cols - 1)) / s.cols;
    const fixed = [this.goal.el, this.el.querySelector('.carrow')!, this.capEl, this.hintEl]
      .reduce((a, e) => a + (e as HTMLElement).offsetHeight, 0) + 14;
    // the board takes what is left; the spare rack (0.8 of a cell, plus its frame) sits under it
    const H = body.clientHeight - fixed;
    const cellH = (H - pad - gap * (s.rows - 1) - 14) / (s.rows + 0.8);
    // a 7-row bench on a very short phone may go to 36 px so the whole board shows without scrolling (CSS matches)
    const floor = s.rows >= 7 && window.innerHeight <= 660 ? 36 : 40;
    const cell = Math.max(floor, Math.min(88, Math.floor(Math.min(cellW, cellH))));
    this.el.style.setProperty('--cell', `${cell}px`);
    // small cells: quality tags shrink to a glyph and the art fills more of the tile
    this.el.classList.toggle('cells-sm', cell < 50);
    this.goal.draw();
    this.drawCar();
  }

  /** The active car in the strip's tile, redrawn only when it, its paint or the tile size changes. */
  private drawCar() {
    const s = this.s;
    const c = carById(s.activeCar);
    if (this.carName.textContent !== c.model) this.carName.textContent = c.model;
    if (!this.carBox) {
      this.carBox = { w: 0, h: 0 };
      new ResizeObserver((en) => { const r = en[0].contentRect; this.carBox = { w: r.width, h: r.height }; this.drawCar(); }).observe(this.carCanvas);
      return;
    }
    const key = [this.carBox.w, this.carBox.h, s.activeCar, s.paints[s.activeCar] ?? ''].join('|');
    if (key === this.carKey || this.carBox.w < 4) return;
    this.carKey = key;
    this.carBtn.setAttribute('aria-label', `Your car: ${c.model}. Tap to service it in the Mechanic Shop`);
    const { w, h: hh } = fitCanvas(this.carCanvas, 2);
    const ctx = this.carCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hh);
    const cw = Math.min(w * 0.94, hh * 2.3);
    try { drawCar(ctx, s.activeCar, (w - cw) / 2, hh * 0.92, cw, { paint: s.paints[s.activeCar] ?? c.paint, trim: c.trim, shadow: false }); } catch { /* art for this car not ready */ }
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

  private partHtml(p: Part, overCap: boolean, match: boolean, upgrade: boolean): string {
    const label = `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? `, ${qualityName(p.q)}` : ''}${overCap ? ', above car cap' : ''}${match ? ', has a match' : ''}${upgrade ? ', better than what your car has fitted' : ''}`;
    const extra = `${overCap ? 'over-cap' : ''}${match ? ' has-match' : ''}${upgrade ? ' up' : ''}`.trim();
    return partTileHtml(p.f, p.t, p.q, extra, label);
  }

  render(anim: Map<string, string[]> = new Map()) {
    if (!this.el.isConnected) return;
    this.ensureCells();
    const s = this.s;
    const lo = computeLoadout(s);
    const cap = carById(s.activeCar).cap;
    // usable matches: any family+tier held twice below the top tier
    const counts = new Map<string, number>();
    for (const p of B.allParts(s)) if (p.t < MAX_TIER) counts.set(`${p.f}${p.t}`, (counts.get(`${p.f}${p.t}`) ?? 0) + 1);
    // bench parts that would beat what the active car has fitted
    const ups = new Set(Object.values(I.recommendedFit(s, s.activeCar)).filter((r) => r && 'at' in r).map((r) => r!.part.id));
    const paint = (cell: HTMLButtonElement, p: Part | null, key: string) => {
      const html = p ? this.partHtml(p, p.t > cap, (counts.get(`${p.f}${p.t}`) ?? 0) > 1, ups.has(p.id)) : '';
      const fresh = cell.dataset.html !== html;
      if (fresh) {
        cell.innerHTML = html;
        cell.dataset.html = html;
        const label = p ? cell.firstElementChild?.getAttribute('aria-label') ?? '' : 'Empty slot';
        if (cell.getAttribute('aria-label') !== label) cell.setAttribute('aria-label', label);
      }
      const classes = anim.get(key);
      if (classes && cell.firstElementChild) {
        const el = cell.firstElementChild as HTMLElement;
        // a new tile starts its animation as it is inserted; an unchanged one restarts on the next frame
        // (no forced layout here: the merge result has to paint at once)
        if (fresh) el.classList.add(...classes);
        else { el.classList.remove('pop', 'flash-mint', 'flash-pol', 'flash-high', 'drop-in', 'land', 'merged'); requestAnimationFrame(() => el.classList.add(...classes)); }
      }
    };
    s.board.forEach((p, i) => paint(this.cells[i], p, `board:${i}`));
    s.tray.forEach((p, i) => paint(this.trayCells[i], p, `tray:${i}`));
    this.goal.render();
    this.drawCar();
    this.renderEquip(lo);
    this.renderHighlights();
    // Show the stat change right where the fitted parts are listed.
    const st = lo.stats;
    const prev = this.prevStats;
    const fitFam = this.fitFam;
    this.fitFam = null;
    if (prev && prev.car === s.activeCar) {
      const bits = statDelta(prev, st);
      if (bits.length) {
        const down = mph(st.top) < mph(prev.top) || st.accel < prev.accel - 0.01 || st.grip < prev.grip - 0.001;
        // a part just fitted: name the stat it drives, before → after ("Top speed 49 → 55 mph")
        const line = fitFam ? statLine(fitFam, prev, st) : null;
        const f = h('div', { class: `floater stat${down ? ' down' : ''}${line ? ' fitline' : ''}` }, line ?? bits.join(' · '));
        this.place(() => {
          const r = this.equipEl.getBoundingClientRect();
          const host = this.hostRect!;
          return () => { f.style.left = `${r.left - host.left + r.width / 2}px`; f.style.top = `${r.top - host.top}px`; this.el.append(f); setTimeout(() => f.remove(), line ? 2400 : 1600); };
        });
      }
    }
    this.prevStats = { ...st, car: s.activeCar };
    this.renderActions();
    this.renderHint();
    this.renderSelBar();
    this.coach.show(this.coachStep());
  }

  private renderHighlights() {
    const s = this.s;
    const src = this.drag?.from ?? this.sel;
    const srcPart = src ? B.getPart(s, src) : null;
    const hv = this.drag?.ghost ? this.hover : null;
    const all = [...this.cells.map((c, i) => [c, { zone: 'board', i }] as const), ...this.trayCells.map((c, i) => [c, { zone: 'tray', i }] as const)];
    for (const [c, r] of all) {
      const ref = r as SlotRef;
      const p = B.getPart(s, ref);
      const isSrc = !!src && sameRef(src, ref);
      const ok = !!srcPart && !isSrc && B.canFuse(srcPart, p);
      const over = !!hv?.ref && sameRef(hv.ref, ref) && !isSrc;
      c.classList.toggle('sel', !!this.sel && sameRef(this.sel, ref));
      c.classList.toggle('src', isSrc);
      c.classList.toggle('target', ok);
      c.classList.toggle('dim', !!srcPart && !!p && !isSrc && !ok);
      c.classList.toggle('target-empty', !!srcPart && !p);
      c.classList.toggle('hover-ok', over && (ok || !p));
      c.classList.toggle('hover-bad', over && !!p && !ok);
      const pv = ok ? B.mergePreview(s, src!, ref) : null;
      const text = pv ? `T${pv.tier}${pv.chain > 1 ? ` ×${pv.chain}` : ''}` : '';
      if ((c.dataset.pv ?? '') !== text) { if (text) c.dataset.pv = text; else delete c.dataset.pv; }
    }
    for (const f of ACTIVE_FAMILIES) {
      const slot = this.eqSlots[f];
      if (!slot) continue;
      const ok = !!srcPart && srcPart.f === f;
      slot.classList.toggle('target', ok);
      slot.classList.toggle('dim', !!srcPart && !ok);
      slot.classList.toggle('hover-ok', !!hv?.fit && hv.fit === f && ok);
      slot.classList.toggle('hover-bad', !!hv?.fit && hv.fit === f && !ok);
    }
    this.boardEl.classList.toggle('selecting', !!srcPart);
    this.trayEl.classList.toggle('selecting', !!srcPart);
    this.pressEl.classList.toggle('target', !!srcPart);
    this.pressEl.classList.toggle('hover-ok', !!hv?.ref && sameRef(hv.ref, PRESS));
    // first-merge coaching: pulse the starter pair
    if (!s.stats.milestones.firstMerge && !srcPart) {
      const pair = this.findPair();
      if (pair) for (const r of pair) this.cellFor(r)?.firstElementChild?.classList.add('pop');
    }
  }

  /** The coach mark for the current tutorial step (the step itself is decided in core/tutorial.ts). */
  private coachStep(): CoachStep | null {
    const s = this.s;
    if (!this.visible || this.app.busy || this.app.intro || this.drag) return null;
    const step = tutorialStep(s);
    if (!step) return null;
    const cell = (r: SlotRef) => this.cellFor(r)!;
    const pairOf = (f?: string): [SlotRef, SlotRef] | null => {
      const refs: SlotRef[] = [...s.board.map((_, i) => ({ zone: 'board' as const, i })), ...s.tray.map((_, i) => ({ zone: 'tray' as const, i }))];
      for (let x = 0; x < refs.length; x++) for (let y = x + 1; y < refs.length; y++) {
        const pa = B.getPart(s, refs[x]);
        if (pa && (!f || pa.f === f) && B.canFuse(pa, B.getPart(s, refs[y]))) return [refs[x], refs[y]];
      }
      return null;
    };
    const car = carById(s.activeCar);
    const g = P.goalStatus(s);
    switch (step) {
      case 'merge': {
        const pair = (pairOf('engine') ?? pairOf())!;
        const fam = FAMILIES[B.getPart(s, pair[0])!.f];
        return { id: step, targets: pair.map(cell), text: `Drag one ${fam.name} onto the other to merge them — or tap one, then the other.` };
      }
      case 'race1':
        return { id: step, targets: [this.raceBtn], text: `Race ${P.recommendedEvent(s).name} next — your ${car.model} can win it, and every live race comes with a free crew nitro.` };
      case 'craftGoal': {
        const fam = FAMILIES[g!.family];
        return { id: step, targets: pairOf(g!.family)!.map(cell), ack: true, text: `Merge your ${fam.plural}: crafting a T${g!.tier} ${fam.name} is one of the two things the ${g!.car.model} needs.` };
      }
      case 'shop':
        return { id: step, targets: [this.shopBtn], ack: true, text: `You have $${s.cash}. In the Shop, you can order a known ${FAMILIES[g!.family].name} part toward the ${g!.car.model} (T1 from $${PART_ORDER_PRICE[1]}), and upgrades speed up your garage.` };
      case 'goalCard':
        return { id: step, targets: [this.goal.el], ack: true, text: 'This is your next car. Tap it any time to see exactly what is left and where to earn it.' };
      case 'nitroBank': {
        const chip = this.raceBtn.querySelector('.nitro-badge');
        return chip ? { id: step, targets: [chip], ack: true, text: 'You banked nitro (shown on the Race button): three quick merges in a row add a charge. Banked charges add to your free crew nitro in live races.' } : null;
      }
      case 'overflow':
        return { id: step, targets: [this.trayEl], ack: true, text: 'The spare rack holds parts when the bench is full. Drag them back onto the bench or onto a match any time.' };
      case 'scrap':
        return { id: step, targets: [this.pressEl], ack: true, text: 'Bench full: merge a pair, or drop a spare part here to scrap it. Scrap orders the exact part you pick in the Shop.' };
      case 'mergeAll':
        return { id: step, targets: [this.mergeAllBtn], ack: true, text: 'Merge All is unlocked: one tap merges every pair on the bench. Quick manual merges still bank nitro.' };
      case 'cap':
        return { id: step, targets: [this.equipEl], ack: true, text: `Parts above the ${car.model}'s T${car.cap} cap still fit but run at T${car.cap}. Your next car gets their full power.` };
    }
    return null;
  }

  private findPair(): [SlotRef, SlotRef] | null {
    const s = this.s;
    for (let i = 0; i < s.board.length; i++) for (let j = i + 1; j < s.board.length; j++) {
      if (B.canFuse(s.board[i], s.board[j]) && s.board[i]!.f === 'engine') return [{ zone: 'board', i }, { zone: 'board', i: j }];
    }
    return null;
  }

  /** The car's slots: each shows what is fitted, and flags an empty slot or a better part waiting on the bench. */
  private renderEquip(lo: ReturnType<typeof computeLoadout>) {
    const s = this.s;
    const cls = carById(s.activeCar);
    const rec = I.recommendedFit(s, s.activeCar);
    const kids: HTMLElement[] = [];
    for (const f of ACTIVE_FAMILIES) {
      const p = lo.equipped[f];
      const r = rec[f];
      const fromBench = !!r && 'at' in r;
      const state = !p ? 'empty' : fromBench ? 'better' : 'ok';
      const fam = FAMILIES[f];
      const label = p
        ? `${fam.name} slot: T${p.t}${p.q !== 'std' ? ` ${qualityName(p.q)}` : ''} fitted${lo.blocked[f] ? `, runs at T${cls.cap}` : ''}${fromBench ? `. A T${r!.part.t} on the bench is better` : ''}. Tap to fit parts`
        : `${fam.name} slot empty${r ? `. A T${r.part.t} is ready to fit` : ''}. Tap to fit parts`;
      const key = `${f}|${p ? `${p.id}:${p.t}:${p.q}` : '-'}|${state}|${r?.part.id ?? ''}|${lo.blocked[f] ? 1 : 0}`;
      let slot = this.eqSlots[f];
      if (!slot || slot.dataset.k !== key) {
        slot = h('button', { class: `eq ${state}${lo.blocked[f] ? ' capped' : ''}`, 'data-fit': f, 'data-k': key, 'aria-label': label },
          h('span', { class: 'eqart', html: p ? partTileHtml(p.f, p.t, p.q, 'mini') : `<span class="eqempty">${familyIcon(f)}</span>` }),
          h('span', { class: 'eqt' }, h('b', {}, p ? `T${p.t}` : 'Empty'), h('span', { class: 'eqn' }, fam.name)),
          state === 'better' ? h('span', { class: 'eqbadge up', 'aria-hidden': 'true' }, `↑T${r!.part.t}`)
            : state === 'empty' && r ? h('span', { class: 'eqbadge add', 'aria-hidden': 'true' }, `+T${r.part.t}`) : null);
        this.eqSlots[f] = slot;
      }
      kids.push(slot);
    }
    if (kids.some((k, i) => this.equipEl.children[i] !== k) || this.equipEl.children.length !== kids.length) this.equipEl.replaceChildren(...kids);
    const blocked = (Object.keys(lo.blocked) as Family[])[0];
    this.capEl.textContent = blocked ? `Your T${lo.blocked[blocked]!.t} ${FAMILIES[blocked].name} runs at T${cls.cap} on the ${cls.model} (its cap). The next car gets the full part.` : '';
    this.capEl.style.display = blocked ? '' : 'none';
  }

  renderActions() {
    const s = this.s;
    const n = s.crates.length;
    const printerCrates = s.crates.filter((c) => c.source === 'printer').length;
    const paused = printerCrates >= P.PRINTER_BANK_CAP;
    const full = B.freeSlots(s) === 0 && !!s.stats.milestones.firstMerge;
    if (full) {
      // A full bench turns the crate button into the recovery action, so it is always in reach.
      const rec = this.recovery();
      this.cratesBtn.replaceChildren(...[icon(rec?.icon ?? 'crate'), h('span', { class: 'tl' }, rec ? rec.short : 'Full'), n ? h('span', { class: 'count num' }, String(n)) : null].filter((x): x is HTMLElement => !!x));
      this.cratesBtn.setAttribute('aria-label', rec?.aria ?? 'Board full');
      this.cratesBtn.classList.add('pulse');
    } else {
      this.cratesBtn.replaceChildren(...[icon('crate'), h('span', { class: 'tl' }, 'Crates'),
        n ? h('span', { class: `count num${paused ? ' full' : ''}` }, String(n)) : null,
        h('span', { class: 'printer' }, this.printerBar)].filter((x): x is HTMLElement => !!x));
      this.cratesBtn.setAttribute('aria-label', `Crates: ${n} waiting${paused ? ', printer paused until you open some' : ''}`);
      this.cratesBtn.classList.toggle('pulse', n > 0 && B.freeSlots(s) > 0);
    }
    this.updatePrinter();
    const unlocked = P.mergeAllUnlocked(s);
    const racesLeft = Math.max(0, MERGE_ALL_UNLOCK_RACES - s.stats.races);
    const hasPair = unlocked && B.hasAnyPair(s);
    this.mergeAllBtn.replaceChildren(...[icon(unlocked ? 'merge' : 'lock'), h('span', { class: 'tl' }, 'Merge all'), hasPair ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null].filter((x): x is HTMLElement => !!x));
    this.mergeAllBtn.classList.toggle('off', !hasPair);
    this.mergeAllBtn.setAttribute('aria-label', unlocked ? `Merge All: ${hasPair ? 'pairs ready' : 'no pairs on the bench'}` : `Merge All unlocks after ${racesLeft} more finishes`);
    this.mergeAllBtn.title = unlocked ? '' : `Opens in ${racesLeft} race${racesLeft === 1 ? '' : 's'}`;
    const open = B.freeSlots(s);
    this.benchStatus.textContent = open ? `${open} free` : 'Full';
    this.benchStatus.parentElement?.classList.toggle('full', !open);
    const q = s.pendingQuick;
    if (q) {
      const left2 = Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000));
      this.raceBtn.replaceChildren(icon('flag'), h('span', { class: 'stack' }, 'Crew racing', h('small', {}, `${eventById(q.eventId).name} · ${left2} s`)));
    } else {
      const ev = P.recommendedEvent(s);
      this.raceBtn.replaceChildren(icon('flag'), h('span', { class: 'stack' }, 'Race', h('small', {}, ev.name)));
    }
    // banked nitro rides on the Race button: it is spent in races
    const cap = nitroCapFor(s.upgrades.nitroTank);
    this.raceBtn.append(h('span', { class: `nitro-badge${s.nitro ? ' on' : ''}`, 'aria-hidden': 'true' }, icon('nitro'), String(s.nitro)));
    this.raceBtn.setAttribute('aria-label', `${q ? `Crew racing ${eventById(q.eventId).name}` : `Race ${P.recommendedEvent(s).name}`}. Nitro banked ${s.nitro} of ${cap}`);
  }

  updatePrinter() {
    const s = this.s;
    const frac = Math.min(1, s.printerS / P.printerInterval(s));
    this.printerBar.style.width = `${Math.round(frac * 100)}%`;
  }

  /** Bench parts that would make the active car faster, and what fitting them all would change. */
  private benchUpgrade() {
    const s = this.s;
    const rec = I.recommendedFit(s, s.activeCar);
    const picks = ACTIVE_FAMILIES.map((f) => rec[f]).filter((r): r is { at: SlotRef; part: Part } => !!r && 'at' in r);
    if (!picks.length) return null;
    const over: Partial<Record<Family, Part>> = {};
    for (const r of picks) over[r.part.f] = r.part;
    const bits = statDelta(computeLoadout(s).stats, loadoutWith(s, s.activeCar, over).stats);
    return { picks, bits };
  }

  private fitBenchUpgrades() {
    const s = this.s;
    const up = this.benchUpgrade();
    if (!up) return;
    const car = s.activeCar;
    const ids = up.picks.map((r) => r.part.id);
    this.app.game.input();
    this.app.game.transact((d) => ids.flatMap((id) => {
      const loc = I.locatePart(d, id);
      return loc && 'at' in loc ? I.installPart(d, car, loc.at) : [];
    }));
  }

  /** Board full: the one action that makes room, best first — merge a pair, recycle the parts nothing needs, or
   *  scrap the least useful part. */
  private recovery(): { label: string; short: string; icon: IconName; aria: string; run: () => void } | null {
    const s = this.s;
    const pair = this.anyPair();
    if (pair) return { label: 'Merge pair', short: 'Merge', icon: 'merge', aria: 'Board full: show a pair to merge', run: () => { const p2 = this.anyPair(); if (p2) { this.setSel(p2[0]); this.cellFor(p2[1])?.firstElementChild?.classList.add('pop'); } } };
    const unused = P.spareParts(s).filter((u) => u.verdict === 'recycle' && !u.starred);
    if (unused.length) {
      const scrap = unused.reduce((a, u) => a + u.scrap, 0);
      return { label: `Recycle ${unused.length} unused (+${scrap})`, short: `Recycle ${unused.length}`, icon: 'recycle', aria: `Board full: recycle ${unused.length} parts nothing needs for ${scrap} scrap`, run: () => {
        const ids = P.spareParts(this.s).filter((u) => u.verdict === 'recycle' && !u.starred).map((u) => u.part.id);
        const ev = this.app.game.recycleParts(ids);
        if (ev.some((e) => e.type === 'scrap')) { sfx.scrap(); this.app.toast(`Recycled ${ids.length} unused part${ids.length === 1 ? '' : 's'} · +${scrap} scrap`); }
      } };
    }
    // a part above the car's cap has a home on the Parts Shelf: store it before scrapping anything
    if (canStore(this.app.game)) {
      const refs: SlotRef[] = [...s.tray.map((_, i) => ({ zone: 'tray' as const, i })), ...s.board.map((_, i) => ({ zone: 'board' as const, i }))];
      const at = refs.find((r) => { const p = B.getPart(s, r); return !!p && isOverCap(s, p); });
      const op = at ? B.getPart(s, at) : null;
      if (at && op) return { label: `Store T${op.t} ${FAMILIES[op.f].name}`, short: `Store T${op.t}`, icon: 'store', aria: `Board full: store the T${op.t} ${FAMILIES[op.f].name} on the Parts Shelf`, run: () => storePart(this.app.game, at) };
    }
    const junk = this.lowestScrap();
    const jp = junk ? B.getPart(s, junk) : null;
    if (junk && jp) return { label: `Scrap T${jp.t} ${FAMILIES[jp.f].name} (+${B.scrapValue(jp)})`, short: `Scrap T${jp.t}`, icon: 'recycle', aria: `Board full: scrap a T${jp.t} ${FAMILIES[jp.f].name}`, run: () => { const j = this.lowestScrap(); if (j) this.requestScrap(j); } };
    return null;
  }

  /** Your car's tile: the car, or — when better parts wait on the bench — one tap to fit them all. */
  private renderCarTile() {
    const s = this.s;
    const up = !this.sel && !this.drag && s.stats.milestones.firstMerge && !(B.freeSlots(s) === 0) ? this.benchUpgrade() : null;
    const one = up && up.picks.length === 1 ? up.picks[0].part : null;
    const model = carById(s.activeCar).model;
    this.carBtn.classList.toggle('fitnow', !!up);
    if (up) {
      const label = one ? `Fit T${one.t} ${FAMILIES[one.f].name}` : `Fit ${up.picks.length} better parts`;
      this.carName.textContent = one ? `↑ Fit T${one.t}` : `↑ Fit ${up.picks.length}`;
      this.carBtn.setAttribute('aria-label', `${label} to your ${model}${up.bits.length ? `: ${up.bits.join(', ')}` : ''}`);
      this.carBtn.title = `${label}${up.bits.length ? ` · ${up.bits.join(' · ')}` : ''}`;
    } else {
      this.carName.textContent = model;
      this.carBtn.title = '';
    }
  }

  private renderHint() {
    const s = this.s;
    let t = '';
    this.renderCarTile();
    if (B.freeSlots(s) === 0 && s.stats.milestones.firstMerge) {
      // full bench: offer the recovery action itself, not just advice
      const rec = this.recovery();
      const label = rec ? `Board full · ${rec.label}` : 'Board full';
      if (this.hintEl.dataset.k !== label) {
        this.hintEl.dataset.k = label;
        requestAnimationFrame(() => this.visible && this.layout()); // re-fit the board now the recovery button takes space
        this.hintEl.replaceChildren(h('button', { class: 'btn sm recover', 'aria-label': rec?.aria ?? 'Board full', onclick: () => this.recovery()?.run() }, label));
      }
      this.raceBtn.classList.remove('pulse');
      return;
    }
    if (this.hintEl.dataset.k) { delete this.hintEl.dataset.k; this.hintEl.textContent = ''; requestAnimationFrame(() => this.visible && this.layout()); }
    if (this.drag?.ghost) return; // the drag hint is live
    if (Date.now() < this.refuseUntil && !this.sel) return; // keep a refusal's reason readable for a moment
    this.hintEl.classList.remove('bad');
    // the first session's coach says what to do; once it is skipped or over, the hint line does
    const coached = onboardActive(s);
    if (!s.stats.milestones.firstMerge) t = coached ? '' : 'Drag two matching parts together to merge them';
    else if (s.stats.races === 0 && !s.pendingRace) t = coached ? '' : 'Merged! Tap Race to earn cash and Rep';
    else if (this.sel && coached) t = '';
    else if (this.sel) {
      const part = B.getPart(s, this.sel);
      if (part) t = part.t >= MAX_TIER ? `T${part.t} ${FAMILIES[part.f].name}: top tier` : B.allParts(s).filter((q) => q.f === part.f && q.t === part.t).length > 1 ? `Craft a T${part.t + 1}: tap a glowing T${part.t}` : `T${part.t} ${FAMILIES[part.f].name} · no match on the bench yet`;
    } else if (s.nitro > 0 && !s.tips.nitro) t = 'Nitro ready · in a race, tap NITRO in a boost zone';
    if (this.hintEl.textContent !== t) this.hintEl.textContent = t;
    this.raceBtn.classList.toggle('pulse', !!s.stats.milestones.firstMerge && s.stats.races === 0);
  }

  private anyPair(): [SlotRef, SlotRef] | null {
    const s = this.s;
    const refs: SlotRef[] = [...s.board.map((_, i) => ({ zone: 'board' as const, i })), ...s.tray.map((_, i) => ({ zone: 'tray' as const, i }))];
    for (let a = 0; a < refs.length; a++) for (let b = a + 1; b < refs.length; b++) {
      if (B.canFuse(B.getPart(s, refs[a]), B.getPart(s, refs[b]))) return refs[a].zone === 'tray' ? [refs[a], refs[b]] : [refs[b], refs[a]];
    }
    return null;
  }

  /** Lowest-value part that would not upgrade a car and is not the current goal family. */
  private lowestScrap(): SlotRef | null {
    const s = this.s;
    const goal = P.goalStatus(s);
    let best: { r: SlotRef; v: number } | null = null;
    const refs: SlotRef[] = [...s.tray.map((_, i) => ({ zone: 'tray' as const, i })), ...s.board.map((_, i) => ({ zone: 'board' as const, i }))];
    for (const r of refs) {
      const p = B.getPart(s, r);
      if (!p) continue;
      const v = p.t * 10 + (goal && !goal.keystoneDone && p.f === goal.family ? 100 : 0) + (I.upgradesFor(s, p).length ? 1000 : 0);
      if (!best || v < best.v) best = { r, v };
    }
    return best?.r ?? null;
  }

  // ---------------- Events → animations ----------------
  /** Cancel queued merge sounds and floaters: the next action's feedback starts at once. */
  private flushFx() {
    for (const t of this.fx) clearTimeout(t);
    this.fx = [];
  }
  private later(fn: () => void, ms: number) {
    if (ms <= 0) { fn(); return; }
    const id = window.setTimeout(() => { this.fx = this.fx.filter((x) => x !== id); fn(); }, ms);
    this.fx.push(id);
  }

  onEvents(ev: GameEvent[]) {
    if (!this.visible) return;
    const anim = new Map<string, string[]>();
    const key = (r: SlotRef) => `${r.zone}:${r.i}`;
    const reduced = this.s.settings.reducedMotion;
    let delay = 0;
    let fuseCount = 0;
    let fits = 0;
    const FX_CAP = 6; // a batch merge plays at most this many merge sounds and floaters
    const batch = ev.some((e) => e.type === 'mergeAll');
    // one result line per merge site: where the merge started and what it ended as
    const sites = new Map<string, { at: SlotRef; f: Family; from: number; to: number; chain: number; rare: boolean }>();
    const flights: { html: string; from: DOMRect; to: DOMRect }[] = [];
    const sheetOpen = !!document.querySelector('.sheet-back');
    if (ev.some((e) => e.type === 'fuse')) this.flushFx();
    for (const e of ev) {
      if (e.type === 'fuse') {
        fuseCount++;
        const k = key(e.at);
        const site = sites.get(k);
        if (site) { site.to = e.tier; site.chain = e.chain; site.rare ||= e.q !== 'std'; }
        else sites.set(k, { at: e.at, f: e.family, from: e.fromTier, to: e.tier, chain: e.chain, rare: e.q !== 'std' });
        if (fuseCount > FX_CAP) { anim.set(k, ['pop']); continue; }
        const cls = ['pop', 'merged'];
        if (e.tier >= 5) cls.push('flash-high');
        if (e.q === 'mint') cls.push('flash-mint');
        if (e.q === 'polished') cls.push('flash-pol');
        anim.set(k, cls);
        const { chain, at, q, tier, skipped } = e;
        this.later(() => {
          gsfx.merge(tier, chain);
          if (chain > 1) { gsfx.cascade(chain); if (!batch) { this.chainEl?.remove(); this.chainEl = this.floater(at, `Cascade ×${chain}`, `mchain c${Math.min(chain, 5)}`, 1000, 30); } }
          // rare crafts get their own lane above the cascade counter; the latest one replaces the last
          if (q === 'mint') { gsfx.mint(); this.burst(at, 'gold'); this.rareEl?.remove(); this.rareEl = this.floater(at, skipped ? `★ MINT · jumped to T${tier}` : '★ MINT', 'gold', 1100, 58); }
          else if (q === 'polished') { gsfx.polished(); this.burst(at, 'silver'); this.rareEl?.remove(); this.rareEl = this.floater(at, '◆ Polished +15%', 'msilver', 1000, 58); }
        }, delay);
        delay += reduced ? 0 : 110;
      }
      if (e.type === 'place') anim.set(key(e.at), ['drop-in']);
      if (e.type === 'move') anim.set(key(e.to), ['drop-in']);
      if (e.type === 'scrap') { sfx.scrap(); this.floater(PRESS, `+${e.value} scrap`, ''); }
      if (e.type === 'nitro') { sfx.nitroBank(); this.floaterTop(`Nitro +1 (${e.total}/${nitroCapFor(this.s.upgrades.nitroTank)})`, 'blue'); }
      if (e.type === 'nitroFull') this.floaterTop(`Nitro full (${nitroCapFor(this.s.upgrades.nitroTank)}/${nitroCapFor(this.s.upgrades.nitroTank)})`, 'blue');
      if (e.type === 'combo' && e.count >= 2) this.floaterTop(`Combo ×${e.count}`, '');
      if (e.type === 'keystone') {
        const g = P.goalStatus(this.s);
        const car = P.nextCar(this.s);
        if (car?.unlock && car.unlock.family === e.family && car.unlock.tier === e.tier) {
          // the next car's part: the biggest Garage moment, so it gets its own sound, a flash and the goal card pulses
          sfx.keystone();
          this.goal.pulse();
          this.boardEl.classList.remove('keyhit'); void this.boardEl.offsetWidth; this.boardEl.classList.add('keyhit');
          this.floaterTop(`★ T${e.tier} ${FAMILIES[e.family].name} crafted`, 'gold');
          this.app.toast(g?.keystoneDone && this.s.rep < g.repNeed ? `T${e.tier} ${FAMILIES[e.family].name} crafted — the ${car.model}'s part is done. ${g.repNeed - this.s.rep} more Rep to unlock it` : `T${e.tier} ${FAMILIES[e.family].name} crafted for the ${car.model}`);
        }
      }
      // ---- Fit Parts: show where each part went
      if (e.type === 'install' && e.car === this.s.activeCar) {
        fits++;
        this.fitFam = fits === 1 ? e.family : null; // several at once: the plain stat summary
        const p = I.fitted(this.s, e.car)[e.family];
        const fromCell = this.cellFor(e.from);
        const slot = this.eqSlots[e.family];
        if (p && fromCell && slot && !sheetOpen) flights.push({ html: partTileHtml(p.f, p.t, p.q), from: fromCell.getBoundingClientRect(), to: slot.getBoundingClientRect() });
        gsfx.fit(p?.t ?? 1);
        if (e.outgoingId) {
          anim.set(key(e.from), ['land']);
          const out = B.getPart(this.s, e.from);
          if (out) this.later(() => this.floater(e.from, `T${out.t} off the car`, 'msilver'), reduced ? 0 : 380);
        }
      }
      if (e.type === 'uninstall') {
        anim.set(key(e.to), ['land']);
        const slot = this.eqSlots[e.family];
        const cell = this.cellFor(e.to);
        const p = B.getPart(this.s, e.to);
        if (p && slot && cell && e.car === this.s.activeCar && !sheetOpen) flights.push({ html: partTileHtml(p.f, p.t, p.q), from: slot.getBoundingClientRect(), to: cell.getBoundingClientRect() });
        gsfx.unfit();
        this.later(() => this.floater(e.to, 'Off the car', 'msilver'), reduced ? 0 : 380);
      }
      if (e.type === 'move-fit') gsfx.fit();
      if (e.type === 'crateBlocked') this.app.toast('Board full. Merge a pair or scrap a part.');
      if (e.type === 'catchup') this.app.toast(`A ${FAMILIES[e.family].name} crate arrived to help with your goal`);
      if (e.type === 'mergeAll') this.app.toast(e.fusions ? `Merge All: ${e.fusions} merge${e.fusions === 1 ? '' : 's'}${e.longest >= 3 ? ` · best chain ×${e.longest}` : ''}` : 'Nothing to merge');
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
    // what changed: "T3 Engine → T4 Engine" (single merges and cascades; Merge All reports a total instead)
    if (!batch) {
      for (const site of sites.values()) {
        const name = FAMILIES[site.f].name;
        // the merged part would make the car faster: say how much, in its own stat, right on the result
        this.later(() => {
          // (worked out here, after the merge has painted, never on the input path)
          const made = B.getPart(this.s, site.at);
          const ch = made && I.upgradesFor(this.s, made).includes(this.s.activeCar) ? fitChange(this.s, this.s.activeCar, made) : null;
          this.chainEl?.remove(); // the result line takes over from the cascade counter
          this.floater(site.at, `T${site.from} ${name} → T${site.to}${site.chain > 1 ? ` · ×${site.chain}` : ''}${ch?.up ? ` · fit: ${ch.short}` : ''}`, `mres${site.to >= 5 ? ' high' : ''}`, ch?.up ? 1800 : 1300, 22);
        }, reduced ? 0 : Math.min(delay + 120, 620));
        if (site.chain >= 3) {
          this.later(() => { gsfx.cascadeEnd(site.chain); if (!reduced) { this.boardEl.classList.remove('quake'); void this.boardEl.offsetWidth; this.boardEl.classList.add('quake'); } }, Math.min(delay, 500));
        }
      }
    }
    const placed = ev.filter((e) => e.type === 'place').length;
    if (placed && !ev.some((e) => e.type === 'fuse')) sfx.place();
    if (fuseCount > FX_CAP) this.floaterTop(`+${fuseCount - FX_CAP} more merges`, '');
    this.render(anim);
    if (!reduced) for (const f of flights) this.fly(f.html, f.from, f.to);
    // a new part above the car's cap (a crate or a merge): offer to store it right there
    const fresh = [...sites.values()].map((x) => x.at).concat(ev.filter((e): e is Extract<GameEvent, { type: 'place' }> => e.type === 'place').map((e) => e.at));
    // (not for the next car's own part, nor during the first session: its keystone toast and coach say what it is for)
    if (!ev.some((e) => e.type === 'keystone') && !onboardActive(this.s)) this.offerStore(fresh);
    // first session: the part just made is the one to fit, so pick it up (its Fit button is one tap away)
    if (!batch && sites.size && onboardStep(this.s) === 'fit') {
      const fp = onboardFitPart(this.s);
      const at = [...sites.values()].map((x) => x.at).find((r) => B.getPart(this.s, r)?.id === fp?.id);
      if (at) this.setSel(at);
    }
  }

  private storeOffered = new Set<number | string>();
  private offerStore(refs: SlotRef[]) {
    const game = this.app.game;
    if (!refs.length || !canStore(game) || document.querySelector('.sheet-back')) return;
    const s = this.s;
    for (const at of refs) {
      const p = B.getPart(s, at);
      if (!p || this.storeOffered.has(p.id) || !isOverCap(s, p)) continue;
      this.storeOffered.add(p.id);
      const car = carById(s.activeCar);
      const later = earliestCarFor(p);
      this.app.toast(`T${p.t} ${FAMILIES[p.f].name}: above the ${car.model}'s T${car.cap} cap${later ? ` · full power in the ${later}` : ''}`, {
        label: 'Store', run: () => { const loc = I.locatePart(game.state, p.id); if (loc && 'at' in loc) storePart(game, loc.at); },
      }, 5000);
      return;
    }
  }

  /** The live "Cascade ×n" label: each link replaces the last, so a chain counts up in one place. */
  private chainEl: HTMLElement | null = null;
  private rareEl: HTMLElement | null = null;
  /**
   * Floating labels and bursts are positioned in one batch on the next frame: every rect is read first, then every
   * element is placed, so a merge never forces a layout of its own in the middle of the tap (reads interleaved with
   * writes used to cost several layouts per merge on a slow phone).
   */
  private fxq: (() => (() => void) | null)[] = [];
  private fxRaf = 0;
  private place(read: () => (() => void) | null) {
    this.fxq.push(read);
    if (!this.fxRaf) this.fxRaf = requestAnimationFrame(() => {
      this.fxRaf = 0;
      const q = this.fxq; this.fxq = [];
      const host = this.el.getBoundingClientRect();
      this.hostRect = host;
      const writes = q.map((fn) => fn());
      for (const w of writes) w?.();
    });
  }
  private hostRect: DOMRect | null = null;
  floater(at: SlotRef, text: string, cls: string, ms = 1000, dy = 4): HTMLElement | null {
    const c = this.cellFor(at);
    if (!c) return null;
    const f = h('div', { class: `floater ${cls}` }, text);
    this.place(() => {
      const r = c.getBoundingClientRect();
      const host = this.hostRect!;
      // keep the label inside the view on edge cells
      const x = Math.max(70, Math.min(host.width - 70, r.left - host.left + r.width / 2));
      return () => {
        f.style.left = `${x}px`;
        f.style.top = `${r.top - host.top - dy}px`;
        this.el.append(f);
        setTimeout(() => f.remove(), ms);
      };
    });
    return f;
  }
  /** Board-level messages (combo, nitro, keystone): live ones stack downward instead of overprinting. */
  private topFloaters: HTMLElement[] = [];
  floaterTop(text: string, cls: string) {
    const f = h('div', { class: `floater ${cls}` }, text);
    this.place(() => {
      const r = this.boardEl.getBoundingClientRect();
      const host = this.hostRect!;
      this.topFloaters = this.topFloaters.filter((x) => x.isConnected || x.dataset.q === '1');
      const n = this.topFloaters.length;
      f.dataset.q = '1';
      this.topFloaters.push(f);
      return () => {
        delete f.dataset.q;
        f.style.left = `${r.left - host.left + r.width / 2}px`;
        f.style.top = `${r.top - host.top + 6 + n * 26}px`;
        this.el.append(f);
        setTimeout(() => f.remove(), 1000);
      };
    });
  }
  /** A ring of light from a cell: Polished (silver) and Mint (gold) crafts. */
  private burst(at: SlotRef, kind: 'gold' | 'silver') {
    if (this.s.settings.reducedMotion) return;
    const c = this.cellFor(at);
    if (!c) return;
    this.place(() => {
      const r = c.getBoundingClientRect();
      const host = this.hostRect!;
      return () => {
        const b = h('div', { class: `mburst ${kind}` });
        b.style.left = `${r.left - host.left + r.width / 2}px`;
        b.style.top = `${r.top - host.top + r.height / 2}px`;
        b.style.setProperty('--sz', `${r.width}px`);
        this.el.append(b);
        setTimeout(() => b.remove(), 800);
      };
    });
  }
  /** A part tile flying between a cell and a car slot, so the player sees where it went. */
  private fly(html: string, from: DOMRect, to: DOMRect) {
    const f = h('div', { class: 'flyer', html });
    f.style.left = `${from.left}px`;
    f.style.top = `${from.top}px`;
    f.style.width = `${from.width}px`;
    f.style.height = `${from.height}px`;
    document.body.append(f);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const k = Math.max(0.35, Math.min(1.4, Math.min(to.width, to.height) / from.width));
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`; f.style.opacity = '.2'; }));
    setTimeout(() => f.remove(), 480);
  }

  // ---------------- Input: pointer ----------------
  private refFromEl(el: Element | null): SlotRef | null {
    const c = el?.closest('[data-zone],[data-press]') as HTMLElement | null;
    if (!c) return null;
    if (c.dataset.press) return PRESS;
    return { zone: c.dataset.zone as 'board' | 'tray', i: Number(c.dataset.i) };
  }
  private fitFromEl(el: Element | null): Family | null {
    const c = el?.closest('[data-fit]') as HTMLElement | null;
    return c ? (c.dataset.fit as Family) : null;
  }

  private bindPointer() {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ref = this.refFromEl(e.target as Element);
      if (!ref || sameRef(ref, PRESS)) return;
      const p = B.getPart(this.s, ref);
      if (!p) return; // taps on empty cells are handled by click
      this.flushFx();
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
        gsfx.pick(B.getPart(this.s, d.from)?.t);
        this.setSel(null);
        this.renderHighlights();
      }
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      this.trackHover(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (d.ghost) {
        d.ghost.remove();
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = this.refFromEl(under);
        const fit = this.fitFromEl(under);
        this.hover = null;
        this.cellFor(d.from)?.firstElementChild?.classList.remove('dragging');
        if (fit) this.fitTo(d.from, fit);
        else if (target && sameRef(target, PRESS)) this.requestScrap(d.from);
        else if (target && !sameRef(target, d.from)) this.tryMove(d.from, target);
        else { this.renderHighlights(); this.renderHint(); } // dropped back or off the board: returns cleanly
      } else {
        // a tap on a part: handled here because pointer capture retargets the mouse click to the board
        this.lastTapAt = performance.now();
        this.onTap(d.from);
      }
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 0);
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
        if (!ref) return;
        // pointer taps on parts were handled on pointerup; clicks here are empty cells and the keyboard (detail 0)
        if ((e as MouseEvent).detail > 0 && B.getPart(this.s, ref) && this.lastTapAt > performance.now() - 800) return;
        this.onTap(ref);
      });
      zone.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  private suppressClick = false;
  private lastTapAt = -1e9;

  /** While dragging: light the cell or slot under the finger and say what a drop there would do. */
  private trackHover(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const under = document.elementFromPoint(x, y);
    const fit = this.fitFromEl(under);
    const ref = fit ? null : this.refFromEl(under);
    const prev = this.hover;
    const same = prev && prev.fit === (fit ?? undefined) && ((!prev.ref && !ref) || (!!prev.ref && !!ref && sameRef(prev.ref, ref)));
    if (same) return;
    this.hover = fit || ref ? { fit: fit ?? undefined, ref: ref ?? undefined } : null;
    this.renderHighlights();
    const s = this.s;
    const a = B.getPart(s, d.from)!;
    let msg = '';
    if (fit) {
      const cur = I.fitted(s, s.activeCar)[fit];
      msg = a.f !== fit ? `${FAMILIES[a.f].name} parts go in the ${FAMILIES[a.f].name} slot` : `Drop to fit it to the ${carById(s.activeCar).model}${cur ? ` · your T${cur.t} comes back here` : ''}`;
      if (a.f === fit) gsfx.hover();
    } else if (ref && sameRef(ref, PRESS)) msg = `Drop to scrap for ${B.scrapValue(a)} scrap`;
    else if (ref && !sameRef(ref, d.from)) {
      const b = B.getPart(s, ref);
      if (!b) msg = 'Drop to move here';
      else {
        const pv = B.mergePreview(s, d.from, ref);
        if (pv) { msg = `Drop: T${pv.fromTier} → T${pv.tier} ${FAMILIES[pv.family].name}${pv.chain > 1 ? ` · cascade ×${pv.chain}` : ''}`; gsfx.hover(); }
        else msg = B.mergeBlocker(a, b) ?? '';
      }
    }
    this.hintEl.dataset.k = '';
    this.hintEl.textContent = msg;
    this.hintEl.classList.toggle('bad', !!fit && a.f !== fit || (!!ref && !sameRef(ref, PRESS) && !!B.getPart(s, ref) && !B.canFuse(a, B.getPart(s, ref)) && !sameRef(ref, d.from)));
  }

  private cancelDrag() {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.cellFor(this.drag.from)?.firstElementChild?.classList.remove('dragging');
    this.drag = null;
    this.hover = null;
    this.hintEl.classList.remove('bad');
    this.renderHighlights();
    this.renderHint();
  }

  private onTap(ref: SlotRef) {
    const p = B.getPart(this.s, ref);
    if (!this.sel) {
      if (p) { this.flushFx(); gsfx.pick(p.t); this.setSel(ref); }
      return;
    }
    if (sameRef(this.sel, ref)) return this.setSel(null);
    const from = this.sel;
    const target = B.getPart(this.s, ref);
    const src = B.getPart(this.s, from);
    if (target && src && !B.canFuse(src, target)) {
      gsfx.pick(target.t);
      this.setSel(ref); // tapping a non-matching part switches selection
      return;
    }
    this.setSel(null);
    this.tryMove(from, ref);
  }

  private onPressTap() {
    if (this.sel) {
      const from = this.sel;
      this.setSel(null);
      this.requestScrap(from);
    } else openSpares(this.app); // nothing selected: the Keep / Recycle list (what each spare is for, its scrap)
  }

  private setSel(r: SlotRef | null) {
    this.sel = r;
    this.hintEl.classList.remove('bad');
    this.renderHighlights();
    this.renderHint();
    this.renderSelBar();
  }

  /** Fit · Store · Recycle for the picked-up part, in the action bar under the thumb (Race stays on the right). */
  private selKey = '';
  private renderSelBar() {
    const s = this.s;
    const p = this.sel ? B.getPart(s, this.sel) : null;
    this.actionsEl.classList.toggle('sel-on', !!p);
    if (!p || !this.sel) { this.selKey = ''; return; }
    const ref = this.sel;
    const car = carById(s.activeCar);
    const over = isOverCap(s, p);
    const store = canStore(this.app.game);
    const key = [p.id, p.t, over, store, s.activeCar].join('|');
    if (key === this.selKey) return;
    this.selKey = key;
    const fam = FAMILIES[p.f];
    const btn = (cls: string, main: string, sub: string, aria: string, run: () => void) =>
      h('button', { class: `btn tool ${cls}`, 'aria-label': aria, onclick: () => { this.app.game.input(); run(); } },
        icon(({ 'sel-fit': 'fit', 'sel-store': 'store', 'sel-cancel': 'close', 'sel-recycle': 'recycle', 'sel-test': 'test' } as Record<string, IconName>)[cls.split(' ')[0]] ?? 'check'),
        h('span', { class: 'tl' }, main), h('small', {}, sub));
    const later = over ? earliestCarFor(p) : null;
    this.selBar.replaceChildren(
      btn('sel-fit', 'Fit', over ? `runs T${car.cap}` : `to ${car.model.split(' ')[0]}`, `Fit the T${p.t} ${fam.name} to your ${car.model}${over ? `: it runs at T${car.cap}, the car's cap` : ''}`, () => this.fitTo(ref, p.f)),
      store
        ? btn(`sel-store${over ? ' hot' : ''}`, 'Store', later ? `for ${later.split(' ')[0]}` : 'Parts Shelf', `Store the T${p.t} ${fam.name} on the Parts Shelf${later ? ` for the ${later}` : ''}`, () => { this.setSel(null); this.flushFx(); storePart(this.app.game, ref); })
        : btn('sel-cancel', 'Done', 'put it down', 'Put the part down', () => this.setSel(null)),
      btn('sel-recycle', 'Recycle', `+${B.scrapValue(p)} scrap`, `Recycle the T${p.t} ${fam.name} for ${B.scrapValue(p)} scrap`, () => { this.setSel(null); this.requestScrap(ref); }),
      // 1.10 Test & Compare: race this part against the current build before committing to it
      btn('sel-test', 'Test', 'vs now', `Test the T${p.t} ${fam.name} on track against your ${car.model}'s current build`, () => { this.setSel(null); openTestDrive(this.app, { car: this.s.activeCar, partId: p.id }); }),
    );
  }

  /** Show a mergeable pair (the goal's, when given): the first part is picked up and its match pulses. */
  showPair(family?: string, tier?: number): boolean {
    const pair = findPair(this.s, family, tier);
    if (!pair) return false;
    this.setSel(pair[0]);
    this.cellFor(pair[1])?.firstElementChild?.classList.add('pop');
    this.cellFor(pair[0])?.scrollIntoView?.({ block: 'nearest' });
    return true;
  }

  /** Move or merge; a drop on a part that doesn't match is refused right here with the reason, nothing changes. */
  private tryMove(from: SlotRef, to: SlotRef) {
    const a = B.getPart(this.s, from);
    const b = B.getPart(this.s, to);
    const why = B.mergeBlocker(a, b);
    if (why) { this.refuse(to, why); return; }
    this.flushFx();
    this.app.game.move(from, to);
  }

  /** Clear invalid-drop feedback: the target shakes red, a low buzz, and the reason in the hint line. */
  private refuse(at: SlotRef | Family, why: string) {
    gsfx.invalid();
    const el = typeof at === 'string' ? this.eqSlots[at] : this.cellFor(at);
    if (el) { el.classList.remove('refuse'); void el.offsetWidth; el.classList.add('refuse'); setTimeout(() => el.classList.remove('refuse'), 450); }
    this.renderHighlights();
    delete this.hintEl.dataset.k;
    this.hintEl.textContent = why;
    this.hintEl.classList.add('bad');
    // short phones hide the hint row (the board needs the height): the reason shows as a toast instead
    if (window.matchMedia?.('(max-height: 700px)').matches) this.app.toast(why, undefined, 2200);
    this.refuseUntil = Date.now() + 2500;
  }
  private refuseUntil = 0;

  /** Fit a bench part to the active car's slot (swapping out what was there). */
  private fitTo(from: SlotRef, family: Family) {
    const p = B.getPart(this.s, from);
    if (!p) return;
    if (p.f !== family) { this.refuse(family, `That's a ${FAMILIES[p.f].name} — it goes in the ${FAMILIES[p.f].name} slot`); return; }
    this.setSel(null);
    this.flushFx();
    this.app.game.installPart(this.s.activeCar, from);
  }

  // ---------------- Equipment strip ----------------
  private bindStrip() {
    this.equipEl.addEventListener('click', (e) => {
      const f = this.fitFromEl(e.target as Element);
      if (!f) return;
      if (this.sel) { const from = this.sel; this.fitTo(from, f); return; }
      openFitParts(this.app, this.s.activeCar, f);
    });
  }

  requestScrap(ref: SlotRef) {
    const p = B.getPart(this.s, ref);
    if (!p) return;
    const ups = I.upgradesFor(this.s, p);
    const value = B.scrapValue(p);
    if (!ups.length && p.t < 3) {
      this.app.game.scrap(ref);
      return;
    }
    this.app.sheet((close) => {
      const fam = FAMILIES[p.f];
      const car = ups[0] ? carById(ups[0]) : null;
      const gain = ups[0] ? statDelta(computeLoadout(this.s, ups[0]).stats, loadoutWith(this.s, ups[0], { [p.f]: p }).stats) : [];
      return h('div', {},
        h('h2', {}, `Scrap T${p.t} ${fam.name}?`),
        car
          ? h('p', {}, `It's better than the ${fam.name} fitted to your ${car.model}`, gain.length ? ` (${gain.join(', ')})` : '', '. Fit it instead, or scrap it for ', h('b', {}, `${value} scrap`), '.')
          : h('p', {}, `You'll get ${value} scrap. Spend scrap in the Shop's Scrap tab: order a chosen part or polish one.`),
        h('div', { class: 'fams' },
          car ? h('button', { class: 'btn', onclick: () => { close(); this.app.game.installPart(ups[0], ref); } }, `Fit to ${car.model}`) : h('button', { class: 'btn', onclick: close }, 'Keep it'),
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
        el.focus({ preventScroll: true });
        return;
      }
      if (e.key === 'Escape') { this.setSel(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x') && !sameRef(ref, PRESS)) {
        e.preventDefault();
        this.setSel(null);
        this.requestScrap(ref);
      }
      // f: fit the focused part to the active car
      if (e.key === 'f' && !sameRef(ref, PRESS)) {
        const p = B.getPart(s, ref);
        if (p) this.fitTo(ref, p.f);
      }
      if (e.key === 'r') this.onRace();
      if (e.key === 'c') this.onCrates();
    });
  }

  // ---------------- Actions ----------------

  private onCrates() {
    const s = this.s;
    this.app.game.markTip('crates');
    if (B.freeSlots(s) === 0 && s.stats.milestones.firstMerge) {
      this.recovery()?.run();
      return;
    }
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
      this.app.toast(`Finish ${MERGE_ALL_UNLOCK_RACES - s.stats.races} more races to unlock Merge All.`);
      return;
    }
    if (!B.hasAnyPair(s)) { this.app.toast('No pairs to merge'); return; }
    this.flushFx();
    this.app.game.mergeAll();
  }

  private onRace() {
    const s = this.s;
    if (s.pendingQuick) { this.app.go('race'); return; }
    this.app.game.markTip('nitro');
    (this.app.views.race as unknown as { startLive(id: string): void }).startLive(P.recommendedEvent(s).id);
  }
}
