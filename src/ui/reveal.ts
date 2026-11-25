import { sfx, unlockAudio } from '../audio';
import { computeLoadout } from '../core/loadout';
import { CarId, ENABLED_CARS, carById, finishStripe } from '../data/tables';
import { drawCar, drawCarCover, drawHeadlightBeam, fitCanvas } from '../render/car';
import type { App } from './app';
import { h } from './dom';

type Phase = 'cover' | 'pull' | 'spot' | 'lights' | 'camera' | 'done';

/**
 * Car unveil: pull the cover (or tap) → dark silhouette → focused spotlight cue → headlights and the car's
 * own engine note → camera settles → hero hold with the model name and what it unlocks.
 * Ownership is committed before this opens, so closing the page at any point keeps the car; the
 * presentation resumes on the next launch. `replay` runs the same sequence from the Showroom without
 * touching the save.
 */
export class RevealOverlay {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private textEl: HTMLElement;
  private phase: Phase = 'cover';
  private cover = 1;
  private t = 0; // time in current phase
  private raf = 0;
  private last = 0;
  private dragX: number | null = null;
  private dragCover = 1;
  private reduced: boolean;
  private bgKey = '';
  private carCache = document.createElement('canvas');
  private silCache = document.createElement('canvas');
  private cacheKey = '';

  constructor(private app: App, private car: CarId, private onDone: () => void, private replay = false) {
    this.reduced = app.game.state.settings.reducedMotion;
    const c = carById(car);
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.textEl = h('div', { class: 'rtext' },
      h('div', { class: 'm' }, replay ? c.model : 'New car unlocked'),
      h('div', { class: 'instr' }, 'Pull the cover or tap to unveil'));
    this.el = h('div', { class: 'reveal', role: 'dialog', 'aria-label': `Reveal the ${c.model}` },
      this.canvas, this.textEl,
      h('div', { class: 'rbtns' }, h('button', { class: 'btn sm', onclick: () => this.skip() }, 'Skip')));
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', () => {
      this.dragX = null;
      if (this.phase === 'cover') { this.cover = 1; this.requestDraw(); }
    });
    this.el.addEventListener('keydown', (e) => { if (e.target === this.el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.advance(); } if (e.key === 'Escape') this.skip(); });
    this.el.tabIndex = 0;
    window.addEventListener('resize', this.requestDraw);
    this.requestDraw();
    requestAnimationFrame(() => this.el.focus({ preventScroll: true }));
  }

  private get paint() {
    const p = this.app.game.state.paints[this.car];
    return this.replay && p ? p : carById(this.car).paint;
  }

  private down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    unlockAudio();
    if (this.phase !== 'cover') return;
    this.el.setPointerCapture(e.pointerId);
    this.dragX = e.clientX;
    this.dragCover = this.cover;
  }
  private move(e: PointerEvent) {
    if (this.dragX === null || this.phase !== 'cover') return;
    const dist = Math.abs(this.dragX - e.clientX);
    this.cover = Math.max(0, Math.min(1, this.dragCover - dist / (this.el.clientWidth * 0.6)));
    this.requestDraw();
  }
  private up(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    if (this.phase === 'cover') {
      const moved = this.dragX !== null && Math.abs(this.dragX - e.clientX) > 8;
      this.dragX = null;
      if (!moved || this.cover < 0.75) this.go('pull'); // tap-to-reveal, or enough of a pull
      else { this.cover = 1; this.requestDraw(); }
    } else if (this.phase !== 'done') this.advance();
  }

  private advance() {
    if (this.phase === 'cover') this.go('pull');
    else if (this.phase !== 'done') this.go('done');
  }

  private go(p: Phase) {
    this.phase = p;
    this.t = 0;
    this.last = performance.now();
    const c = carById(this.car);
    if (p === 'pull') { sfx.cloth(); this.textEl.querySelector('.instr')!.textContent = ''; }
    if (p === 'spot') sfx.spot();
    if (p === 'lights') sfx.rev(c.rev.base, c.rev.peak, c.id);
    if (p === 'done') {
      this.cover = 0;
      this.textEl.replaceChildren(
        h('h2', {}, c.model),
        h('div', { class: 'reveal-cap' }, this.advantage()),
        h('div', { class: 'm', style: 'margin-top:6px' }, c.blurb),
        h('div', { class: 'reveal-actions' },
          h('button', { class: 'btn done', onclick: () => this.finish() }, this.replay ? 'Back to the Showroom' : 'Garage'),
          this.replay ? null : h('button', { class: 'btn primary done', onclick: () => { this.finish(); this.app.go('race'); } }, 'Pick a race')));
      this.el.querySelector('.rbtns')?.remove();
      (this.textEl.querySelector('.btn.primary, button') as HTMLButtonElement).focus({ preventScroll: true });
    }
    this.requestDraw();
  }

  /** One line on what the new car changes for the player. */
  private advantage(): string {
    const c = carById(this.car);
    const i = ENABLED_CARS.findIndex((x) => x.id === this.car);
    const prev = i > 0 ? ENABLED_CARS[i - 1] : null;
    if (this.replay || !prev) return `${c.name} · equips parts up to T${c.cap}`;
    const s = this.app.game.state;
    const now = computeLoadout(s, this.car).stats.top;
    const before = computeLoadout(s, prev.id).stats.top;
    const gain = Math.round((now - before) * 3.6);
    return `T${c.cap} parts now fit (was T${prev.cap})${gain > 0 ? ` · +${gain} km/h` : ''}`;
  }

  private skip() {
    this.finish();
    if (!this.replay) this.app.toast(`The ${carById(this.car).model} is in your Showroom`);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.requestDraw);
    if (!this.replay) this.app.game.finishReveal(this.car);
    this.el.remove();
    this.onDone();
  }

  private requestDraw = () => {
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frame(now));
  };

  private frame(now: number) {
    this.raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    const speed = this.reduced ? 3 : 1;
    if (this.phase === 'pull') {
      this.cover = Math.max(0, this.cover - dt * 1.6 * speed);
      if (this.cover <= 0) this.go('spot');
    } else if (this.phase === 'spot' && this.t > 0.7 / speed) this.go('lights');
    else if (this.phase === 'lights' && this.t > 1.0 / speed) this.go(this.reduced ? 'done' : 'camera');
    else if (this.phase === 'camera' && this.t > 1.2) this.go('done');
    this.draw();
    if (this.phase !== 'cover' && this.phase !== 'done') this.requestDraw();
  }

  /** 0 = only the work lamp, 1 = full stage lighting. */
  private light(): number {
    switch (this.phase) {
      case 'cover': case 'pull': return 0;
      case 'spot': return Math.min(1, this.t / 0.25) * 0.55;
      case 'lights': return 0.55 + 0.45 * Math.min(1, this.t);
      default: return 1;
    }
  }

  private draw() {
    const { w, h: hh, dpr } = fitCanvas(this.canvas, 1.5);
    const ctx = this.canvas.getContext('2d')!;
    const c = carById(this.car);
    const lit = this.light();
    let zoom = 1;
    let pan = 0;
    if (this.phase === 'camera') {
      const e = 1 - (1 - Math.min(1, this.t / 1.2)) ** 3;
      zoom = 1.18 - 0.18 * e;
      pan = (1 - e) * w * 0.07;
    } else if ((this.phase === 'lights' || this.phase === 'spot') && !this.reduced) { zoom = 1.18; pan = w * 0.07; }
    const base = Math.min(w * 0.8, hh * 1.4, 760 * dpr);
    const cw = base * zoom;
    const x = (w - cw * 1.09) / 2 - pan;
    const y = hh * 0.64;
    // Room lighting is a CSS gradient (composited by the browser), updated only when it changes.
    const q = Math.round(lit * 20) / 20;
    const key = `${q}`;
    if (key !== this.bgKey) {
      this.bgKey = key;
      const spot = (0.08 + 0.4 * q).toFixed(2);
      this.el.style.background = this.car === 'tourer'
        // the marquee car gets its own stage: a dusk-teal room with a warm horizon behind it
        ? `radial-gradient(42% 30% at 50% 60%, rgba(255,214,160,${spot}), transparent 72%), linear-gradient(to bottom, transparent 64%, #06100f 64%), linear-gradient(to bottom, rgba(0,0,0,0) 46%, rgba(240,170,110,${(0.35 * q).toFixed(2)}) 62%, rgba(0,0,0,0) 64%), radial-gradient(90% 70% at 50% 30%, rgb(${14 + 30 * q},${40 + 90 * q},${48 + 92 * q}), #020606 75%)`
        : `radial-gradient(42% 30% at 50% 60%, rgba(255,228,186,${spot}), transparent 72%), linear-gradient(to bottom, transparent 64%, #0c0907 64%), radial-gradient(90% 70% at 50% 30%, rgb(${40 + 120 * q},${30 + 85 * q},${24 + 40 * q}), #050403 75%)`;
    }
    ctx.clearRect(0, 0, w, hh);
    // The car is cached once per size and finish; a silhouette copy lets the light cue fade it up.
    const bw = Math.round(base * 1.18);
    const ck = `${bw}|${this.paint}`;
    if (this.cacheKey !== ck) {
      this.cacheKey = ck;
      for (const [cv, sil] of [[this.carCache, false], [this.silCache, true]] as const) {
        cv.width = Math.round(bw * 1.25);
        cv.height = Math.round(bw * 0.6);
        const cc = cv.getContext('2d')!;
        drawCar(cc, this.car, bw * 0.05, bw * 0.55, bw, { paint: this.paint, trim: c.trim, livery: finishStripe(this.car, this.paint), silhouette: sil, detail: true });
      }
    }
    const sc = cw / bw;
    const dx = x - bw * 0.05 * sc, dy = y - bw * 0.55 * sc;
    if (this.cover > 0 || lit < 1) ctx.drawImage(this.silCache, dx, dy, this.silCache.width * sc, this.silCache.height * sc);
    if (lit > 0) {
      ctx.globalAlpha = Math.min(1, 0.15 + lit);
      ctx.drawImage(this.carCache, dx, dy, this.carCache.width * sc, this.carCache.height * sc);
      ctx.globalAlpha = 1;
    }
    const headlights = this.phase === 'lights' ? Math.min(1, this.t * 2) * (0.6 + 0.4 * Math.sin(this.t * 14)) : this.phase === 'camera' || this.phase === 'done' ? 0.85 : 0;
    if (this.car === 'tourer' && (this.phase === 'camera' || this.phase === 'done') && !this.reduced) {
      // a slow highlight runs nose to tail along the paint (source-atop keeps it on the car)
      const k = this.phase === 'camera' ? Math.min(1, this.t / 1.2) : 1;
      if (k < 1) {
        const sx = x + cw * (1.15 - 1.3 * k);
        const g = ctx.createLinearGradient(sx - cw * 0.12, 0, sx + cw * 0.12, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g;
        ctx.fillRect(sx - cw * 0.12, 0, cw * 0.24, hh); ctx.restore();
      }
    }
    drawHeadlightBeam(ctx, this.car, x, y, cw, headlights);
    drawCarCover(ctx, this.car, x, y, cw, this.cover);
    // one headlight sweep across the room while the engine speaks
    if (this.phase === 'lights' && !this.reduced) {
      const sx = w * (this.t * 1.2 - 0.2);
      const g = ctx.createLinearGradient(sx - 120 * dpr, 0, sx + 120 * dpr, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.14)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 120 * dpr, 0, 240 * dpr, hh);
    }
  }
}
