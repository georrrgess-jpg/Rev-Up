import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { CarId, DISTRICTS, ENABLED_CARS, RAY_FINISH, SIGNATURE_FINISHES, carById, finishStripe } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { h } from './dom';

function studio(canvas: HTMLCanvasElement, id: CarId, paint: string | undefined, lit = 0, covered = false, locked = false) {
  const { w, h: height } = fitCanvas(canvas, 1.5);
  if (w < 2 || height < 2) return;
  const ctx = canvas.getContext('2d')!;
  const car = carById(id);
  const wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, '#10161e');
  wall.addColorStop(.63, '#243442');
  wall.addColorStop(.64, '#19212b');
  wall.addColorStop(1, '#0c111a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, height);
  const light = ctx.createRadialGradient(w * .56, height * .38, 0, w * .56, height * .38, w * .58);
  light.addColorStop(0, lit ? '#d8b58972' : '#b2d3e046');
  light.addColorStop(1, '#212e4000');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, height);
  ctx.strokeStyle = '#d2e3eb24';
  ctx.lineWidth = 1;
  for (const x of [.12, .34, .66, .88]) {
    ctx.beginPath();
    ctx.moveTo(w * x, 0);
    ctx.lineTo(w * x, height * .64);
    ctx.lineTo(w * (.5 + (x - .5) * 1.9), height);
    ctx.stroke();
  }
  const length = Math.min(w * .78, height * 1.5, 680);
  drawCar(ctx, id, (w - length * 1.06) / 2, height * (height > w * .8 ? .73 : .82), length, {
    paint: paint ?? car.paint,
    trim: car.trim,
    livery: finishStripe(id, paint),
    headlights: lit,
    cover: covered ? 1 : 0,
    silhouette: locked,
  });
}

export class ShowroomView implements View {
  el: HTMLElement;
  private grid: HTMLElement;
  private count: HTMLElement;
  private visible = false;
  private closeDialog: (() => void) | null = null;
  private redrawInspect: (() => void) | null = null;
  private redrawCards: (() => void)[] = [];

  constructor(private app: App) {
    this.grid = h('div', { class: 'showgrid' });
    this.count = h('span', { class: 'collection-count num' });
    this.el = h('section', { class: 'view', 'aria-label': 'Showroom' },
      h('div', { class: 'showtitle' }, h('h1', {}, 'Showroom'), this.count),
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, this.grid));
    window.addEventListener('resize', () => {
      if (!this.visible) return;
      for (const draw of this.redrawCards) draw();
      this.redrawInspect?.();
    });
  }

  show() { this.visible = true; this.render(); }
  hide() { this.visible = false; this.closeDialog?.(); }
  onEvents(ev: GameEvent[]) { if (this.visible && ev.some((e) => e.type === 'unlock')) this.render(); }

  render() {
    const state = this.app.game.state;
    const next = P.goalStatus(state);
    this.count.textContent = `${state.owned.length} of ${ENABLED_CARS.length} collected`;
    this.redrawCards = [];
    const cards = ENABLED_CARS.map((car) => {
      const owned = state.owned.includes(car.id);
      const pending = state.pendingReveal === car.id;
      const isNext = next?.car.id === car.id;
      const active = state.activeCar === car.id;
      const canvas = h('canvas', { 'aria-hidden': 'true' });
      const label = pending ? 'Ready to reveal' : active ? 'Current car' : owned ? 'Inspect' : isNext ? 'Next unlock' : 'Locked';
      const card = h('button', {
        class: `carcard${owned ? '' : ' locked'}${active ? ' active' : ''}`,
        'aria-label': `${car.model}, ${label}`,
        'data-car': car.id,
        onclick: () => {
          if (pending) this.app.openReveal(car.id);
          else if (owned) this.inspect(car.id);
          else if (isNext) this.app.toast(next.line, { label: 'Garage', run: () => this.app.go('garage') });
          else this.app.toast(`Collect the previous cars to reach the ${car.model}`);
        },
      }, canvas,
      h('div', { class: 'carcard-info' },
        h('div', { class: 'cn' }, car.model),
        h('div', { class: 'cm' }, `${car.name} · Parts up to T${car.cap}`),
        h('div', { class: 'car-status' }, label)));
      this.redrawCards.push(() => studio(canvas, car.id, state.paints[car.id], 0, pending || isNext, !owned && !isNext));
      return card;
    });
    this.grid.replaceChildren(...cards);
    requestAnimationFrame(() => this.redrawCards.forEach((draw) => draw()));
  }

  private inspect(id: CarId) {
    this.closeDialog?.();
    const state = this.app.game.state;
    const car = carById(id);
    const loadout = computeLoadout(state, id).stats;
    const sig = SIGNATURE_FINISHES[id];
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const finishButtons = h('div', { class: 'finish-options' });
    const finishName = h('div', { class: 'finish-title' });
    let lit = false;
    const draw = () => studio(canvas, id, this.app.game.state.paints[id], lit ? 1 : 0);
    const lights = h('button', { class: 'btn sm', 'aria-pressed': 'false', onclick: () => {
      lit = !lit;
      lights.setAttribute('aria-pressed', String(lit));
      draw();
    } }, 'Lights');
    const options = [
      { name: 'Factory', paint: car.paint, value: null },
      ...(state.blueprints.includes(RAY_FINISH.name) ? [{ ...RAY_FINISH, value: RAY_FINISH.paint }] : []),
      ...(sig && state.livePodiums.includes(id) ? [{ ...sig, value: sig.paint }] : []),
    ];
    const applyFinish = (value: string | null) => {
      this.app.game.setPaint(id, value);
      updateFinish();
      draw();
    };
    for (const item of options) {
      finishButtons.append(h('button', {
        class: 'btn finish-choice', 'data-finish': item.value ?? '', onclick: () => applyFinish(item.value),
      }, h('span', { class: 'swatch', style: `--paint:${item.paint}`, 'aria-hidden': 'true' }), item.name));
    }
    const lockedFinishes = [
      ...(sig && !state.livePodiums.includes(id) ? [{ name: sig.name, paint: sig.paint, how: 'Top 3 in a live race with this car' }] : []),
      ...(!state.blueprints.includes(RAY_FINISH.name) ? [{ name: RAY_FINISH.name, paint: RAY_FINISH.paint, how: 'Beat Rusty Ray in a live race' }] : []),
    ];
    for (const item of lockedFinishes) {
      finishButtons.append(h('button', {
        class: 'btn finish-choice locked', 'aria-disabled': 'true', 'aria-label': `${item.name}, locked: ${item.how}`,
        onclick: () => this.app.toast(`${item.name}: ${item.how}`),
      }, h('span', { class: 'swatch', style: `--paint:${item.paint}`, 'aria-hidden': 'true' }), `🔒 ${item.name}`));
    }
    const updateFinish = () => {
      const paint = this.app.game.state.paints[id] ?? '';
      const name = options.find((option) => (option.value ?? '') === paint)?.name ?? 'Custom';
      finishName.textContent = `Finish · ${name}`;
      for (const button of finishButtons.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.finish === paint));
      }
    };
    const closeBtn = h('button', { class: 'btn sm topx', onclick: () => close() }, 'Close');
    const active = state.activeCar === id;
    const dialog = h('div', {
      class: 'inspect', role: 'dialog', 'aria-modal': 'true', 'aria-label': car.model,
      onkeydown: (event) => { if ((event as KeyboardEvent).key === 'Escape') close(); },
    }, closeBtn,
    h('div', { class: 'inspect-stage' }, canvas, lights),
    h('div', { class: 'info scroll' },
      h('h2', {}, car.model),
      h('div', { class: 'm' }, `${car.name} · ${DISTRICTS[car.district].name} · Parts up to T${car.cap}`),
      h('p', {}, car.blurb),
      h('div', { class: 'statrow' },
        h('span', { class: 'chip' }, `${Math.round(loadout.top * 3.6)} km/h`),
        h('span', { class: 'chip' }, `Accel ${loadout.accel.toFixed(1)}`),
        h('span', { class: 'chip' }, `Grip ${loadout.grip.toFixed(2)}`)),
      state.badges.length && id === 'beater' ? h('div', { class: 'badges' }, ...state.badges.map((badge) => h('span', { class: 'badge-pill' }, badge))) : null,
      finishName, finishButtons,
      sig && !state.livePodiums.includes(id) ? h('p', { class: 'finish-goal' }, `Earn ${sig.name}: finish top 3 in a live race with this car.`) : null,
      h('div', { class: 'inspect-actions' },
        h('button', { class: 'btn', onclick: () => {
          close();
          this.app.replayReveal(id);
        } }, 'Replay reveal'),
        h('button', { class: 'btn primary inspect-race', onclick: () => {
          if (!active) { this.app.game.setActiveCar(id); this.app.toast(`Racing the ${car.model} · parts up to T${car.cap} equip`); }
          close();
          this.app.go('race');
        } }, 'Race this car')),
    ));
    void active;
    const close = () => {
      dialog.remove();
      this.closeDialog = null;
      this.redrawInspect = null;
      if (this.visible) {
        this.render();
        this.grid.querySelector<HTMLButtonElement>(`[data-car="${id}"]`)?.focus();
      }
    };

    this.closeDialog = close;
    this.redrawInspect = draw;
    this.app.root.append(dialog);
    updateFinish();
    draw();
    closeBtn.focus();
  }
}
