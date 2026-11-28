// Race scenery: each track's sky, landmarks, ground, verge, road dressing and foreground. Owned by the art workstream.
// The race screen owns the camera, the road surface, nitro zones and the cars; it calls these in order:
// drawBackdrop → (road) → drawRoadDressing → (zones, cars, effects) → drawForeground.
//
// Every track has its own recipe (src/render/sceneryTracks.ts): a palette, four parallax layers (far skyline, mid
// landmarks, near ground band, the verge right behind the road) and a foreground band under the road.
//
// Performance: the sky and every parallax layer (with its landmarks) are painted once into offscreen tiles per track
// and screen size and scrolled with two drawImage calls each. Only small flat-colour shapes move live (a bounded set
// of emitters baked into the tiles: smoke, beacons, a swinging magnet, a crusher ram, a turning wheel; plus a few
// movers such as boats, a train or snow), so race frames stay cheap on phones. Reduced motion keeps the tiles and the
// machinery at rest and drops the motion; lighter effects (settings.lightFx, or the race's own quality drop) thin
// the particles. Parallax scrolls with the camera's position at the base zoom, so a drama zoom never slides the
// scenery sideways.
import { TRACKS, type Track } from '../data/tables';
import { hash, signText, type C2, type Kit } from './sceneryKit';
import { recipeFor, drawEmitter, PARTICLE_KINDS, type Emit, type Recipe, type RecipeBuilder, type LiveCtx } from './sceneryTracks';

export { hash, fitFontPx, signText } from './sceneryKit';

export interface SceneView {
  ctx: CanvasRenderingContext2D;
  W: number; H: number; dpr: number;
  /** Screen rows (device px): horizon line, road top and bottom edges. */
  horizon: number; roadTop: number; roadBot: number;
  /** Camera: world x (m) at the left edge and pixels per metre. */
  camX: number; ppm: number;
  /** Race clock (s) for gentle scenic motion. */
  t: number;
  /** The area look (a track theme, or a district look such as 'riviera' / 'neon': see sceneLook). */
  theme: Track['theme'] | Look;
  trackId: Track['id'] | string;
  reduced: boolean;
  /** Lighter effects (settings.lightFx or the race's quality drop): fewer live particles. */
  light?: boolean;
}

type Theme = Track['theme'];
/** District looks that reuse a track theme's physics but get their own scenery. */
export type Look = Theme | 'riviera' | 'neon';
export const THEMES: readonly Look[] = ['scrap', 'suburb', 'foundry', 'coast', 'night', 'desert', 'summit', 'riviera', 'neon'];

/** The scenery for a track: its district's own look when it has one (the Azure Riviera's coast tracks, the Neon
 *  Skyline — the Skyline Run's expressway), else the track theme. Unknown themes fall back to a daytime palette, so a
 *  new track always draws. Visual only: the look never changes the race. */
export function sceneLook(theme: string, trackId?: string): Look {
  const district = trackId ? (TRACKS as Record<string, Track | undefined>)[trackId]?.district as string | undefined : undefined;
  if (theme === 'riviera' || district === 'riviera') return 'riviera';
  if (theme === 'neon' || district === 'neon' || trackId === 'skyline') return 'neon';
  return theme as Look;
}

export interface Pal {
  sky: [string, string, string]; // top, middle, horizon
  sun: string; sunGlow: string; sunY: number; sunR: number; moon?: boolean; stars?: boolean;
  cloud: string; ground: string; road: string; highway: string; fore: string; post: string; lights: number;
  /** Sun x as a fraction of the width (default 0.76). */
  sunX?: number;
  /** Aerial haze laid over distant layers (#rrggbb); defaults to the horizon sky colour. */
  haze?: string;
  /** Rim light on lit edges (rgba). */
  rim?: string;
}

/** Each area's palette: sky, stage light, ground, road and foreground — carried through the race scene. Tracks
 *  refine the sky and ground in their recipe (sceneryTracks.ts); the road and headlights stay per area. */
export const PALETTES: Record<Look, Pal> = {
  // Scrapyard Strip: a blazing violet-and-tangerine sunset over the yard
  scrap: { sky: ['#2a1640', '#a63d52', '#ffb04a'], sun: '#ffe08a', sunGlow: 'rgba(255,170,80,0.55)', sunY: 0.86, sunR: 0.075, cloud: 'rgba(255,150,120,0.35)', ground: '#5a3424', road: '#4a3f3a', highway: '#3d3f45', fore: '#24140e', post: '#3a2418', lights: 0.25 },
  // Maple Highway: a bright autumn afternoon
  suburb: { sky: ['#1f63c4', '#5fb0ee', '#ffe2a6'], sun: '#fff4c8', sunGlow: 'rgba(255,240,190,0.5)', sunY: 0.4, sunR: 0.05, cloud: 'rgba(255,255,255,0.85)', ground: '#4f8f3a', road: '#3f4147', highway: '#383b42', fore: '#20381c', post: '#f2efe6', lights: 0.35 },
  // Foundry Circuit: steel-blue dusk lit orange by the furnaces
  foundry: { sky: ['#0b1430', '#2f3f73', '#ff8a3d'], sun: '#ffd7a8', sunGlow: 'rgba(255,120,50,0.5)', sunY: 0.92, sunR: 0.06, cloud: 'rgba(120,110,150,0.45)', ground: '#262a36', road: '#34373e', highway: '#2f3238', fore: '#0d1017', post: '#38404e', lights: 0.85 },
  // Coastal Highway: turquoise sea, white cliffs, a warm late sun
  coast: { sky: ['#1b6fc0', '#6cc4f2', '#ffd8a0'], sun: '#fff2c2', sunGlow: 'rgba(255,230,170,0.55)', sunY: 0.72, sunR: 0.055, cloud: 'rgba(255,255,255,0.8)', ground: '#e2c487', road: '#45434a', highway: '#3c3f46', fore: '#1d3a2a', post: '#e9e4d8', lights: 0.3 },
  // Downtown Nights: violet sky, moon, neon
  night: { sky: ['#070718', '#25124a', '#6a1f6e'], sun: '#eef0ff', sunGlow: 'rgba(200,190,255,0.35)', sunY: 0.3, sunR: 0.032, moon: true, stars: true, cloud: 'rgba(120,80,170,0.35)', ground: '#140f24', road: '#1f1f2a', highway: '#25252f', fore: '#08070f', post: '#1d1a2c', lights: 1 },
  // Desert Proving Ground: cobalt sky over red mesas
  desert: { sky: ['#1857b8', '#5fb4ea', '#ffd59a'], sun: '#fff7d6', sunGlow: 'rgba(255,236,180,0.6)', sunY: 0.32, sunR: 0.06, cloud: 'rgba(255,255,255,0.6)', ground: '#d98a4e', road: '#5a4a40', highway: '#4d4440', fore: '#7a3a1e', post: '#5b3a24', lights: 0.2 },
  // Summit Gala: alpine blue, snowy peaks, the grand-finale gantry
  summit: { sky: ['#0d2f78', '#4b97e0', '#dff0ff'], sun: '#ffffff', sunGlow: 'rgba(255,255,255,0.55)', sunY: 0.35, sunR: 0.045, cloud: 'rgba(255,255,255,0.9)', ground: '#e8f1f8', road: '#363b47', highway: '#30353f', fore: '#1d3346', post: '#2d3b4c', lights: 0.4 },
  // Azure Riviera: a golden-hour Mediterranean — ultramarine sea, pastel villas, cypress and stone balustrades
  riviera: { sky: ['#2b4fa8', '#7fb6ea', '#ffd2a8'], sun: '#fff1c9', sunGlow: 'rgba(255,200,150,0.6)', sunY: 0.62, sunR: 0.06, cloud: 'rgba(255,236,228,0.8)', ground: '#c9b48a', road: '#44424b', highway: '#3b3c46', fore: '#2d4a32', post: '#efe6d2', lights: 0.35 },
  // Neon Skyline: a teal-to-magenta night above glass towers and holo billboards
  neon: { sky: ['#03101f', '#0f2f52', '#a0237a'], sun: '#ffd6f5', sunGlow: 'rgba(255,80,200,0.35)', sunY: 0.5, sunR: 0.03, moon: true, stars: true, cloud: 'rgba(80,40,120,0.3)', ground: '#0b0b1c', road: '#191a26', highway: '#1d1f2c', fore: '#05050c', post: '#141428', lights: 1 },
};
const palOf = (theme: string): Pal => PALETTES[theme as Look] ?? PALETTES.suburb;

/** Headlight strength for this area (night areas run full beams). */
export const sceneLights = (theme: string) => palOf(theme).lights;
/** Road surface colours for this area. */
export const roadColors = (theme: string) => { const p = palOf(theme); return { road: p.road, highway: p.highway }; };

// ---------------------------------------------------------------- tiles

export interface Layer { cv: HTMLCanvasElement; par: number; top: number; w: number; emit: Emit[] }
interface Built { key: string; pal: Pal; sky: HTMLCanvasElement; layers: Layer[]; fore: Layer | null; recipe: Recipe; live: { after: number; draw: (L: LiveCtx) => void }[] }
let built: Built | null = null;

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

function blitLayer(ctx: C2, L: Layer, scroll: number) {
  // whole device pixels: an integer offset is a straight copy (no resampling of a screen-sized bitmap)
  const off = Math.round(((scroll * L.par) % L.w + L.w) % L.w);
  const top = Math.round(L.top);
  ctx.drawImage(L.cv, -off, top);
  if (L.w - off < ctx.canvas.width) ctx.drawImage(L.cv, L.w - off, top);
}

function buildSky(v: SceneView, pal: Pal): HTMLCanvasElement {
  const { W, horizon, dpr } = v;
  const cv = canvas(W, horizon + 2);
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, horizon + 2);
  // a gentle darkening at the very top keeps the race HUD text readable on bright skies
  const hud = c.createLinearGradient(0, 0, 0, horizon * 0.4);
  hud.addColorStop(0, 'rgba(0,0,20,0.34)'); hud.addColorStop(1, 'rgba(0,0,20,0)');
  c.fillStyle = hud; c.fillRect(0, 0, W, horizon * 0.4);
  if (pal.stars) {
    for (let k = 0; k < 90; k++) {
      const x = hash(k + 3) * W, y = hash(k * 3.1 + 9) * horizon * 0.75;
      c.fillStyle = `rgba(255,255,255,${0.25 + hash(k * 5.7) * 0.6})`;
      const s = (hash(k * 1.9) > 0.9 ? 2 : 1) * dpr;
      c.fillRect(x, y, s, s);
    }
  }
  const sx = W * (pal.sunX ?? 0.76), sy = horizon * pal.sunY, sr = Math.min(W, horizon * 3) * pal.sunR;
  const glow = c.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 5);
  glow.addColorStop(0, pal.sunGlow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, horizon + 2);
  disc(c, sx, sy, sr, pal.sun);
  if (pal.moon) disc(c, sx + sr * 0.35, sy - sr * 0.2, sr * 0.85, pal.sky[1]);
  if (v.theme === 'scrap') {
    // sunset bands across the sun
    c.fillStyle = pal.sky[2];
    for (let k = 0; k < 4; k++) c.fillRect(sx - sr * 1.2, sy + sr * (0.1 + k * 0.22), sr * 2.4, sr * (0.05 + k * 0.025));
  }
  // a low bright band of haze along the horizon (light scattering toward the sun)
  const band = c.createLinearGradient(0, horizon - 40 * dpr, 0, horizon + 2);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(1, 'rgba(255,255,255,0.16)');
  c.fillStyle = band; c.fillRect(0, horizon - 40 * dpr, W, 42 * dpr);
  return cv;
}
const disc = (c: C2, x: number, y: number, r: number, fill: string) => { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };

/** Run the track's recipe: paint each parallax layer once into a seamlessly repeating tile. */
function buildLayers(v: SceneView, pal: Pal, recipe: Recipe) {
  const { W, H, horizon: hz, roadTop: rt, roadBot: rb, dpr: u } = v;
  const layers: Layer[] = [];
  let fore: Layer | null = null;
  const live: Built['live'] = [];
  const rim = pal.rim ?? 'rgba(255,236,200,0.5)';
  const mk = (c: C2): Kit => ({ c, u, rim, shadow: 'rgba(0,0,0,0.22)' });
  const paintTile = (w: number, top: number, bottom: number, par: number, paint: Parameters<RecipeBuilder['layer']>[3]): Layer => {
    const cv = canvas(w, bottom - top);
    const c = cv.getContext('2d')!;
    c.translate(0, -top);
    const emit: Emit[] = [];
    const place = (n: number, fn: (x: number, r: number, k: number) => void, seed = 0) => {
      for (let k = 0; k < n; k++) {
        const r = hash(k * 7.3 + seed * 13.7 + 1);
        const x = ((k + 0.5 + (r - 0.5) * 0.6) / n) * w;
        for (const o of [-w, 0, w]) fn(x + o, r, k);
      }
    };
    paint({
      c, k: mk(c), w, place,
      emit: (e) => { if (e.x >= 0 && e.x < w) emit.push(e); },
      text: (t, x, y, bw, bh, col, maxPx, weight = 900) => signText(c, t, x, y, bw, bh, Math.min(3 * u, bh * 0.18), col, maxPx, weight, 'Barlow, system-ui, sans-serif'),
    });
    return { cv, par, top, w, emit };
  };
  const B: RecipeBuilder = {
    W, H, u, hz, rt, rb, span: rt - hz, trackId: String(v.trackId), look: v.theme as Look, pal,
    layer: (par, top, bottom, paint, widthMul = 1.6) => { layers.push(paintTile(Math.ceil(W * widthMul), Math.max(0, Math.floor(top)), Math.ceil(bottom), par, paint)); },
    fore: (paint) => {
      const fh = H - rb + 8 * u;
      if (fh > 2) fore = paintTile(Math.ceil(W * 1.4), rb, rb + fh, 1.1, (P) => { P.c.fillStyle = pal.fore; P.c.fillRect(0, rb, P.w + 2, fh); paint(P); });
    },
    live: (draw) => { live.push({ after: layers.length - 1, draw }); },
  };
  recipe.build(B);
  return { layers, fore: fore as Layer | null, live };
}

function ensure(v: SceneView): Built {
  const key = [v.theme, v.trackId, v.W, v.H, Math.round(v.horizon), Math.round(v.roadTop), Math.round(v.roadBot), v.dpr].join('|');
  if (built?.key === key) return built;
  const recipe = recipeFor(String(v.trackId), v.theme as Look);
  const pal: Pal = { ...palOf(v.theme), ...(recipe.pal ?? {}) };
  const sky = buildSky(v, pal);
  const { layers, fore, live } = buildLayers(v, pal, recipe);
  built = { key, pal, sky, layers, fore, recipe, live };
  return built;
}

// ---------------------------------------------------------------- live motion (flat fills only)

function drift(x: number, span: number) { return ((x % span) + span) % span; }

/** Parallax position: the camera's world x at the base zoom (the race camera's own reference scale), so drama zooms
 *  and the pack-framing zoom never slide the scenery sideways. */
function sceneScroll(v: SceneView) {
  const ref = Math.min(v.W * 0.42, v.H * 0.27) / 4.3;
  return v.camX * ref;
}

function clouds(v: SceneView, b: Built, scroll: number) {
  const { ctx, W, horizon: hz, dpr: u, t } = v;
  const n = b.recipe.clouds ?? 4;
  if (!n) return;
  ctx.fillStyle = b.pal.cloud;
  for (let k = 0; k < n; k++) {
    const span = W * 1.6;
    const x = drift(k * span / n - scroll * 0.02 - t * 8 * u, span) - W * 0.3;
    const y = hz * (0.2 + 0.13 * (k % 3));
    const s = (0.8 + hash(k) * 0.6) * u;
    ctx.beginPath(); ctx.ellipse(x, y, 46 * s, 9 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 16 * s, y - 8 * s, 24 * s, 11 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 14 * s, y - 5 * s, 18 * s, 8 * s, 0, 0, 7); ctx.fill();
  }
}

function liveCtx(v: SceneView, b: Built, scroll: number): LiveCtx {
  return { ctx: v.ctx, W: v.W, u: v.dpr, hz: v.horizon, rt: v.roadTop, rb: v.roadBot, span: v.roadTop - v.horizon, t: v.reduced ? 0 : v.t, scroll, light: !!v.light, still: v.reduced, pal: b.pal };
}

function emitters(L: LiveCtx, layer: Layer) {
  if (!layer.emit.length) return;
  const { W, u } = L;
  const off = ((L.scroll * layer.par) % layer.w + layer.w) % layer.w;
  for (const e of layer.emit) {
    if (L.still && PARTICLE_KINDS.has(e.k)) continue;
    for (const base of [-off, layer.w - off]) {
      const x = e.x + base;
      if (x < -(e.reach ?? 70) * u || x > W + (e.reach ?? 70) * u) continue;
      drawEmitter(L, e, x);
    }
  }
}

// ---------------------------------------------------------------- public draw calls

/** Sky, sun or moon, clouds, far landmarks, the ground band and the verge up to the road. */
export function drawBackdrop(v: SceneView) {
  const b = ensure(v);
  const { ctx } = v;
  const scroll = sceneScroll(v);
  ctx.drawImage(b.sky, 0, 0);
  // the ground band under every layer (the canvas is not cleared between frames)
  ctx.fillStyle = b.pal.ground;
  ctx.fillRect(0, v.horizon, v.W, v.roadTop - v.horizon + 1);
  if (!v.reduced) clouds(v, b, scroll);
  const L = liveCtx(v, b, scroll);
  for (const m of b.live) if (m.after < 0 && !v.reduced) m.draw(L);
  for (let i = 0; i < b.layers.length; i++) {
    blitLayer(ctx, b.layers[i], scroll);
    emitters(L, b.layers[i]);
    if (!v.reduced) for (const m of b.live) if (m.after === i) m.draw(L);
  }
}

/** Drawn on top of the road surface, under the cars (e.g. wet-street reflections). */
export function drawRoadDressing(v: SceneView) {
  const { ctx, W, roadTop, roadBot, theme, dpr: u, reduced } = v;
  const scroll = v.camX * v.ppm; // road marks move with the road itself
  if ((theme === 'night' || theme === 'neon') && !reduced) {
    // wet street: long smeared reflections of the neon signs, moving with the near layer
    for (let k = 0; k < 6; k++) {
      const x = drift(k * 233 * u - scroll * 0.32, W + 200 * u) - 100 * u;
      ctx.fillStyle = theme === 'neon' ? ['rgba(255,47,180,0.16)', 'rgba(47,243,255,0.14)', 'rgba(176,123,255,0.12)'][k % 3] : ['rgba(255,63,164,0.12)', 'rgba(56,225,255,0.1)', 'rgba(255,210,63,0.09)'][k % 3];
      ctx.fillRect(x, roadTop + 4 * u, 14 * u, roadBot - roadTop - 8 * u);
    }
  } else if (theme === 'desert' || theme === 'summit' || theme === 'coast') {
    // drifted sand or snow along the road edges
    ctx.fillStyle = theme === 'summit' ? 'rgba(240,246,252,0.55)' : theme === 'coast' ? 'rgba(240,220,170,0.35)' : 'rgba(230,160,100,0.4)';
    for (let k = 0; k < 8; k++) {
      const x = drift(k * 157 * u - scroll, W + 160 * u) - 80 * u;
      ctx.beginPath(); ctx.ellipse(x, roadTop + 2 * u, 40 * u, 4 * u, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 60 * u, roadBot - 2 * u, 30 * u, 3 * u, 0, 0, 7); ctx.fill();
    }
  } else if (theme === 'scrap' || theme === 'foundry') {
    // oil stains and grit on the yard concrete
    ctx.fillStyle = theme === 'scrap' ? 'rgba(10,8,8,0.25)' : 'rgba(5,6,10,0.25)';
    for (let k = 0; k < 5; k++) {
      const x = drift(k * 211 * u - scroll, W + 200 * u) - 100 * u;
      ctx.beginPath(); ctx.ellipse(x, roadTop + (roadBot - roadTop) * (0.2 + hash(k) * 0.6), 18 * u, 5 * u, 0, 0, 7); ctx.fill();
    }
  }
}

/** The band below the road: verge, posts, lamps (kept calm: the race controls sit over it). */
export function drawForeground(v: SceneView) {
  const b = ensure(v);
  if (b.fore) blitLayer(v.ctx, b.fore, sceneScroll(v));
}
