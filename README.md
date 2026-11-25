# Rev Up

An original, portrait-first, installable mobile web game. Merge parts on a workbench, race for cash and reputation, and fill a showroom one earned car at a time — from a taped-up scrapyard hatchback (the **Junker**) to a restored muscle coupe (the **Muscle**) and, past the finale, a coastal grand tourer (the **Altamar GT**).

- **Play:** https://georrrgess-jpg.github.io/Rev-Up/ (once GitHub Pages is enabled — see [Publishing](#publishing))
- **Stack:** TypeScript + Vite, DOM/CSS for menus and the board, Canvas 2D for the race, reveal and car art, synthesized WebAudio. No backend, no account, no runtime dependencies.
- **Size:** ~60 KB JS + 9 KB CSS gzipped, plus one bundled typeface (Barlow, three weights, ~68 KB woff2, SIL OFL); all art is drawn in code (no image downloads except the app icons).

## Update 1.3 · Open Road

Built from a fresh-save and returning-save replay of 1.2 and three independent reviews (first-time usability, race feel, mobile visual QA); 35 findings, all addressed below or listed under Known limitations.

- **Open Road chapter (after the Ironhorse).** The **Coastal Highway** opens with three new tracks that race differently — **Harbor Launch** (a long launch and two straights: Turbo), **Cliffside Esses** (three tight bends: Tires), **Coastal Crown** (two long highway runs and a fast sweeper: Engine). The three rounds are a staged rival series that ends with **Vale Moreau** in the Coastal Crown (Crown Teal blueprint, “Coastal Crown” badge, $600, 5 crates). The marquee reward is a new class and silhouette: the **Altamar GT** grand tourer (cap **T6**; 5,600 Rep + a crafted T6 Engine + the Coastal Crown).
- **Earlier cars come back.** **Class meets** race one earlier car only: the **Corsa Club Run** (Corsa Rojo) and **Hatch Attack** (Vexa GTi), each awarding a Showroom trophy. Parts above a car’s cap now **run at the cap tier** instead of being unusable, so an older car still benefits from your current bench.
- **Time attacks.** Three solo runs (Strip, Highway and Esses Time Attacks) with Bronze/Silver/Gold targets; each medal pays once ($120 / $240 / $450 plus crates aimed at your current craft) and the result names the next target and the gap.
- **Collection.** The Showroom leads with a collection card (cars, finishes, medals, trophies, badges), the next unlock stays on the Garage goal card with its requirement chips, and the Race tab groups events by district with round, class-meet, solo and trophy tags. No prices were inflated and there are no daily check-ins.
- **Teach through play.** A short coach-mark sequence, derived purely from save state (so it resumes after a reload and never repeats finished steps): first merge → first race (wider practice nitro windows) → craft toward the next car → spend → goal card, then one-time tips for nitro banking, the overflow tray, the scrap press, Merge All and equip caps. **Skip tips** turns them off; **How to play** (the “?” button) holds the legend, glossary and **Show tips again**. Existing saves open at their progress with no beginner prompts.
- **Races that feel different.** The finish is shown: the result is committed the moment you cross (an off-screen copy finishes the race), while the visible race runs on for 1.6 s and the clock freezes at your time. The camera frames you with the nearest rival and looks ahead before a window; overtakes are called out (“Passed Dex · 2nd”). The nitro button counts down to each window with a ring and “WINDOW IN 1.2 s”. A **Perfect** boost gets a gold flash, gold speed lines and a camera surge, and every boost reports what it actually gained against a no-nitro ghost (“Perfect boost: +0.42 s on the field”). Launch shake and wheelspin smoke, a wheelspin note for launch taps, brake lights, motion-blurred wheels at speed, a lane layout that clears the nitro button and fills tall phones, a coast scene, and a “you” marker that sits on your own roof.
- **Every screen easier.** One primary action per screen; car model names everywhere; grouped toasts that never block taps; focus returns to whatever opened a sheet; the results card explains rewards on the first race; small offline claims are silent and closing the sheet still claims; merging no longer makes the active car worse.
- **Typography and layout.** One bundled typeface (Barlow 400/600/800, ~68 KB woff2 with a metric-matched fallback), a rem type scale with tokens, tabular numerals, 16 px body and 13–14 px secondary text, 44 px targets, and pinch-zoom allowed again. The top bar falls back to glyphs and then a second row instead of clipping balances; landscape phones get a rotate prompt.
- **Car art.** Clearcoat reflections and a specular streak, wheel barrels with brake discs and calipers, deeper grilles, lamp lenses with glints, interiors through the glass, a primer fender and dents on the Tapeback, a planted, blunter Ironhorse front, and the Altamar GT’s long tail, covered lamps, chrome and centre-lock wire wheels, with its own reveal stage (a dusk-teal room and a light sweep along the body).

## Update 1.2 · cars, phone UI, loop

- **Vehicle art rebuilt.** Each car is an original profile built in metres from its wheelbase, ride height, overhangs, roofline and wheel arches, extruded along one oblique depth so it has real hood, roof, deck, fascia and windshield planes under one shared light, plus contact shadows, tyre thickness, far-side wheels and per-car construction:
  - **Tapeback 1.1** — short upright hatch, steel wheels, sagging mismatched bumpers, a replacement door, rust along the arches and sill seams, duct tape you can read on a phone, one yellowed headlight.
  - **Corsa Rojo** — four-door sedan with front and rear door breaks, a sun-faded roof, rectangular lamps with amber corners, rubber side moulding, period wheel covers.
  - **Vexa GTi** — lowered hot hatch, flared arches, tight glasshouse, roof spoiler, sport wheels with red calipers, big lower intake, red grille line, LED eyebrows and a split stripe that kicks up over the rear arch.
  - **Ironhorse 455** — long-hood coupe with a low fastback cabin, broad rear haunches, a sculpted hood scoop, quad round headlights in chrome bezels, deep-dish wheels, chrome bumpers, twin stripes over hood, roof and deck.
  The same geometry and finish are used in the Garage, Showroom, reveal and race; races draw cached body layers with live wheels, lights and nitro, and the camera now frames the whole pack. `art.html` (dev server only) shows every car at hero, card, race and thumbnail sizes.
- **Reveal.** Pull the cover (or tap) → dark silhouette → spotlight cue → headlights and the car's own engine voice (Tapeback misfires, Corsa hums, Vexa rasps with blips, Ironhorse lopes) → camera settles → hero hold with the model name and what it unlocks ("T3 parts now fit (was T2) · +11 km/h"). Skip and reduced-motion versions; **Replay reveal** from Showroom inspection.
- **Phone UI.** On short screens (320×568, 360×640) the whole board, overflow tray, scrap press and Race button fit without scrolling. Parts with a usable match get a teal ring. A full bench turns the Crates button into the recovery action (**Merge pair** / **Scrap T1**). The Race tab leads with one recommended event, its course type ("Drag launch · one bend — Turbo off the line") and a reason to run it; other events are compact rows with rivals and payouts behind a disclosure. The live nitro button shows a **▲ PERFECT WINDOW** label and dashed ring in a window. Results give specific next steps ("Build a T3 Turbo for the launch — you lost 0.4 s there"). Inspection shows earned and locked finishes, **Race this car** and **Replay reveal**. Returning players see where they left off.
- **Loop.** Live races are allowed while the crew runs a Quick Race (no more waiting). **Fresh route:** +75% Rep on an event that isn't one of your last two races, and the recommendation rotates accordingly; a first clear you keep losing is spaced out between other races. New class event **Tapeback Trophy** (Tapeback only, opens with the Corsa Rojo). Signature finishes for a live podium per car, the Foundry Invitational finale for the Ironhorse, Merge All after five finishes, a starter nitro charge for the first race (from 1.1) remain.

## Commands

```bash
npm ci                 # install exact dependencies from the lockfile
npm run dev            # dev server at http://localhost:5173/
npm run build          # typecheck + production build into dist/ (base /Rev-Up/)
npm run preview        # serve dist/ at http://localhost:4173/Rev-Up/
npm test               # unit + rules + simulated playthrough tests (Vitest)
npm run playthrough    # just the clean-save → Muscle simulation, with milestone times
npm run smoke          # production PWA smoke test at /nested/path/Rev-Up/ (headless Chromium)
npm run perf           # emulated load + frame pacing on the production build (run after build)
npm run check:input    # keyboard, two-tab, toggles, layout checks (needs `npm run dev` running)
npm run publish:pages  # build and push dist/ to the gh-pages branch
```

`smoke`, `perf`, `check:input` and `icons` use the Playwright + Chromium that is pre-installed in the build environment (not a project dependency). Set `REVUP_BASE=/` to build for a root site.

## Controls

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Merge / move a part | Drag onto a matching part or an empty slot | Drag | Arrows to focus, Enter to pick up, Enter on the target |
| Tap mode | Tap a part, then tap the target | Click, click | — |
| Scrap | Drag onto **Scrap**, or select then tap Scrap | Same | `x` / Delete on the focused part |
| Race the recommended event | **Race** button (bottom right) | Click | `r` in the Garage |
| Nitro | Big **Nitro** button (bottom right) | Click | Space / `n` / ↑ |
| Pause | Pause button, or leave the app | — | Esc / `p` |

Invalid drops return the part to where it was. The page never scrolls while dragging (`touch-action: none` on the board).

## How it plays

- **Garage.** A 5×6 board (6×7 with the *Bigger bench* upgrade) and a 4-slot overflow tray. Two parts of the same family and tier merge into the next tier in the destination slot; the new part then cascades with orthogonal matches (up, right, down, left). Three families through T5: **Engines** → top speed, **Tires** → grip (launch traction and bends), **Turbos** → acceleration (strongest off the launch).
- **Quality.** One roll per fusion: 2% **Mint** (skips a tier when room exists; at the ceiling it stays at the ceiling and keeps the Mint tag), 10% **Polished** (+15% stat), 88% standard. Quality never blocks a match.
- **Combo → nitro.** Each fusion refreshes a 2 s combo timer; every 3rd fusion in a combo banks a nitro charge (cap 3).
- **Crates.** A free printer makes a crate every 20 s while the game is open (pauses at 10 waiting). Crates open themselves when there is room (board first, then tray) and wait unopened when both are full. The **Scrap** press works on board and tray parts; 10 scrap buys a random crate and 15 buys a crate of a family you pick. Parts can also be ordered for $70. Scrap values are set so recycling crates always loses scrap.
- **Equip.** The active car auto-equips the strongest part per family up to its equip cap. Stronger parts above the cap stay on the bench and are flagged. Scrapping an equipped part asks first and names what equips next.
- **Racing.** Three rivals, a fixed-timestep (60 Hz) simulation on segmented tracks (launch, straights or highway, a bend). Amber **nitro windows** on the two straights are telegraphed on the road, on the progress bar and with an optional beep; a tap inside a window is a **Perfect** (1.5× effect), outside it still boosts. Every finish pays cash, Rep and crates scaled by place, with the real time gap and one next step. Rewards are committed at the finish line, so closing the page cannot lose or double them.
- **Quick Race.** After a live win, an ordinary event can be raced by your crew in the background: same simulation without nitro, the placement's base payout, finished after the race's real duration while you keep merging. First-win bonuses, precision bonuses and rival rewards need a live race.
- **Cars.** Junker (start, cap T2) → Beater (70 Rep + crafted T3 Tires, cap T3) → Hot hatch (600 Rep + crafted T4 Turbo, cap T4) → Muscle (1,850 Rep + crafted T5 Engine, cap T5) → Grand tourer (5,600 Rep + crafted T6 Engine + a Coastal Crown win, cap T6). Keystones are recorded in a permanent ledger the moment you craft them (including tiers jumped by a Mint); crate drops never count. The next car sits under a cover above the board with the exact remaining goal.
- **Rusty Ray.** The Scrapyard rival (needs the Beater). First win: the Ray's Rust-Red paint blueprint, the "Scrapyard King" badge, $200, 4 crates, and the Suburbs open.
- **Reveal.** Ownership is saved before the unveil. Drag the cover off (or tap), then a headlight sweep, a camera move and a per-car rev. Skip is always available; an interrupted reveal resumes on next launch.
- **Catch-up.** After ~150 s of active play (and race finishes) without progress on the current keystone, one free crate of that family arrives (once per car). Idle time and reloads earn nothing toward it.
- **Merge All** unlocks after five race finishes or 10 active minutes. It resolves every pair deterministically with normal rules in one transaction, counts toward keystones, and banks at most one nitro (if its longest chain is ≥ 3).
- **Offline cash.** While away, owned cars earn $1–4/min each, as one claim covering up to 8 hours. The board is left alone.

## Code map

```
src/data/tables.ts     all tuning: tiers, odds, cars, tracks, rivals, events, payouts, upgrades, thresholds
src/core/              rules, independent of the DOM (unit-tested)
  board.ts             fusion, cascade, quality, combo/nitro, Merge All, placement, crates, scrap
  loadout.ts           auto-equip, stats, scrap impact
  race.ts              fixed-timestep race simulation, nitro windows, standings, advice
  progression.ts       goals, unlocks, keystone ledger use, catch-up, payouts, quick race, offline, upgrades
  state.ts / save.ts   versioned save schema, validation/migration, checksum, tab-conflict guard, export/import
  game.ts              transactional wrapper: draft → validate → persist → emit events
src/ui/                Garage, Race, Showroom, reveal, settings (DOM + Canvas)
src/render/            original car silhouettes (Canvas) and part illustrations (SVG)
src/sw/sw-template.js  service worker template; vite.config.ts fills in the version and asset list
src/dev.ts             dev-only late-state presets (stripped from production builds)
tests/                 rules, race, progression/save tests and the playthrough bot
scripts/               icons, static server, smoke, perf, input checks, gh-pages publish
```

**Dev shortcuts** (only in `npm run dev`, never in production): `?dev=beater-ready | ray | muscle-ready | late | full | cascade | offline | reveal` loads a late or edge-case state, and `&seed=123` fixes the RNG.

## Tuning knobs

All in `src/data/tables.ts`:

| Knob | Current | Effect |
| --- | --- | --- |
| `CARS[].unlock.rep` | 45 / 450 / 1450 | Rep per car (main pacing lever) |
| `CARS[].unlock.family/tier` | T3 Tires / T4 Turbo / T5 Engine | Keystones |
| `QUALITY_ODDS`, `QUALITY_BONUS` | 2% / 10%, +15% | Mint / Polished |
| `COMBO_WINDOW_MS`, `COMBO_NITRO_EVERY`, `NITRO_CAP` | 2000, 3, 3 | Combo → nitro |
| `PRINTER_INTERVAL_S`, `CRATE_TIER_ODDS`, `UPGRADES` | 20/16/13/10 s … | Printer speed, crate tiers, upgrade prices |
| `SCRAP_VALUE`, `CRATE_SCRAP_COST`, `TARGETED_CRATE_*` | 1,3,7,15,32 · 10 · 15 / $70 | Scrap economy |
| `EVENTS[].payout`, `firstClear`, `boss.reward` | per event | Race economy |
| `RACE.*`, `STAT_SCALE` | see file | Physics, nitro strength, perfect multiplier, rival variance |
| `RIVALS[].stats` | per rival | Difficulty |
| `CATCHUP_EFFORT_THRESHOLD`, `RACE_EFFORT` | 150, 15 | Catch-up crate |
| `MERGE_ALL_UNLOCK_RACES` / `MERGE_ALL_UNLOCK_ACTIVE_S` | 5 / 600 | Merge All unlock |
| `FRESH_ROUTE_BONUS` / `FRESH_ROUTE_AFTER_RACES` | 0.75 / 3 | Rep bonus for varying events |
| `TRACKS[].course` / `favours` | per track | Course type shown on the Race tab |
| `OFFLINE_MAX_S`, `CARS[].offlineRate` | 8 h, $1–4/min | Offline claim |

The data model already carries Transmission and Aero, T6–T10, all ten classes and the later districts (disabled). The full campaign's hypercar is gated by Rep, a crafted T10 keystone and a Summit Gala rival win — not by a Mint roll.

## Saves

- Stored in `localStorage` under `revup:<base path>:save` (so other Pages projects on the same origin never collide), versioned (`v: 1`), checksummed, validated on load, and migrated forward. A corrupted or malformed save is copied to a backup key and the game starts fresh with a notice; saves from a newer build are refused rather than damaged.
- Every successful action saves once. Race payouts, quick races and reveals are guarded by single-use ids, so rapid taps and reloads cannot repeat them. A race in progress at reload is abandoned with no charges spent.
- Two tabs: a new tab asks before taking over, the old tab freezes, and writes from a stale tab are refused (revision check).
- Offline time is clamped for clock rollback, capped at 8 hours, and stored together with its timestamp so repeated reloads never multiply a claim.
- **Settings → Move your save** exports a text code (or a file) and imports it, for moving between Safari and the Home Screen app.

## Installing on a phone

- **iPhone (Safari):** open the site → Share → **Add to Home Screen** → turn on **Open as Web App** when offered → **Add**. Launch from the Home Screen icon.
- **Android (Chrome):** use the install prompt (Settings → Install app) or browser menu ⋮ → **Install app** / **Add to Home screen**.
- After the first online load, Settings shows "Offline play is ready" and the whole game works with no connection. Updates are downloaded in the background and offered as "An update is ready — Reload" only on the Garage/Race/Showroom screens, after saving.

## Publishing

Source lives on the development branch; the compiled site is published to a dedicated **`gh-pages`** branch with the build at its root (including `.nojekyll`).

1. `npm run publish:pages` — builds with base `/Rev-Up/`, commits `dist/` onto `gh-pages` (keeping its history), and pushes with your own git credentials. (A push made with the default Actions `GITHUB_TOKEN` would not trigger a Pages build.)
2. One-time repository setting: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `(root)` → Save.**
3. After Pages is configured and deploys successfully, the site is served at `https://georrrgess-jpg.github.io/Rev-Up/` over HTTPS. The manifest `id`, `start_url` and `scope`, the icons and the service worker are all under `/Rev-Up/`, and navigation uses hash routes (`#garage`, `#race`, `#showroom`), so refreshing any view works on static hosting.

## Verification results

Environment: Linux cloud container, Node 22, headless Chromium (Playwright), production build. **No physical phone was available**; every device number below is emulation.

### 1.3 · Open Road

**Automated tests** (`npm test`): 70 passing. New in 1.3: the teach-through-play steps (fresh save walk-through, out-of-order play, resume after closing mid-step, Skip, a returning save opening at its progress with no beginner prompts, the equip-cap tip), the Open Road rules (event-gated unlock, class-meet car switch, medals paying once per medal, trophies awarded once, parts above the cap running at the cap tier, crew nitro), and a chapter playthrough.

**Clean save → Muscle** (`npm run playthrough`, simulation, ordinary luck, 5 seeds): Corsa Rojo 2:21–2:36, Vexa GTi 9:39–10:35, Ironhorse 19:21–21:50; longest run of one race 3; 0 s stuck on ingredients; 0 s waiting.

**Clean save → Altamar GT** (`tests/chapter.test.ts`, simulation, perfect-timing and mixed-timing players, 2 seeds each): **39.3–41.2 min**, 122–129 races, longest run of one race 3, T6 Engine crafted at 6.8–11.4 min. Honest note: Rep for the GT comes from rotating through the coastal rounds, so Harbor Launch and Cliffside Esses are each run 14–16 times and the Maple Mile 27 times across the full 40 minutes (never more than 3 in a row); the Coastal Crown itself takes 1–2 attempts.

**Race checks** (same seed, same car): a T5 Ironhorse wins the coastal rounds 8–10 times in 10 with a Perfect boost and 0–3 times in 10 with an ordinary tap, so both the build and the timing matter. Played and checked in the browser: countdown (no position shown until GO), pause and resume, backgrounding (pauses, shows Resume on return), closing mid-race (no payout, nothing stuck), last place on the coast, a close finish (“WIN! 0.1 s ahead” with the crossing on screen), a rival win, and Race again.

**Layout** (`layout.cjs` in this session: 320×568, 360×640, 390×844, 430×932, 844×390, 667×375, 1280×800; normal and 125 % text; fresh and late-game saves; Garage, Race, Showroom, How to play, Settings): no sideways scroll, no clipped text, no overlapping controls on the top layer, no target under 40 px. Fixed on the way: top-bar balances clipping at 360–390 px with large numbers and with enlarged text (now glyphs, then a two-row bar), the bench not refitting when the bar grows, a 36 px coach button, 30 px settings toggles and a 34 px scrap press. `npm run check:input`: 24/24.

**Production smoke test**: 22/22 at `/Rev-Up/`, upgrading **from the build currently on `gh-pages`** (1.2) to this one: same save key and Home Screen identity, scoped service worker, offline relaunch with a merge and a full race, staged update offered on a safe screen, old cache removed, one navigation, save intact.

**Performance** (`npm run perf`, emulated 390×844 @3×, 4× CPU slowdown, software rendering; runs vary by ±3 fps):

| Measure | 1.2 | 1.3 |
| --- | --- | --- |
| Dragging on a full board | 59–60 fps, p95 16.7 ms | 59–60 fps, p95 16.7 ms |
| Live race | 54–57 fps, p95 33 ms | 49–54 fps, p95 33 ms |
| Reveal | 53 fps, p95 33 ms | 56 fps, p95 33 ms |

The race costs about 7 % more than 1.2 for the new effects (pack camera, overtakes, motion-blurred wheels, Perfect presentation). Profiling found and fixed three real costs on the way (the nitro button rebuilding every frame, car sprites re-rendered as the camera zoomed, and the effects-quality setting bouncing between resolutions); if a phone stays slow for two seconds, effects drop for the rest of the race.

### 1.2

**Automated tests** (`npm test`): 62 passing — the 1.1 rules, race and save suites plus: a 1.0 save loaded from storage that now qualifies for two cars (each owned once, revealed in order, survives closing mid-reveal), an earned finish persisting across reload into the next race, the Tapeback Trophy gate and balance (T2 Tapeback with good nitro wins ≥7/10 seeds, T1 without nitro 0/10), the Fresh-route bonus paying once and not on an immediate repeat, and live racing while the crew runs a Quick Race.

**Clean save → Muscle** (`npm run playthrough`, **simulation**: scripted player through the real game API, 1.3 s per drag, race time + 7 s menus per live race, baseline luck — every roll Standard, zero Mint/Polished — 5 seeds):

| Measure | Target | Before (1.1) | After (1.2) |
| --- | --- | --- | --- |
| First merge | ≤ 5 s | 2 s | 2 s |
| First race launched | ≤ 30 s | 7–10 s | 7–10 s |
| First race finished | — | 34–38 s | 34–38 s |
| Beater | 2–4 min | 2:21–3:37 | 2:20–4:04 |
| Hot hatch | 10–14 min | 11:23–12:37 | 10:40–13:45 |
| Muscle | 20–25 min | 20:47–22:38 | 19:36–22:47 |
| Longest run of the same race in a row | — | 19–22 | 3–4 |
| Time waiting with nothing to do | — | 5:23–7:58 | 0 s |
| Races to Muscle (of which Quick) | — | 44–48 (22–30) | 54–59 (17–20) |
| Merges to Muscle | — | 149–163 | 132–142 |
| Time stuck on ingredients (Rep met, keystone missing) | — | 0 s | 0 s |

Keystones (T3 Tires, T4 Turbo, T5 Engine) are crafted well before their Rep in every seed, so the main route never stalls on a rare drop; Rep is the pacing lever and the Fresh-route rotation spreads it over all five events.

**Race checks** (seed 11, Tapeback with T2 parts, Crusher Run, same setup): no nitro 20.02 s (3rd, 0.3 s behind first), mistimed nitro 19.78 s (2nd, 0.1 s behind), perfect nitro 19.24 s (1st, 0.5 s ahead).

**Production smoke test** (`npm run smoke`): 22/22 at `/nested/path/Rev-Up/` (manifest, icons, scoped service worker, offline relaunch with a merge and a full race, staged update with one navigation and the save intact). Also 22/22 at the real `/Rev-Up/` path upgrading **from the currently deployed 1.1 build on `gh-pages`** to this build (`SMOKE_PREFIX=/Rev-Up/ SMOKE_V1_DIR=<gh-pages export> npm run smoke`): same save key and Home Screen identity, old cache removed, no reload loop, save unchanged.

**Interaction checks** (`npm run check:input`): 24/24 — keyboard merge and scrap (with the equipped-part warning), non-matching taps never mutate the board, reduced motion, no page scroll, two-tab handover, oversized balances at 320 px, and board + overflow + scrap + Race + nav fully on screen at 320×568, 360×640, 390×844, 430×932 and 1280×800 with an empty, a full 5×6 and a full 6×7 bench (smallest cell 36 px on a full 6×7 bench at 320×568).

**Performance** (`npm run perf`, emulated: 390×844 @3×, canvas DPR capped at 2, 1.6 Mbps / 150 ms RTT, 4× CPU slowdown, software rendering, no GPU):

| Measure | Before (1.1) | After (1.2) |
| --- | --- | --- |
| Usable garage, cold load | 1.55 s, 137 KB | 1.63 s, 168 KB |
| Dragging on a full board | 59 fps, p95 16.7 ms | 59–60 fps, p95 16.7 ms |
| Live race | 54 fps, p95 33 ms | 55–57 fps, p95 33 ms |
| Reveal | 51 fps, p95 33 ms | 53 fps, p95 33 ms |

## Known limitations

- At 320×568 with 125 % text and very large balances, the bench reaches its 36 px minimum and the Garage body scrolls a little to reach the overflow tray.
- The coach callout sits over part of the bench while it points at the pair to merge.

- Not yet tested on a physical iPhone or Android device (Home Screen standalone launch, safe areas, pause/resume and save persistence after relaunch should be confirmed on hardware).
- Quick Race and the Race button always race the active car; switch cars in the Showroom.
- On a full 6×7 bench at 320×568 part cells shrink to 36 px (below the 44 px target for primary controls); the Race and recovery buttons stay at 44 px+.
- Emulated frame times come from software rendering; real phone GPUs should do better, but this is unmeasured.
- One model per class and six tracks in this release; Downtown, Transmission/Aero and T7–T10 exist in data only.
