// Title screen: a short, skippable Rev Up intro. Lazy-loaded by main.ts so it never weighs on first paint.
// First launch: a light sweep over the Sovereign silhouette (the car the whole garage builds toward), the wordmark,
// and Play; the tap that starts the game is also the gesture that lets the ignition cue and the soundtrack play.
// Repeat launches (settings.introSeen): about a second over the player's own car, then straight into the Garage.
// Tap or any key skips at every stage.
import './css/intro.css';
import { ignitionCue, music } from '../audio-api';
import { carById, type CarId } from '../data/tables';
import { drawCar, fitCanvas } from '../render/car';
import type { App } from './app';
import { h } from './dom';

export function runIntro(app: App): Promise<void> {
  return new Promise((resolve) => {
    const s = app.game.state;
    const first = !s.settings.introSeen;
    const reduced = s.settings.reducedMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ownsFlagship = s.owned.includes('sovereign' as CarId);
    const tease = first && !ownsFlagship;
    let hero: CarId = tease ? ('sovereign' as CarId) : s.activeCar;
    try { carById(hero); } catch { hero = s.activeCar; }
    const car = carById(hero);

    const base = h('canvas', { class: 'ib', 'aria-hidden': 'true' });
    const lit = h('canvas', { class: 'il', 'aria-hidden': 'true' });
    const cta = h('button', { class: 'btn primary intro-go' }, first ? 'Play' : 'Continue');
    const el = h('div', { class: `intro${first ? ' first' : ' quick'}${reduced ? ' still' : ''}${tease ? ' tease' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rev Up' },
      h('div', { class: 'intro-glow', 'aria-hidden': 'true' }),
      h('div', { class: 'intro-stage' }, base, lit, h('i', { class: 'intro-floor', 'aria-hidden': 'true' })),
      h('div', { class: 'intro-mark' },
        h('h1', { class: 'wordmark' }, h('span', { class: 'w1' }, 'REV'), h('span', { class: 'w2' }, 'UP')),
        h('p', { class: 'intro-tag' }, tease ? 'Merge parts · win races · earn the Sovereign' : `Your ${carById(s.activeCar).model} is warmed up`)),
      h('div', { class: 'intro-cta' }, cta, h('small', { class: 'intro-hint' }, first ? 'Tap anywhere to start' : 'Tap to skip')),
    );
    app.root.append(el);

    // ---- art: the base layer is the dark shape; the lit layer is revealed by the sweep (a moving mask)
    const paint = () => {
      const draw = (c: HTMLCanvasElement, mode: 'base' | 'lit', headlights = 0) => {
        const { w, h: hh } = fitCanvas(c, 2);
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, w, hh);
        const cw = Math.min(w * 0.84, hh * 2.2);
        const x = (w - cw) / 2;
        const y = hh * 0.86;
        const o = { paint: s.paints[hero] ?? car.paint, trim: car.trim, detail: true, light: 1, headlights };
        try {
          if (mode === 'base' && tease) drawCar(ctx, hero, x, y, cw, { ...o, silhouette: true });
          else drawCar(ctx, hero, x, y, cw, o);
        } catch { /* art not ready for this car yet: the wordmark carries the title */ }
      };
      draw(base, 'base');
      draw(lit, 'lit');
    };
    requestAnimationFrame(paint);
    music.play('intro');

    let phase: 'title' | 'go' | 'out' = 'title';
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const finish = () => {
      if (phase === 'out') return;
      phase = 'out';
      timers.forEach(clearTimeout);
      el.classList.add('out');
      if (first) app.game.setSetting('introSeen', true);
      window.removeEventListener('keydown', onKey, true);
      later(() => { el.remove(); resolve(); }, reduced ? 120 : 280);
    };
    /** The player chose to play: the ignition cue, headlights, a beat of the soundtrack, then the Garage. */
    const go = () => {
      if (phase === 'go') return finish(); // a second tap skips the rest
      if (phase !== 'title') return;
      phase = 'go';
      el.classList.add('go');
      if (!s.settings.muted) ignitionCue(s.activeCar);
      // light the hero (the Sovereign tease stays a silhouette: one more pass of light instead)
      if (!tease) requestAnimationFrame(() => {
        const { w, h: hh } = fitCanvas(lit, 2);
        const ctx = lit.getContext('2d')!;
        ctx.clearRect(0, 0, w, hh);
        const cw = Math.min(w * 0.84, hh * 2.2);
        try { drawCar(ctx, hero, (w - cw) / 2, hh * 0.86, cw, { paint: s.paints[hero] ?? car.paint, trim: car.trim, detail: true, light: 1, headlights: 1 }); } catch { /* see above */ }
      });
      later(finish, first ? (reduced ? 500 : 1100) : 250);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      go();
    };
    el.addEventListener('pointerup', (e) => { e.preventDefault(); go(); });
    cta.addEventListener('click', (e) => { if ((e as MouseEvent).detail === 0) go(); }); // keyboard activation
    window.addEventListener('keydown', onKey, true);
    cta.focus({ preventScroll: true });
    // repeat launches: about a second, then straight in (no tap needed)
    if (!first) later(finish, reduced ? 700 : 1150);
  });
}
