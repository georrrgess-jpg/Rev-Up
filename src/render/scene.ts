// Race scenery: each area's sky, landmarks, ground, road dressing and foreground. Owned by the art workstream.
// The race screen owns the camera, the road surface, nitro zones and the cars; it calls these in order:
// drawBackdrop → (road) → drawRoadDressing → (zones, cars, effects) → drawForeground.
import type { Track } from '../data/tables';

export interface SceneView {
  ctx: CanvasRenderingContext2D;
  W: number; H: number; dpr: number;
  /** Screen rows (device px): horizon line, road top and bottom edges. */
  horizon: number; roadTop: number; roadBot: number;
  /** Camera: world x (m) at the left edge and pixels per metre. */
  camX: number; ppm: number;
  /** Race clock (s) for gentle scenic motion. */
  t: number;
  theme: Track['theme'];
  trackId: Track['id'];
  reduced: boolean;
}

/** Each area's palette: stage light, ground, road and foreground — carried through the race scene. */
export const PALETTES: Record<string, { sun: string; cloud: string; ground: string; road: string; highway: string; fore: string; post: string; lights: number }> = {
  scrap: { sun: 'rgba(255,200,120,0.6)', cloud: 'rgba(255,214,170,0.045)', ground: '#3a2a1f', road: '#4b4038', highway: '#3a3d42', fore: '#1a120d', post: '#2a1d14', lights: 0.25 },
  suburb: { sun: 'rgba(255,220,160,0.5)', cloud: 'rgba(230,236,245,0.05)', ground: '#263526', road: '#3d3c3a', highway: '#3a3d42', fore: '#142016', post: '#1d2d1f', lights: 0.55 },
  foundry: { sun: 'rgba(220,230,255,0.55)', cloud: 'rgba(160,180,220,0.04)', ground: '#151b26', road: '#33363d', highway: '#2f3238', fore: '#0b0f15', post: '#1a222e', lights: 0.85 },
  coast: { sun: 'rgba(255,226,170,0.6)', cloud: 'rgba(255,240,220,0.06)', ground: '#2a3a2e', road: '#3e3d3b', highway: '#3a3d42', fore: '#142016', post: '#1d2d1f', lights: 0.4 },
  night: { sun: 'rgba(230,235,255,0.75)', cloud: 'rgba(150,120,220,0.035)', ground: '#0d0c18', road: '#1f1f27', highway: '#24242d', fore: '#07070c', post: '#14141d', lights: 1 },
}

export function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Headlight strength for this area (night areas run full beams). */
export const sceneLights = (theme: string) => (PALETTES[theme] ?? PALETTES.suburb).lights;
/** Road surface colours for this area. */
export const roadColors = (theme: string) => { const p = PALETTES[theme] ?? PALETTES.suburb; return { road: p.road, highway: p.highway }; };

/** Sky, sun or moon, clouds, area glow, far landmarks and the ground strip up to the road. */
export function drawBackdrop(v: SceneView) {
  const { ctx, W, H, horizon, roadTop, roadBot, camX, ppm, t, theme, trackId, dpr, reduced } = v;
  const pal = PALETTES[theme];
  void H; void trackId; void roadTop; void roadBot; void horizon; void t; void reduced; void pal;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    if (theme === 'foundry') { sky.addColorStop(0, '#070c18'); sky.addColorStop(.6, '#1a2742'); sky.addColorStop(1, '#3d4f6e'); }
    else if (theme === 'night') { sky.addColorStop(0, '#04050c'); sky.addColorStop(.6, '#120d2b'); sky.addColorStop(1, '#2d1746'); }
    else if (theme === 'scrap') { sky.addColorStop(0, '#2b1d2e'); sky.addColorStop(0.6, '#7a3f2a'); sky.addColorStop(1, '#f0a040'); }
    else if (theme === 'coast') { sky.addColorStop(0, '#0f2a44'); sky.addColorStop(0.6, '#3f7fa3'); sky.addColorStop(1, '#f0c189'); }
    else { sky.addColorStop(0, '#16233d'); sky.addColorStop(0.6, '#3d5a7a'); sky.addColorStop(1, '#e0a165'); }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 2);
    // sun
    ctx.fillStyle = pal.sun;
    const night = theme === 'night' || theme === 'foundry';
    ctx.beginPath(); ctx.arc(W * 0.78, horizon * (night ? 0.35 : 0.82), H * (night ? 0.03 : 0.06), 0, 7); ctx.fill();
    // restrained background motion: slow clouds drifting against the camera
    if (!reduced) {
      ctx.fillStyle = pal.cloud;
      for (let k = 0; k < 4; k++) {
        const span = W * 1.6;
        const cx = ((k * span) / 4 - camX * ppm * 0.03 - t * 6 * dpr) % span;
        const x = cx < -W * 0.3 ? cx + span : cx;
        const y = horizon * (0.25 + 0.12 * (k % 3));
        ctx.beginPath(); ctx.ellipse(x, y, W * 0.16, H * 0.018, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + W * 0.06, y - H * 0.012, W * 0.09, H * 0.016, 0, 0, 7); ctx.fill();
      }
    }
    // route lighting: the Foundry glows and breathes along the horizon
    if (theme === 'foundry') {
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.7);
      const glow = ctx.createRadialGradient(W * 0.3, horizon, 0, W * 0.3, horizon, W * 0.55);
      glow.addColorStop(0, `rgba(255,120,40,${0.28 + 0.12 * pulse})`);
      glow.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, horizon + 4);
    }

    // far layer
    const far = (par: number, color: string, base: number, hmax: number, spacing: number, kind: 'pile' | 'house' | 'crane' | 'tree' | 'stack' | 'tower' | 'sign') => {
      ctx.fillStyle = color;
      const off = camX * ppm * par;
      const sp = spacing * dpr;
      const start = Math.floor(off / sp) - 1;
      for (let k = start; k < start + W / sp + 3; k++) {
        const x = k * sp - off;
        const r = hash(k + base);
        const hh = hmax * (0.4 + r * 0.6) * dpr;
        const y = base;
        if (kind === 'pile') {
          ctx.beginPath(); ctx.moveTo(x - sp * 0.6, y); ctx.quadraticCurveTo(x, y - hh * 1.6, x + sp * 0.7, y); ctx.fill();
        } else if (kind === 'house') {
          const bw = sp * 0.7;
          ctx.fillRect(x, y - hh, bw, hh);
          ctx.beginPath(); ctx.moveTo(x - 4, y - hh); ctx.lineTo(x + bw / 2, y - hh - bw * 0.4); ctx.lineTo(x + bw + 4, y - hh); ctx.fill();
          if (r > 0.4) { ctx.fillStyle = 'rgba(255,200,110,0.55)'; ctx.fillRect(x + bw * 0.2, y - hh * 0.6, bw * 0.18, bw * 0.14); ctx.fillStyle = color; }
        } else if (kind === 'crane') {
          if (r > 0.55) { ctx.fillRect(x, y - hh * 2, 4 * dpr, hh * 2); ctx.fillRect(x - hh * 0.6, y - hh * 2, hh * 1.4, 3 * dpr); }
          else { ctx.fillRect(x, y - hh * 0.5, sp * 0.5, hh * 0.5); }
        } else if (kind === 'stack') {
          // foundry stacks and sheds with a furnace-lit window band
          ctx.fillRect(x, y - hh * 1.8, sp * 0.12, hh * 1.8);
          ctx.fillRect(x + sp * 0.18, y - hh * 0.7, sp * 0.5, hh * 0.7);
          ctx.fillStyle = 'rgba(255,140,60,0.55)'; ctx.fillRect(x + sp * 0.22, y - hh * 0.45, sp * 0.42, 3 * dpr); ctx.fillStyle = color;
        } else if (kind === 'tower') {
          // night skyline: towers with a grid of lit windows in cool and neon tones
          const bw = sp * 0.62;
          ctx.fillRect(x, y - hh, bw, hh);
          const cols = 3, rows = Math.floor(hh / (9 * dpr));
          for (let a = 0; a < cols; a++) for (let b2 = 1; b2 < rows; b2++) {
            const h2 = hash(k * 31 + a * 7 + b2);
            if (h2 > 0.55) { ctx.fillStyle = h2 > 0.93 ? 'rgba(255,80,170,0.7)' : h2 > 0.85 ? 'rgba(80,230,255,0.6)' : 'rgba(255,226,170,0.35)'; ctx.fillRect(x + bw * (0.14 + a * 0.28), y - hh + b2 * 9 * dpr, bw * 0.14, 3 * dpr); }
          }
          ctx.fillStyle = color;
        } else if (kind === 'sign') {
          // storefronts and neon signs along the street
          ctx.fillRect(x, y - hh, sp * 0.8, hh);
          const neon = ['#ff3fa4', '#38e1ff', '#ffd23f', '#9b7bff'][Math.floor(r * 4)];
          ctx.fillStyle = neon; ctx.globalAlpha = 0.85; ctx.fillRect(x + sp * 0.12, y - hh * 0.8, sp * 0.4, 4 * dpr);
          ctx.globalAlpha = 0.25; ctx.fillRect(x + sp * 0.06, y - hh * 0.95, sp * 0.52, 14 * dpr); ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(120,200,255,0.18)'; ctx.fillRect(x + sp * 0.08, y - hh * 0.45, sp * 0.6, hh * 0.38);
          ctx.fillStyle = color;
        } else {
          ctx.beginPath(); ctx.arc(x, y - hh, hh * 0.45, 0, 7); ctx.fill(); ctx.fillRect(x - 2 * dpr, y - hh, 4 * dpr, hh);
        }
      }
    };
    if (theme === 'scrap') {
      far(0.08, '#4a2c2a', horizon, 40, 160, 'pile');
      far(0.18, '#2e1d1a', horizon + 6, 46, 120, 'crane');
      far(0.35, '#201513', roadTop - 2, 34, 90, 'pile');
    } else if (theme === 'coast') {
      ctx.fillStyle = '#1f5f7d'; ctx.fillRect(0, horizon - 10 * dpr, W, roadTop - horizon + 10 * dpr); // the sea
      ctx.fillStyle = 'rgba(255,236,200,0.25)';
      for (let k = 0; k < 6; k++) ctx.fillRect(((k * 211 - camX * ppm * 0.05) % W + W) % W, horizon - 4 * dpr + k * 3 * dpr, 50 * dpr, 1.5 * dpr);
      far(0.1, '#2c3b33', horizon - 10 * dpr, 46, 220, 'pile');
      far(0.38, '#1b2a22', roadTop - 2, 46, 110, 'tree');
    } else if (theme === 'foundry') {
      far(0.06, '#141c2c', horizon, 70, 200, 'stack');
      far(0.18, '#0f1522', horizon + 4, 50, 130, 'crane');
      far(0.36, '#0b0f18', roadTop - 2, 36, 95, 'stack');
    } else if (theme === 'night') {
      far(0.05, '#0e0d22', horizon, 120, 120, 'tower');
      far(0.16, '#0a0a1a', horizon + 6, 90, 90, 'tower');
      far(0.34, '#07070f', roadTop - 2, 40, 140, 'sign');
    } else {
      far(0.08, '#2e3a4f', horizon, 34, 150, 'tree');
      far(0.2, '#2a2730', horizon + 8, 40, 130, 'house');
      far(0.38, '#1d2b22', roadTop - 2, 40, 70, 'tree');
    }
    // ground strip
    if (theme !== 'coast') {
      ctx.fillStyle = pal.ground;
      ctx.fillRect(0, horizon, W, roadTop - horizon);
    }

}

/** Drawn on top of the road surface, under the cars (e.g. wet-street reflections). */
export function drawRoadDressing(v: SceneView) {
  const { ctx, W, H, horizon, roadTop, roadBot, camX, ppm, t, theme, trackId, dpr, reduced } = v;
  const pal = PALETTES[theme];
  void H; void trackId; void roadTop; void roadBot; void horizon; void t; void reduced; void pal;
    if (theme === 'night' && !reduced) {
      // wet street: long smeared reflections of the neon signs, moving with the far layer
      for (let k = 0; k < 6; k++) {
        const x = ((k * 233 - camX * ppm * 0.34) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.fillStyle = ['rgba(255,63,164,0.10)', 'rgba(56,225,255,0.09)', 'rgba(255,210,63,0.08)'][k % 3];
        ctx.fillRect(x, roadTop + 4 * dpr, 14 * dpr, roadBot - roadTop - 8 * dpr);
      }
    }
}

/** The band below the road: verge, posts, lamps. */
export function drawForeground(v: SceneView) {
  const { ctx, W, H, horizon, roadTop, roadBot, camX, ppm, t, theme, trackId, dpr, reduced } = v;
  const pal = PALETTES[theme];
  void H; void trackId; void roadTop; void roadBot; void horizon; void t; void reduced; void pal;
    // foreground
    ctx.fillStyle = pal.fore;
    ctx.fillRect(0, roadBot, W, H - roadBot + 8 * dpr); // no unpainted strip under the road
    const fsp = 140 * dpr;
    const foff = (camX * ppm * 1.25) % fsp;
    for (let x = -foff; x < W; x += fsp) {
      ctx.fillStyle = pal.post;
      ctx.fillRect(x, roadBot + 8 * dpr, 6 * dpr, 40 * dpr);
      if (theme === 'scrap') { // safety-paint chevrons on the yard posts
        ctx.fillStyle = '#f2c230';
        for (let k = 0; k < 4; k++) ctx.fillRect(x, roadBot + (10 + k * 10) * dpr, 6 * dpr, 5 * dpr);
      }
      if (theme === 'night') { // street lamps throw pools of light on the kerb
        ctx.fillStyle = 'rgba(255,214,140,0.12)';
        ctx.beginPath(); ctx.ellipse(x + 3 * dpr, roadBot + 4 * dpr, 40 * dpr, 8 * dpr, 0, 0, 7); ctx.fill();
      }
    }
}
