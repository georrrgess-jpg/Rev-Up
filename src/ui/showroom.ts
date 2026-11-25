import type { CarStyle, PaintMaterial, WheelSetId } from '../render/car';
import * as S from '../core/style';
import { carStyle } from '../core/style';
import { sfx } from '../audio';
import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { STYLE_ITEMS, StyleItem, BLUEPRINT_FINISHES, CROWN_FINISH, CarId, DISTRICTS, ENABLED_CARS, EVENTS, RAY_FINISH, SIGNATURE_FINISHES, carById, finishStripe } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App, View } from './app';
import { h } from './dom';
import { fmt } from './dom';

const STAGES: Record<string, { wall: [string, string, string, string]; light: string; floor?: string }> = {
  junker: { wall: ['#10161e', '#243442', '#19212b', '#0c111a'], light: '#b2d3e046' },
  muscle: { wall: ['#140f0c', '#3a2a1d', '#211812', '#0e0a08'], light: '#ffcf8a3a', floor: 'rgba(255,190,120,0.10)' },
  tourer: { wall: ['#06181c', '#14454c', '#0c2a2f', '#051214'], light: '#ffd7a04a', floor: 'rgba(255,215,160,0.12)' },
  tuner: { wall: ['#0e0e10', '#2a2618', '#17150f', '#09090a'], light: '#ffc85a46', floor: 'rgba(255,200,90,0.12)' },
  super: { wall: ['#07051a', '#2a1555', '#140a2e', '#050312'], light: '#c08cff55', floor: 'rgba(200,140,255,0.20)' },
};

function studio(canvas: HTMLCanvasElement, id: CarId, paint: string | undefined, lit = 0, covered = false, locked = false, style?: CarStyle) {
  const { w, h: height } = fitCanvas(canvas, 1.5);
  if (w < 2 || height < 2) return;
  const ctx = canvas.getContext('2d')!;
  const car = carById(id);
  // stages: a plain garage bay for the early cars; prize cars get their own light (owned ones only)
  const st = locked || covered ? STAGES.junker : STAGES[id] ?? STAGES.junker;
  const wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, st.wall[0]);
  wall.addColorStop(.63, st.wall[1]);
  wall.addColorStop(.64, st.wall[2]);
  wall.addColorStop(1, st.wall[3]);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, height);
  const light = ctx.createRadialGradient(w * .56, height * .38, 0, w * .56, height * .38, w * .58);
  light.addColorStop(0, lit ? '#d8b58972' : st.light);
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
  if (st.floor) { const fl = ctx.createRadialGradient(w * .5, height * .78, 0, w * .5, height * .78, w * .5); fl.addColorStop(0, st.floor); fl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = fl; ctx.fillRect(0, height * .6, w, height * .4); }
  const length = Math.min(w * .8, height * 1.7, 740); // room for bumpers, wings and the far side
  drawCar(ctx, id, (w - length * 1.12) / 2 + length * 0.02, height * (height > w * .8 ? .73 : .82), length, {
    paint: paint ?? car.paint,
    trim: car.trim,
    livery: finishStripe(id, paint),
    headlights: lit,
    cover: covered ? 1 : 0,
    silhouette: locked,
    style,
  });
}

const ordinalWord = (n: number) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n] ?? `${n}th`;

export class ShowroomView implements View {
  el: HTMLElement;
  private grid: HTMLElement;
  private count: HTMLElement;
  private visible = false;
  private milestones: HTMLElement;
  private closeDialog: (() => void) | null = null;
  private redrawInspect: (() => void) | null = null;
  private redrawCards: (() => void)[] = [];

  constructor(private app: App) {
    this.grid = h('div', { class: 'showgrid' });
    this.milestones = h('div', { class: 'milestones' });
    this.count = h('span', { class: 'collection-count num' });
    this.el = h('section', { class: 'view', 'aria-label': 'Showroom' },
      h('div', { class: 'showtitle' }, h('h1', {}, 'Showroom'), this.count),
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, this.milestones, this.grid));
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
    this.renderMilestones();
    this.redrawCards = [];
    const cards = ENABLED_CARS.map((car) => {
      const owned = state.owned.includes(car.id);
      const pending = state.pendingReveal === car.id;
      const isNext = next?.car.id === car.id;
      const active = state.activeCar === car.id;
      const canvas = h('canvas', { 'aria-hidden': 'true' });
      const label = pending ? 'Ready to reveal' : active ? 'Current car' : owned ? 'View' : isNext ? 'Next car' : 'Locked';
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
        h('div', { class: 'cm' }, `${car.name} · T${car.cap} parts`),
        h('div', { class: 'car-status' }, label)));
      this.redrawCards.push(() => studio(canvas, car.id, state.paints[car.id], 0, pending || isNext, !owned && !isNext, owned ? carStyle(state, car.id) : undefined));
      return card;
    });
    this.grid.replaceChildren(...cards);
    requestAnimationFrame(() => this.redrawCards.forEach((draw) => draw()));
  }

  /** Collection goals: cars, finishes, medals and trophies, with the next one named. */
  private renderMilestones() {
    const s = this.app.game.state;
    const sigTotal = ENABLED_CARS.filter((c) => SIGNATURE_FINISHES[c.id]).length;
    const sigHave = ENABLED_CARS.filter((c) => SIGNATURE_FINISHES[c.id] && s.livePodiums.includes(c.id)).length;
    const bpHave = BLUEPRINT_FINISHES.filter((b) => s.blueprints.includes(b.name)).length;
    const ta = EVENTS.filter((e) => e.timeAttack);
    const medals = ta.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0);
    const trophies = EVENTS.filter((e) => e.trophy);
    const trophyHave = trophies.filter((e) => s.badges.includes(e.trophy!)).length;
    const row = (label: string, have: number, total: number) =>
      h('div', { class: `ms${have >= total ? ' done' : ''}` }, h('span', { class: 'ms-l' }, label), h('span', { class: 'ms-v num' }, `${have}/${total}`),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((have / Math.max(1, total)) * 100)}%` })));
    const all = s.owned.length + sigHave + bpHave + medals + trophyHave;
    const total = ENABLED_CARS.length + sigTotal + BLUEPRINT_FINISHES.length + ta.length * 3 + trophies.length;
    this.milestones.replaceChildren(
      h('div', { class: 'ms-head' }, h('strong', {}, 'Collection'), h('span', { class: 'num' }, `${Math.round((all / total) * 100)}%`)),
      h('div', { class: 'ms-grid' },
        row('Cars', s.owned.length, ENABLED_CARS.length),
        row('Finishes', sigHave + bpHave, sigTotal + BLUEPRINT_FINISHES.length),
        row('Time medals', medals, ta.length * 3),
        row('Class trophies', trophyHave, trophies.length)),
      ...(s.badges.length ? [h('div', { class: 'badges' }, ...s.badges.map((badge) => h('span', { class: 'badge-pill' }, badge)))] : []),
    );
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
    // Paint shop preview: tapping an item you don't own shows it on the car before you buy.
    let preview: { item: StyleItem } | null = null;
    const draw = () => {
      const st = this.app.game.state;
      const style = { ...carStyle(st, id) };
      let paint = st.paints[id];
      if (preview) {
        const it = preview.item;
        if (it.kind === 'paint') paint = it.value;
        if (it.kind === 'wheel') style.wheel = it.value as WheelSetId;
        if (it.kind === 'material') style.material = it.value as PaintMaterial;
        if (it.kind === 'restore') style.restore = Number(it.value);
      }
      studio(canvas, id, paint, lit ? 1 : 0, false, false, style);
    };
    const lights = h('button', { class: 'btn sm', 'aria-pressed': 'false', onclick: () => {
      lit = !lit;
      lights.setAttribute('aria-pressed', String(lit));
      draw();
    } }, 'Lights');
    const options = [
      { name: 'Factory', paint: car.paint, value: null },
      ...BLUEPRINT_FINISHES.filter((b) => state.blueprints.includes(b.name)).map((b) => ({ ...b, value: b.paint })),
      ...(sig && state.livePodiums.includes(id) ? [{ ...sig, value: sig.paint }] : []),
      ...STYLE_ITEMS.filter((i) => i.kind === 'paint' && (state.owns ?? []).includes(i.id)).map((i) => ({ name: i.name, paint: i.value, value: i.value })),
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
      ...(!state.blueprints.includes(CROWN_FINISH.name) && state.owned.includes('muscle') ? [{ name: CROWN_FINISH.name, paint: CROWN_FINISH.paint, how: 'Win the Coastal Crown in a live race' }] : []),
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
    // ---- Paint shop: colours and wheels fit any car once bought; premium paint is per car ----
    const shop = h('section', { class: 'paintshop', 'aria-label': 'Paint shop' });
    const buyBar = h('div', { class: 'buybar', hidden: '' });
    const renderShop = () => {
      const st = this.app.game.state;
      const items = S.shopItems(st, id);
      const cur = st.style[id] ?? {};
      const groups: [StyleItem['kind'], string, string][] = [
        ['paint', 'Colours', 'Bought once, fits every car.'],
        ['wheel', 'Wheels', 'Bought once, fits every car.'],
        ['material', 'Premium paint', `For the ${car.model} only. Looks only — no performance.`],
        ['restore', 'Restoration', 'Staged jobs on the Tapeback. Permanent.'],
      ];
      const chip = (it: StyleItem) => {
        const own = S.owned(st, it, id);
        const on = (it.kind === 'paint' && st.paints[id] === it.value) || (it.kind === 'wheel' && cur.wheel === it.value)
          || (it.kind === 'material' && cur.material === it.value) || (it.kind === 'restore' && (cur.restore ?? 0) >= Number(it.value));
        const sw = it.kind === 'paint' ? h('span', { class: 'swatch', style: `--paint:${it.value}`, 'aria-hidden': 'true' }) : null;
        return h('button', {
          class: `btn shop-item${on ? ' on' : ''}${own ? ' own' : ''}${preview?.item === it ? ' previewing' : ''}`,
          'aria-pressed': String(on),
          'aria-label': `${it.name}${own ? (on ? ', applied' : ', owned') : `, $${it.price}`}`,
          onclick: () => {
            if (it.kind === 'restore' && own) return;
            if (own) { preview = null; this.app.game.applyStyle(it.id, id); updateFinish(); renderShop(); draw(); return; }
            preview = { item: it }; renderShop(); draw();
          },
        }, sw, h('span', { class: 'stack' }, it.name, h('small', {}, own ? (on ? (it.kind === 'restore' ? 'Done' : 'On') : 'Owned') : `$${fmt(it.price)}`)));
      };
      const factory = (kind: 'wheel' | 'material') => h('button', {
        class: `btn shop-item${!cur[kind] ? ' on' : ''}`, 'aria-pressed': String(!cur[kind]),
        onclick: () => { preview = null; this.app.game.applyStyle(null, id, kind); renderShop(); draw(); },
      }, h('span', { class: 'stack' }, kind === 'wheel' ? 'Factory' : 'Gloss', h('small', {}, 'On car')));
      const blocks = groups.map(([kind, title, note]) => {
        const list = items.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return h('div', { class: 'shop-group' }, h('h3', {}, title), h('p', { class: 'd' }, note),
          h('div', { class: 'shop-items' }, kind === 'wheel' || kind === 'material' ? factory(kind) : null, ...list.map(chip)));
      });
      const locked = STYLE_ITEMS.filter((i) => st.owned.length < i.opens && (i.kind !== 'restore' || id === 'junker'));
      const nextOpen = locked.length ? Math.min(...locked.map((i) => i.opens)) : 0;
      shop.replaceChildren(h('h2', { class: 'shop-title' }, 'Paint shop'), ...blocks.filter((b): b is HTMLDivElement => !!b),
        ...(nextOpen ? [h('p', { class: 'd' }, `${locked.filter((i) => i.opens === nextOpen).length} more items open with your ${ordinalWord(nextOpen)} car.`)] : []), buyBar);
      if (preview) {
        const it = preview.item;
        const short = it.price - st.cash;
        buyBar.hidden = false;
        buyBar.replaceChildren(
          h('div', { class: 'grow' }, h('b', {}, it.name), h('div', { class: 'd' }, it.blurb)),
          h('button', { class: 'btn sm', onclick: () => { preview = null; renderShop(); draw(); } }, 'Cancel'),
          h('button', {
            class: `btn sm${short > 0 ? ' off' : ' primary'}`,
            onclick: () => {
              if (short > 0) { this.app.toast(`Need $${fmt(short)} more for ${it.name}`); return; }
              this.app.game.buyStyle(it.id, id);
              sfx.cash();
              this.app.toast(`${it.name} on your ${car.model}`);
              preview = null; updateFinish(); renderShop(); draw();
            },
          }, short > 0 ? h('span', { class: 'stack' }, `Buy $${fmt(it.price)}`, h('small', {}, `$${fmt(short)} more`)) : `Buy $${fmt(it.price)}`));
      } else buyBar.hidden = true;
    };
    renderShop();
    const closeBtn = h('button', { class: 'btn sm topx', onclick: () => close() }, 'Close');
    const active = state.activeCar === id;
    const dialog = h('div', {
      class: 'inspect', role: 'dialog', 'aria-modal': 'true', 'aria-label': car.model,
      onkeydown: (event) => { if ((event as KeyboardEvent).key === 'Escape') close(); },
    }, closeBtn,
    h('div', { class: 'inspect-stage' }, canvas, lights),
    h('div', { class: 'info scroll' },
      h('h2', {}, car.model),
      h('div', { class: 'm' }, `${car.name} class · ${DISTRICTS[car.district].name} · Parts up to T${car.cap}`),
      h('p', {}, car.blurb),
      car.handling ? h('p', { class: 'handling' }, car.handling) : null,
      h('div', { class: 'statrow' },
        h('span', { class: 'chip' }, `${Math.round(loadout.top * 3.6)} km/h`),
        h('span', { class: 'chip' }, `Accel ${loadout.accel.toFixed(1)}`),
        h('span', { class: 'chip' }, `Grip ${loadout.grip.toFixed(2)}`)),
      finishName, finishButtons,
      sig && !state.livePodiums.includes(id) ? h('p', { class: 'finish-goal' }, `Earn ${sig.name}: finish top 3 in a live race with this car.`) : null,
      shop,
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
        this.grid.querySelector<HTMLButtonElement>(`[data-car="${id}"]`)?.focus({ preventScroll: true });
      }
    };

    this.closeDialog = close;
    this.redrawInspect = draw;
    this.app.root.append(dialog);
    updateFinish();
    draw();
    closeBtn.focus({ preventScroll: true });
  }
}
