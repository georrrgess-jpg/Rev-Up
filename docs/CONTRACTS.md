# Rev Up — Garage and Racing Overhaul: shared contracts

The lead integrates in stages. **Every file has exactly one owner.** Edit only files you own (plus new files you
create inside your area). If you need a change in someone else's file, do not make it: write it under
"Requests to other workstreams" in your final report, and the lead will route it.

## Stages

1. **Stage 1 (parallel):** A Garage systems · B Mobile UX · C Race gameplay · E Vehicle and scene art.
2. **Stage 2:** D Progression and economy (new cars' stats and unlock path, events, rival difficulty with
   timed shifting, cash rounding), after stage 1 is merged — it balances against the real install and shift rules.
3. **Integration and review:** lead merges, an independent review agent audits, lead fixes and publishes.

## File ownership

| Owner | Files |
| --- | --- |
| **Lead** | `src/core/state.ts`, `src/core/save.ts`, `src/core/game.ts`, `src/core/events.ts`, `src/core/units.ts`, `src/main.ts`, `docs/CONTRACTS.md`, `vite.config.ts`, `scripts/*`, `tests/migration-v2.test.ts` |
| **A Garage systems** | `src/core/install.ts`, `src/core/board.ts`, `src/core/loadout.ts`, `src/render/parts.ts`, `src/ui/garage.ts`, `src/ui/fit.ts`, `src/ui/css/garage.css`, new `src/audio-garage.ts`, `tests/board.test.ts`, new `tests/install.test.ts` |
| **B Mobile UX** | `src/ui/app.ts`, `src/ui/shop.ts`, `src/ui/raceMenu.ts`, `src/ui/results.ts`, `src/ui/goalCard.ts`, `src/ui/coach.ts`, `src/ui/guide.ts`, `src/ui/settings.ts`, `src/ui/offline.ts`, `src/ui/dom.ts`, `src/ui/style.css`, `src/core/tutorial.ts`, `tests/tutorial.test.ts` |
| **C Race gameplay** | `src/core/race.ts`, new `src/data/drivetrain.ts`, `src/ui/raceScreen.ts`, `src/audio.ts`, `src/ui/css/race-hud.css`, `tests/race.test.ts`, new `tests/shift.test.ts`, new `tests/probe-shift.test.ts` |
| **D Progression and economy** (stage 2) | `src/data/tables.ts`, `src/core/progression.ts`, `src/core/style.ts`, `tests/bot.ts`, `tests/progression.test.ts`, `tests/economy.test.ts`, `tests/chapter.test.ts`, `tests/downtown.test.ts`, `tests/playthrough.test.ts`, `tests/economy-audit.test.ts`, `tests/probe-downtown.test.ts`, `src/dev.ts` |
| **E Vehicle and scene art** | `src/render/car.ts`, `src/render/scene.ts`, `src/ui/reveal.ts`, `src/ui/showroom.ts`, `src/audio-voices.ts`, `src/ui/css/art.css`, `art.html` |

CSS: `style.css` is B's. Each other workstream styles its own UI in its own file under `src/ui/css/` (loaded after
`style.css`); to change how an existing shared rule looks in your UI, override it in your file with a more specific
selector — never edit `style.css`.

## Save schema v2 (implemented by the lead; read-only for everyone else)

- `SAVE_VERSION = 2`. v1 saves migrate on load (`state.migrate` → `install.installLegacyLoadout`): the parts v1
  auto-equipped on the **active car** are fitted to it, so its build is unchanged and the parts leave the bench.
  Other cars start with empty slots. Part ids, `crafted` (keystone credit), balances, finishes and records are untouched.
- `installed: Partial<Record<CarId, Partial<Record<Family, Part>>>>` — parts fitted to each car, one per family.
  **Every part has exactly one location:** a board cell, a spare-rack (tray) cell, or one car's slot. `allParts()`
  (bench) excludes fitted parts; fitted parts cannot be merged or scrapped.
- `mastery: Partial<Record<CarId, CarMastery>>` — per-car races, wins, podiums, best time per event, Perfects,
  shifts (clean / total) and top speed (m/s). Written by `progression.recordMastery` on every live race.
- `LeanOutcome` gains optional `shifts`, `shiftsClean`, `topSpeed` (m/s): **C fills them** from the sim.
- Validation counts fitted parts in the unique-id check.

## Fit Parts API (`src/core/install.ts`, A owns; lead wrote the first version)

- `installPart(s, car, from: SlotRef)` — fit the part at `from`; any part already in that slot **swaps** into
  `from` (atomic, never needs space). Event `install`.
- `removePart(s, car, family)` — needs a free cell; if none, **nothing changes** and the reason says how to make
  room. Event `uninstall`.
- `movePartBetweenCars(s, fromCar, family, toCar)` — atomic swap between two cars' slots. Event `move-fit`.
- `recommendedFit(s, car)` / `fitRecommended(s, car)` — best part per family by contribution at the car's cap;
  bench parts first, another car's fitted part only when strictly better; ties keep what is fitted.
- `computeLoadout(s, car, exclude?, partCap?)` reads **fitted parts only**. Parts above a car's cap fit but run at
  the cap tier (`contributionOn`).
- Game methods (lead): `installPart`, `removePart`, `movePartBetweenCars`, `fitRecommended`.
- UI entry point other workstreams call: `openFitParts(app, car?)` exported from `src/ui/fit.ts`.
- The simulation bot calls `fitRecommended` before each race (stage-2 owner keeps this).

## Units and money

- The sim works in **metres and m/s**. Players see **mph**: use `mph()` from `src/core/units.ts` (× 2.23694), the
  only conversion. No km/h anywhere in the UI. Engine RPM is separate from speed (C).
- Cash amounts shown and paid must agree and land on sensible steps (D implements in stage 2): $5 steps up to $100,
  $10 up to $1,000, $50 above. Round in the tuning tables and transaction rules, never only in the display.

## Roster contract (names are final; D sets stats in stage 2, E draws, C gears)

| id | Model | Class | Identity |
| --- | --- | --- | --- |
| junker | Tapeback 1.1 | Junker | taped-up starter hatch |
| beater | Corsa Rojo | Beater | 4-door sedan |
| hothatch | Vexa GTi | Hot hatch | lowered hot hatch |
| muscle | Ironhorse 455 | Muscle | long-hood coupe |
| tourer | Altamar GT | Grand tourer | coastal GT |
| tuner | Kestrel 1600 | Lightweight | stripped city coupe |
| super | Lumen RS | Hypercar | light-bar hybrid hypercar |
| **rally** | **Corvo Rally** | **Rally** | AWD rally coupe: roof scoop, light pod, mud flaps, gravel launches and loose bends |
| **gt** | **Strata GTR** | **Endurance GT** | wide GT racer: splitter, swan-neck wing, race numbers; fast corners |
| **proto** | **Halcyon X** | **Prototype** | endgame closed-cockpit prototype: shark fin, light blade, the hardest car to master |

- New top tier: **T9** (Prototype cap). Part art, merge feedback and engine sound must read T1–T9 (A).
- Believable top speeds at full build on a suitable track (C tunes the sim, D the stats): Tapeback ~85 mph,
  Corsa ~105, Vexa ~130, Ironhorse ~150, Altamar ~165, Kestrel ~140, Lumen ~205, Corvo ~150 (quick to it),
  Strata ~190, Halcyon ~225. Gauge ranges grow with the car.
- New track themes for the endgame: `'desert'` (rally canyon) and `'summit'` (mountain circuit / grand finale).
  E draws them in `scene.ts` (keyed by theme; optional landmarks keyed by track id); D adds the tracks and events.

## Timed shifting (C)

- Gears and tach per car in `src/data/drivetrain.ts` (every roster id). Shift has its own thumb control and a
  readable timing cue; clean shift ≈ today's acceleration, early/late costs some momentum, and an automatic
  fallback shifts on the limiter with a penalty so a missed input never stalls. The tutorial race staggers the
  first shift cue and the first nitro zone.
- `RaceSetup`/`RaceSim` keep working for Quick Race (auto-shift, ordinary quality) and for the bot (policy flag).
- C provides a deterministic comparison harness (same build and rivals; missed / ordinary / clean shifts × nitro)
  so D can tune difficulty in stage 2. C does **not** change rival stats or events (D's tables).

## Rules for every agent

- Work only in your worktree on your own branch; commit in small steps with clear messages; do not push.
- Before you finish: `npx tsc --noEmit` and `npx vitest run` must pass (fix tests you own; if a test you don't own
  breaks because of your change, say so in your report rather than editing it).
- Keep mute, reduced motion, low effects, safe areas, 44 px targets, mph, and offline play working.
- Report: what you shipped (by requirement), screenshots you took (paths), test results, known gaps, and
  "Requests to other workstreams".
