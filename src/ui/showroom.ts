import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { CarId, ENABLED_CARS, FAMILIES, carById } from '../data/tables';
import { carBodyPath, drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { h } from './dom';

const RUST_RED = '#a8432a';

export class ShowroomView implements View {
  el: HTMLElement;
  private grid: HTMLElement;
  private visible = false;
  private inspectEl: HTMLElement | null = null;
  private raf = 0;

  constructor(private app: App) {
    this.grid = h('div', { class: 'showgrid' });
    this.el = h('section', { class: 'view', 'aria-label': 'Showroom' },
      h('div', { class: 'showtitle' }, h('h1', {}, 'Showroom'), h('span', { class: 'chip', id: 'showcount' }, '')),
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, this.grid));
  }

  show() { this.visible = true; this.render(); }
  hide() { this.visible = false; this.closeInspect(); }
  onEvents(ev: GameEvent[]) { if (this.visible && ev.some((e) => e.type === 'unlock')) this.render(); }

  render() {
    const s = this.app.game.state;
    const owned = ENABLED_CARS.filter((c) => s.owned.includes(c.id)).length;
    (this.el.querySelector('#showcount') as HTMLElement).textContent = `${owned}/${ENABLED_CARS.length} cars`;
    const next = P.nextCar(s);
    const cards = ENABLED_CARS.map((c) => {
      const has = s.owned.includes(c.id);
      const canvas = h('canvas', { 'aria-hidden': 'true' });
      const isNext = next?.id === c.id;
      const card = h('button', {
        class: `carcard${has ? '' : ' locked'}${s.activeCar === c.id ? ' active' : ''}`,
        'aria-label': has ? `${c.name}, ${c.model}. Inspect` : `Locked: ${c.name}`,
        onclick: () => {
          if (s.pendingReveal === c.id) this.app.openReveal(c.id);
          else if (has) this.inspect(c.id);
          else this.app.toast(isNext ? P.goalStatus(s)!.line : `Unlock the cars before the ${c.name} first`);
        },
      },
      canvas,
      h('div', { class: 'cn' }, has ? c.name : isNext ? `${c.name} (next)` : '???'),
      h('div', { class: 'cm' }, has ? `${c.model} · cap T${c.cap}` : c.unlock ? `${c.unlock.rep} Rep + crafted T${c.unlock.tier} ${FAMILIES[c.unlock.family].name}` : ''),
      s.activeCar === c.id ? h('span', { class: 'chip act' }, 'Racing') : null,
      s.pendingReveal === c.id ? h('span', { class: 'chip act', style: 'color:var(--amber2)' }, 'Reveal!') : null);
      requestAnimationFrame(() => {
        const { w, h: hh } = fitCanvas(canvas);
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, hh);
        // bolder lighting as cars improve
        const tier = ENABLED_CARS.indexOf(c);
        if (has) {
          const g = ctx.createRadialGradient(w / 2, hh * 0.2, 4, w / 2, hh * 0.6, w * 0.6);
          g.addColorStop(0, `rgba(255,${200 - tier * 10},${140 - tier * 20},${0.25 + tier * 0.08})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, hh);
        }
        const cw = Math.min(w * 0.9, hh * 2.1);
        drawCar(ctx, c.id, (w - cw) / 2, hh * 0.92, cw, {
          paint: s.paints[c.id] ?? c.paint, trim: c.trim,
          silhouette: !has && !isNext, cover: (!has && isNext) || s.pendingReveal === c.id ? 1 : 0,
        });
      });
      return card;
    });
    this.grid.replaceChildren(...cards);
  }

  inspect(id: CarId) {
    const s = this.app.game.state;
    const c = carById(id);
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const lo = computeLoadout(s, id);
    const hasRust = s.blueprints.length > 0;
    const paintBtn = hasRust
      ? h('button', { class: 'btn sm', onclick: () => {
        const cur = this.app.game.state.paints[id];
        const btn = paintBtn!;
        this.app.game.setPaint(id, cur ? null : RUST_RED);
        btn.textContent = this.app.game.state.paints[id] ? 'Factory paint' : 'Apply Ray’s Rust-Red';
      } }, s.paints[id] ? 'Factory paint' : 'Apply Ray’s Rust-Red')
      : null;
    this.inspectEl = h('div', { class: 'inspect', role: 'dialog', 'aria-label': `${c.name} inspect view` },
      h('button', { class: 'btn sm topx', onclick: () => this.closeInspect() }, 'Close'),
      canvas,
      h('div', { class: 'info' },
        h('h2', {}, c.name),
        h('div', { class: 'm' }, `${c.model} · ${c.district === 'scrapyard' ? 'Scrapyard' : 'Suburbs'} · equip cap T${c.cap}`),
        s.badges.length && id === 'beater' ? h('div', { class: 'badges' }, ...s.badges.map((b) => h('span', { class: 'badge-pill' }, `🏅 ${b}`))) : null,
        h('p', {}, c.blurb),
        h('div', { class: 'statrow' },
          h('span', { class: 'chip' }, `Top ${Math.round(lo.stats.top * 3.6)} km/h`),
          h('span', { class: 'chip' }, `Accel ${lo.stats.accel.toFixed(1)}`),
          h('span', { class: 'chip' }, `Grip ${lo.stats.grip.toFixed(2)}`)),
        h('div', { class: 'fams' },
          paintBtn,
          s.activeCar === id
            ? h('button', { class: 'btn primary', onclick: () => { this.closeInspect(); this.app.go('race'); } }, 'Race it')
            : h('button', { class: 'btn primary', onclick: () => { this.app.game.setActiveCar(id); this.closeInspect(); this.app.toast(`Racing the ${c.name} (parts up to T${c.cap} equip)`); this.app.go('race'); } }, `Race the ${c.name}`)),
      ));
    this.app.root.append(this.inspectEl);
    const t0 = performance.now();
    const reduced = s.settings.reducedMotion;
    const draw = (t: number) => {
      const { w, h: hh, dpr } = fitCanvas(canvas);
      const ctx = canvas.getContext('2d')!;
      const tier = ENABLED_CARS.findIndex((x) => x.id === id);
      const bg = ctx.createRadialGradient(w / 2, hh * 0.25, 10, w / 2, hh * 0.6, Math.max(w, hh) * 0.8);
      bg.addColorStop(0, ['#4a3a2a', '#5a3a2a', '#3a4a5a', '#2a3550'][tier] ?? '#333');
      bg.addColorStop(1, '#0b0907');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, hh);
      // floor
      ctx.fillStyle = '#16110d';
      ctx.fillRect(0, hh * 0.72, w, hh);
      const el = (t - t0) / 1000;
      const sweep = reduced ? 0.5 : (Math.sin(el * 0.8) + 1) / 2;
      const cw = Math.min(w * 0.86, hh * 1.6);
      const x = (w - cw) / 2;
      const y = hh * 0.72;
      // spotlight
      const sp = ctx.createRadialGradient(w / 2, y, 10, w / 2, y, cw * 0.7);
      sp.addColorStop(0, `rgba(255,220,170,${0.18 + tier * 0.05})`);
      sp.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sp;
      ctx.fillRect(0, 0, w, hh);
      drawCar(ctx, id, x, y, cw, { paint: s.paints[id] ?? c.paint, trim: c.trim, headlights: 0.6, wheelAngle: 0 });
      // light sweep across the body
      const lx = x + cw * (sweep * 1.4 - 0.2);
      const lg = ctx.createLinearGradient(lx - 40 * dpr, 0, lx + 40 * dpr, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      carBodyPath(ctx, id, x, y, cw);
      ctx.clip();
      ctx.fillStyle = lg;
      ctx.fillRect(x, y - cw * 0.46, cw, cw * 0.4);
      ctx.restore();
      if (!reduced) this.raf = requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  closeInspect() {
    cancelAnimationFrame(this.raf);
    this.inspectEl?.remove();
    this.inspectEl = null;
    if (this.visible) this.render();
  }
}
