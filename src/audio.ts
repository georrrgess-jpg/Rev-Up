import { EngineVoice, resolveEngine, runScript, showcaseRev, type PartLike } from './audio-engine';
// Synthesized sound (no audio files to download). The AudioContext is created lazily on the first user gesture so
// the initial load stays focused on the first merge.
//
// Mix:  effects bus ─┐
//       engine bus (ducked under timing cues, notched at the cue pitch) → effects bus
//       music bus ───┴→ master (mute) → limiter (compressor) → speakers
// The context suspends while the page is hidden and resumes when it returns (unless a paused race holds it).

/** A built mix: used live, and by tests rendering offline. */
export interface Mixer {
  master: GainNode;
  limiter: DynamicsCompressorNode;
  sfx: GainNode;
  music: GainNode;
  engine: GainNode;
  /** Dip the engine (and a little of the music) so a timing cue cuts through. */
  duck(t: number, depth?: number, hold?: number): void;
}

/** Bus gain at 100 % (the sliders scale these). */
export const LEVELS = { sfx: 0.6, music: 0.42 };
/** Perceptual slider law: 0..1 → gain. */
export const volCurve = (v: number) => (v <= 0 ? 0 : Math.min(1, v) ** 1.7);

export function buildMixer(c: BaseAudioContext, dest: AudioNode = c.destination): Mixer {
  const master = c.createGain();
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  const post = c.createGain();
  post.gain.value = 0.92;
  master.connect(limiter).connect(post).connect(dest);
  const sfx = c.createGain(); sfx.gain.value = LEVELS.sfx; sfx.connect(master);
  const music = c.createGain(); music.gain.value = LEVELS.music * volCurve(0.7);
  const duckMusic = c.createGain(); // music → duck → master (music.gain stays the user's volume)
  music.connect(duckMusic).connect(master);
  const engine = c.createGain();
  // leave a hole where the shift light / boost-zone beeps sit (988–1320 Hz)
  const notch = c.createBiquadFilter(); notch.type = 'peaking'; notch.frequency.value = 1150; notch.Q.value = 1.0; notch.gain.value = -10;
  // and no sub-bass a phone speaker cannot play (it would only make the limiter pump)
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75; hp.Q.value = 0.7;
  engine.connect(hp).connect(notch).connect(sfx);
  const duck = (t: number, depth = 0.45, hold = 0.16) => {
    for (const [g, d] of [[engine.gain, depth], [duckMusic.gain, 0.7]] as const) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(d, t, 0.008);
      g.setTargetAtTime(1, t + hold, 0.07);
    }
  };
  return { master, limiter, sfx, music, engine, duck };
}

export function makeNoise(c: BaseAudioContext, seconds = 1): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

let ctx: AudioContext | null = null;
let mix: Mixer | null = null;
let muted = false;
let musicVol = 0.7;
let sfxVol = 1;
let noiseBuf: AudioBuffer | null = null;
/** A paused race holds the context suspended; returning to the page must not resume it. */
let held = false;
const readyHooks: (() => void)[] = [];
const voices = new Set<EngineVoice>();

/** Live context and buses once sound is unlocked (null before the first gesture). */
export function live(): { ctx: AudioContext; mix: Mixer; noise: AudioBuffer } | null {
  return ctx && mix && noiseBuf ? { ctx, mix, noise: noiseBuf } : null;
}
/** Run fn once the context exists (immediately if it already does). */
export function onAudioReady(fn: () => void) { if (ctx) fn(); else readyHooks.push(fn); }
export const isMuted = () => muted;

function applyBusGains() {
  if (!ctx || !mix) return;
  const t = ctx.currentTime;
  mix.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.02);
  mix.sfx.gain.setTargetAtTime(LEVELS.sfx * volCurve(sfxVol), t, 0.03);
  mix.music.gain.setTargetAtTime(LEVELS.music * volCurve(musicVol), t, 0.05);
}

export function setMuted(m: boolean) { muted = m; applyBusGains(); }
export function setBusVolumes(music?: number, effects?: number) {
  if (music !== undefined && Number.isFinite(music)) musicVol = Math.max(0, Math.min(1, music));
  if (effects !== undefined && Number.isFinite(effects)) sfxVol = Math.max(0, Math.min(1, effects));
  applyBusGains();
}
export const busVolumes = () => ({ music: musicVol, effects: sfxVol });

export function unlockAudio() {
  if (ctx) {
    if (ctx.state !== 'running' && !held && !document.hidden) void ctx.resume().catch(() => undefined);
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch { return; }
  mix = buildMixer(ctx);
  noiseBuf = makeNoise(ctx);
  applyBusGains();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else if (!held) void ctx.resume().catch(() => undefined);
  });
  window.addEventListener('pagehide', () => { stopAllEngines(); void ctx?.suspend().catch(() => undefined); });
  window.addEventListener('pageshow', () => { if (ctx && !held && !document.hidden) void ctx.resume().catch(() => undefined); });
  // watchdog: an engine nobody drives any more (a screen that crashed or forgot to stop it) fades out
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    for (const v of voices) if (v.watched && ctx.currentTime - v.lastSet > 1.5) v.stop(ctx.currentTime, 0.4);
  }, 500);
  for (const fn of readyHooks.splice(0)) { try { fn(); } catch { /* a hook failing never blocks sound */ } }
}

/** Pause (a paused race): everything stops where it is until resumeAudio(). */
export function suspendAudio() { held = true; if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined); }
export function resumeAudio() { held = false; if (ctx && ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => undefined); }

/** A new engine voice on the engine bus (null when sound is locked or muted). */
export function newEngine(car: string, engine?: PartLike | null, turbo?: PartLike | null): EngineVoice | null {
  if (!ctx || !mix || !noiseBuf || muted) return null;
  const v = new EngineVoice(ctx, mix.engine, noiseBuf, resolveEngine(car, engine, turbo));
  voices.add(v);
  v.onStop = () => setTimeout(() => voices.delete(v), 1000);
  return v;
}
export function stopAllEngines() { if (ctx) for (const v of voices) v.stop(ctx.currentTime, 0.1); }
export const liveEngineCount = () => [...voices].filter((v) => !v.stopped).length;
/** Duck the engine under a timing cue. */
export function duckEngine(depth?: number, hold?: number) { if (ctx && mix) mix.duck(ctx.currentTime, depth, hold); }

function dest(): AudioNode | null { return mix ? mix.sfx : null; }

export function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, when = 0, slideTo?: number) {
  const d = dest();
  if (!ctx || !d || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(d);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function noise(dur: number, vol = 0.2, when = 0, filterFreq = 2000, type: BiquadFilterType = 'bandpass') {
  const d = dest();
  if (!ctx || !d || !noiseBuf || muted) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(d);
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
  /** An upshift: a crisp clack when clean, a heavier clunk early or late, a buzz when the box had to shift itself. */
  shift(grade: string) {
    if (grade === 'clean' || grade === 'assist') { noise(0.05, 0.16, 0, 3200, 'highpass'); tone(660, 0.05, 'triangle', 0.07, 0.01); }
    else if (grade === 'missed') { tone(110, 0.18, 'sawtooth', 0.09, 0, 80); noise(0.12, 0.18, 0, 500, 'lowpass'); }
    else { noise(0.09, 0.2, 0, 900, 'bandpass'); tone(200, 0.08, 'square', 0.05, 0.01, 150); }
  },
  /** The shift light reaches the green band (cue for players who listen rather than look): the engine ducks under it. */
  shiftCue() { duckEngine(0.3, 0.1); tone(1320, 0.07, 'sine', 0.14); },
  windowCue() { duckEngine(0.35, 0.2); tone(988, 0.06, 'sine', 0.12); tone(988, 0.06, 'sine', 0.12, 0.1); },
  countdown(go: boolean) { duckEngine(0.5, go ? 0.3 : 0.14); tone(go ? 880 : 440, go ? 0.3 : 0.12, 'square', 0.1); },
  cash() { tone(1400, 0.05, 'triangle', 0.08); tone(1800, 0.08, 'triangle', 0.08, 0.05); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.09)); },
  lose() { tone(392, 0.2, 'triangle', 0.1); tone(330, 0.3, 'triangle', 0.1, 0.15); },
  cloth() { noise(0.5, 0.25, 0, 900, 'lowpass'); },
  /** Focused light cue for the reveal: a relay clunk and a short warm hum. */
  spot() { noise(0.06, 0.35, 0, 1800, 'bandpass'); tone(110, 0.5, 'sine', 0.08, 0.02); tone(220, 0.35, 'sine', 0.04, 0.03); },
  /** The car's own engine on reveal (stock voice): a blip, a long pull, a lift with crackle. */
  rev(_base: number, _peak: number, id = 'muscle') {
    const v = newEngine(id);
    if (!v || !ctx) return;
    const t = ctx.currentTime + 0.02;
    v.start(t);
    const end = runScript(v, t, showcaseRev(2.2));
    v.stop(end, 0.35);
  },
};

/**
 * Continuous engine for the race (kept for callers of the old API; RaceAudio in audio-race.ts is the full version).
 * `rpmFrac` is engine speed as a fraction of the redline. A shift (`cut`) lifts the throttle; the limiter stutters.
 */
export class EngineHum {
  private v: EngineVoice | null = null;
  constructor(_idle = 50, _redline = 190, private voice = 'muscle', private engine?: PartLike | null, private turbo?: PartLike | null) {}
  start() {
    if (this.v) return;
    this.v = newEngine(this.voice, this.engine, this.turbo);
    if (!this.v) return;
    this.v.watched = true;
    this.v.start();
  }
  set(rpmFrac: number, boost: boolean, cut = false, limiter = false, gear?: number, slip = 0) {
    if (!this.v || this.v.stopped) return;
    this.v.set({ frac: rpmFrac, throttle: cut ? 0 : 1, nitro: boost, limiter, gear, slip });
  }
  stop() { this.v?.stop(undefined, 0.25); this.v = null; }
}
