// Redline first session (1.10): the race-side coach for the opening test run, the result card's "what changed and
// what next" block, and the Garage's fit feedback. The steps themselves are decided in core/tutorial.ts.
//
// The race coach reads the simulation's own cue state (the shift attempt the HUD draws and a tap is judged on, and
// the boost zones) and teaches one control at a time: SHIFT on green first; NITRO only once a boost zone is here and
// no shift is pending (the practice race already keeps shift cues out of boost zones). A missed input never stops the
// race: the car shifts itself, and the coach says to catch the next one.
import * as B from '../core/board';
import * as P from '../core/progression';
import type { RaceSetup, RaceSim, ShiftRecord } from '../core/race';
import { finishOnboard, measureParts, onboardActive, rescueCrate } from '../core/tutorial';
import { FAMILIES, eventById } from '../data/tables';
import type { App } from './app';
import { currentGoal } from './contracts';
import { h } from './dom';
import { runGoalAction } from './goalCard';

/** The live race should be coached: the first session, or a practice run asked for from How to play. */
export function wantsRaceCoach(app: App): boolean {
  const s = app.game.state;
  return !app.game.rivalRunName && (onboardActive(s) || !!s.tips['fr:practice']);
}

type Target = 'shift' | 'nitro' | null;

/**
 * One bubble over the race controls, one lesson at a time. Created by the race screen (a clearly marked hook) and
 * stepped once per frame; it reads the sim and only touches the DOM when its message changes.
 */
export class RaceCoach {
  private el: HTMLElement;
  private text: HTMLElement;
  private msg = '';
  private target: Target = null;
  private marked: Element | null = null;
  private feedback: { text: string; until: number; target: Target } | null = null;
  private lastShift: ShiftRecord | null = null;
  private nitroUsed = 0;
  private cleanShifts = 0;
  private decorated = false;
  private obs: MutationObserver;
  private startRaces: number;

  constructor(private app: App, private sim: RaceSim, private screen: HTMLElement, private setup: RaceSetup) {
    this.text = h('div', { class: 'fr-text' });
    this.el = h('div', { class: 'fr-race', role: 'status', 'aria-live': 'polite' }, this.text, h('span', { class: 'fr-arrow', 'aria-hidden': 'true' }));
    this.el.hidden = true;
    screen.append(this.el);
    screen.classList.add('fr-on');
    this.startRaces = app.game.state.stats.races;
    // the result card arrives as a child of the race screen: add the first-run block to it once
    this.obs = new MutationObserver(() => {
      if (!screen.isConnected) { this.obs.disconnect(); return; }
      const card = screen.querySelector<HTMLElement>('.result .card');
      if (card && !this.decorated) { this.decorated = true; this.hide(); this.decorate(card); }
    });
    this.obs.observe(screen, { childList: true });
  }

  private btn(kind: Exclude<Target, null>): HTMLElement | null {
    return this.screen.querySelector<HTMLElement>(kind === 'shift' ? '[data-coach="shift"], .shiftbtn' : '[data-coach="nitro"], .nitrobtn');
  }

  private hide() {
    this.show('', null);
  }

  private show(text: string, target: Target, tone = '') {
    if (text === this.msg && target === this.target) return;
    this.msg = text;
    this.target = target;
    this.marked?.classList.remove('fr-target');
    this.marked = null;
    if (!text) { this.el.hidden = true; return; }
    this.text.textContent = text;
    this.el.className = `fr-race${tone ? ` ${tone}` : ''}`;
    this.el.hidden = false;
    const t = target ? this.btn(target) : null;
    if (t) { t.classList.add('fr-target'); this.marked = t; }
    // place above the control it is about (one layout read per message change, never per frame)
    const host = this.screen.getBoundingClientRect();
    const r = t?.getBoundingClientRect();
    // sit above the whole control bar, so the shift light on the dial is never covered
    const bar = (t?.closest('.racebar, .nitrobar') ?? this.screen.querySelector('.racebar, .nitrobar'))?.getBoundingClientRect();
    const w = Math.min(300, host.width - 24);
    this.el.style.width = `${w}px`;
    const cx = r ? r.left - host.left + r.width / 2 : host.width / 2;
    const x = Math.max(12, Math.min(host.width - w - 12, cx - w / 2));
    this.el.style.left = `${x}px`;
    const top = Math.min(r?.top ?? Infinity, bar?.top ?? Infinity);
    this.el.style.bottom = `${Number.isFinite(top) ? host.bottom - top + 12 : 190}px`;
    const arrow = this.el.querySelector<HTMLElement>('.fr-arrow')!;
    arrow.hidden = !r;
    arrow.style.left = `${Math.max(16, Math.min(w - 16, cx - x))}px`;
  }

  /** Called by the race screen every frame. */
  frame(countdown: number, finished: boolean) {
    if (finished) { this.hide(); return; }
    const sim = this.sim;
    const now = performance.now();
    // feedback on what just happened (a shift landed, a boost fired) stays up for a moment
    const ls = sim.lastShift;
    if (ls && ls !== this.lastShift) {
      this.lastShift = ls;
      // (the HUD grades every shift itself; the coach adds what to do next)
      if (ls.grade === 'clean') { this.cleanShifts++; if (this.cleanShifts === 1) this.feedback = { text: 'Nice! Full power kept. Again on the next green.', until: now + 1100, target: 'shift' }; }
      else if (ls.grade === 'early') this.feedback = { text: 'A bit early. Wait for the green light.', until: now + 1300, target: 'shift' };
      else if (ls.grade === 'late') this.feedback = { text: 'A bit late. Tap as soon as it turns green.', until: now + 1300, target: 'shift' };
      else if (ls.grade === 'missed') this.feedback = { text: 'Missed: the car shifted itself. Catch the next green.', until: now + 1500, target: 'shift' };
    }
    if (sim.nitroUsed > this.nitroUsed) {
      this.nitroUsed = sim.nitroUsed;
      const perfect = sim.perfects >= this.nitroUsed;
      this.feedback = { text: perfect ? 'Perfect boost ✓ Inside the zone it is 1.5× stronger.' : 'Boost ✓ Inside the amber zone it counts as Perfect.', until: now + 1600, target: 'nitro' };
    }
    if (this.feedback && now < this.feedback.until) { this.show(this.feedback.text, this.feedback.target, 'good'); return; }
    this.feedback = null;
    if (countdown > 0) { this.show('Shift on green: tap SHIFT when its light turns green.', 'shift'); return; }
    const p = sim.player;
    const cue = sim.shiftCue();
    const { active, next } = sim.windowState();
    const canBoost = sim.charges > 0 && p.nitroLeft <= 0;
    const zoneOpen = !!active && canBoost && !sim.usedWindows.has(active.segIndex);
    // a shift that is due always comes first; nitro only when no shift is pending
    if (cue === 'green') { this.show('Green: tap SHIFT now!', 'shift', 'go'); return; }
    if (cue === 'late') { this.show('Shift now: you are on the limiter.', 'shift', 'go'); return; }
    if (zoneOpen) { this.show('Boost zone: tap NITRO now!', 'nitro', 'go'); return; }
    const eta = next && canBoost && !sim.usedWindows.has(next.segIndex) && p.v > 1 ? (next.start - p.x) / p.v : Infinity;
    if (eta < 1.6 && cue !== 'soon') { this.show('Boost zone ahead: get ready on NITRO.', 'nitro'); return; }
    if (cue === 'soon') { this.show('Get ready… shift on green.', 'shift'); return; }
    // between cues: say nothing once the player has the hang of it
    if (this.cleanShifts === 0 && !sim.topGear()) { this.show('Tap SHIFT when its light turns green.', 'shift'); return; }
    this.hide();
  }

  /** The first-run block on the result card: what the fitted part did, Rep and cash in one line, the next car and the
   *  one button to it, and a quick way to practise the run again. */
  private decorate(card: HTMLElement) {
    const app = this.app;
    const s = app.game.state;
    if (s.tips['fr:practice']) app.game.transact((d) => { delete d.tips['fr:practice']; return []; });
    const r = s.lastResult;
    if (!r) return;
    // a car to reveal keeps the card exactly as it is (its one action is the reveal)
    if (!s.pendingReveal) card.classList.add('fr-card');
    const lines: HTMLElement[] = [];
    // 1. measured: the same race with and without each fitted part
    let gains: ReturnType<typeof measureParts> = [];
    try { gains = measureParts(s, this.setup); } catch { gains = []; }
    const g0 = gains[0];
    if (g0) {
      const part = `T${g0.part.t} ${FAMILIES[g0.part.f].name}`;
      lines.push(h('div', { class: 'fr-gain' }, h('b', {}, `Your ${part}: ${g0.seconds.toFixed(1)} s faster`),
        h('span', {}, g0.whereS >= 0.05 ? ` here, mostly ${g0.where}.` : ' on this course.')));
    } else {
      const slots = s.installed?.[s.activeCar] ?? {};
      if (!Object.values(slots).some(Boolean)) lines.push(h('div', { class: 'fr-gain' }, h('b', {}, 'Your car has empty slots.'), h('span', {}, ' Fit a part and race again to feel the difference.')));
    }
    // 2. shifting and nitro, from this run
    const shifts = this.sim.shiftLog.filter((x) => x.grade !== 'assist');
    const clean = shifts.filter((x) => x.grade === 'clean').length;
    if (shifts.length) lines.push(h('div', { class: 'fr-skill' }, `Shifts ${clean}/${shifts.length} clean · boosts ${this.sim.perfects} Perfect`,
      clean < shifts.length ? h('span', {}, ' · a clean shift keeps full power') : null));
    // 3. Rep and cash, one line, the first time they are earned
    if (this.startRaces === 0) lines.push(h('div', { class: 'fr-econ' }, h('b', {}, `+${r.rep} Rep`), ' opens cars (never spent) · ', h('b', {}, `+$${r.cash}`), ' buys parts'));
    // 4. the next car and the one thing to do
    const g = P.goalStatus(s);
    const goal = currentGoal(s);
    let act: { label: string; sub: string; run: () => void } | null = null;
    if (g && !g.keystoneDone) {
      const fam = FAMILIES[g.family];
      lines.push(h('div', { class: 'fr-next' }, h('small', {}, 'Next car'), h('b', {}, g.car.model), h('span', {}, ` (T${g.car.cap} parts) needs a T${g.tier} ${fam.name} you merge${s.rep < g.repNeed ? ` + ${g.repNeed - s.rep} Rep` : ''}`)));
      act = { label: `Merge ${fam.plural}`, sub: `toward the T${g.tier}`, run: () => this.toGarage(() => this.craft(g.family)) };
    } else if (goal) {
      lines.push(h('div', { class: 'fr-next' }, h('small', {}, 'Next'), h('b', {}, goal.title), h('span', {}, ` · ${goal.missing}`)));
      act = { label: goal.action.label.split(/\s*[:·—]\s/)[0], sub: '', run: () => this.toGarage(() => runGoalAction(app, goal.action)) };
    }
    const block = h('div', { class: 'fr-result' }, ...lines,
      // one primary action here; the card's own Back to Garage and Race again stay right under it (never a dead end)
      act ? h('div', { class: 'fr-acts' }, h('button', { class: 'btn primary', onclick: act.run }, h('span', { class: 'stack' }, act.label, act.sub ? h('small', {}, act.sub) : null))) : null);
    // "Race again" from this card is a coached practice run too
    const again = this.cardBtn(/again/i);
    if (again) { again.textContent = 'Practise again'; again.setAttribute('aria-label', `Practise ${eventById(r.eventId).name} again, coached`); again.addEventListener('click', () => this.markPractice(), { capture: true }); }
    const rewards = card.querySelector('.rewards');
    if (rewards) rewards.after(block); else card.prepend(block);
    requestAnimationFrame(() => (block.querySelector('.btn.primary') as HTMLElement | null)?.focus({ preventScroll: true }));
  }

  private cardBtn(re: RegExp): HTMLButtonElement | null {
    return Array.from(this.screen.querySelectorAll<HTMLButtonElement>('.result .btns .btn')).find((b) => re.test(b.textContent ?? '')) ?? null;
  }
  /** Leave through the card's own Back to Garage (it closes the race cleanly), then run `then`. */
  private toGarage(then: () => void) {
    const back = this.cardBtn(/garage/i);
    if (back) back.click();
    else (this.screen.querySelector('.result .btn') as HTMLElement | null)?.click();
    setTimeout(then, 60);
  }
  private markPractice() {
    this.app.game.transact((d) => { d.tips['fr:practice'] = true; return []; });
  }
  private craft(family: string) {
    const garage = this.app.views.garage as unknown as { showPair(family?: string, tier?: number): boolean };
    if (!garage.showPair(family)) rescueOrOrder(this.app);
  }
}

/** No pair of the goal's family on the bench: a free crate of it once in the first session, else the order route. */
export function rescueOrOrder(app: App) {
  const s = app.game.state;
  const rc = rescueCrate(s);
  if (rc && onboardActive(s)) {
    app.game.transact((d) => {
      d.tips['fr:rescue'] = true;
      d.crates.unshift({ kind: 'catchup', family: rc.family, tier: rc.tier, source: 'catchup' });
      return B.openCrates(d);
    });
    app.toast(`A T${rc.tier} ${FAMILIES[rc.family].name} crate, on the house: merge it toward the goal`);
    return;
  }
  const goal = currentGoal(s);
  if (goal) runGoalAction(app, goal.action);
}

/** Skip the guided first session (it can be replayed from How to play). */
export function skipOnboard(app: App) {
  app.game.transact((d) => { finishOnboard(d, Date.now(), true); return []; });
  app.toast('Tutorial skipped. Replay the race coaching from How to play (?).');
}
