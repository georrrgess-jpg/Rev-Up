// The Garage goal card: the next car, why you want it, and exactly what is left. Owned by the mobile UX workstream.
import * as P from '../core/progression';
import { computeLoadout } from '../core/loadout';
import { mph } from '../core/units';
import { FAMILIES, carById, eventById } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App } from './app';
import { repRaces } from './coach';
import { fmt, h } from './dom';
import { openShop } from './shop';
import { JobsPill, initJobsFeedback } from './jobs';

export class GoalCard {
  /** The row the Garage mounts: the goal card, and the Job Board pill beside it once the board is open. */
  el: HTMLElement;
  /** The goal card itself. */
  card: HTMLButtonElement;
  readonly jobs: JobsPill;
  private canvas: HTMLCanvasElement;
  private title: HTMLElement;
  private line: HTMLElement;
  private bar: HTMLElement;
  private artKey = '';

  constructor(private app: App) {
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.title = h('div', { class: 'gt' });
    this.line = h('div', { class: 'gl' });
    this.bar = h('i');
    this.card = h('button', { class: 'goal', 'data-coach': 'goal', onclick: () => this.onTap() }, this.canvas,
      h('div', { class: 'gtxt' }, this.title, this.line, h('div', { class: 'bar' }, this.bar)));
    this.jobs = new JobsPill(app);
    this.el = h('div', { class: 'goal-row' }, this.card, this.jobs.el);
    initJobsFeedback(app, this.jobs);
  }

  private get s() { return this.app.game.state; }

  /** The next car's part was just crafted: pulse the card. */
  pulse() { this.card.classList.remove('keystone-hit'); void this.card.offsetWidth; this.card.classList.add('keystone-hit'); }

  render() {
    const s = this.s;
    const g = P.goalStatus(s);
    this.jobs.render();
    this.card.classList.toggle('ready', !!s.pendingReveal);
    if (s.pendingReveal) {
      const c = carById(s.pendingReveal);
      this.title.textContent = 'Car ready';
      this.card.setAttribute('aria-label', `Reveal the ${c.model}`);
      this.line.replaceChildren(h('span', {}, 'Unveil the ', h('b', {}, c.model)));
      this.bar.style.width = '100%';
    } else if (g) {
      this.title.textContent = `Next car · ${g.car.model}`;
      // Each requirement is its own pill: the craft (and any race win) apart from Rep, which builds from every race.
      // Unmet ones first, so a one-line card on a short phone still shows what is left.
      const reqs: [boolean, HTMLElement][] = [
        [g.keystoneDone, h('span', { class: `req${g.keystoneDone ? ' met' : ''}` }, g.keystoneDone ? `✓ T${g.tier} ${FAMILIES[g.family].name}` : `Craft T${g.tier} ${FAMILIES[g.family].name}`)],
        ...(g.event ? [[g.eventDone, h('span', { class: `req${g.eventDone ? ' met' : ''}` }, `${g.eventDone ? '✓' : 'Win'} ${eventById(g.event).name}`)] as [boolean, HTMLElement]] : []),
        ...(g.car.unlock?.stars ? [[P.starsIn(s) >= g.car.unlock.stars, h('span', { class: `req${P.starsIn(s) >= g.car.unlock.stars ? ' met' : ''}` }, `★ ${Math.min(P.starsIn(s), g.car.unlock.stars)}/${g.car.unlock.stars}`)] as [boolean, HTMLElement]] : []),
        [s.rep >= g.repNeed, h('span', { class: `req rep${s.rep >= g.repNeed ? ' met' : ''}` }, s.rep >= g.repNeed ? '✓ Rep' : `Rep ${fmt(s.rep)}/${fmt(g.repNeed)}`)],
      ];
      this.line.replaceChildren(
        h('span', { class: 'gm' }, g.car.model), // the title's car name, shown in the line when short screens drop the title
        ...reqs.filter(([met]) => !met).map(([, el]) => el), ...reqs.filter(([met]) => met).map(([, el]) => el));
      this.bar.style.width = `${Math.round(g.progress * 100)}%`;
      this.card.setAttribute('aria-label', `Next car: ${g.line}. Tap for details.`);
    } else {
      // every car owned: the card follows the long collection instead of claiming it is complete
      const c = P.collection(s);
      this.title.textContent = `Collection · ${Math.round((c.have / c.total) * 100)}%`;
      this.card.setAttribute('aria-label', `Collection ${c.have} of ${c.total}. Next: ${c.next}`);
      this.line.textContent = c.next;
      this.bar.style.width = `${Math.round((c.have / c.total) * 100)}%`;
    }
    this.draw();
  }

  draw() {
    const s = this.s;
    const { w, h: hh } = fitCanvas(this.canvas, 2);
    const ctx = this.canvas.getContext('2d')!;
    const id = s.pendingReveal ?? P.nextCar(s)?.id ?? s.activeCar;
    const cls = carById(id);
    const cw = Math.min(w * .89, hh * 1.92);
    const covered = !!(s.pendingReveal || P.nextCar(s));
    const key = [w, hh, id, covered, s.paints[id]].join('|');
    if (this.artKey === key) return;
    this.artKey = key;
    ctx.clearRect(0, 0, w, hh);
    drawCar(ctx, id, (w - cw) / 2, hh * .93, cw, { paint: s.paints[id] ?? cls.paint, trim: cls.trim, cover: covered ? 1 : 0 });
  }

  private onTap() {
    const s = this.s;
    if (s.pendingReveal) return this.app.openReveal(s.pendingReveal);
    if (!P.goalStatus(s)) return this.app.go('showroom');
    openGoalSheet(this.app);
  }
}

/** The next car in full: why you want it, then each requirement on its own line with where to earn it. */
export function openGoalSheet(app: App) {
  const s = app.game.state;
  const g = P.goalStatus(s);
  if (!g) return;
  const cur = carById(s.activeCar);
  const fam = FAMILIES[g.family];
  const curTop = mph(computeLoadout(s).stats.top);
  const why = `Fits parts up to T${g.car.cap} (your ${cur.model}: T${cur.cap}). Stock it starts at ${mph(g.car.base.top)} mph before any parts; your ${cur.model} runs ${curTop} mph with its fitted parts.`;
  const ev = P.recommendedEvent(s);
  const req = (done: boolean, title: string, kind: string, status: string, action?: HTMLElement | null) =>
    h('div', { class: `goal-requirement${done ? ' met' : ''}` },
      h('div', { class: 'grow' }, h('small', { class: 'req-kind' }, kind), h('strong', {}, `${done ? '✓ ' : ''}${title}`), h('span', { class: 'req-status' }, status)),
      done ? null : action ?? null);
  app.sheet((close) => h('div', { class: 'goal-sheet' },
    h('button', { class: 'btn sm close', onclick: close }, 'Close'),
    h('h2', {}, `Next car · ${g.car.model}`),
    h('p', {}, g.car.blurb),
    h('p', { class: 'why' }, h('b', {}, 'Why you want it: '), why),
    h('h3', {}, 'To unlock it'),
    req(g.keystoneDone, `Craft a T${g.tier} ${fam.name}`, 'Craft · merge it yourself',
      g.keystoneDone ? 'Crafted' : `${g.bestHeld ? `Your best ${fam.name} is T${g.bestHeld}. ` : ''}Two T${g.tier - 1}s merge into one. Crate drops of that tier don't count.`,
      h('button', { class: 'btn sm', onclick: () => { close(); openShop(app, g.family); } }, `Buy ${fam.plural}`)),
    g.event ? req(g.eventDone, `Win ${eventById(g.event).name}`, 'Race win', g.eventDone ? 'Won' : P.eventUnlocked(s, eventById(g.event)).ok ? 'Open now in the Race tab' : `Opens when: ${P.eventUnlocked(s, eventById(g.event)).why}`,
      h('button', { class: 'btn sm', onclick: () => { close(); app.go('race'); } }, 'Race')) : null,
    g.car.unlock?.stars ? req(P.starsIn(s) >= g.car.unlock.stars, `${g.car.unlock.stars} Downtown stars`, 'Event goals', `${P.starsIn(s)} of ${g.car.unlock.stars}`,
      h('button', { class: 'btn sm', onclick: () => { close(); app.go('race'); } }, 'Race')) : null,
    req(s.rep >= g.repNeed, `Reach ${fmt(g.repNeed)} Rep`, 'Rep · earned by racing, never spent',
      s.rep >= g.repNeed ? `You have ${fmt(s.rep)}` : `${fmt(s.rep)} / ${fmt(g.repNeed)} — ${fmt(g.repNeed - s.rep)} to go, ${repRaces(app)} (${ev.payout.rep[0]} Rep each).`,
      h('button', { class: 'btn sm', onclick: () => { close(); app.go('race'); } }, 'Race')),
    h('p', { class: 'd' }, 'All requirements count at once: the car arrives the moment the last one is met.'),
  ));
}
