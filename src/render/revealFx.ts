import { carAnchors, carBodyPath } from './car';

// Signature reveal moments for the Circuit supercars, drawn over the cached car in the reveal overlay.
//   Tempest E4: the light blade powers on from the centre of the nose with an electric arc along the sill.
//   Meridian LT: one long light sweep travels the full length of the body under a moving ceiling strip.
//   Ardent Spyder: the driver's visor catches the light and the rear wheel spins up in a cloud of tyre smoke.
// Reduced motion: no flicker, arcs, smoke or travel — each car gets a single soft, static version of its moment.

export type RevealPhase = 'cover' | 'pull' | 'spot' | 'lights' | 'turn' | 'done';

export const REVEAL_SIGNATURE_CARS: readonly string[] = ['tempest', 'meridian', 'ardent'];

/** Deterministic noise so the arc flickers without allocating. */
const n01 = (a: number) => { const x = Math.sin(a * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Draw the car's signature moment. (x, y, w) are the car's drawCar coordinates on this canvas (any transform the
 * caller applies to the car applies here too). `t` is seconds into the phase. Returns true while it wants frames.
 */
export function drawRevealSignature(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, phase: RevealPhase, t: number, reduced: boolean): boolean {
  if (!REVEAL_SIGNATURE_CARS.includes(id) || phase === 'cover' || phase === 'pull') return false;
  const a = carAnchors(id, x, y, w);
  const u = a.k; // px per metre
  ctx.save();
  if (id === 'tempest') tempest(ctx, a, u, phase, t, reduced);
  else if (id === 'meridian') meridian(ctx, id, x, y, w, a, u, phase, t, reduced);
  else ardent(ctx, a, u, phase, t, reduced);
  ctx.restore();
  return phase === 'lights' || phase === 'turn';
}

type A = ReturnType<typeof carAnchors>;

function glowLine(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], col: string, width: number, alpha: number) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [k, al] of [[5, 0.12], [2.4, 0.3], [1, 1]] as const) {
    ctx.strokeStyle = col; ctx.globalAlpha = al * alpha; ctx.lineWidth = width * k;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function tempest(ctx: CanvasRenderingContext2D, a: A, u: number, phase: RevealPhase, t: number, reduced: boolean) {
  const cyan = '#5ef2ff';
  // the light blade across the nose: from the near lamp to the far lamp, growing out from the middle
  const grow = phase === 'spot' ? 0 : phase === 'lights' ? (reduced ? 1 : Math.min(1, t / 0.35)) : 1;
  const flick = phase === 'lights' && !reduced && t < 0.35 ? 0.6 + 0.4 * n01(Math.floor(t * 40)) : 1;
  if (grow > 0) {
    const mx = (a.lamp.x + a.lampFar.x) / 2, my = (a.lamp.y + a.lampFar.y) / 2;
    const hx = ((a.lampFar.x - a.lamp.x) / 2) * grow * 1.15, hy = ((a.lampFar.y - a.lamp.y) / 2) * grow * 1.15;
    glowLine(ctx, [{ x: mx - hx, y: my - hy }, { x: mx + hx, y: my + hy }], cyan, Math.max(1.5, u * 0.02), (phase === 'done' ? 0.55 : 0.9) * flick);
    const bl = ctx.createRadialGradient(mx, my, 0, mx, my, u * 0.9);
    bl.addColorStop(0, `rgba(94,242,255,${0.35 * grow * flick})`); bl.addColorStop(1, 'rgba(94,242,255,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(mx, my, u * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // the electric arc: a jagged bolt from the rear wheel to the front along the sill, then each wheel ring flashes
  if (phase === 'lights' && !reduced && t < 0.75) {
    const fade = 1 - t / 0.75;
    const seed = Math.floor(t * 30);
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const jit = i === 0 || i === n ? 0 : (n01(seed * 31 + i) - 0.5) * u * 0.22;
      pts.push({ x: a.rear.x + (a.front.x - a.rear.x) * f, y: a.sillY - u * 0.05 + jit });
    }
    glowLine(ctx, pts, '#d9fbff', Math.max(1, u * 0.008), fade);
    glowLine(ctx, pts, cyan, Math.max(1, u * 0.015), fade * 0.6);
    for (const wh of [a.rear, a.front]) {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = cyan; ctx.globalAlpha = fade; ctx.lineWidth = Math.max(1.5, u * 0.03);
      ctx.beginPath(); ctx.arc(wh.x, wh.y, wh.r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function meridian(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, a: A, u: number, phase: RevealPhase, t: number, reduced: boolean) {
  // progress of the long sweep over the lights and turn phases together (≈2.5 s), tail → nose
  const p = reduced ? 0.55 : phase === 'spot' ? 0 : phase === 'lights' ? Math.min(1, t / 0.9) * 0.35 : phase === 'turn' ? 0.35 + 0.65 * Math.min(1, t / 1.6) : 1.2;
  if (p <= 0 || p > 1.1) return;
  const sx = x + (w + u * 0.8) * p - u * 0.4;
  // the ceiling strip that carries the light
  const sy = a.roofY - u * 0.9;
  const strip = ctx.createLinearGradient(sx - u * 1.2, 0, sx + u * 1.2, 0);
  strip.addColorStop(0, 'rgba(220,235,255,0)'); strip.addColorStop(0.5, 'rgba(235,245,255,0.9)'); strip.addColorStop(1, 'rgba(220,235,255,0)');
  ctx.fillStyle = strip; ctx.fillRect(sx - u * 1.2, sy, u * 2.4, Math.max(2, u * 0.03));
  // the band of light running along the paint
  ctx.save();
  carBodyPath(ctx, id, x, y, w);
  ctx.clip();
  const band = ctx.createLinearGradient(sx - u * 0.7, y - u, sx + u * 0.7, y);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.4, 'rgba(225,238,255,0.25)'); band.addColorStop(0.5, `rgba(240,248,255,${reduced ? 0.35 : 0.85})`);
  band.addColorStop(0.56, 'rgba(225,238,255,0.15)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = band; ctx.fillRect(sx - u * 2, y - u * 2, u * 4, u * 2.2);
  ctx.restore();
}

function ardent(ctx: CanvasRenderingContext2D, a: A, u: number, phase: RevealPhase, t: number, reduced: boolean) {
  // the visor glint: the helmet sits above the cockpit (see car.ts ardentCockpit)
  const hx = a.rear.x + u * (1.82 - 0.82) + a.depth.x * 0.3 + u * 0.07, hy = a.rear.y - u * (1.11 - 0.33) + a.depth.y * 0.3;
  const glint = phase === 'spot' ? 0 : phase === 'lights' ? Math.max(0, 1 - Math.abs(t - 0.25) / 0.25) : reduced ? 0 : 0;
  if (glint > 0 || (reduced && phase === 'lights')) {
    const k = reduced ? 0.6 : glint;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; ctx.lineWidth = Math.max(1, u * 0.012); ctx.lineCap = 'round';
    for (const [dx, dy] of [[1, 0], [0, 1], [0.7, 0.7], [-0.7, 0.7]]) {
      const L = u * 0.16 * (dx && dy ? 0.5 : 1);
      ctx.beginPath(); ctx.moveTo(hx - dx * L, hy - dy * L); ctx.lineTo(hx + dx * L, hy + dy * L); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (reduced || (phase !== 'lights' && phase !== 'turn')) return;
  // the rear wheel spins up: a blurred spinning disc with streaks, and smoke rolling back off the tyre
  const spin = phase === 'lights' ? Math.min(1, t / 0.3) : Math.max(0, 1 - t / 0.8);
  if (spin <= 0) return;
  const r = a.rear;
  ctx.save();
  ctx.globalAlpha = 0.55 * spin; ctx.fillStyle = '#5d5040';
  ctx.beginPath(); ctx.arc(r.x, r.y, r.r * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,220,0.7)'; ctx.lineWidth = Math.max(1, r.r * 0.05);
  for (const q of [0.4, 0.62]) { const s = t * 40 * q; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * q, s, s + 2.4); ctx.stroke(); }
  ctx.restore();
  const T = phase === 'lights' ? t : 0.9 + t;
  for (let i = 0; i < 14; i++) {
    const born = i * 0.08;
    const age = T - born;
    if (age < 0 || age > 1.1) continue;
    const life = age / 1.1;
    const px = r.x - r.r * 0.6 - age * u * (1.2 + n01(i) * 0.8);
    const py = r.y + r.r * 0.75 - age * u * (0.35 + n01(i + 9) * 0.3);
    const rad = r.r * (0.35 + life * 1.4);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(215,212,205,${0.38 * (1 - life) * Math.min(1, spin + 0.3)})`); g.addColorStop(1, 'rgba(215,212,205,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
  }
}
