// Title screen: a short, skippable cinematic opening for Rev Up. Lazy-loaded by main.ts so it never weighs on first
// paint, and precached with the rest of the build for offline play.
//
// First launch (about 3.6 s, Skip or a tap jumps to the end): a low tracking shot along the flagship Sovereign at dusk —
// the camera pulls back and slides as a key light rises, a band of light sweeps the paint, the headlights come on with
// a lens flare, then the wordmark is revealed and the Play screen settles. The tap on Play is also the gesture that
// lets the ignition cue and the soundtrack play.
// Repeat launches (settings.introSeen): about a second on the player's own car, then straight into the Garage.
// Reduced motion: one still, lit frame and plain fades. Everything is drawn in 2D canvas from the shared car art.
import './css/intro.css';
import { ignitionCue, music } from '../audio-api';
import { carStyle } from '../core/style';
import { carById, type CarId } from '../data/tables';
import { ART_CARS, carAnchors, drawHeroCar } from '../render/car';
import type { App } from './app';
import { fmt, h } from './dom';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** The film's beats, in seconds (first launch). A return launch plays the same shot about three times faster. */
const BEAT = { fadeIn: 0.5, keyFrom: 0.3, keyTo: 2.2, sweepFrom: 0.7, sweepTo: 2.0, lights: 2.15, mark: 2.35, cta: 2.95, end: 3.6 };

interface Sprites { lit: HTMLCanvasElement; lamps: HTMLCanvasElement; fx: HTMLCanvasElement; rear: number; ground: number; carW: number; lamp: { x: number; y: number } }

export function runIntro(app: App): Promise<void> {
  return new Promise((resolve) => {
    const s = app.game.state;
    const first = !s.settings.introSeen;
    const reduced = s.settings.reducedMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // The hero: the flagship the whole garage builds toward on a first launch; the player's own car afterwards.
    // the Tempest E4 (the electric flagship, cyan light-blade face) when its art exists, else the Sovereign
    const flagship = ((ART_CARS as readonly string[]).includes('tempest') ? 'tempest' : 'sovereign') as CarId;
    let hero: CarId = first ? flagship : s.activeCar;
    try { carById(hero); } catch { hero = s.activeCar; }
    const car = carById(hero);
    const owned = s.owned.includes(hero);
    const paint = (owned && s.paints[hero]) || car.paint;
    const style = owned ? carStyle(s, hero) : undefined;
    const speed = first ? 1 : 2.9; // return launches: the same shot, quicker

    const stage = h('canvas', { class: 'intro-canvas', 'aria-hidden': 'true' });
    const cta = h('button', { class: 'btn primary intro-go' }, first ? 'Play' : 'Continue');
    const skip = h('button', { class: 'intro-skip', 'aria-label': 'Skip intro' }, 'Skip');
    const level = s.owned.length;
    const meta = first
      ? h('p', { class: 'intro-tag' }, `Merge parts · win races · earn the ${car.model.split(' ')[0]}`)
      : h('p', { class: 'intro-tag own' }, h('b', {}, carById(s.activeCar).model), h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
        `${level} car${level === 1 ? '' : 's'}`, h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'), `${fmt(s.rep)} Rep`);
    const el = h('div', { class: `intro${first ? ' first' : ' quick'}${reduced ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rev Up' },
      stage,
      h('div', { class: 'intro-vignette', 'aria-hidden': 'true' }),
      h('div', { class: 'intro-mark' },
        h('h1', { class: 'wordmark', 'aria-label': 'Rev Up' }, h('span', { class: 'w1' }, 'REV'), h('span', { class: 'w2' }, 'UP'), h('i', { class: 'glint', 'aria-hidden': 'true' })),
        meta),
      h('div', { class: 'intro-cta' }, cta, h('small', { class: 'intro-hint' }, first ? 'Tap anywhere to start' : 'Tap to continue')),
      skip,
    );
    app.root.append(el);

    // ---------------- drawing ----------------
    let W = 0, H = 0, dpr = 1;
    let sp: Sprites | null = null;
    const ctx = stage.getContext('2d', { alpha: false })!;

    /** Composition: the car's resting length and where its rear wheel sits on the floor line. */
    const frame = () => {
      const carW = Math.min(W * 0.8, H * 0.95, 860 * dpr);
      const floorY = Math.round(H * (H > W ? 0.46 : 0.54));
      return { carW, floorY, x: (W - carW) / 2 - carW * 0.04 };
    };

    /** Render the hero once at the film's largest scale: lit, and lit with headlights. */
    const buildSprites = (): Sprites | null => {
      const { carW: rest } = frame();
      const carW = Math.round(rest * 1.75);
      const sw = Math.round(carW * 1.62), sh = Math.round(carW * 0.5);
      const rear = Math.round(carW * 0.06), ground = Math.round(sh * 0.86);
      const mk = () => { const c = document.createElement('canvas'); c.width = sw; c.height = sh; return c; };
      const lit = mk(), lamps = mk(), fx = mk();
      // Art's hero render: the detailed car with an extra key light and a rim light along the roof
      const rim = hero === 'tempest' ? '#9fe6ff' : 0.55;
      const o = { paint, trim: car.trim, detail: true, light: 1, style, shadow: true, rimLight: rim };
      try {
        drawHeroCar(lit.getContext('2d')!, hero, rear, ground, carW, { ...o, headlights: 0 });
        drawHeroCar(lamps.getContext('2d')!, hero, rear, ground, carW, { ...o, headlights: 1 });
      } catch { return null; }
      // the near headlamp, for the lens flare
      const a = carAnchors(hero, rear, ground, carW);
      return { lit, lamps, fx, rear, ground, carW, lamp: a.lamp };
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = el.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      stage.width = W; stage.height = H;
      sp = buildSprites();
    };

    // Background bokeh: distant lights that move slower than the floor, so the pan reads as a camera move.
    const bokeh = Array.from({ length: 16 }, (_, i) => {
      const r = Math.sin(i * 91.7) * 43758.5453; const f = r - Math.floor(r);
      const r2 = Math.sin(i * 12.9 + 3.1) * 24634.6345; const g = r2 - Math.floor(r2);
      return { x: f * 1.6 - 0.3, y: 0.12 + g * 0.26, r: 0.006 + g * 0.018, warm: i % 3 !== 0, a: 0.18 + f * 0.3 };
    });

    const paintFrame = (t: number) => {
      if (!W) return;
      const { carW: rest, floorY, x: restX } = frame();
      const tf = t / BEAT.end;
      // camera: starts close on the nose and low, pulls back and slides to the resting three-quarter composition
      const k = reduced ? 0 : 1 - ease(span(t, 0, BEAT.cta + 0.2));
      const scale = 1 + 0.75 * k;
      const pan = 0.42 * k; // fraction of the car length the shot is offset to the left (nose in frame)
      const cw = rest * scale;
      const x = restX - (cw - rest) * 0.62 - rest * pan;
      const camY = floorY + H * 0.05 * k; // low camera: the floor line sits lower early on
      // ---- sky and studio: deep blue dusk, a warm horizon glow behind the car
      const sky = ctx.createLinearGradient(0, 0, 0, camY);
      sky.addColorStop(0, '#05070b'); sky.addColorStop(0.62, '#101826'); sky.addColorStop(1, '#1f2632');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, camY);
      const glowA = reduced ? 1 : easeOut(span(t, 0.2, 1.8));
      const glow = ctx.createRadialGradient(W * 0.55, camY, 0, W * 0.55, camY, Math.max(W, H) * 0.7);
      glow.addColorStop(0, `rgba(255,170,90,${0.32 * glowA})`); glow.addColorStop(0.35, `rgba(214,110,70,${0.12 * glowA})`); glow.addColorStop(1, 'rgba(20,24,34,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, camY);
      // bokeh city lights, parallax at a third of the floor's speed
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of bokeh) {
        const bx = (b.x - pan * 0.35 + 0.02 * tf) * W;
        const by = b.y * H + (camY - floorY) * 0.4;
        const br = b.r * Math.max(W, H);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        const c = b.warm ? '255,190,120' : '140,190,255';
        g.addColorStop(0, `rgba(${c},${b.a * glowA})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // ---- floor: polished dark concrete with perspective seams that track with the camera
      const floor = ctx.createLinearGradient(0, camY, 0, H);
      floor.addColorStop(0, '#1a1f27'); floor.addColorStop(0.25, '#0d1016'); floor.addColorStop(1, '#06080b');
      ctx.fillStyle = floor; ctx.fillRect(0, camY, W, H - camY);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,160,0.07)'; ctx.lineWidth = Math.max(1, dpr);
      const seam = rest * 0.55;
      const off = ((x - restX) % seam + seam) % seam;
      for (let i = -3; i < 8; i++) {
        const sx = restX + off + i * seam;
        ctx.beginPath(); ctx.moveTo(W / 2 + (sx - W / 2) * 0.55, camY); ctx.lineTo(W / 2 + (sx - W / 2) * 2.6, H); ctx.stroke();
      }
      ctx.restore();
      // horizon highlight
      const hl = ctx.createLinearGradient(0, 0, W, 0);
      hl.addColorStop(0, 'rgba(255,206,135,0)'); hl.addColorStop(0.5, `rgba(255,206,135,${0.45 * glowA})`); hl.addColorStop(1, 'rgba(255,206,135,0)');
      ctx.fillStyle = hl; ctx.fillRect(0, camY - dpr, W, Math.max(1, 2 * dpr));
      if (!sp) return;
      // ---- the car: lit sprite, headlights cross-faded in, darkened by the rising key light, a sweep of light on top
      const lightsOn = reduced ? 1 : easeOut(span(t, BEAT.lights, BEAT.lights + 0.25));
      const dark = reduced ? 0 : lerp(0.82, 0, ease(span(t, BEAT.keyFrom, BEAT.keyTo)));
      const fx = sp.fx.getContext('2d')!;
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
      fx.clearRect(0, 0, sp.fx.width, sp.fx.height);
      fx.drawImage(sp.lit, 0, 0);
      if (lightsOn > 0) { fx.globalAlpha = lightsOn; fx.drawImage(sp.lamps, 0, 0); fx.globalAlpha = 1; }
      fx.globalCompositeOperation = 'source-atop';
      fx.fillStyle = `rgba(6,9,15,${dark})`; fx.fillRect(0, 0, sp.fx.width, sp.fx.height);
      // rim light from the horizon glow, along the roof line
      const rim = fx.createLinearGradient(0, 0, 0, sp.ground);
      rim.addColorStop(0, `rgba(255,190,120,${0.22 * glowA})`); rim.addColorStop(0.45, 'rgba(255,190,120,0)');
      fx.fillStyle = rim; fx.fillRect(0, 0, sp.fx.width, sp.ground);
      const sw = reduced ? -1 : span(t, BEAT.sweepFrom, BEAT.sweepTo);
      if (sw > 0 && sw < 1) {
        const bx = lerp(-0.2, 1.2, ease(sw)) * sp.fx.width;
        const band = fx.createLinearGradient(bx - sp.carW * 0.22, 0, bx + sp.carW * 0.22, sp.fx.height * 0.3);
        band.addColorStop(0, 'rgba(255,240,215,0)'); band.addColorStop(0.5, 'rgba(255,240,215,0.55)'); band.addColorStop(1, 'rgba(255,240,215,0)');
        fx.fillStyle = band; fx.fillRect(0, 0, sp.fx.width, sp.fx.height);
      }
      fx.globalCompositeOperation = 'source-over';
      const f = cw / sp.carW;
      const dx = x - sp.rear * f, dy = camY - sp.ground * f;
      const dw = sp.fx.width * f, dh = sp.fx.height * f;
      // reflection on the polished floor
      ctx.save();
      ctx.globalAlpha = 0.2 * (reduced ? 1 : span(t, 0.2, 1.2));
      ctx.translate(0, camY * 2); ctx.scale(1, -1);
      ctx.drawImage(sp.fx, dx, dy, dw, dh);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, camY, 0, camY + cw * 0.3);
      fade.addColorStop(0, 'rgba(10,13,18,0.1)'); fade.addColorStop(1, 'rgba(7,9,12,1)');
      ctx.fillStyle = fade; ctx.fillRect(0, camY, W, H - camY);
      ctx.drawImage(sp.fx, dx, dy, dw, dh);
      // ---- lens flare on the leading headlamp: a flash as the lights come on, then a steady glint
      const flash = reduced ? 0 : Math.max(0, 1 - Math.abs(t - (BEAT.lights + 0.12)) / 0.35);
      const glint = lightsOn * 0.45 + flash * 0.9;
      if (glint > 0.01) {
        const lx = dx + sp.lamp.x * f, ly = dy + sp.lamp.y * f;
        const R = cw * 0.09 * (1 + flash * 0.8);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const core = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        core.addColorStop(0, `rgba(255,252,240,${glint})`); core.addColorStop(0.25, `rgba(255,220,170,${0.45 * glint})`); core.addColorStop(1, 'rgba(255,200,150,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.fill();
        // anamorphic streak
        const streakW = W * (0.35 + flash * 0.5);
        const st = ctx.createLinearGradient(lx - streakW, 0, lx + streakW, 0);
        st.addColorStop(0, 'rgba(150,200,255,0)'); st.addColorStop(0.5, `rgba(205,228,255,${0.5 * glint})`); st.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.fillStyle = st; ctx.fillRect(lx - streakW, ly - Math.max(1, 1.5 * dpr), streakW * 2, Math.max(2, 3 * dpr));
        // ghosts along the line through the centre of the frame
        const vx = W / 2 - lx, vy = H * 0.42 - ly;
        for (const [d, r, a] of [[0.7, 0.025, 0.16], [1.15, 0.05, 0.1], [1.5, 0.018, 0.2]] as const) {
          const gx = lx + vx * d, gy = ly + vy * d, gr = Math.max(W, H) * r;
          const gg = ctx.createRadialGradient(gx, gy, gr * 0.2, gx, gy, gr);
          gg.addColorStop(0, `rgba(160,210,255,${a * glint})`); gg.addColorStop(1, 'rgba(160,210,255,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      // ---- fade from black at the start
      const fin = reduced ? 1 : span(t, 0, BEAT.fadeIn);
      if (fin < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fin})`; ctx.fillRect(0, 0, W, H); }
    };

    // ---------------- timeline ----------------
    let phase: 'film' | 'title' | 'go' | 'out' = 'film';
    let t0 = performance.now();
    let raf = 0;
    let filmT = 0;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const reveal = (cls: string) => el.classList.add(cls);

    const loop = (now: number) => {
      raf = 0;
      if (phase === 'out') return;
      if (phase === 'film') {
        filmT = ((now - t0) / 1000) * speed;
        if (filmT >= BEAT.mark) reveal('mark-in');
        if (filmT >= BEAT.cta) reveal('cta-in');
        if (filmT >= BEAT.end) { toTitle(); return; }
        paintFrame(filmT);
        raf = requestAnimationFrame(loop);
      }
    };
    /** The resting Play screen: one final frame, then the canvas stops (no idle redraws on the battery). */
    const toTitle = () => {
      if (phase !== 'film') return;
      phase = 'title';
      filmT = BEAT.end;
      cancelAnimationFrame(raf); raf = 0;
      reveal('mark-in'); reveal('cta-in'); el.classList.add('rest');
      skip.hidden = true;
      paintFrame(BEAT.end);
      cta.focus({ preventScroll: true });
      if (!first) later(finish, reduced ? 600 : 150); // return launch: straight on into the Garage
    };

    const onResize = () => { resize(); paintFrame(phase === 'film' ? filmT : BEAT.end); };
    const finish = () => {
      if (phase === 'out') return;
      phase = 'out';
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      el.classList.add('out');
      if (first) app.game.setSetting('introSeen', true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      later(() => { el.remove(); resolve(); }, reduced ? 120 : 320);
    };
    /** The player chose to play: the ignition cue, a headlight flash, a beat of the soundtrack, then the Garage. */
    const go = () => {
      if (phase === 'film') return toTitle();
      if (phase === 'go') return finish(); // a second tap skips the rest
      if (phase !== 'title') return;
      phase = 'go';
      el.classList.add('go');
      if (!s.settings.muted) ignitionCue(s.activeCar);
      if (!reduced) {
        // flash the headlights once more: replay the flare beat over the resting frame
        const g0 = performance.now();
        const flashLoop = (now: number) => {
          if (phase !== 'go') return;
          const k = (now - g0) / 1000;
          paintFrame(BEAT.lights + Math.min(0.5, k));
          if (k < 0.5) requestAnimationFrame(flashLoop);
        };
        requestAnimationFrame(flashLoop);
      }
      later(finish, first ? (reduced ? 450 : 950) : 200);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (phase === 'film') toTitle(); else go();
    };
    skip.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); toTitle(); });
    skip.addEventListener('click', (e) => { e.stopPropagation(); if ((e as MouseEvent).detail === 0) toTitle(); });
    el.addEventListener('pointerup', (e) => { if (e.target === skip) return; e.preventDefault(); go(); });
    cta.addEventListener('click', (e) => { if ((e as MouseEvent).detail === 0) go(); }); // keyboard activation
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    el.tabIndex = -1;
    el.focus({ preventScroll: true });

    music.play('intro');
    // first frame: size and draw the dark opening frame at once, build the art on the next frame
    requestAnimationFrame(() => {
      resize();
      t0 = performance.now();
      if (reduced) { toTitle(); return; }
      // dev only: ?introT=1.2 holds the film at that second, for reviewing frames
      const hold = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('introT') ?? NaN) : NaN;
      if (hold >= 0) { filmT = hold; if (hold >= BEAT.mark) reveal('mark-in'); if (hold >= BEAT.cta) reveal('cta-in'); paintFrame(hold); return; }
      paintFrame(0);
      raf = requestAnimationFrame(loop);
    });
  });
}
