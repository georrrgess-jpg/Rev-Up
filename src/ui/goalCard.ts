// The Garage goal card: the next car, why you want it, and exactly what is left. Owned by the mobile UX workstream.
import * as P from '../core/progression';
import { FAMILIES, carById, eventById } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App } from './app';
import { h } from './dom';
import { openShop } from './shop';


export class GoalCard {
  el: HTMLButtonElement;
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
    this.el = h('button', { class: 'goal', onclick: () => this.onTap() }, this.canvas,
      h('div', { class: 'gtxt' }, this.title, this.line, h('div', { class: 'bar' }, this.bar)));
  }

  private get s() { return this.app.game.state; }

  /** The next car's part was just crafted: pulse the card. */
  pulse() { this.el.classList.remove('keystone-hit'); void this.el.offsetWidth; this.el.classList.add('keystone-hit'); }

  render() {
    const s = this.s;
    const g = P.goalStatus(s);
    this.el.classList.toggle('ready', !!s.pendingReveal);
    if (s.pendingReveal) {
      const c = carById(s.pendingReveal);
      this.title.textContent = 'Car ready';
      this.el.setAttribute('aria-label', `Reveal the ${c.model}`);
      this.line.innerHTML = `Unveil the <b>${c.model}</b>`;
      this.bar.style.width = '100%';
    } else if (g) {
      this.title.textContent = `Next car · ${g.car.model}`;
      this.line.replaceChildren(
        h('span', { class: g.keystoneDone ? 'met' : '' }, `${g.keystoneDone ? '✓' : 'Craft'} T${g.tier} ${FAMILIES[g.family].name}`),
        ...(g.event ? [h('span', { class: g.eventDone ? 'met' : '' }, `${g.eventDone ? '✓' : 'Win'} ${eventById(g.event).name}`)] : []),
        ...(g.car.unlock?.stars ? [h('span', { class: P.starsIn(s) >= g.car.unlock.stars ? 'met' : '' }, `★ ${Math.min(P.starsIn(s), g.car.unlock.stars)}/${g.car.unlock.stars}`)] : []),
        h('span', { class: s.rep >= g.repNeed ? 'met' : '' }, s.rep >= g.repNeed ? '✓ Rep' : `${s.rep}/${g.repNeed} Rep`));

      this.bar.style.width = `${Math.round(g.progress * 100)}%`;
      this.el.setAttribute('aria-label', `Next car: ${g.line}`);
    } else {
      // every car owned: the card follows the long collection instead of claiming it is complete
      const c = P.collection(s);
      this.title.textContent = `Collection · ${Math.round((c.have / c.total) * 100)}%`;
      this.el.setAttribute('aria-label', `Collection ${c.have} of ${c.total}. Next: ${c.next}`);
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
      h('h2', {}, g.car.model),
      h('p', {}, g.car.blurb),
      h('div', { class: 'goal-requirement' }, h('strong', {}, `Craft T${g.tier} ${FAMILIES[g.family].name}`),
        h('span', {}, g.keystoneDone ? 'Complete' : g.keyProgress >= 1 ? 'Ingredients ready' : `${Math.round(g.keyProgress * 100)}% of ingredients`)),
      h('div', { class: 'goal-requirement' }, h('strong', {}, 'Earn reputation'),
        h('span', {}, `${g.repHave} / ${g.repNeed} Rep`)),
      ...tips.map((t) => h('p', {}, t)),
      !g.keystoneDone ? h('button', { class: 'btn wide', onclick: () => { close(); openShop(this.app); } }, `Get ${FAMILIES[g.family].name} crates`) : null,
      s.rep < g.repNeed ? h('button', { class: 'btn wide goal-race', onclick: () => { close(); this.app.go('race'); } }, 'Browse races') : null,
    ));
  }
}
