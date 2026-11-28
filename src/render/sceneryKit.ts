// Scenery kit: original flat-shaded props and buildings for the race backdrops, drawn in code (no images).
// Every function paints into an offscreen tile once (see scene.ts), so detail here costs nothing per frame.
// Coordinates: `x` is the left edge or centre (said per function), `yb` the ground line the prop stands on, and
// sizes are CSS px multiplied by `k.u` (the device pixel ratio). Lighting: the sun sits ahead and to the right in
// every area, so faces toward the camera are a touch shaded and top/right edges catch a rim of `k.rim`.

export type C2 = CanvasRenderingContext2D;

export interface Kit {
  c: C2;
  u: number;
  /** Rim light along top and right edges (the sun's colour, translucent). */
  rim: string;
  /** Contact shadow under props. */
  shadow: string;
}

export function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export const dark = (col: string, t = 0.3) => mix(col, '#000000', t);
export const light = (col: string, t = 0.3) => mix(col, '#ffffff', t);

export const rect = (c: C2, x: number, y: number, w: number, h: number, fill: string) => { c.fillStyle = fill; c.fillRect(x, y, w, h); };
export const poly = (c: C2, pts: number[], fill: string) => {
  c.fillStyle = fill; c.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]));
  c.closePath(); c.fill();
};
export const disc = (c: C2, x: number, y: number, r: number, fill: string) => { c.fillStyle = fill; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); };
export const ell = (c: C2, x: number, y: number, rx: number, ry: number, fill: string) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); c.fill(); };
export const line = (c: C2, x1: number, y1: number, x2: number, y2: number, w: number, col: string) => {
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
};

/** A soft contact shadow under a prop. */
export const foot = (k: Kit, cx: number, yb: number, w: number) => ell(k.c, cx, yb, w / 2, Math.max(1, w * 0.06), k.shadow);

/** A front-facing box with a lit top edge and a lit right edge. x is the left edge. */
export function block(k: Kit, x: number, yb: number, w: number, h: number, col: string, rimTop = true) {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, col);
  c.fillStyle = k.rim;
  if (rimTop) c.fillRect(x, yb - h, w, 1.4 * u);
  c.fillRect(x + w - 1.4 * u, yb - h, 1.4 * u, h);
}

/** A pseudo-3D box: front face plus a receding right side and top. x is the left edge. */
export function box3(k: Kit, x: number, yb: number, w: number, h: number, d: number, col: string) {
  const { c } = k;
  poly(c, [x + w, yb, x + w + d, yb - d * 0.5, x + w + d, yb - h - d * 0.5, x + w, yb - h], light(col, 0.12));
  poly(c, [x, yb - h, x + w, yb - h, x + w + d, yb - h - d * 0.5, x + d, yb - h - d * 0.5], light(col, 0.28));
  rect(c, x, yb - h, w, h, col);
}

/** A row of lit / dark windows inside a box. */
export function windows(c: C2, x: number, y: number, w: number, h: number, cols: number, rows: number, seed: number, litCols: string[], darkCol: string, litOdds = 0.5, fill = 0.55) {
  const cw = w / cols, rh = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const r = hash(seed * 31.7 + i * 7.1 + j * 3.3);
    c.fillStyle = r < litOdds ? litCols[Math.floor(r * 97) % litCols.length] : darkCol;
    c.fillRect(x + i * cw + cw * (1 - fill) / 2, y + j * rh + rh * (1 - fill) / 2, cw * fill, rh * fill);
  }
}

/** A lattice girder between two points (two chords and a zig-zag web). */
export function lattice(k: Kit, x1: number, y1: number, x2: number, y2: number, depth: number, col: string, bays = 10) {
  const { c, u } = k;
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L * depth, ny = dx / L * depth;
  c.strokeStyle = col; c.lineCap = 'butt';
  c.lineWidth = 1.8 * u;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.moveTo(x1 + nx, y1 + ny); c.lineTo(x2 + nx, y2 + ny); c.stroke();
  c.lineWidth = 1 * u; c.beginPath();
  for (let i = 0; i < bays; i++) {
    const a = i / bays, b = (i + 1) / bays;
    c.moveTo(x1 + dx * a, y1 + dy * a); c.lineTo(x1 + dx * b + nx, y1 + dy * b + ny);
    c.lineTo(x1 + dx * b, y1 + dy * b);
  }
  c.stroke();
}

// ---------------------------------------------------------------- yard and industry

/** A shipping container (side view), x = left edge. */
export function container(k: Kit, x: number, yb: number, w: number, h: number, col: string, mark?: string) {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, col);
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let rx = x + 2.5 * u; rx < x + w - 2 * u; rx += 3.2 * u) c.fillRect(rx, yb - h + 1.5 * u, 1 * u, h - 3 * u);
  rect(c, x, yb - h, w, 1.3 * u, light(col, 0.4));
  rect(c, x, yb - 1.4 * u, w, 1.4 * u, dark(col, 0.45));
  rect(c, x, yb - h, 1.4 * u, h, dark(col, 0.35));
  rect(c, x + w - 1.6 * u, yb - h, 1.6 * u, h, dark(col, 0.25));
  if (mark && w > 30 * u) { c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(x + w * 0.18, yb - h * 0.62, w * 0.34, h * 0.18); }
}

/** A crushed car cube: a squashed slab of paint with a glass band, a pillar, a door seam, squashed wheel arches and
 *  a chrome bumper end. x = left edge. */
export function carCube(k: Kit, x: number, yb: number, w: number, h: number, col: string, seed: number) {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, col);
  rect(c, x, yb - h, w, Math.max(1, 1.2 * u), light(col, 0.35));
  const flip = hash(seed * 1.3) > 0.5;
  // glass band with a pillar
  rect(c, x + w * 0.16, yb - h * 0.82, w * 0.62, h * 0.28, 'rgba(28,38,52,0.85)');
  rect(c, x + w * (flip ? 0.36 : 0.5), yb - h * 0.82, w * 0.06, h * 0.28, col);
  rect(c, x + w * 0.18, yb - h * 0.8, w * 0.2, h * 0.07, 'rgba(255,255,255,0.25)');
  // door seam and a crease where it folded
  rect(c, x + w * 0.46, yb - h * 0.54, 0.8 * u, h * 0.5, dark(col, 0.35));
  rect(c, x, yb - h * 0.46, w, 0.8 * u, 'rgba(0,0,0,0.28)');
  // squashed wheel arches
  c.fillStyle = '#16120f';
  c.beginPath(); c.ellipse(x + w * 0.2, yb, w * 0.11, h * 0.3, 0, Math.PI, 0); c.ellipse(x + w * 0.8, yb, w * 0.11, h * 0.3, 0, Math.PI, 0); c.fill();
  // bumper and a rust patch
  rect(c, flip ? x : x + w - 1.6 * u, yb - h * 0.45, 1.6 * u, h * 0.3, '#cfd3d6');
  if (hash(seed * 2.7) > 0.45) rect(c, x + w * (0.55 + hash(seed * 3) * 0.3), yb - h * 0.42, w * 0.12, h * 0.22, 'rgba(130,60,25,0.55)');
  rect(c, x, yb - h, 1 * u, h, dark(col, 0.3));
}

/** A stack of crushed car cubes, x = centre. */
export function carStack(k: Kit, x: number, yb: number, s: number, n: number, cols: string[], seed: number) {
  const w = 30 * s, h = 9 * s;
  foot(k, x, yb, w * 1.2);
  for (let i = 0; i < n; i++) {
    const jx = (hash(seed * 3 + i) - 0.5) * 6 * s;
    carCube(k, x - w / 2 + jx, yb - i * h, w * (0.94 + hash(seed + i) * 0.12), h - 0.6 * s, cols[(seed + i) % cols.length], seed * 7 + i);
  }
}

/** A tyre seen side-on (a ring), cx/cy centre, r outer radius. */
export function tyre(c: C2, cx: number, cy: number, r: number, rubber = '#1c1a1b', hub = '#6d6a66') {
  disc(c, cx, cy, r, rubber);
  disc(c, cx, cy, r * 0.55, hub);
  disc(c, cx, cy, r * 0.3, '#2a2829');
}

/** A loose pile of flat-stacked tyres, x = centre. */
export function tyrePile(k: Kit, x: number, yb: number, s: number, n: number) {
  const { c } = k;
  foot(k, x, yb, 26 * s);
  for (let i = 0; i < n; i++) {
    const y = yb - 3.5 * s - i * 5.5 * s, dx = (hash(i * 3.1 + x) - 0.5) * 3 * s;
    ell(c, x + dx, y, 11 * s, 3.6 * s, '#191617');
    ell(c, x + dx, y - 1 * s, 10 * s, 2.6 * s, '#2a2627');
    ell(c, x + dx, y - 1.2 * s, 5 * s, 1.3 * s, '#100e0e');
  }
}

/** A race-track tyre wall: columns of stacked tyres seen side-on, with a belt across the front painted in bold
 *  alternating blocks (colA / colB), from x0 to x1. r = tyre half-width. */
export function tyreWall(k: Kit, x0: number, x1: number, yb: number, r: number, rows: number, colA: string, colB: string) {
  const { c, u } = k;
  const th = r * 0.95, top = yb - rows * th;
  rect(c, x0, top, x1 - x0, rows * th, '#121011');
  // one path for every tyre, one fill (hundreds of tyres per tile)
  c.fillStyle = '#242122'; c.beginPath();
  for (let x = x0; x < x1; x += r * 2) for (let row = 0; row < rows; row++) c.roundRect(x + 0.5 * u, top + row * th + 0.5 * u, r * 2 - 1 * u, th - 1 * u, th * 0.45);
  c.fill();
  c.fillStyle = '#0c0b0b';
  for (let x = x0; x < x1; x += r * 2) for (let row = 0; row < rows; row++) c.fillRect(x + 2 * u, top + row * th + th * 0.3, r * 2 - 4 * u, 0.8 * u);
  // the front belt: blocks of six tyres in alternating colours
  const bh = th * 0.55, by = top + (rows * th - bh) / 2;
  for (let x = x0, i = 0; x < x1; x += r * 12, i++) rect(c, x, by, Math.min(r * 12, x1 - x), bh, i % 2 ? colA : colB);
  rect(c, x0, by, x1 - x0, 0.8 * u, 'rgba(255,255,255,0.35)');
  rect(c, x0, top, x1 - x0, 1.2 * u, k.rim);
}

/** A wooden pallet stack, x = left. */
export function pallets(k: Kit, x: number, yb: number, w: number, n: number, col = '#b98a52') {
  const { c, u } = k;
  for (let i = 0; i < n; i++) {
    const y = yb - (i + 1) * 4 * u;
    rect(c, x, y, w, 1.6 * u, col);
    rect(c, x, y + 1.6 * u, w, 2.4 * u, dark(col, 0.55));
    c.fillStyle = col;
    for (const f of [0, 0.45, 0.9]) c.fillRect(x + w * f, y + 1.6 * u, w * 0.1, 2.4 * u);
  }
}

/** An oil drum, x = centre. */
export function drum(k: Kit, x: number, yb: number, s: number, col: string) {
  const { c } = k;
  rect(c, x - 4 * s, yb - 12 * s, 8 * s, 12 * s, col);
  rect(c, x - 4 * s, yb - 9 * s, 8 * s, 1 * s, dark(col, 0.4));
  rect(c, x - 4 * s, yb - 4 * s, 8 * s, 1 * s, dark(col, 0.4));
  rect(c, x + 1.5 * s, yb - 12 * s, 2.5 * s, 12 * s, light(col, 0.2));
  ell(c, x, yb - 12 * s, 4 * s, 1.1 * s, light(col, 0.35));
}

/** A forklift carrying a pallet, x = centre of the body, facing right. */
export function forklift(k: Kit, x: number, yb: number, s: number, col = '#f2b21c', lift = 0.3) {
  const { c } = k;
  // mast and forks
  rect(c, x + 10 * s, yb - 26 * s, 2.4 * s, 25 * s, '#2a2a2e');
  rect(c, x + 13 * s, yb - 26 * s, 1.6 * s, 25 * s, '#3a3a40');
  const fy = yb - 3 * s - lift * 16 * s;
  rect(c, x + 12 * s, fy, 12 * s, 1.4 * s, '#2a2a2e');
  pallets(k, x + 13 * s, fy, 11 * s, 1);
  rect(c, x + 13.5 * s, fy - 12 * s, 10 * s, 8 * s, '#c9803a');
  rect(c, x + 13.5 * s, fy - 12 * s, 10 * s, 1 * s, '#e0a35e');
  // body, counterweight, overhead guard
  poly(c, [x - 12 * s, yb - 4 * s, x + 11 * s, yb - 4 * s, x + 11 * s, yb - 12 * s, x - 2 * s, yb - 12 * s, x - 6 * s, yb - 15 * s, x - 12 * s, yb - 15 * s], col);
  rect(c, x - 12 * s, yb - 15 * s, 6 * s, 11 * s, dark(col, 0.35));
  line(c, x - 4 * s, yb - 12 * s, x - 4 * s, yb - 26 * s, 1.4 * s, '#2a2a2e');
  line(c, x + 7 * s, yb - 12 * s, x + 7 * s, yb - 26 * s, 1.4 * s, '#2a2a2e');
  rect(c, x - 5 * s, yb - 27 * s, 13 * s, 1.6 * s, '#2a2a2e');
  rect(c, x - 2 * s, yb - 18 * s, 3 * s, 6 * s, '#2a2a2e'); // the seat back
  rect(c, x - 12 * s, yb - 15 * s, 20 * s, 1 * s, k.rim);
  tyre(c, x - 7 * s, yb - 4 * s, 4 * s); tyre(c, x + 6 * s, yb - 4.5 * s, 4.5 * s);
}

/** A tracked excavator digging, x = centre of the tracks, arm reaching right. */
export function excavator(k: Kit, x: number, yb: number, s: number, col = '#f4b30f', reach = 0.5) {
  const { c } = k;
  foot(k, x, yb, 46 * s);
  // tracks
  c.fillStyle = '#26252a'; c.beginPath(); c.roundRect(x - 22 * s, yb - 9 * s, 44 * s, 9 * s, 4.5 * s); c.fill();
  for (let i = 0; i < 6; i++) disc(c, x - 17 * s + i * 7 * s, yb - 4.5 * s, 2.4 * s, '#4a4950');
  // turntable and house
  rect(c, x - 6 * s, yb - 12 * s, 14 * s, 3 * s, '#2d2c31');
  poly(c, [x - 20 * s, yb - 12 * s, x + 12 * s, yb - 12 * s, x + 12 * s, yb - 24 * s, x - 18 * s, yb - 24 * s], col);
  rect(c, x - 22 * s, yb - 22 * s, 8 * s, 10 * s, dark(col, 0.3)); // counterweight
  // cab with glass
  rect(c, x + 1 * s, yb - 36 * s, 11 * s, 13 * s, col);
  rect(c, x + 3 * s, yb - 34 * s, 7.5 * s, 8 * s, '#36506a');
  rect(c, x + 3 * s, yb - 34 * s, 7.5 * s, 1.6 * s, 'rgba(255,255,255,0.35)');
  rect(c, x - 20 * s, yb - 24 * s, 32 * s, 1.2 * s, k.rim);
  // boom (two segments) and bucket
  const bx = x + 10 * s, by = yb - 22 * s;
  const ex = bx + 22 * s, ey = yb - (44 + reach * 6) * s;
  const tx = ex + 14 * s + reach * 6 * s, ty = yb - 12 * s;
  c.lineCap = 'round';
  line(c, bx, by, ex, ey, 5 * s, col);
  line(c, ex, ey, tx, ty, 3.6 * s, dark(col, 0.12));
  line(c, bx + 2 * s, by - 3 * s, ex - 3 * s, ey + 3 * s, 1.2 * s, '#bdbdc2'); // the ram
  poly(c, [tx - 3 * s, ty - 2 * s, tx + 6 * s, ty - 1 * s, tx + 7 * s, ty + 6 * s, tx - 1 * s, ty + 7 * s], '#2d2c31');
  c.lineCap = 'butt';
}

/** The crusher / baler: a heavy yellow frame with a hopper, x = centre. The ram is drawn live (scene emitter). */
export function crusher(k: Kit, x: number, yb: number, s: number) {
  const { c } = k;
  foot(k, x, yb, 70 * s);
  // base bed and side walls
  rect(c, x - 30 * s, yb - 12 * s, 60 * s, 12 * s, '#3a3434');
  rect(c, x - 30 * s, yb - 12 * s, 60 * s, 2 * s, '#5a504c');
  // hazard stripes along the bed
  c.save(); c.beginPath(); c.rect(x - 30 * s, yb - 6 * s, 60 * s, 4 * s); c.clip();
  for (let i = -2; i < 18; i++) poly(c, [x - 30 * s + i * 4 * s, yb - 2 * s, x - 28 * s + i * 4 * s, yb - 2 * s, x - 26 * s + i * 4 * s, yb - 6 * s, x - 28 * s + i * 4 * s, yb - 6 * s], i % 2 ? '#111' : '#ffc61a');
  c.restore();
  // uprights and the crown
  rect(c, x - 26 * s, yb - 58 * s, 8 * s, 46 * s, '#f2b21c');
  rect(c, x + 18 * s, yb - 58 * s, 8 * s, 46 * s, '#f2b21c');
  rect(c, x + 23 * s, yb - 58 * s, 3 * s, 46 * s, '#ffd75a');
  rect(c, x - 30 * s, yb - 66 * s, 60 * s, 10 * s, '#e0a012');
  rect(c, x - 30 * s, yb - 66 * s, 60 * s, 1.6 * s, k.rim);
  rect(c, x - 6 * s, yb - 74 * s, 12 * s, 9 * s, '#2a2a2e'); // the hydraulic pack
  // the operator's cab on a stalk
  rect(c, x + 26 * s, yb - 40 * s, 4 * s, 28 * s, '#3a3434');
  rect(c, x + 28 * s, yb - 50 * s, 14 * s, 12 * s, '#d9d4c8');
  rect(c, x + 30 * s, yb - 48 * s, 10 * s, 6 * s, '#36506a');
}

/** A crawler crane with a lattice boom leaning left; returns the boom tip (the magnet hangs from it, live). */
export function magnetCrane(k: Kit, x: number, yb: number, s: number, col = '#e2581f'): { x: number; y: number } {
  const { c } = k;
  foot(k, x, yb, 50 * s);
  c.fillStyle = '#26252a'; c.beginPath(); c.roundRect(x - 24 * s, yb - 9 * s, 48 * s, 9 * s, 4.5 * s); c.fill();
  for (let i = 0; i < 7; i++) disc(c, x - 19 * s + i * 6.4 * s, yb - 4.5 * s, 2.2 * s, '#4a4950');
  poly(c, [x - 20 * s, yb - 10 * s, x + 22 * s, yb - 10 * s, x + 22 * s, yb - 30 * s, x - 14 * s, yb - 30 * s, x - 20 * s, yb - 24 * s], col);
  rect(c, x + 8 * s, yb - 30 * s, 14 * s, 20 * s, dark(col, 0.3));
  rect(c, x - 14 * s, yb - 28 * s, 10 * s, 9 * s, '#36506a');
  rect(c, x - 20 * s, yb - 30 * s, 42 * s, 1.4 * s, k.rim);
  // A-frame and boom
  const px = x - 4 * s, py = yb - 28 * s;
  const tx = x - 70 * s, ty = yb - 120 * s;
  line(c, x + 14 * s, yb - 30 * s, x + 2 * s, yb - 52 * s, 2 * s, '#2a2a2e');
  lattice(k, px, py, tx, ty, 5 * s, dark(col, 0.15), 14);
  // pendant ropes from the A-frame to the tip
  line(c, x + 2 * s, yb - 52 * s, tx + 2 * s, ty, 0.9 * s, '#2a2a2e');
  return { x: tx, y: ty + 3 * s };
}

/** A lattice power pylon, x = centre. */
export function pylon(k: Kit, x: number, yb: number, h: number, col: string) {
  const { c, u } = k;
  c.strokeStyle = col; c.lineWidth = 1.2 * u;
  const w = h * 0.22;
  c.beginPath();
  c.moveTo(x - w, yb); c.lineTo(x - w * 0.15, yb - h); c.lineTo(x + w * 0.15, yb - h); c.lineTo(x + w, yb);
  for (let i = 0; i < 5; i++) {
    const a = i / 5, b = (i + 1) / 5;
    const xa = w - (w * 0.85) * a, xb = w - (w * 0.85) * b;
    c.moveTo(x - xa, yb - h * a); c.lineTo(x + xb, yb - h * b); c.moveTo(x + xa, yb - h * a); c.lineTo(x - xb, yb - h * b);
  }
  c.moveTo(x - w * 1.3, yb - h * 0.78); c.lineTo(x + w * 1.3, yb - h * 0.78);
  c.moveTo(x - w * 1.0, yb - h * 0.6); c.lineTo(x + w * 1.0, yb - h * 0.6);
  c.stroke();
}

/** A smokestack with red/white bands, x = left; returns the top centre (smoke emitter). */
export function stack(k: Kit, x: number, yb: number, w: number, h: number, col: string, bands = '#d9413a') {
  const { c, u } = k;
  poly(c, [x, yb, x + w, yb, x + w * 0.86, yb - h, x + w * 0.14, yb - h], col);
  c.fillStyle = bands;
  for (const f of [0.06, 0.16]) c.fillRect(x + w * 0.14, yb - h + h * f, w * 0.72, Math.max(2 * u, h * 0.04));
  c.fillStyle = k.rim; c.fillRect(x + w * 0.8, yb - h, 1.2 * u, h);
  return { x: x + w / 2, y: yb - h };
}

/** A hyperbolic cooling tower, x = centre. */
export function coolingTower(k: Kit, x: number, yb: number, w: number, h: number, col: string) {
  const { c } = k;
  c.fillStyle = col; c.beginPath();
  c.moveTo(x - w / 2, yb);
  c.quadraticCurveTo(x - w * 0.22, yb - h * 0.55, x - w * 0.32, yb - h);
  c.lineTo(x + w * 0.32, yb - h);
  c.quadraticCurveTo(x + w * 0.22, yb - h * 0.55, x + w / 2, yb);
  c.closePath(); c.fill();
  c.fillStyle = k.rim; c.beginPath();
  c.moveTo(x + w * 0.32, yb - h); c.quadraticCurveTo(x + w * 0.22, yb - h * 0.55, x + w / 2, yb);
  c.lineTo(x + w / 2 - w * 0.06, yb); c.quadraticCurveTo(x + w * 0.16, yb - h * 0.55, x + w * 0.28, yb - h); c.closePath(); c.fill();
}

// ---------------------------------------------------------------- town and country

/** A gabled house, x = left. */
export function house(k: Kit, x: number, yb: number, w: number, h: number, wall: string, roof: string, seed: number, lit = false) {
  const { c, u } = k;
  foot(k, x + w / 2, yb, w * 1.1);
  rect(c, x, yb - h, w, h, wall);
  rect(c, x + w - 2 * u, yb - h, 2 * u, h, dark(wall, 0.1));
  poly(c, [x - 4 * u, yb - h, x + w + 4 * u, yb - h, x + w / 2, yb - h - h * 0.7], roof);
  poly(c, [x + w / 2, yb - h - h * 0.7, x + w + 4 * u, yb - h, x + w + 1 * u, yb - h], light(roof, 0.25));
  const win = lit ? '#ffd98a' : '#3d5b7a';
  rect(c, x + w * 0.14, yb - h * 0.72, w * 0.2, h * 0.3, win);
  rect(c, x + w * 0.62, yb - h * 0.72, w * 0.2, h * 0.3, win);
  rect(c, x + w * 0.41, yb - h * 0.52, w * 0.17, h * 0.52, dark(roof, 0.3)); // door
  if (hash(seed) > 0.5) rect(c, x + w * 0.7, yb - h - h * 0.62, w * 0.1, h * 0.36, dark(roof, 0.2)); // chimney
  rect(c, x - 2 * u, yb - h * 0.08, w + 4 * u, h * 0.08, '#d7d0c2'); // porch step
}

/** A red barn with a white cross door, x = left. */
export function barn(k: Kit, x: number, yb: number, w: number, h: number) {
  const { c, u } = k;
  foot(k, x + w / 2, yb, w * 1.1);
  poly(c, [x, yb, x + w, yb, x + w, yb - h * 0.62, x + w * 0.78, yb - h * 0.9, x + w / 2, yb - h, x + w * 0.22, yb - h * 0.9, x, yb - h * 0.62], '#b3302a');
  poly(c, [x - 2 * u, yb - h * 0.62, x + w * 0.22, yb - h * 0.92, x + w / 2, yb - h - 2 * u, x + w * 0.78, yb - h * 0.92, x + w + 2 * u, yb - h * 0.62, x + w + 2 * u, yb - h * 0.58, x + w * 0.78, yb - h * 0.86, x + w / 2, yb - h + 1 * u, x + w * 0.22, yb - h * 0.86, x - 2 * u, yb - h * 0.58], '#ece6da');
  const dx = x + w * 0.3, dw = w * 0.4, dh = h * 0.48;
  rect(c, dx, yb - dh, dw, dh, '#8e2420');
  c.strokeStyle = '#ece6da'; c.lineWidth = 1.4 * u; c.strokeRect(dx, yb - dh, dw, dh);
  c.beginPath(); c.moveTo(dx, yb - dh); c.lineTo(dx + dw, yb); c.moveTo(dx + dw, yb - dh); c.lineTo(dx, yb); c.stroke();
  rect(c, x + w * 0.42, yb - h * 0.8, w * 0.16, h * 0.12, '#ece6da');
}

/** A grain silo with a domed cap, x = left. */
export function silo(k: Kit, x: number, yb: number, w: number, h: number, col = '#c9ced4') {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, col);
  c.fillStyle = 'rgba(0,0,0,0.1)'; for (let y = yb - h + 5 * u; y < yb; y += 6 * u) c.fillRect(x, y, w, 1 * u);
  rect(c, x + w * 0.7, yb - h, w * 0.3, h, light(col, 0.25));
  c.fillStyle = dark(col, 0.15); c.beginPath(); c.arc(x + w / 2, yb - h, w / 2, Math.PI, 0); c.fill();
}

/** A white clapboard church with a steeple, x = left. */
export function church(k: Kit, x: number, yb: number, s: number) {
  const { c } = k;
  foot(k, x + 20 * s, yb, 44 * s);
  rect(c, x, yb - 22 * s, 30 * s, 22 * s, '#f3efe6');
  poly(c, [x - 2 * s, yb - 22 * s, x + 32 * s, yb - 22 * s, x + 15 * s, yb - 34 * s], '#5a5f6b');
  rect(c, x + 30 * s, yb - 40 * s, 10 * s, 40 * s, '#f3efe6');
  rect(c, x + 38 * s, yb - 40 * s, 2 * s, 40 * s, k.rim);
  poly(c, [x + 29 * s, yb - 40 * s, x + 41 * s, yb - 40 * s, x + 35 * s, yb - 66 * s], '#5a5f6b');
  rect(c, x + 34.4 * s, yb - 72 * s, 1.2 * s, 7 * s, '#d9b23c');
  rect(c, x + 32.5 * s, yb - 70 * s, 5 * s, 1.2 * s, '#d9b23c');
  rect(c, x + 32.5 * s, yb - 34 * s, 5 * s, 7 * s, '#3d5b7a');
  for (let i = 0; i < 3; i++) rect(c, x + 4 * s + i * 9 * s, yb - 17 * s, 4 * s, 8 * s, '#3d5b7a');
}

/** A water tower on stilts with a name painted on the tank, x = centre. */
export function waterTower(k: Kit, x: number, yb: number, s: number, tank: string, roof: string) {
  const { c, u } = k;
  c.fillStyle = '#6c7a86';
  for (const dx of [-14, -5, 5, 14]) c.fillRect(x + dx * s, yb - 40 * s, 2 * s, 40 * s);
  c.strokeStyle = '#6c7a86'; c.lineWidth = 1 * u; c.beginPath();
  c.moveTo(x - 14 * s, yb - 10 * s); c.lineTo(x + 14 * s, yb - 30 * s); c.moveTo(x + 14 * s, yb - 10 * s); c.lineTo(x - 14 * s, yb - 30 * s); c.stroke();
  poly(c, [x - 22 * s, yb - 40 * s, x + 22 * s, yb - 40 * s, x + 18 * s, yb - 70 * s, x - 18 * s, yb - 70 * s], tank);
  poly(c, [x + 16 * s, yb - 40 * s, x + 22 * s, yb - 40 * s, x + 18 * s, yb - 70 * s, x + 13 * s, yb - 70 * s], light(tank, 0.4));
  poly(c, [x - 20 * s, yb - 70 * s, x + 20 * s, yb - 70 * s, x, yb - 84 * s], roof);
}

/** A broadleaf tree with a round crown, x = centre. */
export function roundTree(k: Kit, x: number, yb: number, s: number, leaf: string, trunk = '#5a3a26') {
  const { c } = k;
  foot(k, x, yb, 22 * s);
  rect(c, x - 2 * s, yb - 20 * s, 4 * s, 20 * s, trunk);
  disc(c, x, yb - 28 * s, 13 * s, dark(leaf, 0.12));
  disc(c, x - 9 * s, yb - 22 * s, 9 * s, dark(leaf, 0.08));
  disc(c, x + 9 * s, yb - 23 * s, 9 * s, leaf);
  disc(c, x + 3 * s, yb - 32 * s, 9 * s, leaf);
  disc(c, x + 6 * s, yb - 34 * s, 4.5 * s, light(leaf, 0.25));
}

/** A conifer, x = centre, with an optional snow cap. */
export function pine(k: Kit, x: number, yb: number, s: number, col: string, snow?: string) {
  const { c } = k;
  rect(c, x - 1.5 * s, yb - 6 * s, 3 * s, 6 * s, '#4a3424');
  for (let i = 0; i < 3; i++) {
    const y0 = yb - 4 * s - i * 11 * s, w = (13 - i * 3.2) * s;
    poly(c, [x - w, y0, x + w, y0, x, y0 - 18 * s], i % 2 ? light(col, 0.08) : col);
    poly(c, [x, y0 - 18 * s, x + w, y0, x + w * 0.45, y0], light(col, 0.18));
    if (snow) poly(c, [x - w * 0.42, y0 - 11 * s, x + w * 0.42, y0 - 11 * s, x, y0 - 18 * s], snow);
  }
}

/** A Mediterranean cypress (a tall dark flame), x = centre. */
export function cypress(k: Kit, x: number, yb: number, s: number, col = '#21402a') {
  const { c } = k;
  c.fillStyle = col; c.beginPath();
  c.moveTo(x, yb - 40 * s); c.quadraticCurveTo(x + 6 * s, yb - 22 * s, x + 3 * s, yb); c.lineTo(x - 3 * s, yb); c.quadraticCurveTo(x - 6 * s, yb - 22 * s, x, yb - 40 * s); c.fill();
  c.fillStyle = light(col, 0.16); c.beginPath();
  c.moveTo(x, yb - 40 * s); c.quadraticCurveTo(x + 6 * s, yb - 22 * s, x + 3 * s, yb); c.lineTo(x + 1 * s, yb); c.quadraticCurveTo(x + 3 * s, yb - 22 * s, x, yb - 40 * s); c.fill();
}

/** An umbrella (stone) pine, x = centre. */
export function stonePine(k: Kit, x: number, yb: number, s: number) {
  const { c } = k;
  line(c, x, yb, x + 3 * s, yb - 30 * s, 3 * s, '#6a4a32');
  line(c, x + 2 * s, yb - 22 * s, x - 8 * s, yb - 32 * s, 2 * s, '#6a4a32');
  ell(c, x, yb - 34 * s, 28 * s, 8 * s, '#2a5230');
  ell(c, x - 4 * s, yb - 37 * s, 18 * s, 5 * s, '#3b6e3c');
  ell(c, x + 8 * s, yb - 38 * s, 10 * s, 3 * s, '#4f8848');
}

/** A palm tree, x = foot of the trunk. */
export function palm(k: Kit, x: number, yb: number, h: number, lean: number, frond = '#2f8a4a') {
  const { c, u } = k;
  const tx = x + lean * h * 0.3, ty = yb - h;
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 3.6 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, yb); c.quadraticCurveTo(x + lean * h * 0.05, yb - h * 0.6, tx, ty); c.stroke();
  c.strokeStyle = '#5e4229'; c.lineWidth = 1 * u;
  for (let i = 1; i < 8; i++) { const f = i / 8; const px = x + (tx - x) * f * f, py = yb - h * f; c.beginPath(); c.moveTo(px - 1.6 * u, py); c.lineTo(px + 1.6 * u, py - 1 * u); c.stroke(); }
  c.lineCap = 'butt';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const L = (20 + (i % 2) * 6) * u;
    c.fillStyle = i % 2 ? frond : dark(frond, 0.18);
    c.beginPath(); c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty - 9 * u, tx + Math.cos(a) * L, ty + Math.abs(Math.sin(a)) * 10 * u + 5 * u);
    c.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty - 2 * u, tx, ty + 2 * u); c.fill();
  }
  disc(c, tx, ty + 1 * u, 2.4 * u, '#5e4229');
}

/** A saguaro cactus, x = centre. */
export function saguaro(k: Kit, x: number, yb: number, s: number, col = '#3f7a3a') {
  const { c } = k;
  c.fillStyle = col;
  c.beginPath(); c.roundRect(x - 3 * s, yb - 34 * s, 6 * s, 34 * s, 3 * s); c.fill();
  c.beginPath(); c.roundRect(x - 13 * s, yb - 24 * s, 5 * s, 14 * s, 2.5 * s); c.fill(); c.fillRect(x - 13 * s, yb - 13 * s, 12 * s, 4 * s);
  c.beginPath(); c.roundRect(x + 8 * s, yb - 28 * s, 5 * s, 12 * s, 2.5 * s); c.fill(); c.fillRect(x + 2 * s, yb - 19 * s, 10 * s, 4 * s);
  c.fillStyle = light(col, 0.22);
  c.fillRect(x + 1 * s, yb - 32 * s, 1.4 * s, 30 * s);
}

/** A low scrub bush, x = centre. */
export function bush(k: Kit, x: number, yb: number, s: number, col: string) {
  const { c } = k;
  ell(c, x, yb - 3 * s, 9 * s, 4 * s, dark(col, 0.15));
  ell(c, x + 3 * s, yb - 5 * s, 6 * s, 3.5 * s, col);
  ell(c, x + 5 * s, yb - 6 * s, 2.5 * s, 1.5 * s, light(col, 0.25));
}

/** A flat-topped mesa with strata and a sunlit right face, x = centre. */
export function mesa(k: Kit, x: number, yb: number, w: number, h: number, shade: string, face: string) {
  const { c, u } = k;
  poly(c, [x - w / 2 - h * 0.35, yb, x - w / 2, yb - h, x + w / 2, yb - h, x + w / 2 + h * 0.45, yb], shade);
  poly(c, [x + w * 0.15, yb - h, x + w / 2, yb - h, x + w / 2 + h * 0.45, yb, x + w * 0.25, yb], face);
  c.fillStyle = 'rgba(80,25,15,0.28)';
  for (let i = 1; i < 4; i++) c.fillRect(x - w / 2 - i * h * 0.06, yb - h + i * h * 0.24, w + i * h * 0.14, 2.6 * u);
  rect(c, x - w / 2, yb - h, w, 1.5 * u, k.rim);
}

/** A sandstone hoodoo (a stack of rounded rocks with a cap), x = centre. */
export function hoodoo(k: Kit, x: number, yb: number, s: number, col: string) {
  const { c } = k;
  ell(c, x, yb - 6 * s, 7 * s, 7 * s, col);
  ell(c, x, yb - 18 * s, 5 * s, 7 * s, light(col, 0.08));
  ell(c, x, yb - 29 * s, 4 * s, 6 * s, col);
  ell(c, x, yb - 36 * s, 8 * s, 3 * s, dark(col, 0.25));
  rect(c, x + 2 * s, yb - 34 * s, 2 * s, 30 * s, 'rgba(255,220,170,0.18)');
}

/** A lighthouse with bands, x = centre; returns the lamp centre (the beam is drawn live). */
export function lighthouse(k: Kit, x: number, yb: number, s: number, band = '#d23a2e', body = '#f6f3ea') {
  const { c } = k;
  poly(c, [x - 9 * s, yb, x + 9 * s, yb, x + 6 * s, yb - 70 * s, x - 6 * s, yb - 70 * s], body);
  poly(c, [x + 3 * s, yb, x + 9 * s, yb, x + 6 * s, yb - 70 * s, x + 3 * s, yb - 70 * s], light(body, 0.4));
  for (let i = 0; i < 3; i++) poly(c, [x - (8.6 - i * 1.1) * s, yb - (14 + i * 20) * s, x + (8.6 - i * 1.1) * s, yb - (14 + i * 20) * s, x + (8.1 - i * 1.1) * s, yb - (23 + i * 20) * s, x - (8.1 - i * 1.1) * s, yb - (23 + i * 20) * s], band);
  rect(c, x - 9 * s, yb - 72 * s, 18 * s, 2.5 * s, '#2d3138');
  rect(c, x - 6 * s, yb - 80 * s, 12 * s, 8 * s, '#2d3138');
  rect(c, x - 4.5 * s, yb - 79 * s, 9 * s, 6 * s, '#fff1a8');
  poly(c, [x - 7 * s, yb - 80 * s, x + 7 * s, yb - 80 * s, x, yb - 89 * s], band);
  return { x, y: yb - 76 * s };
}

/** A sailing boat side-on, x = left of the hull. */
export function sailboat(k: Kit, x: number, yb: number, s: number, hull: string, sail = '#ffffff') {
  const { c } = k;
  poly(c, [x, yb - 3 * s, x + 24 * s, yb - 3 * s, x + 20 * s, yb + 2 * s, x + 3 * s, yb + 2 * s], hull);
  rect(c, x + 11 * s, yb - 30 * s, 1 * s, 27 * s, '#5b4a3a');
  poly(c, [x + 12.5 * s, yb - 30 * s, x + 12.5 * s, yb - 5 * s, x + 23 * s, yb - 5 * s], sail);
  poly(c, [x + 10 * s, yb - 26 * s, x + 10 * s, yb - 5 * s, x + 2 * s, yb - 5 * s], dark(sail, 0.08));
}

/** A motor yacht with dark glass decks, x = left. */
export function yacht(k: Kit, x: number, yb: number, s: number, hull = '#f4f6fa') {
  const { c } = k;
  poly(c, [x, yb, x + 80 * s, yb, x + 94 * s, yb - 10 * s, x - 6 * s, yb - 10 * s], hull);
  rect(c, x - 6 * s, yb - 4 * s, 94 * s, 2 * s, '#1f2a3a');
  rect(c, x + 10 * s, yb - 18 * s, 60 * s, 8 * s, hull);
  rect(c, x + 22 * s, yb - 25 * s, 36 * s, 7 * s, hull);
  rect(c, x + 13 * s, yb - 16 * s, 54 * s, 3 * s, '#26334a');
  rect(c, x + 25 * s, yb - 23 * s, 30 * s, 2.5 * s, '#26334a');
  rect(c, x + 38 * s, yb - 32 * s, 1.5 * s, 7 * s, '#26334a');
  rect(c, x - 6 * s, yb - 10 * s, 100 * s, 1 * s, k.rim);
}

/** A pastel villa with a terracotta roof and shutters, x = left. */
export function villa(k: Kit, x: number, yb: number, w: number, h: number, wall: string, seed: number, roof = '#c8603a') {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, wall);
  rect(c, x + w - 1.5 * u, yb - h, 1.5 * u, h, light(wall, 0.25));
  poly(c, [x - 2 * u, yb - h, x + w + 2 * u, yb - h, x + w - w * 0.12, yb - h - h * 0.22, x + w * 0.12, yb - h - h * 0.22], roof);
  const rows = h > 14 * u ? 2 : 1, cols = Math.max(1, Math.round(w / (7 * u)));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const wx = x + (i + 0.5) * (w / cols) - 1.4 * u, wy = yb - h + (j + 0.3) * (h / rows);
    rect(c, wx, wy, 2.8 * u, 4 * u, hash(seed + i * 3 + j) > 0.5 ? '#3a6a5a' : 'rgba(50,60,80,0.6)');
  }
}

/** A glass tower with a window grid, x = left. Returns the roof centre. */
export function tower(k: Kit, x: number, yb: number, w: number, h: number, body: string, seed: number, lit: string[], odds = 0.45) {
  const { c, u } = k;
  rect(c, x, yb - h, w, h, body);
  rect(c, x + w - 2 * u, yb - h, 2 * u, h, light(body, 0.18));
  const cols = Math.max(2, Math.round(w / (6 * u))), rows = Math.max(3, Math.round(h / (7 * u)));
  windows(c, x + 2 * u, yb - h + 4 * u, w - 4 * u, h - 6 * u, cols, rows, seed, lit, dark(body, 0.25), odds, 0.5);
  return { x: x + w / 2, y: yb - h };
}

/** A street lamp (a post and an arm), x = post. */
export function streetLamp(k: Kit, x: number, yb: number, h: number, col = '#2c2f38', glow = '#ffe6a8', right = true) {
  const { c, u } = k;
  rect(c, x - 1.2 * u, yb - h, 2.4 * u, h, col);
  const d = right ? 1 : -1;
  rect(c, d > 0 ? x : x - 9 * u, yb - h, 9 * u, 1.8 * u, col);
  ell(c, x + d * 8 * u, yb - h + 2.5 * u, 3 * u, 1.6 * u, glow);
}

/** A rally / event banner arch over a track (two towers and a beam with lettering), x = centre. */
export function bannerArch(k: Kit, x: number, yb: number, w: number, h: number, col: string, text: string, textCol: string, drawText: (t: string, x: number, y: number, w: number, h: number, col: string) => void) {
  const { c, u } = k;
  rect(c, x - w / 2, yb - h, 6 * u, h, '#2a2a2e');
  rect(c, x + w / 2 - 6 * u, yb - h, 6 * u, h, '#2a2a2e');
  rect(c, x - w / 2, yb - h, w, 14 * u, col);
  rect(c, x - w / 2, yb - h, w, 1.4 * u, k.rim);
  drawText(text, x - w / 2 + 6 * u, yb - h, w - 12 * u, 14 * u, textCol);
}

/** A tent / marquee (an event awning), x = left. */
export function tent(k: Kit, x: number, yb: number, w: number, h: number, colA: string, colB: string) {
  const { c } = k;
  foot(k, x + w / 2, yb, w * 1.1);
  rect(c, x, yb - h * 0.6, w, h * 0.6, '#f2eee6');
  rect(c, x + w * 0.08, yb - h * 0.5, w * 0.84, h * 0.5, 'rgba(40,30,30,0.45)');
  const n = 6;
  for (let i = 0; i < n; i++) poly(c, [x + (i / n) * w, yb - h * 0.6, x + ((i + 1) / n) * w, yb - h * 0.6, x + w / 2, yb - h], i % 2 ? colA : colB);
  for (let i = 0; i < n; i++) disc(c, x + ((i + 0.5) / n) * w, yb - h * 0.6, w / n / 2, i % 2 ? colA : colB);
}

/** A strand of bunting (triangle flags) between two points. */
export function bunting(k: Kit, x1: number, y1: number, x2: number, y2: number, cols: string[]) {
  const { c, u } = k;
  const n = Math.max(2, Math.round(Math.abs(x2 - x1) / (7 * u)));
  c.strokeStyle = 'rgba(30,30,30,0.6)'; c.lineWidth = 0.8 * u; c.beginPath(); c.moveTo(x1, y1);
  c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 8 * u, x2, y2); c.stroke();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x1 + (x2 - x1) * t;
    const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * (Math.max(y1, y2) + 8 * u) + t * t * y2;
    poly(c, [x - 2.5 * u, y, x + 2.5 * u, y, x, y + 5 * u], cols[i % cols.length]);
  }
}

// ---------------------------------------------------------------- sign lettering

/** The largest font size (px) at which `text` fits a box of inner size maxW × maxH, capped at maxPx. Measured with
 *  the real font (canvas measureText, ascent + descent), so a wide fallback font or a different DPR never spills the
 *  text over its sign. */
export function fitFontPx(c: C2, text: string, maxW: number, maxH: number, maxPx: number, weight = 900, family = 'system-ui, sans-serif'): number {
  c.font = `${weight} ${maxPx}px ${family}`;
  const m = c.measureText(text);
  const w = Math.max(1e-6, m.width);
  const asc = m.actualBoundingBoxAscent || maxPx * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const h = Math.max(1e-6, asc + desc);
  return Math.max(1, Math.min(maxPx, (maxPx * maxW) / w, (maxPx * maxH) / h));
}

/** Draw `text` centred in a sign box (x, y, w, h) with `pad` on every side, at the largest size that fits (≤ maxPx). */
export function signText(c: C2, text: string, x: number, y: number, w: number, h: number, pad: number, color: string, maxPx: number, weight = 900, family = 'system-ui, sans-serif') {
  const px = fitFontPx(c, text, w - 2 * pad, h - 2 * pad, maxPx, weight, family);
  c.font = `${weight} ${px}px ${family}`;
  const m = c.measureText(text);
  const asc = m.actualBoundingBoxAscent || px * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const align = c.textAlign, base = c.textBaseline;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillStyle = color;
  // optical centre: put the ink box (ascent + descent) in the middle of the sign
  c.fillText(text, x + w / 2, y + h / 2 + (asc - desc) / 2);
  c.textAlign = align;
  c.textBaseline = base;
}

// ---------------------------------------------------------------- mountains

/** A mountain peak with a lit right face and a jagged snow cap, x = apex x, base = foot line. */
export function peak(k: Kit, x: number, base: number, w: number, h: number, rock: string, snow?: string, snowFrac = 0.36) {
  const { c } = k;
  const L = x - w / 2, R = x + w / 2, top = base - h;
  poly(c, [L, base, x, top, R, base], rock);
  poly(c, [x, top, R, base, x + w * 0.06, base], light(rock, 0.14));
  if (!snow) return;
  const sh = h * snowFrac, f = sh / h;
  const pts = [x, top, x + (w / 2) * f, top + sh];
  const n = 6;
  for (let i = 1; i < n; i++) {
    const t = i / n, px = x + (w / 2) * f - w * f * t;
    pts.push(px, top + sh * (i % 2 ? 0.7 : 1.08));
  }
  pts.push(x - (w / 2) * f, top + sh);
  poly(c, pts, snow);
  poly(c, [x, top, x + (w / 2) * f, top + sh, x + w * 0.02, top + sh * 0.8], light(snow, 0.5));
}
