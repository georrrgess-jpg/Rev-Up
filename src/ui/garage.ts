import { sfx } from '../audio';
import * as B from '../core/board';
import type { GameEvent, SlotRef } from '../core/events';
import { sameRef } from '../core/events';
import { computeLoadout, scrapImpact } from '../core/loadout';
import * as P from '../core/progression';
import type { Part } from '../core/state';
import { ACTIVE_FAMILIES, FAMILIES, Family, MAX_TIER, MERGE_ALL_UNLOCK_RACES, nitroCapFor, PART_ORDER_PRICE, carById, eventById } from '../data/tables';
import { familyIcon, partSvg } from '../render/parts';
import type { App, View } from './app';
import { tutorialStep } from '../core/tutorial';
import { Coach, CoachStep } from './coach';
import { h } from './dom';
import { openShop } from './shop';
import { openFitParts } from './fit';
import { GoalCard } from './goalCard';

const PRESS: SlotRef = { zone: 'tray', i: -1 }; // sentinel for the scrap press

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
  private goal: GoalCard;
  private sel: SlotRef | null = null;
  private drag: { from: SlotRef; id: number; x0: number; y0: number; ghost: HTMLElement | null } | null = null;
  private boardCols = 0;
  private visible = false;

  constructor(private app: App) {
    this.goal = new GoalCard(app);
    this.equipEl = h('button', { class: 'equip', 'aria-label': 'Fitted parts — open Fit Parts', onclick: () => openFitParts(this.app) });
    this.capEl = h('div', { class: 'capnote' });
    this.benchStatus = h('span', { class: 'num' });
    this.boardEl = h('div', { class: 'board', role: 'grid', 'aria-label': 'Parts board' });
    this.trayEl = h('div', { class: 'tray', role: 'grid', 'aria-label': 'Spare rack' });
    this.pressEl = h('button', { class: 'press', 'data-press': '1', 'aria-label': 'Scrap press: drop or select a part, then tap here to scrap it' },
      h('span', { class: 'pi', 'aria-hidden': 'true' }, '♻'), 'SCRAP');
    this.pressEl.addEventListener('click', () => this.onPressTap());
    this.hintEl = h('div', { class: 'hint', role: 'status' });
    this.printerBar = h('i');
    this.cratesBtn = h('button', { class: 'btn crates', onclick: () => this.onCrates() });
    this.mergeAllBtn = h('button', { class: 'btn', onclick: () => this.onMergeAll() });
    this.raceBtn = h('button', { class: 'btn primary race', onclick: () => this.onRace() });
    const shopBtn = h('button', { class: 'btn', 'aria-label': 'Shop: parts, crates and upgrades', onclick: () => openShop(this.app) }, 'Shop');
    this.shopBtn = shopBtn;

    this.el = h('section', { class: 'view garage', 'aria-label': 'Garage' },
      h('div', { class: 'garage-body scroll' },
        this.goal.el, this.equipEl, this.capEl,
        h('div', { class: 'benchhead' }, h('strong', {}, 'Workbench'), this.benchStatus),
        h('div', { class: 'boardwrap' }, this.boardEl),
        h('div', { class: 'trayrow' }, h('span', { class: 'traycaption' }, 'Spare rack'), this.trayEl, this.pressEl),
        this.hintEl),
      h('div', { class: 'actions' }, this.cratesBtn, shopBtn, this.mergeAllBtn, this.raceBtn),
    );
    this.coach = new Coach(this.el,
      (id) => { this.app.game.markTip(id); this.render(); },
      () => { this.app.game.markTip('skipGuide'); this.render(); this.app.toast('Tips off. Replay them any time from How to play (?).'); });
    this.bindPointer();
    this.bindKeys();
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
  private prevStats: { top: number; accel: number; grip: number; car: string } | null = null;
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
    const vw = this.el.clientWidth - 24;
    const gap = 5;
    const cellW = (Math.min(vw, 520) - 14 - gap * (s.cols - 1)) / s.cols;
    const others = [this.goal.el, this.equipEl, this.capEl, this.hintEl, this.el.querySelector('.benchhead')!, this.el.querySelector('.actions')!]
      .reduce((a, e) => a + (e as HTMLElement).offsetHeight, 0) + (window.innerHeight < 661 ? 18 : 30);
    const H = this.el.clientHeight - others;
    const cellH = (H - 14 - gap * (s.rows - 1) - 14) / (s.rows + 0.86);
    const cell = Math.max(36, Math.min(84, Math.floor(Math.min(cellW, cellH))));
    this.el.style.setProperty('--cell', `${cell}px`);
    this.goal.draw();
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

  private partHtml(p: Part, equipped: boolean, overCap: boolean, match = false): string {
    const q = p.q === 'mint' ? '<span class="qtag">MINT</span>' : p.q === 'polished' ? '<span class="qtag">POL</span>' : '';
    const label = `T${p.t} ${FAMILIES[p.f].name}${p.q !== 'std' ? `, ${p.q}` : ''}${equipped ? ', equipped' : ''}${overCap ? ', above car cap' : ''}${match ? ', has a match' : ''}`;
    return `<div class="part q-${p.q}${equipped ? ' equipped' : ''}${overCap ? ' over-cap' : ''}${match ? ' has-match' : ''}" aria-label="${label}">${partSvg(p.f, p.t, p.q)}<span class="tier">${p.t}</span>${q}<span class="fam" style="background:${FAMILIES[p.f].color}"></span></div>`;
  }

  render(anim: Map<string, string[]> = new Map()) {
    if (!this.el.isConnected) return;
    this.ensureCells();
    const s = this.s;
    const lo = computeLoadout(s);
    const eqIds = new Set(Object.values(lo.equipped).map((p) => p!.id));
    const cap = carById(s.activeCar).cap;
    // usable matches: any family+tier held twice below the top tier
    const counts = new Map<string, number>();
    for (const p of B.allParts(s)) if (p.t < MAX_TIER) counts.set(`${p.f}${p.t}`, (counts.get(`${p.f}${p.t}`) ?? 0) + 1);
    const paint = (cell: HTMLButtonElement, p: Part | null, key: string) => {
      const html = p ? this.partHtml(p, eqIds.has(p.id), p.t > cap, (counts.get(`${p.f}${p.t}`) ?? 0) > 1) : '';
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
    this.goal.render();
    this.renderEquip(lo);
    // Show the auto-equipped stat change right where the equipped parts are listed.
    const st = lo.stats;
    const prev = this.prevStats;
    if (prev && prev.car === s.activeCar) {
      const bits: string[] = [];
      if (st.top - prev.top > 0.05) bits.push(`Top speed +${Math.round((st.top - prev.top) * 3.6)} km/h`);
      if (st.accel - prev.accel > 0.02) bits.push(`Acceleration +${(st.accel - prev.accel).toFixed(1)}`);
      if (st.grip - prev.grip > 0.005) bits.push(`Grip +${(st.grip - prev.grip).toFixed(2)}`);
      if (bits.length) {
        const r = this.equipEl.getBoundingClientRect();
        const host = this.el.getBoundingClientRect();
        const f = h('div', { class: 'floater stat' }, bits.join(' · '));
        f.style.left = `${r.left - host.left + r.width / 2}px`;
        f.style.top = `${r.top - host.top}px`;
        this.el.append(f);
        setTimeout(() => f.remove(), 1600);
      }
    }
    this.prevStats = { ...st, car: s.activeCar };
    this.renderActions();
    this.renderHint();
    this.coach.show(this.coachStep());
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

  /** The coach mark for the current tutorial step (the step itself is decided in core/tutorial.ts). */
  private coachStep(): CoachStep | null {
    const s = this.s;
    if (!this.visible || this.app.busy || this.drag) return null;
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
        const chip = document.querySelector('.chip.nitro');
        return chip ? { id: step, targets: [chip], ack: true, text: 'You banked nitro: three quick merges in a row add a charge (up to 3). Banked charges add to your free crew nitro in live races.' } : null;
      }
      case 'overflow':
        return { id: step, targets: [this.trayEl], ack: true, text: 'The spare rack holds parts when the bench is full. Drag them back onto the bench or onto a match any time.' };
      case 'scrap':
        return { id: step, targets: [this.pressEl], ack: true, text: 'Bench full: merge a pair, or drop a spare part here to scrap it. Scrap buys crates of the family you need.' };
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
      const pair = this.anyPair();
      const junk = pair ? null : this.lowestScrap();
      const jp = junk ? B.getPart(s, junk) : null;
      this.cratesBtn.replaceChildren(h('span', { class: 'stack' }, pair ? 'Merge pair' : jp ? `Scrap T${jp.t}` : 'Bench full', h('small', {}, n ? `${n} crates wait` : 'bench full')));
      this.cratesBtn.setAttribute('aria-label', pair ? 'Bench full: show a pair to merge' : jp ? `Bench full: scrap a T${jp.t} ${FAMILIES[jp.f].name}` : 'Bench full');
      this.cratesBtn.classList.add('pulse');
    } else {
      this.cratesBtn.replaceChildren(
        h('span', { class: 'stack' }, 'Crates', h('small', {}, paused ? 'Printer full' : n ? `${n} queued` : 'Printing')),
        h('span', { class: 'printer' }, this.printerBar));
      this.cratesBtn.setAttribute('aria-label', `Crates: ${n} waiting${paused ? ', printer paused until you open some' : ''}`);
      this.cratesBtn.classList.toggle('pulse', n > 0 && B.freeSlots(s) > 0);
    }
    this.updatePrinter();
    const unlocked = P.mergeAllUnlocked(s);
    const racesLeft = Math.max(0, MERGE_ALL_UNLOCK_RACES - s.stats.races);
    const hasPair = unlocked && B.hasAnyPair(s);
    this.mergeAllBtn.replaceChildren(h('span', { class: 'stack' }, 'Merge All', h('small', {}, unlocked ? (hasPair ? 'Pairs ready' : 'No pairs') : `${racesLeft} races left`)));
    this.mergeAllBtn.classList.toggle('off', !hasPair);
    this.mergeAllBtn.setAttribute('aria-label', unlocked ? 'Merge All' : `Merge All unlocks after ${racesLeft} more finishes`);
    const open = B.freeSlots(s);
    this.benchStatus.textContent = open ? `${open} slots free` : 'Full · scrap or merge';
    const q = s.pendingQuick;
    if (q) {
      const left2 = Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000));
      this.raceBtn.replaceChildren(h('span', { class: 'stack' }, 'Crew racing', h('small', {}, `${eventById(q.eventId).name} · ${left2} s`)));
    } else {
      const ev = P.recommendedEvent(s);
      this.raceBtn.replaceChildren(h('span', { class: 'stack' }, 'Race', h('small', {}, ev.name)));
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
    if (B.freeSlots(s) === 0 && s.stats.milestones.firstMerge) {
      // full bench: offer the recovery action itself, not just advice
      const pair = this.anyPair();
      const junk = this.lowestScrap();
      const label = pair ? 'Board full · Show a pair to merge' : junk ? `Board full · Scrap a T${B.getPart(s, junk)!.t} ${FAMILIES[B.getPart(s, junk)!.f].name} (+${B.scrapValue(B.getPart(s, junk)!)})` : 'Board full';
      if (this.hintEl.dataset.k !== label) {
        this.hintEl.dataset.k = label;
        requestAnimationFrame(() => this.visible && this.layout()); // re-fit the board now the recovery button takes space
        this.hintEl.replaceChildren(h('button', { class: 'btn sm recover', onclick: () => {
          const p2 = this.anyPair();
          if (p2) { this.setSel(p2[0]); this.cellFor(p2[1])?.firstElementChild?.classList.add('pop'); return; }
          const j = this.lowestScrap();
          if (j) this.requestScrap(j);
        } }, label));
      }
      this.raceBtn.classList.remove('pulse');
      return;
    }
    if (this.hintEl.dataset.k) { delete this.hintEl.dataset.k; this.hintEl.textContent = ''; requestAnimationFrame(() => this.visible && this.layout()); }
    const coached = !s.tips.skipGuide;
    if (!s.stats.milestones.firstMerge) t = coached ? '' : 'Drag two matching parts together to merge them';
    else if (s.stats.races === 0 && !s.pendingRace) t = coached ? '' : 'Merged! Tap Race to earn cash and Rep';
    else if (this.sel) {
      const part = B.getPart(s, this.sel);
      if (part) t = `T${part.t} ${FAMILIES[part.f].name} selected. Tap a matching part.`;
    } else if (s.nitro > 0 && !s.tips.nitro) t = `Nitro ready. In the race, tap NITRO when its button lights up in a boost zone.`;
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

  /** Lowest-value part that is not equipped and not the current goal family. */
  private lowestScrap(): SlotRef | null {
    const s = this.s;
    const eq = new Set(Object.values(computeLoadout(s).equipped).map((p) => p!.id));
    const goal = P.goalStatus(s);
    let best: { r: SlotRef; v: number } | null = null;
    const refs: SlotRef[] = [...s.tray.map((_, i) => ({ zone: 'tray' as const, i })), ...s.board.map((_, i) => ({ zone: 'board' as const, i }))];
    for (const r of refs) {
      const p = B.getPart(s, r);
      if (!p || eq.has(p.id)) continue;
      const v = p.t * 10 + (goal && !goal.keystoneDone && p.f === goal.family ? 100 : 0);
      if (!best || v < best.v) best = { r, v };
    }
    return best?.r ?? null;
  }

  // ---------------- Events → animations ----------------
  onEvents(ev: GameEvent[]) {
    if (!this.visible) return;
    const anim = new Map<string, string[]>();
    const key = (r: SlotRef) => `${r.zone}:${r.i}`;
    let delay = 0;
    let fuseCount = 0;
    const FX_CAP = 6; // a batch merge plays at most this many merge sounds and floaters
    let maxChain = 0;
    for (const e of ev) {
      if (e.type === 'fuse') {
        fuseCount++;
        if (fuseCount > FX_CAP) { anim.set(key(e.at), ['pop']); continue; }
        const cls = ['pop'];
        if (e.tier >= 5) cls.push('flash-high');
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
          sfx.merge(chain, tier);
          if (q === 'mint') { sfx.mint(); this.floater(at, skipped ? `MINT · jumped to T${tier}` : 'MINT', 'gold'); }
          else if (q === 'polished') { sfx.polished(); this.floater(at, 'Polished +15%', ''); }
          if (chain > 1) this.floater(at, `Cascade ×${chain}`, '');
        }, delay);
        delay += this.s.settings.reducedMotion ? 0 : 90;
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
          this.floaterTop(`★ T${e.tier} ${FAMILIES[e.family].name} crafted`, 'gold');
          this.app.toast(g?.keystoneDone && this.s.rep < g.repNeed ? `T${e.tier} ${FAMILIES[e.family].name} crafted — the ${car.model}'s part is done. ${g.repNeed - this.s.rep} more Rep to unlock it` : `T${e.tier} ${FAMILIES[e.family].name} crafted for the ${car.model}`);
        }
      }
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
    const placed = ev.filter((e) => e.type === 'place').length;
    if (placed && !ev.some((e) => e.type === 'fuse')) sfx.place();
    void maxChain;
    if (fuseCount > FX_CAP) this.floaterTop(`+${fuseCount - FX_CAP} more merges`, '');
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
    this.renderHint();
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
          ? h('p', {}, `It's equipped on your ${carById(this.s.activeCar).model}. ${fam.statLabel} drops — `,
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
        el.focus({ preventScroll: true });
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

  private onCrates() {
    const s = this.s;
    this.app.game.markTip('crates');
    if (B.freeSlots(s) === 0 && s.stats.milestones.firstMerge) {
      const pair = this.anyPair();
      if (pair) { this.setSel(pair[0]); this.cellFor(pair[1])?.firstElementChild?.classList.add('pop'); return; }
      const junk = this.lowestScrap();
      if (junk) this.requestScrap(junk);
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
    this.app.game.mergeAll();
  }

  private onRace() {
    const s = this.s;
    if (s.pendingQuick) { this.app.go('race'); return; }
    this.app.game.markTip('nitro');
    (this.app.views.race as unknown as { startLive(id: string): void }).startLive(P.recommendedEvent(s).id);
  }
}
