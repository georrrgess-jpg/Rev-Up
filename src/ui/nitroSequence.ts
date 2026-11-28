// The nitro sequence's pure side (Redline): per-car nitro style, and the boost envelope / beat read from the sim's own
// boost state. Shared by the race effects (src/render/nitroFx.ts) and the race sound (src/audio-race.ts), so the
// picture and the sound start, peak and end on the same sim steps. No DOM here (unit-tested).
import { RACE } from '../data/tables';
import type { RaceSim } from '../core/race';

export type NitroFamily = 'flame' | 'trail' | 'arcs';
export type NitroSoundKind = 'roar' | 'jet' | 'whine';

export interface NitroStyle {
  family: NitroFamily;
  /** Ordinary boost light colour (road pool, rim light, pilot, streak tint). */
  glow: [number, number, number];
  sound: NitroSoundKind;
  /** Sustain pitch scale (a big V8 roars low, a screaming four high). */
  pitch: number;
}

const BLUE: [number, number, number] = [127, 200, 255];
/** Perfect boosts all shift to the same gold-white (the colour of the PERFECT call), so a Perfect reads at a glance. */
export const PERFECT_GLOW: [number, number, number] = [255, 214, 94];

export const NITRO_STYLE: Record<string, NitroStyle> = {
  junker: { family: 'flame', glow: BLUE, sound: 'roar', pitch: 0.8 },
  beater: { family: 'flame', glow: BLUE, sound: 'roar', pitch: 0.85 },
  hothatch: { family: 'flame', glow: BLUE, sound: 'roar', pitch: 1.2 },
  muscle: { family: 'flame', glow: [140, 190, 255], sound: 'roar', pitch: 0.65 },
  tourer: { family: 'flame', glow: BLUE, sound: 'roar', pitch: 0.9 },
  tuner: { family: 'flame', glow: BLUE, sound: 'roar', pitch: 1.25 },
  rally: { family: 'flame', glow: [255, 170, 90], sound: 'roar', pitch: 1.05 },
  gt: { family: 'flame', glow: [255, 150, 80], sound: 'roar', pitch: 1 },
  vireo: { family: 'flame', glow: [110, 170, 255], sound: 'roar', pitch: 1.35 },
  mako: { family: 'flame', glow: [255, 190, 60], sound: 'roar', pitch: 0.9 },
  ardent: { family: 'flame', glow: [255, 170, 60], sound: 'roar', pitch: 1.4 },
  meridian: { family: 'flame', glow: [120, 175, 255], sound: 'roar', pitch: 0.7 },
  super: { family: 'trail', glow: [190, 140, 255], sound: 'jet', pitch: 1 },
  proto: { family: 'trail', glow: [90, 255, 230], sound: 'jet', pitch: 1.15 },
  sovereign: { family: 'trail', glow: [255, 214, 160], sound: 'jet', pitch: 0.85 },
  tempest: { family: 'arcs', glow: [94, 242, 255], sound: 'whine', pitch: 1 },
};
export const nitroStyleOf = (car: string): NitroStyle => NITRO_STYLE[car] ?? NITRO_STYLE.beater;

/** Seconds at the end of a boost over which everything fades (part of the boost itself: the sim decides when). */
export const SETTLE_S = 0.4;
/** Seconds of ignition at the start of a boost (the bloom and the camera surge peak here). */
export const IGNITE_S = 0.22;
/** Seconds a boost cut short by the finish line takes to settle (the sim lifts the throttle at the line). */
export const FINISH_SETTLE_S = 0.25;

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** 0..1 boost strength from the sim's boost clock: on at once, full through the boost, easing to 0 exactly at its end. */
export function nitroEnvelope(nitroLeft: number, duration = RACE.nitroDurationS): number {
  if (!(nitroLeft > 0)) return 0;
  const up = Math.min(1, (duration - nitroLeft) / 0.05 + 0.6); // 60% on the very first frame, full in 50 ms
  return up * smooth(nitroLeft / SETTLE_S);
}
/** 1 → 0 over the first IGNITE_S of a boost (0 outside it). */
export function nitroIgnition(nitroLeft: number, duration = RACE.nitroDurationS): number {
  if (!(nitroLeft > 0)) return 0;
  const el = duration - nitroLeft;
  return el < IGNITE_S ? 1 - el / IGNITE_S : 0;
}

/** The beat the player's nitro is in this frame. */
export type NitroBeat = 'idle' | 'ready' | 'fire' | 'settle';
export function nitroBeat(sim: RaceSim): NitroBeat {
  const p = sim.player;
  if (p.nitroLeft > 0 && p.finishTime === null) return p.nitroLeft > SETTLE_S ? 'fire' : 'settle';
  return nitroReadiness(sim) > 0 ? 'ready' : 'idle';
}
/** 0..1 how close the next usable boost zone is (1 inside an unused zone), 0 with no charge or while boosting. */
export function nitroReadiness(sim: RaceSim): number {
  const p = sim.player;
  if (sim.charges <= 0 || p.nitroLeft > 0 || p.finishTime !== null) return 0;
  const { active, next } = sim.windowState();
  if (active && !sim.usedWindows.has(active.segIndex)) return 1;
  if (active || !next || p.v <= 1) return 0;
  const eta = (next.start - p.x) / p.v;
  return eta < 2.2 ? 1 - eta / 2.2 : 0;
}

