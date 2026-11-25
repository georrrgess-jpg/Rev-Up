// Synthesized sound (no audio files to download). The AudioContext is created lazily on the
// first user gesture so the initial load stays focused on the first merge.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6;
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function suspendAudio() { if (ctx && ctx.state === 'running') void ctx.suspend(); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') void ctx.resume(); }

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, when = 0, slideTo?: number) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, when = 0, filterFreq = 2000, type: BiquadFilterType = 'bandpass') {
  if (!ctx || !master || !noiseBuf || muted) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  /** Ordinary merge: quick snap and mechanical click. */
  merge(chain = 1) {
    const step = Math.min(chain - 1, 8);
    noise(0.04, 0.25, 0, 3500, 'highpass');
    tone(220 * 2 ** (step / 6), 0.07, 'square', 0.12, 0.01);
    if (chain > 1) tone(330 * 2 ** (step / 6), 0.09, 'triangle', 0.14, 0.04); // rising cascade rhythm
  },
  mint() {
    [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.35, 'sine', 0.12, i * 0.06));
  },
  polished() { tone(1320, 0.18, 'sine', 0.1); tone(1760, 0.2, 'sine', 0.06, 0.05); },
  place() { tone(520, 0.05, 'triangle', 0.08); },
  invalid() { tone(140, 0.12, 'square', 0.08, 0, 110); },
  scrap() { noise(0.25, 0.3, 0, 600, 'lowpass'); tone(90, 0.2, 'sawtooth', 0.1, 0, 50); },
  nitroBank() { tone(440, 0.08, 'triangle', 0.12); tone(660, 0.12, 'triangle', 0.12, 0.07); },
  nitro(perfect: boolean) {
    noise(0.9, perfect ? 0.45 : 0.3, 0, perfect ? 1800 : 1200, 'bandpass');
    tone(perfect ? 180 : 140, 0.7, 'sawtooth', 0.08, 0, perfect ? 520 : 360);
    if (perfect) tone(1046, 0.25, 'sine', 0.12, 0.02);
  },
  windowCue() { tone(988, 0.06, 'sine', 0.12); tone(988, 0.06, 'sine', 0.12, 0.1); },
  countdown(go: boolean) { tone(go ? 880 : 440, go ? 0.3 : 0.12, 'square', 0.1); },
  cash() { tone(1400, 0.05, 'triangle', 0.08); tone(1800, 0.08, 'triangle', 0.08, 0.05); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.09)); },
  lose() { tone(392, 0.2, 'triangle', 0.1); tone(330, 0.3, 'triangle', 0.1, 0.15); },
  cloth() { noise(0.5, 0.25, 0, 900, 'lowpass'); },
  /** Distinct rev for each car on reveal. */
  rev(base: number, peak: number) {
    if (!ctx || !master || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.5);
    f.frequency.linearRampToValueAtTime(500, t + 1.6);
    for (const [osc, mul] of [[o, 1], [o2, 0.5]] as const) {
      osc.frequency.setValueAtTime(base * mul, t);
      osc.frequency.exponentialRampToValueAtTime(peak * mul, t + 0.45);
      osc.frequency.exponentialRampToValueAtTime(base * 1.4 * mul, t + 1.0);
      osc.frequency.exponentialRampToValueAtTime(peak * 0.9 * mul, t + 1.3);
      osc.frequency.exponentialRampToValueAtTime(base * mul, t + 1.9);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
    g.gain.setValueAtTime(0.25, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(master);
    o.start(t); o2.start(t);
    o.stop(t + 2.2); o2.stop(t + 2.2);
  },
};

/** Continuous engine hum for the race. */
export class EngineHum {
  private o: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;

  constructor(private idle = 50, private redline = 190) {}

  start() {
    if (!ctx || !master || muted || this.o) return;
    this.o = ctx.createOscillator();
    this.o.type = 'sawtooth';
    this.o.frequency.value = this.idle;
    this.f = ctx.createBiquadFilter();
    this.f.type = 'lowpass';
    this.f.frequency.value = 600;
    this.g = ctx.createGain();
    this.g.gain.value = 0.05;
    this.o.connect(this.f).connect(this.g).connect(master);
    this.o.start();
  }
  set(speedFrac: number, boost: boolean) {
    if (!this.o || !ctx) return;
    const now = ctx.currentTime;
    this.o.frequency.setTargetAtTime(this.idle + speedFrac * (this.redline - this.idle) + (boost ? 32 : 0), now, 0.05);
    this.f!.frequency.setTargetAtTime(500 + speedFrac * 1200 + (boost ? 260 : 0), now, 0.05);
  }
  stop() {
    if (!this.o || !ctx) return;
    this.g!.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    const o = this.o;
    setTimeout(() => { try { o.stop(); } catch { /* already stopped */ } }, 300);
    this.o = null;
  }
}
