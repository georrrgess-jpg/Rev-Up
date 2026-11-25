import { sfx, unlockAudio } from '../audio';
import { CarId, carById } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
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

  constructor(private app: App, private car: CarId, private onDone: () => void) {
    this.reduced = app.game.state.settings.reducedMotion;
    const c = carById(car);
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.textEl = h('div', { class: 'rtext' },
      h('div', { class: 'm' }, 'New car unlocked'),
      h('div', { class: 'instr' }, 'Drag the cover off — or tap'));
    this.el = h('div', { class: 'reveal', role: 'dialog', 'aria-label': `Reveal the ${c.name}` },
      this.canvas, this.textEl,
      h('div', { class: 'rbtns' }, h('button', { class: 'btn sm', onclick: () => this.skip() }, 'Skip')));
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.advance(); } if (e.key === 'Escape') this.skip(); });
    this.el.tabIndex = 0;
    requestAnimationFrame(() => {
      this.el.focus();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    });
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
  }
  private up(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    if (this.phase === 'cover') {
      const moved = this.dragX !== null && Math.abs(this.dragX - e.clientX) > 8;
      this.dragX = null;
      if (!moved || this.cover < 0.75) this.go('pull'); // tap-to-reveal, or enough of a pull
      else this.cover = 1; // spring back
    } else if (this.phase !== 'done') this.advance();
  }

  private advance() {
    if (this.phase === 'cover') this.go('pull');
    else if (this.phase !== 'done') this.go('done');
  }

  private go(p: Phase) {
    this.phase = p;
    this.t = 0;
    const c = carById(this.car);
    if (p === 'pull') { sfx.cloth(); this.textEl.querySelector('.instr')!.textContent = ''; }
    if (p === 'lights') sfx.rev(c.rev.base, c.rev.peak);
    if (p === 'done') {
      this.cover = 0;
      this.textEl.replaceChildren(
        h('h2', {}, c.name),
        h('div', { class: 'm' }, `${c.model} · equip cap T${c.cap} · added to your Showroom`),
        h('div', { class: 'm', style: 'margin-top:6px' }, c.blurb),
        h('button', { class: 'btn primary done', onclick: () => this.finish() }, 'Back to the garage'));
      (this.textEl.querySelector('button') as HTMLButtonElement).focus();
    }
  }

  private skip() {
    this.finish();
    this.app.toast(`The ${carById(this.car).name} is in your Showroom`);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.app.game.finishReveal(this.car);
    this.el.remove();
    this.onDone();
  }

  private frame(now: number) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const speed = this.reduced ? 3 : 1;
    if (this.phase === 'pull') {
      this.cover = Math.max(0, this.cover - dt * 1.6 * speed);
      if (this.cover <= 0) this.go('lights');
    } else if (this.phase === 'lights' && this.t > 1.0 / speed) this.go('camera');
    else if (this.phase === 'camera' && this.t > 1.3 / speed) this.go('done');
    this.draw();
  }

  private draw() {
    const { w, h: hh, dpr } = fitCanvas(this.canvas);
    const ctx = this.canvas.getContext('2d')!;
    const c = carById(this.car);
    const lit = this.phase === 'cover' || this.phase === 'pull' ? 0.25 : Math.min(1, this.phase === 'lights' ? this.t : 1);
    // room
    const bg = ctx.createRadialGradient(w / 2, hh * 0.3, 10, w / 2, hh * 0.55, Math.max(w, hh) * 0.75);
    bg.addColorStop(0, `rgba(${90 + 80 * lit},${60 + 50 * lit},${40 + 20 * lit},1)`);
    bg.addColorStop(1, '#050403');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = '#0c0907';
    ctx.fillRect(0, hh * 0.64, w, hh);
    // camera: layered zoom/pan
    let zoom = 1;
    let pan = 0;
    if (this.phase === 'camera' && !this.reduced) {
      const k = Math.min(1, this.t / 1.3);
      const e = 1 - (1 - k) ** 3;
      zoom = 1.22 - 0.22 * e;
      pan = (1 - e) * w * 0.08;
    } else if (this.phase === 'lights') { zoom = 1.22; pan = w * 0.08; }
    const cw = Math.min(w * 0.88, hh * 1.5) * zoom;
    const x = (w - cw) / 2 - pan;
    const y = hh * 0.64;
    // overhead spot
    const sp = ctx.createRadialGradient(w / 2, y - cw * 0.1, 10, w / 2, y, cw * 0.8);
    sp.addColorStop(0, `rgba(255,225,180,${0.12 + 0.25 * lit})`);
    sp.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, w, hh);
    const headlights = this.phase === 'lights' ? Math.min(1, this.t * 2) * (0.6 + 0.4 * Math.sin(this.t * 14)) : this.phase === 'camera' || this.phase === 'done' ? 0.8 : 0;
    drawCar(ctx, this.car, x, y, cw, { paint: c.paint, trim: c.trim, cover: this.cover, headlights });
    // headlight sweep across the room
    if (this.phase === 'lights' || this.phase === 'camera') {
      const k = this.phase === 'lights' ? this.t : 1 + this.t;
      const sx = w * (((k * 0.6) % 1.4) - 0.2);
      const g = ctx.createLinearGradient(sx - 120 * dpr, 0, sx + 120 * dpr, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.12)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, hh);
    }
  }
}
