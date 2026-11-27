// The Rev Up soundtrack: an original piece, sequenced and synthesized at runtime (nothing to download, works offline).
// Owned by the Audio workstream.
//
// One song in D minor at 104 BPM, 16 bars (≈36.9 s) on a fixed 16th-note grid. Every arrangement plays the same
// chords on the same grid, so scenes cross-fade layers instead of cutting:
//   Garage  pad, soft bass, sparse plucks, a shaker; the hook on a soft bell once per loop (bars 13–16). Calm.
//   Race    driving bass, kick, snare, hats, plucks; the hook on a lead twice per loop. Layers follow intensity.
//   Intro   a two-bar sting: the hook's opening on the bell over a swelling pad, landing on D.
//   Results a two-bar sting: the hook's tail rising to D major (a win) or falling back (other places).
// The hook (4 bars, "da-di-da daa" with a syncopated 3+1 pickup) is the recurring motif in all of them.
// The loop seam is continuous by construction: notes are scheduled from the grid, and pads overlap the bar line.

export type MusicScene = 'intro' | 'garage' | 'race' | 'results' | 'off';

export const BPM = 104;
export const STEP = 60 / BPM / 4;
export const BAR = STEP * 16;
export const BARS = 16;
export const LOOP = BAR * BARS;

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// chords per bar as MIDI notes (pad voicing around octave 3–4); the first note is the bass root
const Dm = [50, 57, 62, 65, 69], Bb = [46, 58, 62, 65, 69], C = [48, 55, 60, 64, 74], Am = [45, 57, 60, 64, 67];
const A = [45, 57, 61, 64, 69], Gm = [43, 55, 58, 62, 65], F = [41, 57, 60, 64, 69], Asus = [45, 57, 62, 64, 69];
export const CHORDS: number[][] = [Dm, Bb, C, Am, Dm, Bb, C, A, Gm, Bb, F, C, Dm, Bb, Gm, Asus];

/** [step in bar, MIDI note, length in steps] */
type Note = [number, number, number];
/** The Rev Up hook: four bars (Dm · Bb · C · A). Two endings: open (first time) and rising (second time). */
const HOOK_BARS: Note[][] = [
  [[0, 69, 3], [3, 72, 1], [4, 74, 2], [6, 76, 4], [10, 74, 2], [12, 72, 2], [14, 74, 2]],
  [[0, 77, 6], [6, 76, 2], [8, 74, 4], [12, 69, 4]],
  [[0, 67, 3], [3, 72, 1], [4, 76, 2], [6, 79, 4], [10, 77, 2], [12, 76, 2], [14, 72, 2]],
];
const HOOK_END_OPEN: Note[] = [[0, 74, 4], [4, 76, 2], [6, 73, 2], [8, 76, 8]];
const HOOK_END_RISE: Note[] = [[0, 74, 4], [4, 73, 2], [6, 76, 2], [8, 81, 8]];
export const HOOK = { bars: HOOK_BARS, open: HOOK_END_OPEN, rise: HOOK_END_RISE };
const hookBar = (i: number, rise: boolean) => (i < 3 ? HOOK_BARS[i] : rise ? HOOK_END_RISE : HOOK_END_OPEN);

type Layer = 'pad' | 'bassSoft' | 'bassDrive' | 'arp' | 'bell' | 'lead' | 'kick' | 'snare' | 'hat' | 'shaker';
const LAYERS: Layer[] = ['pad', 'bassSoft', 'bassDrive', 'arp', 'bell', 'lead', 'kick', 'snare', 'hat', 'shaker'];

/** Layer levels per scene; the race arrangement scales with intensity x (0..1). */
export function sceneLevels(scene: MusicScene, x: number): Record<Layer, number> {
  const z: Record<Layer, number> = { pad: 0, bassSoft: 0, bassDrive: 0, arp: 0, bell: 0, lead: 0, kick: 0, snare: 0, hat: 0, shaker: 0 };
  if (scene === 'garage' || scene === 'intro' || scene === 'results') return { ...z, pad: 0.7, bassSoft: 0.5, arp: 0.4, bell: 0.55, shaker: 0.14 };
  if (scene === 'race') {
    x = clamp(x);
    return { ...z, pad: 0.32, bassDrive: 0.62 + 0.3 * x, arp: 0.26 + 0.1 * x, kick: 0.6 + 0.35 * x, snare: x < 0.2 ? 0 : 0.35 + 0.6 * x,
      hat: 0.28 + 0.5 * x, lead: x < 0.4 ? 0 : clamp((x - 0.4) / 0.5), shaker: 0 };
  }
  return z;
}

export class MusicPlayer {
  readonly out: GainNode;
  scene: MusicScene = 'off';
  private intensity = 0.4;
  private gains = {} as Record<Layer, GainNode>;
  private target = {} as Record<Layer, number>;
  /** Until when each layer may still be sounding (scheduling stops after a fade-out). */
  private until = {} as Record<Layer, number>;
  private songStart = 0;
  /** Index of the next 16th step to schedule (absolute, from songStart). */
  private nextStep = 0;
  private delayIn: GainNode;
  private sources = new Set<AudioScheduledSourceNode>();
  /** Muted / suspended callers can skip scheduling to save CPU. */
  enabled = true;

  constructor(private c: BaseAudioContext, dest: AudioNode, private noise: AudioBuffer) {
    this.out = c.createGain();
    this.out.gain.value = 2.2; // the instruments are written quiet; this sets the song against the engine and effects
    this.out.connect(dest);
    // a soft dotted-eighth echo for the bell, lead and plucks: space without a reverb's cost
    this.delayIn = c.createGain();
    this.delayIn.gain.value = 0.22;
    const dl = c.createDelay(1);
    dl.delayTime.value = STEP * 3;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
    this.delayIn.connect(dl).connect(damp).connect(fb).connect(dl);
    damp.connect(this.out);
    for (const l of LAYERS) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.out);
      this.gains[l] = g; this.target[l] = 0; this.until[l] = -1;
    }
  }

  /** Switch arrangement at time t. Stings play first, then the garage loop starts from bar 1 on the same grid. */
  play(scene: MusicScene, t = this.c.currentTime, opts: { won?: boolean } = {}) {
    if (scene === this.scene && scene !== 'results' && scene !== 'intro') return;
    const was = this.scene;
    this.scene = scene;
    if (scene === 'off') { this.fadeTo(sceneLevels('off', 0), t, 0.6); return; }
    if (scene === 'intro' || scene === 'results') {
      this.fadeTo(sceneLevels('off', 0), t, 0.12);
      const t0 = t + 0.05;
      const len = scene === 'intro' ? this.introSting(t0) : this.resultSting(t0, opts.won ?? true);
      // the loop restarts at bar 1 right after the sting, on the sting's grid
      this.restart(t0 + len);
      this.fadeTo(sceneLevels('garage', 0), t0 + len - 0.2, 0.9);
      return;
    }
    if (was === 'off') this.restart(t + 0.08);
    this.fadeTo(sceneLevels(scene, this.intensity), t, scene === 'race' ? 0.6 : 1.2);
  }

  setIntensity(x: number, t = this.c.currentTime) {
    this.intensity = clamp(x);
    if (this.scene === 'race') this.fadeTo(sceneLevels('race', this.intensity), t, 0.8);
  }

  /** Fade everything and stop scheduling; every note source ends within ~2 s. */
  stop(t = this.c.currentTime) { this.play('off', t); }

  private restart(t: number) { this.songStart = t; this.nextStep = 0; }

  private fadeTo(lv: Record<Layer, number>, t: number, tc: number) {
    for (const l of LAYERS) {
      const g = this.gains[l].gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(lv[l], t, tc / 3);
      const was = this.target[l];
      this.target[l] = lv[l];
      // a layer that was already silent stays unscheduled; one fading out keeps playing until it is inaudible
      this.until[l] = lv[l] > 0 ? Infinity : was > 0 ? Math.max(t + tc * 1.5, Math.min(this.until[l], t + tc * 1.5)) : this.until[l];
    }
  }

  /** Schedule every grid step that starts before `horizon` (live: called ~every 50 ms with a short lookahead). */
  scheduleUntil(horizon: number) {
    if (!this.enabled) {
      // keep the grid moving while muted so the song does not jump back when sound returns
      while (this.songStart + this.nextStep * STEP < horizon) this.nextStep++;
      return;
    }
    let guard = 0;
    while (this.songStart + this.nextStep * STEP < horizon && guard++ < 100000) {
      const t = this.songStart + this.nextStep * STEP;
      if (t >= this.c.currentTime - 0.02) this.step(this.nextStep, t);
      this.nextStep++;
    }
  }

  private on(l: Layer, t: number) { return this.until[l] > t; }

  private step(n: number, t: number) {
    const bar = Math.floor(n / 16) % BARS;
    const i = n % 16;
    const ch = CHORDS[bar];
    const x = this.intensity;
    const race = this.scene === 'race';
    if (i === 0 && this.on('pad', t)) for (const m of ch.slice(1, 4 + (bar % 2))) this.pad(t, hz(m), BAR + 0.35, 'pad');
    if (this.on('bassSoft', t)) {
      if (i === 0) this.bassSoft(t, hz(ch[0]), STEP * 7.5);
      if (i === 10 && bar % 2) this.bassSoft(t, hz(ch[0] + 7), STEP * 5);
    }
    if (this.on('bassDrive', t) && i % 2 === 0) {
      const m = i === 6 || i === 14 ? ch[0] + 12 : i === 12 ? ch[0] + 7 : ch[0];
      this.bassDrive(t, hz(m), STEP * 1.6, x);
    }
    if (this.on('arp', t)) {
      const pat = race ? [2, 6, 10, 14] : [2, 10];
      if (pat.includes(i)) {
        const tones = ch.slice(1);
        this.pluck(t, hz(tones[(Math.floor(i / 4) + bar) % tones.length] + 12), race ? 0.18 : 0.32);
      }
    }
    const hookIdx = bar >= 12 ? bar - 12 : bar >= 4 && bar < 8 ? bar - 4 : -1;
    if (hookIdx >= 0) {
      const rise = bar >= 12;
      for (const [s, m, len] of hookBar(hookIdx, rise)) {
        if (s !== i) continue;
        if (bar >= 12 && this.on('bell', t)) this.bell(t, hz(m), STEP * len);
        if (this.on('lead', t)) this.lead(t, hz(m), STEP * len, x);
      }
    }
    if (this.on('kick', t) && i % 4 === 0) this.kick(t);
    if (this.on('snare', t)) {
      if (i === 4 || i === 12) this.snare(t, 1);
      else if (bar === 15 && i >= 12 && x > 0.5) this.snare(t, 0.45 + 0.1 * (i - 12)); // fill into the loop
      else if (i === 15 && x > 0.75) this.snare(t, 0.25);
    }
    if (this.on('hat', t)) {
      if (i % 2 === 0) this.hat(t, i % 4 === 2 ? 0.9 : 0.55, i === 6 || i === 14 ? 0.12 : 0.04);
      else if (x > 0.6) this.hat(t, 0.3, 0.03);
    }
    if (this.on('shaker', t) && i % 4 === 2) this.hat(t, 0.5, 0.06, 'shaker');
  }

  // ---- instruments (each note: a couple of nodes, stopped at its own end) ----
  private track(s: AudioScheduledSourceNode, end: number) {
    this.sources.add(s);
    s.addEventListener('ended', () => this.sources.delete(s));
    s.stop(end);
  }

  private env(g: AudioParam, t: number, a: number, peak: number, dur: number, rel: number) {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.linearRampToValueAtTime(0, t + dur);
  }

  private pad(t: number, f: number, dur: number, l: Layer) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    const g = c.createGain();
    this.env(g.gain, t, 0.45, 0.05, dur, 0.6);
    for (const [type, det] of [['sawtooth', -7], ['triangle', 6]] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); this.track(o, t + dur + 0.05);
    }
    lp.connect(g).connect(this.gains[l]);
  }

  private bassSoft(t: number, f: number, dur: number) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g = c.createGain(); this.env(g.gain, t, 0.03, 0.22, dur, 0.25);
    const g2 = c.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.gains.bassSoft);
    o.start(t); o2.start(t); this.track(o, t + dur + 0.05); this.track(o2, t + dur + 0.05);
  }

  private bassDrive(t: number, f: number, dur: number, x: number) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const s = c.createOscillator(); s.type = 'sine'; s.frequency.value = f / 2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(300 + 900 * x, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain(); this.env(g.gain, t, 0.005, 0.2, dur, 0.06);
    const sg = c.createGain(); sg.gain.value = 0.45;
    o.connect(lp).connect(g); s.connect(sg).connect(g); g.connect(this.gains.bassDrive);
    o.start(t); s.start(t); this.track(o, t + dur + 0.03); this.track(s, t + dur + 0.03);
  }

  private pluck(t: number, f: number, dur: number) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.gains.arp); g.connect(this.delayIn);
    o.start(t); this.track(o, t + dur + 0.02);
  }

  private bell(t: number, f: number, dur: number, dest: AudioNode = this.gains.bell) {
    const c = this.c;
    const len = Math.max(0.5, dur + 0.6);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const m = c.createOscillator(); m.type = 'sine'; m.frequency.value = f * 2.76;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    const mg = c.createGain();
    mg.gain.setValueAtTime(0.25, t); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); m.connect(mg).connect(g);
    g.connect(dest); g.connect(this.delayIn);
    o.start(t); m.start(t); this.track(o, t + len + 0.02); this.track(m, t + 0.4);
  }

  private lead(t: number, f: number, dur: number, x: number) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 8;
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.3, dur));
    vib.connect(vg).connect(o.frequency); vg.connect(o2.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(1200 + 1600 * x, t); lp.frequency.exponentialRampToValueAtTime(900 + 800 * x, t + dur);
    const g = c.createGain(); this.env(g.gain, t, 0.012, 0.055, dur * 0.95, 0.05);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.gains.lead); g.connect(this.delayIn);
    const end = t + dur + 0.03;
    for (const s of [o, o2, vib]) { s.start(t); this.track(s, end); }
  }

  private kick(t: number) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.gains.kick); o.start(t); this.track(o, t + 0.32);
    // a beater click, so the kick still reads on a phone speaker
    const n = c.createBufferSource(); n.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.12, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    n.connect(hp).connect(ng).connect(this.gains.kick); n.start(t, Math.random() * 0.5); this.track(n, t + 0.02);
  }

  private snare(t: number, vel: number) {
    const c = this.c;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.22 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = c.createGain(); og.gain.setValueAtTime(0.16 * vel, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(bp).connect(g).connect(this.gains.snare); o.connect(og).connect(this.gains.snare);
    n.start(t, Math.random() * 0.5); o.start(t); this.track(n, t + 0.19); this.track(o, t + 0.12);
  }

  private hat(t: number, vel: number, dur: number, l: Layer = 'hat') {
    const c = this.c;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = l === 'shaker' ? 'bandpass' : 'highpass'; hp.frequency.value = l === 'shaker' ? 5500 : 7500;
    const g = c.createGain(); g.gain.setValueAtTime(0.08 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp).connect(g).connect(this.gains[l]);
    n.start(t, Math.random() * 0.5); this.track(n, t + dur + 0.01);
  }

  // ---- stings ----
  private stingBus(t: number, len: number) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(1.4, t); g.gain.setValueAtTime(1.4, t + len - 0.5); g.gain.linearRampToValueAtTime(0, t + len + 0.4);
    g.connect(this.out);
    return g;
  }

  /** Title sting (2 bars): the hook's opening on the bell over a swelling Dm pad, landing on a held D. */
  introSting(t: number): number {
    const len = BAR * 2;
    const bus = this.stingBus(t, len);
    const padG = this.c.createGain(); padG.gain.value = 0.6; padG.connect(bus);
    for (const m of [50, 57, 62, 65]) this.padTo(t, hz(m), len, padG);
    for (const [s, m, l] of HOOK_BARS[0].slice(0, 4)) this.bell(t + s * STEP, hz(m), STEP * l, bus);
    this.bell(t + 8 * STEP, hz(74), STEP * 12, bus);
    this.bell(t + 16 * STEP, hz(81), STEP * 10, bus);
    this.bell(t + 16 * STEP, hz(74), STEP * 14, bus);
    return len;
  }

  /** Results sting (2 bars): the hook's tail rising to a D major chord (win) or settling down onto Bb → Dm. */
  resultSting(t: number, won: boolean): number {
    const len = BAR * 2;
    const bus = this.stingBus(t, len);
    const padG = this.c.createGain(); padG.gain.value = 0.6; padG.connect(bus);
    const line: Note[] = won
      ? [[0, 74, 2], [2, 76, 2], [4, 77, 2], [6, 79, 2], [8, 81, 4], [12, 78, 4], [16, 86, 14]]
      : [[0, 74, 3], [3, 72, 1], [4, 69, 4], [8, 67, 4], [12, 65, 4], [16, 62, 14]];
    for (const [s, m, l] of line) this.bell(t + s * STEP, hz(m), STEP * l, bus);
    const first = won ? [46, 58, 62, 65] : [46, 58, 62, 65];
    const last = won ? [50, 57, 62, 66] : [50, 57, 62, 65];
    for (const m of first) this.padTo(t, hz(m), BAR + 0.3, padG);
    for (const m of last) this.padTo(t + BAR, hz(m), BAR, padG);
    return len;
  }

  private padTo(t: number, f: number, dur: number, dest: AudioNode) {
    const c = this.c;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.7);
    const g = c.createGain(); this.env(g.gain, t, 0.35, 0.05, dur, 0.5);
    for (const [type, det] of [['sawtooth', -6], ['triangle', 7]] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); this.track(o, t + dur + 0.05);
    }
    lp.connect(g).connect(dest);
  }

  /** Note sources not yet ended (for tests). */
  get liveSources() { return this.sources.size; }
  /** Song position in bars at time t (for tests and seam checks). */
  barAt(t: number) { return (t - this.songStart) / BAR; }
}
