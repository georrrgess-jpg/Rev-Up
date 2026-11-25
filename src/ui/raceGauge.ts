// Race HUD gauge cluster (race workstream): tachometer with the green shift band, a shift light, the gear, and an mph
// speedometer whose range grows with the car. Drawn on its own small canvas and only when something visible changes.
import type { CarId } from '../data/tables';
import { drivetrainFor } from '../data/drivetrain';
import { fitCanvas } from '../render/car';
import { h } from './dom';

export type ShiftCue = 'off' | 'soon' | 'green' | 'late';

const GEAR = ['1', '2', '3', '4', '5', '6', '7', '8'];

export class Gauge {
  el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private key = '';
  private needle = 0; // displayed fraction of the redline
  private readonly redline: number;
  private readonly band: [number, number];
  private readonly gaugeMph: number;

  constructor(car: CarId, private reduced: boolean, band?: [number, number]) {
    const d = drivetrainFor(car);
    this.redline = d.redline;
    this.band = band ?? d.band;
    this.gaugeMph = d.gaugeMph;
    this.el = h('canvas', { class: 'gauge', role: 'img', 'aria-label': 'Tachometer and speed' }) as HTMLCanvasElement;
    this.ctx = this.el.getContext('2d')!;
  }

  resize() {
    this.dpr = fitCanvas(this.el, 2).dpr;
    this.key = '';
  }

  /** f: engine speed as a fraction of the redline; mph: the speedometer reading (already converted once). */
  draw(f: number, gear: number, mph: number, cue: ShiftCue, t: number, dt: number) {
    const target = Math.max(0, Math.min(1.06, f));
    this.needle = this.reduced ? target : this.needle + (target - this.needle) * Math.min(1, dt / 0.05);
    const blink = cue === 'late' && !this.reduced ? Math.floor(t * 8) % 2 : 0;
    const key = `${Math.round(this.needle * 200)}|${gear}|${mph}|${cue}|${blink}|${this.el.width}`;
    if (key === this.key) return;
    this.key = key;
    const ctx = this.ctx;
    const W = this.el.width;
    const H = this.el.height;
    const s = this.dpr;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.6;
    const R = Math.min(W * 0.44, H * 0.52);
    const a0 = Math.PI * 0.8;
    const sweep = Math.PI * 1.4;
    const maxF = 1.08;
    const ang = (fr: number) => a0 + sweep * Math.max(0, Math.min(1, fr / maxF));
    // backing disc keeps the cluster readable over any scenery
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 6 * s, 0, Math.PI * 2); ctx.fill();
    const arc = (from: number, to: number, color: string, width: number, r = R) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(cx, cy, r, ang(from), ang(to)); ctx.stroke();
    };
    ctx.lineCap = 'butt';
    arc(0, maxF, 'rgba(255,255,255,0.16)', 7 * s);
    arc(this.band[0], this.band[1], cue === 'green' ? '#5dff8a' : '#2f9e55', 7 * s);
    arc(1, maxF, '#e5483a', 7 * s);
    // rpm ticks every 1000
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5 * s;
    for (let r = 0; r <= this.redline * maxF; r += 1000) {
      const a = ang(r / this.redline);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 9 * s), cy + Math.sin(a) * (R - 9 * s)); ctx.lineTo(cx + Math.cos(a) * (R - 4 * s), cy + Math.sin(a) * (R - 4 * s)); ctx.stroke();
    }
    // speed: a thin outer arc scaled to this car's gauge
    const sf = Math.min(1, mph / this.gaugeMph) * maxF;
    arc(0, maxF, 'rgba(143,211,255,0.18)', 2.5 * s, R + 5 * s);
    if (sf > 0) arc(0, sf, '#8fd3ff', 2.5 * s, R + 5 * s);
    // needle
    const na = ang(this.needle);
    ctx.strokeStyle = this.needle >= 1 ? '#ff6a5a' : '#ffffff';
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(na) * R * 0.3, cy + Math.sin(na) * R * 0.3); ctx.lineTo(cx + Math.cos(na) * (R - 3 * s), cy + Math.sin(na) * (R - 3 * s)); ctx.stroke();
    // shift light: five lamps, filling as the revs climb to the band; all green in it; red past it
    const lamps = 5;
    const lit = cue === 'green' || cue === 'late' ? lamps : cue === 'soon' ? Math.max(1, Math.min(lamps - 1, Math.round(((f - (this.band[0] - 0.12)) / 0.12) * (lamps - 1)))) : 0;
    const lw = 8 * s;
    const gap = 4 * s;
    const lx = cx - (lamps * lw + (lamps - 1) * gap) / 2;
    for (let i = 0; i < lamps; i++) {
      const on = i < lit && !(cue === 'late' && blink);
      ctx.fillStyle = !on ? 'rgba(255,255,255,0.14)' : cue === 'late' ? '#ff5a4a' : cue === 'green' ? '#5dff8a' : '#ffc457';
      ctx.beginPath(); ctx.arc(lx + i * (lw + gap) + lw / 2, cy - R * 0.5, lw / 2, 0, Math.PI * 2); ctx.fill();
    }
    // gear and mph
    ctx.textAlign = 'center';
    ctx.fillStyle = cue === 'green' ? '#5dff8a' : '#ffffff';
    ctx.font = `800 ${Math.round(R * 0.5)}px Barlow, system-ui`;
    ctx.fillText(GEAR[gear] ?? String(gear + 1), cx, cy + R * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(R * 0.36)}px Barlow, system-ui`;
    ctx.fillText(String(mph), cx, cy + R * 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `700 ${Math.round(R * 0.17)}px Barlow, system-ui`;
    ctx.fillText('mph', cx, cy + R * 0.78);
    ctx.textAlign = 'start';
  }
}
