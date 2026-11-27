import type { CarStyle, PaintMaterial, WheelSetId } from '../render/car';
import * as S from '../core/style';
import { carStyle } from '../core/style';
import { sfx } from '../audio';
import type { GameEvent } from '../core/events';
import { computeLoadout } from '../core/loadout';
import * as P from '../core/progression';
import { STYLE_ITEMS, StyleItem, BLUEPRINT_FINISHES, CROWN_FINISH, CarId, DISTRICTS, ENABLED_CARS, EVENTS, RAY_FINISH, SIGNATURE_FINISHES, carById, finishStripe } from '../data/tables';
import { FACTORY_LOOKS, LIVERIES, PLATFORM_CARS, drawCar, fitCanvas } from '../render/car';
import { mph } from '../core/units';
import { openFitParts } from './fit';
import type { App, View } from './app';
import { h } from './dom';
import { fmt } from './dom';

const STAGES: Record<string, { wall: [string, string, string, string]; light: string; floor?: string }> = {
  junker: { wall: ['#10161e', '#243442', '#19212b', '#0c111a'], light: '#b2d3e046' },
  muscle: { wall: ['#140f0c', '#3a2a1d', '#211812', '#0e0a08'], light: '#ffcf8a3a', floor: 'rgba(255,190,120,0.10)' },
  tourer: { wall: ['#06181c', '#14454c', '#0c2a2f', '#051214'], light: '#ffd7a04a', floor: 'rgba(255,215,160,0.12)' },
  tuner: { wall: ['#0e0e10', '#2a2618', '#17150f', '#09090a'], light: '#ffc85a46', floor: 'rgba(255,200,90,0.12)' },
  super: { wall: ['#07051a', '#2a1555', '#140a2e', '#050312'], light: '#c08cff55', floor: 'rgba(200,140,255,0.20)' },
  beater: { wall: ['#140c0a', '#3d2620', '#21140f', '#0c0706'], light: '#ffc9a046', floor: 'rgba(255,170,130,0.10)' },
  hothatch: { wall: ['#0a0e1a', '#22304f', '#141b2e', '#070a12'], light: '#e6eeff4a', floor: 'rgba(255,70,80,0.12)' },
  rally: { wall: ['#07101f', '#1d3b6b', '#10203d', '#050a14'], light: '#e8f0ff50', floor: 'rgba(245,197,24,0.14)' },
  gt: { wall: ['#140707', '#4a1818', '#260c0c', '#0c0404'], light: '#ffe6dc4a', floor: 'rgba(255,60,46,0.16)' },
  proto: { wall: ['#020b0d', '#0f3d44', '#082226', '#020809'], light: '#b8fff250', floor: 'rgba(54,240,208,0.18)' },
  vireo: { wall: ['#0d0606', '#3c1612', '#1e0b09', '#080303'], light: '#ffe2d650', floor: 'rgba(226,60,46,0.18)' },
  mako: { wall: ['#040806', '#17271f', '#0c1510', '#030504'], light: '#e8ffc04a', floor: 'rgba(199,242,58,0.16)' },
  sovereign: { wall: ['#0a0805', '#2e2416', '#17120b', '#060503'], light: '#ffeccb58', floor: 'rgba(201,162,74,0.2)' },
};
/** Factory look; the new cars use their art palette until the tables give them their own. */
const lookOf = (id: CarId) => { const c = carById(id); const f = FACTORY_LOOKS[id]; return c.paint === '#555' && f ? f : { paint: c.paint, trim: c.trim }; };

/** Rendered detailed cars, reused while a platform turns (one entry per canvas). */
const carBitmaps = new WeakMap<HTMLCanvasElement, { key: string; cv: HTMLCanvasElement }>();

/**
 * Draw a car in its stage. `turn` (0..1) is the platform turn for the supercars: 0 = angled away, 1 = hero side
 * view. The supercars stand on a round platform under a spotlight; the rest on a low plinth.
 */
function studio(canvas: HTMLCanvasElement, id: CarId, paint: string | undefined, lit = 0, covered = false, locked = false, style?: CarStyle, turn = 1) {
  const { w, h: height } = fitCanvas(canvas, 1.5);
  if (w < 2 || height < 2) return;
  const ctx = canvas.getContext('2d')!;
  const car = lookOf(id);
  const platform = !locked && !covered && PLATFORM_CARS.includes(id);
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
  const length = Math.min(w * (platform ? .74 : .8), height * (platform ? 1.5 : 1.7), 740); // room for bumpers, wings and the far side
  const gy = height * (height > w * .8 ? .73 : platform ? .78 : .82);
  const x0 = (w - length * 1.12) / 2 + length * 0.02;
  const opts = {
    paint: paint ?? car.paint, trim: car.trim, livery: finishStripe(id, paint), headlights: lit,
    cover: covered ? 1 : 0, silhouette: locked, style, light: platform ? 0.55 + 0.3 * lit : lit * 0.3,
  };
  if (!platform) {
    if (!locked) {
      // a low display plinth under the car with a soft rim light in the stage colour
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(w / 2, gy - length * 0.03, length * 0.62, length * 0.085, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = st.floor ?? 'rgba(210,230,240,0.14)'; ctx.lineWidth = Math.max(1, length * 0.006);
      ctx.beginPath(); ctx.ellipse(w / 2, gy - length * 0.03, length * 0.62, length * 0.085, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    }
    drawCar(ctx, id, x0, gy, length, opts);
    if (!locked && !covered && (style?.concours ?? 0) >= 3) rosette(ctx, w, height);
    return;
  }
  // ---- the supercar platform: a spotlight cone, a polished turning disc with rim lights, a reflection
  const px = w / 2, py = gy - length * 0.02;
  const rx = Math.min(w * 0.49, length * 0.64), ry = rx * 0.16, th = Math.max(3, ry * 0.38);
  const spot = (st.floor ?? 'rgba(255,240,220,0.2)').replace(/[\d.]+\)$/, '');
  const cone = ctx.createLinearGradient(0, 0, 0, py);
  cone.addColorStop(0, `${spot}0.42)`); cone.addColorStop(1, `${spot}0.06)`);
  ctx.fillStyle = cone;
  ctx.beginPath(); ctx.moveTo(px - rx * 0.1, 0); ctx.lineTo(px + rx * 0.1, 0); ctx.lineTo(px + rx * 1.05, py); ctx.lineTo(px - rx * 1.05, py); ctx.closePath(); ctx.fill();
  const pool = ctx.createRadialGradient(px, py + th, rx * 0.3, px, py + th, rx * 1.5);
  pool.addColorStop(0, `${spot}0.3)`); pool.addColorStop(1, `${spot}0)`);
  ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(px, py + th, rx * 1.5, ry * 2, 0, 0, Math.PI * 2); ctx.fill();
  const side = ctx.createLinearGradient(px - rx, 0, px + rx, 0);
  side.addColorStop(0, '#121418'); side.addColorStop(0.5, '#3d4249'); side.addColorStop(1, '#0e1013');
  ctx.fillStyle = side;
  ctx.beginPath(); ctx.ellipse(px, py + th, rx, ry, 0, 0, Math.PI); ctx.lineTo(px - rx, py); ctx.ellipse(px, py, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
  const top = ctx.createRadialGradient(px, py - ry * 0.3, rx * 0.1, px, py, rx);
  top.addColorStop(0, '#4b4f57'); top.addColorStop(0.7, '#25282e'); top.addColorStop(1, '#17191d');
  ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  // rim lights chase round the front edge as the platform turns
  const ang = (turn - 1) * Math.PI * 0.9;
  ctx.fillStyle = `${spot}1)`;
  for (let i = 0; i < 18; i++) {
    const a = ang + (i / 18) * Math.PI * 2, sn = Math.sin(a);
    if (sn < 0) continue;
    ctx.globalAlpha = 0.25 + 0.75 * sn;
    ctx.fillRect(px + Math.cos(a) * rx - 2, py + sn * ry + th * 0.45 - 1.5, 4, 3);
  }
  ctx.globalAlpha = 1;
  // the car itself is rendered once per size and look, then scaled through the turn
  const bw = Math.round(length);
  const key = `${bw}|${id}|${JSON.stringify(opts)}`;
  let bm = carBitmaps.get(canvas);
  if (!bm || bm.key !== key) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(bw * 1.3); cv.height = Math.round(bw * 0.5);
    drawCar(cv.getContext('2d')!, id, bw * 0.06, bw * 0.42, bw, { ...opts, shadow: false, detail: true });
    bm = { key, cv };
    carBitmaps.set(canvas, bm);
  }
  const sx = 0.72 + 0.28 * turn;
  const dx = x0 - bw * 0.06, dy = gy - bw * 0.42;
  const blit = (alpha: number) => {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(px, 0); ctx.scale(sx, 1); ctx.translate(-px, 0);
    ctx.drawImage(bm!.cv, dx, dy);
    ctx.restore();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(px, gy - length * 0.02, length * 0.55 * sx, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  ctx.translate(0, gy * 2); ctx.scale(1, -1);
  blit(0.14);
  ctx.restore();
  blit(1);
  if (turn < 1) {
    // a highlight runs along the paint as the car comes round
    const hx = px + length * sx * (0.6 - 1.2 * turn);
    const g = ctx.createLinearGradient(hx - length * 0.12, 0, hx + length * 0.12, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - length * 0.1, gy - length * 0.4, length * 1.3, length * 0.42); ctx.clip();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.fillStyle = g;
    ctx.fillRect(hx - length * 0.12, gy - length * 0.36, length * 0.24, length * 0.36); ctx.restore();
  }
  if ((style?.concours ?? 0) >= 3) rosette(ctx, w, height);
}

/** The Concours rosette: a gold award rosette with two ribbons in the stage's bottom-left corner. */
function rosette(ctx: CanvasRenderingContext2D, w: number, height: number) {
  const r = Math.max(9, Math.min(w, height) * 0.06);
  const cx = r * 1.6, cy = height - r * 2.3;
  ctx.save();
  ctx.fillStyle = '#1f4fa8';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(cx + s * r * 0.2, cy); ctx.lineTo(cx + s * r * 0.85, cy + r * 1.9); ctx.lineTo(cx + s * r * 0.5, cy + r * 1.65); ctx.lineTo(cx + s * r * 0.3, cy + r * 1.95); ctx.lineTo(cx - s * r * 0.15, cy + r * 0.2); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#e2b44a';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? r : r * 0.82; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff3cf'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a6416'; ctx.font = `900 ${Math.round(r * 0.62)}px Barlow, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('1st', cx, cy + r * 0.04);
  ctx.restore();
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

  /** The hero stage: one car filling the top of the screen, with who it is, what to earn next and why to race it. */
  private hero: HTMLElement;
  private heroCanvas: HTMLCanvasElement;
  private heroInfo: HTMLElement;
  private heroId: CarId | null = null;

  constructor(private app: App) {
    this.grid = h('div', { class: 'showgrid' });
    this.milestones = h('div', { class: 'milestones' });
    this.count = h('span', { class: 'collection-count num' });
    this.heroCanvas = h('canvas', { 'aria-hidden': 'true' });
    this.heroInfo = h('div', { class: 'hero-info' });
    this.hero = h('section', { class: 'show-hero', 'aria-label': 'Your car' }, this.heroCanvas, this.heroInfo);
    this.el = h('section', { class: 'view showroom-view', 'aria-label': 'Showroom' },
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, this.hero,
        h('div', { class: 'showtitle' }, h('h2', {}, 'Collection'), this.count), this.grid,
        h('details', { class: 'ms-drawer' }, h('summary', {}, 'Collection goals · finishes, medals, trophies'), this.milestones)));
    window.addEventListener('resize', () => {
      if (!this.visible) return;
      for (const draw of this.redrawCards) draw();
      this.drawHero();
      this.redrawInspect?.();
    });
  }

  /** Why to race this car now: its own class meet or event, else the recommended race when it is the active car. */
  private reasonToRace(id: CarId): { text: string; eventId: string | null } {
    const s = this.app.game.state;
    const own = EVENTS.find((e) => !e.heatOf && (e.carOnly === id || e.requires.car === id) && P.eventUnlocked(s, e).ok && !s.events[e.id]?.wins);
    if (own) return { text: `${own.name} is made for it${own.payout ? ` · win pays $${fmt(own.payout.cash[0])}` : ''}`, eventId: own.id };
    if (s.activeCar === id) { const r = P.recommendedEvent(s); return { text: `${r.name} · ${P.eventReason(s, r)}`, eventId: r.id }; }
    const m = P.masteryFor(s, id);
    return { text: m.races ? `${m.wins} win${m.wins === 1 ? '' : 's'} in ${m.races} race${m.races === 1 ? '' : 's'} — take it out again` : 'Not raced yet — its first live podium earns its signature finish', eventId: null };
  }

  /** The next thing to collect for this car: its signature finish, Concours stages, or the collection's next item. */
  private nextCollectible(id: CarId): string {
    const s = this.app.game.state;
    const sig = SIGNATURE_FINISHES[id];
    if (sig && !s.livePodiums.includes(id)) return `${sig.name} finish · top 3 in a live race`;
    const cc = s.concours?.[id] ?? 0;
    if (s.owned.length >= 4 && cc < 3) return `Concours stage ${cc + 1} of 3 · restoration in the Workshop`;
    return P.collection(s).next;
  }

  private renderHero() {
    const s = this.app.game.state;
    const owned = s.owned.filter((c) => ENABLED_CARS.some((e) => e.id === c));
    if (!this.heroId || !owned.includes(this.heroId)) this.heroId = s.activeCar;
    const id = this.heroId;
    const car = carById(id);
    const lo = computeLoadout(s, id).stats;
    const why = this.reasonToRace(id);
    const idx = owned.indexOf(id);
    const step = (d: number) => { this.heroId = owned[(idx + d + owned.length) % owned.length]; this.renderHero(); };
    const active = s.activeCar === id;
    this.heroInfo.replaceChildren(...([
      owned.length > 1 ? h('button', { class: 'hero-nav prev', 'aria-label': 'Previous car', onclick: () => step(-1) }, '‹') : null,
      owned.length > 1 ? h('button', { class: 'hero-nav next', 'aria-label': 'Next car', onclick: () => step(1) }, '›') : null,
      h('div', { class: 'hero-id' },
        h('small', {}, `${car.name} · ${DISTRICTS[car.district].name}${active ? ' · racing now' : ''}`),
        h('h1', {}, car.model),
        h('div', { class: 'hero-stats' },
          h('span', {}, h('b', { class: 'num' }, `${mph(lo.top)}`), ' mph'),
          h('span', {}, 'Accel ', h('b', { class: 'num' }, lo.accel.toFixed(1))),
          h('span', {}, 'Grip ', h('b', { class: 'num' }, lo.grip.toFixed(2))),
          h('span', {}, 'Parts ', h('b', {}, `T${car.cap}`)))),
      h('div', { class: 'hero-lines' },
        h('p', {}, h('small', {}, 'Next to earn'), this.nextCollectible(id)),
        h('p', {}, h('small', {}, 'Race it'), why.text)),
      h('div', { class: 'hero-acts' },
        h('button', { class: 'btn', onclick: () => this.inspect(id) }, h('span', { class: 'stack' }, 'Customize', h('small', {}, 'paint · wheels'))),
        h('button', { class: 'btn', onclick: () => this.compare(id) }, h('span', { class: 'stack' }, 'Compare', h('small', {}, 'vs your cars'))),
        h('button', { class: 'btn primary', onclick: () => {
          if (!active) { this.app.game.setActiveCar(id); this.app.toast(`Racing the ${car.model}`); }
          const race = this.app.views.race as unknown as { jumpToEvent?(id: string): void };
          this.app.go('race');
          if (why.eventId) requestAnimationFrame(() => race.jumpToEvent?.(why.eventId!));
        } }, h('span', { class: 'stack' }, active ? 'Race it' : 'Race this car', h('small', {}, why.eventId ? 'see the race' : 'Race menu')))),
    ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    this.hero.style.setProperty('--hero-tint', (STAGES[id]?.light ?? '#b2d3e046').slice(0, 7));
    requestAnimationFrame(() => this.drawHero());
  }

  private drawHero() {
    const id = this.heroId;
    if (!id || !this.visible) return;
    const s = this.app.game.state;
    studio(this.heroCanvas, id, s.paints[id], 0, false, false, carStyle(s, id), 1);
  }

  /** Side-by-side stats: this car against every other car you own (and the next car, stock). */
  private compare(id: CarId) {
    const s = this.app.game.state;
    const rows = s.owned.filter((c) => ENABLED_CARS.some((e) => e.id === c)).map((c) => ({ id: c, st: computeLoadout(s, c).stats, cap: carById(c).cap, stock: false }));
    const nx = P.nextCar(s);
    if (nx) rows.push({ id: nx.id, st: nx.base, cap: nx.cap, stock: true });
    const me = rows.find((r) => r.id === id)!.st;
    const d = (v: number, base: number, k = 1, dp = 0) => {
      const x = Math.round((v - base) * k * 10 ** dp) / 10 ** dp;
      return x === 0 ? null : h('small', { class: x > 0 ? 'up' : 'down' }, `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(dp)}`);
    };
    this.app.sheet((close) => h('div', { class: 'compare' },
      h('button', { class: 'btn sm close', onclick: close }, 'Close'),
      h('h2', {}, `Compare · ${carById(id).model}`),
      h('table', { class: 'cmp-table' },
        h('tr', {}, h('th', {}, 'Car'), h('th', {}, 'Top'), h('th', {}, 'Accel'), h('th', {}, 'Grip'), h('th', {}, 'Parts')),
        ...rows.map((r) => h('tr', { class: r.id === id ? 'me' : r.stock ? 'stock' : '' },
          h('th', {}, carById(r.id).model, r.stock ? h('small', {}, ' next · stock') : null),
          h('td', { class: 'num' }, `${mph(r.st.top)}`, r.id === id ? null : d(mph(r.st.top), mph(me.top))),
          h('td', { class: 'num' }, r.st.accel.toFixed(1), r.id === id ? null : d(r.st.accel, me.accel, 1, 1)),
          h('td', { class: 'num' }, r.st.grip.toFixed(2), r.id === id ? null : d(r.st.grip, me.grip, 1, 2)),
          h('td', {}, `T${r.cap}`)))),
      h('p', { class: 'd' }, 'Top speed in mph with each car’s fitted parts; the next car is shown stock, before any parts.'),
    ));
  }

  private renderedRev = -1;
  show() {
    this.visible = true;
    if (this.app.game.state.rev !== this.renderedRev || !this.grid.childElementCount) this.render();
    else requestAnimationFrame(() => this.drawHero());
  }
  /** Show a car on the hero stage (e.g. from the Race menu). */
  showCar(id: CarId) { this.heroId = id; if (this.visible) this.renderHero(); }
  hide() { this.visible = false; this.closeDialog?.(); }
  onEvents(ev: GameEvent[]) { if (this.visible && ev.some((e) => e.type === 'unlock')) this.render(); }

  render() {
    const state = this.app.game.state;
    this.renderedRev = state.rev;
    const next = P.goalStatus(state);
    this.count.textContent = `${state.owned.length} of ${ENABLED_CARS.length} collected`;
    this.renderMilestones();
    this.renderHero();
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
        h('div', { class: 'car-status' }, label),
        isNext && next ? h('div', { class: 'car-need' }, h('div', { class: 'need-line' }, next.line.replace(/ to unlock the .*$/, '')), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(next.progress * 100)}%` }))) : null));
      this.redrawCards.push(() => studio(canvas, car.id, state.paints[car.id], 0, pending || isNext, !owned && !isNext, owned ? carStyle(state, car.id) : undefined));
      return card;
    });
    this.grid.replaceChildren(...cards);
    // cards draw one at a time in idle time (a detailed car each), so the tab opens at once with the hero car
    const draws = [...this.redrawCards];
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16));
    const next1 = () => { const d = draws.shift(); if (!d || !this.visible) return; d(); if (draws.length) idle(next1); };
    requestAnimationFrame(() => idle(next1));
  }

  /** Collection goals: cars, finishes, medals and trophies, with the next one named. */
  private renderMilestones() {
    const s = this.app.game.state;
    const sigTotal = ENABLED_CARS.filter((c) => SIGNATURE_FINISHES[c.id]).length;
    const sigHave = ENABLED_CARS.filter((c) => SIGNATURE_FINISHES[c.id] && s.livePodiums.includes(c.id)).length;
    const bpHave = BLUEPRINT_FINISHES.filter((b) => s.blueprints.includes(b.name)).length;
    const ta = EVENTS.filter((e) => e.timeAttack || e.speedTrap);
    const medals = ta.reduce((n, e) => n + (s.medals?.[e.id] ?? 0), 0);
    const trophies = EVENTS.filter((e) => e.trophy);
    const trophyHave = trophies.filter((e) => s.badges.includes(e.trophy!)).length;
    const row = (label: string, have: number, total: number) =>
      h('div', { class: `ms${have >= total ? ' done' : ''}` }, h('span', { class: 'ms-l' }, label), h('span', { class: 'ms-v num' }, `${have}/${total}`),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((have / Math.max(1, total)) * 100)}%` })));
    const all = s.owned.length + sigHave + bpHave + medals + trophyHave;
    const total = ENABLED_CARS.length + sigTotal + BLUEPRINT_FINISHES.length + ta.length * 3 + trophies.length;
    const next = P.collection(s).next;
    this.milestones.replaceChildren(
      h('div', { class: 'ms-head' }, h('strong', {}, 'Collection'), h('span', { class: 'num' }, `${Math.round((all / total) * 100)}%`)),
      h('div', { class: 'ms-grid' },
        row('Cars', s.owned.length, ENABLED_CARS.length),
        row('Finishes', sigHave + bpHave, sigTotal + BLUEPRINT_FINISHES.length),
        row('Medals', medals, ta.length * 3),
        row('Class trophies', trophyHave, trophies.length),
        row('Event goals', EVENTS.filter((e) => e.goals).reduce((n, e) => n + [1, 2, 4].filter((b) => (s.stars?.[e.id] ?? 0) & b).length, 0), EVENTS.filter((e) => e.goals).length * 3)),
      h('p', { class: 'ms-next' }, `Next: ${next}`),
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
    // supercars: the platform turns the car round to its side view when the dialog opens (not with reduced motion)
    let turn = PLATFORM_CARS.includes(id) && !state.settings.reducedMotion ? 0 : 1;
    let turnRaf = 0;
    const spin = (t0: number) => (now: number) => {
      const k = Math.min(1, (now - t0) / 1600);
      turn = k * k * (3 - 2 * k);
      draw();
      turnRaf = k < 1 && dialog.isConnected ? requestAnimationFrame(spin(t0)) : 0;
    };
    // Paint shop preview: tapping an item you don't own shows it on the car before you buy.
    let preview: { item: StyleItem } | null = null;
    const soonItems = new Map<string, StyleItem>();
    const draw = () => {
      const st = this.app.game.state;
      const style = { ...carStyle(st, id) };
      let paint = st.paints[id];
      if (preview) {
        const it = preview.item;
        if ((it.kind as string) === 'livery') style.livery = it.value || undefined;
        if (it.kind === 'paint') paint = it.value;
        if (it.kind === 'wheel') style.wheel = it.value as WheelSetId;
        if (it.kind === 'material') style.material = it.value as PaintMaterial;
        if (it.kind === 'restore') style.restore = Number(it.value);
      }
      studio(canvas, id, paint, lit ? 1 : 0, false, false, style, turn);
    };
    const lights = h('button', { class: 'btn sm', 'aria-pressed': 'false', onclick: () => {
      lit = !lit;
      lights.setAttribute('aria-pressed', String(lit));
      draw();
    } }, 'Lights');
    const options = [
      { name: 'Factory', paint: lookOf(id).paint, value: null },
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
          || (it.kind === 'material' && cur.material === it.value) || (it.kind === 'restore' && (cur.restore ?? 0) >= Number(it.value))
          || ((it.kind as string) === 'livery' && curLivery === it.value);
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
      // Liveries: catalogue items come from STYLE_ITEMS (kind 'livery'); any livery not yet in the catalogue can
      // still be previewed on the car, marked as coming soon.
      const curLivery = carStyle(st, id).livery;
      const liveryItems = items.filter((i) => (i.kind as string) === 'livery');
      const soon = (lv: (typeof LIVERIES)[number]) => {
        let it = soonItems.get(lv.id);
        if (!it) { it = { id: `livery:${lv.id}`, kind: 'livery' as StyleItem['kind'], name: lv.name, price: 0, value: lv.id, opens: 0, blurb: lv.blurb }; soonItems.set(lv.id, it); }
        const item = it;
        return h('button', {
          class: `btn shop-item soon${preview?.item === item ? ' previewing' : ''}`, 'aria-label': `${lv.name}, preview`,
          onclick: () => { preview = { item }; renderShop(); draw(); },
        }, h('span', { class: 'stack' }, lv.name, h('small', {}, 'Preview')));
      };
      const liveryBlock = h('div', { class: 'shop-group' }, h('h3', {}, 'Liveries'), h('p', { class: 'd' }, 'Stripes, numbers and graphics in a colour that suits the paint. Looks only.'),
        h('div', { class: 'shop-items' },
          h('button', {
            class: `btn shop-item${!curLivery ? ' on' : ''}`, 'aria-pressed': String(!curLivery),
            onclick: () => { preview = null; this.app.game.applyStyle(null, id, 'livery' as 'wheel'); renderShop(); draw(); },
          }, h('span', { class: 'stack' }, 'Clean', h('small', {}, 'No graphics'))),
          ...LIVERIES.map((lv) => {
            const it = liveryItems.find((i) => i.value === lv.id);
            if (it) return chip(it);
            return STYLE_ITEMS.some((i) => (i.kind as string) === 'livery' && i.value === lv.id) ? null : soon(lv);
          })));
      const blocks = groups.map(([kind, title, note]) => {
        const list = items.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return h('div', { class: 'shop-group' }, h('h3', {}, title), h('p', { class: 'd' }, note),
          h('div', { class: 'shop-items' }, kind === 'wheel' || kind === 'material' ? factory(kind) : null, ...list.map(chip)));
      });
      const locked = STYLE_ITEMS.filter((i) => st.owned.length < i.opens && (i.kind !== 'restore' || id === 'junker'));
      const nextOpen = locked.length ? Math.min(...locked.map((i) => i.opens)) : 0;
      shop.replaceChildren(h('h2', { class: 'shop-title' }, 'Paint shop'), ...blocks.filter((b): b is HTMLDivElement => !!b), liveryBlock,
        ...(nextOpen ? [h('p', { class: 'd' }, `${locked.filter((i) => i.opens === nextOpen).length} more items open with your ${ordinalWord(nextOpen)} car.`)] : []), buyBar);
      if (preview) {
        const it = preview.item;
        const short = it.price - st.cash;
        buyBar.hidden = false;
        if ([...soonItems.values()].includes(it)) {
          buyBar.replaceChildren(
            h('div', { class: 'grow' }, h('b', {}, it.name), h('div', { class: 'd' }, `${it.blurb} Coming to the Paint shop soon.`)),
            h('button', { class: 'btn sm', onclick: () => { preview = null; renderShop(); draw(); } }, 'Done'));
          return;
        }
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
        h('span', { class: 'chip' }, `${mph(loadout.top)} mph`),
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
        h('button', { class: 'btn', onclick: () => {
          close();
          openFitParts(this.app, id);
        } }, 'Fit parts'),
        h('button', { class: 'btn primary inspect-race', onclick: () => {
          if (!active) { this.app.game.setActiveCar(id); this.app.toast(`Racing the ${car.model} · parts up to T${car.cap} equip`); }
          close();
          this.app.go('race');
        } }, 'Race this car')),
    ));
    void active;
    const close = () => {
      cancelAnimationFrame(turnRaf);
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
    if (turn < 1) turnRaf = requestAnimationFrame((t0) => { turnRaf = requestAnimationFrame(spin(t0)); });
    closeBtn.focus({ preventScroll: true });
  }
}
