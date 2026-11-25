import type { CarId } from '../data/tables';

// Original side-profile silhouettes, facing right. Coordinates: x 0 (rear) → 1 (nose), y 0 (ground) → up,
// as a fraction of car length. Each class has its own proportions and details.

type Pt = [number, number];
interface Shape {
  body: Pt[];
  glass: Pt[];
  wheels: [number, number]; // x positions
  r: number; // wheel radius
  ride: number; // body bottom height
  light: Pt; // headlight position
  tail: Pt;
}

const SHAPES: Record<string, Shape> = {
  junker: {
    body: [[0.02, 0.07], [0, 0.12], [0.01, 0.25], [0.05, 0.3], [0.1, 0.43], [0.56, 0.45], [0.72, 0.3], [0.91, 0.27], [0.99, 0.22], [1, 0.1], [0.96, 0.07]],
    glass: [[0.12, 0.31], [0.14, 0.41], [0.53, 0.42], [0.66, 0.31]],
    wheels: [0.2, 0.8], r: 0.075, ride: 0.07, light: [0.97, 0.2], tail: [0.015, 0.22],
  },
  beater: {
    body: [[0.02, 0.07], [0, 0.11], [0, 0.22], [0.03, 0.26], [0.2, 0.28], [0.3, 0.39], [0.58, 0.4], [0.72, 0.28], [0.94, 0.25], [1, 0.2], [1, 0.1], [0.97, 0.07]],
    glass: [[0.24, 0.285], [0.32, 0.375], [0.56, 0.38], [0.67, 0.285]],
    wheels: [0.19, 0.81], r: 0.072, ride: 0.07, light: [0.98, 0.19], tail: [0.01, 0.2],
  },
  hothatch: {
    body: [[0.04, 0.06], [0, 0.1], [0, 0.2], [0.04, 0.3], [0.06, 0.38], [0.01, 0.4], [0.03, 0.42], [0.14, 0.41], [0.52, 0.42], [0.7, 0.28], [0.92, 0.23], [1, 0.18], [1, 0.08], [0.96, 0.06]],
    glass: [[0.09, 0.3], [0.15, 0.385], [0.5, 0.395], [0.64, 0.29]],
    wheels: [0.19, 0.8], r: 0.082, ride: 0.06, light: [0.975, 0.17], tail: [0.015, 0.19],
  },
  muscle: {
    body: [[0.02, 0.07], [0, 0.11], [0, 0.21], [0.03, 0.25], [0.12, 0.26], [0.36, 0.37], [0.55, 0.37], [0.66, 0.27], [0.95, 0.23], [1, 0.19], [1, 0.1], [0.97, 0.07]],
    glass: [[0.3, 0.29], [0.38, 0.35], [0.54, 0.355], [0.62, 0.275]],
    wheels: [0.2, 0.8], r: 0.08, ride: 0.07, light: [0.985, 0.18], tail: [0.008, 0.19],
  },
};
// Expansion classes reuse a base silhouette until they get their own art.
const shapeFor = (id: CarId | string): Shape => SHAPES[id] ?? SHAPES.muscle;

export interface CarDrawOpts {
  paint: string;
  trim?: string;
  wheelAngle?: number;
  headlights?: number; // 0..1 intensity
  cover?: number; // 0 = uncovered, 1 = fully covered
  silhouette?: boolean; // flat locked silhouette
  shadow?: boolean;
  nitro?: number; // 0..1 flame
  brake?: boolean;
  livery?: string | null;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], x: number, y: number, w: number) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const X = x + px * w;
    const Y = y - py * w;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  });
  ctx.closePath();
}

/** Draw a car with its rear-bottom at (x, groundY), length w pixels. */
export function drawCar(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, o: CarDrawOpts) {
  const s = shapeFor(id);
  ctx.save();
  if (o.shadow !== false) {
    const g = ctx.createRadialGradient(x + w / 2, y, 2, x + w / 2, y, w * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + w * 0.01, w * 0.58, w * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.silhouette) {
    ctx.fillStyle = '#0d0a08';
    poly(ctx, s.body, x, y, w);
    ctx.fill();
    for (const wx of s.wheels) {
      ctx.beginPath();
      ctx.arc(x + wx * w, y - s.r * w, s.r * w, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // nitro flame behind
  if (o.nitro && o.nitro > 0) {
    const fx = x - w * 0.02;
    const fy = y - w * 0.09;
    const len = w * (0.18 + 0.12 * o.nitro) * (0.85 + Math.random() * 0.3);
    const fg = ctx.createLinearGradient(fx, fy, fx - len, fy);
    fg.addColorStop(0, 'rgba(255,255,255,0.95)');
    fg.addColorStop(0.25, 'rgba(120,200,255,0.9)');
    fg.addColorStop(0.6, 'rgba(255,170,60,0.7)');
    fg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(fx, fy - w * 0.025);
    ctx.quadraticCurveTo(fx - len * 0.6, fy - w * 0.04, fx - len, fy);
    ctx.quadraticCurveTo(fx - len * 0.6, fy + w * 0.04, fx, fy + w * 0.025);
    ctx.fill();
  }

  const paint = o.paint;
  // headlight beam
  if (o.headlights && o.headlights > 0) {
    const hx = x + s.light[0] * w;
    const hy = y - s.light[1] * w;
    const bg = ctx.createLinearGradient(hx, hy, hx + w * 1.4, hy);
    bg.addColorStop(0, `rgba(255,236,190,${0.55 * o.headlights})`);
    bg.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(hx, hy - w * 0.015);
    ctx.lineTo(hx + w * 1.4, hy - w * 0.22);
    ctx.lineTo(hx + w * 1.4, hy + w * 0.16);
    ctx.lineTo(hx, hy + w * 0.02);
    ctx.fill();
  }

  // body
  const top = y - 0.45 * w;
  const bodyG = ctx.createLinearGradient(0, top, 0, y);
  bodyG.addColorStop(0, shade(paint, 55));
  bodyG.addColorStop(0.45, paint);
  bodyG.addColorStop(1, shade(paint, -55));
  ctx.fillStyle = bodyG;
  poly(ctx, s.body, x, y, w);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, w * 0.008);
  ctx.stroke();

  // class details
  ctx.save();
  poly(ctx, s.body, x, y, w);
  ctx.clip();
  const trim = o.trim ?? shade(paint, -60);
  if (id === 'junker') {
    // mismatched door
    ctx.fillStyle = '#6d7b86';
    ctx.fillRect(x + 0.34 * w, y - 0.3 * w, 0.22 * w, 0.22 * w);
    // rust patches
    ctx.fillStyle = 'rgba(140,70,30,0.55)';
    ctx.beginPath(); ctx.ellipse(x + 0.86 * w, y - 0.16 * w, 0.04 * w, 0.02 * w, 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 0.08 * w, y - 0.12 * w, 0.03 * w, 0.025 * w, 0, 0, 7); ctx.fill();
  } else if (id === 'beater') {
    ctx.fillStyle = 'rgba(255,240,220,0.18)'; // sunburnt roof
    ctx.fillRect(x + 0.28 * w, y - 0.41 * w, 0.32 * w, 0.03 * w);
    ctx.fillStyle = trim;
    ctx.fillRect(x, y - 0.13 * w, w, 0.018 * w);
  } else if (id === 'hothatch') {
    ctx.fillStyle = trim; // pinstripe
    ctx.fillRect(x, y - 0.205 * w, w, 0.012 * w);
    ctx.fillRect(x, y - 0.09 * w, w, 0.02 * w);
  } else if (id === 'muscle') {
    ctx.fillStyle = trim; // twin stripes
    ctx.fillRect(x, y - 0.2 * w, w, 0.014 * w);
    ctx.fillRect(x, y - 0.17 * w, w, 0.014 * w);
  }
  if (o.livery) {
    ctx.fillStyle = o.livery;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x + 0.15 * w, y - 0.07 * w);
    ctx.lineTo(x + 0.55 * w, y - 0.26 * w);
    ctx.lineTo(x + 0.7 * w, y - 0.26 * w);
    ctx.lineTo(x + 0.3 * w, y - 0.07 * w);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // glass
  const gg = ctx.createLinearGradient(0, y - 0.42 * w, 0, y - 0.28 * w);
  gg.addColorStop(0, '#3b4a57');
  gg.addColorStop(1, '#141b22');
  ctx.fillStyle = gg;
  poly(ctx, s.glass, x, y, w);
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.stroke();
  // B-pillar & reflection
  const gx = s.glass.map((p) => p[0]);
  const mid = (Math.min(...gx) + Math.max(...gx)) / 2;
  ctx.fillStyle = trim;
  const gy = s.glass.map((p) => p[1]);
  ctx.save();
  poly(ctx, s.glass, x, y, w);
  ctx.clip();
  ctx.fillRect(x + mid * w - w * 0.008, y - Math.max(...gy) * w, w * 0.016, (Math.max(...gy) - Math.min(...gy)) * w);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(1, w * 0.01);
  ctx.beginPath();
  ctx.moveTo(x + (mid + 0.05) * w, y - 0.28 * w);
  ctx.lineTo(x + (mid + 0.11) * w, y - 0.41 * w);
  ctx.stroke();
  ctx.restore();
  if (id === 'junker') {
    // taped rear window
    ctx.strokeStyle = '#d8c98f';
    ctx.lineWidth = w * 0.012;
    ctx.beginPath();
    ctx.moveTo(x + 0.13 * w, y - 0.33 * w); ctx.lineTo(x + 0.24 * w, y - 0.4 * w);
    ctx.moveTo(x + 0.14 * w, y - 0.4 * w); ctx.lineTo(x + 0.23 * w, y - 0.32 * w);
    ctx.stroke();
  }
  if (id === 'hothatch') {
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 0.0 * w, y - 0.42 * w, 0.12 * w, 0.018 * w); // spoiler lip
  }
  if (id === 'muscle') {
    ctx.fillStyle = shade(paint, -40); // hood scoop
    ctx.beginPath();
    ctx.moveTo(x + 0.74 * w, y - 0.265 * w);
    ctx.lineTo(x + 0.78 * w, y - 0.29 * w);
    ctx.lineTo(x + 0.86 * w, y - 0.285 * w);
    ctx.lineTo(x + 0.88 * w, y - 0.255 * w);
    ctx.fill();
  }

  // lights
  ctx.fillStyle = o.headlights ? '#fff6d8' : '#e9dfb8';
  ctx.beginPath();
  ctx.ellipse(x + s.light[0] * w, y - s.light[1] * w, w * 0.018, w * 0.014, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = o.brake ? '#ff3b2f' : '#a3221b';
  ctx.fillRect(x + s.tail[0] * w - w * 0.01, y - s.tail[1] * w - w * 0.015, w * 0.02, w * 0.03);

  // wheels
  for (const wx of s.wheels) {
    const cx = x + wx * w;
    const cy = y - s.r * w;
    const R = s.r * w;
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.fill(); // arch shadow
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const rim = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, 1, cx, cy, R * 0.62);
    rim.addColorStop(0, '#e8e8e8');
    rim.addColorStop(1, id === 'muscle' ? '#8a7440' : '#6a6a6a');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,30,0.8)';
    ctx.lineWidth = Math.max(1, R * 0.12);
    const a0 = o.wheelAngle ?? 0;
    const spokes = id === 'hothatch' ? 6 : 5;
    ctx.beginPath();
    for (let k = 0; k < spokes; k++) {
      const a = a0 + (k * Math.PI * 2) / spokes;
      ctx.moveTo(cx + Math.cos(a) * R * 0.15, cy + Math.sin(a) * R * 0.15);
      ctx.lineTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55);
    }
    ctx.stroke();
  }

  // cover cloth (for the covered goal car / reveal)
  if (o.cover && o.cover > 0) drawCover(ctx, s, x, y, w, o.cover);
  ctx.restore();
}

function drawCover(ctx: CanvasRenderingContext2D, s: Shape, x: number, y: number, w: number, amount: number) {
  // Cloth drapes over the body; as amount → 0 it slides off toward the rear.
  const off = (1 - amount) * w * 1.3;
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount * 1.4);
  const g = ctx.createLinearGradient(x, y - 0.5 * w, x + w, y);
  g.addColorStop(0, '#6b5b49');
  g.addColorStop(0.5, '#4d4134');
  g.addColorStop(1, '#2f271f');
  ctx.fillStyle = g;
  ctx.beginPath();
  const pts = s.body.map(([px, py]) => [x + px * w - off, y - (py + 0.03) * w] as Pt);
  ctx.moveTo(x - w * 0.03 - off, y);
  for (const [px, py] of pts) ctx.lineTo(px, py);
  ctx.lineTo(x + w * 1.03 - off, y);
  ctx.closePath();
  ctx.fill();
  // folds
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = w * 0.01;
  for (let k = 1; k < 6; k++) {
    const fx = x + (k / 6) * w - off;
    ctx.beginPath();
    ctx.moveTo(fx, y - 0.4 * w);
    ctx.quadraticCurveTo(fx + w * 0.03, y - 0.2 * w, fx - w * 0.01, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,230,190,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + 0.15 * w - off, y - 0.44 * w);
  ctx.lineTo(x + 0.55 * w - off, y - 0.47 * w);
  ctx.stroke();
  ctx.restore();
}

/** Trace the body outline (for clipping showroom light sweeps to the paint). */
export function carBodyPath(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number) {
  poly(ctx, shapeFor(id).body, x, y, w);
}

/** Simple helper to size a canvas to its CSS box with a capped pixel ratio. */
export function fitCanvas(c: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return { w, h, dpr };
}
