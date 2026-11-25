import { sfx, unlockAudio } from '../audio';
import { CarId, carById } from '../data/tables';
import { drawCar, drawCarCover, drawHeadlightBeam, fitCanvas } from '../render/car';
import type { App } from './app';
import { h } from './dom';

type Phase = 'cover' | 'pull' | 'lights' | 'camera' | 'done';

/**
 * Car unveil. Ownership was already committed before this opens, so closing the page at any
 * point keeps the car; the presentation resumes from the start on the next launch.
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
  private litQ = -1;
  private carCache = document.createElement('canvas');
  private cacheW = 0;

  constructor(private app: App, private car: CarId, private onDone: () => void) {
    this.reduced = app.game.state.settings.reducedMotion;
    const c = carById(car);
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.textEl = h('div', { class: 'rtext' },
      h('div', { class: 'm' }, 'New car unlocked'),
      h('div', { class: 'instr' }, 'Pull the cover or tap to unveil'));
    this.el = h('div', { class: 'reveal', role: 'dialog', 'aria-label': `Reveal the ${c.name}` },
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
    requestAnimationFrame(() => this.el.focus());
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
    const dx = this.dragX - e.clientX; // pull toward the rear (left)
    const dist = Math.abs(dx) > 0 ? Math.abs(dx) : 0;
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
    if (p === 'lights') sfx.rev(c.rev.base, c.rev.peak);
    if (p === 'done') {
      this.cover = 0;
      this.textEl.replaceChildren(
        h('h2', {}, c.model),
        h('div', { class: 'm' }, `${c.name} · Parts up to T${c.cap}`),
        h('div', { class: 'm', style: 'margin-top:6px' }, c.blurb),
        h('button', { class: 'btn primary done', onclick: () => this.finish() }, 'Back to the garage'));
      (this.textEl.querySelector('button') as HTMLButtonElement).focus();
    }
    this.requestDraw();
  }

  private skip() {
    this.finish();
    this.app.toast(`The ${carById(this.car).name} is in your Showroom`);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.requestDraw);
    this.app.game.finishReveal(this.car);
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
      if (this.cover <= 0) this.go('lights');
    } else if (this.phase === 'lights' && this.t > 1.0 / speed) this.go('camera');
    else if (this.phase === 'camera' && this.t > 1.3 / speed) this.go('done');
    this.draw();
    if (this.phase !== 'cover' && this.phase !== 'done') this.requestDraw();
  }

  private draw() {
    const { w, h: hh, dpr } = fitCanvas(this.canvas, 1.5);
    const ctx = this.canvas.getContext('2d')!;
    const c = carById(this.car);
    const lit = this.phase === 'cover' || this.phase === 'pull' ? 0.25 : Math.min(1, this.phase === 'lights' ? this.t : 1);
    // camera: layered zoom/pan
    let zoom = 1;
    let pan = 0;
    if (this.phase === 'camera' && !this.reduced) {
      const k = Math.min(1, this.t / 1.3);
      const e = 1 - (1 - k) ** 3;
      zoom = 1.22 - 0.22 * e;
      pan = (1 - e) * w * 0.08;
    } else if (this.phase === 'lights') { zoom = 1.22; pan = w * 0.08; }
    const cw = Math.min(w * .83, hh * 1.5, 790 * dpr) * zoom;
    const x = (w - cw) / 2 - pan;
    const y = hh * 0.64;
    // Room lighting is a CSS gradient (composited by the browser), updated only when it changes.
    const q = Math.round(lit * 20) / 20;
    if (q !== this.litQ) {
      this.litQ = q;
      this.el.style.background = `radial-gradient(60% 40% at 50% 62%, rgba(255,225,180,${(0.12 + 0.25 * q).toFixed(2)}), transparent 70%), linear-gradient(to bottom, transparent 64%, #0c0907 64%), radial-gradient(90% 70% at 50% 30%, rgb(${90 + 80 * q},${60 + 50 * q},${40 + 20 * q}), #050403 75%)`;
    }
    ctx.clearRect(0, 0, w, hh);
    const headlights = this.phase === 'lights' ? Math.min(1, this.t * 2) * (0.6 + 0.4 * Math.sin(this.t * 14)) : this.phase === 'camera' || this.phase === 'done' ? 0.8 : 0;
    // The car body is cached once per size; cover and beams are drawn live on top.
    const baseW = Math.round(Math.min(w * .83, hh * 1.5, 790 * dpr) * 1.22);
    if (this.cacheW !== baseW) {
      this.cacheW = baseW;
      this.carCache.width = Math.round(baseW * 1.19);
      this.carCache.height = Math.round(baseW * 0.56);
      const cc = this.carCache.getContext('2d')!;
      drawCar(cc, this.car, baseW * 0.05, baseW * 0.52, baseW, { paint: c.paint, trim: c.trim });
    }
    const sc = cw / baseW;
    ctx.drawImage(this.carCache, x - baseW * 0.05 * sc, y - baseW * 0.52 * sc, this.carCache.width * sc, this.carCache.height * sc);
    drawHeadlightBeam(ctx, this.car, x, y, cw, headlights);
    drawCarCover(ctx, this.car, x, y, cw, this.cover);
    // headlight sweep across the room
    if (this.phase === 'lights' || this.phase === 'camera') {
      const k = this.phase === 'lights' ? this.t : 1 + this.t;
      const sx = w * (((k * 0.6) % 1.4) - 0.2);
      const g = ctx.createLinearGradient(sx - 120 * dpr, 0, sx + 120 * dpr, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.12)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 120 * dpr, 0, 240 * dpr, hh);
    }
  }
}
