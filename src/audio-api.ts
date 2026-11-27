// Master update audio contract (owned by the Audio workstream; other screens import only from here).
// Starts as no-op stubs so callers compile before the audio work lands; the Audio agent replaces the bodies.
import type { CarId } from './data/tables';

export type MusicScene = 'intro' | 'garage' | 'race' | 'results' | 'off';

/** Original soundtrack: one hook shared by every arrangement; scenes cross-fade on the same tempo grid. */
export const music = {
  /** Switch arrangement (cross-fades; calling with the current scene is a no-op). */
  play(_scene: MusicScene) {},
  /** Race layer intensity 0..1 (e.g. from position / final lap / nitro). */
  setIntensity(_x: number) {},
  stop() {},
};

/** 0..1 bus volumes, persisted by the caller in settings (musicVol / sfxVol). */
export function setMusicVolume(_v: number) {}
export function setSfxVolume(_v: number) {}

/** Mechanic Shop: a short rev of this car with an engine of the given tier/quality (upgraded engines sound different). */
export function previewEngine(_car: CarId, _engineTier: number, _opts?: { seconds?: number; quality?: 'std' | 'polished' | 'mint' }) {}
export function stopPreview() {}

/** Title intro: key, starter, catch, a short blip of revs. */
export function ignitionCue(_car: CarId) {}
