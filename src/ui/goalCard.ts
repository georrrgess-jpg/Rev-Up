// The Garage's Next Goal card: one goal at a time — what it rewards, the one thing still missing, and one button
// that goes straight to where that is earned (a race, a craft, an order, a Workshop area, the Parts Shelf or an
// upgrade). "Change goal" picks another from Progression's goal options. Goals come from src/core/goals.ts through
// the contracts adapter (the next car's requirements until that lands).
import * as B from '../core/board';
import * as P from '../core/progression';
import type { SlotRef } from '../core/events';
import type { GameState } from '../core/state';
import { computeLoadout } from '../core/loadout';
import { mph } from '../core/units';
import { FAMILIES, carById, eventById, type CarId } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App } from './app';
import { canPickGoal, currentGoal, goalOptions, openShelfOr, pickGoal, type Goal, type GoalAction } from './contracts';
import { fmt, h } from './dom';
import { openShop } from './shop';
import { JobsPill, initJobsFeedback } from './jobs';

/** The car a goal is about, when it names one we can draw. */
const goalCar = (g: Goal | null): CarId | null => {
  if (!g?.car) return null;
  try { return carById(g.car as CarId).id; } catch { return null; }
};

/** Two-line button text from an action label: the verb big, the rest small ("Merge" / "T5 Engines"). */
export function actionLabel(a: GoalAction): HTMLElement {
  const m = /^(\S+)\s+(.+)$/.exec(a.label.trim());
  return m ? h('span', { class: 'stack' }, m[1], h('small', {}, m[2])) : h('span', { class: 'stack' }, a.label);
}

/** Go straight to where a goal's next step is earned. */
export function runGoalAction(app: App, a: GoalAction) {
  const s = app.game.state;
  const garage = app.views.garage as unknown as { showPair(family?: string, tier?: number): boolean };
  switch (a.kind) {
    case 'race': {
      let ev;
      try { ev = eventById(a.eventId); } catch { ev = null; }
      const race = app.views.race as unknown as { startLive(id: string): void; focusEvent?(id: string): void };
      if (ev && (P.eventUnlocked(s, ev).ok || P.eventUnlocked(s, ev).switchCar)) { race.startLive(ev.id); return; }
      app.go('race');
      return;
    }
    case 'craft':
    case 'merge': {
      if (app.route !== 'garage') app.go('garage');
      const fam = a.kind === 'craft' ? a.family : undefined;
      const tier = a.kind === 'craft' ? a.tier - 1 : undefined;
      if (!garage.showPair(fam, tier)) {
        if (fam) { app.toast(`No T${tier} ${FAMILIES[fam].name} pair on the bench yet — order one`); openShop(app, fam); }
        else app.toast('No pairs on the bench right now');
      }
      return;
    }
    case 'order': openShop(app, a.family, a.currency === 'scrap' ? 'scrap' : 'parts'); return;
    case 'workshop': void import('./mechanic').then((m) => m.openMechanic(app, { area: a.area as never })); return;
    case 'shelf': void openShelfOr(app); return;
    case 'upgrade': openShop(app, undefined, 'garage'); return;
  }
}

export class GoalCard {
  /** The row the Garage mounts: the goal card, and the Job Board pill beside it once the board is open. */
  el: HTMLElement;
  /** The goal card itself. */
  card: HTMLElement;
  readonly jobs: JobsPill;
  private canvas: HTMLCanvasElement;
  private title: HTMLElement;
  private line: HTMLElement;
  private bar: HTMLElement;
  private open: HTMLButtonElement;
  private act: HTMLButtonElement;
  private artKey = '';
  private goal: Goal | null = null;

  constructor(private app: App) {
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.title = h('div', { class: 'gt' });
    this.line = h('div', { class: 'gl' });
    this.bar = h('i');
    this.open = h('button', { class: 'goal-open', onclick: () => this.onTap() }, this.canvas,
      h('div', { class: 'gtxt' }, this.title, this.line, h('div', { class: 'bar' }, this.bar)));
    this.act = h('button', { class: 'btn goal-act', onclick: () => this.onAct() });
    this.card = h('div', { class: 'goal', role: 'group', 'aria-label': 'Next goal', 'data-coach': 'goal' }, this.open, this.act);
    this.jobs = new JobsPill(app);
    this.el = h('div', { class: 'goal-row' }, this.card, this.jobs.el);
    initJobsFeedback(app, this.jobs);
  }

  private get s() { return this.app.game.state; }

  /** The goal's part was just crafted: pulse the card. */
  pulse() { this.card.classList.remove('keystone-hit'); void this.card.offsetWidth; this.card.classList.add('keystone-hit'); }

  render() {
    const s = this.s;
    this.jobs.render();
    this.card.classList.toggle('ready', !!s.pendingReveal);
    if (s.pendingReveal) {
      const c = carById(s.pendingReveal);
      this.goal = null;
      this.setText('Car ready', [h('b', {}, c.model)], 1);
      this.open.setAttribute('aria-label', `Reveal the ${c.model}`);
      this.setAct('Reveal', c.model.split(' ')[0], `Reveal the ${c.model}`);
    } else {
      const g = currentGoal(s);
      this.goal = g;
      if (g) {
        this.setText(g.title, [h('span', { class: 'need', 'data-car': `${g.title} ·` }, g.missing)], g.progress);
        this.open.setAttribute('aria-label', `Next goal: ${g.title}. Still needed: ${g.missing}. Reward: ${g.reward}. Tap for details or to change goal.`);
        // on the card the requirement is already shown beside the button: keep only the destination ("Race" / "Cul-de-sac Dash")
        this.act.replaceChildren(actionLabel({ ...g.action, label: g.action.label.replace(/\s*[:·—]\s.*$/, '') }));
        this.act.setAttribute('aria-label', g.action.label);
        this.act.setAttribute('aria-label', g.action.label);
        this.act.hidden = false;
      } else {
        // every car owned and no goal offered: follow the long collection
        const c = P.collection(s);
        this.setText(`Collection · ${Math.round((c.have / c.total) * 100)}%`, [h('span', { class: 'need' }, c.next)], c.have / c.total);
        this.open.setAttribute('aria-label', `Collection ${c.have} of ${c.total}. Next: ${c.next}`);
        this.setAct('Showroom', '', 'Open the Showroom');
      }
    }
    this.draw();
  }

  private setText(title: string, line: (HTMLElement | string)[], progress: number) {
    if (this.title.textContent !== title) this.title.textContent = title;
    this.line.replaceChildren(...line);
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }
  private setAct(main: string, sub: string, label: string) {
    this.act.replaceChildren(h('span', { class: 'stack' }, main, sub ? h('small', {}, sub) : null));
    this.act.setAttribute('aria-label', label);
    this.act.hidden = false;
  }

  /** The canvas's CSS size, kept by a ResizeObserver so drawing never forces a layout mid-merge. */
  private box: { w: number; h: number } | null = null;
  private watching = false;
  draw() {
    const s = this.s;
    if (!this.watching) {
      this.watching = true;
      new ResizeObserver((en) => { const r = en[0].contentRect; this.box = { w: r.width, h: r.height }; this.draw(); }).observe(this.canvas);
      return;
    }
    if (!this.box || this.box.w < 4) return;
    const id = s.pendingReveal ?? goalCar(this.goal) ?? P.nextCar(s)?.id ?? s.activeCar;
    const covered = !s.owned.includes(id) || !!s.pendingReveal;
    const key = [this.box.w, this.box.h, id, covered, s.paints[id]].join('|');
    if (this.artKey === key) return;
    this.artKey = key;
    const { w, h: hh } = fitCanvas(this.canvas, 2);
    const ctx = this.canvas.getContext('2d')!;
    const cls = carById(id);
    const cw = Math.min(w * .89, hh * 1.92);
    ctx.clearRect(0, 0, w, hh);
    try { drawCar(ctx, id, (w - cw) / 2, hh * .93, cw, { paint: s.paints[id] ?? cls.paint, trim: cls.trim, cover: covered ? 1 : 0 }); } catch { /* art for this car not ready */ }
  }

  private onAct() {
    const s = this.s;
    this.app.game.input();
    if (s.pendingReveal) return this.app.openReveal(s.pendingReveal);
    if (this.goal) return runGoalAction(this.app, this.goal.action);
    this.app.go('showroom');
  }

  private onTap() {
    const s = this.s;
    if (s.pendingReveal) return this.app.openReveal(s.pendingReveal);
    if (!this.goal) return this.app.go('showroom');
    openGoalSheet(this.app);
  }
}

/** The goal in full: why it matters, its reward, each stage, the one action — and the other goals to switch to. */
export function openGoalSheet(app: App) {
  const s = app.game.state;
  const g = currentGoal(s);
  if (!g) return;
  const car = goalCar(g);
  const cur = carById(s.activeCar);
  const nextCar = P.nextCar(s);
  const carWhy = car && nextCar?.id === car
    ? `Fits parts up to T${nextCar.cap} (your ${cur.model}: T${cur.cap}). Stock it runs ${mph(nextCar.base.top)} mph before any parts; your ${cur.model} runs ${mph(computeLoadout(s).stats.top)} mph with its fitted parts.`
    : null;
  const options = goalOptions(s).filter((o) => o.key !== g.key);
  const switchable = canPickGoal(app.game) && options.length > 0;
  const milestone = typeof g.sessionMilestone === 'string' ? g.sessionMilestone : g.sessionMilestone?.label ?? null;
  app.sheet((close) => h('div', { class: 'goal-sheet' },
    h('button', { class: 'btn sm close', onclick: close }, 'Close'),
    h('small', { class: 'req-kind' }, 'Next goal'),
    h('h2', {}, g.title),
    h('p', {}, g.why),
    carWhy ? h('p', { class: 'why' }, carWhy) : null,
    h('div', { class: 'goal-reward' }, h('small', {}, 'Reward'), h('b', {}, g.reward)),
    milestone ? h('p', { class: 'goal-milestone' }, h('b', {}, 'This session: '), milestone) : null,
    h('h3', {}, 'Steps'),
    h('ol', { class: 'goal-stages' }, ...g.stages.map((st) => h('li', { class: st.done ? 'met' : '' },
      h('span', { class: 'tick', 'aria-hidden': 'true' }, st.done ? '✓' : ''), h('span', { class: 'grow' }, st.label),
      st.reward ? h('small', { class: 'st-rew' }, st.reward) : null))),
    h('div', { class: 'goal-acts' },
      h('button', { class: 'btn primary', onclick: () => { close(); runGoalAction(app, g.action); } }, g.action.label),
      g.alt ? h('button', { class: 'btn', onclick: () => { close(); runGoalAction(app, g.alt!); } }, g.alt.label) : null),
    switchable ? h('h3', {}, 'Change goal') : null,
    switchable ? h('div', { class: 'goal-options' }, ...options.map((o) => h('button', {
      class: 'goal-option', onclick: () => { pickGoal(app.game, o.key); close(); app.toast(`Goal: ${o.title}`); },
    }, h('b', {}, o.title), h('span', {}, o.missing), h('small', {}, o.reward)))) : null,
    switchable && s.goalPick ? h('button', { class: 'btn wide', onclick: () => { pickGoal(app.game, null); close(); } }, 'Back to the suggested goal') : null,
    s.rep < (P.goalStatus(s)?.repNeed ?? 0) ? h('p', { class: 'd' }, `Rep ${fmt(s.rep)} — every race earns it and it is never spent.`) : null,
  ));
}

/** Find a mergeable pair (optionally of one family and tier); board parts first. */
export function findPair(s: GameState, family?: string, tier?: number): [SlotRef, SlotRef] | null {
  const refs: SlotRef[] = [...s.board.map((_, i) => ({ zone: 'board' as const, i })), ...s.tray.map((_, i) => ({ zone: 'tray' as const, i }))];
  for (let a = 0; a < refs.length; a++) {
    const pa = B.getPart(s, refs[a]);
    if (!pa || (family && pa.f !== family) || (tier && pa.t !== tier)) continue;
    for (let b = a + 1; b < refs.length; b++) if (B.canFuse(pa, B.getPart(s, refs[b]))) return [refs[a], refs[b]];
  }
  return null;
}
