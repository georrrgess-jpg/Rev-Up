import type { CarId } from '../data/tables';

// Original side-profile silhouettes, facing right. Coordinates: x 0 (rear) → 1 (nose), y 0 (ground) → up,
// as a fraction of car length. Each class has its own proportions and details.

type Pt = [number, number];
interface Shape {
  body: Pt[];
  glass: Pt[];
  wheels: [number, number]; // x positions
  r: number; // wheel radius
  light: Pt; // headlight position
  tail: Pt;
}

const SHAPES: Record<string, Shape> = {
  junker: {
    body: [[0.02, 0.07], [0, 0.12], [0.01, 0.25], [0.05, 0.3], [0.1, 0.43], [0.56, 0.45], [0.72, 0.3], [0.91, 0.27], [0.99, 0.22], [1, 0.1], [0.96, 0.07]],
    glass: [[0.12, 0.31], [0.14, 0.41], [0.53, 0.42], [0.66, 0.31]],
    wheels: [0.2, 0.8], r: 0.075, light: [0.97, 0.2], tail: [0.015, 0.22],
  },
  beater: {
    body: [[0.02, 0.07], [0, 0.11], [0, 0.22], [0.03, 0.26], [0.2, 0.28], [0.3, 0.39], [0.58, 0.4], [0.72, 0.28], [0.94, 0.25], [1, 0.2], [1, 0.1], [0.97, 0.07]],
    glass: [[0.24, 0.285], [0.32, 0.375], [0.56, 0.38], [0.67, 0.285]],
    wheels: [0.19, 0.81], r: 0.072, light: [0.98, 0.19], tail: [0.01, 0.2],
  },
  hothatch: {
    body: [[0.04, 0.06], [0, 0.1], [0, 0.2], [0.04, 0.3], [0.06, 0.38], [0.01, 0.4], [0.03, 0.42], [0.14, 0.41], [0.52, 0.42], [0.7, 0.28], [0.92, 0.23], [1, 0.18], [1, 0.08], [0.96, 0.06]],
    glass: [[0.09, 0.3], [0.15, 0.385], [0.5, 0.395], [0.64, 0.29]],
    wheels: [0.19, 0.8], r: 0.082, light: [0.975, 0.17], tail: [0.015, 0.19],
  },
  muscle: {
    body: [[0.02, 0.07], [0, 0.11], [0, 0.21], [0.03, 0.25], [0.12, 0.26], [0.36, 0.37], [0.55, 0.37], [0.66, 0.27], [0.95, 0.23], [1, 0.19], [1, 0.1], [0.97, 0.07]],
    glass: [[0.3, 0.29], [0.38, 0.35], [0.54, 0.355], [0.62, 0.275]],
    wheels: [0.2, 0.8], r: 0.08, light: [0.985, 0.18], tail: [0.008, 0.19],
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
  detail?: boolean;
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

export function drawCarCover(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, amount: number) {
  if (amount > 0) drawCover(ctx, shapeFor(id), x, y, w, amount);
}

export function drawHeadlightBeam(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, k: number) {
  if (k <= 0) return;
  const s = shapeFor(id);
  const hx = x + s.light[0] * w;
  const hy = y - s.light[1] * w;
  const bg = ctx.createLinearGradient(hx, hy, hx + w * 1.4, hy);
  bg.addColorStop(0, `rgba(255,236,190,${0.55 * k})`);
  bg.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(hx, hy - w * 0.015);
  ctx.lineTo(hx + w * 1.4, hy - w * 0.22);
  ctx.lineTo(hx + w * 1.4, hy + w * 0.16);
  ctx.lineTo(hx, hy + w * 0.02);
  ctx.fill();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.ellipse(hx, hy, w * 0.018, w * 0.014, 0, 0, 7);
  ctx.fill();
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

const TAU = Math.PI * 2;

function face(ctx: CanvasRenderingContext2D, points: Pt[], color: string | CanvasGradient) {
  poly(ctx, points, 0, 0, 1);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, points: Pt[], color: string, width: number) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, -y) : ctx.moveTo(x, -y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, -y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function vertical(ctx: CanvasRenderingContext2D, y1: number, y2: number, stops: [number, string][]) {
  const gradient = ctx.createLinearGradient(0, -y1, 0, -y2);
  for (const [position, color] of stops) gradient.addColorStop(position, color);
  return gradient;
}

function wheel(ctx: CanvasRenderingContext2D, id: string, x: number, r: number, angle: number, detail: boolean) {
  oval(ctx, x, r, r * 1.1, r * 1.1, '#080a0c');
  oval(ctx, x, r, r * .99, r * .99, vertical(ctx, r * 2, 0, [[0, '#47515a'], [.34, '#1a2024'], [1, '#090b0d']]));
  oval(ctx, x, r, r * .76, r * .76, id === 'hothatch' ? '#cad4df' : '#737b81');
  oval(ctx, x, r, r * .68, r * .68, '#151a20');
  ctx.save();
  ctx.translate(x, -r);
  if (id === 'hothatch' || id === 'muscle') {
    oval(ctx, 0, 0, r * .48, r * .48, '#586069');
    face(ctx, [[.27 * r,.4 * r],[.52 * r,.36 * r],[.56 * r,-.04 * r],[.36 * r,-.05 * r]], id === 'hothatch' ? '#f44c42' : '#c99049');
  }
  ctx.rotate(angle);
  if (id === 'junker') {
    oval(ctx, 0, 0, r * .55, r * .55, '#575e61');
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7;
      oval(ctx, Math.cos(a) * r * .43, Math.sin(a) * r * .43, r * .09, r * .09, '#24292a');
    }
  } else {
    const spokes = id === 'hothatch' ? 10 : id === 'muscle' ? 5 : 6;
    for (let i = 0; i < spokes; i++) {
      ctx.save();
      ctx.rotate(i * TAU / spokes);
      face(ctx, [[r * .13, r * .09], [r * .63, r * .06], [r * .66, -r * .08], [r * .17, -r * .14]],
        id === 'muscle' ? '#c4a574' : i % 2 ? '#ced7db' : '#929faa');
      ctx.restore();
    }
  }
  oval(ctx, 0, 0, r * .23, r * .23, '#a7b3bd');
  oval(ctx, 0, 0, r * .11, r * .11, '#323b43');
  ctx.restore();
  if (detail) {
    ctx.beginPath();
    ctx.arc(x, -r, r * .87, Math.PI * 1.1, Math.PI * 1.82);
    ctx.strokeStyle = '#65717b';
    ctx.lineWidth = .0025;
    ctx.stroke();
  }
}

function bodyDetails(ctx: CanvasRenderingContext2D, id: string, trim: string) {
  const fourDoor = id === 'beater';
  const door = fourDoor ? [.29, .47] : [.28];
  for (const x of door) {
    line(ctx, [[x,.28],[x + .008,.15],[x + .025,.093]], 'rgba(10,14,18,.74)', .003);
    line(ctx, [[x + .02,.25],[x + .065,.25]], '#222b33', .012);
    line(ctx, [[x + .023,.253],[x + .062,.253]], 'rgba(230,239,244,.58)', .0025);
  }
  line(ctx, [[fourDoor ? .638 : .627,.286],[.625,.16],[.605,.095]], 'rgba(10,14,18,.6)', .004);
  line(ctx, [[.026,.13],[.115,.128],[.29,.087],[.71,.087],[.896,.115],[.985,.115]], '#12181e', .013);
  line(ctx, [[.31,.095],[.68,.095]], 'rgba(233,228,218,.32)', .003);
  if (id === 'junker') {
    // A scrapyard replacement door, corrosion around the arches, and uneven bumper tape.
    face(ctx, [[.285,.31],[.54,.31],[.61,.27],[.59,.102],[.31,.106]], vertical(ctx,.315,.09,[[0,'#849390'],[.48,'#566d71'],[1,'#2e4449']]));
    line(ctx, [[.32,.246],[.365,.246]], '#282c26', .012);
    for (const [x,y] of [[.055,.115],[.142,.179],[.258,.113],[.74,.161],[.888,.125],[.955,.14]]) {
      oval(ctx,x,y,.028,.015,'rgba(111,48,22,.9)');
      oval(ctx,x+.012,y+.006,.015,.009,'rgba(202,107,42,.68)');
      line(ctx,[[x-.017,y+.008],[x+.017,y+.006]],'rgba(233,184,112,.48)',.0025);
    }
    face(ctx, [[.915,.132],[.934,.136],[.96,.087],[.939,.083]], '#c9b583');
    face(ctx, [[.943,.138],[.959,.141],[.985,.095],[.967,.089]], '#a99265');
  } else if (id === 'beater') {
    line(ctx, [[.015,.16],[.19,.155],[.52,.151],[.9,.151]], '#23272a', .012);
    line(ctx, [[.075,.168],[.55,.162],[.935,.163]], 'rgba(244,217,195,.42)', .003);
    line(ctx, [[.312,.385],[.574,.388]], 'rgba(245,187,147,.54)', .007);
  } else if (id === 'hothatch') {
    line(ctx, [[.03,.214],[.31,.212],[.62,.204],[.94,.182]], trim, .009);
    face(ctx, [[.035,.11],[.26,.12],[.45,.115],[.38,.09],[.07,.087]], '#232931');
    face(ctx, [[.689,.19],[.735,.193],[.72,.155],[.677,.153]], '#343b40');
  } else {
    face(ctx, [[.05,.227],[.34,.225],[.64,.216],[.94,.191],[.91,.18],[.04,.211]], trim);
    line(ctx, [[.673,.192],[.69,.191],[.685,.153],[.664,.153]], '#121a23', .008);
    line(ctx, [[.699,.19],[.709,.189],[.705,.161]], '#b3bdc5', .003);
  }
}

/** Paint a consistent car at garage, showroom, reveal, and live race scales. */
export function drawCar(ctx: CanvasRenderingContext2D, id: CarId | string, x: number, y: number, w: number, o: CarDrawOpts) {
  if (w < 2) return;
  const s = shapeFor(id);
  const paint = /^#[a-f\d]{6}$/i.test(o.paint) ? o.paint : '#69717b';
  const trim = o.trim ?? shade(paint, -55);
  const detail = o.detail ?? w >= 120;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w, w);
  ctx.lineJoin = 'round';
  if (o.shadow !== false) {
    const shadow = ctx.createRadialGradient(.5, 0, .08, .5, 0, .56);
    shadow.addColorStop(0, '#000c');
    shadow.addColorStop(1, '#0000');
    ctx.save();
    ctx.scale(1, .14);
    oval(ctx, .51, -.04, .6, .35, shadow);
    ctx.restore();
  }
  if (o.silhouette) {
    face(ctx, s.body, '#10151d');
    for (const wx of s.wheels) oval(ctx, wx, s.r, s.r, s.r, '#10151d');
    ctx.restore();
    return;
  }
  const glow = o.headlights ?? 0;
  if (glow > 0) {
    const beam = ctx.createLinearGradient(.98, 0, 1.76, 0);
    beam.addColorStop(0, `rgba(255,240,199,${.36 * glow})`);
    beam.addColorStop(1, '#f3da9a00');
    face(ctx, [[1,s.light[1]],[1.75,s.light[1]+.13],[1.75,0],[1, s.light[1]-.03]], beam);
  }
  if (o.nitro) {
    const flame = ctx.createLinearGradient(.07, 0, -.27, 0);
    flame.addColorStop(0, '#fff3c3');
    flame.addColorStop(.25, '#86daff');
    flame.addColorStop(1, '#659fff00');
    const length = .18 + .075 * o.nitro + .015 * Math.sin((o.wheelAngle ?? 0) * 5);
    face(ctx, [[.045,.103],[-length*.62,.147],[-length,.12],[-length*.77,.093],[.045,.058]], flame);
  }

  const [rx, fx] = s.wheels;
  oval(ctx, rx + .058, s.r + .013, s.r * .93, s.r, '#11171c');
  oval(ctx, fx + .056, s.r + .013, s.r * .93, s.r, '#11171c');
  // Thin visible front and upper planes give the side-on art depth without a 3D renderer.
  const hood = s.body.at(-5)!;
  const frontTop = s.body.at(-3)!;
  const slopeEnd = s.glass.at(-1)!;
  face(ctx, [[.044,.13],[.11,.267],[hood[0],hood[1]],[1.048,frontTop[1]+.027],[1.063,.113],[.99,.065]], shade(paint,-55));
  face(ctx, [[slopeEnd[0],slopeEnd[1]],[slopeEnd[0]+.072,slopeEnd[1]+.028],[1.047,frontTop[1]+.027],[frontTop[0],frontTop[1]]],
    vertical(ctx,.38,.16,[[0,shade(paint,84)],[.62,shade(paint,35)],[1,shade(paint,-18)]]));
  const body = vertical(ctx, .43, .065, [[0, shade(paint,63)], [.45, shade(paint,23)], [.55, paint], [.83, shade(paint,-35)], [1, shade(paint,-64)]]);
  face(ctx, s.body, body);
  ctx.lineWidth = .005;
  ctx.strokeStyle = '#0c1119';
  ctx.stroke();

  ctx.save();
  poly(ctx, s.body, 0, 0, 1);
  ctx.clip();
  const sheen = vertical(ctx,.29,.16,[[0,'#d8eaff00'],[.43,'#d8eaff53'],[.58,'#fff2d92d'],[1,'#fff2d900']]);
  face(ctx, [[0,.27],[.25,.3],[.56,.294],[.9,.255],[1,.215],[1,.193],[.57,.241],[.1,.221],[0,.195]], sheen);
  if (detail) bodyDetails(ctx, id, trim);
  else if (id === 'junker') face(ctx,[[.29,.28],[.59,.28],[.58,.11],[.32,.1]],'#536b6f');
  else line(ctx, [[.045,.14],[.39,.138],[.95,.155]], trim, .009);
  if (o.livery) {
    face(ctx, [[.37,.07],[.56,.275],[.645,.268],[.51,.07]], o.livery);
    line(ctx, [[.535,.085],[.668,.262]], '#faf6e9', .003);
  }
  ctx.restore();

  const glass = vertical(ctx,.43,.27,[[0,'#97b3bf'],[.3,'#3a5467'],[.66,'#182a3a'],[1,'#101720']]);
  face(ctx,s.glass,glass);
  ctx.strokeStyle = '#111820';
  ctx.lineWidth = .007;
  ctx.stroke();
  const first = s.glass[0];
  const last = s.glass[3];
  const pillar = (first[0] + last[0]) / 2;
  ctx.save();
  poly(ctx,s.glass,0,0,1);
  ctx.clip();
  face(ctx,[[pillar-.055,.46],[pillar+.035,.46],[pillar+.12,.28],[pillar+.092,.28]], '#dceeff30');
  line(ctx,[[pillar-.025,.44],[pillar+.024,.279]],'#192028',.018);
  if (id === 'junker') line(ctx,[[.16,.34],[.23,.402],[.179,.409],[.237,.338]],'#d0bc83',.008);
  ctx.restore();
  if (detail) face(ctx, [[last[0]-.01,last[1]+.015],[last[0]+.035,last[1]+.019],[last[0]+.04,last[1]-.003],[last[0]+.011,last[1]-.014]], shade(paint,26));

  if (id === 'hothatch') {
    face(ctx, [[-.006,.407],[.121,.419],[.149,.401],[.012,.392]], '#232d36');
    line(ctx,[[.042,.4],[.042,.369],[.083,.385]],'#151b21',.009);
  } else if (id === 'muscle') {
    face(ctx, [[.738,.271],[.782,.304],[.875,.291],[.91,.253]], shade(paint,12));
    face(ctx, [[.86,.276],[.881,.284],[.912,.257],[.885,.256]], '#0e161f');
  }

  const [lx,ly] = s.light;
  face(ctx, [[.983,ly+.019],[1.054,ly+.038],[1.057,.119],[.989,.105]], '#111820');
  if (id === 'muscle') {
    oval(ctx,.972,ly,.020,.016,'#aab2b5');
    oval(ctx,1.017,ly+.007,.015,.014,glow ? '#fff0bb' : '#eadbc5');
    oval(ctx,.973,ly,.014,.012,glow ? '#fff2c7' : '#f1dcad');
  } else {
    face(ctx, [[lx-.038,ly+.012],[1.042,ly+.027],[1.046,ly+.009],[lx-.032,ly-.014]], id === 'hothatch' ? '#d9fbff' : '#f6da9d');
    line(ctx,[[.994,.133],[1.046,.147]],'#56616a',.005);
  }
  const [tx,ty] = s.tail;
  line(ctx,[[tx,ty+.015],[tx+.007,ty-.013],[tx+.039,ty-.014]],o.brake ? '#ff5f46' : '#bd4a43',.012);
  for (const wx of s.wheels) wheel(ctx, id, wx, s.r, o.wheelAngle ?? 0, detail);
  ctx.restore();
  if (o.cover && o.cover > 0) drawCover(ctx, s, x, y, w, o.cover);
}
