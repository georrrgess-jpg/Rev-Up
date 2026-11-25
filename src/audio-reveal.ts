// Per-car signature flourish for the unveil, layered over the engine voice (sfx.rev). Owned by the art workstream.
// Uses the shared synth helpers, so mute and the lazy AudioContext behave like every other sound.
import { noise, tone } from './audio';

/** A short sound that only this car makes: pops, a turbo flutter, an electric whine… */
export function signature(id: string) {
  switch (id) {
    case 'junker': // a cough and two backfires
      noise(0.08, 0.3, 0.35, 500, 'lowpass'); noise(0.06, 0.35, 1.25, 700, 'lowpass'); noise(0.05, 0.3, 1.45, 900, 'lowpass');
      break;
    case 'beater': // a polite double blip
      tone(180, 0.12, 'triangle', 0.06, 1.3, 260); tone(180, 0.12, 'triangle', 0.06, 1.5, 240);
      break;
    case 'hothatch': // turbo flutter on the lift
      for (let k = 0; k < 5; k++) noise(0.03, 0.12, 0.55 + k * 0.045, 3200, 'bandpass');
      break;
    case 'muscle': // deep burble crackle on the overrun
      for (let k = 0; k < 4; k++) noise(0.05, 0.22, 1.25 + k * 0.11, 380, 'lowpass');
      break;
    case 'tourer': // a smooth rising chord as the V12 settles
      tone(220, 0.9, 'sine', 0.035, 1.0, 330); tone(277, 0.9, 'sine', 0.03, 1.05, 415);
      break;
    case 'tuner': // the cam crossover: a sudden higher edge near the top
      tone(900, 0.25, 'square', 0.025, 0.3, 1500);
      break;
    case 'super': // electric whine under the engine
      tone(700, 1.4, 'sine', 0.05, 0.05, 2600);
      break;
    case 'rally': // anti-lag bangs and a turbo whistle
      tone(1800, 0.9, 'sine', 0.025, 0.1, 3200);
      for (const t of [0.6, 0.72, 1.3, 1.38, 1.55]) noise(0.05, 0.32, t, 1100, 'lowpass');
      break;
    case 'gt': // three quick upshift cuts with crackle
      for (const t of [0.4, 0.75, 1.05]) noise(0.04, 0.25, t, 900, 'bandpass');
      tone(140, 0.08, 'sawtooth', 0.05, 1.5, 90);
      break;
    case 'proto': // turbine whoosh and a rising hybrid whine
      tone(320, 1.5, 'sine', 0.05, 0, 3400);
      noise(0.9, 0.12, 0.2, 2600, 'bandpass');
      break;
  }
}
