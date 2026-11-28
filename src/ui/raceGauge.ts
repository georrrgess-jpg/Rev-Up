// Race HUD instrument cluster (race workstream, 1.10 Redline). One layout on every car — the shift light and its
// label on top, the tach arc with the shift window as a bracketed segment, a large digital mph readout in the middle,
// the gear in the open bottom of the arc and the nitro pips beside it — dressed per car tier: a plain starter face,
// a sport face with tach numerals and the car's accent, a pro face with a segmented LED tach, and the flagship faces
// (the Sovereign's gold bezel, the Tempest's electric motor meter). Drawn on its own small canvas, only when
// something visible changes. The numbers are always the sim's (mph from the one conversion, the judged engine speed
// while a shift is live); only the speed sweep and the needle's glide across a gear change are interpolated.
import type { CarId } from '../data/tables';
import { drivetrainFor } from '../data/drivetrain';
import type { ShiftAttempt } from '../core/race';
import { fitCanvas } from '../render/car';
import { h } from './dom';
import { ClusterStyle, GAIN_S, ShiftCue, ShiftMarker, clusterStyle, shiftMarker, speedGain } from './clusterModel';

export { gaugeRange, clusterStyle, shiftMarker } from './clusterModel';
export type { ShiftCue } from './clusterModel';
/** The speed sweep's colour on every face (the RPM band carries the car's accent, so the two never read alike). */
const SPEED_COL = '#9fd8ff';

/** Seconds the needle takes to glide across a jump (a gear change). */
export const GLIDE_S = 0.12;
/** Seconds the speed sweep's light easing takes to settle (the number above it is never eased). */
export const SWEEP_S = 0.12;
/** The shift light's brief full-bright flash when the window opens (seconds). */
export const FLASH_S = 0.16;

// ---------------------------------------------------------------- the cluster

export interface ClusterFrame {
  /** Engine speed as a fraction of the redline (the judged one). */
  f: number;
  gear: number;
  gears: number;
  /** The speedometer reading, already converted once (an integer). */
  mph: number;
  cue: ShiftCue;
  /** Race time (s), the frame's real dt (s). */
  t: number;
  dt: number;
  /** The shift attempt (its window and hold state). */
  attempt: Pick<ShiftAttempt, 'cue' | 'band' | 'id'>;
  topGear: boolean;
  launchArmed?: boolean;
  nitro: { charges: number; boosting: boolean; perfect: boolean };
  /** The countdown is running: the needle rests and the numbers show the start. */
  staging?: boolean;
}

export class Gauge {
  el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private key = '';
  /** Displayed fraction of the redline (read by the dev shift trace). */
  needle = 0;
  /** The window drawn (read by the dev shift trace). */
  band: [number, number];
  private gear = -1;
  private glide: { from: number; t: number } | null = null;
  private readonly redline: number;
  readonly range: number;
  readonly style: ClusterStyle;
  /** Eased speed sweep (mph) and the recent speed samples for the acceleration sweep. */
  private sweep = 0;
  private samples: [number, number][] = [];
  private flashT = 0;
  private lastCue: ShiftCue = 'off';
  /** Last marker shown (tests and the dev trace). */
  marker: ShiftMarker = { shape: 'none', band: [0, 0], label: '' };
  private digitW = 0;
  private fontKey = '';

  constructor(car: CarId, private reduced: boolean, band?: [number, number], range?: number) {
    const d = drivetrainFor(car);
    this.redline = d.redline;
    this.band = band ?? d.band;
    this.range = range ?? d.gaugeMph;
    this.style = clusterStyle(car);
    this.el = h('canvas', { class: `gauge cluster tier-${this.style.tier}`, role: 'img', 'aria-label': 'Speed, gear and shift light' }) as HTMLCanvasElement;
    this.ctx = this.el.getContext('2d')!;
  }

  resize() {
    this.dpr = fitCanvas(this.el, 2).dpr;
    this.key = '';
    this.fontKey = '';
  }

  /** Needle position for this frame. While a shift is live (green or late) it is exactly the engine speed the tap is
   *  judged on; a jump (a gear change, the launch) is bridged by one eased glide of GLIDE_S, then it tracks again. */
  private moveNeedle(target: number, gear: number, dt: number, live: boolean) {
    if (this.reduced || this.gear < 0 || live) { this.needle = target; this.gear = gear; this.glide = null; return; }
    if (gear !== this.gear || Math.abs(target - this.needle) > 0.15) this.glide = { from: this.needle, t: 0 };
    this.gear = gear;
    if (this.glide) {
      this.glide.t += Math.max(0, Math.min(dt, 0.1));
      const k = Math.min(1, this.glide.t / GLIDE_S);
      const e = 1 - (1 - k) * (1 - k);
      this.needle = this.glide.from + (target - this.glide.from) * e;
      if (k >= 1) this.glide = null;
    } else this.needle = target;
  }

  draw(fr: ClusterFrame) {
    const a = fr.attempt;
    if (a.band[1] > a.band[0]) this.band = [a.band[0], a.band[1]];
    const target = fr.staging ? 0.14 : Math.max(0, Math.min(1.06, fr.f));
    this.moveNeedle(target, fr.gear, fr.dt, fr.cue === 'green' || fr.cue === 'late');
    // the speed sweep eases lightly toward the true reading; the digits are the true reading
    const k = this.reduced ? 1 : 1 - Math.exp(-Math.max(0, Math.min(fr.dt, 0.1)) / SWEEP_S);
    this.sweep += (fr.mph - this.sweep) * k;
    if (Math.abs(fr.mph - this.sweep) < 0.2) this.sweep = fr.mph;
    if (!fr.staging) {
      this.samples.push([fr.t, fr.mph]);
      while (this.samples.length > 2 && this.samples[1][0] < fr.t - GAIN_S) this.samples.shift();
    }
    const gain = fr.staging ? 0 : speedGain(this.samples, fr.t, fr.mph);
    // the brief shift light: a full-bright flash the moment the window opens
    if (fr.cue === 'green' && this.lastCue !== 'green' && this.lastCue !== 'late') this.flashT = this.reduced ? 0 : FLASH_S;
    this.lastCue = fr.cue;
    this.flashT = Math.max(0, this.flashT - Math.max(0, fr.dt));
    const m = shiftMarker({ cue: a.cue, band: this.band }, fr.cue, { launchArmed: fr.launchArmed, topGear: fr.topGear });
    this.marker = m;
    const blink = fr.cue === 'late' && !this.reduced ? Math.floor(fr.t * 8) % 2 : 0;
    const key = `${Math.round(this.needle * 400)}|${fr.gear}|${fr.mph}|${Math.round(this.sweep * 4)}|${Math.round(gain)}|${fr.cue}|${blink}|${m.shape}|${this.band.join()}|${this.el.width}|${fr.nitro.charges}|${fr.nitro.boosting}|${fr.nitro.perfect}|${this.flashT > 0}|${fr.topGear}|${fr.launchArmed}`;
    if (key === this.key) return;
    this.key = key;
    this.paint(fr, m, gain, blink);
  }

  private paint(fr: ClusterFrame, m: ShiftMarker, gain: number, blink: number) {
    const ctx = this.ctx;
    const W = this.el.width;
    const H = this.el.height;
    const s = this.dpr;
    const st = this.style;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    // a 240° arc open at the bottom: the gear and nitro pips sit in the opening
    const R = Math.max(12 * s, Math.min(W / 2 - 9 * s, (H - 14 * s) / 1.92));
    const cy = 8 * s + R;
    const a0 = Math.PI * (5 / 6);
    const sweepA = Math.PI * (4 / 3);
    const maxF = 1.08;
    const ang = (fr0: number) => a0 + sweepA * Math.max(0, Math.min(1, fr0 / maxF));
    const arc = (from: number, to: number, color: string, width: number, r = R, dash?: number[]) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash.map((x) => x * s));
      ctx.beginPath(); ctx.arc(cx, cy, r, ang(from), ang(to)); ctx.stroke();
      if (dash) ctx.setLineDash([]);
    };
    // ---- face: a dark disc so the cluster reads over any scenery (daylight or night)
    ctx.fillStyle = st.face === 'gold' ? 'rgba(18,14,8,0.86)' : st.face === 'volt' ? 'rgba(4,14,20,0.86)' : 'rgba(8,10,14,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 7 * s, 0, Math.PI * 2); ctx.fill();
    // bezel: none on the starter face, the car's accent from sport up, gold on the Sovereign
    if (st.tier !== 'starter') {
      ctx.strokeStyle = st.face === 'gold' ? '#c9a24a' : st.accent;
      ctx.globalAlpha = st.tier === 'sport' ? 0.55 : 0.8;
      ctx.lineWidth = (st.tier === 'flagship' ? 2.2 : 1.4) * s;
      ctx.beginPath(); ctx.arc(cx, cy, R + 6.5 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
    // ---- speed sweep (outer ring): the eased reading, the speed gained in the last GAIN_S brighter on its leading edge
    const sr = R + 2.5 * s;
    const sf = (v: number) => Math.min(1, Math.max(0, v / this.range)) * maxF;
    arc(0, maxF, 'rgba(255,255,255,0.12)', 3 * s, sr);
    if (this.sweep > 0.5) arc(0, sf(this.sweep), SPEED_COL, 3 * s, sr);
    if (gain >= 1) { ctx.globalAlpha = 0.95; arc(sf(Math.max(0, this.sweep - gain)), sf(this.sweep), '#ffffff', 3 * s, sr); ctx.globalAlpha = 1; }
    // ---- tach (inner ring): the band of engine speed, the limiter in red
    const tr = R - 5 * s;
    const tw = 6 * s;
    if (st.face === 'led' || st.face === 'volt' || st.face === 'gold') {
      // segmented LED tach: lit up to the needle
      const segs = 30;
      for (let i = 0; i < segs; i++) {
        const f0 = (i / segs) * maxF, f1 = ((i + 0.72) / segs) * maxF;
        const lit = f0 < this.needle;
        const red = f0 >= 1;
        ctx.strokeStyle = lit ? (red ? '#ff5a4a' : st.face === 'gold' ? '#ffe6a8' : st.accent) : red ? 'rgba(229,72,58,0.45)' : 'rgba(255,255,255,0.13)';
        ctx.lineWidth = tw;
        ctx.beginPath(); ctx.arc(cx, cy, tr, ang(f0), ang(f1)); ctx.stroke();
      }
    } else {
      arc(0, maxF, 'rgba(255,255,255,0.15)', tw, tr);
      arc(1, maxF, '#e5483a', tw, tr);
    }
    // rpm ticks every 1000 (numerals ×1000 from the sport face up)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2 * s;
    const step = this.redline > 12000 ? 2000 : 1000;
    const numerals = st.tier !== 'starter';
    if (numerals) { ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `700 ${Math.round(R * 0.13)}px Barlow, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
    for (let r = 0, n = 0; r <= this.redline * maxF; r += step, n++) {
      const aa = ang(r / this.redline);
      const c = Math.cos(aa), sn = Math.sin(aa);
      ctx.beginPath(); ctx.moveTo(cx + c * (tr - tw / 2 - 1 * s), cy + sn * (tr - tw / 2 - 1 * s)); ctx.lineTo(cx + c * (tr - tw / 2 - 4 * s), cy + sn * (tr - tw / 2 - 4 * s)); ctx.stroke();
      if (numerals && n % (R > 50 * s ? 1 : 2) === 0) ctx.fillText(String(r / 1000), cx + c * (tr - tw / 2 - 10 * s), cy + sn * (tr - tw / 2 - 10 * s));
    }
    // ---- the shift window: a bracketed segment (shape), its words in the shift light (label), and colour
    if (m.shape !== 'none') {
      const [lo, hi] = m.band;
      const col = m.shape === 'bracket' ? (fr.launchArmed ? '#5ef2ff' : '#5dff8a') : m.shape === 'late' ? '#ff6a5a' : m.shape === 'outline' ? '#ffc457' : 'rgba(150,170,160,0.55)';
      if (m.shape === 'bracket' || m.shape === 'late') arc(lo, hi, col, tw + 2 * s, tr);
      else if (m.shape === 'held') arc(lo, hi, col, tw, tr, [3, 3]);
      // brackets: a stroke across the ring at each end, longer on a live window
      const ext = m.shape === 'bracket' || m.shape === 'late' ? 6 : 4;
      ctx.strokeStyle = col;
      ctx.lineWidth = (m.shape === 'held' ? 1.5 : 2.4) * s;
      ctx.lineCap = 'round';
      for (const [fr0, dir] of [[lo, 1], [hi, -1]] as [number, number][]) {
        const aa = ang(fr0);
        const c = Math.cos(aa), sn = Math.sin(aa);
        const r0 = tr - tw / 2 - ext * 0.5 * s, r1 = tr + tw / 2 + ext * s;
        ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + sn * r0); ctx.lineTo(cx + c * r1, cy + sn * r1);
        // the bracket's foot points into the window
        const fa = aa + dir * 0.09;
        ctx.lineTo(cx + Math.cos(fa) * r1, cy + Math.sin(fa) * r1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    // ---- needle (the analogue element on every face; the LED faces keep a slim one over the lit segments)
    const na = ang(this.needle);
    ctx.strokeStyle = this.needle >= 1 ? '#ff6a5a' : '#ffffff';
    ctx.lineWidth = (st.face === 'plain' || st.face === 'numerals' ? 2.6 : 1.8) * s;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(na) * (tr - tw * 1.6), cy + Math.sin(na) * (tr - tw * 1.6)); ctx.lineTo(cx + Math.cos(na) * (tr + tw / 2), cy + Math.sin(na) * (tr + tw / 2)); ctx.stroke();
    ctx.lineCap = 'butt';
    // ---- shift light: five lamps filling toward the window; one solid pill with its word once a tap counts
    const lampY = cy - R * 0.5;
    const lamps = 5;
    const lw = Math.max(5 * s, R * 0.11);
    const gap = lw * 0.45;
    const rowW = lamps * lw + (lamps - 1) * gap;
    const lx = cx - rowW / 2;
    if (m.label && !(m.shape === 'late' && blink)) {
      const flash = this.flashT > 0;
      const bg = m.shape === 'bracket' ? (fr.launchArmed ? '#5ef2ff' : flash ? '#d9ffe6' : '#5dff8a') : m.shape === 'late' ? '#ff5a4a' : 'rgba(120,135,150,0.5)';
      const ph = lw * 1.35;
      const pw = Math.max(rowW + lw, 0);
      ctx.fillStyle = bg;
      roundRect(ctx, cx - pw / 2, lampY - ph / 2, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = m.shape === 'held' ? '#e8eef5' : '#06210f';
      ctx.font = `800 ${Math.round(ph * 0.78)}px Barlow, system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.label, cx, lampY + ph * 0.04);
    } else {
      const lit = fr.cue === 'soon' ? Math.max(1, Math.min(lamps - 1, Math.round(((fr.f - (this.band[0] - 0.12)) / 0.12) * (lamps - 1)))) : 0;
      for (let i = 0; i < lamps; i++) {
        const on = i < lit;
        ctx.fillStyle = on ? '#ffc457' : 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.arc(lx + i * (lw + gap) + lw / 2, lampY, lw / 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // ---- the big mph readout: fixed-width digit cells, so the number never jitters sideways
    const big = Math.round(R * 0.52);
    const fk = `${big}`;
    if (fk !== this.fontKey) { this.fontKey = fk; ctx.font = `800 ${big}px Barlow, system-ui`; this.digitW = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width)); }
    ctx.font = `800 ${big}px Barlow, system-ui`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const txt = String(Math.max(0, Math.min(999, fr.mph)));
    const cells = 3;
    const my = cy + big * 0.22;
    const x0 = cx - (cells * this.digitW) / 2;
    for (let i = 0; i < cells; i++) {
      const ch = txt[txt.length - cells + i];
      if (ch === undefined) continue;
      ctx.fillStyle = st.face === 'gold' ? '#fff3d6' : '#ffffff';
      ctx.fillText(ch, x0 + (i + 0.5) * this.digitW, my);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = `700 ${Math.round(R * 0.15)}px Barlow, system-ui`;
    ctx.fillText('MPH', cx, my + R * 0.2);
    // ---- gear: a box in the arc's opening (accent border; green while a shift is live)
    const gs = R * 0.4;
    const gy = cy + R * 0.5;
    const live = m.shape === 'bracket';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, cx - gs / 2, gy, gs, gs, 5 * s); ctx.fill();
    ctx.strokeStyle = live ? '#5dff8a' : st.accent;
    ctx.lineWidth = (live ? 2.4 : 1.4) * s;
    roundRect(ctx, cx - gs / 2, gy, gs, gs, 5 * s); ctx.stroke();
    ctx.fillStyle = live ? '#5dff8a' : '#ffffff';
    ctx.font = `800 ${Math.round(gs * 0.78)}px Barlow, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(fr.staging ? 'N' : String(fr.gear + 1), cx, gy + gs * 0.54);
    // ---- nitro pips, always right of the gear: filled per charge, gold while a Perfect boost burns
    const pr = Math.max(2.4 * s, R * 0.055);
    const px = cx + gs / 2 + pr * 2.4;
    const shown = Math.min(3, Math.max(fr.nitro.charges, 0));
    for (let i = 0; i < 3; i++) {
      const py = gy + gs - pr - i * pr * 2.6;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
      if (i < shown) { ctx.fillStyle = '#8fd3ff'; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1 * s; ctx.stroke(); }
    }
    if (fr.nitro.boosting) {
      ctx.fillStyle = fr.nitro.perfect ? '#ffd75e' : '#8fd3ff';
      ctx.font = `800 ${Math.round(R * 0.15)}px Barlow, system-ui`;
      ctx.textAlign = 'left';
      ctx.fillText(fr.nitro.perfect ? 'BOOST★' : 'BOOST', px + pr * 1.8, gy + gs * 0.5);
    }
    // gear count to the left (e.g. "/6"), so the top gear reads as "TOP"
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 ${Math.round(R * 0.14)}px Barlow, system-ui`;
    ctx.fillText(fr.topGear && !fr.staging ? 'TOP' : `/${fr.gears}`, cx - gs / 2 - 4 * s, gy + gs * 0.54);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
