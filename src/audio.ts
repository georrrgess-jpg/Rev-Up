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
  merge(chain = 1, tier = 2) {
    const step = Math.min(chain - 1, 8);
    noise(0.04, 0.25, 0, 3500, 'highpass');
    tone(220 * 2 ** (step / 6), 0.07, 'square', 0.12, 0.01);
    if (chain > 1) tone(330 * 2 ** (step / 6), 0.09, 'triangle', 0.14, 0.04); // rising cascade rhythm
    // heavier metal for high tiers: a low thud and a ringing overtone that grows with the tier
    if (tier >= 4) { tone(70 + tier * 6, 0.22, 'sine', 0.16, 0.0, 45); tone(660 + tier * 110, 0.35 + tier * 0.04, 'sine', 0.05 + tier * 0.01, 0.03); }
  },
  /** A keystone (a car's part) is crafted: a rising chord and an air-wrench burst. */
  keystone() {
    noise(0.18, 0.3, 0, 2600, 'bandpass');
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.11, 0.05 + i * 0.07));
  },
  /** A headline result (a rival beaten, a knockout won): a longer brass-like fanfare. */
  fanfare() {
    [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36], [1046, 0.5], [1318, 0.62]].forEach(([f, d]) => { tone(f, 0.45, 'sawtooth', 0.06, d); tone(f / 2, 0.5, 'triangle', 0.08, d); });
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
  /** Focused light cue for the reveal: a relay clunk and a short warm hum. */
  spot() { noise(0.06, 0.35, 0, 1800, 'bandpass'); tone(110, 0.5, 'sine', 0.08, 0.02); tone(220, 0.35, 'sine', 0.04, 0.03); },
  /** A distinct engine voice per car on reveal. */
  rev(base: number, peak: number, id = 'muscle') {
    if (!ctx || !master || muted) return;
    const v = VOICES[id] ?? VOICES.muscle;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = v.filter;
    f.Q.value = v.q;
    f.frequency.setValueAtTime(v.cut * 0.4, t);
    f.frequency.linearRampToValueAtTime(v.cut, t + 0.45);
    f.frequency.linearRampToValueAtTime(v.cut * 0.45, t + 1.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.08);
    g.gain.setValueAtTime(0.24, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    // lope / misfire: amplitude modulation at the car's idle rhythm
    const am = ctx.createGain();
    am.gain.value = 1 - v.lope;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = v.lopeHz;
    lfoGain.gain.value = v.lope;
    lfo.connect(lfoGain).connect(am.gain);
    const oscs = v.layers.map(([type, mul, detune]) => {
      const o = ctx!.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const curve = v.blips
        ? [[0, base], [0.18, peak], [0.32, base * 1.3], [0.5, peak * 1.05], [0.7, base * 1.2], [1.2, peak * 0.85], [1.9, base]]
        : [[0, base], [0.45, peak], [1.0, base * 1.4], [1.3, peak * 0.9], [1.9, base]];
      curve.forEach(([dt, fr], i) => (i ? o.frequency.exponentialRampToValueAtTime(fr * mul, t + dt) : o.frequency.setValueAtTime(fr * mul, t)));
      o.connect(f);
      return o;
    });
    f.connect(am).connect(g).connect(master);
    lfo.start(t); lfo.stop(t + 2.2);
    for (const o of oscs) { o.start(t); o.stop(t + 2.2); }
  },
};

type Layer = [OscillatorType, number, number];
interface Voice { layers: Layer[]; filter: BiquadFilterType; cut: number; q: number; lope: number; lopeHz: number; blips?: boolean; hum: number }
/** Engine voices: Tapeback misfires, Corsa hums, Vexa rasps with quick blips, Ironhorse lopes deep. */
const VOICES: Record<string, Voice> = {
  junker: { layers: [['square', 1, 0], ['sawtooth', 0.5, 14]], filter: 'lowpass', cut: 1100, q: 2, lope: 0.45, lopeHz: 11, hum: 0.9 },
  beater: { layers: [['sawtooth', 1, 0], ['triangle', 2, 5]], filter: 'lowpass', cut: 1600, q: 1, lope: 0.15, lopeHz: 9, hum: 1 },
  hothatch: { layers: [['sawtooth', 1, 0], ['sawtooth', 2, 9], ['square', 3, -6]], filter: 'bandpass', cut: 2400, q: 1.6, lope: 0.08, lopeHz: 14, blips: true, hum: 1.25 },
  muscle: { layers: [['sawtooth', 1, 0], ['sawtooth', 1, 22], ['square', 0.5, 0]], filter: 'lowpass', cut: 900, q: 3, lope: 0.4, lopeHz: 7.5, hum: 0.7 },
  tourer: { layers: [['sawtooth', 1, 0], ['triangle', 2, 4], ['sawtooth', 1.5, 11]], filter: 'lowpass', cut: 1500, q: 1.2, lope: 0.06, lopeHz: 16, hum: 0.85 },
  // Kestrel 1600: a thin, high-revving four with a raspy intake
  tuner: { layers: [['square', 1, 0], ['sawtooth', 2, 7], ['square', 4, -9]], filter: 'bandpass', cut: 3200, q: 2.2, lope: 0.05, lopeHz: 22, blips: true, hum: 1.5 },
  // Lumen RS: a smooth V12 under an electric whine
  super: { layers: [['sawtooth', 1, 0], ['sawtooth', 1.5, 3], ['sine', 6, 0], ['triangle', 3, -4]], filter: 'lowpass', cut: 2600, q: 0.9, lope: 0.03, lopeHz: 28, hum: 1.1 },
};

/** Continuous engine hum for the race. */
export class EngineHum {
  private o: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;

  constructor(private idle = 50, private redline = 190, private voice = 'muscle') {}

  start() {
    if (!ctx || !master || muted || this.o) return;
    const v = VOICES[this.voice] ?? VOICES.muscle;
    this.o = ctx.createOscillator();
    this.o.type = v.layers[0][0];
    this.o.frequency.value = this.idle;
    this.f = ctx.createBiquadFilter();
    this.f.type = v.filter;
    this.f.Q.value = v.q * 0.6;
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
