// Master update audio contract (owned by the Audio workstream; other screens import only from here).
// Everything is synthesized at runtime: no downloads, works offline. Sound starts only after a user gesture
// (unlockAudio in app.ts); calls made before that are remembered (the music scene) or ignored (one-shots).
import type { CarId } from './data/tables';
import { busVolumes, isMuted, live, newEngine, noise, onAudioReady, setBusVolumes, setMuted, tone, unlockAudio } from './audio';
import { runScript, showcaseRev, type EngineVoice, type PartLike, type PartQuality } from './audio-engine';
import { MusicPlayer, type MusicScene } from './audio-music';

export type { MusicScene } from './audio-music';

let player: MusicPlayer | null = null;
let pending: { scene: MusicScene; won?: boolean } | null = null;
let intensity = 0.4;
const sceneLog: string[] = [];

function ensurePlayer(): MusicPlayer | null {
  if (player) return player;
  const l = live();
  if (!l) return null;
  player = new MusicPlayer(l.ctx, l.mix.music, l.noise);
  // lookahead scheduler: ~50 ms ticks, 0.3 s ahead (a hidden tab's context is suspended, so nothing piles up)
  window.setInterval(() => {
    const p = player;
    const c = live()?.ctx;
    if (!p || !c || c.state !== 'running') return;
    p.enabled = !isMuted();
    p.scheduleUntil(c.currentTime + 0.3);
  }, 50);
  return player;
}

onAudioReady(() => {
  if (!pending) return;
  const p = ensurePlayer();
  if (p) { p.setIntensity(intensity); p.play(pending.scene, undefined, { won: pending.won }); }
  pending = null;
});

/** Original soundtrack: one hook shared by every arrangement; scenes cross-fade on the same tempo grid. */
export const music = {
  /** Switch arrangement (cross-fades; calling with the current scene is a no-op). `won` picks the results sting. */
  play(scene: MusicScene, opts: { won?: boolean } = {}) {
    if (import.meta.env.DEV) sceneLog.push(scene);
    const p = ensurePlayer();
    if (!p) { pending = { scene, won: opts.won }; return; }
    p.play(scene, undefined, opts);
  },
  /** Race layer intensity 0..1 (e.g. from position / final lap / nitro). */
  setIntensity(x: number) {
    if (!Number.isFinite(x)) return;
    intensity = Math.max(0, Math.min(1, x));
    player?.setIntensity(intensity);
  },
  stop() { pending = null; player?.stop(); },
  /** The current scene ('off' before sound is unlocked). */
  get scene(): MusicScene { return player?.scene ?? pending?.scene ?? 'off'; },
};

/** 0..1 bus volumes, persisted by the caller in settings (musicVol / sfxVol). */
export function setMusicVolume(v: number) { setBusVolumes(v, undefined); }
export function setSfxVolume(v: number) { setBusVolumes(undefined, v); }
export const getVolumes = busVolumes;

/** Apply saved settings at start-up (mute, music and effects volume). */
export function applyAudioSettings(s: { muted: boolean; musicVol?: number; sfxVol?: number }) {
  setBusVolumes(s.musicVol ?? 0.7, s.sfxVol ?? 1);
  setMuted(s.muted);
}

let preview: EngineVoice | null = null;

/**
 * Mechanic Shop: a short rev of this car with an engine of the given tier/quality (upgraded engines sound different:
 * more harmonics, cam lope, crackle; a fitted turbo whistles). Tier 0 = stock. Returns the rev's length in seconds.
 */
export function previewEngine(car: CarId, engineTier: number, opts: { seconds?: number; quality?: PartQuality; turboTier?: number } = {}): number {
  unlockAudio(); // called from a tap: this is a user gesture
  stopPreview();
  const engine: PartLike | null = engineTier > 0 ? { t: engineTier, q: opts.quality ?? 'std' } : null;
  const turbo: PartLike | null = opts.turboTier && opts.turboTier > 0 ? { t: opts.turboTier } : null;
  const v = newEngine(car, engine, turbo);
  if (!v) return 0;
  const seconds = Math.max(1.2, Math.min(6, opts.seconds ?? 2.6));
  const t = v.c.currentTime + 0.03;
  v.start(t);
  const end = runScript(v, t, showcaseRev(seconds));
  v.stop(end, 0.3);
  preview = v;
  return seconds;
}
export function stopPreview() { preview?.stop(undefined, 0.12); preview = null; }

/** Title intro: key, starter, catch, a short blip of revs, then settle and switch off (~3.4 s). */
export function ignitionCue(car: CarId, engine?: PartLike | null) {
  unlockAudio(); // the title's tap is the gesture
  const v = newEngine(car, engine);
  if (!v) return;
  // key click and the starter cranking (each crank a chug: a low pulse and a whirr)
  tone(2400, 0.02, 'square', 0.05); noise(0.03, 0.12, 0.01, 3000, 'highpass');
  for (let k = 0; k < 6; k++) { noise(0.07, 0.16, 0.18 + k * 0.095, 380, 'lowpass'); tone(85, 0.07, 'sawtooth', 0.05, 0.18 + k * 0.095, 70); }
  tone(320, 0.6, 'square', 0.015, 0.16, 360);
  const t = v.c.currentTime + 0.78; // the catch
  v.start(t);
  const end = runScript(v, t, [[0, 0.32, 1], [0.12, 0.38, 0.6], [0.5, 0.05, 0.1], [1.0, 0.0, 0.1], [1.1, 0.48, 1], [1.28, 0.2, 0], [1.6, 0.02, 0.1], [2.5, 0, 0.1]]);
  v.stop(end, 0.4);
}

// dev-only probe for the browser checks (stripped from production builds)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void import('./audio').then((A) => {
    (window as unknown as { __revAudio?: unknown }).__revAudio = () => {
      const l = A.live();
      return { ctx: l ? l.ctx.state : 'none', scene: music.scene, engines: A.liveEngineCount(), vols: A.busVolumes(), muted: A.isMuted(), musicNotes: player?.liveSources ?? 0, log: sceneLog.slice(-6), pscene: player?.scene };
    };
  });
}
