import * as B from '../core/board';
import type { SlotRef } from '../core/events';
import * as P from '../core/progression';
import { tutorialStep, TutorialStep } from '../core/tutorial';
import { FAMILIES, carById, eventById } from '../data/tables';
import type { App } from './app';
import { h } from './dom';

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
}

export class Coach {
  /** Set once the app-level GuideCoach runs: view-local coaches (the Garage's) then stay hidden so cues never double up. */
  static appDriven = false;
  readonly el: HTMLElement;
  private text: HTMLElement;
  private gotIt: HTMLButtonElement;
  private step: CoachStep | null = null;
  private marked: Element[] = [];

  constructor(private host: HTMLElement, onAck: (id: string) => void, onSkip: () => void, private app = false) {
    this.text = h('div', { class: 'coach-text' });
    this.gotIt = h('button', { class: 'coach-btn', onclick: () => this.step && onAck(this.step.id) }, 'Got it');
    this.el = h('div', { class: 'coach', role: 'note', 'aria-live': 'polite' },
      this.text,
      h('div', { class: 'coach-actions' }, this.gotIt, h('button', { class: 'coach-btn subtle', onclick: () => onSkip() }, 'Skip tips')),
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
    if (!same) for (const t of step.targets) { t.classList.add('coach-target'); this.marked.push(t); }
    this.el.hidden = false;
    requestAnimationFrame(() => this.place());
  }

  /** Put the callout above the targets if there is room, else below; keep it inside the host. */
  place() {
    if (!this.step || this.el.hidden) return;
    const host = this.host.getBoundingClientRect();
    const rects = this.step.targets.map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rects.length) { this.el.hidden = true; return; }
    const top = Math.min(...rects.map((r) => r.top)) - host.top;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - host.top;
    // target scrolled out of sight (a list or sheet): wait, rather than point at nothing
    const scroller = this.step.targets[0].closest('.scroll, .sheet');
    const view = scroller ? scroller.getBoundingClientRect() : host;
    this.el.classList.toggle('offscreen', bottom + host.top < view.top + 8 || top + host.top > view.bottom - 8);
    const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2 - host.left;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const fitsAbove = top - hgt - 14 >= 4;
    const below = bottom + 12 + hgt <= host.height - 4;
    const above = fitsAbove && !(this.step.prefer === 'below' && below);
    // a tall target with no room either side (a big card): sit over its lower edge instead of off-screen
    const y = above ? top - hgt - 12 : below ? bottom + 12 : Math.max(4, host.height - hgt - 8);
    const x = Math.max(8, Math.min(host.width - w - 8, cx - w / 2));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${Math.max(4, Math.min(host.height - hgt - 4, y))}px`;
    this.el.classList.toggle('below', !above);
    this.el.classList.toggle('no-arrow', !above && !below);
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
  fitNow: '.view.on .hint .fitnow',
  race: '[data-coach="race"], .view.on .actions .race',
  shop: '[data-coach="shop"], .view.on .actions button[aria-label^="Shop"]',
  mergeAll: '[data-coach="merge-all"]',
  tray: '[data-coach="tray"], .view.on .tray',
  press: '[data-coach="scrap"], .view.on [data-press]',
  nitro: '.topbar .chip.nitro',
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
      () => { app.game.markTip('skipGuide'); this.update(); app.toast('Tips off. Replay them any time from How to play (?).'); }, true);
    this.coach.el.classList.add('guide');
    // Views and sheets rebuild their DOM freely: re-resolve targets after any structural change (one per frame).
    new MutationObserver((muts) => {
      if (muts.every((m) => this.coach.el.contains(m.target))) return;
      this.update();
    }).observe(app.root, { childList: true, subtree: true });
    document.addEventListener('scroll', () => this.coach.place(), { capture: true, passive: true });
    window.addEventListener('resize', () => this.coach.place());
  }

  update() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  private render() {
    let cue: CoachStep | null = null;
    try { cue = this.cue(); } catch { cue = null; }
    const sheet = this.topSheet();
    this.coach.el.classList.toggle('over-sheet', !!sheet);
    const isNew = cue && cue.id !== this.coach.current?.id;
    this.coach.show(cue);
    // a cue on a control scrolled out of view (inside a sheet or a list): bring it into view once
    if (isNew && cue && (!cue.ack || cue.targets[0]?.closest(".sheet"))) cue.targets[0]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
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
    if (app.busy || s.tips.skipGuide) return null;
    const step = tutorialStep(s);
    const one = (id: string, el: HTMLElement | null, text: string, ack = false): CoachStep | null => el ? { id, targets: [el], text, ack } : null;
    const sheet = this.topSheet();
    const inShop = !!sheet?.querySelector('.workshop');
    if (step) {
      const c = this.stepCue(step, sheet, inShop);
      if (c) return c;
    }
    // Race menu, first met: live vs Quick Race.
    if (!sheet && app.route === 'race' && !s.tips.quickRace) {
      const q = this.find(SEL.raceQuick);
      if (q) return one('quickRace', q, 'Quick Race: your crew drives this event for you while you keep merging. It pays less than a live race and has no bonuses — race live to earn the most.', true);
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
      case 'goal': {
        if (sheet || route !== 'garage' || !g) return null;
        const reqs = [`craft a T${g.tier} ${FAMILIES[g.family].name} yourself`, `earn ${g.repNeed} Rep from races`];
        return one(this.find(SEL.goal),
          `This is your goal: the ${g.car.model}. It fits T${g.car.cap} parts (your ${car.model} stops at T${car.cap}), so it can go much faster. To unlock it, ${reqs.join(' and ')}.`, true);
      }
      case 'merge': {
        if (sheet || route !== 'garage') return null;
        const pair = this.pairOf('engine') ?? this.pairOf();
        if (!pair) return null;
        const p = B.getPart(s, pair[0])!;
        const cells = pair.map((r) => this.cell(r)).filter(visible);
        if (cells.length < 2) return null;
        return { id: step, targets: cells, text: `Drag one T${p.t} ${FAMILIES[p.f].name} onto the other (or tap one, then the other). Two matching parts make one part a tier higher: T${p.t} + T${p.t} = T${p.t + 1}.` };
      }
      case 'fit': {
        const fitText = `Parts don't fit themselves. Your ${car.model} has empty slots — fit your parts so they power the car. A fitted part leaves the bench.`;
        if (sheet) return one(this.find(SEL.fitRecommended) ?? this.find('.sheet button', /recommended fit|fit recommended|fit best/i), 'Fit the recommended parts, or pick each slot yourself. Fitted parts power this car and free their bench cells.');
        if (route === 'race') return one(this.find(SEL.raceFit), fitText);
        return route === 'garage' ? one(this.find(SEL.fitNow) ?? this.find(SEL.fit), `${fitText} Tap here.`) : null;
      }
      case 'race1': {
        if (sheet) return null;
        const ev = P.recommendedEvent(s);
        const text = `Race ${ev.name}: a win pays $${ev.payout.cash[0]} and ${ev.payout.rep[0]} Rep. Rep counts toward new cars; cash is for the Shop.`;
        // in the Race menu the facts (track, difficulty, pay) sit above the button: keep them readable
        if (route === 'race') { const c = one(this.find(SEL.raceLive), `${text} Tap NITRO in the amber boost zones.`); return c && { ...c, prefer: 'below' }; }
        return route === 'garage' ? one(this.find(SEL.race), text) : null;
      }
      case 'spend': {
        if (inShop) {
          const pick = this.find(SEL.shopPick);
          return pick ? one(pick, pick.dataset.coachText ?? 'This is the best buy for your goal right now.', true) : null;
        }
        if (sheet || route !== 'garage') return null;
        return one(this.find(SEL.shop), `You have $${s.cash} to spend. Open the Shop: it suggests the buy that helps most with the ${g?.car.model ?? 'next car'}.`, true);
      }
      case 'goalCard': {
        if (sheet || route !== 'garage' || !g) return null;
        return one(this.find(SEL.goal), `${remainingText(app)} Tap the card any time for the details.`, true);
      }
      case 'craftGoal': {
        if (sheet || route !== 'garage' || !g) return null;
        const pair = this.pairOf(g.family);
        const cells = pair ? pair.map((r) => this.cell(r)).filter(visible) : [];
        if (cells.length < 2) return null;
        const fam = FAMILIES[g.family];
        return { id: step, targets: cells, ack: true, text: `Merge your ${fam.plural} up the tiers: crafting a T${g.tier} ${fam.name} yourself is what the ${g.car.model} needs. Crate drops of that tier don't count.` };
      }
      case 'betterPart':
        if (sheet) return null;
        if (route === 'race') return one(this.find(SEL.raceFit), `A better part is on your bench. Fit it to your ${car.model} before you race.`, true);
        return route === 'garage' ? one(this.find(SEL.fitNow) ?? this.find(SEL.fit), `A better part is on your bench. Nothing fits itself — parts only help once fitted: tap here to fit it to your ${car.model}.`, true) : null;
      case 'nitroBank':
        return sheet ? null : one(this.find(SEL.nitro), 'You banked nitro: three quick merges in a row add a charge. Banked charges add to your free crew nitro in live races.', true);
      case 'overflow':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.tray), 'The spare rack holds parts when the bench is full. Drag them back onto the bench or onto a match any time.', true);
      case 'scrap':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.press), 'Bench full: merge a pair, or drop a spare part here to scrap it. Scrap buys crates of the family you need.', true);
      case 'mergeAll':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.mergeAll) ?? this.find('.view.on .actions button', /merge all/i), 'Merge All is unlocked: one tap merges every pair on the bench. Quick manual merges still bank nitro.', true);
      case 'cap':
        return sheet || route !== 'garage' ? null : one(this.find(SEL.fit), `Parts above the ${car.model}'s T${car.cap} limit still fit but run at T${car.cap}. Nothing fits itself: fit them to a car that takes their tier for full power.`, true);
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
