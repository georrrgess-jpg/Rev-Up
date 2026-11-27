// Mechanic Shop backdrop: a service bay drawn with Canvas 2D — back wall with a tool board, a tyre rack, overhead
// strip lamps, a two-post lift, safety markings and a polished epoxy floor that reflects the lamps. The lighting
// shifts per area (warm over the engine, cool on the wheels, white on the body, green in tuning).
//
//   drawServiceBay(ctx, w, h, { area, light, t })
//
// Draw it first, every frame or whenever the area changes, then draw the car with its ground line at
// `bayFloorY(h)` (the lift's arms meet the car's sills there). The static room is cached per size and area, so a
// frame is three blits plus a few gradients.

export type BayArea = 'engine' | 'wheels' | 'body' | 'tuning';
export interface BayOpts {
  area: BayArea;
  /** 0..1 lamp brightness (fade the bay up when it opens). */
  light?: number;
  /** Seconds, for the slow lamp shimmer and the reflection drift; pass a constant under reduced motion. */
  t?: number;
}

/** Each area's key light colour (r,g,b) and wall tint. */
const LOOK: Record<BayArea, { key: [number, number, number]; wall: string; wall2: string; accent: string }> = {
  engine: { key: [255, 186, 112], wall: '#2a2622', wall2: '#14120f', accent: '#f2a13a' },
  wheels: { key: [150, 210, 255], wall: '#1f262e', wall2: '#0e1217', accent: '#4fb6ff' },
  body: { key: [255, 250, 240], wall: '#272a2e', wall2: '#121417', accent: '#f4f1ea' },
  tuning: { key: [164, 236, 150], wall: '#1f2722', wall2: '#0e1310', accent: '#7ee06a' },
};

/** Where the car's ground line goes in a bay of height h. */
export const bayFloorY = (h: number) => Math.round(h * 0.8);

const cache = new Map<string, HTMLCanvasElement>();

function room(w: number, h: number, area: BayArea): HTMLCanvasElement {
  const key = `${w}|${h}|${area}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 8) cache.clear();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  const L = LOOK[area];
  const fy = bayFloorY(h);
  const u = Math.min(w, h * 1.4) / 400; // unit: 1 at a 400 px wide bay
  // back wall: painted block with a darker dado, faint panel seams
  const wall = c.createLinearGradient(0, 0, 0, fy);
  wall.addColorStop(0, L.wall2); wall.addColorStop(0.55, L.wall); wall.addColorStop(1, L.wall2);
  c.fillStyle = wall; c.fillRect(0, 0, w, fy);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, fy - h * 0.16, w, h * 0.16);
  c.strokeStyle = 'rgba(255,255,255,0.04)'; c.lineWidth = Math.max(1, u);
  for (let x = w * 0.08; x < w; x += 70 * u) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, fy - h * 0.16); c.stroke(); }
  c.fillStyle = L.accent; c.globalAlpha = 0.5; c.fillRect(0, fy - h * 0.16 - 3 * u, w, 2.5 * u); c.globalAlpha = 1;
  // tool board (left): pegboard with spanners, a hammer and a torque wrench in silhouette
  const tb = { x: w * 0.04, y: h * 0.14, w: w * 0.3, h: h * 0.3 };
  c.fillStyle = '#3a3630'; c.fillRect(tb.x, tb.y, tb.w, tb.h);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let yy = tb.y + 6 * u; yy < tb.y + tb.h; yy += 9 * u) for (let xx = tb.x + 6 * u; xx < tb.x + tb.w; xx += 9 * u) c.fillRect(xx, yy, 1.4 * u, 1.4 * u);
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2 * u; c.strokeRect(tb.x, tb.y, tb.w, tb.h);
  c.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    // spanners in ascending size
    const x = tb.x + tb.w * (0.08 + i * 0.07), len = tb.h * (0.38 + i * 0.05);
    c.strokeStyle = '#a9b0b7'; c.lineWidth = (2.2 + i * 0.35) * u;
    c.beginPath(); c.moveTo(x, tb.y + tb.h * 0.12); c.lineTo(x, tb.y + tb.h * 0.12 + len); c.stroke();
    c.beginPath(); c.arc(x, tb.y + tb.h * 0.12, (3 + i * 0.4) * u, Math.PI * 0.2, Math.PI * 1.8); c.stroke();
  }
  c.strokeStyle = L.accent; c.lineWidth = 4 * u;
  c.beginPath(); c.moveTo(tb.x + tb.w * 0.58, tb.y + tb.h * 0.2); c.lineTo(tb.x + tb.w * 0.58, tb.y + tb.h * 0.78); c.stroke();
  c.fillStyle = '#7c838a'; c.fillRect(tb.x + tb.w * 0.58 - 7 * u, tb.y + tb.h * 0.14, 14 * u, 7 * u);
  c.strokeStyle = '#c9ced3'; c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(tb.x + tb.w * 0.78, tb.y + tb.h * 0.15); c.lineTo(tb.x + tb.w * 0.86, tb.y + tb.h * 0.85); c.stroke();
  c.fillStyle = '#c23a2a'; c.fillRect(tb.x + tb.w * 0.84, tb.y + tb.h * 0.62, 6 * u, tb.h * 0.25);
  // rolling tool chest under the board
  const tc = { x: tb.x + tb.w * 0.1, y: fy - h * 0.2, w: tb.w * 0.8, h: h * 0.2 - 4 * u };
  c.fillStyle = '#9b2620'; c.fillRect(tc.x, tc.y, tc.w, tc.h);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(tc.x, tc.y + (tc.h / 4) * i + tc.h / 4 - 1.5 * u, tc.w, 1.5 * u);
    c.fillStyle = '#d9dde1'; c.fillRect(tc.x + tc.w * 0.35, tc.y + (tc.h / 4) * i + tc.h / 8 - u, tc.w * 0.3, 2 * u);
  }
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(tc.x, tc.y, tc.w, 3 * u);
  // tyre rack (right): two shelves of stacked tyres seen side-on
  const tr = { x: w * 0.7, y: h * 0.18, w: w * 0.27 };
  c.fillStyle = '#3c4148';
  for (const sy of [tr.y + h * 0.17, tr.y + h * 0.38]) c.fillRect(tr.x, sy, tr.w, 4 * u);
  c.fillRect(tr.x, tr.y, 4 * u, h * 0.42); c.fillRect(tr.x + tr.w - 4 * u, tr.y, 4 * u, h * 0.42);
  for (const [sy, n] of [[tr.y + h * 0.17, 4], [tr.y + h * 0.38, 3]] as const) {
    const tw = (tr.w - 10 * u) / 4, th = h * 0.15;
    for (let i = 0; i < n; i++) {
      const x0 = tr.x + 6 * u + i * tw;
      c.fillStyle = '#101113'; c.beginPath(); c.roundRect(x0, sy - th, tw - 2 * u, th, 5 * u); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = u;
      for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(x0 + ((tw - 2 * u) * k) / 5, sy - th + 3 * u); c.lineTo(x0 + ((tw - 2 * u) * k) / 5, sy - 3 * u); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x0 + 2 * u, sy - th + 2 * u, tw - 6 * u, 2 * u);
    }
  }
  // floor: dark epoxy, a parking box in safety yellow, the lift's base plates
  const fl = c.createLinearGradient(0, fy, 0, h);
  fl.addColorStop(0, '#2a2d31'); fl.addColorStop(1, '#0d0e10');
  c.fillStyle = fl; c.fillRect(0, fy, w, h - fy);
  c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, fy, w, 1.5 * u);
  c.strokeStyle = 'rgba(242,196,48,0.65)'; c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(w * 0.06, h - 4 * u); c.lineTo(w * 0.14, fy + 6 * u); c.lineTo(w * 0.86, fy + 6 * u); c.lineTo(w * 0.94, h - 4 * u); c.stroke();
  c.setLineDash([10 * u, 8 * u]); c.strokeStyle = 'rgba(242,196,48,0.35)';
  c.beginPath(); c.moveTo(w * 0.5, fy + 12 * u); c.lineTo(w * 0.5, h); c.stroke(); c.setLineDash([]);
  // two-post lift: posts either side of the car, arms reaching in to the sills
  for (const px of [w * 0.11, w * 0.89]) {
    const pw = 14 * u;
    const pg = c.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
    pg.addColorStop(0, '#4b5158'); pg.addColorStop(0.4, '#8a929a'); pg.addColorStop(1, '#30353a');
    c.fillStyle = pg; c.fillRect(px - pw / 2, h * 0.06, pw, fy - h * 0.06);
    c.fillStyle = L.accent; c.fillRect(px - pw / 2, h * 0.06, pw, 5 * u);
    c.fillStyle = '#1c1f23'; c.fillRect(px - pw, fy - 2 * u, pw * 2, 6 * u);
    c.fillStyle = 'rgba(242,196,48,0.9)';
    for (let k = 0; k < 4; k++) c.fillRect(px - pw / 2 + 1, fy - h * 0.12 + k * 5 * u, pw - 2, 2 * u);
    c.fillStyle = '#2d3136'; const dir = px < w / 2 ? 1 : -1;
    c.fillRect(Math.min(px, px + dir * w * 0.1), fy - 9 * u, w * 0.1, 5 * u);
  }
  // overhead: two strip-lamp housings across the top
  for (const lx of [w * 0.28, w * 0.72]) {
    c.fillStyle = '#16181b'; c.fillRect(lx - w * 0.14, h * 0.035, w * 0.28, 9 * u);
    c.strokeStyle = '#16181b'; c.lineWidth = 1.5 * u;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(lx + s * w * 0.1, 0); c.lineTo(lx + s * w * 0.1, h * 0.035); c.stroke(); }
  }
  cache.set(key, cv);
  return cv;
}

/** Paint the service bay into (0, 0, w, h) of ctx (device pixels; no transform needed). */
export function drawServiceBay(ctx: CanvasRenderingContext2D, w: number, h: number, opts: BayOpts) {
  const area = LOOK[opts.area] ? opts.area : 'body';
  const L = LOOK[area];
  const light = Math.max(0, Math.min(1, opts.light ?? 1));
  const t = opts.t ?? 0;
  const fy = bayFloorY(h);
  const u = Math.min(w, h * 1.4) / 400;
  const [r, g, b] = L.key;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(room(w, h, area), 0, 0);
  // the lamps: lit tubes, a soft shimmer, cones of light down onto the car and pools on the floor
  const shimmer = 0.94 + 0.06 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
  const k = light * shimmer;
  for (const lx of [w * 0.28, w * 0.72]) {
    ctx.fillStyle = `rgba(${r},${g},${b},${0.35 + 0.65 * k})`;
    ctx.fillRect(lx - w * 0.13, h * 0.035 + 7 * u, w * 0.26, 3 * u);
    const cone = ctx.createLinearGradient(0, h * 0.05, 0, fy);
    cone.addColorStop(0, `rgba(${r},${g},${b},${0.22 * k})`); cone.addColorStop(1, `rgba(${r},${g},${b},${0.03 * k})`);
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(lx - w * 0.13, h * 0.05); ctx.lineTo(lx + w * 0.13, h * 0.05); ctx.lineTo(lx + w * 0.24, fy); ctx.lineTo(lx - w * 0.24, fy); ctx.closePath(); ctx.fill();
  }
  // wash on the back wall behind the car, tinted by the area
  const wash = ctx.createRadialGradient(w / 2, fy - h * 0.18, 0, w / 2, fy - h * 0.18, w * 0.6);
  wash.addColorStop(0, `rgba(${r},${g},${b},${0.2 * k})`); wash.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = wash; ctx.fillRect(0, 0, w, fy);
  // floor: the pool of light under the car and the lamps' streaked reflections drifting slightly
  const pool = ctx.createRadialGradient(w / 2, fy + (h - fy) * 0.3, 0, w / 2, fy + (h - fy) * 0.3, w * 0.55);
  pool.addColorStop(0, `rgba(${r},${g},${b},${0.28 * k})`); pool.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = pool; ctx.fillRect(0, fy, w, h - fy);
  const drift = Math.sin(t * 0.4) * 6 * u;
  for (const lx of [w * 0.28, w * 0.72]) {
    // an elongated soft streak: a radial glow squashed sideways, brightest just under the floor line
    ctx.save();
    ctx.translate(lx + drift, fy + 2 * u); ctx.scale(1, ((h - fy) * 1.1) / (w * 0.12));
    const rf = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.12);
    rf.addColorStop(0, `rgba(${r},${g},${b},${0.32 * k})`); rf.addColorStop(0.5, `rgba(${r},${g},${b},${0.1 * k})`); rf.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = rf; ctx.fillRect(-w * 0.12, 0, w * 0.24, w * 0.12);
    ctx.restore();
  }
  // darken everything when the lamps are down
  if (light < 1) { ctx.fillStyle = `rgba(4,5,7,${0.75 * (1 - light)})`; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}
