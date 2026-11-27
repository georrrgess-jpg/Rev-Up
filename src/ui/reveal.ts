import { carStyle } from '../core/style';
import { mph } from '../core/units';
import { sfx, unlockAudio } from '../audio';
import { signature } from '../audio-reveal';
import { fullTop } from '../core/race';
import { CarId, ENABLED_CARS, carById, finishStripe } from '../data/tables';
import { FACTORY_LOOKS, PLATFORM_CARS, carLengthM, drawCar, drawCarCover, drawHeadlightBeam, fitCanvas } from '../render/car';
import { drawRevealSignature } from '../render/revealFx';
import type { App } from './app';
import { h } from './dom';

type Phase = 'cover' | 'pull' | 'spot' | 'lights' | 'turn' | 'done';

/** Each car's room: wall glow (rgb at full light), spotlight colour, floor colour, platform rim light. */
const ROOMS: Record<string, { wall: [number, number, number]; spot: string; floor: string; rim: string }> = {
  junker: { wall: [150, 110, 70], spot: '255,226,180', floor: '#0c0907', rim: '#ffb24a' },
  beater: { wall: [160, 90, 70], spot: '255,220,190', floor: '#0d0807', rim: '#ff8a5a' },
  hothatch: { wall: [70, 90, 150], spot: '235,240,255', floor: '#06080f', rim: '#ff3b47' },
  muscle: { wall: [150, 100, 50], spot: '255,214,150', floor: '#0c0805', rim: '#f2b33d' },
  tourer: { wall: [40, 130, 140], spot: '255,214,160', floor: '#06100f', rim: '#ffd7a0' },
  tuner: { wall: [110, 90, 30], spot: '255,214,120', floor: '#0a0906', rim: '#ffc43a' },
  super: { wall: [70, 30, 140], spot: '210,170,255', floor: '#06030f', rim: '#c08cff' },
  rally: { wall: [40, 80, 160], spot: '230,240,255', floor: '#05080f', rim: '#f5c518' },
  gt: { wall: [140, 40, 40], spot: '255,236,226', floor: '#0e0606', rim: '#ff3b2e' },
  proto: { wall: [20, 110, 120], spot: '200,255,245', floor: '#020a0b', rim: '#36f0d0' },
  vireo: { wall: [150, 40, 30], spot: '255,236,228', floor: '#0e0505', rim: '#f4f1ea' },
  mako: { wall: [40, 80, 50], spot: '236,255,200', floor: '#040805', rim: '#c7f23a' },
  sovereign: { wall: [130, 105, 60], spot: '255,240,210', floor: '#0b0905', rim: '#c9a24a' },
  ardent: { wall: [150, 70, 20], spot: '255,236,214', floor: '#0d0704', rim: '#f26a1b' },
  meridian: { wall: [40, 80, 160], spot: '226,238,255', floor: '#04070e', rim: '#e8edf3' },
  tempest: { wall: [10, 90, 110], spot: '200,250,255', floor: '#020709', rim: '#5ef2ff' },
};

/**
 * Car unveil on a round display platform under a spotlight: pull the cover (or tap) → dark silhouette →
 * the spotlight snaps on → headlights and the car's own engine note → the platform turns the car to its hero
 * angle → hero hold with the model name and what it unlocks.
 * Ownership is committed before this opens, so closing the page at any point keeps the car; the
 * presentation resumes on the next launch. `replay` runs the same sequence from the Showroom without
 * touching the save. Reduced motion: no turn, quicker light cues.
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
  private stageCache = document.createElement('canvas');
  private cacheKey = '';
  private stageKey = '';
  /** Darkens the fully lit room: its opacity is the only thing that changes as the lights come up (compositor-only). */
  private dimmer: HTMLElement;
  private carReady = false;
  private warmTimer = 0;

  constructor(private app: App, private car: CarId, private onDone: () => void, private replay = false) {
    this.reduced = app.game.state.settings.reducedMotion;
    const c = carById(car);
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.dimmer = h('div', { 'aria-hidden': 'true', style: 'position:absolute;inset:0;background:#030305;pointer-events:none;will-change:opacity' });
    this.textEl = h('div', { class: 'rtext' },
      h('div', { class: 'm' }, replay ? c.model : 'New car unlocked'),
      h('div', { class: 'instr' }, 'Pull the cover or tap to unveil'));
    this.el = h('div', { class: 'reveal reveal-stage', role: 'dialog', 'aria-label': `Reveal the ${c.model}` },
      this.dimmer, this.canvas, this.textEl,
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

  private get look() {
    const c = carById(this.car);
    const f = FACTORY_LOOKS[this.car];
    // the new cars use their art palette until the tables give them their own
    return c.paint === '#555' && f ? f : { paint: c.paint, trim: c.trim };
  }
  /** The car as the player has finished it (paint, wheels, material, livery); a new car has the factory look. */
  private get paint() {
    return this.app.game.state.paints[this.car] ?? this.look.paint;
  }
  private get room() { return ROOMS[this.car] ?? ROOMS.muscle; }

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
    if (p === 'lights') { sfx.rev(c.rev.base, c.rev.peak, c.id); signature(c.id); }
    if (p === 'done') {
      this.cover = 0;
      this.textEl.replaceChildren(
        h('div', { class: 'reveal-kicker' }, c.name),
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
    const fittedN = Object.keys(s.installed[this.car] ?? {}).length;
    const room = mph(fullTop(this.car)) - mph(fullTop(prev.id));
    return `Fits T${c.cap} parts (the ${prev.model}: T${prev.cap})${room > 0 ? ` · fully built, ${room} mph more top speed` : ''}${fittedN ? ' · your best parts are fitted' : ''}`;
  }

  private skip() {
    this.finish();
    if (!this.replay) this.app.toast(`The ${carById(this.car).model} is in your Showroom`);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.warmTimer);
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
    const speed = this.reduced ? 2.5 : 1;
    if (this.phase === 'pull') {
      this.cover = Math.max(0, this.cover - dt * 1.6 * speed);
      if (this.cover <= 0) this.go('spot');
    } else if (this.phase === 'spot' && this.t > 0.6 / speed) this.go('lights');
    else if (this.phase === 'lights' && this.t > 0.9 / speed) this.go(this.reduced ? 'done' : 'turn');
    else if (this.phase === 'turn' && this.t > 1.6) this.go('done');
    this.draw();
    if (this.phase !== 'cover' && this.phase !== 'done') this.requestDraw();
  }

  /** 0 = only the work lamp, 1 = full stage lighting. */
  private light(): number {
    switch (this.phase) {
      case 'cover': case 'pull': return 0;
      case 'spot': return Math.min(1, this.t / 0.15) * 0.6;
      case 'lights': return 0.6 + 0.4 * Math.min(1, this.t);
      default: return 1;
    }
  }
  /** 0 = turned away (three-quarter), 1 = hero angle. */
  private turn(): number {
    if (this.reduced || this.phase === 'done') return 1;
    if (this.phase === 'turn') { const k = Math.min(1, this.t / 1.6); return k * k * (3 - 2 * k); }
    return 0;
  }

  /** The spotlight cone and the platform: painted once per size and car, then lit with globalAlpha. */
  private stage(w: number, hh: number, px: number, py: number, rx: number, ry: number, th: number) {
    const key = `${w}|${hh}|${this.car}`;
    if (key === this.stageKey) return;
    this.stageKey = key;
    const cv = this.stageCache;
    cv.width = w; cv.height = hh;
    const c = cv.getContext('2d')!;
    const room = this.room;
    // the spotlight cone from a lamp above the platform
    const cone = c.createLinearGradient(0, 0, 0, py);
    cone.addColorStop(0, `rgba(${room.spot},0.5)`); cone.addColorStop(1, `rgba(${room.spot},0.1)`);
    c.fillStyle = cone;
    c.beginPath(); c.moveTo(px - rx * 0.12, 0); c.lineTo(px + rx * 0.12, 0); c.lineTo(px + rx * 1.02, py); c.lineTo(px - rx * 1.02, py); c.closePath(); c.fill();
    // pool of light on the floor around the platform
    const pool = c.createRadialGradient(px, py + th, rx * 0.4, px, py + th, rx * 1.6);
    pool.addColorStop(0, `rgba(${room.spot},0.35)`); pool.addColorStop(1, `rgba(${room.spot},0)`);
    c.fillStyle = pool; c.beginPath(); c.ellipse(px, py + th, rx * 1.6, ry * 1.9, 0, 0, Math.PI * 2); c.fill();
    // platform side band (a short cylinder), then the polished top
    const side = c.createLinearGradient(px - rx, 0, px + rx, 0);
    side.addColorStop(0, '#15171b'); side.addColorStop(0.45, '#3a3e45'); side.addColorStop(0.55, '#4a4f57'); side.addColorStop(1, '#101215');
    c.fillStyle = side;
    c.beginPath(); c.ellipse(px, py + th, rx, ry, 0, 0, Math.PI); c.lineTo(px - rx, py); c.ellipse(px, py, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    const top = c.createRadialGradient(px, py - ry * 0.3, rx * 0.1, px, py, rx);
    top.addColorStop(0, '#4b4f57'); top.addColorStop(0.7, '#25282e'); top.addColorStop(1, '#17191d');
    c.fillStyle = top; c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = Math.max(1, ry * 0.04);
    c.beginPath(); c.ellipse(px, py, rx * 0.985, ry * 0.95, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.ellipse(px, py, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2); c.stroke();
  }

  private draw() {
    const { w, h: hh, dpr } = fitCanvas(this.canvas, 1.5);
    const ctx = this.canvas.getContext('2d')!;
    const c = carById(this.car);
    const room = this.room;
    const lit = this.light();
    const turn = this.turn();
    // Room lighting is a CSS gradient (composited by the browser), updated only when it changes.
    // The lit room is painted once; a dark layer over it fades out as the lights come up, so the light cue never
    // repaints a full-screen gradient (that repaint was a visible hitch on phones).
    if (this.bgKey !== this.car) {
      this.bgKey = this.car;
      const [r, g, b] = room.wall;
      this.el.style.background = `linear-gradient(to bottom, transparent 66%, ${room.floor} 66%), radial-gradient(80% 60% at 50% 35%, rgb(${Math.round(12 + r * 0.5)},${Math.round(10 + g * 0.5)},${Math.round(14 + b * 0.5)}), #030305 78%)`;
    }
    const dim = (0.92 * (1 - Math.round(lit * 40) / 40)).toFixed(3);
    if (this.dimmer.style.opacity !== dim) this.dimmer.style.opacity = dim;
    ctx.clearRect(0, 0, w, hh);
    // layout: the platform sits on the floor line; the car fills ~80% of its diameter
    const base = Math.min(w * 0.84, hh * 1.25, 720 * dpr);
    // the platform sits on the floor line, raised on short screens so the hero text below never covers the car
    const px = w / 2, py = Math.max(hh * 0.42, Math.min(hh * 0.66, hh - 290 * dpr));
    const rx = Math.min(w * 0.49, base * 0.66), ry = rx * 0.2, th = ry * 0.42;
    this.stage(w, hh, px, py, rx, ry, th);
    ctx.globalAlpha = 0.12 + 0.88 * lit;
    ctx.drawImage(this.stageCache, 0, 0);
    ctx.globalAlpha = 1;
    // rim lights chase round the platform edge as it turns
    const ang = (turn - 1) * Math.PI * 0.9;
    for (let i = 0; i < 16; i++) {
      const a = ang + (i / 16) * Math.PI * 2;
      const s = Math.sin(a);
      if (s < 0) continue; // only the front half of the rim is visible
      ctx.fillStyle = room.rim;
      ctx.globalAlpha = (0.25 + 0.75 * s) * (0.3 + 0.7 * lit);
      ctx.fillRect(px + Math.cos(a) * rx - 2 * dpr, py + s * ry + th * 0.45 - 1.5 * dpr, 4 * dpr, 3 * dpr);
    }
    ctx.globalAlpha = 1;
    // the car is cached once per size and finish; a silhouette copy lets the light cue fade it up
    const cw = base;
    const k = cw / carLengthM(this.car);
    const depth = { x: 0.2 * 1.9 * k, y: 0.085 * 1.9 * k }; // the renderer's oblique depth, roughly, in px
    const bw = Math.round(base);
    const ck = `${bw}|${this.paint}|${JSON.stringify(carStyle(this.app.game.state, this.car))}`;
    const paintCar = (cv: HTMLCanvasElement, sil: boolean) => {
      cv.width = Math.round(bw * 1.3);
      cv.height = Math.round(bw * 0.62);
      drawCar(cv.getContext('2d')!, this.car, bw * 0.08, bw * 0.55, bw, { paint: this.paint, trim: this.look.trim, livery: finishStripe(this.car, this.paint), silhouette: sil, detail: true, style: carStyle(this.app.game.state, this.car), shadow: false, light: PLATFORM_CARS.includes(this.car) ? 0.7 : 0.35 });
    };
    if (this.cacheKey !== ck) {
      // Only the cheap silhouette is needed under the cover; the detailed car (the expensive part) is painted
      // a moment later while the cover still hangs still, so neither the opening nor the pull stutters.
      this.cacheKey = ck;
      this.carReady = false;
      paintCar(this.silCache, true);
      clearTimeout(this.warmTimer);
      this.warmTimer = window.setTimeout(() => { if (this.cacheKey === ck && !this.carReady) { paintCar(this.carCache, false); this.carReady = true; } }, 120);
    }
    if (!this.carReady && (lit > 0 || this.phase !== 'cover')) { paintCar(this.carCache, false); this.carReady = true; }
    // the car's ground point: centred on the platform (its depth runs up and to the right)
    const gx = px - cw / 2 - depth.x / 2, gy = py + depth.y * 0.35;
    // controlled turn: the car starts angled away (foreshortened) and the platform brings it round to the
    // hero side view
    const sx = 0.72 + 0.28 * turn;
    const dx = gx - bw * 0.08, dy = gy - bw * 0.55;
    const blit = (cv: HTMLCanvasElement, alpha: number) => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(px, 0); ctx.scale(sx, 1); ctx.translate(-px, 0);
      ctx.drawImage(cv, dx, dy);
      ctx.restore();
    };
    // contact shadow on the platform top
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(px, gy - depth.y * 0.4, cw * 0.5 * sx + depth.x * 0.3, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    // a faint reflection of the car in the polished platform top
    if (lit > 0) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
      ctx.translate(0, gy * 2); ctx.scale(1, -1);
      blit(this.carCache, 0.16 * lit);
      ctx.restore();
    }
    if (this.cover > 0 || lit < 1) blit(this.silCache, 1);
    if (lit > 0) blit(this.carCache, Math.min(1, 0.15 + lit));
    // a slow highlight runs nose to tail along the paint as the turn completes
    if (this.phase === 'turn' && !this.reduced) {
      const hx = px + cw * sx * (0.6 - 1.2 * turn);
      const g = ctx.createLinearGradient(hx - cw * 0.12, 0, hx + cw * 0.12, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g;
      ctx.fillRect(hx - cw * 0.12, 0, cw * 0.24, hh); ctx.restore();
    }
    const headlights = this.phase === 'lights' ? Math.min(1, this.t * 2) * (0.6 + 0.4 * Math.sin(this.t * 14)) : this.phase === 'turn' || this.phase === 'done' ? 0.85 : 0;
    ctx.save();
    ctx.translate(px, 0); ctx.scale(sx, 1); ctx.translate(-px, 0);
    drawHeadlightBeam(ctx, this.car, gx, gy, cw, headlights);
    drawRevealSignature(ctx, this.car, gx, gy, cw, this.phase, this.t, this.reduced);
    drawCarCover(ctx, this.car, gx, gy, cw, this.cover);
    ctx.restore();
    void c;
  }
}
