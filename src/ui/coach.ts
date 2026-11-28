import * as B from '../core/board';
import type { SlotRef } from '../core/events';
import * as I from '../core/install';
import * as P from '../core/progression';
import { finishOnboard, fitChange, onboardActive, onboardFitPart, onboardStep, rescueCrate, tutorialStep, TutorialStep } from '../core/tutorial';
import { rescueOrOrder, skipOnboard } from './firstRun';

const SKIP_RUN = 'Skip tutorial';
import { FAMILIES, carById, eventById } from '../data/tables';
import type { App } from './app';
import { h } from './dom';
import { jobsUnlocked } from '../core/jobs';
import { JOBS_CUE } from './jobs';

/**
 * Coach marks: one short instruction anchored beside the control it is about. Steps are derived from game
 * state each render (never from a stored step index), so finishing actions out of order or reloading
 * mid-step is always safe. The callout never covers its target, and the targets stay tappable.
 */
export interface CoachStep {
  id: string;
  targets: Element[];
  text: string;
  /** Show "Got it": the step only ends when dismissed (contextual tips). */
  ack?: boolean;
  /** Where the callout goes when there is room: above the target (default) or below it. */
  prefer?: 'above' | 'below';
  /** Controls the callout should stay off when it can (the spare rack, the press, the action bar…). */
  keepClear?: Element[];
  /** One extra button in the bubble (e.g. a free crate when the bench cannot make the goal's part). */
  action?: { label: string; run: () => void };
  /** The skip button's words ("Skip tutorial" during the first session). */
  skipLabel?: string;
}

export class Coach {
  /** Set once the app-level GuideCoach runs: view-local coaches (the Garage's) then stay hidden so cues never double up. */
  static appDriven = false;
  readonly el: HTMLElement;
  private text: HTMLElement;
  private gotIt: HTMLButtonElement;
  private actBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private step: CoachStep | null = null;
  private marked: Element[] = [];

  constructor(private host: HTMLElement, onAck: (id: string) => void, onSkip: () => void, private app = false) {
    this.text = h('div', { class: 'coach-text' });
    this.gotIt = h('button', { class: 'coach-btn', onclick: () => this.step && onAck(this.step.id) }, 'Got it');
    this.actBtn = h('button', { class: 'coach-btn', onclick: () => this.step?.action?.run() });
    this.skipBtn = h('button', { class: 'coach-btn subtle', onclick: () => onSkip() }, 'Skip tips');
    this.el = h('div', { class: 'coach', role: 'note', 'aria-live': 'polite' },
      this.text,
      h('div', { class: 'coach-actions' }, this.actBtn, this.gotIt, this.skipBtn),
      h('span', { class: 'coach-arrow', 'aria-hidden': 'true' }));
    this.el.hidden = true;
    host.append(this.el);
  }

  get current() { return this.step; }

  show(step: CoachStep | null) {
    if (Coach.appDriven && !this.app) step = null;
    const same = step && this.step && step.id === this.step.id && step.targets.length === this.step.targets.length && step.targets.every((t, i) => t === this.step!.targets[i]);
    if (!same) {
      for (const m of this.marked) m.classList.remove('coach-target');
      this.marked = [];
    }
    this.step = step;
    if (!step || !step.targets.length) { this.el.hidden = true; return; }
    if (this.text.textContent !== step.text) this.text.textContent = step.text;
    this.gotIt.hidden = !step.ack;
    this.actBtn.hidden = !step.action;
    if (step.action && this.actBtn.textContent !== step.action.label) this.actBtn.textContent = step.action.label;
    const skip = step.skipLabel ?? 'Skip tips';
    if (this.skipBtn.textContent !== skip) this.skipBtn.textContent = skip;
    // an instruction with nothing to acknowledge: Skip sits beside the text, so the bubble stays one short row
    this.el.classList.toggle('solo', !step.ack && !step.action);
    if (!same) for (const t of step.targets) { t.classList.add('coach-target'); this.marked.push(t); }
    this.el.hidden = false;
    requestAnimationFrame(() => this.place());
  }

  /**
   * Put the callout where it covers neither its targets nor the controls in `keepClear`: right above the
   * targets when that is free, else right below, else the nearest free band of the host (e.g. above the whole
   * board for a merge cue). The bubble itself lets taps through (see .coach in style.css), so even a forced
   * overlap never blocks the control underneath.
   */
  place() {
    if (!this.step || this.el.hidden) return;
    const host = this.host.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ l: r.left - host.left, t: r.top - host.top, r: r.right - host.left, b: r.bottom - host.top });
    const rects = this.step.targets.map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rects.length) { this.el.hidden = true; return; }
    const tg = rects.map(rel);
    const top = Math.min(...tg.map((r) => r.t));
    const bottom = Math.max(...tg.map((r) => r.b));
    // target scrolled out of sight (a list or sheet): wait, rather than point at nothing
    const scroller = this.step.targets[0].closest('.scroll, .sheet');
    const view = scroller ? scroller.getBoundingClientRect() : host;
    this.el.classList.toggle('offscreen', bottom + host.top < view.top + 8 || top + host.top > view.bottom - 8);
    const cx = (Math.min(...tg.map((r) => r.l)) + Math.max(...tg.map((r) => r.r))) / 2;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const x = Math.max(8, Math.min(host.width - w - 8, cx - w / 2));
    const clear = (this.step.keepClear ?? []).filter((e) => !this.step!.targets.includes(e))
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map(rel);
    const overlap = (y: number, list: { l: number; t: number; r: number; b: number }[]) => list.reduce((a, r) =>
      a + Math.max(0, Math.min(x + w, r.r) - Math.max(x, r.l)) * Math.max(0, Math.min(y + hgt, r.b) - Math.max(y, r.t)), 0);
    const minY = 4;
    const maxY = Math.max(minY, host.height - hgt - 4);
    const aboveY = top - hgt - 12;
    const belowY = bottom + 12;
    const ys = [aboveY, belowY, minY, maxY];
    for (let y = minY; y < maxY; y += 8) ys.push(y);
    const prefer = this.step.prefer ?? 'above';
    let best = maxY;
    let bestScore = Infinity;
    for (const y0 of ys) {
      const y = Math.max(minY, Math.min(maxY, y0));
      const side = y + hgt <= top ? 'above' : y >= bottom ? 'below' : 'over';
      const dist = side === 'above' ? top - (y + hgt) : side === 'below' ? y - bottom : 0;
      const score = overlap(y, tg) * 10 + overlap(y, clear) + dist * 2 + (side !== prefer ? 30 : 0);
      if (score < bestScore) { bestScore = score; best = y; }
    }
    const side = best + hgt <= top ? 'above' : best >= bottom ? 'below' : 'over';
    const gap = side === 'above' ? top - (best + hgt) : side === 'below' ? best - bottom : 0;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${best}px`;
    this.el.classList.toggle('below', side === 'below');
    // the arrow only when the bubble sits right next to what it points at
    this.el.classList.toggle('no-arrow', side === 'over' || gap > 24 || cx < x + 10 || cx > x + w - 10);
    (this.el.querySelector('.coach-arrow') as HTMLElement).style.left = `${Math.max(14, Math.min(w - 14, cx - x))}px`;
  }

  clear() { this.show(null); }
}

// ---------------------------------------------------------------------------------------------------------
// The app-level guide: decides the cue for the current tutorial step and finds its control on whatever is on
// screen (Garage, Race menu, an open sheet). Targets are found by stable selectors: `[data-coach="…"]` first,
// then the Garage's current class names, so the guide works whichever version of a view is mounted.

const SEL = {
  goal: '[data-coach="goal"], .view.on .goal',
  fit: '[data-coach="fit"], .view.on .fitstrip, .view.on .equip',
  fitNow: '.view.on .mycar.fitnow',
  race: '[data-coach="race"], .view.on .actions .race',
  shop: '[data-coach="shop"], .view.on .actions button[aria-label^="Shop"]',
  mergeAll: '[data-coach="merge-all"]',
  tray: '[data-coach="tray"], .view.on .tray',
  press: '[data-coach="scrap"], .view.on [data-press]',
  nitro: '.view.on .actions .race .nitro-badge',
  raceLive: '.view.on [data-coach="race-live"]',
  raceFit: '.view.on [data-coach="race-fit"]',
  raceQuick: '.view.on [data-coach="race-quick"], .view.on .btn.quick:not(.off)',
  shopPick: '.sheet [data-coach="shop-pick"]',
  fitRecommended: '.sheet [data-coach="fit-recommended"], .sheet .fit-confirm .btn.primary:not(.off)',
};

const visible = (el: Element | null | undefined): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;

export class GuideCoach {
  private coach: Coach;
  private raf = 0;

  constructor(private app: App) {
    Coach.appDriven = true;
    this.coach = new Coach(app.root, (id) => { app.game.markTip(id); this.update(); },
      () => {
        // during the first session, Skip ends the guided run only; the one-line tips later have their own Skip
        if (onboardActive(app.game.state)) skipOnboard(app);
        else { app.game.markTip('skipGuide'); app.toast('Tips off. Replay them any time from How to play (?).'); }
        this.update();
      }, true);
    this.coach.el.classList.add('guide');
    // Views and sheets rebuild their DOM freely: re-resolve targets after any structural change (one per frame).
    new MutationObserver((muts) => {
      // ignore the coach's own DOM and the live race HUD (its text changes every frame; tips don't target it)
      if (muts.every((m) => this.coach.el.contains(m.target) || (m.target instanceof Element ? m.target : m.target.parentElement)?.closest('.racescreen'))) return;
      this.update();
    }).observe(app.root, { childList: true, subtree: true });
    document.addEventListener('scroll', () => this.coach.place(), { capture: true, passive: true });
    window.addEventListener('resize', () => this.coach.place());
  }

  update() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  /** Keep `s.onboard` in step with play: record the step shown (for resuming), and the end of the sequence. */
  private syncOnboard() {
    const s = this.app.game.state;
    if (!onboardActive(s) || this.app.busy || this.app.intro) return;
    const step = onboardStep(s);
    if (step === null) this.app.game.transact((d) => { finishOnboard(d, Date.now()); return []; });
    else if (s.onboard!.step !== step) this.app.game.transact((d) => { d.onboard = { ...d.onboard!, step }; return []; });
  }

  private render() {
    try { this.syncOnboard(); } catch { /* never block the screen on bookkeeping */ }
    let cue: CoachStep | null = null;
    try { cue = this.cue(); } catch { cue = null; }
    const sheet = this.topSheet();
    if (cue && !sheet) cue = { ...cue, keepClear: this.keepClear(cue) };
    this.coach.el.classList.toggle('over-sheet', !!sheet);
    const isNew = cue && cue.id !== this.coach.current?.id;
    this.coach.show(cue);
    // a cue on a control scrolled out of view (inside a sheet or a list): bring it into view once
    if (isNew && cue && (!cue.ack || cue.targets[0]?.closest(".sheet"))) cue.targets[0]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  /**
   * What a Garage cue should not cover: the spare rack, the scrap press and the action bar (the controls the
   * cues teach), the parts on the bench, the goal card, the car's slots and the top bar.
   */
  private keepClear(_cue: CoachStep): Element[] {
    if (this.app.route !== 'garage') return [];
    const all = (sel: string) => Array.from(this.app.root.querySelectorAll<HTMLElement>(sel)).filter(visible);
    const list: Element[] = [...all(SEL.tray), ...all(SEL.press), ...all('.view.on .actions')];
    // 1.10: the bubble may rest on empty bench cells, never on parts, the goal card, the car's slots or the top bar —
    // so a merge or fit cue sits beside what it teaches instead of over the controls around it
    list.push(...all('.view.on .board .cell').filter((c) => c.querySelector('.part')),...all('.view.on .goal-row'), ...all('.view.on .carrow'), ...all('.topbar'));
    return list;
  }

  private topSheet(): HTMLElement | null {
    const all = this.app.root.querySelectorAll<HTMLElement>('.sheet');
    return all.length ? all[all.length - 1] : null;
  }

  /** First visible match for a selector list, searched in the open sheet when one is up, else the page. */
  private find(sel: string, text?: RegExp): HTMLElement | null {
    const sheet = this.topSheet();
    const scope: ParentNode = sheet ?? this.app.root;
    for (const el of Array.from(scope.querySelectorAll<HTMLElement>(sel))) {
      if (!sheet && el.closest('.sheet')) continue;
      if (text && !text.test(el.textContent ?? '')) continue;
      if (visible(el)) return el;
    }
    return null;
  }

  private cell(r: SlotRef) { return this.find(`.view.on .cell[data-zone="${r.zone}"][data-i="${r.i}"]`); }

  private pairOf(f?: string): [SlotRef, SlotRef] | null {
    const s = this.app.game.state;
    const refs: SlotRef[] = [...s.board.map((_, i) => ({ zone: 'board' as const, i })), ...s.tray.map((_, i) => ({ zone: 'tray' as const, i }))];
    for (let x = 0; x < refs.length; x++) for (let y = x + 1; y < refs.length; y++) {
      const pa = B.getPart(s, refs[x]);
      if (pa && (!f || pa.f === f) && B.canFuse(pa, B.getPart(s, refs[y]))) return [refs[x], refs[y]];
    }
    return null;
  }

  private cue(): CoachStep | null {
    const app = this.app;
    const s = app.game.state;
    if (app.busy || app.intro || s.tips.skipGuide) return null;
    const step = tutorialStep(s);
    const one = (id: string, el: HTMLElement | null, text: string, ack = false): CoachStep | null => el ? { id, targets: [el], text, ack } : null;
    const sheet = this.topSheet();
    const inShop = !!sheet?.querySelector('.workshop');
    // the first session just ended (the next car's part is made): the one remaining step, once
    if (!sheet && app.route === 'garage' && s.onboard?.done && !s.onboard.skipped && s.onboard.at && !s.tips['fr:next']) {
      const c = one('fr:next', this.find(SEL.race), `${remainingText(app)} Race to earn it.`, true);
      if (c) return c;
    }
    if (step) {
      const c = this.stepCue(step, sheet, inShop);
      if (c) return c;
    }
    // Race menu, first met: live vs Quick Race.
    if (!sheet && app.route === 'race' && !s.tips.quickRace) {
      const q = this.find(SEL.raceQuick);
      if (q) return one('quickRace', q, 'Quick Race: your crew drives this event for you while you keep merging. It pays less than a live race and has no bonuses — race live to earn the most.', true);
    }
    // Job Board, once it opens (after the first few races): introduced on the pill (Garage) or the board (Race menu)
    if (!sheet && !s.tips.jobs && jobsUnlocked(s)) {
      const el = app.route === 'garage' ? this.find('.view.on [data-coach="jobs-pill"]') : app.route === 'race' ? this.find('.view.on [data-coach="jobs"] .feat-label') : null;
      if (el) return { ...one('jobs', el, JOBS_CUE, true)!, prefer: 'below' };
    }
    return null;
  }

  private stepCue(step: TutorialStep, sheet: HTMLElement | null, inShop: boolean): CoachStep | null {
    const app = this.app;
    const s = app.game.state;
    const car = carById(s.activeCar);
    const g = P.goalStatus(s);
    const one = (el: HTMLElement | null, text: string, ack = false): CoachStep | null => el ? { id: step, targets: [el], text, ack } : null;
    const route = app.route;
    switch (step) {
      case 'goal': case 'goalCard': return null; // folded into the first session's craft step and the result card
      case 'merge': {
        if (sheet || route !== 'garage') return null;
        const pair = this.pairOf('engine') ?? this.pairOf();
        if (!pair) return null;
        const p = B.getPart(s, pair[0])!;
        const cells = pair.map((r) => this.cell(r)).filter(visible);
        if (cells.length < 2) return null;
        return { id: step, targets: cells, skipLabel: SKIP_RUN, text: `Drag one ${FAMILIES[p.f].name} onto the other: two T${p.t}s make a T${p.t + 1}.` };
      }
      case 'fit': {
        const part = onboardFitPart(s);
        if (!part) return null;
        const ch = fitChange(s, s.activeCar, part);
        const what = ch ? `${ch.label} ${ch.from} → ${ch.to}: ${ch.meaning}.` : 'It powers the car once fitted.';
        if (sheet) {
          const c = one(this.find(SEL.fitRecommended) ?? this.find('.sheet button', /recommended fit|fit recommended|fit best/i), `Fit it: ${what}`);
          return c && { ...c, skipLabel: SKIP_RUN };
        }
        if (route === 'race') { const c = one(this.find(SEL.raceFit), `Fit your T${part.t} ${FAMILIES[part.f].name} first: ${what}`); return c && { ...c, skipLabel: SKIP_RUN }; }
        if (route !== 'garage') return null;
        // picked up (the Garage picks the merged part up for you): the Fit button; else the part itself
        const fitBtn = this.find('.view.on .selbar .sel-fit');
        if (fitBtn) return { id: step, targets: [fitBtn], skipLabel: SKIP_RUN, text: `Fit it to your ${car.model}. ${what}` };
        const loc = I.locatePart(s, part.id);
        const cell = loc && 'at' in loc ? this.cell(loc.at) : null;
        return cell ? { id: step, targets: [cell], skipLabel: SKIP_RUN, text: `Tap your T${part.t} ${FAMILIES[part.f].name}, then Fit. ${what}` } : null;
      }
      case 'race1': {
        if (sheet) return null;
        const ev = P.recommendedEvent(s);
        const fittedNow = Object.values(I.fitted(s, s.activeCar)).some(Boolean);
        const text = fittedNow ? `Try it on track: race ${ev.name}. You'll learn SHIFT, then NITRO.` : `Race ${ev.name}: you'll learn SHIFT, then NITRO.`;
        if (route === 'race') { const c = one(this.find(SEL.raceLive), text); return c && { ...c, prefer: 'below', skipLabel: SKIP_RUN }; }
        if (route !== 'garage') return null;
        const c = one(this.find(SEL.race), text);
        return c && { ...c, skipLabel: SKIP_RUN };
      }
      case 'spend': {
        if (inShop) {
          const pick = this.find(SEL.shopPick);
          return pick ? one(pick, pick.dataset.coachText ?? 'The best buy for your goal right now.', true) : null;
        }
        if (sheet || route !== 'garage') return null;
        return one(this.find(SEL.shop), `$${s.cash} to spend: the Shop picks the buy that helps most.`, true);
      }
      case 'craftGoal': {
        if (sheet || route !== 'garage' || !g) return null;
        const fam = FAMILIES[g.family];
        const intro = `Next car: the ${g.car.model} (fits T${g.car.cap} parts). It needs a T${g.tier} ${fam.name} you merge yourself.`;
        // a part of the family is picked up: point at its glowing matches
        const sel = this.find('.view.on .board .cell.sel, .view.on .tray .cell.sel');
        const selPart = sel ? B.getPart(s, { zone: sel.dataset.zone as 'board' | 'tray', i: Number(sel.dataset.i) }) : null;
        if (sel && selPart?.f === g.family) {
          const tg = Array.from(app.root.querySelectorAll<HTMLElement>('.view.on .cell.target')).filter(visible).slice(0, 2);
          if (tg.length) return { id: step, targets: tg, skipLabel: SKIP_RUN, text: selPart.t + 1 >= g.tier
            ? `Tap a glowing ${fam.name}: this merge makes the T${g.tier} the ${g.car.model} needs.`
            : `Tap a glowing ${fam.name}: T${selPart.t} + T${selPart.t} = T${selPart.t + 1}. Two T${g.tier - 1}s make the T${g.tier}.` };
        }
        const pair = this.pairOf(g.family);
        const cells = pair ? pair.map((r) => this.cell(r)).filter(visible) : [];
        if (cells.length === 2) return { id: step, targets: cells, skipLabel: SKIP_RUN, text: `${intro} Merge two ${fam.plural}.` };
        // the bench can't make it: one free crate of the family (once), else the order route on the goal card
        const rc = rescueCrate(s);
        const goalEl = this.find('.view.on .goal-act') ?? this.find(SEL.goal);
        if (!goalEl) return null;
        if (rc) return { id: step, targets: [goalEl], skipLabel: SKIP_RUN, text: `${intro} You're short of ${fam.plural}.`, action: { label: `Get T${rc.tier} ${fam.name}`, run: () => rescueOrOrder(app) } };
        return { id: step, targets: [goalEl], skipLabel: SKIP_RUN, text: `${intro} Tap here to get the ${fam.plural} you need.` };
      }
      case 'betterPart':
        if (sheet) return null;
        if (route === 'race') return one(this.find(SEL.raceFit), `A better part is on your bench: fit it before you race.`, true);
        return route === 'garage' ? one(this.find(SEL.fitNow) ?? this.find(SEL.fit), `A better part is on your bench: tap to fit it to your ${car.model}.`, true) : null;
      case 'nitroBank':
        return sheet ? null : one(this.find(SEL.nitro), 'Nitro banked: three quick merges in a row add a charge for your next race.', true);
      case 'overflow':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.tray), 'Spare rack: parts wait here when the bench is full.', true);
      case 'scrap':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.press), 'Bench full: merge a pair, or recycle a part here. Scrap orders the exact part you pick.', true);
      case 'mergeAll':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.mergeAll) ?? this.find('.view.on .actions button', /merge all/i), 'Merge All: one tap merges every pair on the bench.', true);
      case 'cap':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.fit), `The ${car.model} runs parts at T${car.cap} at most; higher tiers get full power in a later car.`, true);
      case 'shop':
        return null;
    }
    return null;
  }
}

/** "Still needed for the Corsa Rojo: …" — the exact remaining requirements, with craft, wins and Rep kept apart. */
export function remainingText(app: App): string {
  const s = app.game.state;
  const g = P.goalStatus(s);
  if (!g) return 'Every car is yours.';
  const left: string[] = [];
  if (!g.keystoneDone) left.push(`craft a T${g.tier} ${FAMILIES[g.family].name}${g.bestHeld ? ` (your best is T${g.bestHeld})` : ''}`);
  if (g.event && !g.eventDone) left.push(`win ${eventById(g.event).name}`);
  if (s.rep < g.repNeed) left.push(`${g.repNeed - s.rep} more Rep (${repRaces(app)})`);
  return left.length ? `Still needed for the ${g.car.model}: ${left.join(' · ')}.` : `The ${g.car.model} is ready.`;
}

/** About how many wins of the recommended race cover the Rep still needed. */
export function repRaces(app: App): string {
  const s = app.game.state;
  const g = P.goalStatus(s);
  if (!g) return '';
  const ev = P.recommendedEvent(s);
  const per = Math.max(1, ev.payout.rep[0]);
  const n = Math.ceil((g.repNeed - s.rep) / per);
  return `about ${n} ${ev.name} win${n > 1 ? 's' : ''}`;
}
